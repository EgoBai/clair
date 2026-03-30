import { describe, it, expect } from 'vitest';

// ===== 技术形态识别测试 =====
describe('Technical Pattern Recognition', () => {
  interface Candle {
    open: number;
    high: number;
    low: number;
    close: number;
  }

  // 基础形态判断
  const isDoji = (c: Candle, tolerance: number = 0.003): boolean => {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    return range > 0 && body / range < tolerance;
  };

  const isHammer = (c: Candle): boolean => {
    const body = Math.abs(c.close - c.open);
    const upperShadow = c.high - Math.max(c.close, c.open);
    const lowerShadow = Math.min(c.close, c.open) - c.low;
    return lowerShadow > body * 2 && upperShadow < body * 0.5;
  };

  const isInvertedHammer = (c: Candle): boolean => {
    const body = Math.abs(c.close - c.open);
    const upperShadow = c.high - Math.max(c.close, c.open);
    const lowerShadow = Math.min(c.close, c.open) - c.low;
    return upperShadow > body * 2 && lowerShadow < body * 0.5;
  };

  const isBullishEngulfing = (prev: Candle, curr: Candle): boolean => {
    const prevBearish = prev.close < prev.open;
    const currBullish = curr.close > curr.open;
    const engulfs = curr.open <= prev.close && curr.close >= prev.open;
    return prevBearish && currBullish && engulfs;
  };

  const isBearishEngulfing = (prev: Candle, curr: Candle): boolean => {
    const prevBullish = prev.close > prev.open;
    const currBearish = curr.close < curr.open;
    const engulfs = curr.open >= prev.close && curr.close <= prev.open;
    return prevBullish && currBearish && engulfs;
  };

  const isMorningStar = (c1: Candle, c2: Candle, c3: Candle): boolean => {
    const c1Bearish = c1.close < c1.open;
    const c2SmallBody = Math.abs(c2.close - c2.open) < (c1.high - c1.low) * 0.1;
    const c3Bullish = c3.close > c3.open;
    const c3ClosesAboveHalf = c3.close > (c1.open + c1.close) / 2;
    return c1Bearish && c2SmallBody && c3Bullish && c3ClosesAboveHalf;
  };

  const isMarubozu = (c: Candle, tolerance: number = 0.01): boolean => {
    const body = Math.abs(c.close - c.open);
    const totalRange = c.high - c.low;
    return totalRange > 0 && body / totalRange > (1 - tolerance);
  };

  describe('十字星', () => {
    it('开收相等应为十字星', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10 })).toBe(true);
    });

    it('实体大不应为十字星', () => {
      expect(isDoji({ open: 10, high: 11, low: 9, close: 10.9 })).toBe(false);
    });

    it('无波动不应判断（range=0）', () => {
      expect(isDoji({ open: 10, high: 10, low: 10, close: 10 })).toBe(false);
    });
  });

  describe('锤子线', () => {
    it('下影线长应为锤子', () => {
      expect(isHammer({ open: 10, high: 10.05, low: 9, close: 10.1 })).toBe(true);
    });

    it('上影线长不应为锤子', () => {
      expect(isHammer({ open: 10, high: 11, low: 9.9, close: 10.1 })).toBe(false);
    });
  });

  describe('倒锤子', () => {
    it('上影线长应为倒锤子', () => {
      // Small bullish body, long upper shadow, tiny lower shadow
      expect(isInvertedHammer({ open: 10, high: 10.6, low: 9.98, close: 10.1 })).toBe(true);
    });

    it('下影线长不应为倒锤子', () => {
      expect(isInvertedHammer({ open: 10, high: 10.2, low: 9, close: 10.1 })).toBe(false);
    });
  });

  describe('吞没形态', () => {
    it('看涨吞没', () => {
      const prev = { open: 10.5, high: 10.6, low: 10, close: 10.1 };
      const curr = { open: 10, high: 11, low: 9.9, close: 10.8 };
      expect(isBullishEngulfing(prev, curr)).toBe(true);
    });

    it('看跌吞没', () => {
      const prev = { open: 10, high: 10.5, low: 9.9, close: 10.4 };
      const curr = { open: 10.5, high: 10.6, low: 9.5, close: 9.8 };
      expect(isBearishEngulfing(prev, curr)).toBe(true);
    });

    it('同向K线不应为吞没', () => {
      const prev = { open: 10, high: 10.5, low: 9.9, close: 10.4 };
      const curr = { open: 10.3, high: 10.8, low: 10.2, close: 10.7 };
      expect(isBullishEngulfing(prev, curr)).toBe(false);
    });
  });

  describe('早晨之星', () => {
    it('三K线组合', () => {
      const c1 = { open: 10.5, high: 10.6, low: 9.5, close: 9.6 };
      const c2 = { open: 9.6, high: 9.7, low: 9.5, close: 9.65 };
      const c3 = { open: 9.7, high: 10.3, low: 9.6, close: 10.2 };
      expect(isMorningStar(c1, c2, c3)).toBe(true);
    });

    it('第一根阳线不应为早晨之星', () => {
      const c1 = { open: 10, high: 10.5, low: 9.9, close: 10.4 };
      const c2 = { open: 10.4, high: 10.5, low: 10.3, close: 10.35 };
      const c3 = { open: 10.3, high: 10.8, low: 10.2, close: 10.7 };
      expect(isMorningStar(c1, c2, c3)).toBe(false);
    });
  });

  describe('光头光脚', () => {
    it('实体占比大应为光头光脚', () => {
      expect(isMarubozu({ open: 10, high: 10.01, low: 10, close: 10.99 })).toBe(true);
    });

    it('有影线不应为光头光脚', () => {
      expect(isMarubozu({ open: 10, high: 11, low: 9, close: 10.9 })).toBe(false);
    });
  });

  describe('形态组合分析', () => {
    it('连续形态检测', () => {
      const candles: Candle[] = [
        { open: 10, high: 10.5, low: 9.5, close: 10 },
        { open: 10.5, high: 10.6, low: 10, close: 10.1 },
        { open: 10.1, high: 10.3, low: 9.9, close: 10.1 },
      ];
      const dojiCount = candles.filter(c => isDoji(c)).length;
      expect(dojiCount).toBeGreaterThanOrEqual(1);
    });

    it('形态描述应包含中文', () => {
      const patterns: Record<string, string> = {
        doji: '十字星',
        hammer: '锤子线',
        engulfing: '吞没形态',
        morningStar: '早晨之星',
      };
      Object.values(patterns).forEach(desc => {
        expect(desc).toMatch(/[\u4e00-\u9fa5]/);
      });
    });
  });
});

