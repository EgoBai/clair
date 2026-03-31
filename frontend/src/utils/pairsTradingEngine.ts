/**
 * 统计套利配对交易引擎 - 协整检验/Z-Score信号/均值回归/对冲比率
 */

export interface PriceSeries {
  symbol: string;
  prices: number[];
  timestamps: string[];
}

export interface CointegrationResult {
  symbol1: string;
  symbol2: string;
  adfStatistic: number;
  pValue: number;
  isCointegrated: boolean;
  halfLife: number; // days
  hedgeRatio: number;
  spread: number[];
  spreadMean: number;
  spreadStd: number;
}

export interface PairsSignal {
  time: string;
  signal: 'long_spread' | 'short_spread' | 'exit';
  zScore: number;
  spreadValue: number;
  expectedReturn: number;
  confidence: number;
}

export interface PairsBacktest {
  pair: [string, string];
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgHoldingDays: number;
  numTrades: number;
  signals: PairsSignal[];
}

/**
 * 计算协整关系
 */
export function testCointegration(
  series1: PriceSeries,
  series2: PriceSeries,
): CointegrationResult {
  const len = Math.min(series1.prices.length, series2.prices.length);
  if (len < 10) {
    return {
      symbol1: series1.symbol, symbol2: series2.symbol,
      adfStatistic: 0, pValue: 1, isCointegrated: false,
      halfLife: 0, hedgeRatio: 0, spread: [], spreadMean: 0, spreadStd: 0,
    };
  }

  const x = series1.prices.slice(0, len);
  const y = series2.prices.slice(0, len);

  // OLS hedge ratio: y = alpha + beta * x
  const meanX = x.reduce((a, b) => a + b, 0) / len;
  const meanY = y.reduce((a, b) => a + b, 0) / len;
  let num = 0, den = 0;
  for (let i = 0; i < len; i++) {
    num += (x[i] - meanX) * (y[i] - meanY);
    den += (x[i] - meanX) ** 2;
  }
  const hedgeRatio = den > 0 ? num / den : 1;

  // Spread: y - beta * x
  const spread = y.map((yi, i) => yi - hedgeRatio * x[i]);
  const spreadMean = spread.reduce((a, b) => a + b, 0) / len;
  const spreadStd = Math.sqrt(spread.reduce((s, v) => s + (v - spreadMean) ** 2, 0) / len);

  // Simplified ADF test (lag-1 autocorrelation)
  let sumDiff = 0, sumLag = 0;
  for (let i = 1; i < len; i++) {
    sumDiff += (spread[i] - spread[i - 1]) * spread[i - 1];
    sumLag += spread[i - 1] ** 2;
  }
  const rho = sumLag > 0 ? sumDiff / sumLag : 0;
  const adfStatistic = rho * Math.sqrt(len);
  const pValue = Math.max(0.001, Math.min(1, 0.5 - Math.abs(adfStatistic) * 0.1));
  const isCointegrated = pValue < 0.05;

  // Half-life of mean reversion
  const halfLife = rho < 0 ? Math.round((-Math.log(2) / rho) * 100) / 100 : 0;

  return {
    symbol1: series1.symbol,
    symbol2: series2.symbol,
    adfStatistic: Math.round(adfStatistic * 1000) / 1000,
    pValue: Math.round(pValue * 1000) / 1000,
    isCointegrated,
    halfLife: Math.min(365, Math.max(0, halfLife)),
    hedgeRatio: Math.round(hedgeRatio * 10000) / 10000,
    spread,
    spreadMean: Math.round(spreadMean * 10000) / 10000,
    spreadStd: Math.round(spreadStd * 10000) / 10000,
  };
}

/**
 * 生成Z-Score交易信号
 */
export function generatePairsSignals(
  cointegration: CointegrationResult,
  timestamps: string[],
  entryThreshold: number = 2.0,
  exitThreshold: number = 0.5,
): PairsSignal[] {
  const signals: PairsSignal[] = [];
  if (cointegration.spreadStd === 0) return signals;

  let inPosition = false;
  let positionType: 'long_spread' | 'short_spread' | null = null;

  for (let i = 0; i < cointegration.spread.length; i++) {
    const zScore = (cointegration.spread[i] - cointegration.spreadMean) / cointegration.spreadStd;

    if (!inPosition) {
      if (zScore > entryThreshold) {
        // Spread too high, short the spread
        signals.push({
          time: timestamps[i] || `day_${i}`,
          signal: 'short_spread',
          zScore: Math.round(zScore * 100) / 100,
          spreadValue: Math.round(cointegration.spread[i] * 100) / 100,
          expectedReturn: Math.round((cointegration.spreadMean - cointegration.spread[i]) / cointegration.spreadStd * 100) / 100,
          confidence: Math.min(1, Math.abs(zScore) / 3),
        });
        inPosition = true;
        positionType = 'short_spread';
      } else if (zScore < -entryThreshold) {
        // Spread too low, long the spread
        signals.push({
          time: timestamps[i] || `day_${i}`,
          signal: 'long_spread',
          zScore: Math.round(zScore * 100) / 100,
          spreadValue: Math.round(cointegration.spread[i] * 100) / 100,
          expectedReturn: Math.round((cointegration.spreadMean - cointegration.spread[i]) / cointegration.spreadStd * 100) / 100,
          confidence: Math.min(1, Math.abs(zScore) / 3),
        });
        inPosition = true;
        positionType = 'long_spread';
      }
    } else {
      // Exit when z-score reverts
      const shouldExit =
        (positionType === 'short_spread' && zScore < exitThreshold) ||
        (positionType === 'long_spread' && zScore > -exitThreshold);

      if (shouldExit) {
        signals.push({
          time: timestamps[i] || `day_${i}`,
          signal: 'exit',
          zScore: Math.round(zScore * 100) / 100,
          spreadValue: Math.round(cointegration.spread[i] * 100) / 100,
          expectedReturn: 0,
          confidence: 0.8,
        });
        inPosition = false;
        positionType = null;
      }
    }
  }

  return signals;
}

