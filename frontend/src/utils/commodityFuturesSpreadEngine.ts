/**
 * 商品期货价差引擎
 * 分析期货期限结构、跨品种价差、套利机会
 */

export interface FuturesContract {
  symbol: string;
  expiry: string;
  price: number;
  openInterest: number;
  volume: number;
}

export interface SpreadAnalysis {
  name: string;
  nearContract: string;
  farContract: string;
  spread: number;
  spreadPct: number;
  annualizedCarry: number;
  signal: 'backwardation' | 'contango' | 'flat';
  arbitrageOpportunity: boolean;
  expectedReturn: number;
}

/**
 * 期限结构分析
 */
export function termStructureAnalysis(contracts: FuturesContract[]): {
  structure: 'contango' | 'backwardation' | 'mixed';
  curve: { expiry: string; price: number; premium: number }[];
  rollYield: number;
  avgPremium: number;
} {
  const sorted = [...contracts].sort((a, b) => a.expiry.localeCompare(b.expiry));
  if (sorted.length < 2) {
    return { structure: 'contango', curve: [], rollYield: 0, avgPremium: 0 };
  }

  const spot = sorted[0].price;
  const curve = sorted.map(c => ({
    expiry: c.expiry,
    price: c.price,
    premium: spot > 0 ? (c.price - spot) / spot : 0,
  }));

  let contangoCount = 0, backwardationCount = 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].price > curve[i - 1].price) contangoCount++;
    else backwardationCount++;
  }

  const structure = contangoCount > backwardationCount ? 'contango' :
    backwardationCount > contangoCount ? 'backwardation' : 'mixed';

  const rollYield = spot > 0 ? (sorted[sorted.length - 1].price - spot) / spot / (sorted.length * 0.25) : 0;
  const avgPremium = curve.reduce((s, c) => s + c.premium, 0) / curve.length;

  return {
    structure,
    curve,
    rollYield: Math.round(rollYield * 10000) / 10000,
    avgPremium: Math.round(avgPremium * 10000) / 10000,
  };
}

/**
 * 跨期价差分析
 */
export function calendarSpread(near: FuturesContract, far: FuturesContract): SpreadAnalysis {
  const spread = far.price - near.price;
  const spreadPct = near.price > 0 ? spread / near.price : 0;
  const daysDiff = Math.max(1, (new Date(far.expiry).getTime() - new Date(near.expiry).getTime()) / 86400000);
  const annualizedCarry = near.price > 0 ? (spread / near.price) * (365 / daysDiff) : 0;

  return {
    name: `${near.symbol}-${far.symbol}跨期`,
    nearContract: near.symbol,
    farContract: far.symbol,
    spread: Math.round(spread * 100) / 100,
    spreadPct: Math.round(spreadPct * 10000) / 10000,
    annualizedCarry: Math.round(annualizedCarry * 10000) / 10000,
    signal: spread > 0 ? 'contango' : spread < 0 ? 'backwardation' : 'flat',
    arbitrageOpportunity: Math.abs(annualizedCarry) > 0.15,
    expectedReturn: Math.round(Math.abs(annualizedCarry) * 100) / 100,
  };
}

/**
 * 跨品种价差
 */
export function interCommoditySpread(
  commodityA: FuturesContract[],
  commodityB: FuturesContract[],
  ratio: number = 1
): {
  spread: number;
  zScore: number;
  signal: 'spread_wide' | 'spread_narrow' | 'normal';
  historicalMean: number;
} {
  const priceA = commodityA.length > 0 ? commodityA[commodityA.length - 1].price : 0;
  const priceB = commodityB.length > 0 ? commodityB[0].price : 0;
  const spread = priceA - ratio * priceB;

  const spreads = commodityA.map((a, i) => {
    const b = commodityB[i % commodityB.length];
    return a.price - ratio * b.price;
  });
  const mean = spreads.reduce((a, b) => a + b, 0) / Math.max(1, spreads.length);
  const std = Math.sqrt(spreads.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, spreads.length));
  const zScore = std > 0 ? (spread - mean) / std : 0;

  return {
    spread: Math.round(spread * 100) / 100,
    zScore: Math.round(zScore * 100) / 100,
    signal: zScore > 1.5 ? 'spread_wide' : zScore < -1.5 ? 'spread_narrow' : 'normal',
    historicalMean: Math.round(mean * 100) / 100,
  };
}
