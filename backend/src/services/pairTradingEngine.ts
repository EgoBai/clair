/**
 * PairTradingEngine - 配对交易引擎
 * 基于协整关系和价差均值回归进行配对交易分析
 */

export interface PriceData {
  date: string;
  close: number;
}

export interface PairResult {
  spread: number[];
  mean: number;
  std: number;
  zScore: number;
  currentSpread: number;
  signal: 'long_spread' | 'short_spread' | 'neutral';
  halfLife: number;
  hurst: number;
  cointegrationScore: number;
  entryThreshold: number;
  exitThreshold: number;
}

export interface PairConfig {
  entryZScore: number;
  exitZScore: number;
  stopLossZScore: number;
  lookback: number;
}

const DEFAULT_CONFIG: PairConfig = {
  entryZScore: 2.0,
  exitZScore: 0.5,
  stopLossZScore: 4.0,
  lookback: 60,
};

function computeHedgeRatio(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 1;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  return den === 0 ? 1 : num / den;
}

function computeHalfLife(spread: number[]): number {
  const n = spread.length;
  if (n < 3) return n;
  const y = spread.slice(1);
  const x = spread.slice(0, -1);
  const mean_x = x.reduce((s, v) => s + v, 0) / x.length;
  const mean_y = y.reduce((s, v) => s + v, 0) / y.length;
  let num = 0, den = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mean_x) * (y[i] - mean_y);
    den += (x[i] - mean_x) ** 2;
  }
  const beta = den === 0 ? 0 : num / den;
  if (beta >= 1) return 999;
  const hl = -Math.log(2) / Math.log(Math.abs(beta));
  return Math.max(1, Math.min(999, hl));
}

function computeHurst(spread: number[]): number {
  const n = spread.length;
  if (n < 20) return 0.5;
  const maxLag = Math.min(20, Math.floor(n / 2));
  const variances: number[] = [];
  const lags: number[] = [];

  for (let lag = 2; lag <= maxLag; lag++) {
    const chunks = Math.floor(n / lag);
    let totalVar = 0;
    for (let c = 0; c < chunks; c++) {
      const segment = spread.slice(c * lag, (c + 1) * lag);
      const mean = segment.reduce((s, v) => s + v, 0) / segment.length;
      const cumDev = segment.reduce((s, v) => s + (v - mean), 0);
      const range = Math.max(...segment) - Math.min(...segment);
      const std = Math.sqrt(segment.reduce((s, v) => s + (v - mean) ** 2, 0) / segment.length);
      if (std > 0) totalVar += (range / std) ** 2;
    }
    if (totalVar > 0) {
      variances.push(Math.log(totalVar / chunks));
      lags.push(Math.log(lag));
    }
  }

  if (variances.length < 2) return 0.5;
  const n2 = variances.length;
  const mx = lags.reduce((s, v) => s + v, 0) / n2;
  const my = variances.reduce((s, v) => s + v, 0) / n2;
  let num = 0, den = 0;
  for (let i = 0; i < n2; i++) {
    num += (lags[i] - mx) * (variances[i] - my);
    den += (lags[i] - mx) ** 2;
  }
  const hurst = den === 0 ? 0.5 : num / den;
  return Math.max(0, Math.min(1, hurst));
}

export function analyzePair(
  seriesA: PriceData[],
  seriesB: PriceData[],
  config: Partial<PairConfig> = {}
): PairResult | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const len = Math.min(seriesA.length, seriesB.length, cfg.lookback);
  if (len < 10) return null;

  const a = seriesA.slice(-len).map(p => p.close);
  const b = seriesB.slice(-len).map(p => p.close);

  const hedgeRatio = computeHedgeRatio(b, a);
  const spread = a.map((v, i) => v - hedgeRatio * b[i]);

  const mean = spread.reduce((s, v) => s + v, 0) / spread.length;
  const std = Math.sqrt(spread.reduce((s, v) => s + (v - mean) ** 2, 0) / (spread.length - 1));
  const currentSpread = spread[spread.length - 1];
  const zScore = std > 0 ? (currentSpread - mean) / std : 0;

  const halfLife = computeHalfLife(spread);
  const hurst = computeHurst(spread);
  const cointegrationScore = Math.max(0, 1 - hurst);

  let signal: PairResult['signal'];
  if (zScore > cfg.entryZScore) signal = 'short_spread';
  else if (zScore < -cfg.entryZScore) signal = 'long_spread';
  else if (Math.abs(zScore) < cfg.exitZScore) signal = 'neutral';
  else signal = 'neutral';

  return {
    spread,
    mean,
    std,
    zScore,
    currentSpread,
    signal,
    halfLife,
    hurst,
    cointegrationScore,
    entryThreshold: cfg.entryZScore,
    exitThreshold: cfg.exitZScore,
  };
}

export function batchPairAnalysis(
  pairs: Array<{ a: PriceData[]; b: PriceData[]; name: string }>,
  config: Partial<PairConfig> = {}
): Array<{ name: string; result: PairResult | null }> {
  return pairs.map(p => ({ name: p.name, result: analyzePair(p.a, p.b, config) }));
}
