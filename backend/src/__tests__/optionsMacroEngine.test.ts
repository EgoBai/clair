import { describe, it, expect } from 'vitest';

// 期权定价引擎 (Black-Scholes简化)
describe('期权定价引擎', () => {
  function normalCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  function bsCall(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0) return Math.max(S - K, 0);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  }

  function bsPut(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0) return Math.max(K - S, 0);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }

  function putCallParity(call: number, put: number, S: number, K: number, r: number, T: number): number {
    return call - put - S + K * Math.exp(-r * T);
  }

  function intrinsicCall(S: number, K: number): number {
    return Math.max(S - K, 0);
  }

  function intrinsicPut(S: number, K: number): number {
    return Math.max(K - S, 0);
  }

  function timeValue(optionPrice: number, intrinsic: number): number {
    return Math.max(optionPrice - intrinsic, 0);
  }

  it('看涨期权应非负', () => {
    expect(bsCall(100, 100, 1, 0.05, 0.2)).toBeGreaterThan(0);
  });

  it('看跌期权应非负', () => {
    expect(bsPut(100, 100, 1, 0.05, 0.2)).toBeGreaterThan(0);
  });

  it('平价看涨应大于平价看跌', () => {
    const call = bsCall(100, 100, 1, 0.05, 0.2);
    const put = bsPut(100, 100, 1, 0.05, 0.2);
    expect(call).toBeGreaterThan(put);
  });

  it('到期看涨应等于内在价值', () => {
    expect(bsCall(110, 100, 0, 0.05, 0.2)).toBe(10);
    expect(bsCall(90, 100, 0, 0.05, 0.2)).toBe(0);
  });

  it('到期看跌应等于内在价值', () => {
    expect(bsPut(90, 100, 0, 0.05, 0.2)).toBe(10);
    expect(bsPut(110, 100, 0, 0.05, 0.2)).toBe(0);
  });

  it('看涨内在价值应正确', () => {
    expect(intrinsicCall(110, 100)).toBe(10);
    expect(intrinsicCall(90, 100)).toBe(0);
  });

  it('看跌内在价值应正确', () => {
    expect(intrinsicPut(90, 100)).toBe(10);
    expect(intrinsicPut(110, 100)).toBe(0);
  });

  it('时间价值应非负', () => {
    const call = bsCall(100, 100, 1, 0.05, 0.2);
    const intrinsic = intrinsicCall(100, 100);
    expect(timeValue(call, intrinsic)).toBeGreaterThan(0);
  });

  it('看涨看跌平价关系应近似成立', () => {
    const call = bsCall(100, 100, 1, 0.05, 0.2);
    const put = bsPut(100, 100, 1, 0.05, 0.2);
    const diff = putCallParity(call, put, 100, 100, 0.05, 1);
    expect(Math.abs(diff)).toBeLessThan(0.01);
  });

  it('高波动率期权价值应更高', () => {
    const low = bsCall(100, 100, 1, 0.05, 0.1);
    const high = bsCall(100, 100, 1, 0.05, 0.5);
    expect(high).toBeGreaterThan(low);
  });

  it('深度虚值看涨应接近0', () => {
    expect(bsCall(50, 100, 0.01, 0.05, 0.2)).toBeLessThan(0.01);
  });

  it('深度实值看涨应接近S-K*exp(-rT)', () => {
    const call = bsCall(200, 100, 1, 0.05, 0.2);
    const expected = 200 - 100 * Math.exp(-0.05);
    expect(Math.abs(call - expected)).toBeLessThan(1);
  });

  it('normalCDF(0)应为0.5', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5);
  });

  it('normalCDF应单调递增', () => {
    expect(normalCDF(-2)).toBeLessThan(normalCDF(-1));
    expect(normalCDF(-1)).toBeLessThan(normalCDF(0));
    expect(normalCDF(0)).toBeLessThan(normalCDF(1));
  });
});

