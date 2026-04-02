/**
 * ZScoreEngine - Z分数引擎
 * 标准化评分、异常检测
 */

export function zScore(value: number, mean: number, std: number): number {
  return std > 0 ? (value - mean) / std : 0;
}

export function zScoreSeries(data: number[]): number[] {
  const n = data.length;
  if (n === 0) return [];
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return data.map(v => Math.round(zScore(v, mean, std) * 10000) / 10000);
}

export function detectOutliers(data: number[], threshold: number = 2): { indices: number[]; values: number[] } {
  const zs = zScoreSeries(data);
  const indices: number[] = [], values: number[] = [];
  zs.forEach((z, i) => { if (Math.abs(z) > threshold) { indices.push(i); values.push(data[i]); } });
  return { indices, values };
}

export function winsorize(data: number[], limit: number = 0.05): number[] {
  const sorted = [...data].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * limit)];
  const hi = sorted[Math.ceil(sorted.length * (1 - limit)) - 1];
  return data.map(v => Math.max(lo, Math.min(hi, v)));
}