/**
 * 配对交易回测
 */
export function backtestPairs(
  cointegration: CointegrationResult,
  timestamps: string[],
  entryThreshold: number = 2.0,
  exitThreshold: number = 0.5,
): PairsBacktest {
  const signals = generatePairsSignals(cointegration, timestamps, entryThreshold, exitThreshold);

  let totalReturn = 0;
  let trades = 0;
  let wins = 0;
  let holdingDays = 0;
  let entryIndex = 0;
  const returns: number[] = [];
  let peak = 0;
  let maxDD = 0;

  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    if (sig.signal !== 'exit') {
      entryIndex = i;
    } else {
      // Find corresponding entry
      for (let j = entryIndex; j >= 0; j--) {
        if (signals[j].signal !== 'exit') {
          const ret = sig.zScore - signals[j].zScore;
          const tradeReturn = signals[j].signal === 'short_spread' ? -ret : ret;
          totalReturn += tradeReturn;
          returns.push(tradeReturn);
          if (tradeReturn > 0) wins++;
          trades++;
          holdingDays += i - j;
          break;
        }
      }
    }
  }

  // Compute Sharpe and max DD
  if (returns.length > 0) {
    const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdRet = Math.sqrt(returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length);
    let cumRet = 0;
    for (const r of returns) {
      cumRet += r;
      peak = Math.max(peak, cumRet);
      maxDD = Math.min(maxDD, cumRet - peak);
    }
  }

  const annualizedReturn = trades > 0 ? Math.round((totalReturn / trades) * 252 * 100) / 100 : 0;

  return {
    pair: [cointegration.symbol1, cointegration.symbol2],
    totalReturn: Math.round(totalReturn * 10000) / 10000,
    annualizedReturn,
    sharpeRatio: returns.length > 1
      ? Math.round((returns.reduce((a, b) => a + b, 0) / returns.length) /
         (Math.sqrt(returns.reduce((s, r) => s + r ** 2, 0) / returns.length - (returns.reduce((a, b) => a + b, 0) / returns.length) ** 2) || 1) * 100) / 100
      : 0,
    maxDrawdown: Math.round(maxDD * 10000) / 10000,
    winRate: trades > 0 ? Math.round((wins / trades) * 100) / 100 : 0,
    avgHoldingDays: trades > 0 ? Math.round(holdingDays / trades) : 0,
    numTrades: trades,
    signals,
  };
}

/**
 * 计算最优对冲比率
 */
export function calculateOptimalHedgeRatio(
  series1: number[],
  series2: number[],
  method: 'ols' | 'kalman' | 'rolling' = 'ols',
  window: number = 60,
): number[] {
  const len = Math.min(series1.length, series2.length);
  if (len < 2) return [];

  if (method === 'ols') {
    // Global OLS
    const meanX = series1.slice(0, len).reduce((a, b) => a + b, 0) / len;
    const meanY = series2.slice(0, len).reduce((a, b) => a + b, 0) / len;
    let num = 0, den = 0;
    for (let i = 0; i < len; i++) {
      num += (series1[i] - meanX) * (series2[i] - meanY);
      den += (series1[i] - meanX) ** 2;
    }
    const beta = den > 0 ? num / den : 1;
    return Array(len).fill(Math.round(beta * 10000) / 10000);
  }

  // Rolling OLS
  const result: number[] = [];
  for (let i = 0; i < len; i++) {
    const start = Math.max(0, i - window + 1);
    const end = i + 1;
    const x = series1.slice(start, end);
    const y = series2.slice(start, end);
    const n = x.length;

    if (n < 2) {
      result.push(1);
      continue;
    }

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let j = 0; j < n; j++) {
      num += (x[j] - meanX) * (y[j] - meanY);
      den += (x[j] - meanX) ** 2;
    }
    const beta = den > 0 ? num / den : 1;
    result.push(Math.round(beta * 10000) / 10000);
  }

  return result;
}
