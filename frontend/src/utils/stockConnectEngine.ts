/**
 * 沪深港通资金分析引擎
 * 北向资金/南向资金/持仓分析/资金异动/策略信号
 */

export interface StockConnectFlow {
  date: string;
  northbound: { netBuy: number; buyAmount: number; sellAmount: number; topBuy: { code: string; amount: number }[]; topSell: { code: string; amount: number }[] };
  southbound: { netBuy: number; buyAmount: number; sellAmount: number; topBuy: { code: string; amount: number }[] };
}

export interface NorthboundHoldings {
  code: string;
  name: string;
  shares: number;
  marketValue: number;
  ratioToFloat: number;    // 占流通股比例
  changeFromYesterday: number;
  consecutiveDays: number; // 连续增持天数
}

export interface FlowAnalysisResult {
  period: string;
  totalNetInflow: number;
  avgDailyFlow: number;
  flowTrend: 'accelerating_in' | 'steady_in' | 'steady_out' | 'accelerating_out' | 'volatile';
  cumulativeFlow: number[];
  anomalyDays: { date: string; flow: number; reason: string }[];
  marketImpact: number;    // 对大盘影响度估算
}

export interface StockConnectSignal {
  code: string;
  signal: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell';
  northboundTrend: 'increasing' | 'stable' | 'decreasing';
  holdingRatio: number;
  consecutiveDays: number;
  valueScore: number;      // 北向资金价值评分 0-100
  reasoning: string;
}

// ── 资金流向分析 ──

export function analyzeFlowDirection(flows: StockConnectFlow[]): FlowAnalysisResult {
  if (flows.length === 0) {
    return { period: '', totalNetInflow: 0, avgDailyFlow: 0, flowTrend: 'volatile', cumulativeFlow: [], anomalyDays: [], marketImpact: 0 };
  }

  const netFlows = flows.map(f => f.northbound.netBuy);
  const totalNetInflow = netFlows.reduce((a, b) => a + b, 0);
  const avgDailyFlow = totalNetInflow / flows.length;

  // 累计资金流
  const cumulativeFlow: number[] = [];
  let cumSum = 0;
  for (const f of netFlows) {
    cumSum += f;
    cumulativeFlow.push(roundTo(cumSum, 2));
  }

  // 趋势判断
  const recentHalf = netFlows.slice(-Math.floor(flows.length / 2));
  const earlyHalf = netFlows.slice(0, Math.floor(flows.length / 2));
  const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / Math.max(recentHalf.length, 1);
  const earlyAvg = earlyHalf.reduce((a, b) => a + b, 0) / Math.max(earlyHalf.length, 1);

  let flowTrend: FlowAnalysisResult['flowTrend'];
  const stdDev = calculateStdDev(netFlows);
  if (stdDev > Math.abs(avgDailyFlow) * 2) flowTrend = 'volatile';
  else if (recentAvg > earlyAvg * 1.3 && avgDailyFlow > 0) flowTrend = 'accelerating_in';
  else if (avgDailyFlow > 0) flowTrend = 'steady_in';
  else if (recentAvg < earlyAvg * 0.7 && avgDailyFlow < 0) flowTrend = 'accelerating_out';
  else flowTrend = 'steady_out';

  // 异常日
  const anomalyThreshold = stdDev * 2;
  const anomalyDays = flows
    .filter(f => Math.abs(f.northbound.netBuy - avgDailyFlow) > anomalyThreshold)
    .map(f => ({
      date: f.date,
      flow: f.northbound.netBuy,
      reason: f.northbound.netBuy > 0 ? '异常大幅净买入' : '异常大幅净卖出',
    }));

  const marketImpact = totalNetInflow > 0
    ? Math.min(1, totalNetInflow / 1e8 / 100)
    : Math.max(-1, totalNetInflow / 1e8 / 100);

  const period = `${flows[0].date} ~ ${flows[flows.length - 1].date}`;

  return {
    period,
    totalNetInflow: roundTo(totalNetInflow, 2),
    avgDailyFlow: roundTo(avgDailyFlow, 2),
    flowTrend,
    cumulativeFlow,
    anomalyDays,
    marketImpact: roundTo(marketImpact, 4),
  };
}

// ── 北向持仓分析 ──

export function analyzeNorthboundHoldings(holdings: NorthboundHoldings[]): StockConnectSignal[] {
  return holdings.map(h => {
    let signal: StockConnectSignal['signal'];
    let trend: StockConnectSignal['northboundTrend'];

    if (h.consecutiveDays > 5 && h.changeFromYesterday > 0) {
      trend = 'increasing';
      signal = h.ratioToFloat > 0.05 ? 'strong_buy' : 'buy';
    } else if (h.consecutiveDays < -3) {
      trend = 'decreasing';
      signal = h.ratioToFloat < 0.02 ? 'sell' : 'reduce';
    } else {
      trend = 'stable';
      signal = 'hold';
    }

    const valueScore = Math.min(100, Math.max(0,
      30 + h.ratioToFloat * 200 + Math.max(0, h.consecutiveDays) * 5 + (h.changeFromYesterday > 0 ? 10 : -10)
    ));

    const reasoning = h.consecutiveDays > 5
      ? `北向连续增持${h.consecutiveDays}天，占流通股${(h.ratioToFloat * 100).toFixed(1)}%`
      : h.consecutiveDays < -3
      ? `北向连续减持${Math.abs(h.consecutiveDays)}天`
      : '持仓变动不大';

    return {
      code: h.code,
      signal,
      northboundTrend: trend,
      holdingRatio: roundTo(h.ratioToFloat, 4),
      consecutiveDays: h.consecutiveDays,
      valueScore: roundTo(valueScore, 1),
      reasoning,
    };
  }).sort((a, b) => b.valueScore - a.valueScore);
}

// ── 资金风格偏好 ──

export function analyzeFlowStyle(holdings: NorthboundHoldings[]) {
  const largeCap = holdings.filter(h => h.marketValue > 1e9);
  const smallCap = holdings.filter(h => h.marketValue <= 1e9);

  const largeCapTotal = largeCap.reduce((a, h) => a + h.marketValue, 0);
  const smallCapTotal = smallCap.reduce((a, h) => a + h.marketValue, 0);

  const largeCapChange = largeCap.reduce((a, h) => a + h.changeFromYesterday, 0);
  const smallCapChange = smallCap.reduce((a, h) => a + h.changeFromYesterday, 0);

  return {
    largeCapRatio: roundTo(largeCapTotal / (largeCapTotal + smallCapTotal), 4),
    largeCapChange: roundTo(largeCapChange, 2),
    smallCapChange: roundTo(smallCapChange, 2),
    stylePreference: largeCapChange > smallCapChange ? '大盘价值' : '中小盘成长',
  };
}

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
