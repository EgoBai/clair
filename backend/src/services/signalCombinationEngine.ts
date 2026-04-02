/**
 * SignalCombinationEngine - 信号组合引擎
 * 多因子信号加权、正交化、动态权重调整
 */

export function weightedCombine(signals: number[][], weights: number[]): number[] {
  if (signals.length === 0 || signals.length !== weights.length) return [];
  const len = signals[0].length;
  const result: number[] = Array(len).fill(0);
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  signals.forEach((sig, i) => {
    sig.forEach((v, j) => { if (j < len) result[j] += v * (weights[i] / wSum); });
  });
  return result;
}

export function rankNormalize(signal: number[]): number[] {
  const indexed = signal.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const result = new Array(signal.length);
  indexed.forEach((item, rank) => { result[item.i] = (rank / (signal.length - 1 || 1)) * 2 - 1; });
  return result;
}

export function icWeight(signals: number[][], returns: number[]): number[] {
  return signals.map(sig => {
    const n = Math.min(sig.length, returns.length);
    if (n < 2) return 0;
    const mx = sig.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const my = returns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const xi = sig[i] - mx, yi = returns[i] - my;
      num += xi * yi; dx += xi * xi; dy += yi * yi;
    }
    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? 0 : num / denom;
  });
}

export function dynamicRebalance(currentWeights: number[], targetWeights: number[], maxTurnover: number): number[] {
  const diff = targetWeights.map((t, i) => t - (currentWeights[i] || 0));
  const totalTurnover = diff.reduce((a, b) => a + Math.abs(b), 0) / 2;
  if (totalTurnover <= maxTurnover) return targetWeights;
  const scale = maxTurnover / totalTurnover;
  return currentWeights.map((w, i) => w + diff[i] * scale);
}
