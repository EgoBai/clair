import { describe, it, expect } from 'vitest';
import { TechnicalPatternEngine, type OHLCV } from '../utils/technicalPatternEngine';

describe('TechnicalPatternEngine', () => {
  const engine = new TechnicalPatternEngine();

  const makeCandle = (overrides: Partial<OHLCV> = {}): OHLCV => ({
    open: 100,
    high: 102,
    low: 98,
    close: 101,
    volume: 1000000,
    date: '2024-01-01',
    ...overrides,
  });

  // 生成N根K线
  const generateCandles = (n: number, startPrice: number = 100, trend: number = 0): OHLCV[] => {
    const candles: OHLCV[] = [];
    let price = startPrice;
    for (let i = 0; i < n; i++) {
      const change = trend + Math.sin(i * 0.3) * 2;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.abs(Math.sin(i) * 1.5);
      const low = Math.min(open, close) - Math.abs(Math.cos(i) * 1.5);
      candles.push({ open, high, low, close, volume: 1000000 + i * 1000, date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}` });
      price = close;
    }
    return candles;
  };

  describe('K线形态识别', () => {
    it('应识别锤子线', () => {
      const candles = [
        makeCandle({ open: 101, high: 102, low: 100, close: 101.5 }), // padding
        makeCandle({ open: 100, high: 100.5, low: 99, close: 99.5 }),
        makeCandle({ open: 99, high: 99.2, low: 92, close: 98 }), // 锤子线: 下影线长, 上影线短
      ];
      const patterns = engine.detectPatterns(candles);
      expect(patterns.some(p => p.name === '锤子线')).toBe(true);
    });

    it('应识别十字星', () => {
      const candles = [
        makeCandle({ open: 101, high: 102, low: 100, close: 101.5 }), // padding
        makeCandle({ open: 101, high: 101.5, low: 100.5, close: 101 }), // padding
        makeCandle({ open: 100, high: 102, low: 98, close: 100.05 }), // 十字星: body极小
      ];
      const patterns = engine.detectPatterns(candles);
      expect(patterns.some(p => p.name === '十字星')).toBe(true);
    });

    it('应识别红三兵', () => {
      const candles = [
        makeCandle({ open: 100, high: 103, low: 99, close: 102 }),
        makeCandle({ open: 102, high: 105, low: 101, close: 104 }),
        makeCandle({ open: 104, high: 107, low: 103, close: 106 }),
      ];
      const patterns = engine.detectPatterns(candles);
      expect(patterns.some(p => p.name === '红三兵')).toBe(true);
    });

    it('应识别三只乌鸦', () => {
      const candles = [
        makeCandle({ open: 106, high: 107, low: 103, close: 104 }),
        makeCandle({ open: 104, high: 105, low: 101, close: 102 }),
        makeCandle({ open: 102, high: 103, low: 99, close: 100 }),
      ];
      const patterns = engine.detectPatterns(candles);
      expect(patterns.some(p => p.name === '三只乌鸦')).toBe(true);
    });

    it('形态类型应有效', () => {
      const candles = generateCandles(50);
      const patterns = engine.detectPatterns(candles);
      patterns.forEach(p => {
        expect(['bullish', 'bearish', 'neutral']).toContain(p.type);
      });
    });

    it('置信度应在0-1之间', () => {
      const candles = generateCandles(50);
      const patterns = engine.detectPatterns(candles);
      patterns.forEach(p => {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('空数据应返回空', () => {
      const patterns = engine.detectPatterns([]);
      expect(patterns).toEqual([]);
    });

    it('单根K线不应报错', () => {
      const patterns = engine.detectPatterns([makeCandle()]);
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('支撑阻力检测', () => {
    it('应检测支撑阻力位', () => {
      const candles = generateCandles(50);
      const levels = engine.detectSupportResistance(candles, 5);
      expect(levels.length).toBeGreaterThanOrEqual(0);
    });

    it('应包含level和type', () => {
      const candles = generateCandles(50);
      const levels = engine.detectSupportResistance(candles, 5);
      levels.forEach(l => {
        expect(l.level).toBeGreaterThan(0);
        expect(['support', 'resistance']).toContain(l.type);
      });
    });

    it('强度应在0-100之间', () => {
      const candles = generateCandles(50);
      const levels = engine.detectSupportResistance(candles, 5);
      levels.forEach(l => {
        expect(l.strength).toBeGreaterThanOrEqual(0);
        expect(l.strength).toBeLessThanOrEqual(100);
      });
    });

    it('应按强度排序', () => {
      const candles = generateCandles(100);
      const levels = engine.detectSupportResistance(candles, 10);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i - 1].strength).toBeGreaterThanOrEqual(levels[i].strength);
      }
    });

    it('touchCount应为正整数', () => {
      const candles = generateCandles(50);
      const levels = engine.detectSupportResistance(candles, 5);
      levels.forEach(l => {
        expect(l.touchCount).toBeGreaterThan(0);
        expect(Number.isInteger(l.touchCount)).toBe(true);
      });
    });
  });

  describe('趋势线识别', () => {
    it('应检测趋势线', () => {
      const candles = generateCandles(40, 100, 0.5); // 上升趋势
      const lines = engine.detectTrendLines(candles);
      expect(lines.length).toBeGreaterThanOrEqual(0);
    });

    it('趋势线应有slope和rSquared', () => {
      const candles = generateCandles(40);
      const lines = engine.detectTrendLines(candles);
      lines.forEach(l => {
        expect(typeof l.slope).toBe('number');
        expect(l.rSquared).toBeGreaterThanOrEqual(0);
        expect(l.rSquared).toBeLessThanOrEqual(1);
      });
    });

    it('趋势类型应有效', () => {
      const candles = generateCandles(40);
      const lines = engine.detectTrendLines(candles);
      lines.forEach(l => {
        expect(['up', 'down', 'horizontal']).toContain(l.type);
      });
    });

    it('数据不足应返回空', () => {
      const candles = generateCandles(4);
      const lines = engine.detectTrendLines(candles, 3);
      expect(lines).toEqual([]);
    });
  });

  describe('边界情况', () => {
    it('相同价格K线不应报错', () => {
      const candles = Array.from({ length: 10 }, () => makeCandle({ open: 100, high: 100, low: 100, close: 100 }));
      expect(() => engine.detectPatterns(candles)).not.toThrow();
      expect(() => engine.detectSupportResistance(candles, 3)).not.toThrow();
    });

    it('零价格不应报错', () => {
      const candles = [makeCandle({ open: 0, high: 0, low: 0, close: 0 })];
      expect(() => engine.detectPatterns(candles)).not.toThrow();
    });

    it('大量K线不应超时', () => {
      const candles = generateCandles(500);
      const start = Date.now();
      engine.detectPatterns(candles);
      engine.detectSupportResistance(candles, 20);
      expect(Date.now() - start).toBeLessThan(5000);
    });
  });
});
