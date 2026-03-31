/**
 * Market Timing Engine
 *
 * Multi-signal market timing: trend following, mean reversion, volatility regime,
 * breadth indicators, and composite timing signals.
 */

// ==================== Types ====================

export type TimingSignal = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
export type TrendState = 'uptrend' | 'downtrend' | 'sideways';
export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

export interface TrendSignal {
  ma20: number;
  ma50: number;
  ma200: number;
  goldenCross: boolean;
  deathCross: boolean;
  trendState: TrendState;
  trendStrength: number; // 0-1
}

export interface MomentumSignal {
  rsi14: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  roc20: number; // rate of change 20d
  stochK: number;
  stochD: number;
  williamsR: number;
  signal: TimingSignal;
}

export interface VolatilitySignal {
  currentVol: number;
  avgVol20: number;
  volRatio: number;
  regime: VolatilityRegime;
  vixLevel?: number;
  termStructure: 'contango' | 'backwardation' | 'neutral';
  signal: TimingSignal;
}

export interface BreadthSignal {
  advanceDeclineRatio: number;
  percentAboveMA50: number;
  newHighsNewLows: number;
  mcclellanOscillator: number;
  signal: TimingSignal;
}

export interface MeanReversionSignal {
  zScore: number;
  bollingerBandPosition: number; // 0-1, 0.5 = middle
  distanceFromMean: number;
  signal: TimingSignal;
}

export interface CompositeTimingResult {
  compositeSignal: TimingSignal;
  compositeScore: number; // -100 to +100
  confidence: number; // 0-1
  signals: {
    trend: TrendSignal;
    momentum: MomentumSignal;
    volatility: VolatilitySignal;
    breadth: BreadthSignal;
    meanReversion: MeanReversionSignal;
  };
  conflicts: string[];
  recommendation: string;
}

export interface TimingBacktest {
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  annualizedReturn: number;
}

// ==================== Helpers ====================

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    result.push(mean(data.slice(i - period + 1, i + 1)));
  }
  return result;
}

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function signalToScore(s: TimingSignal): number {
  switch (s) {
    case 'strong_buy': return 100;
    case 'buy': return 50;
    case 'neutral': return 0;
    case 'sell': return -50;
    case 'strong_sell': return -100;
  }
}

function scoreToSignal(score: number): TimingSignal {
  if (score >= 60) return 'strong_buy';
  if (score >= 20) return 'buy';
  if (score <= -60) return 'strong_sell';
  if (score <= -20) return 'sell';
  return 'neutral';
}

// ==================== Signal Generators ====================

/**
 * Analyze trend signals from price data
 */
export function analyzeTrend(closes: number[]): TrendSignal {
  if (closes.length < 200) {
    return {
      ma20: closes[closes.length - 1] || 0,
      ma50: closes[closes.length - 1] || 0,
      ma200: closes[closes.length - 1] || 0,
      goldenCross: false,
      deathCross: false,
      trendState: 'sideways',
      trendStrength: 0,
    };
  }

  const ma20Arr = sma(closes, 20);
  const ma50Arr = sma(closes, 50);
  const ma200Arr = sma(closes, 200);

  const ma20 = ma20Arr[ma20Arr.length - 1];
  const ma50 = ma50Arr[ma50Arr.length - 1];
  const ma200 = ma200Arr[ma200Arr.length - 1];

  // Cross detection
  const goldenCross = ma50Arr.length >= 2 && ma200Arr.length >= 2 &&
    ma50Arr[ma50Arr.length - 1] > ma200Arr[ma200Arr.length - 1] &&
    ma50Arr[ma50Arr.length - 2] <= ma200Arr[ma200Arr.length - 2];

  const deathCross = ma50Arr.length >= 2 && ma200Arr.length >= 2 &&
    ma50Arr[ma50Arr.length - 1] < ma200Arr[ma200Arr.length - 1] &&
    ma50Arr[ma50Arr.length - 2] >= ma200Arr[ma200Arr.length - 2];

  // Trend state
  let trendState: TrendState;
  if (ma20 > ma50 && ma50 > ma200) trendState = 'uptrend';
  else if (ma20 < ma50 && ma50 < ma200) trendState = 'downtrend';
  else trendState = 'sideways';

  // Trend strength: how aligned are the MAs?
  const spreads = [
    (ma20 - ma50) / ma50,
    (ma50 - ma200) / ma200,
  ];
  const trendStrength = clamp(Math.abs(spreads[0]) * 20 + Math.abs(spreads[1]) * 10, 0, 1);

  return { ma20, ma50, ma200, goldenCross, deathCross, trendState, trendStrength };
}

