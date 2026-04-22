import { describe, it, expect } from 'vitest';

describe('市场冲击分解引擎 (Market Impact Decomposition)', () => {
  // 临时冲击（瞬时价格影响）
  function temporaryImpact(volume: number, avgDailyVolume: number, volatility: number): number {
    if (avgDailyVolume === 0) return 0;
    const participationRate = volume / avgDailyVolume;
    return volatility * Math.sqrt(participationRate);
  }

  // 永久冲击（信息效应）
  function permanentImpact(volume: number, avgDailyVolume: number, volatility: number, eta = 0.1): number {
    if (avgDailyVolume === 0) return 0;
    return eta * volatility * (volume / avgDailyVolume);
  }

  // Kyle Lambda（线性冲击系数）
  function kyleLambda(returns: number[], volumes: number[]): number {
    if (returns.length !== volumes.length || returns.length < 2) return 0;
    let sumRV = 0, sumV2 = 0;
    for (let i = 0; i < returns.length; i++) {
      sumRV += returns[i] * volumes[i];
      sumV2 += volumes[i] ** 2;
    }
    return sumV2 > 0 ? sumRV / sumV2 : 0;
  }

  // Almgren-Chriss 模型
  function almgrenChrissImpact(totalShares: number, executionTime: number, volatility: number, dailyVolume: number, eta = 0.1, gamma = 0.01): number {
    const dailyShares = totalShares / executionTime;
    const participationRate = dailyShares / dailyVolume;
    const temporaryCost = eta * volatility * participationRate;
    const riskCost = gamma * volatility * Math.sqrt(executionTime);
    return temporaryCost + riskCost;
  }

  // 冲击衰减
  function impactDecay(initialImpact: number, halfLife: number, elapsedMinutes: number): number {
    return initialImpact * Math.exp(-Math.log(2) * elapsedMinutes / halfLife);
  }

  // 订单簿深度冲击
  function bookDepthImpact(orderSize: number, bids: { price: number; size: number }[], asks: { price: number; size: number }[], side: 'buy' | 'sell'): { avgPrice: number; slippage: number } {
    const levels = side === 'buy' ? asks.sort((a, b) => a.price - b.price) : bids.sort((a, b) => b.price - a.price);
    let remaining = orderSize, totalCost = 0, totalFilled = 0;
    for (const level of levels) {
      const fill = Math.min(remaining, level.size);
      totalCost += fill * level.price;
      totalFilled += fill;
      remaining -= fill;
      if (remaining <= 0) break;
    }
    const avgPrice = totalFilled > 0 ? totalCost / totalFilled : 0;
    const midPrice = (bids[0]?.price + asks[0]?.price) / 2 || avgPrice;
    return { avgPrice, slippage: Math.abs(avgPrice - midPrice) / midPrice };
  }

  // VWAP偏差分解
  function vwapImpactDecomposition(arrivalPrice: number, vwapPrice: number, closePrice: number): { timing: number; permanent: number; temporary: number } {
    const permanent = closePrice - arrivalPrice;
    const temporary = vwapPrice - closePrice;
    const timing = vwapPrice - arrivalPrice - permanent - temporary;
    return { timing, permanent, temporary };
  }

  it('临时冲击随成交量增加', () => {
    const low = temporaryImpact(10000, 1000000, 0.02);
    const high = temporaryImpact(100000, 1000000, 0.02);
    expect(high).toBeGreaterThan(low);
  });

  it('零成交量无冲击', () => {
    expect(temporaryImpact(0, 1000000, 0.02)).toBe(0);
  });

  it('永久冲击小于临时冲击', () => {
    const temp = temporaryImpact(50000, 1000000, 0.02);
    const perm = permanentImpact(50000, 1000000, 0.02);
    expect(perm).toBeLessThan(temp);
  });

  it('Kyle Lambda线性回归系数', () => {
    const returns = [0.001, 0.002, -0.001, 0.003, -0.002];
    const volumes = [10000, 20000, 15000, 30000, 25000];
    const lambda = kyleLambda(returns, volumes);
    expect(typeof lambda).toBe('number');
    expect(isFinite(lambda)).toBe(true);
  });

  it('等量回报和成交量时Kyle Lambda接近零', () => {
    const returns = [0, 0, 0, 0, 0];
    const volumes = [10000, 20000, 15000, 30000, 25000];
    expect(kyleLambda(returns, volumes)).toBe(0);
  });

  it('Almgren-Chriss模型计算交易成本', () => {
    const cost = almgrenChrissImpact(100000, 5, 0.02, 1000000);
    expect(cost).toBeGreaterThan(0);
  });

  it('执行时间越长风险成本越高', () => {
    const fast = almgrenChrissImpact(100000, 1, 0.02, 1000000);
    const slow = almgrenChrissImpact(100000, 10, 0.02, 1000000);
    expect(slow).toBeGreaterThan(fast);
  });

  it('冲击衰减随时间递减', () => {
    const initial = 0.01;
    const t5 = impactDecay(initial, 10, 5);
    const t20 = impactDecay(initial, 10, 20);
    expect(t5).toBeGreaterThan(t20);
    expect(t20).toBeGreaterThan(0);
  });

  it('半衰期末尾冲击为初始的一半', () => {
    const result = impactDecay(0.02, 30, 30);
    expect(result).toBeCloseTo(0.01, 4);
  });

  it('订单簿深度冲击计算', () => {
    const bids = [{ price: 99.5, size: 500 }, { price: 99, size: 1000 }];
    const asks = [{ price: 100.5, size: 500 }, { price: 101, size: 1000 }];
    const result = bookDepthImpact(600, bids, asks, 'buy');
    expect(result.avgPrice).toBeGreaterThan(100);
    expect(result.slippage).toBeGreaterThan(0);
  });

  it('小订单滑点低', () => {
    const bids = [{ price: 99.9, size: 10000 }];
    const asks = [{ price: 100.0, size: 100 }, { price: 100.5, size: 10000 }];
    const small = bookDepthImpact(50, bids, asks, 'buy');
    const large = bookDepthImpact(5000, bids, asks, 'buy');
    expect(small.slippage).toBeLessThan(large.slippage);
  });

  it('VWAP冲击分解', () => {
    const decomp = vwapImpactDecomposition(100, 100.5, 100.3);
    expect(decomp.permanent).toBeCloseTo(0.3, 2);
    expect(decomp.temporary).toBeCloseTo(0.2, 2);
  });

  it('空输入处理', () => {
    expect(kyleLambda([], [])).toBe(0);
  });
});
