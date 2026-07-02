/**
 * Options Chain Analysis Engine
 * 
 * 期权链分析引擎 - 分析期权链数据、隐含波动率、Delta分布、最大痛点
 */

// ===== Types =====

export interface OptionContract {
  strike: number;
  expiry: number; // days to expiry
  type: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface OptionChainAnalysis {
  maxPain: number;
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  totalCallOI: number;
  totalPutOI: number;
  skew: number;
  termStructure: TermStructurePoint[];
  supportZone: [number, number];
  resistanceZone: [number, number];
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface TermStructurePoint {
  daysToExpiry: number;
  avgIV: number;
  callIV: number;
  putIV: number;
}

export interface GreeksAnalysis {
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  gammaExposure: number;
  dealerPosition: 'long_gamma' | 'short_gamma' | 'neutral';
}

// ===== Max Pain Calculation =====

export function calculateMaxPain(contracts: OptionChain[]): number {
  const strikes = [...new Set(contracts.map((c) => c.strike))].sort((a, b) => a - b);

  let minPain = Infinity;
  let maxPainStrike = strikes[0] || 0;

  for (const strike of strikes) {
    let pain = 0;

    for (const contract of contracts) {
      const oi = contract.openInterest;
      if (contract.type === 'call') {
        const _intrinsic = Math.max(0, strike - contract.strike);
        pain += Math.abs(contract.strike - strike) > 0 ? oi * Math.abs(contract.strike - strike) : 0;
      } else {
        const _intrinsic = Math.max(0, contract.strike - strike);
        pain += Math.abs(contract.strike - strike) > 0 ? oi * Math.abs(contract.strike - strike) : 0;
      }
    }

    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = strike;
    }
  }

  return maxPainStrike;
}

type OptionChain = OptionContract;

// ===== Put/Call Ratio =====

export function calculatePutCallRatio(
  contracts: OptionChain[]
): { volumeRatio: number; oiRatio: number } {
  const calls = contracts.filter((c) => c.type === 'call');
  const puts = contracts.filter((c) => c.type === 'put');

  const callVolume = calls.reduce((s, c) => s + c.volume, 0);
  const putVolume = puts.reduce((s, c) => s + c.volume, 0);
  const callOI = calls.reduce((s, c) => s + c.openInterest, 0);
  const putOI = puts.reduce((s, c) => s + c.openInterest, 0);

  return {
    volumeRatio: callVolume > 0 ? putVolume / callVolume : 0,
    oiRatio: callOI > 0 ? putOI / callOI : 0,
  };
}

// ===== Options Skew =====

export function calculateSkew(
  contracts: OptionChain[],
  spotPrice: number
): number {
  const otmPuts = contracts.filter(
    (c) => c.type === 'put' && c.strike < spotPrice * 0.95
  );
  const otmCalls = contracts.filter(
    (c) => c.type === 'call' && c.strike > spotPrice * 1.05
  );

  if (otmPuts.length === 0 || otmCalls.length === 0) return 0;

  const avgPutIV =
    otmPuts.reduce((s, c) => s + c.impliedVolatility, 0) / otmPuts.length;
  const avgCallIV =
    otmCalls.reduce((s, c) => s + c.impliedVolatility, 0) / otmCalls.length;

  return avgPutIV - avgCallIV;
}

// ===== Term Structure =====

export function buildTermStructure(
  contracts: OptionChain[]
): TermStructurePoint[] {
  const expiryGroups = new Map<number, OptionChain[]>();

  for (const contract of contracts) {
    const group = expiryGroups.get(contract.expiry) || [];
    group.push(contract);
    expiryGroups.set(contract.expiry, group);
  }

  const points: TermStructurePoint[] = [];

  for (const [days, group] of expiryGroups) {
    const calls = group.filter((c) => c.type === 'call');
    const puts = group.filter((c) => c.type === 'put');

    const avgIV =
      group.reduce((s, c) => s + c.impliedVolatility, 0) / group.length;
    const callIV =
      calls.length > 0
        ? calls.reduce((s, c) => s + c.impliedVolatility, 0) / calls.length
        : 0;
    const putIV =
      puts.length > 0
        ? puts.reduce((s, c) => s + c.impliedVolatility, 0) / puts.length
        : 0;

    points.push({ daysToExpiry: days, avgIV, callIV, putIV });
  }

  return points.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

// ===== Greeks Analysis =====

export function analyzeGreeks(
  contracts: OptionChain[],
  spotPrice: number
): GreeksAnalysis {
  const calls = contracts.filter((c) => c.type === 'call');
  const puts = contracts.filter((c) => c.type === 'put');

  // Net delta (positive = bullish positioning)
  const callDelta = calls.reduce((s, c) => s + c.delta * c.openInterest, 0);
  const putDelta = puts.reduce((s, c) => s + c.delta * c.openInterest, 0);
  const netDelta = callDelta + putDelta;

  // Gamma exposure
  const netGamma = contracts.reduce(
    (s, c) => s + c.gamma * c.openInterest,
    0
  );

  // Theta decay
  const netTheta = contracts.reduce(
    (s, c) => s + c.theta * c.openInterest,
    0
  );

  // Vega sensitivity
  const netVega = contracts.reduce(
    (s, c) => s + c.vega * c.openInterest,
    0
  );

  // Gamma exposure (dollar)
  const gammaExposure = netGamma * spotPrice * spotPrice * 0.01;

  // Dealer position based on gamma
  let dealerPosition: 'long_gamma' | 'short_gamma' | 'neutral';
  if (netGamma > 0) dealerPosition = 'long_gamma';
  else if (netGamma < 0) dealerPosition = 'short_gamma';
  else dealerPosition = 'neutral';

  return {
    netDelta: Math.round(netDelta * 100) / 100,
    netGamma: Math.round(netGamma * 10000) / 10000,
    netTheta: Math.round(netTheta * 100) / 100,
    netVega: Math.round(netVega * 100) / 100,
    gammaExposure: Math.round(gammaExposure * 100) / 100,
    dealerPosition,
  };
}

// ===== Support/Resistance from Options =====

export function findOptionsSupportResistance(
  contracts: OptionChain[],
  spotPrice: number
): { supportZone: [number, number]; resistanceZone: [number, number] } {
  // High OI strikes below spot = support
  const puts = contracts
    .filter((c) => c.type === 'put' && c.strike < spotPrice)
    .sort((a, b) => b.openInterest - a.openInterest);

  // High OI strikes above spot = resistance
  const calls = contracts
    .filter((c) => c.type === 'call' && c.strike > spotPrice)
    .sort((a, b) => b.openInterest - a.openInterest);

  const supportLow = puts.length > 0 ? puts[puts.length - 1].strike : spotPrice * 0.95;
  const supportHigh = puts.length > 0 ? puts[0].strike : spotPrice;
  const resistanceLow = calls.length > 0 ? calls[0].strike : spotPrice;
  const resistanceHigh = calls.length > 0 ? calls[calls.length - 1].strike : spotPrice * 1.05;

  return {
    supportZone: [supportLow, supportHigh],
    resistanceZone: [resistanceLow, resistanceHigh],
  };
}

// ===== Full Chain Analysis =====

export function analyzeOptionChain(
  contracts: OptionChain[],
  spotPrice: number
): OptionChainAnalysis {
  const maxPain = calculateMaxPain(contracts);
  const { volumeRatio, oiRatio } = calculatePutCallRatio(contracts);
  const skew = calculateSkew(contracts, spotPrice);
  const termStructure = buildTermStructure(contracts);
  const { supportZone, resistanceZone } = findOptionsSupportResistance(
    contracts,
    spotPrice
  );

  const calls = contracts.filter((c) => c.type === 'call');
  const puts = contracts.filter((c) => c.type === 'put');

  const totalCallVolume = calls.reduce((s, c) => s + c.volume, 0);
  const totalPutVolume = puts.reduce((s, c) => s + c.volume, 0);
  const totalCallOI = calls.reduce((s, c) => s + c.openInterest, 0);
  const totalPutOI = puts.reduce((s, c) => s + c.openInterest, 0);

  // Sentiment based on P/C ratio
  let sentiment: 'bullish' | 'bearish' | 'neutral';
  if (volumeRatio < 0.7) sentiment = 'bullish';
  else if (volumeRatio > 1.3) sentiment = 'bearish';
  else sentiment = 'neutral';

  return {
    maxPain,
    putCallRatio: volumeRatio,
    totalCallVolume,
    totalPutVolume,
    totalCallOI,
    totalPutOI,
    skew: Math.round(skew * 10000) / 10000,
    termStructure,
    supportZone,
    resistanceZone,
    sentiment,
  };
}
