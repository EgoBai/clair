/**
 * HedgingRatioEngine - 对冲比率引擎
 * 计算动态对冲比率和最优对冲比例
 */

export interface HedgeInput {
  spotReturns: number[];
  hedgeReturns: number[];
  lookback: number;
}

export interface HedgeResult {
  hedgeRatio: number;
  hedgeEfficiency: number;    // 方差缩减比例
  residualRisk: number;
  optimalRatio: number;
  correlation: number;
  basisRisk: number;
}

function corr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return Math.sqrt(dx * dy) > 0 ? num / Math.sqrt(dx * dy) : 0;
}

function variance(arr: number[]): number {
  const n = arr.length;
  if (n < 2) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / n;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / n;
}

export function computeHedgeRatio(input: HedgeInput): HedgeResult | null {
  const n = Math.min(input.spotReturns.length, input.hedgeReturns.length);
  if (n < input.lookback || n < 5) return null;
  const spot = input.spotReturns.slice(0, n);
  const hedge = input.hedgeReturns.slice(0, n);

  const c = corr(spot, hedge);
  const vs = variance(spot);
  const vh = variance(hedge);
  const hedgeRatio = vh > 0 ? c * Math.sqrt(vs / vh) : 0;
  const hedgedReturns = spot.map((s, i) => s - hedgeRatio * hedge[i]);
  const vhedge = variance(hedgedReturns);
  const hedgeEfficiency = vs > 0 ? 1 - vhedge / vs : 0;

  return {
    hedgeRatio: Math.round(hedgeRatio * 10000) / 10000,
    hedgeEfficiency: Math.round(Math.max(0, hedgeEfficiency) * 10000) / 10000,
    residualRisk: Math.round(vhedge * 10000) / 10000,
    optimalRatio: Math.round(hedgeRatio * 10000) / 10000,
    correlation: Math.round(c * 10000) / 10000,
    basisRisk: Math.round((1 - Math.abs(c)) * 10000) / 10000,
  };
}
