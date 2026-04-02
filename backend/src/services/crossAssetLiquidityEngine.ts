/**
 * CrossAssetLiquidityEngine - 跨资产流动性引擎
 * 评估股票、债券、商品等跨资产流动性状况
 */

export interface LiquiditySnapshot {
  asset: string;
  bidAskSpread: number;
  volume: number;
  turnoverRate: number;
  depth: number;          // 盘口深度
  resilience: number;     // 价格恢复速度 (0-1)
  timestamp: number;
}

export interface CrossAssetLiquidity {
  compositeScore: number;   // 0-100
  stockLiquidity: number;
  bondLiquidity: number;
  commodityLiquidity: number;
  regime: 'abundant' | 'normal' | 'tight' | 'crisis';
  riskSignal: boolean;
  details: Record<string, number>;
}

function normalizeSpread(spread: number): number {
  if (spread <= 0) return 0;
  return Math.max(0, Math.min(100, 100 * Math.exp(-spread * 50)));
}

function normalizeVolume(vol: number, avgVol: number): number {
  if (avgVol <= 0) return 50;
  const ratio = vol / avgVol;
  return Math.min(100, ratio * 50);
}

function assetScore(snap: LiquiditySnapshot): number {
  const spreadScore = normalizeSpread(snap.bidAskSpread);
  const volScore = normalizeVolume(snap.volume, snap.volume);
  const depthScore = Math.min(100, snap.depth * 10);
  const resScore = snap.resilience * 100;
  return spreadScore * 0.3 + volScore * 0.25 + depthScore * 0.25 + resScore * 0.2;
}

export function assessCrossAssetLiquidity(
  snapshots: LiquiditySnapshot[],
  avgVolumes: Record<string, number> = {}
): CrossAssetLiquidity | null {
  if (snapshots.length < 2) return null;

  const details: Record<string, number> = {};
  let stockScores: number[] = [], bondScores: number[] = [], commodityScores: number[] = [];

  for (const snap of snapshots) {
    const volNorm = avgVolumes[snap.asset] ?? snap.volume;
    const spreadScore = normalizeSpread(snap.bidAskSpread);
    const volScore = normalizeVolume(snap.volume, volNorm);
    const depthScore = Math.min(100, snap.depth * 10);
    const resScore = snap.resilience * 100;
    const score = spreadScore * 0.3 + volScore * 0.25 + depthScore * 0.25 + resScore * 0.2;
    details[snap.asset] = score;

    if (snap.asset.startsWith('stock') || snap.asset.startsWith('6') || snap.asset.startsWith('0')) {
      stockScores.push(score);
    } else if (snap.asset.startsWith('bond')) {
      bondScores.push(score);
    } else {
      commodityScores.push(score);
    }
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 50;
  const stockLiquidity = avg(stockScores);
  const bondLiquidity = avg(bondScores);
  const commodityLiquidity = avg(commodityScores);

  const compositeScore = stockLiquidity * 0.5 + bondLiquidity * 0.3 + commodityLiquidity * 0.2;

  let regime: CrossAssetLiquidity['regime'];
  if (compositeScore >= 70) regime = 'abundant';
  else if (compositeScore >= 45) regime = 'normal';
  else if (compositeScore >= 25) regime = 'tight';
  else regime = 'crisis';

  return {
    compositeScore: Math.round(compositeScore * 100) / 100,
    stockLiquidity: Math.round(stockLiquidity * 100) / 100,
    bondLiquidity: Math.round(bondLiquidity * 100) / 100,
    commodityLiquidity: Math.round(commodityLiquidity * 100) / 100,
    regime,
    riskSignal: regime === 'tight' || regime === 'crisis',
    details,
  };
}

export function detectLiquidityShock(
  current: CrossAssetLiquidity,
  previous: CrossAssetLiquidity,
  threshold: number = 15
): boolean {
  return (previous.compositeScore - current.compositeScore) > threshold;
}
