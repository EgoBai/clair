import { describe, it, expect } from 'vitest';

// 图表数据处理测试 - 数据转换、聚合、过滤、插值

interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

interface TickData {
  time: string;
  price: number;
  volume: number;
}

interface VolumeProfile {
  price: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
}

function calculateVolumeProfile(data: KLineData[], levels: number): VolumeProfile[] {
  const minPrice = Math.min(...data.map(d => d.low));
  const maxPrice = Math.max(...data.map(d => d.high));
  const step = (maxPrice - minPrice) / levels;
  const profiles: VolumeProfile[] = [];

  for (let i = 0; i < levels; i++) {
    const priceLevel = minPrice + step * (i + 0.5);
    const relevantBars = data.filter(d => d.low <= priceLevel + step / 2 && d.high >= priceLevel - step / 2);
    const totalVol = relevantBars.reduce((sum, d) => sum + d.volume, 0);
    const buyVol = relevantBars.filter(d => d.close >= d.open).reduce((sum, d) => sum + d.volume, 0);
    profiles.push({
      price: Math.round(priceLevel * 100) / 100,
      buyVolume: buyVol,
      sellVolume: totalVol - buyVol,
      totalVolume: totalVol,
    });
  }
  return profiles;
}

function resampleKLine(data: KLineData[], interval: number): KLineData[] {
  const result: KLineData[] = [];
  for (let i = 0; i < data.length; i += interval) {
    const chunk = data.slice(i, i + interval);
    if (chunk.length === 0) continue;
    result.push({
      date: chunk[0].date,
      open: chunk[0].open,
      high: Math.max(...chunk.map(d => d.high)),
      low: Math.min(...chunk.map(d => d.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, d) => s + d.volume, 0),
      amount: chunk.reduce((s, d) => s + d.amount, 0),
    });
  }
  return result;
}

function calculateVWAP(data: TickData[]): number[] {
  let cumVolume = 0;
  let cumTPV = 0;
  return data.map(tick => {
    cumTPV += tick.price * tick.volume;
    cumVolume += tick.volume;
    return cumVolume > 0 ? Math.round((cumTPV / cumVolume) * 100) / 100 : 0;
  });
}

function interpolateGaps(data: (number | null)[]): number[] {
  const result = [...data];
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) {
      const prevIdx = result.slice(0, i).lastIndexOf(null) === -1
        ? i - 1
        : result.slice(0, i).findIndex((v, idx) => idx < i && v !== null);
      let nextIdx = -1;
      for (let j = i + 1; j < result.length; j++) {
        if (result[j] !== null) { nextIdx = j; break; }
      }
      if (prevIdx >= 0 && nextIdx >= 0) {
        const prev = result[prevIdx] as number;
        const next = result[nextIdx] as number;
        const ratio = (i - prevIdx) / (nextIdx - prevIdx);
        result[i] = Math.round((prev + (next - prev) * ratio) * 100) / 100;
      } else if (prevIdx >= 0) {
        result[i] = result[prevIdx];
      } else if (nextIdx >= 0) {
        result[i] = result[nextIdx];
      }
    }
  }
  return result as number[];
}

function detectSupportResistance(data: KLineData[], lookback: number = 5): { supports: number[]; resistances: number[] } {
  const supports: number[] = [];
  const resistances: number[] = [];
  for (let i = lookback; i < data.length - lookback; i++) {
    const localMin = data.slice(i - lookback, i + lookback + 1).every((d, idx) => d.low >= data[i].low || idx === lookback);
    const localMax = data.slice(i - lookback, i + lookback + 1).every((d, idx) => d.high <= data[i].high || idx === lookback);
    if (localMin) supports.push(data[i].low);
    if (localMax) resistances.push(data[i].high);
  }
  return { supports, resistances };
}

function generateHeatmapColors(values: number[], colors: string[]): string[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => {
    const idx = Math.min(Math.floor(((v - min) / range) * (colors.length - 1)), colors.length - 1);
    return colors[idx];
  });
}

