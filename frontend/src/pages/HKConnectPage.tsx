/**
 * 港股通 + A-H 溢价分析页
 * 概览卡 / 资金流趋势 / 北向重仓股 / A-H 溢价排行 / 资金风格信号
 * 数据全部由 src/utils/hkConnectDemo.ts 确定性兜底，引擎调用均 try/catch 降级。
 */

import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Progress, Empty } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { THEME, GOLD } from '../styles/theme-constants';
import {
  hkConnectFlows, northboundHoldings, ahPremiums, type AHPremiumRow,
} from '../utils/hkConnectDemo';
import {
  analyzeFlowDirection, analyzeNorthboundHoldings, analyzeFlowStyle,
  type StockConnectSignal, type FlowAnalysisResult,
} from '../utils/stockConnectEngine';

const { Title, Text } = Typography;

/** 涨/流入=红，跌/流出=绿（中国习惯） */
const flowColor = (v: number): string => (v >= 0 ? THEME.up : THEME.down);
const signArrow = (v: number) => (v >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />);

/** 北向持仓信号 → 颜色/标签 */
const nbSignalMeta = (t: StockConnectSignal['signal']) => {
  switch (t) {
    case 'strong_buy': return { label: '强烈增持', color: THEME.up };
    case 'buy': return { label: '增持', color: THEME.up };
    case 'reduce': return { label: '减持', color: THEME.down };
    case 'sell': return { label: '卖出', color: THEME.down };
    default: return { label: '持有', color: THEME.textSec };
  }
};

/** 资金趋势信号 → 颜色/标签 */
const trendMeta = (t: FlowAnalysisResult['flowTrend']) => {
  switch (t) {
    case 'accelerating_in': return { label: '加速流入', color: THEME.up };
    case 'steady_in': return { label: '稳步流入', color: THEME.up };
    case 'steady_out': return { label: '稳步流出', color: THEME.down };
    case 'accelerating_out': return { label: '加速流出', color: THEME.down };
    default: return { label: '剧烈波动', color: THEME.textSec };
  }
};

/** A-H 溢价信号：溢价>30 偏贵看H；<0 看A更便宜；其余中性 */
const ahSignal = (premium: number) => {
  if (premium > 30) return { label: 'A溢价偏高', color: THEME.up };
  if (premium < 0) return { label: 'H更便宜', color: THEME.down };
  return { label: '中性', color: THEME.textSec };
};

