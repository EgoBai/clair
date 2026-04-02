/**
 * BayesianEstimator - 贝叶斯估计引擎
 * Beta-Binomial共轭先验用于胜率估计
 */

export interface BetaPrior {
  alpha: number;
  beta: number;
}

export interface BetaPosterior extends BetaPrior {
  mean: number;
  mode: number;
  variance: number;
  credible95: [number, number];
}

export function updateBetaPrior(prior: BetaPrior, successes: number, failures: number): BetaPosterior {
  const a = prior.alpha + successes;
  const b = prior.beta + failures;
  const mean = a / (a + b);
  const mode = a > 1 && b > 1 ? (a - 1) / (a + b - 2) : mean;
  const variance = (a * b) / ((a + b) ** 2 * (a + b + 1));
  const lo = Math.max(0, mean - 1.96 * Math.sqrt(variance));
  const hi = Math.min(1, mean + 1.96 * Math.sqrt(variance));
  return { alpha: a, beta: b, mean: Math.round(mean * 10000) / 10000, mode: Math.round(mode * 10000) / 10000, variance: Math.round(variance * 10000) / 10000, credible95: [Math.round(lo * 10000) / 10000, Math.round(hi * 10000) / 10000] };
}

export function shrinkageEstimate(observed: number, prior: number, sampleSize: number, shrinkageFactor: number = 10): number {
  const w = sampleSize / (sampleSize + shrinkageFactor);
  return Math.round((w * observed + (1 - w) * prior) * 10000) / 10000;
}
