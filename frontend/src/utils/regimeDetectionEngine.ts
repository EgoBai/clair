/**
 * Market Regime Detection Engine
 * 市场状态检测引擎 - 牛熊转换、波动率状态、趋势识别
 */

export interface RegimeState {
  regime: 'bull' | 'bear' | 'sideways' | 'high_vol' | 'low_vol' | 'transition';
  probability: number;
  duration: number;
  startTimestamp: number;
  features: {
    trend: number;
    volatility: number;
    momentum: number;
    volume: number;
  };
}

export interface RegimeTransition {
  from: string;
  to: string;
  timestamp: number;
  probability: number;
}

export interface HiddenMarkovState {
  states: number[];
  transitionMatrix: number[][];
  emissionMeans: number[];
  emissionStd: number[];
  logLikelihood: number;
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'neutral';
  strength: number;
  startIdx: number;
  endIdx: number;
  pivotHighs: number[];
  pivotLows: number[];
  supportLevels: number[];
  resistanceLevels: number[];
}

export interface VolatilityRegime {
  regime: 'low' | 'normal' | 'high' | 'extreme';
  currentVol: number;
  percentile: number;
  meanReversionSpeed: number;
  expectedVol: number;
}

export function detectTrend(prices: number[], window: number = 20): TrendAnalysis {
  const n = prices.length;
  if (n < window) {
    return { direction: 'neutral', strength: 0, startIdx: 0, endIdx: n - 1, pivotHighs: [], pivotLows: [], supportLevels: [], resistanceLevels: [] };
  }

  // Linear regression slope
  const recentPrices = prices.slice(-window);
  const x = Array.from({ length: window }, (_, i) => i);
  const meanX = x.reduce((a, b) => a + b, 0) / window;
  const meanY = recentPrices.reduce((a, b) => a + b, 0) / window;

  let num = 0, den = 0;
  for (let i = 0; i < window; i++) {
    num += (x[i] - meanX) * (recentPrices[i] - meanY);
    den += (x[i] - meanX) ** 2;
  }
  const slope = den > 0 ? num / den : 0;

  // R-squared for trend strength
  const predictions = x.map(xi => meanY + slope * (xi - meanX));
  const ssRes = recentPrices.reduce((s, p, i) => s + (p - predictions[i]) ** 2, 0);
  const ssTot = recentPrices.reduce((s, p) => s + (p - meanY) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Find pivot highs and lows
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (prices[i] > prices[i - 1] && prices[i] > prices[i - 2] &&
        prices[i] > prices[i + 1] && prices[i] > prices[i + 2]) {
      pivotHighs.push(i);
    }
    if (prices[i] < prices[i - 1] && prices[i] < prices[i - 2] &&
        prices[i] < prices[i + 1] && prices[i] < prices[i + 2]) {
      pivotLows.push(i);
    }
  }

  // Support and resistance from pivots
  const supportLevels = pivotLows.slice(-5).map(i => prices[i]);
  const resistanceLevels = pivotHighs.slice(-5).map(i => prices[i]);

  const direction = slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'neutral';
  const strength = Math.min(1, Math.abs(rSquared));

  return { direction, strength, startIdx: n - window, endIdx: n - 1, pivotHighs, pivotLows, supportLevels, resistanceLevels };
}

export function calculateVolatilityRegime(
  returns: number[],
  window: number = 60
): VolatilityRegime {
  const n = returns.length;
  if (n < window) {
    return { regime: 'normal', currentVol: 0, percentile: 50, meanReversionSpeed: 0, expectedVol: 0 };
  }

  // Rolling volatility
  const vols: number[] = [];
  for (let i = window - 1; i < n; i++) {
    const slice = returns.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / (slice.length - 1);
    vols.push(Math.sqrt(variance * 252));
  }

  const currentVol = vols[vols.length - 1];
  const sortedVols = [...vols].sort((a, b) => a - b);
  const percentile = sortedVols.indexOf(currentVol) / sortedVols.length * 100;

  // Mean reversion speed (Ornstein-Uhlenbeck)
  let meanReversionSpeed = 0;
  if (vols.length > 2) {
    const volReturns: number[] = [];
    for (let i = 1; i < vols.length; i++) {
      volReturns.push(vols[i] - vols[i - 1]);
    }
    const meanVol = vols.reduce((a, b) => a + b, 0) / vols.length;
    let cov = 0, varV = 0;
    for (let i = 1; i < vols.length; i++) {
      cov += (vols[i] - meanVol) * (vols[i - 1] - meanVol);
      varV += (vols[i - 1] - meanVol) ** 2;
    }
    meanReversionSpeed = varV > 0 ? -(cov / varV) : 0;
  }

  const longTermVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const expectedVol = currentVol + meanReversionSpeed * (longTermVol - currentVol);

  let regime: VolatilityRegime['regime'];
  if (percentile < 20) regime = 'low';
  else if (percentile < 80) regime = 'normal';
  else if (percentile < 95) regime = 'high';
  else regime = 'extreme';

  return { regime, currentVol, percentile, meanReversionSpeed, expectedVol };
}

