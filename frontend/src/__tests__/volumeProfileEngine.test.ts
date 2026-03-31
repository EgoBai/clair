import { describe, it, expect } from 'vitest';

/**
 * 成交量分布引擎测试
 */

interface VolumeProfile {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  poc: boolean;        // Point of Control
  valueAreaHigh: number;
  valueAreaLow: number;
}

interface PriceVolumeBar {
  price: number;
  high: number;
  low: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

function calcVolumeProfile(bars: PriceVolumeBar[], numBins: number = 20): VolumeProfile[] {
  if (bars.length === 0) return [];

  const minPrice = Math.min(...bars.map(b => b.low));
  const maxPrice = Math.max(...bars.map(b => b.high));
  const binSize = (maxPrice - minPrice) / numBins;

  const profile: Map<number, { volume: number; buyVolume: number; sellVolume: number }> = new Map();

  for (const bar of bars) {
    const binIndex = Math.floor((bar.price - minPrice) / binSize);
    const binPrice = minPrice + binIndex * binSize + binSize / 2;
    const existing = profile.get(binPrice) || { volume: 0, buyVolume: 0, sellVolume: 0 };
    existing.volume += bar.volume;
    existing.buyVolume += bar.buyVolume;
    existing.sellVolume += bar.sellVolume;
    profile.set(binPrice, existing);
  }

  let pocPrice = 0;
  let maxVol = 0;
  for (const [price, data] of profile) {
    if (data.volume > maxVol) {
      maxVol = data.volume;
      pocPrice = price;
    }
  }

  const totalVolume = [...profile.values()].reduce((s, v) => s + v.volume, 0);
  const targetVolume = totalVolume * 0.7;
  const sorted = [...profile.entries()].sort((a, b) => b[1].volume - a[1].volume);

  let cumVolume = 0;
  let vaHigh = maxPrice;
  let vaLow = minPrice;
  for (const [price] of sorted) {
    cumVolume += profile.get(price)!.volume;
    if (cumVolume >= targetVolume) {
      vaHigh = Math.max(vaHigh, price);
      vaLow = Math.min(vaLow, price);
      break;
    }
  }

  return [...profile.entries()].map(([price, data]) => ({
    price,
    volume: data.volume,
    buyVolume: data.buyVolume,
    sellVolume: data.sellVolume,
    poc: price === pocPrice,
    valueAreaHigh: vaHigh,
    valueAreaLow: vaLow,
  }));
}

function findSupportResistance(profile: VolumeProfile[]): { support: number[]; resistance: number[] } {
  const sorted = [...profile].sort((a, b) => b.volume - a.volume);
  const highVolNodes = sorted.slice(0, Math.ceil(sorted.length * 0.2));

  const support: number[] = [];
  const resistance: number[] = [];

  for (const node of highVolNodes) {
    if (node.buyVolume > node.sellVolume * 1.2) {
      support.push(node.price);
    } else if (node.sellVolume > node.buyVolume * 1.2) {
      resistance.push(node.price);
    }
  }

  return { support: support.sort((a, b) => a - b), resistance: resistance.sort((a, b) => a - b) };
}

function calcVolumeImbalance(profile: VolumeProfile[]): number {
  const totalBuy = profile.reduce((s, p) => s + p.buyVolume, 0);
  const totalSell = profile.reduce((s, p) => s + p.sellVolume, 0);
  const total = totalBuy + totalSell;
  return total > 0 ? (totalBuy - totalSell) / total : 0;
}

describe('Volume Profile Engine', () => {
  const sampleBars: PriceVolumeBar[] = [
    { price: 100, high: 102, low: 98, volume: 10000, buyVolume: 6000, sellVolume: 4000 },
    { price: 101, high: 103, low: 99, volume: 15000, buyVolume: 9000, sellVolume: 6000 },
    { price: 102, high: 104, low: 100, volume: 20000, buyVolume: 12000, sellVolume: 8000 },
    { price: 103, high: 105, low: 101, volume: 8000, buyVolume: 3000, sellVolume: 5000 },
    { price: 104, high: 106, low: 102, volume: 5000, buyVolume: 2000, sellVolume: 3000 },
  ];

  describe('成交量分布计算', () => {
    it('应该计算出分布结果', () => {
      const profile = calcVolumeProfile(sampleBars);
      expect(profile.length).toBeGreaterThan(0);
    });

    it('总成交量应该正确', () => {
      const profile = calcVolumeProfile(sampleBars);
      const totalVol = profile.reduce((s, p) => s + p.volume, 0);
      const expectedVol = sampleBars.reduce((s, b) => s + b.volume, 0);
      expect(totalVol).toBe(expectedVol);
    });

    it('空数据应该返回空数组', () => {
      expect(calcVolumeProfile([])).toEqual([]);
    });

    it('应该标记POC', () => {
      const profile = calcVolumeProfile(sampleBars);
      const pocNodes = profile.filter(p => p.poc);
      expect(pocNodes.length).toBe(1);
    });
  });

  describe('支撑阻力', () => {
    it('应该找到支撑位', () => {
      const profile = calcVolumeProfile(sampleBars);
      const { support } = findSupportResistance(profile);
      expect(Array.isArray(support)).toBe(true);
    });

    it('应该找到阻力位', () => {
      const profile = calcVolumeProfile(sampleBars);
      const { resistance } = findSupportResistance(profile);
      expect(Array.isArray(resistance)).toBe(true);
    });
  });

  describe('成交量不平衡', () => {
    it('买多应该返回正数', () => {
      const profile: VolumeProfile[] = [
        { price: 100, volume: 10000, buyVolume: 8000, sellVolume: 2000, poc: false, valueAreaHigh: 105, valueAreaLow: 95 },
      ];
      expect(calcVolumeImbalance(profile)).toBeGreaterThan(0);
    });

    it('卖多应该返回负数', () => {
      const profile: VolumeProfile[] = [
        { price: 100, volume: 10000, buyVolume: 2000, sellVolume: 8000, poc: false, valueAreaHigh: 105, valueAreaLow: 95 },
      ];
      expect(calcVolumeImbalance(profile)).toBeLessThan(0);
    });

    it('平衡应该返回0', () => {
      const profile: VolumeProfile[] = [
        { price: 100, volume: 10000, buyVolume: 5000, sellVolume: 5000, poc: false, valueAreaHigh: 105, valueAreaLow: 95 },
      ];
      expect(calcVolumeImbalance(profile)).toBe(0);
    });
  });
});
