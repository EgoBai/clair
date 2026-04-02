/**
 * 统计套利引擎
 * 基于协整关系和均值回归的配对交易信号生成
 */

export interface StatArbConfig {
  lookbackPeriod: number;       // 回看窗口（天）
  entryZScore: number;          // 入场Z-score阈值
  exitZScore: number;           // 出场Z-score阈值
  halfLifePeriod: number;       // 半衰期（天）
  minCorrelation: number;       // 最小相关系数
  maxPositionDays: number;      // 最大持仓天数
}

export interface PricePair {
  symbolA: string;
  symbolB: string;
  pricesA: number[];
  pricesB: number[];
  timestamps: number[];
}

export interface SpreadAnalysis {
  spread: number[];
  mean: number;
  stdDev: number;
  zScore: number[];
  halfLife: number;
  hurstExponent: number;
  isStationary: boolean;
}

export interface StatArbSignal {
  symbolA: string;
  symbolB: string;
  direction: 'long_spread' | 'short_spread' | 'exit';
  zScore: number;
  confidence: number;
  expectedHalfLife: number;
  hedgeRatio: number;
  timestamp: number;
}

const DEFAULT_CONFIG: StatArbConfig = {
  lookbackPeriod: 60,
  entryZScore: 2.0,
  exitZScore: 0.5,
  halfLifePeriod: 20,
  minCorrelation: 0.7,
  maxPositionDays: 30,
};

/**
 * 计算对数收益率
 */
