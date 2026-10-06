/**
 * 港股通 + A-H 溢价分析页（真实源版）
 * - A-H 溢价：后端 /api/hk-connect/ah-premium 实时计算（A/H 真实行情派生，东方财富免 key）
 * - 今日沪深港通：后端 /api/hk-connect/summary 实时额度/净买（东方财富 kamt）
 * - 北向重仓股 / 资金风格 / 北向信号：暂无真实数据源 → 诚实标注「暂未接入」，绝不伪造演示数据
 *
 * ── 诚实 null 适配（P0-HKFE）────────────────────────────────────
 * 后端 commit ddce727c5 起，港股通端点不再「用 0 冒充拿不到的数据」：
 *   - 北向（沪股通+深股通）买入/卖出拆分口径已被交易所停止披露 →
 *     `dayNetIn` / `buyIn` / `sellOut` 一律为 **null**，且 `netFlowDisclosed: false`。
 *   - 额度余额 `remain` 南北向**均**不可得 → 恒为 **null**。
 * 本页的硬性纪律：
 *   1. null 是「不可用」，**绝不**当0 渲染、也绝不让它参与算术。
 *      JS 陷阱：`null * 2 === 0`、`null / 1040 === 0`、`null > 0 === false`。
 *      若额度使用率写成 `(1 - remain/threshold)*100`，remain=null 会得到 **100%**
 *      （不是 NaN，但同样是假的「额度用满」）；一旦threshold 也null 则是 NaN。
 *   2. 判断「该口径是否披露」优先用后端给的 `netFlowDisclosed` 布尔，
 *      比解析 null 更明确；`upstreamStatus` **不可**用于判断可得性
 *      （实测 status=4 时南向仍有真实值）。
 *   3. 纯函数 `resolveNetFlow` / `resolveQuotaUsage` 导出供单测断言，
 *      保证「null 不被渲染成 0 或 NaN」有回归保护。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Progress } from 'antd';
import { LoadingStateDetail, EmptyState } from '../components/Common/StateComponents';
import {
  ArrowUpOutlined, ArrowDownOutlined, RiseOutlined,
} from '@ant-design/icons';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { THEME, GOLD } from '../styles/theme-constants';
import { API_ORIGIN } from '../config/apiBase';

const { Title, Text } = Typography;

/**
 * 后端根地址（不含 /api），调用处自带 /api 前缀。
 * 为什么用 API_ORIGIN 而不是自己读 import.meta.env.VITE_API_BASE：
 * 后端地址的单一真源在 config/apiBase.ts（dev 下返回空串 → 相对路径 → 走 Vite proxy）。
 */
const API_BASE = API_ORIGIN;

interface AhPremiumRow {
  codeA: string;
  codeH: string;
  name: string;
  priceA: number; // A 股实时价(RMB)
  priceH: number; // H 股实时价(HKD)
  exchangeRate: number; // HKD→CNY
  industry: string;
  premium: number; // AH 溢价率 %
}

/**
 * 单腿沪深港通数据。**每个可能拿不到的字段都是 `number | null`**
 * —— 类型层面就杜绝「顺手写成 number 然后拿它做算术」。
 */
export interface ConnectLeg {
  /** 当日净买额（亿元）——北向已停止披露，恒 null */
  dayNetIn: number | null;
  /** 当日买入额（亿元）——北向已停止披露，恒 null */
  buyIn: number | null;
  /** 当日卖出额（亿元）——北向已停止披露，恒 null */
  sellOut: number | null;
  /** 当日成交额（亿元）——南北向均真实可得 */
  dealAmount: number | null;
  /** 当日额度余额（亿元）——南北向均不可得，恒 null */
  remain: number | null;
  /** 每日额度（亿元）—— 真实常量 */
  threshold: number | null;
  /** 该腿资金流（买入/卖出/净买）口径是否仍在披露 */
  netFlowDisclosed: boolean;
  /** 上游快照状态，仅留档；**不可**用于判断可得性 */
  upstreamStatus: number | null;
  date: string;
}