// 宏观经济指标
describe('宏观经济指标计算', () => {
  function gdpGrowthRate(current: number, previous: number): number {
    return previous > 0 ? (current - previous) / previous * 100 : 0;
  }

  function cpi(y1: number, y2: number): number {
    return y2 > 0 ? (y1 - y2) / y2 * 100 : 0;
  }

  function ppi(y1: number, y2: number): number {
    return y2 > 0 ? (y1 - y2) / y2 * 100 : 0;
  }

  function realGDP(nominal: number, deflator: number): number {
    return deflator > 0 ? nominal / deflator * 100 : 0;
  }

  function yieldSpread(long: number, short: number): number {
    return long - short;
  }

  function yieldCurveInverted(long: number, short: number): boolean {
    return long < short;
  }

  function unemploymentRate(employed: number, laborForce: number): number {
    return laborForce > 0 ? (1 - employed / laborForce) * 100 : 0;
  }

  function laborParticipationRate(laborForce: number, workingAge: number): number {
    return workingAge > 0 ? laborForce / workingAge * 100 : 0;
  }

  function debtToGDP(debt: number, gdp: number): number {
    return gdp > 0 ? debt / gdp * 100 : 0;
  }

  it('GDP增速应正确', () => {
    expect(gdpGrowthRate(110, 100)).toBe(10);
  });

  it('GDP下降应返回负增速', () => {
    expect(gdpGrowthRate(90, 100)).toBe(-10);
  });

  it('零基期GDP增速应为0', () => {
    expect(gdpGrowthRate(100, 0)).toBe(0);
  });

  it('CPI应正确', () => {
    expect(cpi(105, 100)).toBe(5);
  });

  it('PPI应正确', () => {
    expect(ppi(103, 100)).toBe(3);
  });

  it('实际GDP应正确', () => {
    expect(realGDP(120, 110)).toBeCloseTo(109.09, 1);
  });

  it('收益率利差应正确', () => {
    expect(yieldSpread(3.5, 2.0)).toBe(1.5);
  });

  it('收益率曲线倒挂应正确', () => {
    expect(yieldCurveInverted(1.5, 2.0)).toBe(true);
    expect(yieldCurveInverted(3.0, 2.0)).toBe(false);
  });

  it('失业率应正确', () => {
    expect(unemploymentRate(95, 100)).toBeCloseTo(5);
  });

  it('劳动参与率应正确', () => {
    expect(laborParticipationRate(70, 100)).toBe(70);
  });

  it('政府债务/GDP应正确', () => {
    expect(debtToGDP(60, 200)).toBe(30);
  });

  it('零基期指标应返回0', () => {
    expect(cpi(100, 0)).toBe(0);
    expect(ppi(100, 0)).toBe(0);
    expect(realGDP(100, 0)).toBe(0);
    expect(unemploymentRate(0, 0)).toBe(0);
    expect(debtToGDP(100, 0)).toBe(0);
  });
});

// 市场微观结构
describe('市场微观结构引擎', () => {
  interface Level2Entry { price: number; quantity: number; orders: number }

  function orderBookImbalance(bids: Level2Entry[], asks: Level2Entry[]): number {
    const bidVol = bids.reduce((s, b) => s + b.quantity, 0);
    const askVol = asks.reduce((s, a) => s + a.quantity, 0);
    const total = bidVol + askVol;
    return total > 0 ? (bidVol - askVol) / total : 0;
  }

  function weightedMidPrice(bids: Level2Entry[], asks: Level2Entry[]): number {
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const bidVol = bids[0]?.quantity ?? 1;
    const askVol = asks[0]?.quantity ?? 1;
    return (bestBid * askVol + bestAsk * bidVol) / (bidVol + askVol);
  }

  function spreadBps(bid: number, ask: number): number {
    const mid = (bid + ask) / 2;
    return mid > 0 ? ((ask - bid) / mid) * 10000 : 0;
  }

  function marketDepth(bids: Level2Entry[], asks: Level2Entry[], levels: number): { bidDepth: number; askDepth: number } {
    return {
      bidDepth: bids.slice(0, levels).reduce((s, b) => s + b.quantity, 0),
      askDepth: asks.slice(0, levels).reduce((s, a) => s + a.quantity, 0),
    };
  }

  function effectiveSpread(tradePrice: number, bid: number, ask: number): number {
    const mid = (bid + ask) / 2;
    return Math.abs(tradePrice - mid) * 2;
  }

  it('应计算订单簿不平衡度', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 500, orders: 5 }];
    const asks: Level2Entry[] = [{ price: 10.1, quantity: 300, orders: 3 }];
    expect(orderBookImbalance(bids, asks)).toBeCloseTo(0.25);
  });

  it('等量订单簿不平衡度应为0', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 500, orders: 5 }];
    const asks: Level2Entry[] = [{ price: 10.1, quantity: 500, orders: 5 }];
    expect(orderBookImbalance(bids, asks)).toBe(0);
  });

  it('应计算加权中间价', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 200, orders: 2 }];
    const asks: Level2Entry[] = [{ price: 10.2, quantity: 100, orders: 1 }];
    const mid = weightedMidPrice(bids, asks);
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(10.2);
  });

  it('应计算点差BPS', () => {
    expect(spreadBps(10.0, 10.02)).toBeCloseTo(20, 0);
  });

  it('应计算市场深度', () => {
    const bids: Level2Entry[] = [
      { price: 10, quantity: 100, orders: 1 },
      { price: 9.9, quantity: 200, orders: 2 },
    ];
    const asks: Level2Entry[] = [
      { price: 10.1, quantity: 150, orders: 1 },
    ];
    const depth = marketDepth(bids, asks, 2);
    expect(depth.bidDepth).toBe(300);
    expect(depth.askDepth).toBe(150);
  });

  it('应计算有效点差', () => {
    expect(effectiveSpread(10.0, 10.0, 10.1)).toBeCloseTo(0.1);
  });

  it('空订单簿不平衡度应为0', () => {
    expect(orderBookImbalance([], [])).toBe(0);
  });

  it('零价差BPS应为0', () => {
    expect(spreadBps(10, 10)).toBe(0);
  });

  it('深度虚值点差BPS应大', () => {
    expect(spreadBps(10, 10.5)).toBeGreaterThan(100);
  });
});

