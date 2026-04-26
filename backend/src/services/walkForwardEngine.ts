/**
 * Walk-Forward 回测引擎
 * 滚动窗口前进测试，避免过拟合
 */

export interface WalkForwardConfig {
  totalPeriods: number;
  inSampleRatio: number;    // 训练集占比
  stepSize: number;         // 滚动步长
  purgeGap: number;         // 清洗间隔（避免前瞻偏差）
}

export interface WalkForwardWindow {
  windowId: number;
  inSampleStart: number;
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
  inSampleReturn: number;
  outOfSampleReturn: number;
  inSampleSharpe: number;
  outOfSampleSharpe: number;
  maxDrawdown: number;
  trades: number;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  avgInSampleReturn: number;
  avgOutOfSampleReturn: number;
  efficiencyRatio: number;    // OOS/IS 效率比
  totalReturn: number;
  avgSharpe: number;
  robustnessScore: number;
  isOverfit: boolean;
}

export interface TradeRecord {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  direction: 'long' | 'short';
  pnl: number;
}

export interface StrategySignal {
  time: number;
  action: 'buy' | 'sell' | 'hold';
  price: number;
  confidence: number;
}

/**
 * 生成Walk-Forward窗口
 */
export function generateWalkForwardWindows(config: WalkForwardConfig): {
  inSample: [number, number];
  outOfSample: [number, number];
}[] {
  const { totalPeriods, inSampleRatio, stepSize, purgeGap } = config;
  const windowSize = Math.floor(totalPeriods * inSampleRatio);
  const windows: { inSample: [number, number]; outOfSample: [number, number] }[] = [];

  let start = 0;
  while (start + windowSize + purgeGap < totalPeriods) {
    const inSampleEnd = start + windowSize;
    const outOfSampleEnd = Math.min(inSampleEnd + stepSize + purgeGap, totalPeriods);

    windows.push({
      inSample: [start, inSampleEnd],
      outOfSample: [inSampleEnd + purgeGap, outOfSampleEnd],
    });

    start += stepSize;
  }

  return windows;
}

/**
 * 计算窗口收益
 */
export function computeWindowReturns(
  prices: number[],
  signals: StrategySignal[],
  startIdx: number,
  endIdx: number,
): { returns: number[]; trades: TradeRecord[] } {
  const windowPrices = prices.slice(startIdx, endIdx);
  const windowSignals = signals.filter(s => s.time >= startIdx && s.time < endIdx);

  const returns: number[] = [];
  const trades: TradeRecord[] = [];
  let position: { entryPrice: number; entryTime: number; direction: 'long' | 'short' } | null = null;

  for (let i = 1; i < windowPrices.length; i++) {
    const signal = windowSignals.find(s => s.time === startIdx + i);

    if (signal) {
      if (signal.action === 'buy' && !position) {
        position = { entryPrice: windowPrices[i], entryTime: startIdx + i, direction: 'long' };
      } else if (signal.action === 'sell' && position) {
        const pnl = position.direction === 'long'
          ? (windowPrices[i] - position.entryPrice) / position.entryPrice
          : (position.entryPrice - windowPrices[i]) / position.entryPrice;
        trades.push({
          entryTime: position.entryTime,
          exitTime: startIdx + i,
          entryPrice: position.entryPrice,
          exitPrice: windowPrices[i],
          direction: position.direction,
          pnl,
        });
        returns.push(pnl);
        position = null;
      }
    }

    if (position) {
      const dailyReturn = position.direction === 'long'
        ? (windowPrices[i] - windowPrices[i - 1]) / windowPrices[i - 1]
        : (windowPrices[i - 1] - windowPrices[i]) / windowPrices[i - 1];
      returns.push(dailyReturn);
    }
  }

  return { returns, trades };
}

/**
 * 计算Sharpe比率
 */
export function computeSharpeRatio(returns: number[], riskFreeRate = 0.02 / 252): number {
  if (returns.length < 2) return 0;

  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  return stdDev > 1e-10 ? (mean - riskFreeRate) / stdDev * Math.sqrt(252) : 0;
}

