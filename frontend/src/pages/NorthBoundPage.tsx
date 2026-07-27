/**
 * 北向资金深度追踪页
 * 概览卡 / 净流入趋势 / 重仓股 Top / 板块净流入排行 / 北向信号面板
 * 数据全部由 src/utils/northboundDemo.ts 确定性兜底，引擎调用均 try/catch 降级。
 */

import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Progress } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { THEME, GOLD } from '../styles/theme-constants';
import {
  northboundFlows, topHoldings, sectorNetFlows,
} from '../utils/northboundDemo';
import {
  summarizeNorthboundFlow, analyzeHoldingsChanges,
  sectorFlowAggregation, generateNorthboundSignals,
  type NorthboundSignal,
} from '../utils/northboundFlow';

const { Title, Text } = Typography;

/** 涨/流入=红，跌/流出=绿（中国习惯） */
const flowColor = (v: number): string => (v >= 0 ? THEME.up : THEME.down);
const signArrow = (v: number) =>
  v >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />;

const NorthBoundPage: React.FC = () => {
  // ── 引擎封装（全部 try/catch 降级，绝不让页面崩溃） ──
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

  // ── ① 顶部概览卡数据 ──
  const todayNet = summary?.todayNet ?? 0;
  const weekNet = summary?.weekNet ?? 0;
  const monthNet = summary?.monthNet ?? 0;
  const signalCount = signals.length;

  // ── ② 趋势图数据（近 60 日，沪深股通拆分） ──
  const trendData = useMemo(
    () =>
      northboundFlows.map((f) => ({
        date: f.date.slice(5),
        sh: f.shConnect,
        sz: f.szConnect,
        total: f.total,
      })),
    [],
  );

  // ── ③ 重仓股 Top 表格 ──
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
        <Text style={{ color: flowColor(v) }}>
          {signArrow(v)} {v >= 0 ? '+' : ''}{v.toFixed(2)}
        </Text>
      ) },
  ];

  // ── ④ 板块净流入排行（柱状 + 表格补充持股家数） ──
  const sectorBarData = sectorNetFlows.map((s) => ({
    sector: s.sector,
    netInflow: s.netInflow,
  }));

  const sectorTableData = sectorNetFlows.map((s) => {
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
      render: (v: number) => <Text style={{ color: flowColor(v) }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</Text> },
    { title: '持股家数', dataIndex: 'count', key: 'count', width: 100 },
    { title: '平均变动(%)', dataIndex: 'avgChange', key: 'avgChange', width: 120,
      render: (v: number) => <Text style={{ color: flowColor(v) }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</Text> },
  ];

  // ── ⑤ 信号面板 ──
  const signalMeta = (t: NorthboundSignal['type']) => {
    if (t === 'bullish') return { label: '看多', color: THEME.up, bg: 'rgba(244,63,94,0.12)' };
    if (t === 'bearish') return { label: '看空', color: THEME.down, bg: 'rgba(34,197,94,0.12)' };
    return { label: '中性', color: THEME.textSec, bg: 'rgba(148,163,184,0.12)' };
  };

  return (
    <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
      <Title level={3} style={{ color: THEME.text, marginBottom: 4 }}>
        北向资金深度追踪
      </Title>
      <Text style={{ color: THEME.textSec }}>
        沪股通 / 深股通 资金流向 · 确定性演示数据（技术债 T6 兜底）
      </Text>

      {/* ① 顶部概览卡 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>今日北向净流入(亿)</span>}
              value={todayNet}
              precision={2}
              valueStyle={{ color: flowColor(todayNet) }}
              prefix={todayNet >= 0 ? <RiseOutlined /> : <FallOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>近5日累计(亿)</span>}
              value={weekNet}
              precision={2}
              valueStyle={{ color: flowColor(weekNet) }}
              prefix={weekNet >= 0 ? <RiseOutlined /> : <FallOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>近20日累计(亿)</span>}
              value={monthNet}
              precision={2}
              valueStyle={{ color: flowColor(monthNet) }}
              prefix={monthNet >= 0 ? <RiseOutlined /> : <FallOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>信号数</span>}
              value={signalCount}
              valueStyle={{ color: GOLD }}
            />
          </Card>
        </Col>
      </Row>

      {/* ② 北向净流入趋势图 */}
      <Card
        title={<span style={{ color: THEME.text }}>北向净流入趋势（近60日）</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: THEME.textSec }}
              interval={Math.floor(trendData.length / 8)}
            />
            <YAxis tick={{ fontSize: 11, fill: THEME.textSec }} />
            <Tooltip
              contentStyle={{ background: THEME.cardBg, borderColor: THEME.border, color: THEME.text }}
              formatter={(v, n) => [`${Number(v).toFixed(2)} 亿`, String(n)]}
            />
            <Legend wrapperStyle={{ color: THEME.textSec }} />
            <Bar name="沪股通" dataKey="sh" stackId="a">
              {trendData.map((d, i) => (
                <Cell key={i} fill={flowColor(d.sh)} />
              ))}
            </Bar>
            <Bar name="深股通" dataKey="sz" stackId="a">
              {trendData.map((d, i) => (
                <Cell key={i} fill={d.sz >= 0 ? GOLD : THEME.down} />
              ))}
            </Bar>
            <Line
              name="合计"
              type="monotone"
              dataKey="total"
              stroke={THEME.text}
              dot={false}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <Text style={{ color: THEME.textSec, fontSize: 12 }}>
          红=流入 / 绿=流出（中国习惯）；沪股通与深股通堆叠展示，黑线为合计。
        </Text>
      </Card>

      {/* ③ 北向重仓股 Top 15 */}
      <Card
        title={<span style={{ color: THEME.text }}>北向重仓股 Top {topHoldings.length}</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        <Table
          dataSource={topHoldings}
          columns={holdingColumns}
          rowKey="ticker"
          size="small"
          pagination={false}
          scroll={{ x: 600 }}
        />
      </Card>

      {/* ④ 板块净流入排行 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card
            title={<span style={{ color: THEME.text }}>板块净流入排行（申万一级）</span>}
            size="small"
            style={{ background: THEME.cardBg, borderColor: THEME.border }}
          >
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
                  formatter={(v) => [`${Number(v).toFixed(2)} 亿`, '净流入']}
                />
                <Bar dataKey="netInflow" name="净流入" barSize={16}>
                  {sectorBarData.map((d, i) => (
                    <Cell key={i} fill={flowColor(d.netInflow)} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card
            title={<span style={{ color: THEME.text }}>板块明细</span>}
            size="small"
            style={{ background: THEME.cardBg, borderColor: THEME.border }}
          >
            <Table
              dataSource={sectorTableData}
              columns={sectorColumns}
              rowKey="sector"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>

      {/* ⑤ 北向信号面板 */}
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
                      强度 {s.strength}
                    </Text>
                  </div>
                  <div style={{ margin: '8px 0 6px', color: THEME.text }}>{s.message}</div>
                  <Progress
                    percent={s.strength}
                    showInfo={false}
                    strokeColor={meta.color}
                    trailColor={THEME.border}
                  />
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
