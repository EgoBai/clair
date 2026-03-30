/**
 * Machine Learning Feature Engineering Engine
 * 机器学习特征工程引擎 - 技术指标特征、统计特征、时间序列特征
 */

export interface FeatureVector {
  timestamp: number;
  features: Record<string, number>;
  label?: number;
}

export interface FeatureConfig {
  name: string;
  type: 'technical' | 'statistical' | 'temporal' | 'cross_sectional';
  lookback: number;
  normalize: boolean;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  correlation: number;
  ic: number; // Information Coefficient
}

export interface FeaturePipeline {
  features: FeatureConfig[];
  scalingMethod: 'zscore' | 'minmax' | 'robust' | 'none';
  handleMissing: 'drop' | 'forward_fill' | 'mean' | 'median';
}

export function calculateSMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

export function calculateEMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      ema = prices[0];
    } else {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    result.push(ema);
  }
  return result;
}

export function calculateRSI(prices: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
      result.push(100 - 100 / (1 + rs));
    }
  }
  return result;
}

export function calculateMACD(prices: number[], fast: number = 12, slow: number = 26, signal: number = 9): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  const emaFast = calculateEMA(prices, fast);
  const emaSlow = calculateEMA(prices, slow);

  const macd: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macd.push(emaFast[i] - emaSlow[i]);
  }

  const signalLine = calculateEMA(macd, signal);
  const histogram = macd.map((m, i) => m - signalLine[i]);

  return { macd, signal: signalLine, histogram };
}

export function calculateBollingerBands(prices: number[], period: number = 20, numStd: number = 2): {
  upper: number[];
  middle: number[];
  lower: number[];
  width: number[];
  percentB: number[];
} {
  const middle = calculateSMA(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const width: number[] = [];
  const percentB: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      width.push(NaN);
      percentB.push(NaN);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - middle[i]) ** 2, 0) / period);
      upper.push(middle[i] + numStd * std);
      lower.push(middle[i] - numStd * std);
      width.push((upper[i] - lower[i]) / middle[i]);
      percentB.push((prices[i] - lower[i]) / (upper[i] - lower[i]));
    }
  }

  return { upper, middle, lower, width, percentB };
}

export function calculateATR(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): number[] {
  const trueRange: number[] = [high[0] - low[0]];

  for (let i = 1; i < close.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    trueRange.push(tr);
  }

  return calculateSMA(trueRange, period);
}

export function calculateOBV(close: number[], volume: number[]): number[] {
  const obv: number[] = [volume[0]];

  for (let i = 1; i < close.length; i++) {
    if (close[i] > close[i - 1]) {
      obv.push(obv[i - 1] + volume[i]);
    } else if (close[i] < close[i - 1]) {
      obv.push(obv[i - 1] - volume[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }

  return obv;
}

export function calculateVWAP(
  high: number[],
  low: number[],
  close: number[],
  volume: number[]
): number[] {
  const vwap: number[] = [];
  let cumVP = 0;
  let cumV = 0;

  for (let i = 0; i < close.length; i++) {
    const typical = (high[i] + low[i] + close[i]) / 3;
    cumVP += typical * volume[i];
    cumV += volume[i];
    vwap.push(cumV > 0 ? cumVP / cumV : close[i]);
  }

  return vwap;
}

export function calculateStochastic(
  high: number[],
  low: number[],
  close: number[],
  kPeriod: number = 14,
  dPeriod: number = 3
): { k: number[]; d: number[] } {
  const k: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i < kPeriod - 1) {
      k.push(NaN);
    } else {
      const highest = Math.max(...high.slice(i - kPeriod + 1, i + 1));
      const lowest = Math.min(...low.slice(i - kPeriod + 1, i + 1));
      const range = highest - lowest;
      k.push(range > 0 ? ((close[i] - lowest) / range) * 100 : 50);
    }
  }

  const d = calculateSMA(k.filter(v => !isNaN(v)), dPeriod);
  const dPadded = [...Array(close.length - d.length).fill(NaN), ...d];

  return { k, d: dPadded };
}

export function calculateWilliamsR(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): number[] {
  const result: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const highest = Math.max(...high.slice(i - period + 1, i + 1));
      const lowest = Math.min(...low.slice(i - period + 1, i + 1));
      const range = highest - lowest;
      result.push(range > 0 ? ((highest - close[i]) / range) * -100 : -50);
    }
  }

  return result;
}