// ===== 市场宽度分析测试 =====
describe('Market Breadth Analysis', () => {
  interface Stock {
    code: string;
    name: string;
    changePct: number;
    volume: number;
    turnover: number;
  }

  const calcBreadth = (stocks: Stock[]) => {
    const rising = stocks.filter(s => s.changePct > 0).length;
    const falling = stocks.filter(s => s.changePct < 0).length;
    const flat = stocks.filter(s => s.changePct === 0).length;
    const limitUp = stocks.filter(s => s.changePct >= 9.9).length;
    const limitDown = stocks.filter(s => s.changePct <= -9.9).length;
    const totalTurnover = stocks.reduce((s, st) => s + st.turnover, 0);
    const avgChange = stocks.length > 0
      ? stocks.reduce((s, st) => s + st.changePct, 0) / stocks.length
      : 0;

    return {
      rising, falling, flat,
      limitUp, limitDown,
      totalTurnover,
      avgChange,
      advanceRatio: stocks.length > 0 ? rising / stocks.length : 0,
      adRatio: falling > 0 ? rising / falling : rising > 0 ? Infinity : 0,
    };
  };

  const sampleStocks: Stock[] = [
    { code: '001', name: 'A', changePct: 5.2, volume: 100000, turnover: 5000000 },
    { code: '002', name: 'B', changePct: 10, volume: 200000, turnover: 10000000 },
    { code: '003', name: 'C', changePct: -3.1, volume: 80000, turnover: 3000000 },
    { code: '004', name: 'D', changePct: 0, volume: 50000, turnover: 2000000 },
    { code: '005', name: 'E', changePct: -10, volume: 150000, turnover: 7000000 },
    { code: '006', name: 'F', changePct: 2.3, volume: 120000, turnover: 6000000 },
    { code: '007', name: 'G', changePct: 1.1, volume: 90000, turnover: 4000000 },
  ];

  it('涨跌家数正确', () => {
    const b = calcBreadth(sampleStocks);
    expect(b.rising).toBe(4);
    expect(b.falling).toBe(2);
    expect(b.flat).toBe(1);
  });

  it('涨跌停识别', () => {
    const b = calcBreadth(sampleStocks);
    expect(b.limitUp).toBe(1);
    expect(b.limitDown).toBe(1);
  });

  it('涨跌比应>1', () => {
    const b = calcBreadth(sampleStocks);
    expect(b.adRatio).toBeGreaterThan(1);
  });

  it('上涨率应0-1', () => {
    const b = calcBreadth(sampleStocks);
    expect(b.advanceRatio).toBeGreaterThan(0);
    expect(b.advanceRatio).toBeLessThanOrEqual(1);
  });

  it('空数据应处理', () => {
    const b = calcBreadth([]);
    expect(b.rising).toBe(0);
    expect(b.falling).toBe(0);
    expect(b.totalTurnover).toBe(0);
    expect(b.advanceRatio).toBe(0);
  });

  it('全涨市场', () => {
    const allUp = [{ code: '1', name: 'X', changePct: 1, volume: 100, turnover: 1000 }];
    const b = calcBreadth(allUp);
    expect(b.advanceRatio).toBe(1);
    expect(b.adRatio).toBe(Infinity);
  });

  it('总成交额正确', () => {
    const b = calcBreadth(sampleStocks);
    expect(b.totalTurnover).toBe(37000000);
  });

  it('平均涨跌幅正确', () => {
    const b = calcBreadth(sampleStocks);
    expect(b.avgChange).toBeCloseTo(0.786, 1);
  });
});
