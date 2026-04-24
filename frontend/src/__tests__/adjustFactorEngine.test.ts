import { describe, it, expect, beforeEach } from 'vitest';
import { AdjustFactorEngine, type PriceData, type DividendEvent } from '../utils/adjustFactorEngine';

describe('AdjustFactorEngine', () => {
  let engine: AdjustFactorEngine;

  const createPrices = (count: number, basePrice: number = 10): PriceData[] =>
    Array.from({ length: count }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: basePrice + i * 0.5,
      high: basePrice + i * 0.5 + 1,
      low: basePrice + i * 0.5 - 0.5,
      close: basePrice + i * 0.5,
      volume: 1000000,
    }));

  const createDividend = (date: string, cash: number = 0, stock: number = 0, split: number = 0): DividendEvent => ({
    date,
    cashDividend: cash,
    stockDividend: stock,
    stockSplit: split,
  });

  beforeEach(() => {
    engine = new AdjustFactorEngine();
  });

  describe('无复权', () => {
    it('应该返回原始价格', () => {
      const prices = createPrices(5);
      const result = engine.adjustPrices(prices, [], 'none');
      expect(result).toEqual(prices);
    });

    it('无分红事件应返回原始因子', () => {
      const prices = createPrices(5);
      const factors = engine.calculateAdjustFactors(prices, [], 'forward');
      expect(factors).toEqual([1, 1, 1, 1, 1]);
    });
  });

  describe('前复权', () => {
    it('应该调整现金分红后价格', () => {
      const prices = createPrices(5, 10);
      const dividends = [createDividend('2024-01-03', 10)]; // 每股派1元

      const result = engine.adjustPrices(prices, dividends, 'forward');
      expect(result).toHaveLength(5);
      // 分红后的价格应被调整
      expect(result[0].close).not.toBe(prices[0].close);
    });

    it('应该保持价格比例关系', () => {
      const prices = createPrices(5, 10);
      const dividends = [createDividend('2024-01-03', 5)];

      const result = engine.adjustPrices(prices, dividends, 'forward');
      for (let i = 0; i < result.length; i++) {
        expect(result[i].close).toBeGreaterThan(0);
      }
    });

    it('应该处理送股', () => {
      const prices = createPrices(5, 20);
      const dividends = [createDividend('2024-01-03', 0, 10)]; // 每10股送10股

      const result = engine.adjustPrices(prices, dividends, 'forward');
      expect(result).toHaveLength(5);
    });

    it('应该处理转增', () => {
      const prices = createPrices(5, 20);
      const dividends = [createDividend('2024-01-03', 0, 0, 10)]; // 每10股转增10股

      const result = engine.adjustPrices(prices, dividends, 'forward');
      expect(result).toHaveLength(5);
    });
  });

  describe('后复权', () => {
    it('应该从最早日期开始累积', () => {
      const prices = createPrices(5, 10);
      const dividends = [createDividend('2024-01-03', 10)];

      const result = engine.adjustPrices(prices, dividends, 'backward');
      expect(result).toHaveLength(5);
    });
  });

  describe('复权收益率', () => {
    it('应该计算调整后收益率', () => {
      const prices = createPrices(10, 10);
      const dividends = [createDividend('2024-01-05', 5)];

      const returns = engine.calculateAdjustedReturns(prices, dividends, 'forward');
      expect(returns).toHaveLength(9);
    });

    it('无复权收益率应等于价格变化率', () => {
      const prices = createPrices(5, 10);
      const returns = engine.calculateAdjustedReturns(prices, [], 'none');

      for (let i = 0; i < returns.length; i++) {
        const expected = (prices[i + 1].close - prices[i].close) / prices[i].close;
        expect(returns[i]).toBeCloseTo(expected, 5);
      }
    });
  });

  describe('多次分红', () => {
    it('应该处理多次分红事件', () => {
      const prices = createPrices(15, 10);
      const dividends = [
        createDividend('2024-01-05', 5),
        createDividend('2024-01-10', 3),
      ];

      const result = engine.adjustPrices(prices, dividends, 'forward');
      expect(result).toHaveLength(15);
    });
  });

  describe('边界条件', () => {
    it('应该处理空价格数组', () => {
      const result = engine.adjustPrices([], [], 'forward');
      expect(result).toHaveLength(0);
    });

    it('应该处理单条价格', () => {
      const prices = createPrices(1, 10);
      const result = engine.adjustPrices(prices, [], 'forward');
      expect(result).toHaveLength(1);
    });

    it('应该处理零价格', () => {
      const prices: PriceData[] = [{
        date: '2024-01-01',
        open: 0, high: 0, low: 0, close: 0, volume: 0,
      }];
      const result = engine.adjustPrices(prices, [], 'forward');
      expect(result[0].close).toBe(0);
    });
  });
});