// 回测统计引擎
describe('回测统计引擎', () => {
  interface Trade { entry: number; exit: number; pnl: number; duration: number }

  function winRate(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    return trades.filter(t => t.pnl > 0).length / trades.length;
  }

  function profitFactor(trades: Trade[]): number {
    const wins = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const losses = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    return losses > 0 ? wins / losses : wins > 0 ? Infinity : 0;
  }

  function expectancy(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    return trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  }

  function averageWin(trades: Trade[]): number {
    const wins = trades.filter(t => t.pnl > 0);
    return wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  }

  function averageLoss(trades: Trade[]): number {
    const losses = trades.filter(t => t.pnl < 0);
    return losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  }

  function maxConsecutiveWins(trades: Trade[]): number {
    let max = 0, current = 0;
    for (const t of trades) {
      if (t.pnl > 0) { current++; max = Math.max(max, current); }
      else { current = 0; }
    }
    return max;
  }

  function maxConsecutiveLosses(trades: Trade[]): number {
    let max = 0, current = 0;
    for (const t of trades) {
      if (t.pnl < 0) { current++; max = Math.max(max, current); }
      else { current = 0; }
    }
    return max;
  }

  function avgTradeDuration(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    return trades.reduce((s, t) => s + t.duration, 0) / trades.length;
  }

  const sample: Trade[] = [
    { entry: 10, exit: 12, pnl: 2, duration: 5 },
    { entry: 15, exit: 13, pnl: -2, duration: 3 },
    { entry: 20, exit: 25, pnl: 5, duration: 10 },
    { entry: 30, exit: 28, pnl: -2, duration: 7 },
    { entry: 10, exit: 15, pnl: 5, duration: 8 },
  ];

  it('应计算胜率', () => {
    expect(winRate(sample)).toBeCloseTo(0.6);
  });

  it('空交易胜率应为0', () => {
    expect(winRate([])).toBe(0);
  });

  it('应计算盈亏比', () => {
    expect(profitFactor(sample)).toBeCloseTo(3);
  });

  it('应计算期望值', () => {
    expect(expectancy(sample)).toBeCloseTo(1.6);
  });

  it('空交易期望值应为0', () => {
    expect(expectancy([])).toBe(0);
  });

  it('应计算平均盈利', () => {
    expect(averageWin(sample)).toBeCloseTo(4);
  });

  it('应计算平均亏损', () => {
    expect(averageLoss(sample)).toBe(2);
  });

  it('应计算最大连续盈利', () => {
    expect(maxConsecutiveWins(sample)).toBe(1);
  });

  it('应计算最大连续亏损', () => {
    expect(maxConsecutiveLosses(sample)).toBe(1);
  });

  it('全部盈利应计算最大连续盈利', () => {
    const wins: Trade[] = [
      { entry: 0, exit: 0, pnl: 1, duration: 1 },
      { entry: 0, exit: 0, pnl: 1, duration: 1 },
      { entry: 0, exit: 0, pnl: 1, duration: 1 },
    ];
    expect(maxConsecutiveWins(wins)).toBe(3);
  });

  it('应计算平均持仓时长', () => {
    expect(avgTradeDuration(sample)).toBeCloseTo(6.6);
  });

  it('无亏损交易盈亏比应为Infinity', () => {
    const allWins: Trade[] = [{ entry: 0, exit: 0, pnl: 1, duration: 1 }];
    expect(profitFactor(allWins)).toBe(Infinity);
  });

  it('大量交易应正确统计', () => {
    const many: Trade[] = Array.from({ length: 1000 }, (_, i) => ({
      entry: 10, exit: 10 + (i % 2 === 0 ? 1 : -0.5),
      pnl: i % 2 === 0 ? 1 : -0.5, duration: i % 10 + 1,
    }));
    expect(winRate(many)).toBeCloseTo(0.5);
    expect(profitFactor(many)).toBeCloseTo(2);
  });
});
