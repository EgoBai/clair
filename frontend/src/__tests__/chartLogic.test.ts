import { describe, it, expect } from 'vitest';

/**
 * 图表逻辑工具测试
 * K线数据处理/指标计算/格式化
 */

interface KLineData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

function calculateKLineColors(data: KLineData[]): { red: number; green: number; flat: number } {
  let red = 0, green = 0, flat = 0;
  data.forEach(d => {
    if (d.close > d.open) red++;
    else if (d.close < d.open) green++;
    else flat++;
  });
  return { red, green, flat };
}

function detectCandlePattern(data: KLineData[]): string {
  if (data.length === 0) return 'none';
  const last = data[data.length - 1];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const upperShadow = last.high - Math.max(last.open, last.close);
  const lowerShadow = Math.min(last.open, last.close) - last.low;

  if (range === 0) return 'doji';
  if (body / range < 0.1) return 'doji';
  if (lowerShadow > body * 2 && upperShadow < body * 0.5) return 'hammer';
  if (upperShadow > body * 2 && lowerShadow < body * 0.5) return 'shooting_star';
  if (body / range > 0.8) return last.close > last.open ? 'bullish_marubozu' : 'bearish_marubozu';
  return 'normal';
}

function calculateVolumeProfile(data: KLineData[], bins: number = 10): Array<{ price: number; volume: number; pct: number }> {
  if (data.length === 0) return [];
  const minPrice = Math.min(...data.map(d => d.low));
  const maxPrice = Math.max(...data.map(d => d.high));
  const step = (maxPrice - minPrice) / bins;
  if (step === 0) return [{ price: minPrice, volume: data.reduce((s, d) => s + d.volume, 0), pct: 100 }];

  const profile = Array.from({ length: bins }, (_, i) => ({
    price: minPrice + step * (i + 0.5),
    volume: 0,
    pct: 0,
  }));

  data.forEach(d => {
    const avgPrice = (d.high + d.low) / 2;
    const idx = Math.min(bins - 1, Math.floor((avgPrice - minPrice) / step));
    profile[idx].volume += d.volume;
  });

  const totalVol = profile.reduce((s, p) => s + p.volume, 0);
  profile.forEach(p => { p.pct = totalVol > 0 ? parseFloat(((p.volume / totalVol) * 100).toFixed(2)) : 0; });
  return profile;
}

function resampleKLine(data: KLineData[], interval: number): KLineData[] {
  if (interval <= 1) return data;
  const result: KLineData[] = [];
  for (let i = 0; i < data.length; i += interval) {
    const chunk = data.slice(i, i + interval);
    result.push({
      date: chunk[0].date,
      open: chunk[0].open,
      close: chunk[chunk.length - 1].close,
      high: Math.max(...chunk.map(d => d.high)),
      low: Math.min(...chunk.map(d => d.low)),
      volume: chunk.reduce((s, d) => s + d.volume, 0),
    });
  }
  return result;
}

describe('图表逻辑', () => {
  const makeKLine = (close: number, open?: number): KLineData => ({
    date: '2024-01-01',
    open: open ?? close - 1,
    close,
    high: Math.max(close, open ?? close - 1) + 0.5,
    low: Math.min(close, open ?? close - 1) - 0.5,
    volume: 1000000,
  });

  describe('calculateKLineColors', () => {
    it('should count up/down/flat candles', () => {
      const data = [makeKLine(10, 8), makeKLine(7, 9), makeKLine(5, 5)];
      const colors = calculateKLineColors(data);
      expect(colors.red).toBe(1);
      expect(colors.green).toBe(1);
      expect(colors.flat).toBe(1);
    });
  });

  describe('detectCandlePattern', () => {
    it('should detect doji', () => {
      expect(detectCandlePattern([{ date: '', open: 10, close: 10.01, high: 10.5, low: 9.5, volume: 100 }])).toBe('doji');
    });

    it('should detect hammer', () => {
      const hammer: KLineData = { date: '', open: 10, close: 10.5, high: 10.6, low: 8, volume: 100 };
      expect(detectCandlePattern([hammer])).toBe('hammer');
    });

    it('should detect bullish marubozu', () => {
      const marubozu: KLineData = { date: '', open: 10, close: 12, high: 12.05, low: 9.95, volume: 100 };
      expect(detectCandlePattern([marubozu])).toBe('bullish_marubozu');
    });

    it('should return none for empty', () => {
      expect(detectCandlePattern([])).toBe('none');
    });
  });

  describe('calculateVolumeProfile', () => {
    it('should distribute volume across bins', () => {
      const data = [makeKLine(10), makeKLine(15), makeKLine(20)];
      const profile = calculateVolumeProfile(data, 3);
      expect(profile).toHaveLength(3);
      expect(profile.reduce((s, p) => s + p.pct, 0)).toBeCloseTo(100, 0);
    });

    it('should handle flat data', () => {
      const data = [makeKLine(10), makeKLine(10)];
      const profile = calculateVolumeProfile(data, 5);
      expect(profile.length).toBeGreaterThanOrEqual(1);
      const totalPct = profile.reduce((s, p) => s + p.pct, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });
  });

  describe('resampleKLine', () => {
    it('should downsample data', () => {
      const data = Array.from({ length: 10 }, (_, i) => makeKLine(10 + i));
      const resampled = resampleKLine(data, 2);
      expect(resampled).toHaveLength(5);
      expect(resampled[0].open).toBe(data[0].open);
      expect(resampled[0].close).toBe(data[1].close);
      expect(resampled[0].volume).toBe(data[0].volume + data[1].volume);
    });

    it('should return original for interval 1', () => {
      const data = [makeKLine(10), makeKLine(11)];
      expect(resampleKLine(data, 1)).toEqual(data);
    });
  });
});
