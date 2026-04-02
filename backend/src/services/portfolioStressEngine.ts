/**
 * PortfolioStressEngine - 组合压力测试引擎
 * 多资产组合在极端场景下的损失估算
 */

export interface Asset { code: string; weight: number; returns: number[]; }

export function portfolioReturn(assets: Asset[]): number[] {
  if (assets.length === 0) return [];
  const len = Math.min(...assets.map(a => a.returns.length));
  const result: number[] = Array(len).fill(0);
  assets.forEach(a => {
    for (let i = 0; i < len; i++) result[i] += a.weight * a.returns[i];
  });
  return result;
}

export function concentrationRisk(weights: number[]): number {
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const normalized = weights.map(w => w / wSum);
  return normalized.reduce((a, b) => a + b * b, 0);
}

export function diversificationRatio(assets: Asset[]): number {
  if (assets.length === 0) return 0;
  const vols = assets.map(a => {
    const mean = a.returns.reduce((s, v) => s + v, 0) / (a.returns.length || 1);
    return Math.sqrt(a.returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (a.returns.length || 1));
  });
  const wVols = assets.reduce((s, a, i) => s + Math.abs(a.weight) * vols[i], 0);
  const pRet = portfolioReturn(assets);
  const pMean = pRet.reduce((s, v) => s + v, 0) / (pRet.length || 1);
  const pVol = Math.sqrt(pRet.reduce((s, v) => s + (v - pMean) ** 2, 0) / (pRet.length || 1));
  if (pVol === 0) return wVols > 0 ? Infinity : 0;
  return wVols / pVol;
}

export function marginalRiskContribution(assets: Asset[]): Map<string, number> {
  const result = new Map<string, number>();
  const pRet = portfolioReturn(assets);
  const pVol = Math.sqrt(pRet.reduce((s, v) => s + v ** 2, 0) / (pRet.length || 1));
  if (pVol === 0) { assets.forEach(a => result.set(a.code, 0)); return result; }
  assets.forEach(a => {
    const vol = Math.sqrt(a.returns.reduce((s, v) => s + v ** 2, 0) / (a.returns.length || 1));
    result.set(a.code, a.weight * vol / pVol);
  });
  return result;
}
