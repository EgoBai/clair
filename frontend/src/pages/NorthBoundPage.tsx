/**
 * 北向资金深度追踪页
 *
 * 数据源：GET /api/north-bound/overview（东方财富数据中心 RPT_MUTUAL_DEAL_HISTORY）
 *
 * 口径诚实红线（本页的核心约束）：
 *  1. 交易所自 2024-08-19 起**停止披露北向净买额 / 资金流入 / 买入额 / 卖出额**口径，
 *     后端对应字段（`flows[].shConnect/szConnect/total`、`byDate[].*NetInflow`、
 *     `dealFlows[].netDealAmount`）一律为 `null`。
 *  2. 因此本页主数据源是 **`dealFlows` / `byDate`（成交额，单位万元）**，
 *     卡片与图表标题一律写「成交额」，绝不写「净流入」——成交额 ≠ 净买额。
 *  3. 净流入位置一律显示「已停止披露」，**绝不显示 0.00 亿**（零值顶替空态 = 红线）。
 *  4. `holdings` / `sectors` 后端恒为空数组（持仓明细停更至 2024-09-30 且为季度口径；
 *     板块级净流入无任何真实源），本页据实说明，不假装已接入。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Progress } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { THEME, GOLD } from '../styles/theme-constants';
import logger from '../utils/logger';
import {
  summarizeNorthboundFlow, analyzeHoldingsChanges,
  sectorFlowAggregation, generateNorthboundSignals,
  type NorthboundSignal,
} from '../utils/northboundFlow';
import { LoadingStateDetail, EmptyState } from '../components/Common/StateComponents';

const { Title, Text } = Typography;

/** 成交额单位换算：后端 `dealAmount` 单位为**万元**，展示为「亿元」需 ÷ 10000。 */
const WAN_TO_YI = 1 / 10000;
/** 万元 → 亿元；null/NaN 返回 null（不可得），不回落 0 */
const wanToYi = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n * WAN_TO_YI : null;
};
/** 数值是否可用于展示（null / undefined / 非有限数一律不可得） */
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 净流入类字段的唯一合法展示文案 —— 口径停披露，绝不显示 0.00 亿 */
const NET_DISCLOSED_TEXT = '已停止披露';

/** 后端 dealFlows 单行（字段语义见 backend/src/api/northBound.ts DealFlowRow） */
interface DealFlowRow {
  date: string;
  channel: '沪股通' | '深股通';
  /** 成交额（万元） */
  dealAmount: number | null;
  /** 成交笔数 */
  dealCount: number | null;
  /** 净买额（万元）—— 恒为 null，交易所已停止披露 */
  netDealAmount: number | null;
  leadStock: { code: string; name: string; changeRate: number | null } | null;
  indexClose: number | null;
  indexChangeRate: number | null;
  quotaStatus: string | null;
  dataSource: string;
}

/** 后端 byDate 单行（沪深股通成交额按日汇总，单位万元） */
interface ByDateRow {
  date: string;
  shDealAmount: number | null;
  szDealAmount: number | null;
  totalDealAmount: number | null;
  shDealCount: number | null;
  szDealCount: number | null;
  /** 恒为 null：交易所已停止披露净买额 */
  shNetInflow: number | null;
  szNetInflow: number | null;
  totalNetInflow: number | null;
  shIndexClose: number | null;
  szIndexClose: number | null;
  shQuotaStatus: string | null;
  szQuotaStatus: string | null;
  dataSource: string;
}

/** 涨=红、跌=绿（中国习惯） */
const changeColor = (v: number): string => (v >= 0 ? THEME.up : THEME.down);
const changeArrow = (v: number) => (v >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />);

/** 万元 → 亿元展示；不可得返回「—」（绝不用 0 冒充） */
const fmtYi = (wan: unknown, digits = 2): string => {
  const yi = wanToYi(wan);
  return yi === null ? '—' : `${yi.toFixed(digits)} 亿`;
};

