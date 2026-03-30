import { describe, it, expect } from 'vitest';

// ==================== 交易视图逻辑测试 ====================

interface KLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

function calcCandlestickBody(kline: KLine): { top: number; bottom: number; height: number; isBullish: boolean } {
  const isBullish = kline.close >= kline.open;
  return {
    top: isBullish ? kline.close : kline.open,
    bottom: isBullish ? kline.open : kline.close,
    height: Math.abs(kline.close - kline.open),
    isBullish,
  };
}

function calcWicks(kline: KLine): { upper: number; lower: number } {
  const body = calcCandlestickBody(kline);
  return { upper: kline.high - body.top, lower: body.bottom - kline.low };
}

function detectDoji(kline: KLine, threshold: number = 0.001): boolean {
  const range = kline.high - kline.low;
  if (range === 0) return true;
  return Math.abs(kline.close - kline.open) / range < threshold;
}

function detectHammer(kline: KLine): boolean {
  const body = calcCandlestickBody(kline);
  const wicks = calcWicks(kline);
  const range = kline.high - kline.low;
  if (range === 0) return false;
  return body.height / range < 0.3 && wicks.lower / range > 0.6 && wicks.upper / range < 0.1;
}

function detectEngulfing(prev: KLine, curr: KLine): 'bullish' | 'bearish' | null {
  const prevBody = calcCandlestickBody(prev);
  const currBody = calcCandlestickBody(curr);
  if (currBody.isBullish && !prevBody.isBullish && currBody.bottom <= prevBody.bottom && currBody.top >= prevBody.top) return 'bullish';
  if (!currBody.isBullish && prevBody.isBullish && currBody.top >= prevBody.top && currBody.bottom <= prevBody.bottom) return 'bearish';
  return null;
}

function calcPivotPoints(high: number, low: number, close: number): { pp: number; r1: number; r2: number; s1: number; s2: number } {
  const pp = (high + low + close) / 3;
  return { pp, r1: 2 * pp - low, r2: pp + (high - low), s1: 2 * pp - high, s2: pp - (high - low) };
}

function calcFibonacciRetracement(high: number, low: number): { level: number; price: number }[] {
  const diff = high - low;
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  return levels.map(level => ({ level, price: high - diff * level }));
}

function calcATR(data: KLine[], period: number = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { tr.push(data[i].high - data[i].low); continue; }
    tr.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)));
  }
  const atr: number[] = [];
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) { atr.push(NaN); continue; }
    if (i === period - 1) { atr.push(tr.slice(0, period).reduce((a, b) => a + b, 0) / period); continue; }
    atr.push((atr[i - 1]! * (period - 1) + tr[i]) / period);
  }
  return atr;
}

function formatPrice(price: number, decimals: number = 2): string {
  return price.toFixed(decimals);
}

