/**
 * 组合风控中心
 * 相关性矩阵 / 压力测试 / VaR 分解 三大板块
 * 接入已有风控引擎：correlationEngine / portfolioStressEngine / tailRiskEngine
 * 演示数据确定性生成（LCG 种子 20260725），引擎调用失败时优雅降级为演示计算
 */

import { useMemo } from 'react';
import {
  Card, Row, Col, Table, Tag, Statistic, Typography, Alert, Tooltip,
  type TableColumnsType,
} from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts';
import {
  SafetyCertificateOutlined, AlertOutlined, FundOutlined, DotChartOutlined,
} from '@ant-design/icons';
import { calculateCorrelationMatrix, type CorrelationResult } from '../utils/correlationEngine';
import {
  stressTestPortfolio, type StressScenario, type PortfolioHolding, type PortfolioStressAnalysis,
} from '../utils/portfolioStressEngine';
import { analyzeTailRisk, type ReturnSeries, type TailRiskAnalysis } from '../utils/tailRiskEngine';
import { getColorByChange } from '../utils/formatters';

const { Title, Text } = Typography;

const SEED = 20260725;
const TRADING_DAYS = 252;
const ACCENT = '#3B82F6';

// ==================== 演示组合定义 ====================

interface DemoAsset {
  symbol: string;
  name: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  beta: number;
  idioVol: number;
  drift: number;
}

const DEMO_ASSETS: DemoAsset[] = [
  { symbol: '600519', name: '贵州茅台', quantity: 100, costPrice: 1600, currentPrice: 1700, beta: 0.90, idioVol: 0.012, drift: 0.0006 },
  { symbol: '000858', name: '五粮液', quantity: 200, costPrice: 150, currentPrice: 145, beta: 1.00, idioVol: 0.014, drift: -0.0002 },
  { symbol: '300750', name: '宁德时代', quantity: 300, costPrice: 200, currentPrice: 220, beta: 1.25, idioVol: 0.020, drift: 0.0008 },
  { symbol: '600036', name: '招商银行', quantity: 500, costPrice: 35, currentPrice: 38, beta: 0.80, idioVol: 0.010, drift: 0.0003 },
  { symbol: '000001', name: '平安银行', quantity: 1000, costPrice: 12, currentPrice: 11, beta: 0.85, idioVol: 0.011, drift: -0.0001 },
  { symbol: '601318', name: '中国平安', quantity: 300, costPrice: 50, currentPrice: 52, beta: 0.95, idioVol: 0.013, drift: 0.0002 },
  { symbol: '000333', name: '美的集团', quantity: 400, costPrice: 65, currentPrice: 70, beta: 1.05, idioVol: 0.013, drift: 0.0004 },
];

// ==================== 确定性随机（LCG + Box-Muller） ====================

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0x7fffffff;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeNormal(rng: () => number): () => number {
  return () => {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

interface DemoData {
  returnsMap: Map<string, number[]>;
  weights: number[];
  marketValues: number[];
  totalMV: number;
  portRet: number[];
}

const DEMO_DATA: DemoData = (() => {
  const rng = makeRng(SEED);
  const normal = makeNormal(rng);
  const market: number[] = [];
  for (let i = 0; i < TRADING_DAYS; i++) market.push(normal() * 0.011);

  const returnsMap = new Map<string, number[]>();
  DEMO_ASSETS.forEach((a) => {
    const ret: number[] = [];
    for (let i = 0; i < TRADING_DAYS; i++) {
      ret.push(a.drift + a.beta * market[i] + a.idioVol * normal());
    }
    returnsMap.set(a.symbol, ret);
  });

  const marketValues = DEMO_ASSETS.map((a) => a.quantity * a.currentPrice);
  const totalMV = marketValues.reduce((s, v) => s + v, 0);
  const weights = marketValues.map((v) => v / totalMV);

  const portRet: number[] = [];
  for (let i = 0; i < TRADING_DAYS; i++) {
    let r = 0;
    for (let k = 0; k < DEMO_ASSETS.length; k++) r += weights[k] * returnsMap.get(DEMO_ASSETS[k].symbol)![i];
    portRet.push(r);
  }
  return { returnsMap, weights, marketValues, totalMV, portRet };
})();

// ==================== 通用数学工具（降级计算用） ====================

function std(arr: number[]): number {
  const n = arr.length;
  if (n < 2) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / n;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - p)));
  return sorted[idx];
}

interface CorrSummary { matrix: number[][]; symbols: string[]; avgCorrelation: number; }
interface StressRow { name: string; description: string; loss: number; worst: { code: string; loss: number }; recoveryDays: number; varImpact: number; }
interface StressSummary { rows: StressRow[]; worstLoss: number; avgLoss: number; resilientScore: number; diversificationBenefit: number; }
interface TailSummary { var95: number; var99: number; cvar95: number; cvar99: number; maxDrawdown: number; }

