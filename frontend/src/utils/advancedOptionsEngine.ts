/**
 * 期权定价与分析引擎
 * Black-Scholes, Greeks, 隐含波动率, 期权策略
 */

export interface OptionParams {
  spot: number;
  strike: number;
  timeToExpiry: number; // in years
  riskFreeRate: number;
  volatility: number;
  type: 'call' | 'put';
}

export interface OptionPrice {
  price: number;
  intrinsic: number;
  timeValue: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionStrategy {
  name: string;
  legs: { type: 'call' | 'put'; strike: number; quantity: number; action: 'buy' | 'sell' }[];
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
  description: string;
}

export interface VolatilitySurface {
  strikes: number[];
  expiries: number[];
  ivMatrix: number[][];
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1(params: OptionParams): number {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility } = params;
  if (timeToExpiry <= 0 || volatility <= 0) return 0;
  return (Math.log(spot / strike) + (riskFreeRate + volatility ** 2 / 2) * timeToExpiry) / (volatility * Math.sqrt(timeToExpiry));
}

function d2(params: OptionParams): number {
  return d1(params) - params.volatility * Math.sqrt(params.timeToExpiry);
}

export function blackScholes(params: OptionParams): OptionPrice {
  const { spot, strike, timeToExpiry, riskFreeRate, type } = params;
  
  if (timeToExpiry <= 0) {
    const intrinsic = type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    return { price: intrinsic, intrinsic, timeValue: 0 };
  }
  
  const _d1 = d1(params);
  const _d2 = d2(params);
  const df = Math.exp(-riskFreeRate * timeToExpiry);
  
  let price: number;
  if (type === 'call') {
    price = spot * normalCDF(_d1) - strike * df * normalCDF(_d2);
  } else {
    price = strike * df * normalCDF(-_d2) - spot * normalCDF(-_d1);
  }
  
  const intrinsic = type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  
  return {
    price: Math.max(0, price),
    intrinsic,
    timeValue: Math.max(0, price - intrinsic),
  };
}

export function calculateGreeks(params: OptionParams): Greeks {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, type } = params;
  