/**
 * Analyze momentum signals
 */
export function analyzeMomentum(closes: number[], highs: number[], lows: number[]): MomentumSignal {
  const default_result: MomentumSignal = {
    rsi14: 50, macdSignal: 'neutral', roc20: 0,
    stochK: 50, stochD: 50, williamsR: -50, signal: 'neutral',
  };

  if (closes.length < 26) return default_result;

  // RSI
  const rsi14 = calculateRSI(closes, 14);

  // MACD
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] || 0));
  const signalLine = ema(macdLine.slice(-(ema26.length - 11)), 9);
  const macdSignal: MomentumSignal['macdSignal'] =
    macdLine[macdLine.length - 1] > signalLine[signalLine.length - 1] ? 'bullish' :
    macdLine[macdLine.length - 1] < signalLine[signalLine.length - 1] ? 'bearish' : 'neutral';

  // ROC 20
  const roc20 = closes.length >= 21
    ? ((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100
    : 0;

  // Stochastic
  const { k: stochK, d: stochD } = calculateStochastic(closes, highs, lows, 14, 3);

  // Williams %R
  const williamsR = calculateWilliamsR(closes, highs, lows, 14);

  // Composite signal
  let score = 0;
  if (rsi14 < 30) score += 30;
  else if (rsi14 > 70) score -= 30;
  else if (rsi14 < 40) score += 15;
  else if (rsi14 > 60) score -= 15;

  if (macdSignal === 'bullish') score += 25;
  else if (macdSignal === 'bearish') score -= 25;

  if (roc20 > 5) score += 20;
  else if (roc20 < -5) score -= 20;
  else if (roc20 > 2) score += 10;
  else if (roc20 < -2) score -= 10;

  if (stochK < 20) score += 15;
  else if (stochK > 80) score -= 15;

  const signal = scoreToSignal(clamp(score, -100, 100));

  return { rsi14, macdSignal, roc20, stochK, stochD, williamsR, signal };
}

/**
 * Analyze volatility regime
 */
export function analyzeVolatility(
  closes: number[],
  vixData?: number[]
): VolatilitySignal {
  if (closes.length < 21) {
    return {
      currentVol: 0, avgVol20: 0, volRatio: 1,
      regime: 'normal', termStructure: 'neutral', signal: 'neutral',
    };
  }

  // Calculate rolling volatility (annualized)
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }

  const currentVol = std(returns.slice(-21)) * Math.sqrt(252) * 100;
  const vol20Series: number[] = [];
  for (let i = 21; i < returns.length; i++) {
    vol20Series.push(std(returns.slice(i - 21, i)) * Math.sqrt(252) * 100);
  }
  const avgVol20 = mean(vol20Series);
  const volRatio = avgVol20 === 0 ? 1 : currentVol / avgVol20;

  let regime: VolatilityRegime;
  if (volRatio < 0.7) regime = 'low';
  else if (volRatio < 1.2) regime = 'normal';
  else if (volRatio < 1.5) regime = 'high';
  else regime = 'extreme';

  const vixLevel = vixData ? vixData[vixData.length - 1] : undefined;

  let termStructure: VolatilitySignal['termStructure'] = 'neutral';
  if (vixData && vixData.length >= 2) {
    termStructure = vixData[vixData.length - 1] > vixData[vixData.length - 2] ? 'backwardation' : 'contango';
  }

  // Signal: low vol = buy, high vol = sell
  let score = 0;
  if (regime === 'low') score = 30;
  else if (regime === 'normal') score = 0;
  else if (regime === 'high') score = -30;
  else score = -60;

  if (termStructure === 'contango') score += 10;
  else if (termStructure === 'backwardation') score -= 10;

  return {
    currentVol,
    avgVol20,
    volRatio,
    regime,
    vixLevel,
    termStructure,
    signal: scoreToSignal(clamp(score, -100, 100)),
  };
}

