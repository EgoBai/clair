/**
 * Sector Service 测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SectorService } from '../../services/sectorService';

describe('SectorService', () => {
  let service: SectorService;

  beforeEach(() => {
    service = new SectorService();
  });

  describe('initialization', () => {
    it('should initialize with industries and concepts', () => {
      const sectors = service.getAllSectors();
      expect(sectors.length).toBeGreaterThan(30);
    });

    it('should have 31 SW L1 industries', () => {
      const industries = service.getIndustrySectors();
      expect(industries).toHaveLength(31);
    });

    it('should have hot concepts', () => {
      const concepts = service.getConceptSectors();
      expect(concepts.length).toBeGreaterThan(0);
    });
  });

  describe('getSectorByCode', () => {
    it('should return sector by code', () => {
      const sector = service.getSectorByCode('SWL1_001');
      expect(sector).toBeDefined();
      expect(sector?.name).toBe('农林牧渔');
    });

    it('should return undefined for invalid code', () => {
      expect(service.getSectorByCode('INVALID')).toBeUndefined();
    });
  });

  describe('searchSectors', () => {
    it('should search sectors by name', () => {
      const results = service.searchSectors('银行');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('银行');
    });

    it('should search sectors by partial name', () => {
      const results = service.searchSectors('人工');
      expect(results.some(r => r.name.includes('人工智能'))).toBe(true);
    });

    it('should return empty for non-matching search', () => {
      const results = service.searchSectors('不存在的板块');
      expect(results).toHaveLength(0);
    });
  });

  describe('addQuote and getLatestQuote', () => {
    it('should add and retrieve quote', () => {
      const sectors = service.getIndustrySectors();
      const sector = sectors[0];

      const quote = service.addQuote(sector.id, {
        sectorId: sector.id,
        tradeDate: new Date(),
        changePercent: 2.5,
        turnoverRate: 3.2,
        volume: 1000000,
        turnover: 50000000,
        inflow: 30000000,
        outflow: 20000000,
        netInflow: 10000000,
        risingCount: 8,
        fallingCount: 2,
      });

      expect(quote.changePercent).toBe(2.5);

      const latest = service.getLatestQuote(sector.id);
      expect(latest?.changePercent).toBe(2.5);
    });
  });

  describe('getHeatmap', () => {
    it('should return heatmap data', () => {
      const sectors = service.getIndustrySectors().slice(0, 3);
      sectors.forEach(sector => {
        service.addQuote(sector.id, {
          sectorId: sector.id,
          tradeDate: new Date(),
          changePercent: Math.random() * 5 - 2.5,
          turnoverRate: 3,
          volume: 1000000,
          turnover: 50000000,
          inflow: 30000000,
          outflow: 20000000,
          netInflow: 10000000,
          risingCount: 8,
          fallingCount: 2,
        });
      });

      const heatmap = service.getHeatmap();
      expect(heatmap.length).toBeGreaterThan(0);
      heatmap.forEach(h => {
        expect(h.sectorName).toBeTruthy();
        expect(typeof h.changePercent).toBe('number');
      });
    });
  });

  describe('getSectorRotation', () => {
    it('should return sector rotation analysis', () => {
      const rotation = service.getSectorRotation();
      expect(rotation.date).toBeInstanceOf(Date);
      expect(Array.isArray(rotation.hotSectors)).toBe(true);
      expect(Array.isArray(rotation.coldSectors)).toBe(true);
    });
  });

  describe('addStockToSector and getStocksInSector', () => {
    it('should add and retrieve stocks in sector', () => {
      service.addStockToSector(1, '000001.SZ');
      service.addStockToSector(1, '600036.SH');

      const stocks = service.getStocksInSector(1);
      expect(stocks).toContain('000001.SZ');
      expect(stocks).toContain('600036.SH');
    });

    it('should not add duplicate stocks', () => {
      service.addStockToSector(1, '000001.SZ');
      service.addStockToSector(1, '000001.SZ');

      const stocks = service.getStocksInSector(1);
      expect(stocks.filter(s => s === '000001.SZ')).toHaveLength(1);
    });
  });

  describe('getTopGainingSectors and getTopLosingSectors', () => {
    it('should return top gaining sectors', () => {
      const gainers = service.getTopGainingSectors(5);
      expect(gainers.length).toBeLessThanOrEqual(5);
    });

    it('should return top losing sectors', () => {
      const losers = service.getTopLosingSectors(5);
      expect(losers.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getCategoryStats', () => {
    it('should return category statistics', () => {
      const stats = service.getCategoryStats();
      expect(stats.industry).toBe(31);
      expect(stats.concept).toBeGreaterThan(0);
      expect(stats.region).toBe(0);
      expect(stats.style).toBe(0);
    });
  });

  describe('getFundFlowAnalysis', () => {
    it('should return fund flow analysis', () => {
      const analysis = service.getFundFlowAnalysis();
      expect(Array.isArray(analysis.topInflow)).toBe(true);
      expect(Array.isArray(analysis.topOutflow)).toBe(true);
    });
  });
});