export function calculateCCI(
  high: number[],
  low: number[],
  close: number[],
  period: number = 20
): number[] {
  const result: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const typical: number[] = [];
      for (let j = i - period + 1; j <= i; j++) {
        typical.push((high[j] + low[j] + close[j]) / 3);
      }
      const sma = typical.reduce((a, b) => a + b, 0) / period;
      const meanDev = typical.reduce((s, v) => s + Math.abs(v - sma), 0) / period;
      const cci = meanDev > 0 ? (typical[period - 1] - sma) / (0.015 * meanDev) : 0;
      result.push(cci);
    }
  }

  return result;
}

export function calculateMomentum(prices: number[], period: number = 10): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      result.push(prices[i] - prices[i - period]);
    }
  }
  return result;
}

export function calculateROC(prices: number[], period: number = 10): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      result.push(((prices[i] - prices[i - period]) / prices[i - period]) * 100);
    }
  }
  return result;
}

export function calculateADX(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): number[] {
  const atr = calculateATR(high, low, close, period);
  const adx: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i < period * 2) {
      adx.push(NaN);
    } else {
      // Simplified ADX
      const upMove = high[i] - high[i - 1];
      const downMove = low[i - 1] - low[i];
      const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
      const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

      const plusDI = atr[i] > 0 ? (plusDM / atr[i]) * 100 : 0;
      const minusDI = atr[i] > 0 ? (minusDM / atr[i]) * 100 : 0;

      const dx = plusDI + minusDI > 0
        ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100
        : 0;

      adx.push(dx);
    }
  }

  return adx;
}

export function standardize(values: number[]): number[] {
  const valid = values.filter(v => !isNaN(v));
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const std = Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length);
  return values.map(v => isNaN(v) ? NaN : std > 0 ? (v - mean) / std : 0);
}

export function minMaxScale(values: number[]): number[] {
  const valid = values.filter(v => !isNaN(v));
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min;
  return values.map(v => isNaN(v) ? NaN : range > 0 ? (v - min) / range : 0.5);
}

export function calculateFeatureIC(
  features: number[],
  labels: number[]
): number {
  const n = Math.min(features.length, labels.length);
  if (n < 2) return 0;

  // Rank correlation (Spearman)
  const rankF = features.slice(0, n).map((v, _, arr) => arr.filter(x => x < v).length + 1);
  const rankL = labels.slice(0, n).map((v, _, arr) => arr.filter(x => x < v).length + 1);

  const meanF = rankF.reduce((a, b) => a + b, 0) / n;
  const meanL = rankL.reduce((a, b) => a + b, 0) / n;

  let cov = 0, varF = 0, varL = 0;
  for (let i = 0; i < n; i++) {
    const df = rankF[i] - meanF;
    const dl = rankL[i] - meanL;
    cov += df * dl;
    varF += df * df;
    varL += dl * dl;
  }

  return varF * varL > 0 ? cov / Math.sqrt(varF * varL) : 0;
}

export function generateFeatureMatrix(
  prices: number[],
  high: number[],
  low: number[],
  close: number[],
  volume: number[]
): FeatureVector[] {
  const features: FeatureVector[] = [];
  const sma5 = calculateSMA(close, 5);
  const sma20 = calculateSMA(close, 20);
  const rsi = calculateRSI(close);
  const macd = calculateMACD(close);
  const bb = calculateBollingerBands(close);
  const atr = calculateATR(high, low, close);
  const obv = calculateOBV(close, volume);
  const momentum = calculateMomentum(close);
  const roc = calculateROC(close);

  for (let i = 0; i < close.length; i++) {
    features.push({
      timestamp: i,
      features: {
        sma5_ratio: isNaN(sma5[i]) ? NaN : close[i] / sma5[i],
        sma20_ratio: isNaN(sma20[i]) ? NaN : close[i] / sma20[i],
        sma_cross: isNaN(sma5[i]) || isNaN(sma20[i]) ? NaN : sma5[i] / sma20[i],
        rsi: rsi[i],
        macd: macd.macd[i],
        macd_signal: macd.signal[i],
        macd_histogram: macd.histogram[i],
        bb_percent: bb.percentB[i],
        bb_width: bb.width[i],
        atr_ratio: isNaN(atr[i]) ? NaN : atr[i] / close[i],
        obv_change: i > 0 ? (obv[i] - obv[i - 1]) / Math.abs(obv[i - 1]) : NaN,
        momentum: momentum[i],
        roc: roc[i],
        volume_ratio: i > 0 ? volume[i] / (volume.slice(Math.max(0, i - 20), i).reduce((a, b) => a + b, 0) / Math.min(20, i)) : NaN,
      },
    });
  }

  return features;
}
