/**
 * Walk-Forward 回测引擎
 * 支持: 滚动窗口优化、样本外验证、参数稳定性分析
 */

export interface WalkForwardConfig {
  totalPeriods: number; // 总期数
  inSampleSize: number; // 训练集大小
  outSampleSize: number; // 测试集大小
  stepSize?: number; // 滚动步长 (默认=outSampleSize)
  purgeSize?: number; // 清洗窗口 (避免前视偏差)
}

export interface WalkForwardWindow {
  windowIndex: number;
  inSampleStart: number;
  inSampleEnd: number;
  outSampleStart: number;
  outSampleEnd: number;
}

export interface WalkForwardResult<Params> {
  windows: WalkForwardWindowResult<Params>[];
  overallMetrics: OutOfSampleMetrics;
  parameterStability: ParameterStability<Params>;
}

export interface WalkForwardWindowResult<Params> {
  window: WalkForwardWindow;
  optimalParams: Params;
  inSamplePerformance: PerformanceMetrics;
  outSamplePerformance: PerformanceMetrics;
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  numTrades: number;
}

export interface OutOfSampleMetrics {
  totalReturn: number;
  avgWindowReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgWinRate: number;
  efficiencyRatio: number; // OOS return / IS return
}

export interface ParameterStability<Params> {
  params: Params[];
  meanParams: { [K in keyof Params]?: number };
  stdParams: { [K in keyof Params]?: number };
  stabilityScore: number; // 0-1, 1=完全稳定
}

/**
 * 生成Walk-Forward窗口
 */
export function generateWalkForwardWindows(
  config: WalkForwardConfig
): WalkForwardWindow[] {
  const { totalPeriods, inSampleSize, outSampleSize, stepSize, purgeSize = 0 } = config;
  const step = stepSize ?? outSampleSize;
  const windows: WalkForwardWindow[] = [];

  let windowIndex = 0;
  let position = 0;

  while (position + inSampleSize + purgeSize + outSampleSize <= totalPeriods) {
    windows.push({
      windowIndex: windowIndex++,
      inSampleStart: position,
      inSampleEnd: position + inSampleSize - 1,
      outSampleStart: position + inSampleSize + purgeSize,
      outSampleEnd: position + inSampleSize + purgeSize + outSampleSize - 1
    });
    position += step;
  }

  return windows;
}

/**
 * 执行Walk-Forward回测
 * @param config Walk-Forward配置
 * @param optimizeFunc 参数优化函数: (start, end) => 最优参数
 * @param backtestFunc 回测函数: (start, end, params) => 绩效指标
 * @param extractParams 提取数值参数用于稳定性分析
 */
export function walkForwardBacktest<Params>(
  config: WalkForwardConfig,
  optimizeFunc: (start: number, end: number) => Params,
  backtestFunc: (start: number, end: number, params: Params) => PerformanceMetrics,
  extractParams: (params: Params) => { [key: string]: number }
): WalkForwardResult<Params> {
  const windows = generateWalkForwardWindows(config);
  const results: WalkForwardWindowResult<Params>[] = [];

  for (const window of windows) {
    // 样本内优化
    const optimalParams = optimizeFunc(window.inSampleStart, window.inSampleEnd);

    // 样本内回测
    const inSamplePerf = backtestFunc(window.inSampleStart, window.inSampleEnd, optimalParams);

    // 样本外回测
    const outSamplePerf = backtestFunc(window.outSampleStart, window.outSampleEnd, optimalParams);

    results.push({
      window,
      optimalParams,
      inSamplePerformance: inSamplePerf,
      outSamplePerformance: outSamplePerf
    });
  }

  // 汇总样本外绩效
  const oosMetrics = calculateOverallMetrics(results.map(r => r.outSamplePerformance));

  // 参数稳定性
  const paramsList = results.map(r => r.optimalParams);
  const stability = analyzeParameterStability(paramsList, extractParams);

  return {
    windows: results,
    overallMetrics: oosMetrics,
    parameterStability: stability
  };
}

/**
 * 计算滚动绩效指标
 */
export function calculateRollingMetrics(
  returns: number[],
  windowSize: number
): PerformanceMetrics[] {
  const results: PerformanceMetrics[] = [];

  for (let i = windowSize; i <= returns.length; i++) {
    const window = returns.slice(i - windowSize, i);
    results.push(calculatePerformanceMetrics(window));
  }

  return results;
}

/**
 * 从收益率序列计算绩效指标
 */
