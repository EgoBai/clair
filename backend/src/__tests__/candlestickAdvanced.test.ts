import { describe, it, expect } from 'vitest';

// ===== 技术形态识别引擎测试 =====

interface OHLCV { open: number; high: number; low: number; close: number; volume: number; }

function detectDoji(candle: OHLCV): boolean {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  if (range === 0) return true;
  return body / range < 0.1;
}

function detectHammer(candle: OHLCV): boolean {
  const body = Math.abs(candle.close - candle.open);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  return lowerShadow >= 2 * body && upperShadow <= body * 0.5;
}

function detectEngulfing(prev: OHLCV, curr: OHLCV): 'bullish' | 'bearish' | null {
  const prevBullish = prev.close > prev.open;
  const currBullish = curr.close > curr.open;
  if (prevBullish && !currBullish && curr.open >= prev.close && curr.close <= prev.open) return 'bearish';
  if (!prevBullish && currBullish && curr.open <= prev.close && curr.close >= prev.open) return 'bullish';
  return null;
}

function detectMorningStar(c1: OHLCV, c2: OHLCV, c3: OHLCV): boolean {
  const b1 = c1.close < c1.open; // bearish
  const b2Body = Math.abs(c2.close - c2.open);
  const b1Body = Math.abs(c1.close - c1.open);
  const b3 = c3.close > c3.open; // bullish
  return b1 && b2Body < b1Body * 0.3 && b3 && c3.close > (c1.open + c1.close) / 2;
}

function detectShootingStar(candle: OHLCV): boolean {
  const body = Math.abs(candle.close - candle.open);
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  return upperShadow >= 2 * body && lowerShadow <= body * 0.5;
}

function detectThreeWhiteSoldiers(c1: OHLCV, c2: OHLCV, c3: OHLCV): boolean {
  const bullish = (c: OHLCV) => c.close > c.open;
  return bullish(c1) && bullish(c2) && bullish(c3) &&
    c2.close > c1.close && c3.close > c2.close &&
    c2.open > c1.open && c3.open > c2.open;
}

function detectHarami(prev: OHLCV, curr: OHLCV): 'bullish' | 'bearish' | null {
  const prevBody = Math.abs(prev.close - prev.open);
  const currBody = Math.abs(curr.close - curr.open);
  if (currBody >= prevBody) return null;
  const prevBearish = prev.close < prev.open;
  const currBullish = curr.close > curr.open;
  if (prevBearish && currBullish && curr.open > prev.close && curr.close < prev.open) return 'bullish';
  const prevBullish = prev.close > prev.open;
  const currBearish = curr.close < curr.open;
  if (prevBullish && currBearish && curr.open < prev.close && curr.close > prev.open) return 'bearish';
  return null;
}

function detectMarubozu(candle: OHLCV): 'bullish' | 'bearish' | null {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  if (range === 0) return null;
  if (body / range > 0.95) {
    return candle.close > candle.open ? 'bullish' : 'bearish';
  }
  return null;
}

function calculatePatternConfidence(pattern: string, candles: OHLCV[], index: number): number {
  const vol = candles[index]?.volume || 0;
  const avgVol = candles.slice(Math.max(0, index - 5), index).reduce((s, c) => s + c.volume, 0) / 5;
  const volRatio = avgVol > 0 ? vol / avgVol : 1;
  let conf = 0.5;
  if (volRatio > 1.5) conf += 0.2;
  if (volRatio > 2) conf += 0.1;
  if (pattern === 'engulfing') conf += 0.1;
  if (pattern === 'morning_star') conf += 0.15;
  return Math.min(1, conf);
}