export function computeLogReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] <= 0 || prices[i] <= 0) {
      returns.push(0);
    } else {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

/**
 * OLS回归计算对冲比率 (Y = alpha + beta * X)
 */
export function computeHedgeRatio(x: number[], y: number[]): { alpha: number; beta: number; rSquared: number } {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { alpha: 0, beta: 1, rSquared: 0 };

  const sumX = x.slice(0, n).reduce((s, v) => s + v, 0);
  const sumY = y.slice(0, n).reduce((s, v) => s + v, 0);
  const sumXY = x.slice(0, n).reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = x.slice(0, n).reduce((s, v) => s + v * v, 0);
  const sumY2 = y.slice(0, n).reduce((s, v) => s + v * v, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) return { alpha: 0, beta: 1, rSquared: 0 };

  const beta = (n * sumXY - sumX * sumY) / denominator;
  const alpha = (sumY - beta * sumX) / n;

  // R-squared
  const meanY = sumY / n;
  const ssTotal = y.slice(0, n).reduce((s, v) => s + (v - meanY) ** 2, 0);
  const ssResidual = y.slice(0, n).reduce((s, v, i) => s + (v - (alpha + beta * x[i])) ** 2, 0);
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { alpha, beta, rSquared };
}

/**
 * 计算价差序列
 */
export function computeSpread(pricesA: number[], pricesB: number[], hedgeRatio: number): number[] {
  const n = Math.min(pricesA.length, pricesB.length);
  const spread: number[] = [];
  for (let i = 0; i < n; i++) {
    spread.push(pricesA[i] - hedgeRatio * pricesB[i]);
  }
  return spread;
}

/**
 * 计算Z-score序列
 */
export function computeZScores(spread: number[], windowSize: number): number[] {
  if (spread.length < windowSize) return [];
  const zScores: number[] = [];

  for (let i = windowSize - 1; i < spread.length; i++) {
    const window = spread.slice(i - windowSize + 1, i + 1);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
    const stdDev = Math.sqrt(variance);
    zScores.push(stdDev > 1e-10 ? (spread[i] - mean) / stdDev : 0);
  }
  return zScores;
}

/**
 * 估计半衰期 (AR(1)模型)
 */
export function estimateHalfLife(spread: number[]): number {
  if (spread.length < 3) return 0;

  const y = spread.slice(1);
  const x = spread.slice(0, -1);
  const { beta } = computeHedgeRatio(x, y);

  if (beta >= 1) return Infinity;
  if (beta <= 0) return 1;

  return Math.ceil(-Math.log(2) / Math.log(beta));
}

/**
 * 计算Hurst指数 (R/S分析法)
 */
export function computeHurstExponent(series: number[], maxLag?: number): number {
  const n = series.length;
  if (n < 20) return 0.5;

  const lag = maxLag || Math.min(Math.floor(n / 2), 100);
  const logRS: number[] = [];
  const logN: number[] = [];

  for (let k = 10; k <= lag; k++) {
    const numChunks = Math.floor(n / k);
    if (numChunks < 1) continue;

    let avgRS = 0;
    for (let c = 0; c < numChunks; c++) {
      const chunk = series.slice(c * k, (c + 1) * k);
      const mean = chunk.reduce((s, v) => s + v, 0) / k;
      let cumDev = 0;
      let maxCum = -Infinity;
      let minCum = Infinity;

      for (const v of chunk) {
        cumDev += v - mean;
        maxCum = Math.max(maxCum, cumDev);
        minCum = Math.min(minCum, cumDev);
      }

      const range = maxCum - minCum;
      const stdDev = Math.sqrt(chunk.reduce((s, v) => s + (v - mean) ** 2, 0) / k);
      avgRS += stdDev > 0 ? range / stdDev : 0;
    }
    avgRS /= numChunks;

    if (avgRS > 0) {
      logRS.push(Math.log(avgRS));
      logN.push(Math.log(k));
    }
  }

  if (logN.length < 2) return 0.5;
  const { beta } = computeHedgeRatio(logN, logRS);
  return Math.max(0, Math.min(1, beta));
}

/**
 * ADF检验简化版 (单位根检验)
 */
export function adfTest(series: number[]): { statistic: number; isStationary: boolean } {
  if (series.length < 10) return { statistic: 0, isStationary: false };

  const diff = series.slice(1).map((v, i) => v - series[i]);
  const lagged = series.slice(0, -1);
  const { beta, rSquared } = computeHedgeRatio(lagged, diff);

  const n = diff.length;
  const se = Math.sqrt((1 - rSquared) / (n - 2)) * Math.sqrt(
    diff.reduce((s, v) => s + v ** 2, 0) / n / lagged.reduce((s, v) => s + v ** 2, 0) * n
  );

  const statistic = se > 0 ? beta / se : 0;
  // 1% critical value approx -3.43
  return { statistic, isStationary: statistic < -3.43 };
}

/**
 * 综合价差分析
 */
export function analyzeSpread(pricesA: number[], pricesB: number[], config?: Partial<StatArbConfig>): SpreadAnalysis {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { beta: hedgeRatio } = computeHedgeRatio(pricesA, pricesB);
  const spread = computeSpread(pricesA, pricesB, hedgeRatio);
  const zScore = computeZScores(spread, cfg.lookbackPeriod);
  const halfLife = estimateHalfLife(spread);
  const hurstExponent = computeHurstExponent(spread);
  const adf = adfTest(spread);

  const mean = spread.reduce((s, v) => s + v, 0) / spread.length;
  const variance = spread.reduce((s, v) => s + (v - mean) ** 2, 0) / spread.length;
  const stdDev = Math.sqrt(variance);

  return { spread, mean, stdDev, zScore, halfLife, hurstExponent, isStationary: adf.isStationary };
}

/**
 * 生成统计套利信号
 */
export function generateStatArbSignal(pair: PricePair, config?: Partial<StatArbConfig>): StatArbSignal | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const analysis = analyzeSpread(pair.pricesA, pair.pricesB, cfg);

  if (analysis.zScore.length === 0) return null;

  const latestZScore = analysis.zScore[analysis.zScore.length - 1];
  const { beta: hedgeRatio, rSquared } = computeHedgeRatio(pair.pricesA, pair.pricesB);

  if (rSquared < cfg.minCorrelation * cfg.minCorrelation) return null;

  let direction: StatArbSignal['direction'];
  if (latestZScore > cfg.entryZScore) {
    direction = 'short_spread';
  } else if (latestZScore < -cfg.entryZScore) {
    direction = 'long_spread';
  } else if (Math.abs(latestZScore) < cfg.exitZScore) {
    direction = 'exit';
  } else {
    return null;
  }

  const confidence = Math.min(1, Math.abs(latestZScore) / 3) *
    (analysis.isStationary ? 1 : 0.5) *
    Math.min(1, rSquared);

  return {
    symbolA: pair.symbolA,
    symbolB: pair.symbolB,
    direction,
    zScore: latestZScore,
    confidence,
    expectedHalfLife: analysis.halfLife,
    hedgeRatio,
    timestamp: pair.timestamps[pair.timestamps.length - 1],
  };
}

/**
 * 批量扫描配对
 */
export function scanPairs(pairs: PricePair[], config?: Partial<StatArbConfig>): StatArbSignal[] {
  const signals: StatArbSignal[] = [];
  for (const pair of pairs) {
    const signal = generateStatArbSignal(pair, config);
    if (signal) signals.push(signal);
  }
  return signals.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}
