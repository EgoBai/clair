/**
 * Statistical Arbitrage & Pairs Trading Engine
 * 统计套利与配对交易引擎
 */

export interface PriceSeries {
  symbol: string;
  prices: number[];
  timestamps: number[];
}

export interface PairResult {
  symbol1: string;
  symbol2: string;
  correlation: number;
  cointegrationScore: number;
  halfLife: number;
  hedgeRatio: number;
  spread: number[];
  zScore: number[];
  isStationary: boolean;
  adfStatistic: number;
}

export interface PairsSignal {
  timestamp: number;
  pair: string;
  action: 'enter_long_short' | 'enter_short_long' | 'exit' | 'hold';
  zScore: number;
  confidence: number;
  expectedReturn: number;
}

export interface MeanReversionResult {
  symbol: string;
  mean: number;
  std: number;
  currentZScore: number;
  isOversold: boolean;
  isOverbought: boolean;
  expectedReversion: number;
}

export interface CointegrationTest {
  symbol1: string;
  symbol2: string;
  adfStatistic: number;
  pValue: number;
  isCointegrated: boolean;
  confidenceLevel: number;
}

export function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  return denomX * denomY > 0 ? num / Math.sqrt(denomX * denomY) : 0;
}

export function calculateHedgeRatio(prices1: number[], prices2: number[]): number {
  const n = Math.min(prices1.length, prices2.length);
  if (n < 2) return 1;

  const mean1 = prices1.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const mean2 = prices2.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let cov = 0, var2 = 0;
  for (let i = 0; i < n; i++) {
    cov += (prices1[i] - mean1) * (prices2[i] - mean2);
    var2 += (prices2[i] - mean2) ** 2;
  }

  return var2 > 0 ? cov / var2 : 1;
}

export function calculateSpread(prices1: number[], prices2: number[], hedgeRatio: number): number[] {
  const n = Math.min(prices1.length, prices2.length);
  const spread: number[] = [];
  for (let i = 0; i < n; i++) {
    spread.push(prices1[i] - hedgeRatio * prices2[i]);
  }
  return spread;
}

export function calculateZScore(spread: number[], window: number = 20): number[] {
  const zScores: number[] = [];
  for (let i = 0; i < spread.length; i++) {
    const start = Math.max(0, i - window + 1);
    const windowData = spread.slice(start, i + 1);
    const mean = windowData.reduce((a, b) => a + b, 0) / windowData.length;
    const std = Math.sqrt(
      windowData.reduce((s, v) => s + (v - mean) ** 2, 0) / windowData.length
    );
    zScores.push(std > 0 ? (spread[i] - mean) / std : 0);
  }
  return zScores;
}

export function calculateHalfLife(spread: number[]): number {
  if (spread.length < 3) return 0;

  const y = spread.slice(1);
  const x = spread.slice(0, -1);
  const n = y.length;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let cov = 0, varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) ** 2;
  }

  const beta = varX > 0 ? cov / varX : 1;
  // Half-life = -ln(2) / ln(beta)
  if (beta <= 0 || beta >= 1) return Infinity;
  return -Math.log(2) / Math.log(beta);
}

export function adfTest(series: number[], maxLags: number = 1): { statistic: number; isStationary: boolean } {
  if (series.length < 10) return { statistic: 0, isStationary: false };

  // Simplified ADF test
  const diff: number[] = [];
  for (let i = 1; i < series.length; i++) {
    diff.push(series[i] - series[i - 1]);
  }

  const n = diff.length;
  const y = diff.slice(maxLags);
  const x = series.slice(maxLags, series.length - 1);

  if (y.length < 3) return { statistic: 0, isStationary: false };

  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;

  let cov = 0, varX = 0;
  for (let i = 0; i < y.length; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) ** 2;
  }

  const beta = varX > 0 ? cov / varX : 0;

  // Residuals
  let residualVar = 0;
  for (let i = 0; i < y.length; i++) {
    const predicted = meanY + beta * (x[i] - meanX);
    residualVar += (y[i] - predicted) ** 2;
  }
  residualVar /= y.length;

  const se = varX > 0 ? Math.sqrt(residualVar / varX) : 1;
  const statistic = se > 0 ? beta / se : 0;

  // Critical value for 5% significance ≈ -2.86
  return { statistic, isStationary: statistic < -2.86 };
}

export function findPairs(
  series: PriceSeries[],
  minCorrelation: number = 0.7
): PairResult[] {
  const pairs: PairResult[] = [];

  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const s1 = series[i];
      const s2 = series[j];
      const corr = calculateCorrelation(s1.prices, s2.prices);

      if (Math.abs(corr) < minCorrelation) continue;

      const hedgeRatio = calculateHedgeRatio(s1.prices, s2.prices);
      const spread = calculateSpread(s1.prices, s2.prices, hedgeRatio);
      const zScores = calculateZScore(spread);
      const halfLife = calculateHalfLife(spread);
      const adf = adfTest(spread);

      pairs.push({
        symbol1: s1.symbol,
        symbol2: s2.symbol,
        correlation: corr,
        cointegrationScore: Math.abs(adf.statistic),
        halfLife,
        hedgeRatio,
        spread,
        zScore: zScores,
        isStationary: adf.isStationary,
        adfStatistic: adf.statistic,
      });
    }
  }

  return pairs.sort((a, b) => b.cointegrationScore - a.cointegrationScore);
}