function calcPriceChangePercent(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

describe('交易视图逻辑', () => {
  const bullishKline: KLine = { date: '2026-01-01', open: 100, high: 105, low: 99, close: 104, volume: 10000 };
  const bearishKline: KLine = { date: '2026-01-02', open: 104, high: 106, low: 100, close: 101, volume: 12000 };

  describe('K线实体', () => {
    it('阳线实体应该正确', () => {
      const body = calcCandlestickBody(bullishKline);
      expect(body.isBullish).toBe(true);
      expect(body.top).toBe(104);
      expect(body.bottom).toBe(100);
      expect(body.height).toBe(4);
    });

    it('阴线实体应该正确', () => {
      const body = calcCandlestickBody(bearishKline);
      expect(body.isBullish).toBe(false);
      expect(body.top).toBe(104);
      expect(body.bottom).toBe(101);
    });

    it('十字星实体应该接近0', () => {
      const doji: KLine = { date: 'x', open: 100, high: 102, low: 98, close: 100.1, volume: 5000 };
      const body = calcCandlestickBody(doji);
      expect(body.height).toBeLessThan(1);
    });
  });

  describe('影线', () => {
    it('应该正确计算上下影线', () => {
      const wicks = calcWicks(bullishKline);
      expect(wicks.upper).toBe(1); // 105 - 104
      expect(wicks.lower).toBe(1); // 100 - 99
    });

    it('光头光脚不应该有影线', () => {
      const full: KLine = { date: 'x', open: 100, high: 105, low: 100, close: 105, volume: 5000 };
      const wicks = calcWicks(full);
      expect(wicks.upper).toBe(0);
      expect(wicks.lower).toBe(0);
    });
  });

  describe('十字星检测', () => {
    it('标准十字星应该检测到', () => {
      const doji: KLine = { date: 'x', open: 100, high: 105, low: 95, close: 100.005, volume: 5000 };
      expect(detectDoji(doji)).toBe(true);
    });

    it('明显K线不应该检测为十字星', () => {
      expect(detectDoji(bullishKline)).toBe(false);
    });

    it('同价应该检测为十字星', () => {
      const flat: KLine = { date: 'x', open: 100, high: 100, low: 100, close: 100, volume: 5000 };
      expect(detectDoji(flat)).toBe(true);
    });
  });

  describe('锤子线检测', () => {
    it('标准锤子线应该检测到', () => {
      const hammer: KLine = { date: 'x', open: 98, high: 99, low: 92, close: 98.5, volume: 5000 };
      expect(detectHammer(hammer)).toBe(true);
    });

    it('普通K线不应该检测为锤子', () => {
      expect(detectHammer(bullishKline)).toBe(false);
    });
  });

  describe('吞没形态', () => {
    it('看涨吞没应该检测到', () => {
      const prev: KLine = { date: 'x', open: 105, high: 106, low: 100, close: 101, volume: 5000 };
      const curr: KLine = { date: 'y', open: 99, high: 108, low: 98, close: 107, volume: 6000 };
      expect(detectEngulfing(prev, curr)).toBe('bullish');
    });

    it('看跌吞没应该检测到', () => {
      const prev: KLine = { date: 'x', open: 99, high: 108, low: 98, close: 107, volume: 5000 };
      const curr: KLine = { date: 'y', open: 108, high: 109, low: 94, close: 95, volume: 6000 };
      expect(detectEngulfing(prev, curr)).toBe('bearish');
    });

    it('非吞没应该返回null', () => {
      expect(detectEngulfing(bullishKline, bearishKline)).toBeNull();
    });
  });

  describe('枢轴点', () => {
    it('应该正确计算PP', () => {
      const pp = calcPivotPoints(110, 90, 105);
      expect(pp.pp).toBeCloseTo(101.67, 1);
      expect(pp.r1).toBeGreaterThan(pp.pp);
      expect(pp.s1).toBeLessThan(pp.pp);
    });

    it('支撑应该小于阻力', () => {
      const pp = calcPivotPoints(110, 90, 100);
      expect(pp.s2).toBeLessThan(pp.s1);
      expect(pp.s1).toBeLessThan(pp.pp);
      expect(pp.pp).toBeLessThan(pp.r1);
      expect(pp.r1).toBeLessThan(pp.r2);
    });
  });

  describe('斐波那契回调', () => {
    it('应该包含所有标准水平', () => {
      const fibs = calcFibonacciRetracement(120, 80);
      const levels = fibs.map(f => f.level);
      expect(levels).toContain(0);
      expect(levels).toContain(0.236);
      expect(levels).toContain(0.618);
      expect(levels).toContain(1);
    });

    it('0%应该等于最高价', () => {
      const fibs = calcFibonacciRetracement(120, 80);
      expect(fibs.find(f => f.level === 0)!.price).toBe(120);
    });

    it('100%应该等于最低价', () => {
      const fibs = calcFibonacciRetracement(120, 80);
      expect(fibs.find(f => f.level === 1)!.price).toBe(80);
    });

    it('价格应该递减', () => {
      const fibs = calcFibonacciRetracement(120, 80);
      for (let i = 1; i < fibs.length; i++) {
        expect(fibs[i].price).toBeLessThanOrEqual(fibs[i - 1].price);
      }
    });
  });

  describe('ATR计算', () => {
    it('应该返回与数据等长的数组', () => {
      const atr = calcATR([bullishKline, bearishKline], 2);
      expect(atr.length).toBe(2);
    });

    it('ATR应该为正', () => {
      const data = [bullishKline, bearishKline];
      const atr = calcATR(data, 2);
      for (const a of atr) {
        if (!Number.isNaN(a)) expect(a).toBeGreaterThan(0);
      }
    });

    it('前期不足应该返回NaN', () => {
      const atr = calcATR([bullishKline], 2);
      expect(Number.isNaN(atr[0])).toBe(true);
    });
  });

  describe('工具函数', () => {
    it('价格格式化应该正确', () => {
      expect(formatPrice(123.456)).toBe('123.46');
      expect(formatPrice(100)).toBe('100.00');
      expect(formatPrice(0.1234, 4)).toBe('0.1234');
    });

    it('涨跌幅应该正确计算', () => {
      expect(calcPriceChangePercent(110, 100)).toBe(10);
      expect(calcPriceChangePercent(90, 100)).toBe(-10);
      expect(calcPriceChangePercent(100, 100)).toBe(0);
    });

    it('前值为0应该返回0', () => {
      expect(calcPriceChangePercent(100, 0)).toBe(0);
    });
  });
});
