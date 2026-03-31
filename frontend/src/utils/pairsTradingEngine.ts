/**
 * 配对交易引擎
 * 支持: 协整检验、价差建模、Z-Score信号、半衰期计算
 */

export interface PairData {
  symbolA: string;
  symbolB: string;
  pricesA: number[];
  pricesB: number[];
}

export interface CointegrationResult {
  isCointegrated: boolean;
  hedgeRatio: number;
  spreadMean: number;
  spreadStd: number;
  adfStatistic: number;
  adfCriticalValue: number;
  halfLife: number;
  hurstExponent: number;
  pValue: number;
}

export interface SpreadSignal {
  index: number;
  zScore: number;
  signal: 'long' | 'short' | 'exit' | 'hold';
  spread: number;
  hedgeRatio: number;
}

export interface PairsBacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  numTrades: number;
  winRate: number;
  avgHoldingPeriod: number;
  signals: SpreadSignal[];
}

export interface PairRanking {
  pair: PairData;
  cointegration: CointegrationResult;
  score: number; // 综合评分
}

/**
 * 计算最优对冲比率 (OLS回归)
 */
export function calculateHedgeRatio(pricesA: number[], pricesB: number[]): number {
  const n = Math.min(pricesA.length, pricesB.length);
  if (n < 2) return 1;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += pricesB[i];
    sumY += pricesA[i];
    sumXY += pricesB[i] * pricesA[i];
    sumX2 += pricesB[i] * pricesB[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return 1;

  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * 计算价差序列
 */
export function calculateSpread(
  pricesA: number[],
  pricesB: number[],
  hedgeRatio: number
): number[] {
  const n = Math.min(pricesA.length, pricesB.length);
  const spread: number[] = [];
  for (let i = 0; i < n; i++) {
    spread.push(pricesA[i] - hedgeRatio * pricesB[i]);
  }
  return spread;
}

/**
 * 协整性检验 (ADF检验简化版)
 */
export function testCointegration(
  pricesA: number[],
  pricesB: number[],
  criticalValue: number = -3.4
): CointegrationResult {
  const hedgeRatio = calculateHedgeRatio(pricesA, pricesB);
  const spread = calculateSpread(pricesA, pricesB, hedgeRatio);

  const n = spread.length;
  if (n < 20) {
    return {
      isCointegrated: false,
      hedgeRatio,
      spreadMean: 0,
      spreadStd: 0,
      adfStatistic: 0,
      adfCriticalValue: criticalValue,
      halfLife: 0,
      hurstExponent: 0.5,
      pValue: 1
    };
  }

  const mean = spread.reduce((a, b) => a + b, 0) / n;
  const variance = spread.reduce((a, s) => a + (s - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  // ADF检验: Δspread_t = α + β*spread_{t-1} + ε
  const deltaY: number[] = [];
  const laggedY: number[] = [];
  for (let i = 1; i < n; i++) {
    deltaY.push(spread[i] - spread[i - 1]);
    laggedY.push(spread[i - 1]);
  }

  const m = deltaY.length;
  let sumLag = 0, sumDelta = 0, sumLagDelta = 0, sumLag2 = 0;
  for (let i = 0; i < m; i++) {
    sumLag += laggedY[i];
    sumDelta += deltaY[i];
    sumLagDelta += laggedY[i] * deltaY[i];
    sumLag2 += laggedY[i] * laggedY[i];
  }

  const denom = m * sumLag2 - sumLag * sumLag;
  const beta = Math.abs(denom) > 1e-10 ? (m * sumLagDelta - sumLag * sumDelta) / denom : 0;

  // 残差标准差
  const alpha = (sumDelta - beta * sumLag) / m;
  const residuals: number[] = [];
  for (let i = 0; i < m; i++) {
    residuals.push(deltaY[i] - alpha - beta * laggedY[i]);
  }
  const resStd = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / (m - 2));

  // SE(β)
  const seBeta = Math.abs(denom) > 1e-10 ? resStd / Math.sqrt(sumLag2 - sumLag * sumLag / m) : 1;
  const adfStatistic = seBeta > 0 ? beta / seBeta : 0;

  // 半衰期
  const halfLife = beta < 0 ? -Math.log(2) / beta : Infinity;

  // Hurst指数 (简化)
  const hurstExponent = calculateHurst(spread);

  // p值 (简化: 基于统计量)
  const pValue = adfStatistic < criticalValue ? 0.01 : 0.5;

  return {
    isCointegrated: adfStatistic < criticalValue,
    hedgeRatio,
    spreadMean: mean,
    spreadStd: std,
    adfStatistic,
    adfCriticalValue: criticalValue,
    halfLife: Math.min(halfLife, 1000),
    hurstExponent,
    pValue
  };
}

/**
 * 生成交易信号
 */
export function generateSpreadSignals(
  spread: number[],
  mean: number,
  std: number,
  entryZScore: number = 2.0,
  exitZScore: number = 0.5,
  hedgeRatio: number = 1
): SpreadSignal[] {
  const signals: SpreadSignal[] = [];
  let position: 'long' | 'short' | null = null;

  for (let i = 0; i < spread.length; i++) {
    const zScore = std > 0 ? (spread[i] - mean) / std : 0;
    let signal: SpreadSignal['signal'] = 'hold';

    if (position === null) {
      if (zScore < -entryZScore) {
        signal = 'long'; // 价差过低，做多A做空B
        position = 'long';
      } else if (zScore > entryZScore) {
        signal = 'short'; // 价差过高，做空A做多B
        position = 'short';
      }
    } else if (position === 'long') {
      if (zScore >= -exitZScore) {
        signal = 'exit';
        position = null;
      }
    } else if (position === 'short') {
      if (zScore <= exitZScore) {
        signal = 'exit';
        position = null;
      }
    }

    signals.push({ index: i, zScore, signal, spread: spread[i], hedgeRatio });
  }

  return signals;
}

/**
 * 配对交易回测
 */
export function backtestPairs(
  pricesA: number[],
  pricesB: number[],
  cointegration: CointegrationResult,
  entryZScore: number = 2.0,
  exitZScore: number = 0.5
): PairsBacktestResult {
  const spread = calculateSpread(pricesA, pricesB, cointegration.hedgeRatio);
  const signals = generateSpreadSignals(
    spread,
    cointegration.spreadMean,
    cointegration.spreadStd,
    entryZScore,
    exitZScore,
    cointegration.hedgeRatio
  );

  // 计算收益
  let totalReturn = 0;
  let numTrades = 0;
  let wins = 0;
  let holdingPeriods: number[] = [];
  let entryIndex = 0;
  let entrySpread = 0;
  let position: 'long' | 'short' | null = null;

  const dailyReturns: number[] = [];

  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];

    if (s.signal === 'long' || s.signal === 'short') {
      position = s.signal;
      entryIndex = i;
      entrySpread = s.spread;
    } else if (s.signal === 'exit' && position) {
      const pnl = position === 'long'
        ? (s.spread - entrySpread) / Math.abs(entrySpread)
        : (entrySpread - s.spread) / Math.abs(entrySpread);

      totalReturn += pnl;
      numTrades++;
      if (pnl > 0) wins++;
      holdingPeriods.push(i - entryIndex);
      position = null;
    }

    // 日收益
    if (i > 0) {
      const dailyR = (signals[i].spread - signals[i - 1].spread) / Math.abs(signals[i - 1].spread || 1);
      dailyReturns.push(position === 'long' ? dailyR : position === 'short' ? -dailyR : 0);
    }
  }

  const mean = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const std = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (dailyReturns.length - 1))
    : 0;
  const sharpe = std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : 0;

  // 最大回撤
  let peak = 0;
  let cumReturn = 0;
  let maxDD = 0;
  for (const r of dailyReturns) {
    cumReturn += r;
    if (cumReturn > peak) peak = cumReturn;
    const dd = peak - cumReturn;
    if (dd > maxDD) maxDD = dd;
  }

  const avgHolding = holdingPeriods.length > 0
    ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length
    : 0;

  return {
    totalReturn,
    annualizedReturn: totalReturn * 252 / Math.max(spread.length, 1),
    sharpeRatio: sharpe,
    maxDrawdown: maxDD,
    numTrades,
    winRate: numTrades > 0 ? wins / numTrades : 0,
    avgHoldingPeriod: avgHolding,
    signals
  };
}

