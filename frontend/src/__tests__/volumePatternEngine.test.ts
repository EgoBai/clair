import { describe, it, expect } from 'vitest';
import { detectVolumePatterns, VolumeCandle } from '../utils/volumePatternEngine';

describe('成交量形态引擎', () => {
  const makeCandles = (n: number): VolumeCandle[] =>
    Array.from({ length: n }, (_, i) => {
      const base = 10 + Math.sin(i * 0.2) * 1;
      const vol = i === 25 ? 50000 : 5000 + Math.random() * 3000; // spike at 25
      return {
        date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        open: base,
        high: base + Math.random() * 0.5,
        low: base - Math.random() * 0.5,
        close: base + (Math.random() - 0.5) * 0.3,
        volume: Math.floor(vol),
      };
    });

  const candles = makeCandles(40);

  it('应该检测成交量模式', () => {
    const result = detectVolumePatterns(candles);
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('应该计算平均成交量', () => {
    const result = detectVolumePatterns(candles);
    expect(result.avgVolume).toBeGreaterThan(0);
  });

  it('应该判断量能趋势', () => {
    const result = detectVolumePatterns(candles);
    expect(['increasing', 'decreasing', 'stable']).toContain(result.volumeTrend);
  });

  it('应该计算量价相关性', () => {
    const result = detectVolumePatterns(candles);
    expect(result.priceVolumeCorrelation).toBeGreaterThanOrEqual(-1);
    expect(result.priceVolumeCorrelation).toBeLessThanOrEqual(1);
  });

  it('模式应有类型', () => {
    const result = detectVolumePatterns(candles);
    for (const p of result.patterns) {
      expect(['volume_spike', 'volume_dry_up', 'bottom_volume', 'top_volume',
        'bullish_divergence', 'bearish_divergence', 'climax', 'normal']).toContain(p.type);
    }
  });

  it('模式应有显著性', () => {
    const result = detectVolumePatterns(candles);
    for (const p of result.patterns) {
      expect(p.significance).toBeGreaterThanOrEqual(0);
      expect(p.significance).toBeLessThanOrEqual(1);
    }
  });

  it('应该返回当前模式', () => {
    const result = detectVolumePatterns(candles);
    expect(result.currentPattern === null || typeof result.currentPattern === 'object').toBe(true);
  });

  it('应该生成警报', () => {
    const result = detectVolumePatterns(candles);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('不足数据应抛出错误', () => {
    expect(() => detectVolumePatterns(candles.slice(0, 10))).toThrow();
  });

  it('放量K线应被检测', () => {
    const result = detectVolumePatterns(candles);
    const spikes = result.patterns.filter(p => p.type === 'volume_spike' || p.type === 'climax');
    expect(spikes.length).toBeGreaterThan(0);
  });

  it('成交量比率应大于0', () => {
    const result = detectVolumePatterns(candles);
    for (const p of result.patterns) {
      expect(p.volumeRatio).toBeGreaterThan(0);
    }
  });

  it('模式应有描述', () => {
    const result = detectVolumePatterns(candles);
    for (const p of result.patterns) {
      expect(p.description.length).toBeGreaterThan(0);
    }
  });
});