/**
 * Analyze market breadth
 */
export function analyzeBreadth(
  advances: number[],
  declines: number[],
  newHighs: number[],
  newLows: number[],
  aboveMA50Pct: number[]
): BreadthSignal {
  const adRatio = advances.length > 0 && declines.length > 0
    ? advances[advances.length - 1] / Math.max(1, declines[declines.length - 1])
    : 1;

  const pctAbove = aboveMA50Pct.length > 0 ? aboveMA50Pct[aboveMA50Pct.length - 1] : 50;

  const nh = newHighs.length > 0 ? newHighs[newHighs.length - 1] : 0;
  const nl = newLows.length > 0 ? newLows[newLows.length - 1] : 0;
  const nhnl = nh - nl;

  // McClellan Oscillator (simplified)
  const adDiff = advances.map((a, i) => a - (declines[i] || 0));
  const ema19 = adDiff.length >= 19 ? ema(adDiff, 19) : [];
  const ema39 = adDiff.length >= 39 ? ema(adDiff, 39) : [];
  const mcclellan = ema19.length > 0 && ema39.length > 0
    ? ema19[ema19.length - 1] - ema39[ema39.length - 1]
    : 0;

  let score = 0;
  if (adRatio > 1.5) score += 30;
  else if (adRatio > 1) score += 15;
  else if (adRatio < 0.67) score -= 30;
  else if (adRatio < 1) score -= 15;

  if (pctAbove > 70) score += 20;
  else if (pctAbove < 30) score -= 20;

  if (nhnl > 100) score += 25;
  else if (nhnl < -100) score -= 25;

  if (mcclellan > 50) score += 15;
  else if (mcclellan < -50) score -= 15;

  return {
    advanceDeclineRatio: adRatio,
    percentAboveMA50: pctAbove,
    newHighsNewLows: nhnl,
    mcclellanOscillator: mcclellan,
    signal: scoreToSignal(clamp(score, -100, 100)),
  };
}

/**
 * Analyze mean reversion signals
 */
export function analyzeMeanReversion(closes: number[], period: number = 20): MeanReversionSignal {
  if (closes.length < period + 2) {
    return { zScore: 0, bollingerBandPosition: 0.5, distanceFromMean: 0, signal: 'neutral' };
  }

  const recent = closes.slice(-period);
  const m = mean(recent);
  const s = std(recent);
  const zScore = s === 0 ? 0 : (closes[closes.length - 1] - m) / s;

  // Bollinger Band position
  const upper = m + 2 * s;
  const lower = m - 2 * s;
  const range = upper - lower;
  const bollingerBandPosition = range === 0 ? 0.5 : (closes[closes.length - 1] - lower) / range;

  const distanceFromMean = m === 0 ? 0 : (closes[closes.length - 1] - m) / m;

  // Mean reversion: oversold = buy, overbought = sell
  let score = 0;
  if (zScore < -2) score = 60;
  else if (zScore < -1) score = 30;
  else if (zScore > 2) score = -60;
  else if (zScore > 1) score = -30;

  if (bollingerBandPosition < 0.1) score += 20;
  else if (bollingerBandPosition > 0.9) score -= 20;

  return {
    zScore,
    bollingerBandPosition,
    distanceFromMean,
    signal: scoreToSignal(clamp(score, -100, 100)),
  };
}

/**
 * Generate composite timing result
 */