export interface ConnectSummary {
  date: string;
  northbound: ConnectLeg;
  southbound: ConnectLeg;
}

/** 后端响应信封：除data 外还带披露说明，页面上要如实呈现而不是躺着 */
export interface ConnectSummaryEnvelope {
  data?: ConnectSummary | null;
  dataSource?: string;
  message?: string;
  netFlowDisclosure?: {
    northboundDisclosed?: boolean;
    southboundDisclosed?: boolean;
    note?: string;
  };
  quotaDisclosure?: {
    remainAvailable?: boolean;
    note?: string;
  };
  legMapping?: {
    northbound?: string;
    southbound?: string;
    note?: string;
  };
}

/**
 * 「不可得」的两类原因，必须区分：
 * - `undisclosed`：上游明确停止披露该口径（用后端的 netFlowDisclosed 判定）
 * - `unavailable`：本次快照没拿到这个数（可能是临时故障，值得重试）
 */
export type UnavailableReason = { kind: 'undisclosed'; reason: string } | { kind: 'unavailable'; reason: string };

/** 净买额：要么是真实数值，要么带原因地缺席——没有第三种（尤其没有 0） */
export type NetFlowMetric = { kind: 'value'; value: number } | UnavailableReason;

/** 额度使用率：要么可算并渲染进度条，要么明确说明为何不可算 */
export type QuotaMetric =
  | { kind: 'meter'; percent: number }
  | { kind: 'no-balance'; reason: string; threshold: number | null };

/** 真实有限数（排除 null / undefined / NaN / ±Infinity） */
const isReal = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 解析单腿净买额。
 * - `netFlowDisclosed === false` → 直接判「已停止披露」，不猜、不倒算、不显示 0.00
 * - `dayNetIn` 非有限值 → 「本次未取得」
 */
export function resolveNetFlow(leg: ConnectLeg | null | undefined): NetFlowMetric {
  if (!leg) return { kind: 'unavailable', reason: '后端未返回该腿数据' };
  if (leg.netFlowDisclosed === false) {
    return {
      kind: 'undisclosed',
      reason: '上游已停止披露该口径（买入/卖出拆分停披露），非真实为 0',
    };
  }
  if (!isReal(leg.dayNetIn)) {
    return { kind: 'unavailable', reason: '本次上游快照未提供净买额' };
  }
  return { kind: 'value', value: leg.dayNetIn };
}

/**
 * 解析额度使用率。
 * **`remain === null` 时绝不返回 0 或 100** —— 那两个都是关于「额度用没用」的断言，
 * 而后端已明确判定该数据不可得。
 */
export function resolveQuotaUsage(leg: ConnectLeg | null | undefined): QuotaMetric {
  const threshold = leg && isReal(leg.threshold) ? leg.threshold : null;
  if (!leg) {
    return { kind: 'no-balance', reason: '后端未返回该腿数据，无额度信息', threshold };
  }
  if (!isReal(leg.remain)) {
    return {
      kind: 'no-balance',
      reason: '额度余额数据不可得（上游未披露该口径，后端不以 0 顶替）',
      threshold,
    };
  }
  if (threshold === null || threshold <= 0) {
    return { kind: 'no-balance', reason: '每日额度总额缺失或非正，无法计算使用率', threshold };
  }
  const percent = ((threshold - leg.remain) / threshold) * 100;
  if (!Number.isFinite(percent)) {
    return { kind: 'no-balance', reason: '额度使用率计算结果非有限值，已拒绝渲染', threshold };
  }
  return { kind: 'meter', percent: Math.min(100, Math.max(0, percent)) };
}

/** 涨/流入=红，跌/流出=绿（中国习惯）。只接受已确认为真实有限数的值。 */
const flowColor = (v: number): string => (v >= 0 ? THEME.up : THEME.down);
const signArrow = (v: number) => (v >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />);

