/**
 * CorrelationRegimeEngine - 相关性状态检测引擎
 * 通过滚动窗口相关性矩阵识别市场regime
 */

export type Matrix = number[][];

export function rollingCorrelation(x: number[], y: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = window - 1; i < x.length; i++) {
    const sx = x.slice(i - window + 1, i + 1);
    const sy = y.slice(i - window + 1, i + 1);
    result.push(pearsonCorr(sx, sy));
  }
  return result;
}

export function pearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i] - mx, yi = y[i] - my;
    num += xi * yi; dx += xi * xi; dy += yi * yi;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

export function avgCorrelation(returns: Matrix): number {
  if (returns.length < 2) return 0;
  let sum = 0, count = 0;
  for (let i = 0; i < returns.length; i++) {
    for (let j = i + 1; j < returns.length; j++) {
      sum += pearsonCorr(returns[i], returns[j]);
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

export function regimeClassification(avgCorr: number): string {
  if (avgCorr > 0.7) return 'CRISIS';
  if (avgCorr > 0.4) return 'RISK_ON';
  if (avgCorr > 0.1) return 'NORMAL';
  if (avgCorr > -0.2) return 'DIVERSIFIED';
  return 'EXTREME_NEGATIVE';
}
