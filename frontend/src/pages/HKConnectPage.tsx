/**
 * 港股通 + A-H 溢价分析页（真实源版）
 * - A-H 溢价：后端 /api/hk-connect/ah-premium 实时计算（A/H 真实行情派生，东方财富免 key）
 * - 今日沪深港通：后端 /api/hk-connect/summary 实时额度/净买（东方财富 kamt）
 * - 北向重仓股 / 资金风格 / 北向信号：暂无真实数据源 → 诚实标注「暂未接入」，绝不伪造演示数据
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Progress, Empty } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { THEME, GOLD } from '../styles/theme-constants';

const { Title, Text } = Typography;

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

interface ConnectLeg {
  dayNetIn: number; // 当日净买(亿元)
  remain: number; // 当日额度余额(亿元)
  threshold: number; // 当日总额度(亿元)
  date: string;
}
interface ConnectSummary {
  date: string;
  northbound: ConnectLeg;
  southbound: ConnectLeg;
}

/** 涨/流入=红，跌/流出=绿（中国习惯） */
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

const HKConnectPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [ahRows, setAhRows] = useState<AhPremiumRow[]>([]);
  const [ahSource, setAhSource] = useState<string>('');
  const [ahRate, setAhRate] = useState<number>(0.92);
  const [summary, setSummary] = useState<ConnectSummary | null>(null);
  const [summarySource, setSummarySource] = useState<string>('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/hk-connect/ah-premium').then((r) => r.json()).catch(() => null),
      fetch('/api/hk-connect/summary').then((r) => r.json()).catch(() => null),
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
      }
      setLoading(false);
    }).catch(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // ── ① 概览卡 ──
  const ahStats = useMemo(() => {
    if (ahRows.length === 0) return { avg: 0, max: 0, min: 0, maxName: '-', minName: '-' };
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

  const northNet = summary?.northbound.dayNetIn ?? null;
  const southNet = summary?.southbound.dayNetIn ?? null;

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
      render: (v: number) => {
        const meta = ahSignal(v);
        return <Text style={{ color: flowColor(v) }}>{signArrow(v)} {v >= 0 ? '+' : ''}{v.toFixed(2)}%</Text>;
      } },
    { title: '信号', dataIndex: 'premium', key: 'ahsignal', width: 100,
      render: (v: number) => {
        const meta = ahSignal(v);
        return <Tag color="default" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</Tag>;
      } },
  ];

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
            <Statistic
              title={<span style={{ color: THEME.textSec }}>A-H 溢价均值(%)</span>}
              value={loading ? '-' : ahStats.avg}
              precision={2}
              valueStyle={{ color: flowColor(ahStats.avg) }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>最高溢价 · {ahStats.maxName}</span>}
              value={loading ? '-' : ahStats.max}
              precision={2}
              valueStyle={{ color: THEME.up }}
              prefix={<RiseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>今日北向净买(亿)</span>}
              value={northNet === null ? (loading ? '-' : '暂不可用') : northNet}
              precision={2}
              valueStyle={{ color: northNet === null ? THEME.textSec : flowColor(northNet) }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>今日南向净买(亿)</span>}
              value={southNet === null ? (loading ? '-' : '暂不可用') : southNet}
              precision={2}
              valueStyle={{ color: southNet === null ? THEME.textSec : flowColor(southNet) }}
            />
          </Card>
        </Col>
      </Row>

      {/* ② 今日沪深港通（真实额度/净买） */}
      <Card
        title={<span style={{ color: THEME.text }}>今日沪深港通（东方财富实时额度）</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        {summarySource === 'real' && summary ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Text style={{ color: THEME.text, fontSize: 13 }}>北向（沪股通 + 深股通）</Text>
              <div style={{ marginTop: 8 }}>
                <Statistic
                  title={<span style={{ color: THEME.textSec }}>当日净买(亿)</span>}
                  value={summary.northbound.dayNetIn}
                  precision={2}
                  valueStyle={{ color: flowColor(summary.northbound.dayNetIn), fontSize: 20 }}
                />
                <Progress
                  percent={summary.northbound.threshold > 0
                    ? +((1 - summary.northbound.remain / summary.northbound.threshold) * 100).toFixed(1)
                    : 0}
                  showInfo
                  strokeColor={THEME.up}
                  trailColor={THEME.border}
                  format={(p) => `额度使用 ${p?.toFixed(1)}%`}
                />
              </div>
            </Col>
            <Col xs={24} md={12}>
              <Text style={{ color: THEME.text, fontSize: 13 }}>南向（港股通沪 + 港股通深）</Text>
              <div style={{ marginTop: 8 }}>
                <Statistic
                  title={<span style={{ color: THEME.textSec }}>当日净买(亿)</span>}
                  value={summary.southbound.dayNetIn}
                  precision={2}
                  valueStyle={{ color: flowColor(summary.southbound.dayNetIn), fontSize: 20 }}
                />
                <Progress
                  percent={summary.southbound.threshold > 0
                    ? +((1 - summary.southbound.remain / summary.southbound.threshold) * 100).toFixed(1)
                    : 0}
                  showInfo
                  strokeColor={GOLD}
                  trailColor={THEME.border}
                  format={(p) => `额度使用 ${p?.toFixed(1)}%`}
                />
              </div>
            </Col>
          </Row>
        ) : (
          <Empty description={loading ? '加载中…' : '今日沪深港通实时额度暂不可用（真实源未返回）'} />
        )}
        <Text style={{ color: THEME.textSec, fontSize: 12 }}>
          红=净流入 / 绿=净流出（中国习惯）；额度使用率 = (总额度 − 余额) / 总额度。收盘后北向净额东方财富归零为正常现象。
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
              <Empty description={loading ? '加载中…' : 'A-H 溢价真实数据暂不可用'} />
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
        <Empty description="北向重仓股、资金风格与持仓信号暂未接入真实数据源（东方财富对应接口需进一步对接），为避免伪造演示数据，相关模块暂缓呈现。A-H 溢价与今日沪深港通已实时接通。" />
      </Card>

      <Text style={{ color: THEME.textSec, fontSize: 12, display: 'block', marginTop: 12 }}>
        汇率采用参考值 {ahRate.toFixed(2)}（HKD→CNY，公开事实参考常数）；A 股与 H 股价格均为东方财富实时行情，溢价率由真实价格派生。
      </Text>
    </div>
  );
};

export default HKConnectPage;
