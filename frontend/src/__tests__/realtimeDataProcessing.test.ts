import { describe, it, expect } from 'vitest';

describe('实时数据处理引擎', () => {
  interface Tick { price: number; volume: number; time: number; }
  interface AggBar { open: number; high: number; low: number; close: number; volume: number; time: number; }

  function aggregateTicks(ticks: Tick[], intervalMs: number): AggBar[] {
    if (!ticks.length) return [];
    const bars: AggBar[] = [];
    let currentBar: AggBar | null = null;
    for (const tick of ticks) {
      const bucket = Math.floor(tick.time / intervalMs) * intervalMs;
      if (!currentBar || currentBar.time !== bucket) {
        if (currentBar) bars.push(currentBar);
        currentBar = { open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.volume, time: bucket };
      } else {
        currentBar.high = Math.max(currentBar.high, tick.price);
        currentBar.low = Math.min(currentBar.low, tick.price);
        currentBar.close = tick.price;
        currentBar.volume += tick.volume;
      }
    }
    if (currentBar) bars.push(currentBar);
    return bars;
  }
  function calcRealTimeVWAP(ticks: Tick[]): number {
    let totalPV = 0, totalVol = 0;
    for (const t of ticks) {
      totalPV += t.price * t.volume;
      totalVol += t.volume;
    }
    return totalVol === 0 ? 0 : totalPV / totalVol;
  }
  function detectPriceAnomaly(ticks: Tick[], threshold = 0.05): number[] {
    const indices: number[] = [];
    for (let i = 1; i < ticks.length; i++) {
      const change = Math.abs(ticks[i].price - ticks[i - 1].price) / ticks[i - 1].price;
      if (change > threshold) indices.push(i);
    }
    return indices;
  }
  function calcTickImbalance(ticks: Tick[]): number {
    let buyVol = 0, sellVol = 0;
    for (let i = 1; i < ticks.length; i++) {
      if (ticks[i].price >= ticks[i - 1].price) buyVol += ticks[i].volume;
      else sellVol += ticks[i].volume;
    }
    if (buyVol + sellVol === 0) return 0;
    return (buyVol - sellVol) / (buyVol + sellVol);
  }
  function resampleOHLC(prices: number[], fromInterval: number, toInterval: number): number[] {
    const ratio = Math.floor(toInterval / fromInterval);
    if (ratio <= 1) return prices;
    const result: number[] = [];
    for (let i = 0; i < prices.length; i += ratio) {
      const chunk = prices.slice(i, i + ratio);
      result.push(chunk.reduce((a, b) => a + b, 0) / chunk.length);
    }
    return result;
  }
  function calcRollingAverage(values: number[], window: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = values.slice(start, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return result;
  }
  function detectVolumeSpike(ticks: Tick[], multiplier = 3): number[] {
    if (ticks.length < 2) return [];
    const avgVol = ticks.reduce((s, t) => s + t.volume, 0) / ticks.length;
    return ticks.map((t, i) => t.volume > avgVol * multiplier ? i : -1).filter(i => i >= 0);
  }
  function calcTradeFlow(ticks: Tick[]): { buy: number; sell: number; net: number } {
    let buy = 0, sell = 0;
    for (let i = 1; i < ticks.length; i++) {
      if (ticks[i].price >= ticks[i - 1].price) buy += ticks[i].volume;
      else sell += ticks[i].volume;
    }
    return { buy, sell, net: buy - sell };
  }

  const ticks: Tick[] = [
    { price: 10.00, volume: 100, time: 1000 },
    { price: 10.01, volume: 200, time: 2000 },
    { price: 10.00, volume: 150, time: 3000 },
    { price: 10.02, volume: 300, time: 4000 },
    { price: 10.01, volume: 250, time: 5000 },
    { price: 10.03, volume: 400, time: 6000 },
    { price: 10.02, volume: 180, time: 7000 },
    { price: 10.05, volume: 500, time: 8000 },
  ];

  it('聚合为K线', () => {
    const bars = aggregateTicks(ticks, 3000);
    expect(bars.length).toBeGreaterThanOrEqual(2);
    expect(bars[0].open).toBe(10.00);
    expect(bars[0].volume).toBeGreaterThan(0);
  });

  it('K线高低点', () => {
    const bars = aggregateTicks(ticks, 3000);
    expect(bars[0].high).toBeGreaterThanOrEqual(bars[0].low);
  });

  it('空tick聚合', () => {
    expect(aggregateTicks([], 1000)).toEqual([]);
  });

  it('实时VWAP', () => {
    const vwap = calcRealTimeVWAP(ticks);
    expect(vwap).toBeGreaterThan(10);
    expect(vwap).toBeLessThan(10.05);
  });

  it('VWAP空数据', () => {
    expect(calcRealTimeVWAP([])).toBe(0);
  });

  it('价格异常检测', () => {
    const abnormal = [
      { price: 10, volume: 100, time: 1 },
      { price: 15, volume: 100, time: 2 }, // 50%跳变
    ];
    const indices = detectPriceAnomaly(abnormal, 0.05);
    expect(indices).toContain(1);
  });

  it('无价格异常', () => {
    expect(detectPriceAnomaly(ticks, 0.05)).toHaveLength(0);
  });

  it('Tick不平衡度', () => {
    const imb = calcTickImbalance(ticks);
    expect(imb).toBeGreaterThanOrEqual(-1);
    expect(imb).toBeLessThanOrEqual(1);
  });

  it('重采样', () => {
    const prices = [1, 2, 3, 4, 5, 6];
    const resampled = resampleOHLC(prices, 1, 2);
    expect(resampled).toHaveLength(3);
    expect(resampled[0]).toBe(1.5);
  });

  it('重采样比例1', () => {
    const prices = [1, 2, 3];
    expect(resampleOHLC(prices, 2, 1)).toEqual(prices);
  });

  it('滚动平均', () => {
    const avg = calcRollingAverage([1, 2, 3, 4, 5], 3);
    expect(avg).toHaveLength(5);
    expect(avg[2]).toBe(2); // (1+2+3)/3
    expect(avg[4]).toBe(4); // (3+4+5)/3
  });

  it('滚动平均窗口1', () => {
    const avg = calcRollingAverage([10, 20, 30], 1);
    expect(avg).toEqual([10, 20, 30]);
  });

  it('成交量异常检测', () => {
    const spikes = detectVolumeSpike([
      { price: 10, volume: 100, time: 1 },
      { price: 10, volume: 100, time: 2 },
      { price: 10, volume: 1000, time: 3 },
    ], 2);
    expect(spikes).toContain(2);
  });

  it('资金流向', () => {
    const flow = calcTradeFlow(ticks);
    expect(flow.buy).toBeGreaterThan(0);
    expect(flow.sell).toBeGreaterThan(0);
    expect(flow.net).toBe(flow.buy - flow.sell);
  });

  it('单tick流向', () => {
    expect(calcTradeFlow([{ price: 10, volume: 100, time: 1 }])).toEqual({ buy: 0, sell: 0, net: 0 });
  });
});
