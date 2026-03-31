/**
 * Momentum Oscillator Engine
 * 
 * 动量振荡器引擎 - RSI/MACD/Stochastic/CCI/Williams %R/ROC等动量指标
 */

// ===== Types =====

export interface RSIResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  divergence: boolean;
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  crossover: 'bullish' | 'bearish' | 'none';
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface StochasticResult {
  k: number;
  d: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  crossover: 'bullish' | 'bearish' | 'none';
}

export interface CCIResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface WilliamsRResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
}

export interface MomentumDashboard {
  rsi: RSIResult;
  macd: MACDResult;
  stochastic: StochasticResult;
  cci: CCIResult;
  williamsR: WilliamsRResult;
  overallSignal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
}

// ===== RSI =====

export function calculateRSI(
  prices: number[],
  period: number = 14
): RSIResult {
  if (prices.length < period + 1) {
    return { value: 50, signal: 'neutral', divergence: false, trend: 'neutral' };
  }

  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? -c : 0));

  let avgGain = gains.slice(0, period).reduce((s, g) => s + g, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((s, l) => s + l, 0) / period;

  // Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  let signal: 'overbought' | 'oversold' | 'neutral';
  if (rsi > 70) signal = 'overbought';
  else if (rsi < 30) signal = 'oversold';
  else signal = 'neutral';

  // Check for trend based on RSI level
  let trend: 'bullish' | 'bearish' | 'neutral';
  if (rsi > 50) trend = 'bullish';
  else if (rsi < 50) trend = 'bearish';
  else trend = 'neutral';

  // Simple divergence detection (price up but RSI down or vice versa)
  const recentPrices = prices.slice(-period);
  const priceUp = recentPrices[recentPrices.length - 1] > recentPrices[0];
  const divergence = (priceUp && rsi < 50) || (!priceUp && rsi > 50);

  return { value: Math.round(rsi * 100) / 100, signal, divergence, trend };
}

// ===== MACD =====

export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  if (prices.length < slowPeriod) {
    return { macd: 0, signal: 0, histogram: 0, crossover: 'none', trend: 'neutral' };
  }

  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result = [data.slice(0, period).reduce((s, v) => s + v, 0) / period];
    for (let i = period; i < data.length; i++) {
      result.push(data[i] * k + result[result.length - 1] * (1 - k));
    }
    return result;
  };

  const fastEma = ema(prices, fastPeriod);
  const slowEma = ema(prices, slowPeriod);

  const minLength = Math.min(fastEma.length, slowEma.length);
  const macdLine = fastEma.slice(-minLength).map((v, i) => v - slowEma[slowEma.length - minLength + i]);

  const signalLine = macdLine.length >= signalPeriod
    ? ema(macdLine, signalPeriod)
    : [0];

  const currentMacd = macdLine[macdLine.length - 1];
  const currentSignal = signalLine[signalLine.length - 1];
  const histogram = currentMacd - currentSignal;

  // Crossover detection
  let crossover: 'bullish' | 'bearish' | 'none' = 'none';
  if (macdLine.length >= 2 && signalLine.length >= 2) {
    const prevMacd = macdLine[macdLine.length - 2];
    const prevSignal = signalLine[signalLine.length - 2];
    if (prevMacd <= prevSignal && currentMacd > currentSignal) crossover = 'bullish';
    else if (prevMacd >= prevSignal && currentMacd < currentSignal) crossover = 'bearish';
  }

  let trend: 'bullish' | 'bearish' | 'neutral';
  if (currentMacd > currentSignal) trend = 'bullish';
  else if (currentMacd < currentSignal) trend = 'bearish';
  else trend = 'neutral';

  return {
    macd: Math.round(currentMacd * 1000) / 1000,
    signal: Math.round(currentSignal * 1000) / 1000,
    histogram: Math.round(histogram * 1000) / 1000,
    crossover,
    trend,
  };
}

// ===== Stochastic Oscillator =====

