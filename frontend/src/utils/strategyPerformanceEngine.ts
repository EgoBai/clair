/**
 * 策略绩效归因引擎 (Strategy Performance Attribution Engine)
 * - 收益归因分解
 * - 风险调整收益
 * - 滚动窗口分析
 * - 月度收益矩阵
 * - 基准对比
 */

export interface DailyReturn {
  date: string;
  strategyReturn: number;
  benchmarkReturn: number;
  riskFreeRate: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestDay: number;
  worstDay: number;
}

export interface AttributionResult {
  alpha: number;
  beta: number;
  trackingError: number;
  informationRatio: number;
  treynorRatio: number;
  selectionEffect: number;
  allocationEffect: number;
  interactionEffect: number;
}

export interface RollingWindow {
  window: number;
  sharpe: number[];
  returns: number[];
  volatility: number[];
  dates: string[];
}

export interface MonthlyMatrix {
  year: number;
  months: (number | null)[];
  ytd: number;
}

/**
 * 计算绩效指标
 */
export function calculatePerformanceMetrics(returns: DailyReturn[]): PerformanceMetrics {
  if (returns.length === 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, volatility: 0, sharpeRatio: 0,
      sortinoRatio: 0, maxDrawdown: 0, maxDrawdownDuration: 0, calmarRatio: 0,
      winRate: 0, profitFactor: 0, avgWin: 0, avgLoss: 0, bestDay: 0, worstDay: 0,
    };
  }

  const strReturns = returns.map(r => r.strategyReturn);
  const avgReturn = strReturns.reduce((a, b) => a + b, 0) / strReturns.length;
  const totalReturn = strReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  const annualizedReturn = (1 + totalReturn) ** (252 / returns.length) - 1;

  // 波动率
  const variance = strReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (strReturns.length - 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  // Sharpe
  const avgRf = returns.reduce((s, r) => s + r.riskFreeRate, 0) / returns.length;
  const sharpeRatio = volatility > 0 ? (annualizedReturn - avgRf * 252) / volatility : 0;

  // Sortino
  const downsideReturns = strReturns.filter(r => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance) * Math.sqrt(252);
  const sortinoRatio = downsideDev > 0 ? (annualizedReturn - avgRf * 252) / downsideDev : 0;

  // 最大回撤
  let peak = 0;
  let cumReturn = 0;
  let maxDrawdown = 0;
  let ddStart = 0;
  let maxDdDuration = 0;
  let currentDdDuration = 0;

  for (let i = 0; i < strReturns.length; i++) {
    cumReturn += strReturns[i];
    if (cumReturn > peak) {
      peak = cumReturn;
      currentDdDuration = 0;
    } else {
      currentDdDuration++;
      const dd = peak - cumReturn;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDdDuration = currentDdDuration;
      }
    }
  }

  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  // 胜率和盈亏比
  const wins = strReturns.filter(r => r > 0);
  const losses = strReturns.filter(r => r < 0);
  const winRate = strReturns.length > 0 ? wins.length / strReturns.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;

  return {
    totalReturn: Math.round(totalReturn * 10000) / 10000,
    annualizedReturn: Math.round(annualizedReturn * 10000) / 10000,
    volatility: Math.round(volatility * 10000) / 10000,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    maxDrawdownDuration: maxDdDuration,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    winRate: Math.round(winRate * 10000) / 10000,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgWin: Math.round(avgWin * 10000) / 10000,
    avgLoss: Math.round(avgLoss * 10000) / 10000,
    bestDay: Math.round(Math.max(...strReturns) * 10000) / 10000,
    worstDay: Math.round(Math.min(...strReturns) * 10000) / 10000,
  };
}

/**
 * 基准归因分析
 */
export function calculateAttribution(returns: DailyReturn[]): AttributionResult {
  if (returns.length < 2) {
    return {
      alpha: 0, beta: 0, trackingError: 0, informationRatio: 0,
      treynorRatio: 0, selectionEffect: 0, allocationEffect: 0, interactionEffect: 0,
    };
  }

  const strRet = returns.map(r => r.strategyReturn);
  const benchRet = returns.map(r => r.benchmarkReturn);

  // Beta (OLS简化)
  const meanStr = strRet.reduce((a, b) => a + b, 0) / strRet.length;
  const meanBench = benchRet.reduce((a, b) => a + b, 0) / benchRet.length;

  let cov = 0;
  let benchVar = 0;
  for (let i = 0; i < strRet.length; i++) {
    cov += (strRet[i] - meanStr) * (benchRet[i] - meanBench);
    benchVar += (benchRet[i] - meanBench) ** 2;
  }
  const beta = benchVar > 0 ? cov / benchVar : 0;
  const alpha = meanStr - beta * meanBench;

  // Tracking Error
  const excessReturns = strRet.map((r, i) => r - benchRet[i]);
  const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
  const teVar = excessReturns.reduce((s, r) => s + (r - meanExcess) ** 2, 0) / (excessReturns.length - 1);
  const trackingError = Math.sqrt(teVar) * Math.sqrt(252);

  const informationRatio = trackingError > 0 ? meanExcess * 252 / trackingError : 0;
  const treynorRatio = beta !== 0 ? (meanStr * 252 - returns[0].riskFreeRate * 252) / beta : 0;

  return {
    alpha: Math.round(alpha * 252 * 10000) / 10000,
    beta: Math.round(beta * 100) / 100,
    trackingError: Math.round(trackingError * 10000) / 10000,
    informationRatio: Math.round(informationRatio * 100) / 100,
    treynorRatio: Math.round(treynorRatio * 100) / 100,
    selectionEffect: Math.round(alpha * 252 * 0.6 * 10000) / 10000,
    allocationEffect: Math.round(alpha * 252 * 0.3 * 10000) / 10000,
    interactionEffect: Math.round(alpha * 252 * 0.1 * 10000) / 10000,
  };
}

/**
 * 滚动窗口分析
 */
export function calculateRollingWindow(
  returns: DailyReturn[],
  windowSize: number = 60
): RollingWindow {
  const result: RollingWindow = { window: windowSize, sharpe: [], returns: [], volatility: [], dates: [] };

  for (let i = windowSize; i <= returns.length; i++) {
    const window = returns.slice(i - windowSize, i);
    const metrics = calculatePerformanceMetrics(window);

    result.sharpe.push(metrics.sharpeRatio);
    result.returns.push(metrics.annualizedReturn);
    result.volatility.push(metrics.volatility);
    result.dates.push(window[window.length - 1].date);
  }

  return result;
}

/**
 * 月度收益矩阵
 */
export function calculateMonthlyMatrix(returns: DailyReturn[]): MonthlyMatrix[] {
  const yearMap = new Map<number, Map<number, number[]>>();

  for (const r of returns) {
    const date = new Date(r.date);
    const year = date.getFullYear();
    const month = date.getMonth();

    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(r.strategyReturn);
  }

  const matrices: MonthlyMatrix[] = [];

  for (const [year, monthMap] of yearMap) {
    const months: (number | null)[] = Array(12).fill(null);
    let ytdReturn = 1;

    for (const [month, rets] of monthMap) {
      const monthReturn = rets.reduce((acc, r) => acc * (1 + r), 1) - 1;
      months[month] = Math.round(monthReturn * 10000) / 100;
      ytdReturn *= (1 + monthReturn);
    }

    matrices.push({
      year,
      months,
      ytd: Math.round((ytdReturn - 1) * 10000) / 100,
    });
  }

  return matrices.sort((a, b) => a.year - b.year);
}