export function generatePairsSignals(
  pair: PairResult,
  timestamps: number[],
  entryThreshold: number = 2,
  exitThreshold: number = 0.5
): PairsSignal[] {
  const signals: PairsSignal[] = [];

  for (let i = 0; i < pair.zScore.length; i++) {
    const z = pair.zScore[i];
    let action: PairsSignal['action'] = 'hold';
    let confidence = 0;

    if (Math.abs(z) > entryThreshold) {
      action = z > 0 ? 'enter_short_long' : 'enter_long_short';
      confidence = Math.min(1, Math.abs(z) / 3);
    } else if (Math.abs(z) < exitThreshold) {
      action = 'exit';
      confidence = 1 - Math.abs(z);
    }

    signals.push({
      timestamp: timestamps[i] ?? i,
      pair: `${pair.symbol1}/${pair.symbol2}`,
      action,
      zScore: z,
      confidence,
      expectedReturn: -z * 0.1, // Expected mean reversion
    });
  }

  return signals;
}

export function analyzeMeanReversion(
  prices: number[],
  window: number = 20
): MeanReversionResult {
  const n = prices.length;
  const start = Math.max(0, n - window);
  const windowPrices = prices.slice(start);

  const mean = windowPrices.reduce((a, b) => a + b, 0) / windowPrices.length;
  const std = Math.sqrt(
    windowPrices.reduce((s, v) => s + (v - mean) ** 2, 0) / windowPrices.length
  );
  const currentPrice = prices[n - 1];
  const currentZScore = std > 0 ? (currentPrice - mean) / std : 0;

  return {
    symbol: '',
    mean,
    std,
    currentZScore,
    isOversold: currentZScore < -2,
    isOverbought: currentZScore > 2,
    expectedReversion: mean - currentPrice,
  };
}

export function calculateBollingerBandSignal(
  prices: number[],
  window: number = 20,
  numStd: number = 2
): { upper: number; lower: number; middle: number; signal: 'buy' | 'sell' | 'hold' } {
  const n = prices.length;
  const start = Math.max(0, n - window);
  const windowPrices = prices.slice(start);

  const middle = windowPrices.reduce((a, b) => a + b, 0) / windowPrices.length;
  const std = Math.sqrt(
    windowPrices.reduce((s, v) => s + (v - middle) ** 2, 0) / windowPrices.length
  );

  const upper = middle + numStd * std;
  const lower = middle - numStd * std;
  const current = prices[n - 1];

  let signal: 'buy' | 'sell' | 'hold' = 'hold';
  if (current <= lower) signal = 'buy';
  else if (current >= upper) signal = 'sell';

  return { upper, lower, middle, signal };
}

export function calculateHurstExponent(prices: number[], maxLag: number = 20): number {
  if (prices.length < maxLag * 2) return 0.5;

  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    logReturns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const lags: number[] = [];
  const rsValues: number[] = [];

  for (let lag = 10; lag <= maxLag && lag < logReturns.length / 2; lag++) {
    const chunks = Math.floor(logReturns.length / lag);
    let avgRS = 0;

    for (let c = 0; c < chunks; c++) {
      const chunk = logReturns.slice(c * lag, (c + 1) * lag);
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;

      let cumDev = 0, maxCum = -Infinity, minCum = Infinity;
      let variance = 0;

      for (const val of chunk) {
        cumDev += val - mean;
        maxCum = Math.max(maxCum, cumDev);
        minCum = Math.min(minCum, cumDev);
        variance += (val - mean) ** 2;
      }

      const range = maxCum - minCum;
      const std = Math.sqrt(variance / chunk.length);
      if (std > 0) avgRS += range / std;
    }

    if (chunks > 0) {
      lags.push(Math.log(lag));
      rsValues.push(Math.log(avgRS / chunks));
    }
  }

  if (lags.length < 2) return 0.5;

  // Linear regression
  const n = lags.length;
  const meanX = lags.reduce((a, b) => a + b, 0) / n;
  const meanY = rsValues.reduce((a, b) => a + b, 0) / n;

  let cov = 0, varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (lags[i] - meanX) * (rsValues[i] - meanY);
    varX += (lags[i] - meanX) ** 2;
  }

  return varX > 0 ? cov / varX : 0.5;
}

export function kalmanFilterHedgeRatio(
  prices1: number[],
  prices2: number[],
  processNoise: number = 0.01,
  measurementNoise: number = 0.1
): number[] {
  const n = Math.min(prices1.length, prices2.length);
  const hedgeRatios: number[] = [];

  let beta = 0; // Initial hedge ratio
  let P = 1; // Initial covariance

  for (let i = 0; i < n; i++) {
    // Predict
    const P_pred = P + processNoise;

    // Update
    const K = P_pred / (P_pred + measurementNoise); // Kalman gain
    const innovation = prices1[i] - beta * prices2[i];
    beta = beta + K * innovation / prices2[i];
    P = (1 - K) * P_pred;

    hedgeRatios.push(beta);
  }

  return hedgeRatios;
}
