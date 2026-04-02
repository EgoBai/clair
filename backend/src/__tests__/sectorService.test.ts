import { describe, it, expect, beforeEach } from 'vitest';
import { SectorService } from '../services/sectorService';
import { SW_L1_INDUSTRIES, HOT_CONCEPTS } from '../models/Sector';

describe('sectorService', () => {
  let service: SectorService;

  beforeEach(() => {
    service = new SectorService();
  });

  describe('initialization', () => {
    it('should initialize with industry sectors', () => {
      const industries = service.getIndustrySectors();
      expect(industries.length).toBe(SW_L1_INDUSTRIES.length);
    });

    it('should initialize with concept sectors', () => {
      const concepts = service.getConceptSectors();
      expect(concepts.length).toBe(HOT_CONCEPTS.length);
    });

    it('should have correct industry sector codes', () => {
      const industries = service.getIndustrySectors();
      expect(industries[0].code).toBe('SWL1_001');
      expect(industries[0].type).toBe('industry');
    });

    it('should have correct concept sector codes', () => {
      const concepts = service.getConceptSectors();
      expect(concepts[0].code).toMatch(/^GN_/);
      expect(concepts[0].type).toBe('concept');
    });
  });

  describe('getAllSectors', () => {
    it('should return all sectors', () => {
      const all = service.getAllSectors();
      expect(all.length).toBe(SW_L1_INDUSTRIES.length + HOT_CONCEPTS.length);
    });
  });

  describe('getSectorByCode', () => {
    it('should find industry by code', () => {
      const sector = service.getSectorByCode('SWL1_001');
      expect(sector).toBeDefined();
      expect(sector!.name).toBe('农林牧渔');
    });

    it('should find concept by code', () => {
      const sector = service.getSectorByCode('GN_人工智能');
      expect(sector).toBeDefined();
      expect(sector!.type).toBe('concept');
    });

    it('should return undefined for missing code', () => {
      expect(service.getSectorByCode('MISSING')).toBeUndefined();
    });
  });

  describe('searchSectors', () => {
    it('should search by name', () => {
      const results = service.searchSectors('银行');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('银行');
    });

    it('should search case insensitively', () => {
      const results = service.searchSectors('swl1_001');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty for no match', () => {
      const results = service.searchSectors('xyznonexistent');
      expect(results.length).toBe(0);
    });
  });

  describe('quotes', () => {
    it('should add and get latest quote', () => {
      const sector = service.getSectorByCode('SWL1_001')!;
      service.addQuote(sector.id, {
        sectorId: sector.id,
        tradeDate: new Date(),
        changePercent: 2.5,
        turnoverRate: 1.5,
        volume: 1000000,
        turnover: 10000000,
        inflow: 5000000,
        outflow: 3000000,
        netInflow: 2000000,
        risingCount: 20,
        fallingCount: 10,
      });
      const quote = service.getLatestQuote(sector.id);
      expect(quote).toBeDefined();
      expect(quote!.changePercent).toBe(2.5);
    });

    it('should return undefined for sector without quotes', () => {
      const quote = service.getLatestQuote(999);
      expect(quote).toBeUndefined();
    });
  });

  describe('stocks', () => {
    it('should add stock to sector', () => {
      service.addStockToSector(1, 'sh600000');
      const stocks = service.getStocksInSector(1);
      expect(stocks).toContain('sh600000');
    });

    it('should not duplicate stocks', () => {
      service.addStockToSector(1, 'sh600000');
      service.addStockToSector(1, 'sh600000');
      const stocks = service.getStocksInSector(1);
      expect(stocks.filter(s => s === 'sh600000').length).toBe(1);
    });

    it('should update stockCount on sector', () => {
      service.addStockToSector(1, 'sh600000');
      service.addStockToSector(1, 'sz000001');
      const sector = service.getAllSectors().find(s => s.id === 1);
      expect(sector!.stockCount).toBe(2);
    });

    it('should return empty for sector without stocks', () => {
      expect(service.getStocksInSector(999)).toEqual([]);
    });
  });

  describe('getCategoryStats', () => {
    it('should count sectors by type', () => {
      const stats = service.getCategoryStats();
      expect(stats.industry).toBe(SW_L1_INDUSTRIES.length);
      expect(stats.concept).toBe(HOT_CONCEPTS.length);
      expect(stats.region).toBe(0);
      expect(stats.style).toBe(0);
    });
  });

  describe('heatmap', () => {
    it('should return empty when no quotes', () => {
      expect(service.getHeatmap()).toEqual([]);
    });

    it('should return sorted heatmap', () => {
      const sector1 = service.getIndustrySectors()[0];
      const sector2 = service.getIndustrySectors()[1];
      service.addQuote(sector1.id, {
        sectorId: sector1.id, tradeDate: new Date(),
        changePercent: 1.0, turnoverRate: 1, volume: 100, turnover: 1000,
        inflow: 500, outflow: 300, netInflow: 200, risingCount: 5, fallingCount: 3,
      });
      service.addQuote(sector2.id, {
        sectorId: sector2.id, tradeDate: new Date(),
        changePercent: 3.0, turnoverRate: 2, volume: 200, turnover: 2000,
        inflow: 1000, outflow: 500, netInflow: 500, risingCount: 10, fallingCount: 2,
      });
      const heatmap = service.getHeatmap();
      expect(heatmap.length).toBe(2);
      expect(heatmap[0].changePercent).toBe(3.0); // sorted by abs
    });
  });

  describe('fund flow analysis', () => {
    it('should return top inflow/outflow', () => {
      const sectors = service.getIndustrySectors();
      service.addQuote(sectors[0].id, {
        sectorId: sectors[0].id, tradeDate: new Date(),
        changePercent: 1, turnoverRate: 1, volume: 100, turnover: 1000,
        inflow: 1000, outflow: 200, netInflow: 800, risingCount: 5, fallingCount: 1,
      });
      service.addQuote(sectors[1].id, {
        sectorId: sectors[1].id, tradeDate: new Date(),
        changePercent: -1, turnoverRate: 1, volume: 100, turnover: 1000,
        inflow: 200, outflow: 1000, netInflow: -800, risingCount: 1, fallingCount: 5,
      });
      const flow = service.getFundFlowAnalysis();
      expect(flow.topInflow[0].netInflow).toBe(800);
      expect(flow.topOutflow[0].netInflow).toBe(-800);
    });
  });
});
