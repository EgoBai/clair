/**
 * 尾部风险管理引擎
 * - VaR/CVaR计算(历史/参数/蒙特卡洛)
 * - 尾部依赖分析
 * - 极端事件概率
 * - 对冲策略推荐
 * - 压力测试场景
 */
export interface ReturnSeries {
  code: string;
  returns: number[];
  weights: number;
}

export interface TailRiskMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  maxDrawdown: number;
  tailRisk: number; // 尾部风险指标
  skewness: number;
  kurtosis: number;
  expectedShortfall: number;
}

export interface ExtremeEventProb {
  threshold: number; // 标准差倍数
  probability: number;
  expectedLoss: number;
  historicalCount: number;
}

export interface HedgingRecommendation {
  strategy: string;
  instrument: string;
  cost: number; // 对冲成本bps
  coverage: number; // 覆盖比例
  residualRisk: number;
}

export interface TailRiskAnalysis {
  portfolio: TailRiskMetrics;
  individual: Array<{ code: string; metrics: TailRiskMetrics }>;
  extremeEvents: ExtremeEventProb[];
  hedgingRecs: HedgingRecommendation[];
  stressTests: Array<{ scenario: string; loss: number }>;
  riskBudget: number; // 剩余风险预算
  alerts: string[];
}

export function analyzeTailRisk(
  returns: ReturnSeries[],
  _confidence: number = 0.95
): TailRiskAnalysis {
  if (returns.length === 0) throw new Error('收益率数据不能为空');

  // 组合收益率
  const n = returns[0].returns.length;
  const portfolioReturns = new Array(n);
  for (let i = 0; i < n; i++) {
    portfolioReturns[i] = returns.reduce((s, r) => s + r.returns[i] * r.weights, 0);
  }

  const portfolio = computeTailMetrics(portfolioReturns);
  const individual = returns.map(r => ({
    code: r.code,
    metrics: computeTailMetrics(r.returns),
  }));

  // 极端事件概率
  const sorted = [...portfolioReturns].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const std = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length);

  const thresholds = [2, 3, 4, 5];
  const extremeEvents: ExtremeEventProb[] = thresholds.map(t => {
    const threshold = mean - t * std;
    const events = sorted.filter(r => r < threshold);
    return {
      threshold: t,
      probability: events.length / sorted.length,
      expectedLoss: events.length > 0 ? events.reduce((s, e) => s + e, 0) / events.length : 0,
      historicalCount: events.length,
    };
  });

  // 对冲建议
  const hedgingRecs: HedgingRecommendation[] = [];
  if (portfolio.var95 < -0.05) {
    hedgingRecs.push({
      strategy: 'protective_put',
      instrument: '50ETF认沽期权',
      cost: Math.abs(portfolio.var95) * 100,
      coverage: 0.8,
      residualRisk: portfolio.cvar95 * 0.2,
    });
  }
  if (portfolio.kurtosis > 4) {
    hedgingRecs.push({
      strategy: 'collar',
      instrument: '虚值期权组合',
      cost: Math.abs(portfolio.var95) * 50,
      coverage: 0.6,
      residualRisk: portfolio.cvar95 * 0.4,
    });
  }

  // 压力测试
  const stressTests = [
    { scenario: '市场下跌5%', loss: portfolioReturns.reduce((s, r) => s + r * 0.5, 0) },
    { scenario: '流动性枯竭', loss: portfolio.var99 * 1.5 },
    { scenario: '黑天鹅(3σ)', loss: mean - 3 * std },
    { scenario: '尾部事件(5σ)', loss: mean - 5 * std },
  ];

  const riskBudget = 1 - Math.abs(portfolio.cvar95) * 10;

  const alerts: string[] = [];
  if (portfolio.kurtosis > 5) alerts.push('收益分布厚尾严重');
  if (portfolio.skewness < -1) alerts.push('收益严重左偏');
  if (Math.abs(portfolio.var99) > 0.1) alerts.push('VaR99超过10%');

  return { portfolio, individual, extremeEvents, hedgingRecs, stressTests, riskBudget: Math.max(0, riskBudget), alerts };
}

function computeTailMetrics(returns: number[]): TailRiskMetrics {
  const sorted = [...returns].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { var95: 0, var99: 0, cvar95: 0, cvar99: 0, maxDrawdown: 0, tailRisk: 0, skewness: 0, kurtosis: 0, expectedShortfall: 0 };
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const stdVal = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const stdSafe = stdVal === 0 ? 1 : stdVal;

  const percentile = (p: number) => sorted[Math.floor(n * (1 - p))];

  const var95 = percentile(0.95);
  const var99 = percentile(0.99);
  const tail95 = sorted.filter(r => r <= var95);
  const tail99 = sorted.filter(r => r <= var99);
  const cvar95 = tail95.length > 0 ? tail95.reduce((s, v) => s + v, 0) / tail95.length : var95;
  const cvar99 = tail99.length > 0 ? tail99.reduce((s, v) => s + v, 0) / tail99.length : var99;

  // 最大回撤 — 使用原始顺序（时间序），注意 returns 是收益率而非价格
  // 使用累计收益率序列计算回撤
  let cumPeak = 0;
  let maxDD = 0;
  let cum = 0;
  for (const r of returns) {
    cum += r;
    if (cum > cumPeak) cumPeak = cum;
    const dd = cum - cumPeak;
    if (dd < maxDD) maxDD = dd;
  }

  const skewness = sorted.reduce((s, r) => s + ((r - mean) / stdSafe) ** 3, 0) / n;
  const kurtosis = sorted.reduce((s, r) => s + ((r - mean) / stdSafe) ** 4, 0) / n;

  return {
    var95, var99, cvar95, cvar99,
    maxDrawdown: maxDD,
    tailRisk: Math.abs(cvar95 - var95),
    skewness,
    kurtosis,
    expectedShortfall: cvar95,
  };
}
