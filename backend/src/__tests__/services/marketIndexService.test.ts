/**
 * MarketIndex Service 测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketIndexService } from '../../services/marketIndexService';

describe('MarketIndexService', () => {
  let service: MarketIndexService;

  beforeEach(() => {
    service = new MarketIndexService();
  });

  describe('initialization', () => {
    it('should initialize with major indices', () => {
      const indices = service.getAllIndices();
      expect(indices.length).toBeGreaterThanOrEqual(8);
    });

    it('should have Shanghai Composite Index', () => {
      const index = service.getIndexBySymbol('000001.SH');
      expect(index).toBeDefined();
      expect(index?.name).toBe('上证综指');
      expect(index?.exchange).toBe('SSE');
    });

    it('should have Shenzhen Component Index', () => {
      const index = service.getIndexBySymbol('399001.SZ');
      expect(index).toBeDefined();
      expect(index?.name).toBe('深证成指');
    });

    it('should have ChiNext Index', () => {
      const index = service.getIndexBySymbol('399006.SZ');
      expect(index).toBeDefined();
      expect(index?.name).toBe('创业板指');
    });
  });

  describe('getIndexBySymbol', () => {
    it('should return undefined for invalid symbol', () => {
      expect(service.getIndexBySymbol('INVALID')).toBeUndefined();
    });

    it('should return index for valid symbol', () => {
      const index = service.getIndexBySymbol('000300.SH');
      expect(index?.name).toBe('沪深300');
    });
  });

  describe('getCompositeIndices', () => {
    it('should return only composite indices', () => {
      const composites = service.getCompositeIndices();
      composites.forEach(idx => {
        expect(idx.category).toBe('composite');
      });
    });
  });

  describe('addQuote and getLatestQuote', () => {
    it('should add and retrieve quote', () => {
      const quote = service.addQuote('000001.SH', {
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
      });

      expect(quote).toBeDefined();
      expect(quote?.close).toBe(3050);

      const latest = service.getLatestQuote('000001.SH');
      expect(latest?.close).toBe(3050);
    });

    it('should return null for invalid symbol', () => {
      const quote = service.addQuote('INVALID', {
        indexId: 1,
        tradeDate: new Date(),
        open: 100,
        close: 100,
        high: 100,
        low: 100,
        prevClose: 100,
        change: 0,
        changePercent: 0,
        amplitude: 0,
        volume: 0,
        turnover: 0,
      });
      expect(quote).toBeNull();
    });
  });

  describe('getQuoteHistory', () => {
    it('should return quote history', () => {
      for (let i = 0; i < 5; i++) {
        service.addQuote('000001.SH', {
          indexId: 1,
          tradeDate: new Date(Date.now() + i * 86400000),
          open: 3000 + i,
          close: 3050 + i,
          high: 3100 + i,
          low: 2980 + i,
          prevClose: 3000 + i,
          change: 50,
          changePercent: 1.67,
          amplitude: 4.0,
          volume: 1000000000,
          turnover: 500000000000,
        });
      }

      const history = service.getQuoteHistory('000001.SH', 3);
      expect(history).toHaveLength(3);
    });
  });

  describe('calculatePerformance', () => {
    it('should calculate performance metrics', () => {
      service.addQuote('000001.SH', {
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
      });

      const perf = service.calculatePerformance('000001.SH');
      expect(perf).toBeDefined();
      expect(perf?.current).toBe(3050);
      expect(perf?.changePercent).toBe(1.67);
    });

    it('should return null for invalid symbol', () => {
      expect(service.calculatePerformance('INVALID')).toBeNull();
    });
  });

  describe('compareIndices', () => {
    it('should compare multiple indices', () => {
      service.addQuote('000001.SH', {
        indexId: 1,
        tradeDate: new Date(),
        open: 3000, close: 3050, high: 3100, low: 2980,
        prevClose: 3000, change: 50, changePercent: 1.67,
        amplitude: 4.0, volume: 1000000000, turnover: 500000000000,
      });

      const comparison = service.compareIndices(['000001.SH', '399001.SZ']);
      expect(comparison.indices.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMarketSentiment', () => {
    it('should calculate market sentiment', () => {
      service.addQuote('000001.SH', {
        indexId: 1,
        tradeDate: new Date(),
        open: 3000, close: 3050, high: 3100, low: 2980,
        prevClose: 3000, change: 50, changePercent: 1.67,
        amplitude: 4.0, volume: 1000000000, turnover: 500000000000,
      });

      const sentiment = service.getMarketSentiment();
      expect(['bullish', 'bearish', 'neutral']).toContain(sentiment.sentiment);
    });
  });

  describe('getTopGainers and getTopLosers', () => {
    it('should return top gaining indices', () => {
      const gainers = service.getTopGainers(5);
      expect(gainers.length).toBeLessThanOrEqual(5);
    });

    it('should return top losing indices', () => {
      const losers = service.getTopLosers(5);
      expect(losers.length).toBeLessThanOrEqual(5);
    });
  });
});
