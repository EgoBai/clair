import { describe, it, expect, beforeEach } from 'vitest';
import { TrendPatternEngine } from '../utils/trendPatternEngine';
import type { CandleData } from '../utils/trendPatternEngine';

describe('TrendPatternEngine', () => {
  let engine: TrendPatternEngine;

  const createCandle = (overrides: Partial<CandleData> = {}): CandleData => ({
    open: 10,
    high: 11,
    low: 9.5,
    close: 10.5,
    volume: 1000000,
    ...overrides,
  });

  beforeEach(() => {
    engine = new TrendPatternEngine();
  });

  describe('单K线形态', () => {
    it('应该识别十字星', () => {
      const candle = createCandle({ open: 10, close: 10.05, high: 11, low: 9 });
      const patterns = engine.recognizeSingleCandle(candle);
      expect(patterns.some(p => p.name === '十字星')).toBe(true);
    });

    it('应该识别锤子线', () => {
      const candle = createCandle({ open: 10, close: 10.3, high: 10.4, low: 8 });
      const patterns = engine.recognizeSingleCandle(candle);
      expect(patterns.some(p => p.name === '锤子线')).toBe(true);
    });

    it('应该识别大阳线', () => {
      const candle = createCandle({ open: 9, close: 11, high: 11.2, low: 8.8 });
      const patterns = engine.recognizeSingleCandle(candle);
      expect(patterns.some(p => p.name === '大阳线')).toBe(true);
    });

    it('应该识别大阴线', () => {
      const candle = createCandle({ open: 11, close: 9, high: 11.2, low: 8.8 });
      const patterns = engine.recognizeSingleCandle(candle);
      expect(patterns.some(p => p.name === '大阴线')).toBe(true);
    });

    it('应该识别射击之星', () => {
      const candle = createCandle({ open: 10, close: 9.8, high: 14, low: 9.78 });
      const patterns = engine.recognizeSingleCandle(candle);
      expect(patterns.some(p => p.name === '射击之星')).toBe(true);
    });

    it('形态应包含置信度', () => {
      const candle = createCandle({ open: 9, close: 11, high: 11.2, low: 8.8 });
      const patterns = engine.recognizeSingleCandle(candle);
      for (const p of patterns) {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
        expect(['bullish', 'bearish', 'neutral']).toContain(p.type);
      }
    });

    it('普通K线应无特殊形态', () => {
      const candle = createCandle({ open: 10, close: 10.3, high: 10.8, low: 9.7 });
      const patterns = engine.recognizeSingleCandle(candle);
      // 不应有大阳/大阴线
      expect(patterns.some(p => p.name === '大阳线' || p.name === '大阴线')).toBe(false);
    });
  });

  describe('双K线形态', () => {
    it('应该识别乌云盖顶', () => {
      const c1 = createCandle({ open: 9, close: 11, high: 11.2, low: 8.8 }); // 大阳
      const c2 = createCandle({ open: 11.5, close: 9.5, high: 11.8, low: 9.3 }); // 高开低走
      const patterns = engine.recognizeTwoCandle(c1, c2);
      expect(patterns.some(p => p.name === '乌云盖顶')).toBe(true);
    });

    it('应该识别刺透形态', () => {
      const c1 = createCandle({ open: 11, close: 9, high: 11.2, low: 8.8 }); // 大阴
      const c2 = createCandle({ open: 8.5, close: 10.5, high: 10.8, low: 8.3 }); // 低开高走
      const patterns = engine.recognizeTwoCandle(c1, c2);
      expect(patterns.some(p => p.name === '刺透形态')).toBe(true);
    });

    it('应该识别孕育线', () => {
      const c1 = createCandle({ open: 8, close: 12, high: 12.5, low: 7.5 }); // 大K线
      const c2 = createCandle({ open: 10, close: 10.3, high: 10.5, low: 9.8 }); // 小K线在内部
      const patterns = engine.recognizeTwoCandle(c1, c2);
      expect(patterns.some(p => p.name === '孕育线')).toBe(true);
    });
  });

  describe('趋势分析', () => {
    it('应该识别上升趋势', () => {
      const candles = Array.from({ length: 20 }, (_, i) =>
        createCandle({ close: 10 + i * 0.5, high: 10 + i * 0.5 + 0.5, low: 10 + i * 0.5 - 0.3 })
      );
      const trend = engine.analyzeTrend(candles);
      expect(trend.direction).toBe('up');
      expect(trend.strength).toBeGreaterThan(50);
    });

    it('应该识别下降趋势', () => {
      const candles = Array.from({ length: 20 }, (_, i) =>
        createCandle({ close: 20 - i * 0.5, high: 20 - i * 0.5 + 0.5, low: 20 - i * 0.5 - 0.3 })
      );
      const trend = engine.analyzeTrend(candles);
      expect(trend.direction).toBe('down');
    });

    it('应该识别震荡', () => {
      const candles = Array.from({ length: 20 }, (_, i) =>
        createCandle({ close: 10 + (i % 2) * 0.01, high: 10.5, low: 9.5 })
      );
      const trend = engine.analyzeTrend(candles);
      expect(trend.direction).toBe('sideways');
    });

    it('应该计算支撑阻力', () => {
      const candles = Array.from({ length: 20 }, (_, i) =>
        createCandle({
          close: 10 + Math.sin(i) * 2,
          high: 10 + Math.sin(i) * 2 + 1,
          low: 10 + Math.sin(i) * 2 - 0.5,
        })
      );
      const trend = engine.analyzeTrend(candles);
      expect(trend.support).toBeLessThan(trend.resistance);
    });

    it('数据不足时返回sideways', () => {
      const trend = engine.analyzeTrend([createCandle()], 20);
      expect(trend.direction).toBe('sideways');
      expect(trend.strength).toBe(0);
    });
  });
});