/**
 * 计算最大回撤
 */
export function computeMaxDrawdown(returns: number[]): number {
  if (returns.length === 0) return 0;

  let cumulative = 1;
  let peak = 1;
  let maxDD = 0;

  for (const r of returns) {
    cumulative *= (1 + r);
    peak = Math.max(peak, cumulative);
    maxDD = Math.max(maxDD, (peak - cumulative) / peak);
  }

  return maxDD;
}

/**
 * 执行Walk-Forward回测
 */
export function runWalkForwardBacktest(
  prices: number[],
  signals: StrategySignal[],
  config: WalkForwardConfig,
): WalkForwardResult {
  const windowsConfig = generateWalkForwardWindows(config);
  const windows: WalkForwardWindow[] = [];

  for (let i = 0; i < windowsConfig.length; i++) {
    const { inSample, outOfSample } = windowsConfig[i];

    const inSampleResult = computeWindowReturns(prices, signals, inSample[0], inSample[1]);
    const oosResult = computeWindowReturns(prices, signals, outOfSample[0], outOfSample[1]);

    windows.push({
      windowId: i,
      inSampleStart: inSample[0],
      inSampleEnd: inSample[1],
      outOfSampleStart: outOfSample[0],
      outOfSampleEnd: outOfSample[1],
      inSampleReturn: inSampleResult.returns.reduce((s, v) => s + v, 0),
      outOfSampleReturn: oosResult.returns.reduce((s, v) => s + v, 0),
      inSampleSharpe: computeSharpeRatio(inSampleResult.returns),
      outOfSampleSharpe: computeSharpeRatio(oosResult.returns),
      maxDrawdown: computeMaxDrawdown(oosResult.returns),
      trades: oosResult.trades.length,
    });
  }

  const avgInSampleReturn = windows.length > 0
    ? windows.reduce((s, w) => s + w.inSampleReturn, 0) / windows.length : 0;
  const avgOutOfSampleReturn = windows.length > 0
    ? windows.reduce((s, w) => s + w.outOfSampleReturn, 0) / windows.length : 0;

  const efficiencyRatio = avgInSampleReturn !== 0
    ? avgOutOfSampleReturn / avgInSampleReturn : 0;

  const totalReturn = windows.reduce((prod, w) => prod * (1 + w.outOfSampleReturn), 1) - 1;
  const avgSharpe = windows.length > 0
    ? windows.reduce((s, w) => s + w.outOfSampleSharpe, 0) / windows.length : 0;

  // 鲁棒性评分
  const sharpeConsistency = windows.filter(w => w.outOfSampleSharpe > 0).length / Math.max(1, windows.length);
  const returnDecay = avgInSampleReturn > 0 ? avgOutOfSampleReturn / avgInSampleReturn : 0;
  const robustnessScore = sharpeConsistency * 0.5 + Math.min(1, Math.max(0, returnDecay)) * 0.5;

  return {
    windows,
    avgInSampleReturn,
    avgOutOfSampleReturn,
    efficiencyRatio,
    totalReturn,
    avgSharpe,
    robustnessScore,
    isOverfit: efficiencyRatio < 0.3,
  };
}

/**
 * 计算最优参数稳定性
 */
export function parameterStability(
  paramSets: Record<string, number[]>,
  windowResults: WalkForwardWindow[],
): Record<string, { stability: number; drift: number }> {
  const result: Record<string, { stability: number; drift: number }> = {};

  for (const [param, values] of Object.entries(paramSets)) {
    if (values.length < 2) {
      result[param] = { stability: 1, drift: 0 };
      continue;
    }

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;

    // 漂移：前后半段均值差异
    const half = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const secondHalf = values.slice(half).reduce((s, v) => s + v, 0) / (values.length - half);
    const drift = firstHalf !== 0 ? Math.abs(secondHalf - firstHalf) / Math.abs(firstHalf) : 0;

    result[param] = { stability: Math.max(0, 1 - cv), drift };
  }

  return result;
}
