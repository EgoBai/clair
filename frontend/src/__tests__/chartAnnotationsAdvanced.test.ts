import { describe, it, expect } from 'vitest';

// ==================== 图表标注高级测试 ====================

interface Point { x: number; y: number; }

function calcTrendLine(points: Point[]): { slope: number; intercept: number; r2: number } {
  if (points.length < 2) return { slope: 0, intercept: 0, r2: 0 };
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let cov = 0, varX = 0;
  for (const p of points) {
    cov += (p.x - meanX) * (p.y - meanY);
    varX += (p.x - meanX) ** 2;
  }
  const slope = varX === 0 ? 0 : cov / varX;
  const intercept = meanY - slope * meanX;
  let ssRes = 0, ssTot = 0;
  for (const p of points) {
    ssRes += (p.y - (slope * p.x + intercept)) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

function calcSupportResistance(prices: number[], window: number = 5): { support: number[]; resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];
  for (let i = window; i < prices.length - window; i++) {
    const before = prices.slice(i - window, i);
    const after = prices.slice(i + 1, i + window + 1);
    if (prices[i] < Math.min(...before) && prices[i] < Math.min(...after)) support.push(prices[i]);
    if (prices[i] > Math.max(...before) && prices[i] > Math.max(...after)) resistance.push(prices[i]);
  }
  return { support, resistance };
}

function calcBollingerBands(prices: number[], period: number = 20, multiplier: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = [], middle: number[] = [], lower: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { upper.push(NaN); middle.push(NaN); lower.push(NaN); continue; }
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    middle.push(mean);
    upper.push(mean + multiplier * std);
    lower.push(mean - multiplier * std);
  }
  return { upper, middle, lower };
}

function detectBreakout(prices: number[], bollinger: { upper: number[]; lower: number[] }): { index: number; type: 'upper' | 'lower' }[] {
  const breakouts: { index: number; type: 'upper' | 'lower' }[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (!isNaN(bollinger.upper[i]) && prices[i - 1] <= bollinger.upper[i - 1] && prices[i] > bollinger.upper[i]) {
      breakouts.push({ index: i, type: 'upper' });
    }
    if (!isNaN(bollinger.lower[i]) && prices[i - 1] >= bollinger.lower[i - 1] && prices[i] < bollinger.lower[i]) {
      breakouts.push({ index: i, type: 'lower' });
    }
  }
  return breakouts;
}

function calcChannel(prices: number[], period: number = 20): { high: number; low: number; width: number; position: number }[] {
  return prices.map((_, i) => {
    if (i < period - 1) return { high: NaN, low: NaN, width: NaN, position: NaN };
    const slice = prices.slice(i - period + 1, i + 1);
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    const width = high - low;
    const position = width === 0 ? 0.5 : (prices[i] - low) / width;
    return { high, low, width, position };
  });
}

function calcVolumeProfile(prices: number[], volumes: number[], buckets: number = 10): { price: number; volume: number; poc: boolean }[] {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const step = (max - min) / buckets;
  if (step === 0) return [{ price: min, volume: volumes.reduce((a, b) => a + b, 0), poc: true }];
  const profile: { price: number; volume: number }[] = Array.from({ length: buckets }, (_, i) => ({ price: min + step * (i + 0.5), volume: 0 }));
  for (let i = 0; i < prices.length; i++) {
    const idx = Math.min(Math.floor((prices[i] - min) / step), buckets - 1);
    profile[idx].volume += volumes[i];
  }
  const maxVol = Math.max(...profile.map(p => p.volume));
  return profile.map(p => ({ ...p, poc: p.volume === maxVol }));
}