// 压力测试情景：大盘急跌 / 加息 / 行业黑天鹅 / 产业链冲击 / 全球 Risk-Off
const STRESS_SCENARIOS: StressScenario[] = [
  { name: '大盘急跌 -10%', description: '沪深300单日重挫', marketReturn: -0.10, volatilityMultiplier: 1.6, factorShocks: {} },
  { name: '加息 利率 +50bp', description: '无风险利率上行', marketReturn: -0.03, volatilityMultiplier: 1.2, factorShocks: { '600036': -0.02, '000001': -0.03, '601318': -0.02, '600519': -0.01 } },
  { name: '白酒行业黑天鹅', description: '高端消费政策冲击', marketReturn: -0.04, volatilityMultiplier: 1.8, factorShocks: { '600519': -0.22, '000858': -0.24 } },
  { name: '新能源产业链冲击', description: '补贴退坡/需求担忧', marketReturn: -0.06, volatilityMultiplier: 1.5, factorShocks: { '300750': -0.26, '000333': -0.05 } },
  { name: '全球 Risk-Off', description: '外资大幅流出', marketReturn: -0.12, volatilityMultiplier: 2.0, factorShocks: { '601318': -0.05, '600036': -0.04 } },
];

// 风险贡献分解（基于协方差矩阵的 Component VaR）
function computeRiskContrib(): { symbol: string; name: string; pct: number }[] {
  const assets = DEMO_ASSETS;
  const n = assets.length;
  const rets = assets.map((a) => DEMO_DATA.returnsMap.get(a.symbol)!);
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = pearson(rets[i], rets[j]) * std(rets[i]) * std(rets[j]);
      cov[i][j] = c; cov[j][i] = c;
    }
  }
  const w = DEMO_DATA.weights;
  let pv = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pv += w[i] * w[j] * cov[i][j];
  const sw = Math.sqrt(pv > 0 ? pv : 1e-9);
  const contrib = assets.map((_, i) => {
    let s = 0;
    for (let j = 0; j < n; j++) s += cov[i][j] * w[j];
    return (w[i] * s) / sw;
  });
  const total = contrib.reduce((s, v) => s + v, 0) || 1e-9;
  return assets.map((a, i) => ({ symbol: a.symbol, name: a.name, pct: (contrib[i] / total) * 100 }));
}

// ==================== 颜色 ====================

function corrColor(c: number): string {
  if (c >= 0) return `rgba(239, 68, 68, ${(0.12 + c * 0.6).toFixed(3)})`;
  return `rgba(59, 130, 246, ${Math.min(0.6, -c * 0.6).toFixed(3)})`;
}

const BAR_COLORS = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899'];

// ==================== 组件 ====================