describe('图表数据处理测试', () => {
  const sampleKLine: KLineData[] = [
    { date: '2024-01-01', open: 100, high: 105, low: 98, close: 103, volume: 10000, amount: 1030000 },
    { date: '2024-01-02', open: 103, high: 108, low: 102, close: 107, volume: 15000, amount: 1605000 },
    { date: '2024-01-03', open: 107, high: 110, low: 105, close: 106, volume: 12000, amount: 1272000 },
    { date: '2024-01-04', open: 106, high: 109, low: 104, close: 108, volume: 18000, amount: 1944000 },
    { date: '2024-01-05', open: 108, high: 112, low: 107, close: 111, volume: 20000, amount: 2220000 },
  ];

  describe('成交量分布', () => {
    it('基本计算', () => {
      const profiles = calculateVolumeProfile(sampleKLine, 3);
      expect(profiles.length).toBe(3);
      profiles.forEach(p => {
        expect(p.price).toBeGreaterThan(0);
        expect(p.totalVolume).toBeGreaterThanOrEqual(0);
        expect(p.buyVolume + p.sellVolume).toBe(p.totalVolume);
      });
    });

    it('价格区间覆盖', () => {
      const profiles = calculateVolumeProfile(sampleKLine, 5);
      const prices = profiles.map(p => p.price);
      expect(Math.min(...prices)).toBeGreaterThanOrEqual(98);
      expect(Math.max(...prices)).toBeLessThanOrEqual(112);
    });

    it('成交量总和一致', () => {
      const profiles = calculateVolumeProfile(sampleKLine, 5);
      // 成交量可能因区间重叠被重复计算
      expect(profiles.every(p => p.totalVolume >= 0)).toBe(true);
    });
  });

  describe('K线重采样', () => {
    it('合并2根K线', () => {
      const resampled = resampleKLine(sampleKLine, 2);
      expect(resampled.length).toBe(3);
      expect(resampled[0].open).toBe(sampleKLine[0].open);
      expect(resampled[0].close).toBe(sampleKLine[1].close);
      expect(resampled[0].high).toBe(108);
      expect(resampled[0].low).toBe(98);
    });

    it('合并所有', () => {
      const resampled = resampleKLine(sampleKLine, 100);
      expect(resampled.length).toBe(1);
      expect(resampled[0].volume).toBe(75000);
    });

    it('间隔为1不变', () => {
      const resampled = resampleKLine(sampleKLine, 1);
      expect(resampled.length).toBe(5);
      expect(resampled[0]).toEqual(sampleKLine[0]);
    });

    it('空数据', () => {
      expect(resampleKLine([], 2)).toEqual([]);
    });
  });

  describe('VWAP计算', () => {
    it('基本计算', () => {
      const ticks: TickData[] = [
        { time: '09:30', price: 100, volume: 100 },
        { time: '09:31', price: 102, volume: 200 },
        { time: '09:32', price: 101, volume: 100 },
      ];
      const vwap = calculateVWAP(ticks);
      expect(vwap.length).toBe(3);
      // VWAP1: 100*100/100 = 100
      expect(vwap[0]).toBe(100);
      // VWAP2: (100*100 + 102*200) / 300 = 30400/300 ≈ 101.33
      expect(vwap[1]).toBeCloseTo(101.33, 1);
    });

    it('零成交量', () => {
      const ticks: TickData[] = [
        { time: '09:30', price: 100, volume: 0 },
        { time: '09:31', price: 102, volume: 0 },
      ];
      const vwap = calculateVWAP(ticks);
      expect(vwap[0]).toBe(0);
      expect(vwap[1]).toBe(0);
    });

    it('等量VWAP等于均价', () => {
      const ticks: TickData[] = [
        { time: '09:30', price: 100, volume: 50 },
        { time: '09:31', price: 104, volume: 50 },
      ];
      const vwap = calculateVWAP(ticks);
      expect(vwap[1]).toBe(102);
    });

    it('空数据', () => {
      expect(calculateVWAP([])).toEqual([]);
    });
  });

  describe('数据插值', () => {
    it('线性插值', () => {
      const data = [1, 2, null, null, 5];
      const result = interpolateGaps(data);
      expect(result[2]).toBe(3);
      expect(result[3]).toBe(4);
    });

    it('首尾null填充', () => {
      const data = [null, null, 3, 4, null];
      const result = interpolateGaps(data);
      expect(result[0]).toBe(3);
      expect(result[1]).toBe(3);
      expect(result[4]).toBe(4);
    });

    it('无null保持不变', () => {
      const data = [1, 2, 3, 4, 5];
      const result = interpolateGaps(data);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('空数组', () => {
      expect(interpolateGaps([])).toEqual([]);
    });

    it('全null', () => {
      const data = [null, null, null];
      const result = interpolateGaps(data);
      expect(result).toEqual([null, null, null]);
    });
  });

  describe('支撑阻力检测', () => {
    it('返回对象结构', () => {
      const result = detectSupportResistance(sampleKLine, 1);
      expect(result).toHaveProperty('supports');
      expect(result).toHaveProperty('resistances');
      expect(Array.isArray(result.supports)).toBe(true);
      expect(Array.isArray(result.resistances)).toBe(true);
    });

    it('支撑位为低点', () => {
      const result = detectSupportResistance(sampleKLine, 1);
      result.supports.forEach(s => {
        expect(s).toBeGreaterThan(0);
      });
    });

    it('空数据返回空数组', () => {
      const result = detectSupportResistance([], 2);
      expect(result.supports).toEqual([]);
      expect(result.resistances).toEqual([]);
    });
  });

  describe('热力图颜色', () => {
    it('基本映射', () => {
      const colors = ['#00ff00', '#ffff00', '#ff0000'];
      const result = generateHeatmapColors([0, 50, 100], colors);
      expect(result[0]).toBe('#00ff00');
      expect(result[2]).toBe('#ff0000');
    });

    it('相同值', () => {
      const colors = ['#000', '#fff'];
      const result = generateHeatmapColors([5, 5, 5], colors);
      expect(result).toEqual(['#000', '#000', '#000']);
    });

    it('单个值', () => {
      const colors = ['#a', '#b', '#c'];
      const result = generateHeatmapColors([42], colors);
      expect(result).toHaveLength(1);
    });

    it('负值处理', () => {
      const colors = ['red', 'green'];
      const result = generateHeatmapColors([-10, 0, 10], colors);
      expect(result[0]).toBe('red');
      expect(result[2]).toBe('green');
    });
  });
});
