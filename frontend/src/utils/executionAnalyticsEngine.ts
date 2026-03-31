/**
 * Execution Analytics Engine
 *
 * 交易执行分析、TWAP/VWAP比较、执行质量评估
 */

export interface TradeExecution {
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  timestamp: number;
  venue?: string;
}

export interface BenchmarkPrices {
  vwap: number;
  twap: number;
  open: number;
  close: number;
  high: number;
  low: number;
  arrivalPrice: number;
}

export interface ExecutionQuality {
  symbol: string;
  side: string;
  totalQuantity: number;
  avgPrice: number;
  vwapSlippage: number;
  twapSlippage: number;
  arrivalSlippage: number;
  implementationShortfall: number;
  participationRate: number;
  executionScore: number; // 0-100
}

export interface ExecutionSummary {
  trades: number;
  totalVolume: number;
  avgSlippageVWAP: number;
  avgSlippageTWAP: number;
  bestExecution: TradeExecution | null;
  worstExecution: TradeExecution | null;
  venueBreakdown: Record<string, { count: number; volume: number }>;
}

/**
 * 计算VWAP
 */
export function calculateVWAP(executions: TradeExecution[]): number {
  if (executions.length === 0) return 0;

  let totalValue = 0;
  let totalVolume = 0;

  for (const exec of executions) {
    totalValue += exec.price * exec.quantity;
    totalVolume += exec.quantity;
  }

  return totalVolume > 0 ? totalValue / totalVolume : 0;
}

/**
 * 计算TWAP（时间加权平均价格）
 */
export function calculateTWAP(executions: TradeExecution[]): number {
  if (executions.length === 0) return 0;

  // Simple average of prices weighted by time intervals
  const sorted = [...executions].sort((a, b) => a.timestamp - b.timestamp);
  let totalPrice = 0;
  let totalTime = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const interval = sorted[i + 1].timestamp - sorted[i].timestamp;
    totalPrice += sorted[i].price * interval;
    totalTime += interval;
  }

  // Include last execution
  if (sorted.length > 0) {
    const lastInterval = totalTime > 0 ? totalTime / sorted.length : 1;
    totalPrice += sorted[sorted.length - 1].price * lastInterval;
    totalTime += lastInterval;
  }

  return totalTime > 0 ? totalPrice / totalTime : sorted[0]?.price ?? 0;
}

/**
 * 评估执行质量
 */
export function evaluateExecution(
  executions: TradeExecution[],
  benchmark: BenchmarkPrices,
  marketVolume: number = 0
): ExecutionQuality {
  const symbol = executions[0]?.symbol ?? '';
  const side = executions[0]?.side ?? 'buy';

  const totalQuantity = executions.reduce((s, e) => s + e.quantity, 0);
  const avgPrice = calculateVWAP(executions);

  const direction = side === 'buy' ? 1 : -1;

  const vwapSlippage = (avgPrice - benchmark.vwap) / benchmark.vwap * direction * 10000;
  const twapSlippage = (avgPrice - benchmark.twap) / benchmark.twap * direction * 10000;
  const arrivalSlippage = (avgPrice - benchmark.arrivalPrice) / benchmark.arrivalPrice * direction * 10000;
  const implementationShortfall = (avgPrice - benchmark.arrivalPrice) * totalQuantity * direction;

  const participationRate = marketVolume > 0 ? (totalQuantity / marketVolume) * 100 : 0;

  // Execution score: penalize slippage, reward tight spreads
  let score = 100;
  const avgSlippage = (Math.abs(vwapSlippage) + Math.abs(twapSlippage) + Math.abs(arrivalSlippage)) / 3;
  score -= avgSlippage * 2;
  score = Math.max(0, Math.min(100, score));

  return {
    symbol,
    side,
    totalQuantity,
    avgPrice: Math.round(avgPrice * 10000) / 10000,
    vwapSlippage: Math.round(vwapSlippage * 100) / 100,
    twapSlippage: Math.round(twapSlippage * 100) / 100,
    arrivalSlippage: Math.round(arrivalSlippage * 100) / 100,
    implementationShortfall: Math.round(implementationShortfall * 100) / 100,
    participationRate: Math.round(participationRate * 100) / 100,
    executionScore: Math.round(score * 10) / 10,
  };
}

/**
 * 汇总执行分析
 */
export function summarizeExecutions(executions: TradeExecution[]): ExecutionSummary {
  if (executions.length === 0) {
    return {
      trades: 0, totalVolume: 0, avgSlippageVWAP: 0, avgSlippageTWAP: 0,
      bestExecution: null, worstExecution: null, venueBreakdown: {},
    };
  }

  const vwap = calculateVWAP(executions);
  let totalSlippageVWAP = 0;
  let totalSlippageTWAP = 0;
  let bestExec = executions[0];
  let worstExec = executions[0];
  let bestSlippage = Infinity;
  let worstSlippage = -Infinity;

  const venueBreakdown: Record<string, { count: number; volume: number }> = {};

  for (const exec of executions) {
    const slip = Math.abs(exec.price - vwap);
    totalSlippageVWAP += slip;

    if (slip < bestSlippage) { bestSlippage = slip; bestExec = exec; }
    if (slip > worstSlippage) { worstSlippage = slip; worstExec = exec; }

    const venue = exec.venue ?? 'unknown';
    if (!venueBreakdown[venue]) venueBreakdown[venue] = { count: 0, volume: 0 };
    venueBreakdown[venue].count++;
    venueBreakdown[venue].volume += exec.quantity;
  }

  const twap = calculateTWAP(executions);
  totalSlippageTWAP = executions.reduce((s, e) => s + Math.abs(e.price - twap), 0);

  return {
    trades: executions.length,
    totalVolume: executions.reduce((s, e) => s + e.quantity, 0),
    avgSlippageVWAP: Math.round(totalSlippageVWAP / executions.length * 10000) / 10000,
    avgSlippageTWAP: Math.round(totalSlippageTWAP / executions.length * 10000) / 10000,
    bestExecution: bestExec,
    worstExecution: worstExec,
    venueBreakdown,
  };
}

/**
 * 时间切片分析
 */
export function analyzeTimeSlices(
  executions: TradeExecution[],
  intervalMs: number = 300000 // 5 min
): Array<{ startTime: number; endTime: number; volume: number; avgPrice: number; count: number }> {
  if (executions.length === 0) return [];

  const sorted = [...executions].sort((a, b) => a.timestamp - b.timestamp);
  const start = sorted[0].timestamp;
  const end = sorted[sorted.length - 1].timestamp;

  const slices: Array<{ startTime: number; endTime: number; volume: number; avgPrice: number; count: number }> = [];

  for (let t = start; t <= end; t += intervalMs) {
    const sliceExecs = sorted.filter(e => e.timestamp >= t && e.timestamp < t + intervalMs);
    if (sliceExecs.length === 0) continue;

    const volume = sliceExecs.reduce((s, e) => s + e.quantity, 0);
    const totalValue = sliceExecs.reduce((s, e) => s + e.price * e.quantity, 0);
    slices.push({
      startTime: t,
      endTime: t + intervalMs,
      volume,
      avgPrice: volume > 0 ? Math.round(totalValue / volume * 10000) / 10000 : 0,
      count: sliceExecs.length,
    });
  }

  return slices;
}
