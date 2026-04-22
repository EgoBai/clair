/**
 * 均值回归策略引擎
 * 支持 Z-Score、Bollinger Bands RSI 极值、Keltner Channel 等均值回归方法
 */

export interface PricePoint {
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface MeanReversionSignal {
  date: string;
  type: 'buy' | 'sell' | 'hold';
  method: 'zscore' | 'bollinger' | 'rsi_extreme' | 'keltner' | 'composite';
  strength: number; // 0-100
  zScore: number;
  rsi: number;
  bbPosition: number; // -1 to 1, 0 = middle band
  keltnerPosition: number;
  confidence: number; // 0-100
}

export interface MeanReversionStats {
  meanReversionSpeed: number; // 半衰期（天）
  halfLife: number;
  hurstExponent: number;
  isMeanReverting: boolean;
  currentZScore: number;
  entryThreshold: number;
  exitThreshold: number;
  stopLossThreshold: number;
  avgReversionDays: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
}

export interface HalfLifeResult {
  halfLife: number;
  isMeanReverting: boolean;
  adfStatistic: number;
  pValue: number;
}

/**
 * 计算滚动均值和标准差
 */
export function rollingStats(
  values: number[],
  window: number
): { mean: number[]; std: number[]; zScore: number[] } {
  const mean: number[] = [];
  const std: number[] = [];
  const zScore: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      mean.push(NaN);
      std.push(NaN);
      zScore.push(NaN);
      continue;
    }
    const slice = values.slice(i - window + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / window;
    const variance = slice.reduce((a, b) => a + (b - avg) ** 2, 0) / window;
    const sd = Math.sqrt(variance);
    mean.push(avg);
    std.push(sd);
    zScore.push(sd === 0 ? 0 : (values[i] - avg) / sd);
  }

  return { mean, std, zScore };
}

/**
 * 计算 Z-Score（价格偏离均值的标准差数）
 */
export function calculateZScore(prices: number[], window: number = 20): number[] {
  return rollingStats(prices, window).zScore;
}

/**
 * 计算 Bollinger Bands 位置
 * 返回 -1（下轨）到 1（上轨）的值
 */
export function calculateBBPosition(
  prices: number[],
  window: number = 20,
  numStd: number = 2
): number[] {
  const { mean, std } = rollingStats(prices, window);
  const position: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (isNaN(mean[i]) || std[i] === 0) {
      position.push(NaN);
      continue;
    }
    const upper = mean[i] + numStd * std[i];
    const lower = mean[i] - numStd * std[i];
    const range = upper - lower;
    if (range === 0) {
      position.push(0);
    } else {
      position.push(((prices[i] - mean[i]) / (range / 2)));
    }
  }

  return position;
}

/**
 * 计算 RSI（相对强弱指标）
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];

  if (prices.length < period + 1) {
    return prices.map(() => NaN);
  }

  // 前 period 个值没有 RSI
  for (let i = 0; i < period; i++) {
    rsi.push(NaN);
  }

  let avgGain = 0;
  let avgLoss = 0;

  // 初始平均涨跌
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(100 - 100 / (1 + rs));

  // 后续使用平滑方法
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return rsi;
}

/**
 * 计算 Keltner Channel 位置
 */