/** A-H 溢价信号：溢价>30 偏贵看H；<0 看A更便宜；其余中性 */
const ahSignal = (premium: number) => {
  if (premium > 30) return { label: 'A溢价偏高', color: THEME.up };
  if (premium < 0) return { label: 'H更便宜', color: THEME.down };
  return { label: '中性', color: THEME.textSec };
};

/** 数据源标签 */
const DataSourceTag: React.FC<{ source?: string; loading?: boolean }> = ({ source, loading }) => {
  if (loading) return <Tag color="default" style={{ color: THEME.textSec }}>加载中…</Tag>;
  if (source === 'real') return <Tag color="blue">真实源 · 东方财富</Tag>;
  if (source === 'unavailable') return <Tag color="default" style={{ color: THEME.textSec }}>真实源暂不可用</Tag>;
  return <Tag color="default" style={{ color: THEME.textSec }}>—</Tag>;
};

/**
 * 净买额指标：真实数值用 Statistic；不可得则渲染「— + 原因」，
 * 绝不用 0 顶替（页面标题里的单位是「亿」，0.00 亿 会被读成「今天资金没动」）。
 */
const NetFlowMetricView: React.FC<{ metric: NetFlowMetric; title: string; fontSize?: number }> = ({
  metric,
  title,
  fontSize = 20,
}) => {
  if (metric.kind === 'value') {
    return (
      <Statistic
        title={<span style={{ color: THEME.textSec }}>{title}</span>}
        value={metric.value}
        precision={2}
        valueStyle={{ color: flowColor(metric.value), fontSize }}
      />
    );
  }
  return (
    <div>
      <div style={{ color: THEME.textSec, fontSize: 12, marginBottom: 2 }}>{title}</div>
      <div style={{ color: THEME.textSec, fontSize, lineHeight: '28px' }}>—</div>
      <Text style={{ color: THEME.textSec, fontSize: 12 }}>{metric.reason}</Text>
    </div>
  );
};

/** 额度使用率：可算才渲染 Progress；不可算则给原因+ 仍然真实的每日总额度 */
const QuotaUsageView: React.FC<{ metric: QuotaMetric; stroke: string }> = ({ metric, stroke }) => {
  if (metric.kind === 'meter') {
    return (
      <Progress
        percent={+metric.percent.toFixed(1)}
        showInfo
        strokeColor={stroke}
        trailColor={THEME.border}
        format={(p) => `额度使用 ${p?.toFixed(1)}%`}
      />
    );
  }
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
        borderRadius: 6,
      }}
    >
      <div style={{ color: THEME.text, fontSize: 13 }}>额度使用率：数据不可得</div>
      <Text style={{ color: THEME.textSec, fontSize: 12 }}>{metric.reason}</Text>
      {metric.threshold !== null && (
        <div style={{ color: THEME.textSec, fontSize: 12, marginTop: 4 }}>
          每日总额度 {metric.threshold.toFixed(0)} 亿（真实常量，可得）
        </div>
      )}
    </div>
  );
};

/** 成交额等「南北向均真实可得」的字段：null 也要说清楚，不留空白 */
const DealAmountLine: React.FC<{ leg: ConnectLeg }> = ({ leg }) => (
  <div style={{ marginTop: 6 }}>
    {isReal(leg.dealAmount) ? (
      <Text style={{ color: THEME.textSec, fontSize: 12 }}>
        当日成交额 {leg.dealAmount.toFixed(2)} 亿
      </Text>
    ) : (
      <Text style={{ color: THEME.textSec, fontSize: 12 }}>当日成交额：本次未取得</Text>
    )}
    {leg.netFlowDisclosed && isReal(leg.buyIn) && isReal(leg.sellOut) && (
      <Text style={{ color: THEME.textSec, fontSize: 12, marginLeft: 12 }}>
        买入 {leg.buyIn!.toFixed(2)} 亿 / 卖出 {leg.sellOut!.toFixed(2)} 亿
      </Text>
    )}
  </div>
);

const HKConnectPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [ahRows, setAhRows] = useState<AhPremiumRow[]>([]);
  const [ahSource, setAhSource] = useState<string>('');
  const [ahRate, setAhRate] = useState<number>(0.92);
  const [summary, setSummary] = useState<ConnectSummary | null>(null);
  const [summarySource, setSummarySource] = useState<string>('');
  const [summaryNote, setSummaryNote] = useState<ConnectSummaryEnvelope | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${API_BASE}/api/hk-connect/ah-premium`).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/hk-connect/summary`).then((r) => r.json()).catch(() => null),
    ]).then(([ah, sum]) => {
      if (!alive) return;
      if (ah?.data) {
        setAhRows(ah.data.data ?? []);
        setAhSource(ah.data.dataSource ?? '');
        if (ah.data.exchangeRate) setAhRate(ah.data.exchangeRate);
      }
      if (sum?.data) {
        setSummary(sum.data.data ?? null);
        setSummarySource(sum.data.dataSource ?? '');
        setSummaryNote(sum.data as ConnectSummaryEnvelope);
      }
      setLoading(false);
    }).catch(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // ── ① 概览卡 ──
  // 无真实行时**不返回 0** —— 0 会被读成「A-H 溢价真的是0%」，那是编造。
  // avg/max 为 null 时概览卡显示「暂不可得」，与净买额/额度余额同一套诚实语义。
  const ahStats = useMemo<{ avg: number | null; max: number | null; min: number | null; maxName: string; minName: string }>(() => {
    if (ahRows.length === 0) return { avg: null, max: null, min: null, maxName: '-', minName: '-' };
    const premiums = ahRows.map((a) => a.premium);
    const avg = premiums.reduce((s, v) => s + v, 0) / premiums.length;
    const maxRow = ahRows[0]; // 已按溢价降序
    const minRow = ahRows[ahRows.length - 1];
    return {
      avg: +avg.toFixed(2),
      max: maxRow.premium,
      min: minRow.premium,
      maxName: maxRow.name,
      minName: minRow.name,
    };
  }, [ahRows]);

  //概览卡与明细卡共用同一套解析结果，绝不在两处各写一遍判断
  const northNetMetric = useMemo(() => resolveNetFlow(summary?.northbound), [summary]);
  const southNetMetric = useMemo(() => resolveNetFlow(summary?.southbound), [summary]);
  const northQuota = useMemo(() => resolveQuotaUsage(summary?.northbound), [summary]);
  const southQuota = useMemo(() => resolveQuotaUsage(summary?.southbound), [summary]);

  // ── ④ A-H 溢价 ──
  const ahBarData = useMemo(
    () => ahRows.map((a) => ({ name: a.name, premium: a.premium })),
    [ahRows],
  );

  const ahColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 110,
      render: (v: string) => <Text strong>{v}</Text> },
    { title: 'A代码', dataIndex: 'codeA', key: 'codeA', width: 90 },
    { title: 'H代码', dataIndex: 'codeH', key: 'codeH', width: 90 },
    { title: '行业', dataIndex: 'industry', key: 'industry', width: 100,
      render: (v: string) => <Tag color="default" style={{ color: THEME.textSec }}>{v}</Tag> },
    { title: 'A价(RMB)', dataIndex: 'priceA', key: 'priceA', width: 100,
      sorter: (a: AhPremiumRow, b: AhPremiumRow) => a.priceA - b.priceA,
      render: (v: number) => v.toFixed(2) },
    { title: 'H价(HKD)', dataIndex: 'priceH', key: 'priceH', width: 100,
      sorter: (a: AhPremiumRow, b: AhPremiumRow) => a.priceH - b.priceH,
      render: (v: number) => v.toFixed(2) },
    { title: '溢价率(%)', dataIndex: 'premium', key: 'premium', width: 110,
      defaultSortOrder: 'descend' as const,
      sorter: (a: AhPremiumRow, b: AhPremiumRow) => a.premium - b.premium,
      render: (v: number) => (
        <Text style={{ color: flowColor(v) }}>{signArrow(v)} {v >= 0 ? '+' : ''}{v.toFixed(2)}%</Text>
      ) },
    { title: '信号', dataIndex: 'premium', key: 'ahsignal', width: 100,
      render: (v: number) => {
        const meta = ahSignal(v);
        return <Tag color="default" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</Tag>;
      } },
  ];

  const hasSummary = summarySource === 'real' && !!summary;

  return (
    <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
      <Title level={3} style={{ color: THEME.text, marginBottom: 4 }}>
        港股通资金 · A-H 溢价分析
      </Title>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Text style={{ color: THEME.textSec }}>
          沪深港通实时额度 · A+H 两地溢价 · 数据由后端实时接口提供
        </Text>
        <DataSourceTag source={ahSource || summarySource} loading={loading} />
      </div>

      {/* ① 概览卡 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            {loading || ahStats.avg === null ? (
              <Statistic
                title={<span style={{ color: THEME.textSec }}>A-H 溢价均值(%)</span>}
                value={loading ? '-' : '暂不可得'}
              />
            ) : (
              <Statistic
                title={<span style={{ color: THEME.textSec }}>A-H 溢价均值(%)</span>}
                value={ahStats.avg}
                precision={2}
                valueStyle={{ color: flowColor(ahStats.avg) }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            {loading || ahStats.max === null ? (
              <Statistic
                title={<span style={{ color: THEME.textSec }}>最高溢价 · {ahStats.maxName}</span>}
                value={loading ? '-' : '暂不可得'}
              />
            ) : (
              <Statistic
                title={<span style={{ color: THEME.textSec }}>最高溢价 · {ahStats.maxName}</span>}
                value={ahStats.max}
                precision={2}
                valueStyle={{ color: THEME.up }}
                prefix={<RiseOutlined />}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            {loading ? (
              <Statistic
                title={<span style={{ color: THEME.textSec }}>今日北向净买(亿)</span>}
                value="-"
              />
            ) : (
              <NetFlowMetricView metric={northNetMetric} title="今日北向净买(亿)" />
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            {loading ? (
              <Statistic
                title={<span style={{ color: THEME.textSec }}>今日南向净买(亿)</span>}
                value="-"
              />
            ) : (
              <NetFlowMetricView metric={southNetMetric} title="今日南向净买(亿)" />
            )}
          </Card>
        </Col>
      </Row>

      {/* ② 今日沪深港通（真实额度/净买） */}
      <Card
        title={<span style={{ color: THEME.text }}>今日沪深港通（东方财富实时额度）</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        {hasSummary && summary ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Text style={{ color: THEME.text, fontSize: 13 }}>北向（沪股通 + 深股通）</Text>
              <div style={{ marginTop: 8 }}>
                <NetFlowMetricView metric={northNetMetric} title="当日净买(亿)" />
                <DealAmountLine leg={summary.northbound} />
                <QuotaUsageView metric={northQuota} stroke={THEME.up} />
              </div>
            </Col>
            <Col xs={24} md={12}>
              <Text style={{ color: THEME.text, fontSize: 13 }}>南向（港股通沪 + 港股通深）</Text>
              <div style={{ marginTop: 8 }}>
                <NetFlowMetricView metric={southNetMetric} title="当日净买(亿)" />
                <DealAmountLine leg={summary.southbound} />
                <QuotaUsageView metric={southQuota} stroke={GOLD} />
              </div>
            </Col>
          </Row>
        ) : (
          loading ? <LoadingStateDetail /> : <EmptyState title="今日沪深港通实时额度暂不可用" description={summaryNote?.message ?? '真实源未返回数据'} />
        )}

        {/* 后端直出的口径说明：别让message / netFlowDisclosure / quotaDisclosure / legMapping 只躺在响应里 */}
        {summaryNote?.message && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 10px',
              background: THEME.surface,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: THEME.textSec, fontSize: 12, display: 'block' }}>
              口径说明（后端直出）：{summaryNote.message}
            </Text>
            {summaryNote.legMapping && (
              <Text style={{ color: THEME.textSec, fontSize: 12, display: 'block', marginTop: 4 }}>
                方向映射：北向 = {summaryNote.legMapping.northbound}；南向 = {summaryNote.legMapping.southbound}。
                {summaryNote.legMapping.note}
              </Text>
            )}
            {summaryNote.netFlowDisclosure && (
              <Text style={{ color: THEME.textSec, fontSize: 12, display: 'block', marginTop: 4 }}>
                披露状态：北向净买额{summaryNote.netFlowDisclosure.northboundDisclosed ? '仍在披露' : '已停止披露'}
                ，南向净买额{summaryNote.netFlowDisclosure.southboundDisclosed ? '仍在披露' : '已停止披露'}。
                {summaryNote.netFlowDisclosure.note}
              </Text>
            )}
            {summaryNote.quotaDisclosure && (
              <Text style={{ color: THEME.textSec, fontSize: 12, display: 'block', marginTop: 4 }}>
                额度余额{summaryNote.quotaDisclosure.remainAvailable ? '可得' : '不可得'}
                {summaryNote.quotaDisclosure.remainAvailable ? '。' : `：${summaryNote.quotaDisclosure.note ?? ''}`}
              </Text>
            )}
          </div>
        )}

        <Text style={{ color: THEME.textSec, fontSize: 12 }}>
          红=净流入 / 绿=净流出（中国习惯）；额度使用率 = (总额度 − 余额) / 总额度，仅在余额可得时才计算。
        </Text>
      </Card>

      {/* ④ A-H 溢价排行 + 柱状图 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={13}>
          <Card
            title={<span style={{ color: THEME.text }}>A-H 溢价率排行（红=溢价/绿=折价）</span>}
            size="small"
            style={{ background: THEME.cardBg, borderColor: THEME.border }}
          >
            {ahRows.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart layout="vertical" data={ahBarData} margin={{ top: 8, right: 24, left: 16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: THEME.textSec }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: THEME.textSec }} width={84} />
                  <Tooltip
                    contentStyle={{ background: THEME.cardBg, borderColor: THEME.border, color: THEME.text }}
                    formatter={(v) => [`${Number(v).toFixed(2)}%`, '溢价率']}
                  />
                  <Bar dataKey="premium" name="溢价率" barSize={14}>
                    {ahBarData.map((d, i) => <Cell key={i} fill={flowColor(d.premium)} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              loading ? <LoadingStateDetail /> : <EmptyState title="A-H 溢价真实数据暂不可用" />
            )}
          </Card>
        </Col>
        <Col xs={24} md={11}>
          <Card
            title={<span style={{ color: THEME.text }}>A-H 溢价明细（可点击表头排序）</span>}
            size="small"
            style={{ background: THEME.cardBg, borderColor: THEME.border }}
          >
            <Table
              dataSource={ahRows.map((a) => ({ ...a, key: a.codeA }))}
              columns={ahColumns}
              rowKey="codeA"
              size="small"
              pagination={false}
              scroll={{ x: 620, y: 320 }}
              locale={{ emptyText: loading ? '加载中…' : '暂无数据' }}
            />
          </Card>
        </Col>
      </Row>

      {/* ③⑤⑥ 暂未接入（无真实数据源，诚实标注，不伪造） */}
      <Card
        title={<span style={{ color: THEME.text }}>北向重仓股 / 资金风格 / 北向信号</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        <EmptyState title="部分模块暂未接入真实数据源" description="北向重仓股、资金风格与持仓信号需进一步对接（东方财富对应接口），为避免伪造演示数据暂缓呈现。A-H 溢价与今日沪深港通已实时接通。" />
      </Card>

      <Text style={{ color: THEME.textSec, fontSize: 12, display: 'block', marginTop: 12 }}>
        汇率采用参考值 {ahRate.toFixed(2)}（HKD→CNY，公开事实参考常数）；A 股与 H 股价格均为东方财富实时行情，溢价率由真实价格派生。
      </Text>
    </div>
  );
};

export default HKConnectPage;