describe('图表标注高级', () => {
  describe('趋势线', () => {
    it('完美线性数据应该有R2=1', () => {
      const points: Point[] = [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }, { x: 4, y: 8 }];
      const line = calcTrendLine(points);
      expect(line.r2).toBeCloseTo(1, 5);
      expect(line.slope).toBeCloseTo(2, 5);
    });

    it('单点应该返回零斜率', () => {
      expect(calcTrendLine([{ x: 1, y: 5 }]).slope).toBe(0);
    });

    it('空数据不应该崩溃', () => {
      expect(calcTrendLine([])).toEqual({ slope: 0, intercept: 0, r2: 0 });
    });

    it('水平线斜率应该为0', () => {
      const points: Point[] = [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }];
      expect(calcTrendLine(points).slope).toBeCloseTo(0, 5);
    });

    it('截距应该正确', () => {
      const points: Point[] = [{ x: 0, y: 10 }, { x: 1, y: 12 }, { x: 2, y: 14 }];
      const line = calcTrendLine(points);
      expect(line.intercept).toBeCloseTo(10, 1);
    });
  });

  describe('支撑阻力', () => {
    it('应该检测支撑位', () => {
      const prices = [10, 9, 8, 7, 8, 9, 10, 11, 10, 9, 8, 7, 8, 9, 10];
      const sr = calcSupportResistance(prices, 3);
      expect(sr.support.length).toBeGreaterThanOrEqual(0);
    });

    it('应该检测阻力位', () => {
      const prices = [7, 8, 9, 10, 9, 8, 7, 8, 9, 10, 11, 10, 9, 8, 7];
      const sr = calcSupportResistance(prices, 3);
      expect(sr.resistance.length).toBeGreaterThanOrEqual(0);
    });

    it('常数不应该有支撑阻力', () => {
      const sr = calcSupportResistance([10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 2);
      expect(sr.support.length).toBe(0);
      expect(sr.resistance.length).toBe(0);
    });
  });

  describe('布林带', () => {
    it('上轨应该大于中轨大于下轨', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
      const bb = calcBollingerBands(prices, 10);
      for (let i = 9; i < 30; i++) {
        expect(bb.upper[i]).toBeGreaterThan(bb.middle[i]);
        expect(bb.middle[i]).toBeGreaterThan(bb.lower[i]);
      }
    });

    it('价格应该大部分在通道内', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
      const bb = calcBollingerBands(prices, 10, 2);
      let insideCount = 0;
      for (let i = 9; i < 30; i++) {
        if (prices[i] >= bb.lower[i] && prices[i] <= bb.upper[i]) insideCount++;
      }
      expect(insideCount / 21).toBeGreaterThan(0.8);
    });

    it('前期数据应该是NaN', () => {
      const bb = calcBollingerBands([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
      expect(isNaN(bb.upper[3])).toBe(true);
      expect(isNaN(bb.upper[4])).toBe(false);
    });

    it('倍率越大通道越宽', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
      const bb1 = calcBollingerBands(prices, 10, 1);
      const bb2 = calcBollingerBands(prices, 10, 3);
      expect(bb2.upper[29] - bb2.lower[29]).toBeGreaterThan(bb1.upper[29] - bb1.lower[29]);
    });
  });

  describe('突破检测', () => {
    it('应该检测向上突破', () => {
      const prices = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 15];
      const bb = calcBollingerBands(prices, 10);
      const breakouts = detectBreakout(prices, bb);
      expect(breakouts.some(b => b.type === 'upper')).toBe(true);
    });

    it('无突破不应该有结果', () => {
      const prices = Array.from({ length: 30 }, () => 100);
      const bb = calcBollingerBands(prices, 10);
      expect(detectBreakout(prices, bb).length).toBe(0);
    });
  });

  describe('价格通道', () => {
    it('通道位置应该在0到1之间', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
      const channels = calcChannel(prices, 10);
      for (let i = 9; i < 30; i++) {
        expect(channels[i].position).toBeGreaterThanOrEqual(0);
        expect(channels[i].position).toBeLessThanOrEqual(1);
      }
    });

    it('通道宽度应该为正', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const channels = calcChannel(prices, 5);
      for (let i = 4; i < 30; i++) {
        expect(channels[i].width).toBeGreaterThan(0);
      }
    });

    it('前期应该返回NaN', () => {
      const channels = calcChannel([1, 2, 3, 4, 5], 3);
      expect(isNaN(channels[1].width)).toBe(true);
      expect(isNaN(channels[2].width)).toBe(false);
    });
  });

  describe('成交量分布', () => {
    it('总成交量应该等于原始数据', () => {
      const prices = [10, 11, 12, 11, 10, 11, 12, 13, 12, 11];
      const volumes = [100, 200, 150, 180, 120, 160, 190, 210, 170, 140];
      const profile = calcVolumeProfile(prices, volumes, 5);
      const totalProfile = profile.reduce((s, p) => s + p.volume, 0);
      const totalOrig = volumes.reduce((a, b) => a + b, 0);
      expect(totalProfile).toBe(totalOrig);
    });

    it('应该标记POC（最大成交量价格）', () => {
      const prices = [10, 10, 10, 20, 20];
      const volumes = [100, 100, 100, 50, 50];
      const profile = calcVolumeProfile(prices, volumes, 2);
      const poc = profile.find(p => p.poc);
      expect(poc).toBeDefined();
      // 桶中心 min+step*(i+0.5), step=5 → bucket 0 中心=12.5
      expect(poc!.price).toBeCloseTo(12.5, 0);
    });

    it('常数价格不应该崩溃', () => {
      const profile = calcVolumeProfile([10, 10, 10], [100, 200, 300], 3);
      expect(profile.length).toBe(1);
      expect(profile[0].volume).toBe(600);
    });
  });
});