const NorthBoundPage: React.FC = () => {
  const [northboundFlows, setNorthboundFlows] = useState<any[]>([]);
  const [dealFlows, setDealFlows] = useState<DealFlowRow[]>([]);
  const [byDate, setByDate] = useState<ByDateRow[]>([]);
  const [topHoldings, setTopHoldings] = useState<any[]>([]);
  const [sectorNetFlows, setSectorNetFlows] = useState<any[]>([]);
  const [latestTradeDate, setLatestTradeDate] = useState<string | null>(null);
  const [disclosureNote, setDisclosureNote] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/north-bound/overview', { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json) => {
        const d = json?.data || {};
        setNorthboundFlows(Array.isArray(d.flows) ? d.flows : []);
        // 主数据源：真实成交额（语义无歧义，不受净买额停披露影响）
        setDealFlows(Array.isArray(d.dealFlows) ? d.dealFlows : []);
        setByDate(Array.isArray(d.byDate) ? d.byDate : []);
        setTopHoldings(Array.isArray(d.holdings) ? d.holdings : []);
        setSectorNetFlows(Array.isArray(d.sectors) ? d.sectors : []);
        setLatestTradeDate(typeof d.latestTradeDate === 'string' ? d.latestTradeDate : null);
        // 口径说明直接引用后端 message / netInflowDisclosure.note，不自行编造
        const note: string =
          (typeof json?.netInflowDisclosure?.note === 'string' && json.netInflowDisclosure.note) ||
          (typeof json?.message === 'string' && json.message) ||
          '';
        setDisclosureNote(note);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        logger.warn('北向资金接口不可用，已如实置空:', err);
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, []);

  // ── 引擎封装（全部 try/catch 降级，绝不让页面崩溃） ──
  // northboundFlows 后端恒为空数组 → summary 各净流入字段为 null
  const summary = useMemo(() => {
    try {
      return summarizeNorthboundFlow(northboundFlows);
    } catch (e) {
      console.error('[NorthBound] summarizeNorthboundFlow failed', e);
      return null;
    }
  }, []);

  const signals: NorthboundSignal[] = useMemo(() => {
    try {
      return summary ? generateNorthboundSignals(summary) : [];
    } catch (e) {
      console.error('[NorthBound] generateNorthboundSignals failed', e);
      return [];
    }
  }, [summary]);

  const holdingChanges = useMemo(() => {
    try {
      if (topHoldings.length === 0) return null;
      const prev = topHoldings.map((h) => ({
        ...h,
        shares: Math.round(h.shares / (1 + h.changePercent / 100)),
      }));
      return analyzeHoldingsChanges(topHoldings, prev);
    } catch (e) {
      console.error('[NorthBound] analyzeHoldingsChanges failed', e);
      return null;
    }
  }, []);

  const sectorAgg = useMemo(() => {
    try {
      return sectorFlowAggregation(topHoldings);
    } catch (e) {
      console.error('[NorthBound] sectorFlowAggregation failed', e);
      return [];
    }
  }, []);

  const sectorAggMap = useMemo(() => {
    const m = new Map<string, { count: number; avgChange: number }>();
    sectorAgg.forEach((s) => m.set(s.sector, { count: s.count, avgChange: s.avgChange }));
    return m;
  }, [sectorAgg]);

  // ── ① 最新交易日（byDate 最后一行）成交额概览 ──
  const latestRow = byDate.length > 0 ? byDate[byDate.length - 1] : null;
  const latestShYi = wanToYi(latestRow?.shDealAmount);
  const latestSzYi = wanToYi(latestRow?.szDealAmount);
  const latestTotalYi = wanToYi(latestRow?.totalDealAmount);
  const latestCount =
    isNum(latestRow?.shDealCount) && isNum(latestRow?.szDealCount)
      ? latestRow.shDealCount + latestRow.szDealCount
      : isNum(latestRow?.shDealCount)
        ? latestRow.shDealCount
        : isNum(latestRow?.szDealCount)
          ? latestRow.szDealCount
          : null;

  // 最新交易日各通道的领涨股（dealFlows 里按日期+通道取）
  const leadStocks = useMemo(() => {
    if (!latestRow) return { sh: null as DealFlowRow['leadStock'], sz: null as DealFlowRow['leadStock'] };
    const rows = dealFlows.filter((r) => r.date === latestRow.date);
    return {
      sh: rows.find((r) => r.channel === '沪股通')?.leadStock ?? null,
      sz: rows.find((r) => r.channel === '深股通')?.leadStock ?? null,
    };
  }, [dealFlows, latestRow]);

  // ── ② 净流入类数值：不可得即 null，绝不回落 0 ──
  const todayNet = summary?.todayNet ?? null;
  const weekNet = summary?.weekNet ?? null;
  const monthNet = summary?.monthNet ?? null;
  const signalCount = signals.length;

  // ── ③ 成交额趋势（近 60 日；dealAmount 单位万元 → 亿元） ──
  const trendData = useMemo(
    () =>
      byDate.slice(-60).map((r) => ({
        date: r.date.slice(5),
        sh: wanToYi(r.shDealAmount),
        sz: wanToYi(r.szDealAmount),
        total: wanToYi(r.totalDealAmount),
      })),
    [byDate],
  );

  // ── ④ 成交明细表（近 30 行，按日期倒序） ──
  const recentRows = useMemo(() => [...dealFlows].reverse().slice(0, 30), [dealFlows]);

  const dealColumns = [
    { title: '交易日', dataIndex: 'date', key: 'date', width: 110 },
    { title: '通道', dataIndex: 'channel', key: 'channel', width: 90,
      render: (v: string) => <Tag color="default" style={{ color: THEME.textSec }}>{v}</Tag> },
    { title: '成交额(亿)', dataIndex: 'dealAmount', key: 'dealAmount', width: 110,
      render: (v: number | null) => <Text strong>{fmtYi(v)}</Text> },
    { title: '成交笔数', dataIndex: 'dealCount', key: 'dealCount', width: 100,
      render: (v: number | null) => (isNum(v) ? `${v.toLocaleString('zh-CN')}` : '—') },
    { title: '净买额(亿)', dataIndex: 'netDealAmount', key: 'netDealAmount', width: 110,
      render: (v: number | null) => (isNum(v) ? fmtYi(v) : NET_DISCLOSED_TEXT) },
    { title: '领涨股', key: 'leadStock', width: 130,
      render: (_: unknown, r: DealFlowRow) =>
        r.leadStock ? (
          <Text>{r.leadStock.name || r.leadStock.code || '—'}</Text>
        ) : (
          <Text style={{ color: THEME.textSec }}>—</Text>
        ) },
    { title: '领涨股涨跌(%)', key: 'leadChange', width: 130,
      render: (_: unknown, r: DealFlowRow) =>
        isNum(r.leadStock?.changeRate) ? (
          <Text style={{ color: changeColor(r.leadStock.changeRate) }}>
            {changeArrow(r.leadStock.changeRate)} {r.leadStock.changeRate > 0 ? '+' : ''}
            {r.leadStock.changeRate.toFixed(2)}
          </Text>
        ) : (
          <Text style={{ color: THEME.textSec }}>—</Text>
        ) },
    { title: '对应指数收盘', dataIndex: 'indexClose', key: 'indexClose', width: 120,
      render: (v: number | null) => (isNum(v) ? v.toFixed(2) : '—') },
    { title: '额度状态', dataIndex: 'quotaStatus', key: 'quotaStatus', width: 110,
      render: (v: string | null) => v || '—' },
  ];

  // ── ⑤ 重仓股 Top 表格（holdings 后端恒为空，保留契约以备上游恢复披露） ──
  const holdingColumns = [
    { title: '代码', dataIndex: 'ticker', key: 'ticker', width: 90 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 110 },
    { title: '板块', dataIndex: 'sector', key: 'sector', width: 100,
      render: (s: string) => <Tag color="default" style={{ color: THEME.textSec }}>{s}</Tag> },
    { title: '持股市值(亿)', dataIndex: 'marketValue', key: 'marketValue', width: 120,
      render: (v: number) => <Text strong>{v.toFixed(2)}</Text> },
    { title: '持股占比(%)', dataIndex: 'freeFloatRatio', key: 'freeFloatRatio', width: 120,
      render: (v: number) => `${v.toFixed(2)}%` },
    { title: '较上日增减(亿)', dataIndex: 'dayChange', key: 'dayChange', width: 140,
      render: (v: number) => (
        <Text style={{ color: changeColor(v) }}>
          {changeArrow(v)} {v >= 0 ? '+' : ''}{v.toFixed(2)}
        </Text>
      ) },
  ];

  // ── ⑥ 板块净流入排行（sectors 后端恒为空） ──
  const sectorBarData = sectorNetFlows.map((s: any) => ({
    sector: s.sector,
    netInflow: isNum(s.netInflow) ? s.netInflow : null,
  }));

  const sectorTableData = sectorNetFlows.map((s: any) => {
    const agg = sectorAggMap.get(s.sector);
    return {
      sector: s.sector,
      netInflow: s.netInflow,
      count: agg?.count ?? 0,
      avgChange: agg?.avgChange ?? 0,
    };
  });

  const sectorColumns = [
    { title: '板块', dataIndex: 'sector', key: 'sector', width: 120 },
    { title: '净流入(亿)', dataIndex: 'netInflow', key: 'netInflow', width: 120,
      render: (v: number | null) =>
        isNum(v) ? <Text style={{ color: changeColor(v) }}>{v > 0 ? '+' : ''}{v.toFixed(2)}</Text> : NET_DISCLOSED_TEXT },
    { title: '持股家数', dataIndex: 'count', key: 'count', width: 100 },
    { title: '平均变动(%)', dataIndex: 'avgChange', key: 'avgChange', width: 120,
      render: (v: number) => <Text style={{ color: changeColor(v) }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</Text> },
  ];

  // ── ⑦ 信号面板 ──
  const signalMeta = (t: NorthboundSignal['type']) => {
    if (t === 'bullish') return { label: '看多', color: THEME.up, bg: 'rgba(244,63,94,0.12)' };
    if (t === 'bearish') return { label: '看空', color: THEME.down, bg: 'rgba(34,197,94,0.12)' };
    return { label: '中性', color: THEME.textSec, bg: 'rgba(148,163,184,0.12)' };
  };

  // 加载中：统一加载态（共享组件，暗色主题一致）
  if (loading) {
    return (
      <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
        <LoadingStateDetail
          title="正在加载北向资金数据..."
          description="沪股通 / 深股通 成交额与领涨股加载中"
        />
      </div>
    );
  }

  // 空态只在**四个数据字段全空**时才显示（原实现只看 flows/holdings/sectors，
  // 漏掉真实数据所在的 dealFlows，导致后端返回 360 行真实成交额却显示「数据源不可用」）
  const hasAnyData =
    northboundFlows.length > 0 ||
    dealFlows.length > 0 ||
    byDate.length > 0 ||
    topHoldings.length > 0 ||
    sectorNetFlows.length > 0;

  if (!hasAnyData) {
    return (
      <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
        <Title level={3} style={{ color: THEME.text, marginBottom: 4 }}>
          北向资金深度追踪
        </Title>
        <Text style={{ color: THEME.textSec }}>
          沪股通 / 深股通 成交额 · 本次未取到数据
        </Text>
        <div style={{ marginTop: 16 }}>
          <EmptyState
            title="北向资金本次未取到数据"
            description="上游报表（东方财富数据中心 RPT_MUTUAL_DEAL_HISTORY）本次未返回沪/深股通成交记录。净买额口径已停止披露，成交额亦无数据时请稍后重试。"
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
      <Title level={3} style={{ color: THEME.text, marginBottom: 4 }}>
        北向资金深度追踪
      </Title>
      <Text style={{ color: THEME.textSec }}>
        沪股通 / 深股通 成交额（真实数据）
        {latestTradeDate ? ` · 最新交易日 ${latestTradeDate}` : ''}
      </Text>

      {/* 口径说明：文案直接引用后端 netInflowDisclosure.note / message */}
      {disclosureNote && (
        <Card
          size="small"
          style={{
            background: THEME.cardBg,
            borderColor: THEME.border,
            marginTop: 12,
          }}
        >
          <Text style={{ color: THEME.textSec, fontSize: 12 }}>
            <strong style={{ color: GOLD }}>口径说明：</strong>
            净买额口径已停止披露，故本页展示成交额。{disclosureNote}
          </Text>
        </Card>
      )}

      {/* ① 顶部概览卡：成交额（真实可得口径） */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>沪股通成交额(亿)</span>}
              value={latestShYi === null ? '—' : latestShYi}
              precision={latestShYi === null ? undefined : 2}
              valueStyle={{ color: THEME.text }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>深股通成交额(亿)</span>}
              value={latestSzYi === null ? '—' : latestSzYi}
              precision={latestSzYi === null ? undefined : 2}
              valueStyle={{ color: THEME.text }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>北向成交额合计(亿)</span>}
              value={latestTotalYi === null ? '—' : latestTotalYi}
              precision={latestTotalYi === null ? undefined : 2}
              valueStyle={{ color: GOLD }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>成交笔数</span>}
              value={latestCount === null ? '—' : latestCount}
              valueStyle={{ color: THEME.text }}
            />
          </Card>
        </Col>
      </Row>

      {/* ② 净流入类指标：口径已停披露，一律显示「已停止披露」，绝不显示 0.00 亿 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>今日北向净流入(亿)</span>}
              value={isNum(todayNet) ? todayNet.toFixed(2) : NET_DISCLOSED_TEXT}
              valueStyle={{ color: isNum(todayNet) ? changeColor(todayNet) : THEME.textSec }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>近5日累计净流入(亿)</span>}
              value={isNum(weekNet) ? weekNet.toFixed(2) : NET_DISCLOSED_TEXT}
              valueStyle={{ color: isNum(weekNet) ? changeColor(weekNet) : THEME.textSec }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>近20日累计净流入(亿)</span>}
              value={isNum(monthNet) ? monthNet.toFixed(2) : NET_DISCLOSED_TEXT}
              valueStyle={{ color: isNum(monthNet) ? changeColor(monthNet) : THEME.textSec }}
            />
          </Card>
        </Col>
      </Row>
      <Text style={{ color: THEME.textSec, fontSize: 12, display: 'block', marginTop: 8 }}>
        交易所自 2024-08-19 起停止披露北向净买额 / 资金流入 / 买入额 / 卖出额口径，上述三项无真实数据来源，
        故显示「{NET_DISCLOSED_TEXT}」而非数值 0。可得口径为下方成交额。
      </Text>

      {/* ③ 最新交易日领涨股（真实值） */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title={<span style={{ color: THEME.text }}>沪股通领涨股</span>}
            size="small"
            style={{ background: THEME.cardBg, borderColor: THEME.border }}
          >
            {leadStocks.sh ? (
              <div>
                <Text strong style={{ fontSize: 16, color: THEME.text }}>
                  {leadStocks.sh.name || '—'}
                </Text>
                {leadStocks.sh.code && (
                  <Text style={{ color: THEME.textSec, marginLeft: 8 }}>{leadStocks.sh.code}</Text>
                )}
                <div style={{ marginTop: 6 }}>
                  {isNum(leadStocks.sh.changeRate) ? (
                    <Text style={{ color: changeColor(leadStocks.sh.changeRate) }}>
                      {changeArrow(leadStocks.sh.changeRate)}{' '}
                      {leadStocks.sh.changeRate > 0 ? '+' : ''}
                      {leadStocks.sh.changeRate.toFixed(2)}%
                    </Text>
                  ) : (
                    <Text style={{ color: THEME.textSec }}>涨跌幅 —</Text>
                  )}
                </div>
              </div>
            ) : (
              <Text style={{ color: THEME.textSec }}>该交易日无领涨股数据</Text>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={<span style={{ color: THEME.text }}>深股通领涨股</span>}
            size="small"
            style={{ background: THEME.cardBg, borderColor: THEME.border }}
          >
            {leadStocks.sz ? (
              <div>
                <Text strong style={{ fontSize: 16, color: THEME.text }}>
                  {leadStocks.sz.name || '—'}
                </Text>
                {leadStocks.sz.code && (
                  <Text style={{ color: THEME.textSec, marginLeft: 8 }}>{leadStocks.sz.code}</Text>
                )}
                <div style={{ marginTop: 6 }}>
                  {isNum(leadStocks.sz.changeRate) ? (
                    <Text style={{ color: changeColor(leadStocks.sz.changeRate) }}>
                      {changeArrow(leadStocks.sz.changeRate)}{' '}
                      {leadStocks.sz.changeRate > 0 ? '+' : ''}
                      {leadStocks.sz.changeRate.toFixed(2)}%
                    </Text>
                  ) : (
                    <Text style={{ color: THEME.textSec }}>涨跌幅 —</Text>
                  )}
                </div>
              </div>
            ) : (
              <Text style={{ color: THEME.textSec }}>该交易日无领涨股数据</Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* ④ 成交额趋势（近 60 个交易日，单位亿元） */}
      <Card
        title={<span style={{ color: THEME.text }}>北向成交额趋势（近 60 个交易日）</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        {trendData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: THEME.textSec }}
                  interval={Math.max(0, Math.floor(trendData.length / 8))}
                />
                <YAxis tick={{ fontSize: 11, fill: THEME.textSec }} unit=" 亿" />
                <Tooltip
                  contentStyle={{ background: THEME.cardBg, borderColor: THEME.border, color: THEME.text }}
                  formatter={(v) => [v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} 亿`]}
                />
                <Legend wrapperStyle={{ color: THEME.textSec }} />
                <Bar name="沪股通成交额" dataKey="sh" stackId="a">
                  {trendData.map((d, i) => (
                    <Cell key={i} fill={isNum(d.sh) ? THEME.up : 'transparent'} />
                  ))}
                </Bar>
                <Bar name="深股通成交额" dataKey="sz" stackId="a">
                  {trendData.map((d, i) => (
                    <Cell key={i} fill={GOLD} />
                  ))}
                </Bar>
                <Line
                  name="成交额合计"
                  type="monotone"
                  dataKey="total"
                  stroke={THEME.text}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
            <Text style={{ color: THEME.textSec, fontSize: 12 }}>
              单位：亿元（后端原始单位万元，÷10000 换算）。此处为**成交额**，非净买额；
              净买额口径已停止披露，不在此图中以任何形式推算。
            </Text>
          </>
        ) : (
          <Text style={{ color: THEME.textSec }}>无成交额日序列数据</Text>
        )}
      </Card>

      {/* ⑤ 成交明细（真实成交额 / 成交笔数 / 领涨股 / 额度状态） */}
      <Card
        title={<span style={{ color: THEME.text }}>沪/深股通成交明细（最近 {recentRows.length} 条）</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        {recentRows.length > 0 ? (
          <Table
            dataSource={recentRows}
            columns={dealColumns}
            rowKey={(r: DealFlowRow) => `${r.date}-${r.channel}`}
            size="small"
            pagination={false}
            scroll={{ x: 1000 }}
          />
        ) : (
          <Text style={{ color: THEME.textSec }}>无成交明细数据</Text>
        )}
      </Card>

      {/* ⑥ 北向重仓股：后端 holdings 恒为空（明细口径停更至 2024-09-30 且为季度披露） */}
      <Card
        title={<span style={{ color: THEME.text }}>北向重仓股</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        {topHoldings.length > 0 ? (
          <Table
            dataSource={topHoldings}
            columns={holdingColumns}
            rowKey="ticker"
            size="small"
            pagination={false}
            scroll={{ x: 600 }}
          />
        ) : (
          <Text style={{ color: THEME.textSec }}>
            北向持股明细为季度披露口径且上游最新披露日仅到 2024-09-30，已停更一年以上，
            返回该快照会被误读为「当前重仓股」，故本页不展示持仓数据。
          </Text>
        )}
      </Card>

      {/* ⑦ 板块净流入排行：后端 sectors 恒为空（无任何真实源） */}
      <Card
        title={<span style={{ color: THEME.text }}>板块净流入排行</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        {sectorNetFlows.length > 0 ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={14}>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart
                  layout="vertical"
                  data={sectorBarData}
                  margin={{ top: 8, right: 24, left: 16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: THEME.textSec }} />
                  <YAxis
                    type="category"
                    dataKey="sector"
                    tick={{ fontSize: 11, fill: THEME.textSec }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{ background: THEME.cardBg, borderColor: THEME.border, color: THEME.text }}
                    formatter={(v) => [isNum(v) ? `${Number(v).toFixed(2)} 亿` : '—', '净流入']}
                  />
                  <Bar dataKey="netInflow" name="净流入" barSize={16}>
                    {sectorBarData.map((d, i) => (
                      <Cell key={i} fill={isNum(d.netInflow) ? changeColor(d.netInflow) : 'transparent'} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </Col>
            <Col xs={24} md={10}>
              <Table
                dataSource={sectorTableData}
                columns={sectorColumns}
                rowKey="sector"
                size="small"
                pagination={false}
              />
            </Col>
          </Row>
        ) : (
          <Text style={{ color: THEME.textSec }}>
            北向板块级净流入在东方财富 / 腾讯 / 新浪均无真实数据源，本页不展示该口径（不以 0 或估算值顶替）。
          </Text>
        )}
      </Card>

      {/* ⑧ 北向信号面板（净买额停披露时只给说明性中性信号） */}
      <Card
        title={<span style={{ color: THEME.text }}>北向信号面板</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        <Row gutter={[16, 16]}>
          {signals.map((s, i) => {
            const meta = signalMeta(s.type);
            return (
              <Col xs={24} md={12} key={i}>
                <div
                  style={{
                    background: meta.bg,
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Tag color="default" style={{ color: meta.color, borderColor: meta.color }}>
                      {meta.label}
                    </Tag>
                    <Text style={{ color: THEME.textSec, fontSize: 12 }}>
                      信号数 {signalCount}
                    </Text>
                  </div>
                  <div style={{ margin: '8px 0 6px', color: THEME.text }}>{s.message}</div>
                  {s.strength > 0 && (
                    <Progress
                      percent={s.strength}
                      showInfo={false}
                      strokeColor={meta.color}
                      trailColor={THEME.border}
                    />
                  )}
                </div>
              </Col>
            );
          })}
          {holdingChanges && holdingChanges.topIncreased.length > 0 && (
            <Col xs={24}>
              <Text style={{ color: THEME.textSec, fontSize: 12 }}>
                引擎持仓变动：今日增持最多 {holdingChanges.topIncreased[0]?.name}
                （{holdingChanges.topIncreased[0]?.changePercent.toFixed(2)}%）
              </Text>
            </Col>
          )}
        </Row>
      </Card>
    </div>
  );
};

export default NorthBoundPage;