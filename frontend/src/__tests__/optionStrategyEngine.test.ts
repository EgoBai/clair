import { describe, it, expect } from 'vitest';

// 期权组合策略引擎
interface OptionLeg {
  type: 'call' | 'put';
  strike: number;
  premium: number;
  quantity: number;
  side: 'long' | 'short';
  expiry: number;
}

interface OptionStrategy {
  name: string;
  legs: OptionLeg[];
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
  margin: number;
}

function calcPayoff(legs: OptionLeg[], spotPrice: number): number {
  return legs.reduce((total, leg) => {
    const intrinsic = leg.type === 'call'
      ? Math.max(spotPrice - leg.strike, 0)
      : Math.max(leg.strike - spotPrice, 0);
    const payoff = leg.side === 'long'
      ? (intrinsic - leg.premium) * leg.quantity
      : (leg.premium - intrinsic) * leg.quantity;
    return total + payoff;
  }, 0);
}

function buildCoveredCall(stockPrice: number, callStrike: number, callPremium: number): OptionStrategy {
  const maxProfit = (callStrike - stockPrice) + callPremium;
  const maxLoss = stockPrice - callPremium;
  return {
    name: '备兑看涨',
    legs: [
      { type: 'call', strike: callStrike, premium: callPremium, quantity: 100, side: 'short', expiry: 30 },
    ],
    maxProfit,
    maxLoss: -maxLoss,
    breakeven: [stockPrice - callPremium],
    margin: stockPrice * 100,
  };
}

function buildBullSpread(lower: number, upper: number, premium: number): OptionStrategy {
  return {
    name: '牛市看涨价差',
    legs: [
      { type: 'call', strike: lower, premium: premium * 1.5, quantity: 100, side: 'long', expiry: 30 },
      { type: 'call', strike: upper, premium: premium * 0.5, quantity: 100, side: 'short', expiry: 30 },
    ],
    maxProfit: (upper - lower - premium) * 100,
    maxLoss: -premium * 100,
    breakeven: [lower + premium],
    margin: (upper - lower) * 100,
  };
}

function buildIronCondor(lowerPut: number, upperPut: number, lowerCall: number, upperCall: number, premiums: { put1: number; put2: number; call1: number; call2: number }): OptionStrategy {
  const netCredit = premiums.put1 - premiums.put2 + premiums.call1 - premiums.call2;
  return {
    name: '铁鹰',
    legs: [
      { type: 'put', strike: lowerPut, premium: premiums.put1, quantity: 100, side: 'short', expiry: 30 },
      { type: 'put', strike: upperPut, premium: premiums.put2, quantity: 100, side: 'long', expiry: 30 },
      { type: 'call', strike: lowerCall, premium: premiums.call1, quantity: 100, side: 'short', expiry: 30 },
      { type: 'call', strike: upperCall, premium: premiums.call2, quantity: 100, side: 'long', expiry: 30 },
    ],
    maxProfit: netCredit * 100,
    maxLoss: -((upperPut - lowerPut) - netCredit) * 100,
    breakeven: [lowerPut + netCredit, lowerCall - netCredit],
    margin: Math.max(upperPut - lowerPut, upperCall - lowerCall) * 100,
  };
}

function buildStraddle(strike: number, callPremium: number, putPremium: number): OptionStrategy {
  const totalPremium = callPremium + putPremium;
  return {
    name: '跨式',
    legs: [
      { type: 'call', strike, premium: callPremium, quantity: 100, side: 'long', expiry: 30 },
      { type: 'put', strike, premium: putPremium, quantity: 100, side: 'long', expiry: 30 },
    ],
    maxProfit: Infinity,
    maxLoss: -totalPremium * 100,
    breakeven: [strike - totalPremium, strike + totalPremium],
    margin: totalPremium * 100,
  };
}

describe('期权组合策略引擎', () => {
  it('应计算到期收益', () => {
    const legs: OptionLeg[] = [
      { type: 'call', strike: 100, premium: 5, quantity: 100, side: 'long', expiry: 30 },
    ];
    expect(calcPayoff(legs, 110)).toBe(500); // (110-100-5)*100
    expect(calcPayoff(legs, 95)).toBe(-500); // (0-5)*100
    expect(calcPayoff(legs, 105)).toBe(0);
  });

  it('应构建备兑看涨', () => {
    const strategy = buildCoveredCall(100, 110, 3);
    expect(strategy.name).toBe('备兑看涨');
    expect(strategy.maxProfit).toBe(13);
    expect(strategy.breakeven).toContain(97);
  });

  it('应构建牛市价差', () => {
    const strategy = buildBullSpread(100, 110, 5);
    expect(strategy.name).toBe('牛市看涨价差');
    expect(strategy.maxProfit).toBeGreaterThan(0);
    expect(strategy.maxLoss).toBeLessThan(0);
    expect(strategy.legs.length).toBe(2);
  });

  it('应构建铁鹰策略', () => {
    const strategy = buildIronCondor(90, 95, 105, 110, { put1: 3, put2: 1, call1: 3, call2: 1 });
    expect(strategy.name).toBe('铁鹰');
    expect(strategy.legs.length).toBe(4);
    expect(strategy.maxProfit).toBeGreaterThan(0);
    expect(strategy.breakeven.length).toBe(2);
  });

  it('应构建跨式策略', () => {
    const strategy = buildStraddle(100, 5, 4);
    expect(strategy.name).toBe('跨式');
    expect(strategy.maxProfit).toBe(Infinity);
    expect(strategy.maxLoss).toBe(-900);
    expect(strategy.breakeven).toEqual([91, 109]);
  });

  it('备兑看涨最大收益有限', () => {
    const strategy = buildCoveredCall(100, 110, 3);
    expect(calcPayoff(strategy.legs, 150)).toBeLessThanOrEqual(strategy.maxProfit * 100 + 1);
  });

  it('跨式双向突破盈利', () => {
    const strategy = buildStraddle(100, 5, 4);
    const highPayoff = calcPayoff(strategy.legs, 120);
    const lowPayoff = calcPayoff(strategy.legs, 80);
    expect(highPayoff).toBeGreaterThan(0);
    expect(lowPayoff).toBeGreaterThan(0);
  });

  it('铁鹰中间区间盈利', () => {
    const strategy = buildIronCondor(90, 95, 105, 110, { put1: 3, put2: 1, call1: 3, call2: 1 });
    const middlePayoff = calcPayoff(strategy.legs, 100);
    expect(middlePayoff).toBeGreaterThan(0);
  });

  it('策略应有legs', () => {
    const strategies = [
      buildCoveredCall(100, 110, 3),
      buildBullSpread(100, 110, 5),
      buildStraddle(100, 5, 4),
    ];
    strategies.forEach(s => {
      expect(s.legs.length).toBeGreaterThan(0);
      expect(s.name).toBeTruthy();
    });
  });

  it('空legs收益应为零', () => {
    expect(calcPayoff([], 100)).toBe(0);
  });
});