  if (timeToExpiry <= 0 || volatility <= 0) {
    return { delta: type === 'call' ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  
  const _d1 = d1(params);
  const _d2 = d2(params);
  const df = Math.exp(-riskFreeRate * timeToExpiry);
  const sqrtT = Math.sqrt(timeToExpiry);
  
  let delta: number;
  if (type === 'call') {
    delta = normalCDF(_d1);
  } else {
    delta = normalCDF(_d1) - 1;
  }
  
  const gamma = normalPDF(_d1) / (spot * volatility * sqrtT);
  
  let theta: number;
  const common = -(spot * normalPDF(_d1) * volatility) / (2 * sqrtT);
  if (type === 'call') {
    theta = (common - riskFreeRate * strike * df * normalCDF(_d2)) / 365;
  } else {
    theta = (common + riskFreeRate * strike * df * normalCDF(-_d2)) / 365;
  }
  
  const vega = spot * normalPDF(_d1) * sqrtT / 100;
  
  let rho: number;
  if (type === 'call') {
    rho = strike * timeToExpiry * df * normalCDF(_d2) / 100;
  } else {
    rho = -strike * timeToExpiry * df * normalCDF(-_d2) / 100;
  }
  
  return { delta, gamma, theta, vega, rho };
}

export function impliedVolatility(
  marketPrice: number,
  spot: number,
  strike: number,
  timeToExpiry: number,
  riskFreeRate: number,
  type: 'call' | 'put',
  tolerance: number = 0.0001,
  maxIterations: number = 100
): number | null {
  if (timeToExpiry <= 0 || marketPrice <= 0) return null;
  
  let low = 0.01;
  let high = 5.0;
  
  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const price = blackScholes({ spot, strike, timeToExpiry, riskFreeRate, volatility: mid, type }).price;
    
    if (Math.abs(price - marketPrice) < tolerance) return mid;
    if (price > marketPrice) high = mid;
    else low = mid;
  }
  
  return (low + high) / 2;
}

export function putCallParity(
  callPrice: number,
  putPrice: number,
  spot: number,
  strike: number,
  riskFreeRate: number,
  timeToExpiry: number
): { theoreticalDiff: number; actualDiff: number; arbitrage: boolean } {
  const df = Math.exp(-riskFreeRate * timeToExpiry);
  const theoreticalDiff = spot - strike * df;
  const actualDiff = callPrice - putPrice;
  const arbitrage = Math.abs(actualDiff - theoreticalDiff) > 0.01;
  
  return { theoreticalDiff, actualDiff, arbitrage };
}

export function buildBullCallSpread(
  spot: number,
  lowerStrike: number,
  upperStrike: number,
  premium: number
): OptionStrategy {
  const maxProfit = (upperStrike - lowerStrike) - premium;
  const maxLoss = premium;
  const breakeven = [lowerStrike + premium];
  
  return {
    name: '牛市看涨价差',
    legs: [
      { type: 'call', strike: lowerStrike, quantity: 1, action: 'buy' },
      { type: 'call', strike: upperStrike, quantity: 1, action: 'sell' },
    ],
    maxProfit,
    maxLoss,
    breakeven,
    description: `买入${lowerStrike}看涨 + 卖出${upperStrike}看涨`,
  };
}

export function buildBearPutSpread(
  spot: number,
  lowerStrike: number,
  upperStrike: number,
  premium: number
): OptionStrategy {
  const maxProfit = (upperStrike - lowerStrike) - premium;
  const maxLoss = premium;
  const breakeven = [upperStrike - premium];
  
  return {
    name: '熊市看跌价差',
    legs: [
      { type: 'put', strike: upperStrike, quantity: 1, action: 'buy' },
      { type: 'put', strike: lowerStrike, quantity: 1, action: 'sell' },
    ],
    maxProfit,
    maxLoss,
    breakeven,
    description: `买入${upperStrike}看跌 + 卖出${lowerStrike}看跌`,
  };
}

export function buildStraddle(spot: number, strike: number, totalPremium: number): OptionStrategy {
  return {
    name: '跨式策略',
    legs: [
      { type: 'call', strike, quantity: 1, action: 'buy' },
      { type: 'put', strike, quantity: 1, action: 'buy' },
    ],
    maxProfit: Infinity,
    maxLoss: totalPremium,
    breakeven: [strike - totalPremium, strike + totalPremium],
    description: `同时买入${strike}看涨和看跌`,
  };
}

export function buildIronCondor(
  spot: number,
  putLower: number,
  putUpper: number,
  callLower: number,
  callUpper: number,
  netCredit: number
): OptionStrategy {
  const spreadWidth = putUpper - putLower;
  const maxProfit = netCredit;
  const maxLoss = spreadWidth - netCredit;
  
  return {
    name: '铁鹰策略',
    legs: [
      { type: 'put', strike: putLower, quantity: 1, action: 'sell' },
      { type: 'put', strike: putUpper, quantity: 1, action: 'buy' },
      { type: 'call', strike: callLower, quantity: 1, action: 'sell' },
      { type: 'call', strike: callUpper, quantity: 1, action: 'buy' },
    ],
    maxProfit,
    maxLoss,
    breakeven: [putLower + netCredit, callLower - netCredit],
    description: '卖出宽跨 + 买入更宽跨式保护',
  };
}

export function calculateMaxPain(
  strikes: number[],
  callOpenInterest: number[],
  putOpenInterest: number[]
): number {
  let minPain = Infinity;
  let maxPainStrike = strikes[0];
  
  for (const strike of strikes) {
    let pain = 0;
    for (let i = 0; i < strikes.length; i++) {
      if (strikes[i] < strike) {
        pain += callOpenInterest[i] * (strike - strikes[i]);
      } else if (strikes[i] > strike) {
        pain += putOpenInterest[i] * (strikes[i] - strike);
      }
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = strike;
    }
  }
  
  return maxPainStrike;
}

export function calculatePCR(
  putVolume: number,
  callVolume: number
): { ratio: number; sentiment: 'bullish' | 'bearish' | 'neutral' } {
  const ratio = callVolume > 0 ? putVolume / callVolume : 0;
  const sentiment = ratio > 1.2 ? 'bearish' : ratio < 0.7 ? 'bullish' : 'neutral';
  return { ratio, sentiment };
}
