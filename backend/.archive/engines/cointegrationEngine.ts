/**
 * CointegrationEngine - 协整检验引擎
 * Engle-Granger两步法协整检验
 */

export interface CointegrationResult {
  hedgeRatio: number;
  spread: number[];
  spreadMean: number;
  spreadStd: number;
  adfStatistic: number;
  halfLife: number;
  isCointegrated: boolean;
  confidence: 'high' | 'medium' | 'low';
}

function olsRegression(y: number[], x: number[]): { alpha: number; beta: number } {
  const n = Math.min(y.length, x.length);
  const sx = x.reduce((s, v) => s + v, 0) / n;
  const sy = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - sx) * (y[i] - sy); den += (x[i] - sx) ** 2; }
  const beta = den > 0 ? num / den : 0;
  return { alpha: sy - beta * sx, beta };
}

function adfTest(series: number[]): number {
  const n = series.length;
  if (n < 5) return 0;
  const diffs: number[] = [];
  const lags: number[] = [];
  for (let i = 1; i < n; i++) { diffs.push(series[i] - series[i - 1]); lags.push(series[i - 1]); }
  const reg = olsRegression(diffs, lags);
  const se = Math.sqrt(diffs.reduce((s, d, i) => s + (d - reg.alpha - reg.beta * lags[i]) ** 2, 0) / (diffs.length - 2)) / Math.sqrt(lags.reduce((s, v) => s + v ** 2, 0));
  return se > 0 ? reg.beta / se : 0;
}

export function testCointegration(series1: number[], series2: number[]): CointegrationResult | null {
  const n = Math.min(series1.length, series2.length);
  if (n < 10) return null;
  const s1 = series1.slice(0, n), s2 = series2.slice(0, n);
  const { alpha, beta } = olsRegression(s1, s2);
  const spread = s1.map((v, i) => v - alpha - beta * s2[i]);
  const mean = spread.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(spread.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const adf = adfTest(spread);
  const ar1 = olsRegression(spread.slice(1), spread.slice(0, -1));
  const hl = ar1.beta > 0 && ar1.beta < 1 ? Math.max(1, Math.round(-Math.log(2) / Math.log(ar1.beta))) : n;
  const isCointegrated = adf < -3.0;
  const confidence = adf < -3.5 ? 'high' : adf < -3.0 ? 'medium' : 'low';
  return { hedgeRatio: Math.round(beta * 10000) / 10000, spread, spreadMean: Math.round(mean * 10000) / 10000, spreadStd: Math.round(std * 10000) / 10000, adfStatistic: Math.round(adf * 100) / 100, halfLife: hl, isCointegrated, confidence };
}
