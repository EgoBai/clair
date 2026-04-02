/**
 * CarryTradeEngine - 套利交易引擎
 * 评估不同资产的carry收益和风险
 */

export interface CarryAsset {
  name: string;
  spotYield: number;
  fundingCost: number;
  leverage: number;
  volatility: number;
}

export interface CarryResult {
  netCarry: number;
  carryYield: number;
  sharpeRatio: number;
  attractiveness: 'high' | 'medium' | 'low' | 'negative';
  riskAdjustedCarry: number;
  breakEvenDays: number;
}

export function computeCarry(asset: CarryAsset, holdingDays: number = 365): CarryResult | null {
  if (holdingDays <= 0) return null;
  const annualCarry = (asset.spotYield - asset.fundingCost) * asset.leverage;
  const netCarry = annualCarry;
  const carryYield = annualCarry * 100;
  const sharpeRatio = asset.volatility > 0 ? annualCarry / asset.volatility : 0;
  const riskAdjustedCarry = annualCarry / (1 + asset.volatility);

  let attractiveness: CarryResult['attractiveness'];
  if (netCarry > 0.05 && sharpeRatio > 0.5) attractiveness = 'high';
  else if (netCarry > 0.02 && sharpeRatio > 0.2) attractiveness = 'medium';
  else if (netCarry > 0) attractiveness = 'low';
  else attractiveness = 'negative';

  const dailyCarry = annualCarry / 365;
  const breakEvenDays = dailyCarry > 0 ? Math.ceil(asset.volatility / dailyCarry) : Infinity;

  return { netCarry: Math.round(netCarry * 10000) / 10000, carryYield: Math.round(carryYield * 100) / 100, sharpeRatio: Math.round(sharpeRatio * 100) / 100, attractiveness, riskAdjustedCarry: Math.round(riskAdjustedCarry * 10000) / 10000, breakEvenDays };
}

export function rankCarryAssets(assets: CarryAsset[]): { name: string; score: number }[] {
  return assets.map(a => {
    const r = computeCarry(a);
    return { name: a.name, score: r ? r.riskAdjustedCarry : 0 };
  }).sort((a, b) => b.score - a.score);
}
