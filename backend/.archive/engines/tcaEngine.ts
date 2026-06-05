/**
 * 交易成本分析引擎 - Round 729
 * 分析和优化交易执行成本
 */
export interface ExecutionReport {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: Date;
  venue: string;
  orderType: 'market' | 'limit' | 'stop';
  commission: number;
  slippage: number;
}

export interface TCAMetrics {
  totalCost: number;
  costBps: number;
  marketImpact: number;
  timingCost: number;
  commissionCost: number;
  slippageCost: number;
  implementation_shortfall: number;
  vwapPerformance: number;
  participationRate: number;
}

export interface CostModel {
  fixedCost: number;
  variableCost: number;
  marketImpactCoeff: number;
  timingRiskCoeff: number;
}

export function analyzeExecutionCost(
  executions: ExecutionReport[],
  arrivalPrice: number,
  vwap: number,
  avgDailyVolume: number
): TCAMetrics {
  if (executions.length === 0) {
    return {
      totalCost: 0, costBps: 0, marketImpact: 0, timingCost: 0,
      commissionCost: 0, slippageCost: 0, implementation_shortfall: 0,
      vwapPerformance: 0, participationRate: 0,
    };
  }

  const totalQty = executions.reduce((s, e) => s + e.quantity, 0);
  const totalValue = executions.reduce((s, e) => s + e.quantity * e.price, 0);
  const avgPrice = totalValue / totalQty;
  const totalCommission = executions.reduce((s, e) => s + e.commission, 0);
  const totalSlippage = executions.reduce((s, e) => s + e.slippage * e.quantity, 0);

  // Implementation shortfall
  const side = executions[0].side;
  const shortfall = side === 'buy'
    ? (avgPrice - arrivalPrice) / arrivalPrice
    : (arrivalPrice - avgPrice) / arrivalPrice;

  // VWAP performance
  const vwapPerf = side === 'buy'
    ? (vwap - avgPrice) / vwap
    : (avgPrice - vwap) / vwap;

  // Market impact (square root model)
  const participationRate = totalQty / avgDailyVolume;
  const marketImpact = 0.1 * Math.sqrt(participationRate) * (side === 'buy' ? 1 : -1);

  // Timing cost
  const timingCost = shortfall - marketImpact;

  // Total cost in bps
  const costBps = shortfall * 10000;

  return {
    totalCost: shortfall * totalValue,
    costBps,
    marketImpact: marketImpact * 10000,
    timingCost: timingCost * 10000,
    commissionCost: totalCommission,
    slippageCost: totalSlippage,
    implementation_shortfall: shortfall * 10000,
    vwapPerformance: vwapPerf * 10000,
    participationRate: participationRate * 100,
  };
}

export function estimateOptimalExecution(
  totalQuantity: number,
  avgDailyVolume: number,
  urgency: 'low' | 'medium' | 'high'
): { timeSlices: number; sliceSize: number; estimatedCostBps: number; estimatedDuration: number } {
  const participationLimits: Record<string, number> = { low: 0.05, medium: 0.10, high: 0.20 };
  const maxParticipation = participationLimits[urgency];

  const sliceSize = Math.ceil(avgDailyVolume * maxParticipation);
  const timeSlices = Math.ceil(totalQuantity / sliceSize);

  // Cost model: higher participation = higher impact
  const participationRate = totalQuantity / avgDailyVolume;
  const marketImpact = 10 * Math.sqrt(participationRate); // bps
  const timingRisk = urgency === 'low' ? 5 : urgency === 'medium' ? 3 : 1; // bps
  const estimatedCostBps = marketImpact + timingRisk;

  const estimatedDuration = urgency === 'low' ? timeSlices * 240 : urgency === 'medium' ? timeSlices * 60 : timeSlices * 15; // minutes

  return { timeSlices, sliceSize, estimatedCostBps, estimatedDuration };
}

export function buildCostModel(historicalExecutions: ExecutionReport[]): CostModel {
  if (historicalExecutions.length < 10) {
    return { fixedCost: 0, variableCost: 0, marketImpactCoeff: 0.1, timingRiskCoeff: 0.05 };
  }

  // Estimate from historical data
  const slippages = historicalExecutions.map(e => Math.abs(e.slippage));
  const avgSlippage = slippages.reduce((s, v) => s + v, 0) / slippages.length;
  const commissions = historicalExecutions.map(e => e.commission);
  const avgCommission = commissions.reduce((s, v) => s + v, 0) / commissions.length;

  return {
    fixedCost: avgCommission,
    variableCost: avgSlippage,
    marketImpactCoeff: 0.1,
    timingRiskCoeff: 0.05,
  };
}

export function compareVenues(
  executions: ExecutionReport[]
): { venue: string; avgCostBps: number; fillRate: number; avgSlippage: number }[] {
  const venueMap = new Map<string, { totalCost: number; totalQty: number; slippages: number[] }>();

  for (const exec of executions) {
    if (!venueMap.has(exec.venue)) {
      venueMap.set(exec.venue, { totalCost: 0, totalQty: 0, slippages: [] });
    }
    const v = venueMap.get(exec.venue)!;
    v.totalCost += exec.commission + exec.slippage * exec.quantity;
    v.totalQty += exec.quantity;
    v.slippages.push(Math.abs(exec.slippage));
  }

  return Array.from(venueMap.entries()).map(([venue, data]) => ({
    venue,
    avgCostBps: data.totalQty > 0 ? (data.totalCost / (data.totalQty * 10)) * 10000 : 0,
    fillRate: 1, // simplified
    avgSlippage: data.slippages.length > 0
      ? data.slippages.reduce((s, v) => s + v, 0) / data.slippages.length
      : 0,
  }));
}