const HKConnectPage: React.FC = () => {
  // ── 引擎封装（全部 try/catch 降级，绝不让页面崩溃） ──
  const flowAnalysis: FlowAnalysisResult | null = useMemo(() => {
    try {
      return analyzeFlowDirection(hkConnectFlows);
    } catch (e) {
      console.error('[HKConnect] analyzeFlowDirection failed', e);
      return null;
    }
  }, []);

  const nbSignals: StockConnectSignal[] = useMemo(() => {
    try {
      return analyzeNorthboundHoldings(northboundHoldings);
    } catch (e) {
      console.error('[HKConnect] analyzeNorthboundHoldings failed', e);
      return [];
    }
  }, []);

  const styleInfo = useMemo(() => {
    try {
      return analyzeFlowStyle(northboundHoldings);
    } catch (e) {
      console.error('[HKConnect] analyzeFlowStyle failed', e);
      return null;
    }
  }, []);

  const signalMap = useMemo(() => {
    const m = new Map<string, StockConnectSignal>();
    nbSignals.forEach((s) => m.set(s.code, s));
    return m;
  }, [nbSignals]);

  // StockConnectSignal 仅含 code，名称需从重仓股列表按 code 映射
  const codeToName = useMemo(() => {
    const m = new Map<string, string>();
    northboundHoldings.forEach((h) => m.set(h.code, h.name));
    return m;
  }, []);
  const nameOf = (s: StockConnectSignal) => codeToName.get(s.code) || s.code;

  // ── ① 概览卡 ──
  const northNet = flowAnalysis?.totalNetInflow ?? 0;
  const southNet = useMemo(
    () => hkConnectFlows.reduce((a, f) => a + f.southbound.netBuy, 0),
    [],
  );
  const trend = flowAnalysis?.flowTrend ?? 'volatile';
  const anomalyCount = flowAnalysis?.anomalyDays.length ?? 0;

  // ── ② 资金流趋势图 ──
  const trendData = useMemo(() => {
    const cum = flowAnalysis?.cumulativeFlow ?? [];
    return hkConnectFlows.map((f, i) => ({
      date: f.date.slice(5),
      nb: f.northbound.netBuy,
      sb: f.southbound.netBuy,
      cum: cum[i] ?? 0,
    }));
  }, [flowAnalysis]);

  // ── ③ 北向重仓股表 ──
  const holdingColumns = [
    { title: '代码', dataIndex: 'code', key: 'code', width: 90 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 110 },
    { title: '持股市值(亿)', dataIndex: 'marketValue', key: 'marketValue', width: 120,
      render: (v: number) => <Text strong>{(v / 1e8).toFixed(2)}</Text> },
    { title: '占流通股(%)', dataIndex: 'ratioToFloat', key: 'ratioToFloat', width: 110,
      render: (v: number) => `${(v * 100).toFixed(2)}%` },
    { title: '较上日(亿)', dataIndex: 'changeFromYesterday', key: 'changeFromYesterday', width: 110,
      render: (v: number) => {
        const y = v / 1e8;
        return <Text style={{ color: flowColor(y) }}>{signArrow(y)} {y >= 0 ? '+' : ''}{y.toFixed(2)}</Text>;
      } },
    { title: '信号', dataIndex: 'code', key: 'signal', width: 100,
      render: (code: string) => {
        const s = signalMap.get(code);
        if (!s) return <Tag color="default">-</Tag>;
        const meta = nbSignalMeta(s.signal);
        return <Tag color="default" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</Tag>;
      } },
    { title: '北向评分', dataIndex: 'code', key: 'score', width: 90,
      render: (code: string) => {
        const s = signalMap.get(code);
        return <Text style={{ color: THEME.textSec }}>{s ? s.valueScore.toFixed(0) : '-'}</Text>;
      } },
  ];

  const holdingData = useMemo(
    () => northboundHoldings.map((h) => ({ ...h, key: h.code })),
    [],
  );

  // ── ④ A-H 溢价 ──
  const ahBarData = useMemo(
    () => ahPremiums.map((a) => ({ name: a.name, premium: a.premium })),
    [],
  );

  const ahColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 110,
      sorter: (a: AHPremiumRow, b: AHPremiumRow) => a.name.localeCompare(b.name),
      render: (v: string) => <Text strong>{v}</Text> },
    { title: 'A代码', dataIndex: 'codeA', key: 'codeA', width: 90 },
    { title: 'H代码', dataIndex: 'codeH', key: 'codeH', width: 90 },
    { title: '行业', dataIndex: 'industry', key: 'industry', width: 100,
      render: (v: string) => <Tag color="default" style={{ color: THEME.textSec }}>{v}</Tag> },
    { title: 'A价(RMB)', dataIndex: 'priceA', key: 'priceA', width: 100,
      sorter: (a: AHPremiumRow, b: AHPremiumRow) => a.priceA - b.priceA,
      render: (v: number) => v.toFixed(2) },
    { title: 'H价(HKD)', dataIndex: 'priceH', key: 'priceH', width: 100,
      sorter: (a: AHPremiumRow, b: AHPremiumRow) => a.priceH - b.priceH,
      render: (v: number) => v.toFixed(2) },
    { title: '溢价率(%)', dataIndex: 'premium', key: 'premium', width: 110,
      defaultSortOrder: 'descend' as const,
      sorter: (a: AHPremiumRow, b: AHPremiumRow) => a.premium - b.premium,
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

  const tMeta = trendMeta(trend);

  return (
    <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
      <Title level={3} style={{ color: THEME.text, marginBottom: 4 }}>
        港股通资金 · A-H 溢价分析
      </Title>
      <Text style={{ color: THEME.textSec }}>
        沪深港通南北向资金流 · 北向重仓 · A+H 两地溢价 · 确定性演示数据（技术债 T6 兜底）
      </Text>

      {/* ① 概览卡 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>北向累计净流入(亿)</span>}
              value={northNet}
              precision={2}
              valueStyle={{ color: flowColor(northNet) }}
              prefix={northNet >= 0 ? <RiseOutlined /> : <FallOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>南向累计净流入(亿)</span>}
              value={southNet}
              precision={2}
              valueStyle={{ color: flowColor(southNet) }}
              prefix={southNet >= 0 ? <RiseOutlined /> : <FallOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>资金趋势信号</span>}
              value={tMeta.label}
              valueStyle={{ color: tMeta.color, fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ background: THEME.cardBg, borderColor: THEME.border }}>
            <Statistic
              title={<span style={{ color: THEME.textSec }}>异常日数</span>}
              value={anomalyCount}
              valueStyle={{ color: anomalyCount > 0 ? THEME.up : THEME.textSec }}
            />
          </Card>
        </Col>
      </Row>

      {/* ② 资金流趋势图 */}
      <Card
        title={<span style={{ color: THEME.text }}>南北向净流入趋势（近60日）</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: THEME.textSec }} interval={Math.floor(trendData.length / 8)} />
            <YAxis tick={{ fontSize: 11, fill: THEME.textSec }} />
            <Tooltip
              contentStyle={{ background: THEME.cardBg, borderColor: THEME.border, color: THEME.text }}
              formatter={(v, n) => [`${Number(v).toFixed(2)} 亿`, String(n)]}
            />
            <Legend wrapperStyle={{ color: THEME.textSec }} />
            <Bar name="北向净买" dataKey="nb">
              {trendData.map((d, i) => <Cell key={i} fill={flowColor(d.nb)} />)}
            </Bar>
            <Bar name="南向净买" dataKey="sb">
              {trendData.map((d, i) => <Cell key={i} fill={d.sb >= 0 ? GOLD : THEME.down} />)}
            </Bar>
            <Line name="北向累计" type="monotone" dataKey="cum" stroke={THEME.text} dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
        <Text style={{ color: THEME.textSec, fontSize: 12 }}>
          红=流入 / 绿=流出（中国习惯）；北向=红系、南向=金色，黑线为北向累计。
        </Text>
      </Card>

      {/* ③ 北向重仓股 Top 15 */}
      <Card
        title={<span style={{ color: THEME.text }}>北向重仓股 Top {northboundHoldings.length}</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        <Table dataSource={holdingData} columns={holdingColumns} rowKey="code" size="small" pagination={false} scroll={{ x: 700 }} />
      </Card>

      {/* ④ A-H 溢价排行 + 柱状图 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={13}>
          <Card
            title={<span style={{ color: THEME.text }}>A-H 溢价率排行（红=溢价/绿=折价）</span>}
            size="small"
            style={{ background: THEME.cardBg, borderColor: THEME.border }}
          >
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
          </Card>
        </Col>
        <Col xs={24} md={11}>
          <Card
            title={<span style={{ color: THEME.text }}>A-H 溢价明细（可点击表头排序）</span>}
            size="small"
            style={{ background: THEME.cardBg, borderColor: THEME.border }}
          >
            <Table
              dataSource={ahPremiums.map((a) => ({ ...a, key: a.codeA }))}
              columns={ahColumns}
              rowKey="codeA"
              size="small"
              pagination={false}
              scroll={{ x: 620, y: 320 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ⑤ 资金风格 / 信号面板 */}
      <Card
        title={<span style={{ color: THEME.text }}>资金风格与信号面板</span>}
        size="small"
        style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
      >
        {styleInfo ? (
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title={<span style={{ color: THEME.textSec }}>大盘股占比</span>}
                value={(styleInfo.largeCapRatio * 100).toFixed(1)} suffix="%" valueStyle={{ color: GOLD }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title={<span style={{ color: THEME.textSec }}>大盘增减(亿)</span>}
                value={styleInfo.largeCapChange / 1e8} precision={2}
                valueStyle={{ color: flowColor(styleInfo.largeCapChange) }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title={<span style={{ color: THEME.textSec }}>中小盘增减(亿)</span>}
                value={styleInfo.smallCapChange / 1e8} precision={2}
                valueStyle={{ color: flowColor(styleInfo.smallCapChange) }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title={<span style={{ color: THEME.textSec }}>风格偏好</span>}
                value={styleInfo.stylePreference} valueStyle={{ color: THEME.text, fontSize: 18 }} />
            </Col>
            {nbSignals.length > 0 && (
              <Col xs={24}>
                <Text style={{ color: THEME.textSec, fontSize: 12 }}>
                  引擎持仓信号：{nbSignals.filter((s) => s.signal === 'strong_buy' || s.signal === 'buy').length} 只增持、
                  {nbSignals.filter((s) => s.signal === 'sell' || s.signal === 'reduce').length} 只减持；
                  评分最高 {nbSignals[0] ? nameOf(nbSignals[0]) : '-'}（{nbSignals[0]?.valueScore.toFixed(0)}）。
                </Text>
              </Col>
            )}
          </Row>
        ) : (
          <Empty description="风格分析暂不可用" />
        )}
      </Card>

      {/* ⑥ 北向信号明细（进度条） */}
      {nbSignals.length > 0 && (
        <Card
          title={<span style={{ color: THEME.text }}>北向信号明细</span>}
          size="small"
          style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}
        >
          <Row gutter={[16, 16]}>
            {nbSignals.slice(0, 8).map((s) => {
              const meta = nbSignalMeta(s.signal);
              return (
                <Col xs={24} md={12} key={s.code}>
                  <div style={{ background: 'rgba(148,163,184,0.08)', border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Tag color="default" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</Tag>
                      <Text style={{ color: THEME.textSec, fontSize: 12 }}>{nameOf(s)} · 评分 {s.valueScore.toFixed(0)}</Text>
                    </div>
                    <div style={{ margin: '8px 0 6px', color: THEME.text, fontSize: 12 }}>{s.reasoning}</div>
                    <Progress percent={s.valueScore} showInfo={false} strokeColor={meta.color} trailColor={THEME.border} />
                  </div>
                </Col>
              );
            })}
          </Row>
        </Card>
      )}
    </div>
  );
};

export default HKConnectPage;