/**
 * 排序配对 (筛选最佳交易对)
 */
export function rankPairs(
  pairs: PairData[],
  maxHalfLife: number = 60,
  minHurstDivergence: number = 0.3
): PairRanking[] {
  const rankings: PairRanking[] = [];

  for (const pair of pairs) {
    const ci = testCointegration(pair.pricesA, pair.pricesB);

    // 综合评分:
    // - 协整性 (ADF < critical)
    // - 半衰期适中 (5-60天)
    // - Hurst < 0.5 (均值回归)
    let score = 0;
    if (ci.isCointegrated) score += 40;
    if (ci.halfLife > 5 && ci.halfLife < maxHalfLife) score += 20;
    if (ci.hurstExponent < 0.5) score += 20;
    score += Math.max(0, (ci.hurstExponent - 0.5) * -40); // Hurst越低越好
    score += Math.min(20, Math.abs(ci.adfStatistic) * 2);

    rankings.push({ pair, cointegration: ci, score });
  }

  return rankings.sort((a, b) => b.score - a.score);
}

// ===== Helper =====

function calculateHurst(prices: number[]): number {
  if (prices.length < 20) return 0.5;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (Math.abs(prices[i - 1]) > 1e-10) {
      returns.push(prices[i] - prices[i - 1]);
    }
  }

  const lags: number[] = [];
  const rsValues: number[] = [];

  for (let lag = 5; lag <= 20 && lag < returns.length / 2; lag++) {
    const chunks = Math.floor(returns.length / lag);
    let totalRS = 0;

    for (let c = 0; c < chunks; c++) {
      const chunk = returns.slice(c * lag, (c + 1) * lag);
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      let cumDev = 0, maxC = -Infinity, minC = Infinity;
      for (const v of chunk) {
        cumDev += v - mean;
        maxC = Math.max(maxC, cumDev);
        minC = Math.min(minC, cumDev);
      }
      const range = maxC - minC;
      const std = Math.sqrt(chunk.reduce((a, v) => a + (v - mean) ** 2, 0) / chunk.length);
      if (std > 1e-10) totalRS += range / std;
    }

    lags.push(Math.log(lag));
    rsValues.push(Math.log(totalRS / chunks));
  }

  if (lags.length < 2) return 0.5;

  const n = lags.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += lags[i];
    sumY += rsValues[i];
    sumXY += lags[i] * rsValues[i];
    sumX2 += lags[i] * lags[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return 0.5;
  return Math.max(0, Math.min(1, (n * sumXY - sumX * sumY) / denom));
}
