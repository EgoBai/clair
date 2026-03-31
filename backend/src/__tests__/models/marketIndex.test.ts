/**
 * MarketIndex 模型测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateIndexSymbol,
  isCompositeIndex,
  getIndexCategoryLabel,
  MAJOR_INDICES,
  type MarketIndexData,
  type IndexQuote,
  type IndexComponent,
  type IndexPerformance,
  type IndexComparison,
  type IndexCategory,
} from '../../models/MarketIndex';

describe('MarketIndex Model', () => {
  describe('validateIndexSymbol', () => {
    it('should validate correct Shanghai index symbols', () => {
      expect(validateIndexSymbol('000001.SH')).toBe(true);
      expect(validateIndexSymbol('000300.SH')).toBe(true);
      expect(validateIndexSymbol('000016.SH')).toBe(true);
    });

    it('should validate correct Shenzhen index symbols', () => {
      expect(validateIndexSymbol('399001.SZ')).toBe(true);
      expect(validateIndexSymbol('399006.SZ')).toBe(true);
    });

    it('should validate correct Beijing index symbols', () => {
      expect(validateIndexSymbol('899050.BJ')).toBe(true);
    });

    it('should reject invalid symbols', () => {
      expect(validateIndexSymbol('001.SH')).toBe(false);
      expect(validateIndexSymbol('000001.XX')).toBe(false);
      expect(validateIndexSymbol('ABCDEF.SH')).toBe(false);
      expect(validateIndexSymbol('')).toBe(false);
      expect(validateIndexSymbol('000001SH')).toBe(false);
    });
  });

  describe('isCompositeIndex', () => {
    it('should identify composite indices', () => {
      expect(isCompositeIndex('000001.SH')).toBe(true);
      expect(isCompositeIndex('399001.SZ')).toBe(true);
      expect(isCompositeIndex('399006.SZ')).toBe(true);
      expect(isCompositeIndex('000300.SH')).toBe(true);
    });

    it('should identify non-composite indices', () => {
      expect(isCompositeIndex('000016.SH')).toBe(false); // style
      expect(isCompositeIndex('000905.SH')).toBe(false); // style
      expect(isCompositeIndex('000852.SH')).toBe(false); // style
    });
  });

  describe('getIndexCategoryLabel', () => {
    it('should return correct Chinese labels', () => {
      expect(getIndexCategoryLabel('composite')).toBe('综合指数');
      expect(getIndexCategoryLabel('sector')).toBe('行业指数');
      expect(getIndexCategoryLabel('theme')).toBe('主题指数');
      expect(getIndexCategoryLabel('style')).toBe('风格指数');
      expect(getIndexCategoryLabel('strategy')).toBe('策略指数');
      expect(getIndexCategoryLabel('bond')).toBe('债券指数');
      expect(getIndexCategoryLabel('commodity')).toBe('商品指数');
      expect(getIndexCategoryLabel('cross_market')).toBe('跨市场指数');
    });
  });

  describe('MAJOR_INDICES', () => {
    it('should contain all major A-share indices', () => {
      expect(MAJOR_INDICES['000001.SH']).toBeDefined();
      expect(MAJOR_INDICES['399001.SZ']).toBeDefined();
      expect(MAJOR_INDICES['399006.SZ']).toBeDefined();
      expect(MAJOR_INDICES['000016.SH']).toBeDefined();
      expect(MAJOR_INDICES['000300.SH']).toBeDefined();
      expect(MAJOR_INDICES['000905.SH']).toBeDefined();
      expect(MAJOR_INDICES['000852.SH']).toBeDefined();
      expect(MAJOR_INDICES['899050.BJ']).toBeDefined();
    });

    it('should have correct index properties', () => {
      const shanghai = MAJOR_INDICES['000001.SH'];
      expect(shanghai?.name).toBe('上证综指');
      expect(shanghai?.exchange).toBe('SSE');
      expect(shanghai?.category).toBe('composite');
    });
  });

  describe('Type interfaces', () => {
    it('should allow MarketIndexData creation', () => {
      const index: MarketIndexData = {
        id: 1,
        symbol: '000001.SH',
        name: '上证综指',
        category: 'composite',
        componentCount: 2000,
        exchange: 'SSE',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(index.symbol).toBe('000001.SH');
    });

    it('should allow IndexQuote creation', () => {
      const quote: IndexQuote = {
        id: 1,
        indexId: 1,
        tradeDate: new Date(),
        open: 3000,
        close: 3050,
        high: 3100,
        low: 2980,
        prevClose: 3000,
        change: 50,
        changePercent: 1.67,
        amplitude: 4.0,
        volume: 1000000000,
        turnover: 500000000000,
        createdAt: new Date(),
      };
      expect(quote.changePercent).toBe(1.67);
    });

    it('should allow IndexComponent creation', () => {
      const component: IndexComponent = {
        id: 1,
        indexId: 1,
        stockId: 1,
        stockSymbol: '000001.SZ',
        weight: 5.5,
        addedDate: new Date(),
        isActive: true,
      };
      expect(component.weight).toBe(5.5);
    });

    it('should allow IndexPerformance creation', () => {
      const perf: IndexPerformance = {
        symbol: '000001.SH',
        name: '上证综指',
        current: 3050,
        change: 50,
        changePercent: 1.67,
        ytdReturn: 10.5,
        weekReturn: 2.3,
        monthReturn: 5.1,
        pe: 12.5,
        pb: 1.3,
        dividendYield: 2.1,
      };
      expect(perf.ytdReturn).toBe(10.5);
    });
  });
});