export function generateCompositeTiming(
  closes: number[],
  highs: number[],
  lows: number[],
  advances?: number[],
  declines?: number[],
  newHighs?: number[],
  newLows?: number[],
  aboveMA50Pct?: number[],
  vixData?: number[]
): CompositeTimingResult {
  const trend = analyzeTrend(closes);
  const momentum = analyzeMomentum(closes, highs, lows);
  const volatility = analyzeVolatility(closes, vixData);
  const breadth = advances && declines
    ? analyzeBreadth(advances, declines, newHighs || [], newLows || [], aboveMA50Pct || [])
    : { advanceDeclineRatio: 1, percentAboveMA50: 50, newHighsNewLows: 0, mcclellanOscillator: 0, signal: 'neutral' as TimingSignal };
  const meanReversion = analyzeMeanReversion(closes);

  // Weighted composite score
  const weights = { trend: 0.30, momentum: 0.25, volatility: 0.15, breadth: 0.15, meanReversion: 0.15 };
  let trendScore = 0;
  if (trend.trendState === 'uptrend') trendScore = 60;
  else if (trend.trendState === 'downtrend') trendScore = -60;

  const compositeScore =
    trendScore * weights.trend +
    signalToScore(momentum.signal) * weights.momentum +
    signalToScore(volatility.signal) * weights.volatility +
    signalToScore(breadth.signal) * weights.breadth +
    signalToScore(meanReversion.signal) * weights.meanReversion;

  const compositeSignal = scoreToSignal(compositeScore);

  // Confidence based on signal agreement
  const scores = [
    trendScore,
    signalToScore(momentum.signal),
    signalToScore(volatility.signal),
    signalToScore(breadth.signal),
    signalToScore(meanReversion.signal),
  ];
  const positiveCount = scores.filter(s => s > 0).length;
  const negativeCount = scores.filter(s => s < 0).length;
  const agreement = Math.max(positiveCount, negativeCount) / scores.length;

  // Conflicts
  const conflicts: string[] = [];
  if (momentum.signal.includes('buy') && meanReversion.signal.includes('sell')) {
    conflicts.push('momentum_vs_mean_reversion');
  }
  if (trend.trendState === 'uptrend' && volatility.regime === 'extreme') {
    conflicts.push('trend_vs_volatility');
  }

  let recommendation = '';
  if (compositeSignal === 'strong_buy' && agreement > 0.6) recommendation = '积极看多，多重信号共振';
  else if (compositeSignal === 'buy') recommendation = '偏多，但需关注风险';
  else if (compositeSignal === 'strong_sell' && agreement > 0.6) recommendation = '积极看空，建议减仓';
  else if (compositeSignal === 'sell') recommendation = '偏空，注意防守';
  else recommendation = '信号分歧，观望为主';

  return {
    compositeSignal,
    compositeScore: clamp(compositeScore, -100, 100),
    confidence: agreement,
    signals: { trend, momentum, volatility, breadth, meanReversion },
    conflicts,
    recommendation,
  };
}

// ==================== Technical Indicators ====================

function calculateRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;

  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateStochastic(
  closes: number[], highs: number[], lows: number[],
  kPeriod: number, dPeriod: number
): { k: number; d: number } {
  if (closes.length < kPeriod) return { k: 50, d: 50 };

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const sliceH = highs.slice(i - kPeriod + 1, i + 1);
    const sliceL = lows.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...sliceH);
    const low = Math.min(...sliceL);
    const range = high - low;
    kValues.push(range === 0 ? 50 : ((closes[i] - low) / range) * 100);
  }

  const k = kValues[kValues.length - 1];
  const dSlice = kValues.slice(-dPeriod);
  const d = mean(dSlice);

  return { k, d };
}

function calculateWilliamsR(closes: number[], highs: number[], lows: number[], period: number): number {
  if (closes.length < period) return -50;

  const sliceH = highs.slice(-period);
  const sliceL = lows.slice(-period);
  const high = Math.max(...sliceH);
  const low = Math.min(...sliceL);
  const range = high - low;

  return range === 0 ? -50 : ((high - closes[closes.length - 1]) / range) * -100;
}
