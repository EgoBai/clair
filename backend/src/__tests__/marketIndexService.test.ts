import { describe, it, expect, beforeEach } from 'vitest';
import { MarketIndexService } from '../services/marketIndexService';

describe('MarketIndexService', () => {
  let service: MarketIndexService;

  beforeEach(() => {
    service = new MarketIndexService();
  });

  const makeQuote = (overrides: Partial<any> = {}) => ({
    indexId: 1,
    tradeDate: new Date(),
    open: 3000,
    close: 3050,
    high: 3100,
    low: 2980,
    prevClose: 3000,
    change: 50,
    changePercent: 1.67,
    volume: 100000000,
    turnover: 500000000000,
    amplitude: 4.0,
    ...overrides,
  });

  describe('initialization', () => {
    it('should initialize with major indices', () => {
      const indices = service.getAllIndices();
      expect(indices.length).toBeGreaterThan(0);
    });

    it('should have composite indices', () => {
      const composites = service.getCompositeIndices();
      expect(composites.length).toBeGreaterThan(0);
      expect(composites.some(idx => idx.symbol === '000001.SH')).toBe(true);
    });
  });

  describe('getIndexBySymbol', () => {
    it('should return index for valid symbol', () => {
      const index = service.getIndexBySymbol('000001.SH');
      expect(index).toBeDefined();
      expect(index!.name).toBe('上证综指');
      expect(index!.category).toBe('composite');
    });

    it('should return undefined for unknown symbol', () => {
      expect(service.getIndexBySymbol('999999.SH')).toBeUndefined();
    });
  });

  describe('getIndicesByCategory', () => {
    it('should filter by category', () => {
      const composites = service.getIndicesByCategory('composite');
      expect(composites.every(idx => idx.category === 'composite')).toBe(true);
    });

    it('should return empty for unknown category', () => {
      expect(service.getIndicesByCategory('unknown')).toHaveLength(0);
    });
  });

  describe('addQuote', () => {
    it('should add quote for known index', () => {
      const quote = service.addQuote('000001.SH', makeQuote());
      expect(quote).not.toBeNull();
      expect(quote!.id).toBeGreaterThan(0);
    });

    it('should return null for unknown index', () => {
      const quote = service.addQuote('999999.SH', makeQuote());
      expect(quote).toBeNull();
    });

    it('should return null for invalid symbol format', () => {
      const quote = service.addQuote('INVALID', makeQuote());
      expect(quote).toBeNull();
    });
  });

  describe('getLatestQuote', () => {
    it('should return undefined when no quotes', () => {
      expect(service.getLatestQuote('000001.SH')).toBeUndefined();
    });

    it('should return latest quote', () => {
      service.addQuote('000001.SH', makeQuote({ close: 3000 }));
      service.addQuote('000001.SH', makeQuote({ close: 3100 }));
      const latest = service.getLatestQuote('000001.SH');
      expect(latest?.close).toBe(3100);
    });
  });

  describe('getQuoteHistory', () => {
    it('should respect limit', () => {
      for (let i = 0; i < 50; i++) {
        service.addQuote('000001.SH', makeQuote({ close: 3000 + i }));
      }
      expect(service.getQuoteHistory('000001.SH', 10)).toHaveLength(10);
    });

    it('should return empty for unknown index', () => {
      expect(service.getQuoteHistory('UNKNOWN')).toHaveLength(0);
    });
  });

  describe('calculatePerformance', () => {
    it('should return null for unknown index', () => {
      expect(service.calculatePerformance('UNKNOWN')).toBeNull();
    });

    it('should return null when no quotes', () => {
      expect(service.calculatePerformance('000001.SH')).toBeNull();
    });

    it('should calculate performance metrics', () => {
      service.addQuote('000001.SH', makeQuote({ close: 3000 }));
      service.addQuote('000001.SH', makeQuote({ close: 3050, change: 50, changePercent: 1.67 }));
      const perf = service.calculatePerformance('000001.SH');
      expect(perf).not.toBeNull();
      expect(perf!.symbol).toBe('000001.SH');
      expect(perf!.current).toBe(3050);
    });
  });

  describe('compareIndices', () => {
    it('should compare multiple indices', () => {
      service.addQuote('000001.SH', makeQuote());
      service.addQuote('399001.SZ', makeQuote({ close: 10000 }));

      const comparison = service.compareIndices(['000001.SH', '399001.SZ']);
      expect(comparison.indices.length).toBe(2);
      expect(comparison.timestamp).toBeInstanceOf(Date);
    });

    it('should skip invalid symbols', () => {
      service.addQuote('000001.SH', makeQuote());
      const comparison = service.compareIndices(['000001.SH', 'INVALID']);
      expect(comparison.indices).toHaveLength(1);
    });
  });

  describe('components', () => {
    it('should add and get components', () => {
      const component = service.addComponent(1, {
        indexId: 1,
        stockId: 1,
        stockSymbol: '600519',
        weight: 5.5,
        addedDate: new Date(),
        isActive: true,
      });
      expect(component.id).toBeGreaterThan(0);

      const components = service.getComponents(1);
      expect(components).toHaveLength(1);
      expect(components[0].stockSymbol).toBe('600519');
    });

    it('should only return active components', () => {
      service.addComponent(1, {
        indexId: 1, stockId: 1, stockSymbol: '600519',
        addedDate: new Date(), isActive: true,
      });
      service.addComponent(1, {
        indexId: 1, stockId: 2, stockSymbol: '000858',
        addedDate: new Date(), isActive: false,
      });
      expect(service.getComponents(1)).toHaveLength(1);
    });
  });

  describe('getTopGainers / getTopLosers', () => {
    it('should return top gaining indices', () => {
      service.addQuote('000001.SH', makeQuote({ changePercent: 2.5 }));
      service.addQuote('399001.SZ', makeQuote({ changePercent: 1.0 }));
      service.addQuote('399006.SZ', makeQuote({ changePercent: 3.5 }));

      const gainers = service.getTopGainers(2);
      expect(gainers).toHaveLength(2);
      expect(gainers[0].changePercent).toBeGreaterThanOrEqual(gainers[1].changePercent);
    });

    it('should return top losing indices', () => {
      service.addQuote('000001.SH', makeQuote({ changePercent: -2.5 }));
      service.addQuote('399001.SZ', makeQuote({ changePercent: -1.0 }));
      service.addQuote('399006.SZ', makeQuote({ changePercent: -3.5 }));

      const losers = service.getTopLosers(2);
      expect(losers).toHaveLength(2);
      expect(losers[0].changePercent).toBeLessThanOrEqual(losers[1].changePercent);
    });
  });

  describe('getMarketSentiment', () => {
    it('should return neutral when no quotes', () => {
      const sentiment = service.getMarketSentiment();
      expect(sentiment.sentiment).toBe('neutral');
    });

    it('should detect bullish sentiment', () => {
      service.addQuote('000001.SH', makeQuote({ changePercent: 2.0 }));
      service.addQuote('399001.SZ', makeQuote({ changePercent: 1.5 }));
      service.addQuote('399006.SZ', makeQuote({ changePercent: 3.0 }));
      service.addQuote('000016.SH', makeQuote({ changePercent: 1.0 }));
      service.addQuote('000300.SH', makeQuote({ changePercent: 2.5 }));

      const sentiment = service.getMarketSentiment();
      expect(sentiment.bullish).toBeGreaterThan(0);
    });

    it('should detect bearish sentiment', () => {
      service.addQuote('000001.SH', makeQuote({ changePercent: -2.0 }));
      service.addQuote('399001.SZ', makeQuote({ changePercent: -1.5 }));
      service.addQuote('399006.SZ', makeQuote({ changePercent: -3.0 }));
      service.addQuote('000016.SH', makeQuote({ changePercent: -1.0 }));
      service.addQuote('000300.SH', makeQuote({ changePercent: -2.5 }));

      const sentiment = service.getMarketSentiment();
      expect(sentiment.bearish).toBeGreaterThan(0);
    });
  });
});