export function calculateKeltnerPosition(
  data: PricePoint[],
  window: number = 20,
  atrMultiplier: number = 2
): number[] {
  const closes = data.map(d => d.close);
  const position: number[] = [];

  // 计算 EMA
  const ema: number[] = [];
  const multiplier = 2 / (window + 1);
  ema[0] = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema[i] = (closes[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  // 计算 ATR
  const atr = calculateATR(data, window);

  for (let i = 0; i < closes.length; i++) {
    if (i < window - 1 || isNaN(atr[i]) || atr[i] === 0) {
      position.push(NaN);
      continue;
    }
    const upper = ema[i] + atrMultiplier * atr[i];
    const lower = ema[i] - atrMultiplier * atr[i];
    const range = upper - lower;
    position.push(range === 0 ? 0 : ((closes[i] - ema[i]) / (range / 2)));
  }

  return position;
}

/**
 * 计算 ATR（平均真实波幅）
 */
function calculateATR(data: PricePoint[], period: number): number[] {
  const atr: number[] = [];

  if (data.length === 0) return atr;

  const tr: number[] = [data[0].high - data[0].low];
  for (let i = 1; i < data.length; i++) {
    const hl = data[i].high - data[i].low;
    const hc = Math.abs(data[i].high - data[i - 1].close);
    const lc = Math.abs(data[i].low - data[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }

  // 初始 ATR 为简单平均
  let sum = 0;
  for (let i = 0; i < period && i < tr.length; i++) {
    atr.push(NaN);
    sum += tr[i];
  }
  if (atr.length > 0) {
    atr[period - 1] = sum / period;
  }

  // 后续使用平滑
  for (let i = period; i < tr.length; i++) {
    atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
  }

  return atr;
}

/**
 * 计算 Hurst 指数（判断均值回归 vs 趋势）
 * H < 0.5: 均值回归
 * H = 0.5: 随机游走
 * H > 0.5: 趋势
 */
export function calculateHurstExponent(prices: number[], maxLag: number = 20): number {
  if (prices.length < maxLag * 2) return 0.5;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const lags: number[] = [];
  const rescaledRanges: number[] = [];

  for (let lag = 10; lag <= maxLag && lag < returns.length / 2; lag++) {
    const chunks = Math.floor(returns.length / lag);
    let avgRS = 0;

    for (let c = 0; c < chunks; c++) {
      const chunk = returns.slice(c * lag, (c + 1) * lag);
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;

      // 累积偏差
      let cumDev = 0;
      let maxCum = -Infinity;
      let minCum = Infinity;
      for (const val of chunk) {
        cumDev += val - mean;
        maxCum = Math.max(maxCum, cumDev);
        minCum = Math.min(minCum, cumDev);
      }
      const range = maxCum - minCum;

      // 标准差
      const std = Math.sqrt(chunk.reduce((a, b) => a + (b - mean) ** 2, 0) / chunk.length);

      if (std > 0) avgRS += range / std;
    }

    lags.push(Math.log(lag));
    rescaledRanges.push(Math.log(avgRS / chunks));
  }

  // 线性回归求斜率
  if (lags.length < 2) return 0.5;
  return linearRegressionSlope(lags, rescaledRanges);
}

/**
 * 线性回归斜率
 */
function linearRegressionSlope(x: number[], y: number[]): number {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * 计算均值回归半衰期
 * 使用 OLS 回归: ΔP(t) = α + β * P(t-1) + ε
 * 半衰期 = -ln(2) / ln(1 + β)
 */
export function calculateHalfLife(prices: number[]): HalfLifeResult {
  if (prices.length < 10) {
    return { halfLife: Infinity, isMeanReverting: false, adfStatistic: 0, pValue: 1 };
  }

  const laggedPrices = prices.slice(0, -1);
  const deltaPrices: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    deltaPrices.push(prices[i] - prices[i - 1]);
  }

  // OLS 回归: deltaPrices = α + β * laggedPrices
  const n = deltaPrices.length;
  const sumX = laggedPrices.reduce((a, b) => a + b, 0);
  const sumY = deltaPrices.reduce((a, b) => a + b, 0);
  const sumXY = laggedPrices.reduce((acc, x, i) => acc + x * deltaPrices[i], 0);
  const sumX2 = laggedPrices.reduce((acc, x) => acc + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) {
    return { halfLife: Infinity, isMeanReverting: false, adfStatistic: 0, pValue: 1 };
  }

  const beta = (n * sumXY - sumX * sumY) / denom;
  const alpha = (sumY - beta * sumX) / n;

  // 计算残差
  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    residuals.push(deltaPrices[i] - (alpha + beta * laggedPrices[i]));
  }

  // ADF 统计量近似
  const residualStd = Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / (n - 2));
  const seBeta = residualStd / Math.sqrt(sumX2 - sumX * sumX / n);
  const adfStatistic = beta / seBeta;

  // 半衰期
  const halfLife = beta >= 0 ? Infinity : -Math.log(2) / Math.log(1 + beta);

  return {
    halfLife: Math.abs(halfLife),
    isMeanReverting: beta < 0 && halfLife > 0 && halfLife < 100,
    adfStatistic,
    pValue: Math.abs(adfStatistic) > 2.5 ? 0.01 : Math.abs(adfStatistic) > 1.95 ? 0.05 : 0.1,
  };
}

/**
 * 生成均值回归信号
 */
export function generateMeanReversionSignals(
  data: PricePoint[],
  config: {
    zScoreWindow?: number;
    zScoreEntry?: number;
    zScoreExit?: number;
    rsiPeriod?: number;
    rsiOversold?: number;
    rsiOverbought?: number;
    bbWindow?: number;
    bbStd?: number;
    compositeWeight?: { zscore: number; rsi: number; bb: number; keltner: number };
  } = {}
): MeanReversionSignal[] {
  const {
    zScoreWindow = 20,
    zScoreEntry = 2,
    zScoreExit = 0.5,
    rsiPeriod = 14,
    rsiOversold = 30,
    rsiOverbought = 70,
    bbWindow = 20,
    bbStd = 2,
    compositeWeight = { zscore: 0.3, rsi: 0.25, bb: 0.25, keltner: 0.2 },
  } = config;

  const closes = data.map(d => d.close);
  const zScores = calculateZScore(closes, zScoreWindow);
  const rsi = calculateRSI(closes, rsiPeriod);
  const bbPos = calculateBBPosition(closes, bbWindow, bbStd);
  const keltnerPos = calculateKeltnerPosition(data);

  const signals: MeanReversionSignal[] = [];

  for (let i = 0; i < data.length; i++) {
    if (isNaN(zScores[i]) || isNaN(rsi[i]) || isNaN(bbPos[i])) continue;

    // 各指标信号
    let zSignal = 0;
    if (zScores[i] <= -zScoreEntry) zSignal = 1; // 超卖
    else if (zScores[i] >= zScoreEntry) zSignal = -1; // 超买
    else if (Math.abs(zScores[i]) <= zScoreExit) zSignal = 0;

    let rsiSignal = 0;
    if (rsi[i] <= rsiOversold) rsiSignal = 1;
    else if (rsi[i] >= rsiOverbought) rsiSignal = -1;

    let bbSignal = 0;
    if (bbPos[i] <= -0.8) bbSignal = 1;
    else if (bbPos[i] >= 0.8) bbSignal = -1;

    let keltnerSignal = 0;
    if (!isNaN(keltnerPos[i])) {
      if (keltnerPos[i] <= -0.8) keltnerSignal = 1;
      else if (keltnerPos[i] >= 0.8) keltnerSignal = -1;
    }

    // 综合信号
    const composite =
      zSignal * compositeWeight.zscore +
      rsiSignal * compositeWeight.rsi +
      bbSignal * compositeWeight.bb +
      keltnerSignal * compositeWeight.keltner;

    let type: MeanReversionSignal['type'] = 'hold';
    let method: MeanReversionSignal['method'] = 'composite';
    let strength = 0;

    if (composite >= 0.4) {
      type = 'buy';
      strength = Math.min(100, composite * 100);
      if (zSignal === 1) method = 'zscore';
      else if (rsiSignal === 1) method = 'rsi_extreme';
      else if (bbSignal === 1) method = 'bollinger';
      else if (keltnerSignal === 1) method = 'keltner';
    } else if (composite <= -0.4) {
      type = 'sell';
      strength = Math.min(100, Math.abs(composite) * 100);
      if (zSignal === -1) method = 'zscore';
      else if (rsiSignal === -1) method = 'rsi_extreme';
      else if (bbSignal === -1) method = 'bollinger';
      else if (keltnerSignal === -1) method = 'keltner';
    }

    // 置信度：多个指标一致时更高
    const agreementCount = [zSignal, rsiSignal, bbSignal, keltnerSignal].filter(
      s => s !== 0 && s === (composite > 0 ? 1 : composite < 0 ? -1 : 0)
    ).length;
    const confidence = Math.min(100, agreementCount * 25 + (agreementCount >= 3 ? 15 : 0));

    signals.push({
      date: data[i].date,
      type,
      method,
      strength: Math.round(strength),
      zScore: Math.round(zScores[i] * 100) / 100,
      rsi: Math.round(rsi[i] * 10) / 10,
      bbPosition: Math.round(bbPos[i] * 100) / 100,
      keltnerPosition: isNaN(keltnerPos[i]) ? 0 : Math.round(keltnerPos[i] * 100) / 100,
      confidence,
    });
  }

  return signals;
}

/**
 * 计算均值回归统计指标
 */
export function calculateMeanReversionStats(
  data: PricePoint[],
  window: number = 20
): MeanReversionStats {
  const closes = data.map(d => d.close);
  const halfLifeResult = calculateHalfLife(closes);
  const hurst = calculateHurstExponent(closes);
  const zScores = calculateZScore(closes, window);

  const currentZScore = zScores.length > 0 ? zScores[zScores.length - 1] : 0;

  // 计算平均回归天数
  const reversionDays: number[] = [];
  let inExtreme = false;
  let startDay = 0;
  for (let i = 0; i < zScores.length; i++) {
    if (isNaN(zScores[i])) continue;
    if (!inExtreme && Math.abs(zScores[i]) >= 2) {
      inExtreme = true;
      startDay = i;
    } else if (inExtreme && Math.abs(zScores[i]) < 0.5) {
      reversionDays.push(i - startDay);
      inExtreme = false;
    }
  }
  const avgReversionDays = reversionDays.length > 0
    ? reversionDays.reduce((a, b) => a + b, 0) / reversionDays.length
    : halfLifeResult.halfLife;

  // 模拟交易计算胜率和盈亏比
  const signals = generateMeanReversionSignals(data);
  let wins = 0;
  let losses = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  const returns: number[] = [];
  let inPosition = false;
  let entryPrice = 0;

  for (let i = 0; i < signals.length; i++) {
    if (signals[i].type === 'buy' && !inPosition) {
      inPosition = true;
      entryPrice = data[i].close;
    } else if (signals[i].type === 'sell' && inPosition) {
      inPosition = false;
      const ret = (data[i].close - entryPrice) / entryPrice;
      returns.push(ret);
      if (ret > 0) {
        wins++;
        totalProfit += ret;
      } else {
        losses++;
        totalLoss += Math.abs(ret);
      }
    }
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  // Sharpe Ratio
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdReturn = returns.length > 1
    ? Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length)
    : 1;
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

  return {
    meanReversionSpeed: halfLifeResult.halfLife,
    halfLife: halfLifeResult.halfLife,
    hurstExponent: Math.round(hurst * 1000) / 1000,
    isMeanReverting: halfLifeResult.isMeanReverting && hurst < 0.5,
    currentZScore: Math.round(currentZScore * 100) / 100,
    entryThreshold: 2,
    exitThreshold: 0.5,
    stopLossThreshold: 3,
    avgReversionDays: Math.round(avgReversionDays * 10) / 10,
    winRate: Math.round(winRate * 10) / 10,
    profitFactor: Math.round(profitFactor * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
  };
}

/**
 * 计算 Ornstein-Uhlenbeck 过程参数
 * dX = θ(μ - X)dt + σdW
 */
export function fitOUProcess(prices: number[]): {
  theta: number; // 回归速度
  mu: number;    // 长期均值
  sigma: number; // 波动率
  halfLife: number;
} {
  if (prices.length < 10) {
    return { theta: 0, mu: 0, sigma: 0, halfLife: Infinity };
  }

  const halfLifeResult = calculateHalfLife(prices);
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(prices[i] - prices[i - 1]);
  }

  const mu = prices.reduce((a, b) => a + b, 0) / prices.length;
  const sigma = Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length);
  const theta = halfLifeResult.halfLife > 0 && halfLifeResult.halfLife < Infinity
    ? Math.log(2) / halfLifeResult.halfLife
    : 0;

  return {
    theta: Math.round(theta * 10000) / 10000,
    mu: Math.round(mu * 100) / 100,
    sigma: Math.round(sigma * 10000) / 10000,
    halfLife: Math.round(halfLifeResult.halfLife * 10) / 10,
  };
}

/**
 * 计算最优均值回归参数
 */
export function optimizeMeanReversionParams(
  data: PricePoint[],
  paramRanges: {
    windows?: number[];
    entryThresholds?: number[];
    exitThresholds?: number[];
  } = {}
): {
  optimalWindow: number;
  optimalEntry: number;
  optimalExit: number;
  bestSharpe: number;
  results: { window: number; entry: number; exit: number; sharpe: number }[];
} {
  const {
    windows = [10, 15, 20, 25, 30],
    entryThresholds = [1.5, 2, 2.5, 3],
    exitThresholds = [0.3, 0.5, 0.8, 1],
  } = paramRanges;

  const results: { window: number; entry: number; exit: number; sharpe: number }[] = [];
  let bestSharpe = -Infinity;
  let optimalWindow = 20;
  let optimalEntry = 2;
  let optimalExit = 0.5;

  for (const window of windows) {
    for (const entry of entryThresholds) {
      for (const exit of exitThresholds) {
        const stats = calculateMeanReversionStats(data, window);
        results.push({ window, entry, exit, sharpe: stats.sharpeRatio });
        if (stats.sharpeRatio > bestSharpe) {
          bestSharpe = stats.sharpeRatio;
          optimalWindow = window;
          optimalEntry = entry;
          optimalExit = exit;
        }
      }
    }
  }

  return { optimalWindow, optimalEntry, optimalExit, bestSharpe, results };
}