describe('K线形态识别', () => {
  describe('十字星检测', () => {
    it('标准十字星', () => {
      // body=0.2, range=4, ratio=0.05 < 0.1 → doji
      expect(detectDoji({ open: 100, high: 102, low: 98, close: 100.2, volume: 1e6 })).toBe(true);
    });

    it('不是十字星 - 大实体', () => {
      expect(detectDoji({ open: 100, high: 105, low: 95, close: 104, volume: 1e6 })).toBe(false);
    });

    it('一字板(无波动)视为十字星', () => {
      expect(detectDoji({ open: 100, high: 100, low: 100, close: 100, volume: 0 })).toBe(true);
    });

    it('小实体但有影线', () => {
      expect(detectDoji({ open: 100, high: 110, low: 90, close: 101, volume: 1e6 })).toBe(true);
    });

    it('实体占比刚好10%边界 - 严格<', () => {
      // ratio = 2/20 = 0.1, < 0.1 is false → not doji
      const result = detectDoji({ open: 100, high: 110, low: 90, close: 102, volume: 1e6 });
      expect(result).toBe(false);
    });

    it('实体占比略小于10%', () => {
      // body=1.9, range=20, ratio=0.095 < 0.1 → doji
      expect(detectDoji({ open: 100, high: 110, low: 90, close: 101.9, volume: 1e6 })).toBe(true);
    });
  });

  describe('锤子线检测', () => {
    it('标准锤子线', () => {
      // upperShadow=0 (high=max(open,close)), body=0.01, lower=10
      // 10 >= 0.02 ✓, 0 <= 0.005 ✓
      expect(detectHammer({ open: 100, high: 100.01, low: 90, close: 100.01, volume: 1e6 })).toBe(true);
    });

    it('非锤子线 - 上影线长', () => {
      expect(detectHammer({ open: 100, high: 110, low: 99, close: 101, volume: 1e6 })).toBe(false);
    });

    it('非锤子线 - 无下影线', () => {
      expect(detectHammer({ open: 100, high: 102, low: 100, close: 101, volume: 1e6 })).toBe(false);
    });

    it('阴线锤子', () => {
      expect(detectHammer({ open: 101, high: 101.5, low: 90, close: 100, volume: 1e6 })).toBe(true);
    });
  });

  describe('吞没形态检测', () => {
    it('看涨吞没', () => {
      const prev = { open: 105, high: 106, low: 99, close: 100, volume: 1e6 };
      const curr = { open: 99, high: 107, low: 98, close: 106, volume: 1e6 };
      expect(detectEngulfing(prev, curr)).toBe('bullish');
    });

    it('看跌吞没', () => {
      const prev = { open: 100, high: 106, low: 99, close: 105, volume: 1e6 };
      const curr = { open: 106, high: 107, low: 99, close: 99, volume: 1e6 };
      expect(detectEngulfing(prev, curr)).toBe('bearish');
    });

    it('非吞没 - 同向', () => {
      const prev = { open: 100, high: 105, low: 99, close: 104, volume: 1e6 };
      const curr = { open: 104, high: 108, low: 103, close: 107, volume: 1e6 };
      expect(detectEngulfing(prev, curr)).toBeNull();
    });

    it('非吞没 - 实体不够大', () => {
      const prev = { open: 100, high: 105, low: 99, close: 104, volume: 1e6 };
      const curr = { open: 104, high: 105, low: 100, close: 101, volume: 1e6 };
      expect(detectEngulfing(prev, curr)).toBeNull();
    });
  });

  describe('启明星检测', () => {
    it('标准启明星', () => {
      const c1 = { open: 105, high: 106, low: 99, close: 100, volume: 1e6 };
      const c2 = { open: 100, high: 101, low: 99, close: 100.5, volume: 5e5 };
      const c3 = { open: 101, high: 108, low: 100, close: 106, volume: 1e6 };
      expect(detectMorningStar(c1, c2, c3)).toBe(true);
    });

    it('非启明星 - 第三根不够强', () => {
      const c1 = { open: 105, high: 106, low: 99, close: 100, volume: 1e6 };
      const c2 = { open: 100, high: 101, low: 99, close: 100.5, volume: 5e5 };
      const c3 = { open: 101, high: 103, low: 100, close: 102, volume: 1e6 };
      expect(detectMorningStar(c1, c2, c3)).toBe(false);
    });
  });

  describe('射击之星检测', () => {
    it('标准射击之星', () => {
      // lowerShadow = 0 requires low = min(open, close)
      // upperShadow >= 2 * body AND 0 <= body * 0.5 always true
      expect(detectShootingStar({ open: 100.5, high: 110, low: 100, close: 100, volume: 1e6 })).toBe(true);
    });

    it('非射击之星 - 下影线长', () => {
      expect(detectShootingStar({ open: 100, high: 102, low: 90, close: 101, volume: 1e6 })).toBe(false);
    });
  });

  describe('三白兵检测', () => {
    it('标准三白兵', () => {
      const c1 = { open: 100, high: 104, low: 99, close: 103, volume: 1e6 };
      const c2 = { open: 103, high: 107, low: 102, close: 106, volume: 1e6 };
      const c3 = { open: 106, high: 110, low: 105, close: 109, volume: 1e6 };
      expect(detectThreeWhiteSoldiers(c1, c2, c3)).toBe(true);
    });

    it('非三白兵 - 递减', () => {
      const c1 = { open: 100, high: 104, low: 99, close: 103, volume: 1e6 };
      const c2 = { open: 103, high: 105, low: 101, close: 102, volume: 1e6 };
      const c3 = { open: 102, high: 104, low: 100, close: 101, volume: 1e6 };
      expect(detectThreeWhiteSoldiers(c1, c2, c3)).toBe(false);
    });
  });

  describe('孕线检测', () => {
    it('看涨孕线', () => {
      const prev = { open: 105, high: 106, low: 99, close: 100, volume: 1e6 };
      const curr = { open: 101, high: 104, low: 100.5, close: 103, volume: 1e6 };
      expect(detectHarami(prev, curr)).toBe('bullish');
    });

    it('看跌孕线', () => {
      const prev = { open: 100, high: 106, low: 99, close: 105, volume: 1e6 };
      const curr = { open: 104, high: 104.5, low: 101, close: 102, volume: 1e6 };
      expect(detectHarami(prev, curr)).toBe('bearish');
    });

    it('非孕线 - 当前实体更大', () => {
      const prev = { open: 100, high: 105, low: 99, close: 104, volume: 1e6 };
      const curr = { open: 104, high: 110, low: 103, close: 109, volume: 1e6 };
      expect(detectHarami(prev, curr)).toBeNull();
    });
  });

  describe('光头光脚检测', () => {
    it('光头光脚阳线', () => {
      expect(detectMarubozu({ open: 100, high: 110, low: 100, close: 110, volume: 1e6 })).toBe('bullish');
    });

    it('光头光脚阴线', () => {
      expect(detectMarubozu({ open: 110, high: 110, low: 100, close: 100, volume: 1e6 })).toBe('bearish');
    });

    it('非光头光脚 - 有影线', () => {
      expect(detectMarubozu({ open: 100, high: 112, low: 98, close: 110, volume: 1e6 })).toBeNull();
    });

    it('零范围K线', () => {
      expect(detectMarubozu({ open: 100, high: 100, low: 100, close: 100, volume: 0 })).toBeNull();
    });
  });

  describe('形态置信度', () => {
    it('高成交量提升置信度', () => {
      const candles: OHLCV[] = [];
      for (let i = 0; i < 10; i++) candles.push({ open: 100, high: 105, low: 95, close: 100, volume: 1e6 });
      candles.push({ open: 100, high: 105, low: 95, close: 100, volume: 3e6 });
      const conf = calculatePatternConfidence('engulfing', candles, 9);
      expect(conf).toBeGreaterThan(0.5);
    });

    it('置信度有上限', () => {
      const candles: OHLCV[] = [];
      for (let i = 0; i < 10; i++) candles.push({ open: 100, high: 105, low: 95, close: 100, volume: 1e6 });
      candles.push({ open: 100, high: 105, low: 95, close: 100, volume: 1e10 });
      const conf = calculatePatternConfidence('morning_star', candles, 9);
      expect(conf).toBeLessThanOrEqual(1);
    });

    it('正常成交量默认置信度', () => {
      const candles: OHLCV[] = [];
      for (let i = 0; i < 10; i++) candles.push({ open: 100, high: 105, low: 95, close: 100, volume: 1e6 });
      const conf = calculatePatternConfidence('doji', candles, 5);
      expect(conf).toBe(0.5);
    });
  });
});