function RiskCenterPage() {
  // --- 相关性矩阵 ---
  const corr = useMemo<{ ok: boolean; value: CorrSummary }>(() => {
    try {
      const r: CorrelationResult = calculateCorrelationMatrix(DEMO_DATA.returnsMap);
      return { ok: true, value: { matrix: r.matrix, symbols: r.symbols, avgCorrelation: r.avgCorrelation } };
    } catch {
      const syms = DEMO_ASSETS.map((a) => a.symbol);
      const m = syms.map((s, i) => syms.map((t, j) => (i === j ? 1 : pearson(DEMO_DATA.returnsMap.get(s)!, DEMO_DATA.returnsMap.get(t)!))));
      let tot = 0, cnt = 0;
      for (let i = 0; i < syms.length; i++) for (let j = i + 1; j < syms.length; j++) { tot += m[i][j]; cnt++; }
      return { ok: false, value: { matrix: m, symbols: syms, avgCorrelation: cnt ? tot / cnt : 0 } };
    }
  }, []);

  // --- 压力测试 ---
  const stress = useMemo<{ ok: boolean; value: StressSummary }>(() => {
    const holdings: PortfolioHolding[] = DEMO_ASSETS.map((a, i) => ({
      code: a.symbol, weight: DEMO_DATA.weights[i], returns: DEMO_DATA.returnsMap.get(a.symbol)!, beta: a.beta,
    }));
    try {
      const a: PortfolioStressAnalysis = stressTestPortfolio(holdings, STRESS_SCENARIOS);
      const rows: StressRow[] = a.results.map((r) => ({
        name: r.scenario.name, description: r.scenario.description, loss: r.portfolioLoss,
        worst: r.worstHoldings[0] ?? { code: '-', loss: 0 }, recoveryDays: r.estimatedRecoveryDays, varImpact: r.varImpact,
      }));
      return { ok: true, value: { rows, worstLoss: a.maxDrawdownUnderStress, avgLoss: a.averageStressLoss, resilientScore: a.resilientScore, diversificationBenefit: a.diversificationBenefit } };
    } catch {
      const rows: StressRow[] = STRESS_SCENARIOS.map((sc) => {
        let loss = 0;
        const losses = holdings.map((h) => {
          const l = h.weight * (h.beta * sc.marketReturn + (sc.factorShocks[h.code] ?? 0));
          loss += l;
          return { code: h.code, loss: l };
        });
        losses.sort((x, y) => x.loss - y.loss);
        return { name: sc.name, description: sc.description, loss, worst: losses[0], recoveryDays: 60, varImpact: -1.65 * 0.02 };
      });
      const losses = rows.map((r) => r.loss);
      return { ok: false, value: { rows, worstLoss: Math.min(...losses), avgLoss: losses.reduce((s, v) => s + v, 0) / losses.length, resilientScore: 60, diversificationBenefit: 0 } };
    }
  }, []);

  // --- 尾部风险 / VaR ---
  const tail = useMemo<{ ok: boolean; value: TailSummary }>(() => {
    const rs: ReturnSeries[] = DEMO_ASSETS.map((a, i) => ({
      code: a.symbol, returns: DEMO_DATA.returnsMap.get(a.symbol)!, weights: DEMO_DATA.weights[i],
    }));
    try {
      const a: TailRiskAnalysis = analyzeTailRisk(rs, 0.95);
      return { ok: true, value: { var95: a.portfolio.var95, var99: a.portfolio.var99, cvar95: a.portfolio.cvar95, cvar99: a.portfolio.cvar99, maxDrawdown: a.portfolio.maxDrawdown } };
    } catch {
      const sorted = [...DEMO_DATA.portRet].sort((x, y) => x - y);
      const v95 = percentileSorted(sorted, 0.95);
      const v99 = percentileSorted(sorted, 0.99);
      const t95 = sorted.filter((r) => r <= v95);
      const t99 = sorted.filter((r) => r <= v99);
      const c95 = t95.length ? t95.reduce((s, v) => s + v, 0) / t95.length : v95;
      const c99 = t99.length ? t99.reduce((s, v) => s + v, 0) / t99.length : v99;
      let cum = 0, peak = 0, mdd = 0;
      for (const r of DEMO_DATA.portRet) { cum += r; if (cum > peak) peak = cum; const dd = cum - peak; if (dd < mdd) mdd = dd; }
      return { ok: false, value: { var95: v95, var99: v99, cvar95: c95, cvar99: c99, maxDrawdown: mdd } };
    }
  }, []);

  // --- 风险贡献分解 ---
  const contrib = useMemo(() => computeRiskContrib(), []);

  const degraded = !corr.ok || !stress.ok || !tail.ok;

  // --- 概览 ---
  const annVol = std(DEMO_DATA.portRet) * Math.sqrt(252);
  const var95 = Math.abs(tail.value.var95);
  const maxDD = Math.abs(tail.value.maxDrawdown);
  const { rating, ratingColor } = (() => {
    if (annVol >= 0.30) return { rating: '高', ratingColor: '#EF4444' };
    if (annVol >= 0.22) return { rating: '中高', ratingColor: '#F59E0B' };
    if (annVol >= 0.15) return { rating: '中', ratingColor: ACCENT };
    return { rating: '低', ratingColor: '#22C55E' };
  })();

  const sign = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';

  // --- 相关性矩阵表格 ---
  const corrColumns: TableColumnsType<{ key: string; name: string; symbol: string; values: number[] }> = [
    { title: '标的', dataIndex: 'name', key: 'name', fixed: 'left', width: 110,
      render: (_: unknown, r) => (<span><Text strong>{r.name}</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>{r.symbol}</Text></span>) },
    ...corr.value.symbols.map((sym, j) => ({
      title: sym, key: sym, align: 'center' as const, width: 78,
      render: (_: unknown, row: { values: number[] }) => {
        const v = row.values[j];
        return (
          <div style={{ background: corrColor(v), margin: -8, padding: 8, borderRadius: 4 }}>
            <Text style={{ color: '#f8fafc', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v.toFixed(2)}</Text>
          </div>
        );
      },
    })),
  ];
  const corrData = corr.value.symbols.map((sym, i) => ({
    key: sym, symbol: sym, name: DEMO_ASSETS.find((a) => a.symbol === sym)?.name ?? sym, values: corr.value.matrix[i],
  }));

  // --- 压力测试表格 ---
  const stressColumns: TableColumnsType<StressRow> = [
    { title: '压力情景', key: 'name', width: 150,
      render: (_: unknown, r) => (<span><Text strong>{r.name}</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Text></span>) },
    { title: '组合预估损益', dataIndex: 'loss', key: 'loss', width: 120, align: 'right',
      render: (v: number) => <Text style={{ color: getColorByChange(v), fontFamily: 'var(--font-mono)' }}>{sign(v)}</Text> },
    { title: '最大受损标的', key: 'worst', width: 150,
      render: (_: unknown, r) => {
        const nm = DEMO_ASSETS.find((a) => a.symbol === r.worst.code)?.name ?? r.worst.code;
        return <Text style={{ color: getColorByChange(r.worst.loss), fontSize: 12 }}>{nm} {sign(r.worst.loss)}</Text>;
      } },
    { title: 'VaR 冲击', dataIndex: 'varImpact', key: 'varImpact', width: 100, align: 'right',
      render: (v: number) => <Text type="secondary" style={{ fontFamily: 'var(--font-mono)' }}>{sign(v)}</Text> },
    { title: '预估恢复天数', dataIndex: 'recoveryDays', key: 'recoveryDays', width: 110, align: 'right',
      render: (v: number) => <Tag color={v > 90 ? 'red' : v > 45 ? 'orange' : 'green'}>{v} 天</Tag> },
  ];

  const barData = contrib.map((c) => ({ name: c.name, pct: Number(c.pct.toFixed(1)), symbol: c.symbol }));

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <SafetyCertificateOutlined style={{ marginRight: 8, color: ACCENT }} />
        组合风控中心
      </Title>

      <Alert
        type="info"
        showIcon
        message="演示组合风控测算（LCG 种子 20260725 固定，结果可复现）"
        style={{ marginBottom: 16 }}
      />
      {degraded && (
        <Alert type="warning" showIcon message="部分风控引擎调用失败，已自动降级为演示计算结果" style={{ marginBottom: 16 }} />
      )}

      {/* 顶部风险概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="组合年化波动率" value={(annVol * 100).toFixed(2)} suffix="%" precision={2}
              valueStyle={{ color: ACCENT }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="最大回撤" value={maxDD * 100} suffix="%" precision={2}
              valueStyle={{ color: '#EF4444' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="VaR (95%, 单日)" value={var95 * 100} suffix="%" precision={2}
              valueStyle={{ color: '#F59E0B' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ marginBottom: 4 }}><Text type="secondary">风险评级</Text></div>
            <Tag color={ratingColor} style={{ fontSize: 18, padding: '2px 12px', marginTop: 4 }}>{rating}</Tag>
          </Card>
        </Col>
      </Row>

      {/* 板块 a：相关性矩阵 */}
      <Card
        title={<><FundOutlined style={{ marginRight: 6, color: ACCENT }} />相关性矩阵</>}
        extra={<Tag color="blue">平均相关性 {corr.value.avgCorrelation.toFixed(2)}</Tag>}
        style={{ marginBottom: 16 }}
      >
        <Table
          columns={corrColumns}
          dataSource={corrData}
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ x: 110 + corr.value.symbols.length * 78 }}
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          颜色越红相关性越高（同涨同跌风险大），越蓝表示负相关（分散效果佳）；对角线为自身相关性 1.00。
        </Text>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* 板块 b：压力测试 */}
        <Col span={14}>
          <Card title={<><AlertOutlined style={{ marginRight: 6, color: ACCENT }} />压力测试</>}>
            <Table
              columns={stressColumns}
              dataSource={stress.value.rows}
              rowKey="name"
              size="small"
              pagination={false}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>最差情景损失 <Text style={{ color: getColorByChange(stress.value.worstLoss) }}>{sign(stress.value.worstLoss)}</Text></Text>
              <Text type="secondary" style={{ fontSize: 12 }}>平均损失 <Text style={{ color: getColorByChange(stress.value.avgLoss) }}>{sign(stress.value.avgLoss)}</Text></Text>
              <Text type="secondary" style={{ fontSize: 12 }}>组合韧性评分 <Text strong>{stress.value.resilientScore.toFixed(0)}</Text>/100</Text>
            </div>
          </Card>
        </Col>

        {/* 板块 c：VaR 分解 */}
        <Col span={10}>
          <Card title={<><DotChartOutlined style={{ marginRight: 6, color: ACCENT }} />VaR 分解</>}>
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col span={12}><Statistic title="组合 VaR (95%)" value={Math.abs(tail.value.var95) * 100} suffix="%" precision={2} valueStyle={{ color: '#F59E0B' }} /></Col>
              <Col span={12}><Statistic title="组合 CVaR (95%)" value={Math.abs(tail.value.cvar95) * 100} suffix="%" precision={2} valueStyle={{ color: '#EF4444' }} /></Col>
            </Row>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" unit="%" domain={[0, 'dataMax']} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                <RTooltip formatter={(v) => [`${Number(v)}%`, '风险贡献']} />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {barData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Text type="secondary" style={{ fontSize: 12 }}>各持仓对组合整体风险（波动率）的贡献占比</Text>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default RiskCenterPage;