export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3
): StochasticResult {
  if (closes.length < kPeriod) {
    return { k: 50, d: 50, signal: 'neutral', crossover: 'none' };
  }

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const sliceH = highs.slice(i - kPeriod + 1, i + 1);
    const sliceL = lows.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...sliceH);
    const lowest = Math.min(...sliceL);
    const range = highest - lowest;
    const k = range === 0 ? 50 : ((closes[i] - lowest) / range) * 100;
    kValues.push(k);
  }

  // %D = SMA of %K
  const dValues: number[] = [];
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    const avg = kValues.slice(i - dPeriod + 1, i + 1).reduce((s, v) => s + v, 0) / dPeriod;
    dValues.push(avg);
  }

  const currentK = kValues[kValues.length - 1];
  const currentD = dValues.length > 0 ? dValues[dValues.length - 1] : currentK;

  let signal: 'overbought' | 'oversold' | 'neutral';
  if (currentK > 80) signal = 'overbought';
  else if (currentK < 20) signal = 'oversold';
  else signal = 'neutral';

  let crossover: 'bullish' | 'bearish' | 'none' = 'none';
  if (kValues.length >= 2 && dValues.length >= 2) {
    const prevK = kValues[kValues.length - 2];
    const prevD = dValues[dValues.length - 2];
    if (prevK <= prevD && currentK > currentD) crossover = 'bullish';
    else if (prevK >= prevD && currentK < currentD) crossover = 'bearish';
  }

  return {
    k: Math.round(currentK * 100) / 100,
    d: Math.round(currentD * 100) / 100,
    signal,
    crossover,
  };
}

// ===== CCI (Commodity Channel Index) =====

export function calculateCCI(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 20
): CCIResult {
  if (closes.length < period) {
    return { value: 0, signal: 'neutral', trend: 'neutral' };
  }

  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const recentTp = tp.slice(-period);
  const sma = recentTp.reduce((s, v) => s + v, 0) / period;
  const meanDev = recentTp.reduce((s, v) => s + Math.abs(v - sma), 0) / period;
  const cci = meanDev === 0 ? 0 : (tp[tp.length - 1] - sma) / (0.015 * meanDev);

  let signal: 'overbought' | 'oversold' | 'neutral';
  if (cci > 100) signal = 'overbought';
  else if (cci < -100) signal = 'oversold';
  else signal = 'neutral';

  let trend: 'bullish' | 'bearish' | 'neutral';
  if (cci > 0) trend = 'bullish';
  else if (cci < 0) trend = 'bearish';
  else trend = 'neutral';

  return { value: Math.round(cci * 100) / 100, signal, trend };
}

// ===== Williams %R =====

export function calculateWilliamsR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): WilliamsRResult {
  if (closes.length < period) {
    return { value: -50, signal: 'neutral' };
  }

  const recentH = highs.slice(-period);
  const recentL = lows.slice(-period);
  const highest = Math.max(...recentH);
  const lowest = Math.min(...recentL);
  const range = highest - lowest;
  const willR = range === 0 ? -50 : ((highest - closes[closes.length - 1]) / range) * -100;

  let signal: 'overbought' | 'oversold' | 'neutral';
  if (willR > -20) signal = 'overbought';
  else if (willR < -80) signal = 'oversold';
  else signal = 'neutral';

  return { value: Math.round(willR * 100) / 100, signal };
}

// ===== Momentum Dashboard =====

export function buildMomentumDashboard(
  highs: number[],
  lows: number[],
  closes: number[]
): MomentumDashboard {
  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  const stochastic = calculateStochastic(highs, lows, closes);
  const cci = calculateCCI(highs, lows, closes);
  const williamsR = calculateWilliamsR(highs, lows, closes);

  // Aggregate signals
  const signals = [rsi.trend, macd.trend, cci.trend];
  const bullishCount = signals.filter((s) => s === 'bullish').length;
  const bearishCount = signals.filter((s) => s === 'bearish').length;

  let overallSignal: 'bullish' | 'bearish' | 'neutral';
  if (bullishCount >= 2) overallSignal = 'bullish';
  else if (bearishCount >= 2) overallSignal = 'bearish';
  else overallSignal = 'neutral';

  const confidence = Math.max(bullishCount, bearishCount) / signals.length;

  return {
    rsi,
    macd,
    stochastic,
    cci,
    williamsR,
    overallSignal,
    confidence: Math.round(confidence * 100) / 100,
  };
}
