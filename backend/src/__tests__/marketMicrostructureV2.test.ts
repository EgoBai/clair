import { describe, it, expect } from 'vitest';

describe('市场微观结构分析', () => {
  interface Tick { price: number; volume: number; timestamp: number; side: 'buy' | 'sell'; }

  function calcKyleLambda(ticks: Tick[]): number {
    if (ticks.length < 2) return 0;
    let sumXY = 0, sumYY = 0;
    for (let i = 1; i < ticks.length; i++) {
      const priceChange = ticks[i].price - ticks[i - 1].price;
      const signedVolume = ticks[i].side === 'buy' ? ticks[i].volume : -ticks[i].volume;
      sumXY += priceChange * signedVolume;
      sumYY += signedVolume ** 2;
    }
    return sumYY === 0 ? 0 : sumXY / sumYY;
  }
  function calcAmihudIlliquidity(ticks: Tick[]): number {
    let sum = 0, count = 0;
    for (let i = 1; i < ticks.length; i++) {
      const ret = Math.abs(ticks[i].price - ticks[i - 1].price) / ticks[i - 1].price;
      const dollarVol = ticks[i].price * ticks[i].volume;
      if (dollarVol > 0) {
        sum += ret / dollarVol;
        count++;
      }
    }
    return count === 0 ? 0 : sum / count;
  }
  function calcVPIN(ticks: Tick[], bucketSize: number): number {
    let buyVol = 0, sellVol = 0;
    for (const t of ticks) {
      if (t.side === 'buy') buyVol += t.volume;
      else sellVol += t.volume;
    }
    const total = buyVol + sellVol;
    if (total === 0) return 0;
    return Math.abs(buyVol - sellVol) / total;
  }
  function calcTradeSign(ticks: Tick[]): number[] {
    return ticks.map((t, i) => {
      if (i === 0) return t.side === 'buy' ? 1 : -1;
      return t.side === 'buy' ? 1 : -1;
    });
  }
  function calcAutocorrelation(signs: number[], lag: number): number {
    if (signs.length <= lag) return 0;
    const mean = signs.reduce((a, b) => a + b, 0) / signs.length;
    let num = 0, den = 0;
    for (let i = lag; i < signs.length; i++) {
      num += (signs[i] - mean) * (signs[i - lag] - mean);
    }
    for (const s of signs) den += (s - mean) ** 2;
    return den === 0 ? 0 : num / den;
  }
  function calcRollSpread(ticks: Tick[]): number {
    if (ticks.length < 2) return 0;
    const diffs: number[] = [];
    for (let i = 1; i < ticks.length; i++) {
      diffs.push(ticks[i].price - ticks[i - 1].price);
    }
    let sumProd = 0;
    for (let i = 1; i < diffs.length; i++) {
      sumProd += diffs[i] * diffs[i - 1];
    }
    const cov = sumProd / diffs.length;
    return cov < 0 ? 2 * Math.sqrt(-cov) : 0;
  }
  function calcHasbrouckLambda(ticks: Tick[]): number {
    const midPrices = ticks.map(t => t.price);
    let sumSq = 0;
    for (let i = 1; i < midPrices.length; i++) {
      sumSq += (midPrices[i] - midPrices[i - 1]) ** 2;
    }
    const avgVol = ticks.reduce((s, t) => s + t.volume, 0) / ticks.length;
    return avgVol === 0 ? 0 : Math.sqrt(sumSq / ticks.length) / avgVol;
  }

  const ticks: Tick[] = [
    { price: 10.00, volume: 500, timestamp: 1000, side: 'buy' },
    { price: 10.01, volume: 300, timestamp: 1001, side: 'buy' },
    { price: 10.00, volume: 400, timestamp: 1002, side: 'sell' },
    { price: 9.99, volume: 600, timestamp: 1003, side: 'sell' },
    { price: 10.00, volume: 200, timestamp: 1004, side: 'buy' },
    { price: 10.02, volume: 800, timestamp: 1005, side: 'buy' },
    { price: 10.01, volume: 350, timestamp: 1006, side: 'sell' },
    { price: 10.03, volume: 500, timestamp: 1007, side: 'buy' },
  ];

  it('Kyle Lambda', () => {
    const lambda = calcKyleLambda(ticks);
    expect(Number.isFinite(lambda)).toBe(true);
  });

  it('Kyle Lambda不足数据', () => {
    expect(calcKyleLambda([ticks[0]])).toBe(0);
  });

  it('Amihud非流动性指标', () => {
    const illiq = calcAmihudIlliquidity(ticks);
    expect(illiq).toBeGreaterThanOrEqual(0);
  });

  it('VPIN计算', () => {
    const vpin = calcVPIN(ticks, 1000);
    expect(vpin).toBeGreaterThanOrEqual(0);
    expect(vpin).toBeLessThanOrEqual(1);
  });

  it('VPIN全买入', () => {
    const allBuy = ticks.map(t => ({ ...t, side: 'buy' as const }));
    expect(calcVPIN(allBuy, 1000)).toBe(1);
  });

  it('VPIN平衡买卖', () => {
    const balanced = [
      { price: 10, volume: 100, timestamp: 1, side: 'buy' as const },
      { price: 10, volume: 100, timestamp: 2, side: 'sell' as const },
    ];
    expect(calcVPIN(balanced, 100)).toBe(0);
  });

  it('交易符号序列', () => {
    const signs = calcTradeSign(ticks);
    expect(signs).toHaveLength(ticks.length);
    expect(signs[0]).toBe(1); // buy
    expect(signs[2]).toBe(-1); // sell
  });

  it('自相关系数', () => {
    const signs = calcTradeSign(ticks);
    const ac = calcAutocorrelation(signs, 1);
    expect(ac).toBeGreaterThanOrEqual(-1);
    expect(ac).toBeLessThanOrEqual(1);
  });

  it('Roll价差估计', () => {
    const spread = calcRollSpread(ticks);
    expect(spread).toBeGreaterThanOrEqual(0);
  });

  it('Roll价差不足数据', () => {
    expect(calcRollSpread([ticks[0]])).toBe(0);
  });

  it('Hasbrouck Lambda', () => {
    const hl = calcHasbrouckLambda(ticks);
    expect(Number.isFinite(hl)).toBe(true);
    expect(hl).toBeGreaterThanOrEqual(0);
  });

  it('Amihud空数据', () => {
    expect(calcAmihudIlliquidity([])).toBe(0);
  });

  it('自相关lag超长度', () => {
    expect(calcAutocorrelation([1, -1], 5)).toBe(0);
  });

  it('tick时间递增', () => {
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].timestamp).toBeGreaterThan(ticks[i - 1].timestamp);
    }
  });

  it('tick价格正数', () => {
    for (const t of ticks) {
      expect(t.price).toBeGreaterThan(0);
      expect(t.volume).toBeGreaterThan(0);
    }
  });
});
