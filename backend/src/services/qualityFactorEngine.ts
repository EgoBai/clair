/**
 * QualityFactorEngine - 质量因子引擎
 * 盈利稳定性、增长质量、应计质量
 */

export interface QualityMetrics {
  code: string;
  earnings: number[];
  revenues: number[];
  cashFlows: number[];
  roes: number[];
}

export function earningsStability(earnings: number[]): number {
  if (earnings.length < 2) return 0;
  const growth = [];
  for (let i = 1; i < earnings.length; i++) {
    if (earnings[i - 1] !== 0) growth.push((earnings[i] - earnings[i - 1]) / Math.abs(earnings[i - 1]));
  }
  if (growth.length === 0) return 0;
  const mean = growth.reduce((a, b) => a + b, 0) / growth.length;
  const std = Math.sqrt(growth.reduce((a, b) => a + (b - mean) ** 2, 0) / growth.length);
  return std === 0 ? 1 : 1 / (1 + std);
}

export function accrualRatio(earnings: number[], cashFlows: number[]): number {
  const n = Math.min(earnings.length, cashFlows.length);
  if (n === 0) return 0;
  const avgEarn = earnings.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const avgCF = cashFlows.slice(0, n).reduce((a, b) => a + b, 0) / n;
  if (avgEarn === 0) return 0;
  return (avgEarn - avgCF) / Math.abs(avgEarn);
}

export function roeStability(roes: number[]): number {
  if (roes.length < 2) return 0;
  const mean = roes.reduce((a, b) => a + b, 0) / roes.length;
  const std = Math.sqrt(roes.reduce((a, b) => a + (b - mean) ** 2, 0) / roes.length);
  return mean === 0 ? 0 : mean / (std || 1);
}

export function growthQuality(revenues: number[], earnings: number[]): number {
  const n = Math.min(revenues.length, earnings.length);
  if (n < 2) return 0;
  let revGrowth = 0, earGrowth = 0;
  for (let i = 1; i < n; i++) {
    if (revenues[i - 1] !== 0) revGrowth += (revenues[i] - revenues[i - 1]) / Math.abs(revenues[i - 1]);
    if (earnings[i - 1] !== 0) earGrowth += (earnings[i] - earnings[i - 1]) / Math.abs(earnings[i - 1]);
  }
  return (revGrowth + earGrowth) / (2 * (n - 1));
}

export function compositeQuality(m: QualityMetrics): number {
  return earningsStability(m.earnings) * 0.3 +
    (1 - Math.abs(accrualRatio(m.earnings, m.cashFlows))) * 0.3 +
    Math.min(roeStability(m.roes), 5) / 5 * 0.2 +
    Math.max(0, growthQuality(m.revenues, m.earnings)) * 0.2;
}