export function calculatePerformanceMetrics(
  returns: number[],
  annualizeFactor: number = 252
): PerformanceMetrics {
  const n = returns.length;
  if (n === 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, volatility: 0,
      sharpeRatio: 0, maxDrawdown: 0, winRate: 0,
      profitFactor: 0, numTrades: 0
    };
  }

  // 累计收益
  let cumReturn = 1;
  let peak = 1;
  let maxDD = 0;
  let wins = 0;
  let totalProfit = 0;
  let totalLoss = 0;

  const equity: number[] = [1];
  for (const r of returns) {
    cumReturn *= (1 + r);
    equity.push(cumReturn);

    if (cumReturn > peak) peak = cumReturn;
    const dd = (peak - cumReturn) / peak;
    if (dd > maxDD) maxDD = dd;

    if (r > 0) {
      wins++;
      totalProfit += r;
    } else {
      totalLoss += Math.abs(r);
    }
  }

  const totalReturn = cumReturn - 1;
  const annualizedReturn = (1 + totalReturn) ** (annualizeFactor / n) - 1;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1);
  const volatility = Math.sqrt(variance * annualizeFactor);
  const sharpe = volatility > 0 ? (mean * annualizeFactor) / volatility : 0;
  const winRate = n > 0 ? wins / n : 0;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  return {
    totalReturn,
    annualizedReturn,
    volatility,
    sharpeRatio: sharpe,
    maxDrawdown: maxDD,
    winRate,
    profitFactor,
    numTrades: n
  };
}

/**
 * 蒙特卡洛Walk-Forward (多次随机划分)
 */
export function monteCarloWalkForward<Params>(
  totalPeriods: number,
  numIterations: number,
  optimizeFunc: (start: number, end: number) => Params,
  backtestFunc: (start: number, end: number, params: Params) => PerformanceMetrics,
  trainRatio: number = 0.7
): { avgOOSReturn: number; stdOOSReturn: number; worstCase: number; bestCase: number } {
  const oosReturns: number[] = [];
  const trainSize = Math.floor(totalPeriods * trainRatio);

  for (let i = 0; i < numIterations; i++) {
    // 随机选择分割点
    const splitPoint = trainSize + Math.floor(Math.random() * (totalPeriods - trainSize - 1));
    const inSampleStart = Math.max(0, splitPoint - trainSize);

    const params = optimizeFunc(inSampleStart, splitPoint - 1);
    const oosPerf = backtestFunc(splitPoint, totalPeriods - 1, params);

    oosReturns.push(oosPerf.totalReturn);
  }

  const avg = oosReturns.reduce((a, b) => a + b, 0) / oosReturns.length;
  const std = Math.sqrt(oosReturns.reduce((a, r) => a + (r - avg) ** 2, 0) / (oosReturns.length - 1));

  return {
    avgOOSReturn: avg,
    stdOOSReturn: std,
    worstCase: Math.min(...oosReturns),
    bestCase: Math.max(...oosReturns)
  };
}

// ===== Helper Functions =====

function calculateOverallMetrics(
  performances: PerformanceMetrics[]
): OutOfSampleMetrics {
  if (performances.length === 0) {
    return {
      totalReturn: 0, avgWindowReturn: 0, annualizedReturn: 0,
      volatility: 0, sharpeRatio: 0, maxDrawdown: 0,
      avgWinRate: 0, efficiencyRatio: 0
    };
  }

  const returns = performances.map(p => p.totalReturn);
  const totalReturn = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const vol = Math.sqrt(returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (returns.length - 1));
  const maxDD = Math.max(...performances.map(p => p.maxDrawdown));
  const avgWinRate = performances.reduce((a, p) => a + p.winRate, 0) / performances.length;
  const sharpe = vol > 0 ? avgReturn / vol : 0;

  return {
    totalReturn,
    avgWindowReturn: avgReturn,
    annualizedReturn: totalReturn, // 简化
    volatility: vol,
    sharpeRatio: sharpe,
    maxDrawdown: maxDD,
    avgWinRate,
    efficiencyRatio: 1 // 需要IS数据对比
  };
}

function analyzeParameterStability<Params>(
  paramsList: Params[],
  extractParams: (p: Params) => { [key: string]: number }
): ParameterStability<Params> {
  if (paramsList.length === 0) {
    return {
      params: [],
      meanParams: {},
      stdParams: {},
      stabilityScore: 0
    };
  }

  const allNumeric = paramsList.map(extractParams);
  const keys = Object.keys(allNumeric[0]);

  const meanParams: { [key: string]: number } = {};
  const stdParams: { [key: string]: number } = {};

  let totalCV = 0;
  for (const key of keys) {
    const values = allNumeric.map(p => p[key]).filter(v => !isNaN(v));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1));
    meanParams[key] = mean;
    stdParams[key] = std;

    // 变异系数
    if (Math.abs(mean) > 1e-10) {
      totalCV += std / Math.abs(mean);
    }
  }

  const avgCV = keys.length > 0 ? totalCV / keys.length : 0;
  const stabilityScore = Math.max(0, 1 - avgCV);

  return {
    params: paramsList,
    meanParams,
    stdParams,
    stabilityScore
  };
}