export function simpleHMM(
  observations: number[],
  nStates: number = 2,
  maxIterations: number = 50
): HiddenMarkovState {
  const n = observations.length;

  // Initialize parameters
  const means = Array.from({ length: nStates }, (_, i) =>
    observations.reduce((a, b) => a + b, 0) / n + (i - nStates / 2) * 0.01
  );
  const stds = Array.from({ length: nStates }, () =>
    Math.sqrt(observations.reduce((s, v) => s + (v - observations.reduce((a, b) => a + b, 0) / n) ** 2, 0) / n)
  );
  const transMatrix = Array.from({ length: nStates }, () =>
    Array.from({ length: nStates }, () => 1 / nStates)
  );

  // Simplified: just use Gaussian mixture assignment
  const states: number[] = [];
  for (const obs of observations) {
    let bestState = 0;
    let bestProb = -Infinity;
    for (let s = 0; s < nStates; s++) {
      const z = stds[s] > 0 ? (obs - means[s]) / stds[s] : 0;
      const logProb = -0.5 * z * z - Math.log(stds[s] || 1);
      if (logProb > bestProb) {
        bestProb = logProb;
        bestState = s;
      }
    }
    states.push(bestState);
  }

  // Recalculate means and stds
  for (let s = 0; s < nStates; s++) {
    const stateObs = observations.filter((_, i) => states[i] === s);
    if (stateObs.length > 0) {
      means[s] = stateObs.reduce((a, b) => a + b, 0) / stateObs.length;
      stds[s] = Math.sqrt(stateObs.reduce((acc, v) => acc + (v - means[s]) ** 2, 0) / stateObs.length);
    }
  }

  // Transition matrix from observed transitions
  for (let s1 = 0; s1 < nStates; s1++) {
    let count = 0;
    const transitions = Array.from({ length: nStates }, () => 0);
    for (let i = 1; i < n; i++) {
      if (states[i - 1] === s1) {
        transitions[states[i]]++;
        count++;
      }
    }
    if (count > 0) {
      for (let s2 = 0; s2 < nStates; s2++) {
        transMatrix[s1][s2] = transitions[s2] / count;
      }
    }
  }

  // Log-likelihood
  let logLikelihood = 0;
  for (let i = 0; i < n; i++) {
    const s = states[i];
    const z = stds[s] > 0 ? (observations[i] - means[s]) / stds[s] : 0;
    logLikelihood += -0.5 * z * z - Math.log(stds[s] || 1);
  }

  return { states, transitionMatrix: transMatrix, emissionMeans: means, emissionStd: stds, logLikelihood };
}

export function detectRegimeChanges(
  prices: number[],
  timestamps: number[],
  window: number = 20
): RegimeState[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  const regimes: RegimeState[] = [];

  for (let i = window; i < prices.length; i++) {
    const windowReturns = returns.slice(i - window, i);
    const windowPrices = prices.slice(i - window, i + 1);
    const trend = detectTrend(windowPrices, window);
    const volRegime = calculateVolatilityRegime(windowReturns, Math.min(window, windowReturns.length));

    const avgReturn = windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length;
    const vol = Math.sqrt(windowReturns.reduce((s, r) => s + r ** 2, 0) / windowReturns.length);

    let regime: RegimeState['regime'];
    if (avgReturn > 0.001 && trend.direction === 'up') regime = 'bull';
    else if (avgReturn < -0.001 && trend.direction === 'down') regime = 'bear';
    else if (volRegime.regime === 'high' || volRegime.regime === 'extreme') regime = 'high_vol';
    else if (volRegime.regime === 'low') regime = 'low_vol';
    else regime = 'sideways';

    regimes.push({
      regime,
      probability: trend.strength,
      duration: 0,
      startTimestamp: timestamps[i] ?? i,
      features: {
        trend: trend.strength * (trend.direction === 'up' ? 1 : trend.direction === 'down' ? -1 : 0),
        volatility: vol,
        momentum: avgReturn,
        volume: 0,
      },
    });
  }

  // Calculate durations
  for (let i = 1; i < regimes.length; i++) {
    if (regimes[i].regime === regimes[i - 1].regime) {
      regimes[i].duration = regimes[i - 1].duration + 1;
    } else {
      regimes[i].duration = 1;
    }
  }

  return regimes;
}

export function detectRegimeTransitions(
  regimes: RegimeState[]
): RegimeTransition[] {
  const transitions: RegimeTransition[] = [];

  for (let i = 1; i < regimes.length; i++) {
    if (regimes[i].regime !== regimes[i - 1].regime) {
      transitions.push({
        from: regimes[i - 1].regime,
        to: regimes[i].regime,
        timestamp: regimes[i].startTimestamp,
        probability: regimes[i].probability,
      });
    }
  }

  return transitions;
}

export function calculateMarketBreadth(
  advancing: number,
  declining: number,
  unchanged: number
): { advanceDeclineRatio: number; breadthPercent: number; signal: 'bullish' | 'bearish' | 'neutral' } {
  const total = advancing + declining + unchanged;
  const adRatio = declining > 0 ? advancing / declining : advancing > 0 ? Infinity : 1;
  const breadthPercent = total > 0 ? (advancing - declining) / total : 0;

  let signal: 'bullish' | 'bearish' | 'neutral';
  if (breadthPercent > 0.2) signal = 'bullish';
  else if (breadthPercent < -0.2) signal = 'bearish';
  else signal = 'neutral';

  return { advanceDeclineRatio: adRatio, breadthPercent, signal };
}

export function calculateMcClellanOscillator(
  advancing: number[],
  declining: number[]
): number[] {
  const netAdvances: number[] = [];
  for (let i = 0; i < advancing.length; i++) {
    netAdvances.push(advancing[i] - declining[i]);
  }

  const ema19 = calculateEMA(netAdvances, 19);
  const ema39 = calculateEMA(netAdvances, 39);

  const oscillator: number[] = [];
  for (let i = 0; i < netAdvances.length; i++) {
    oscillator.push(ema19[i] - ema39[i]);
  }

  return oscillator;
}

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema = data[0];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema = data[0];
    } else {
      ema = (data[i] - ema) * multiplier + ema;
    }
    result.push(ema);
  }

  return result;
}
