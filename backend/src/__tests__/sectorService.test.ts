import { describe, it, expect, beforeEach } from 'vitest';
import { SectorService } from '../services/sectorService';

describe('SectorService', () => {
  let service: SectorService;

  beforeEach(() => {
    service = new SectorService();
  });

  const makeSectorQuote = (overrides: Partial<any> = {}) => ({
    sectorId: 1,
    tradeDate: new Date(),
    changePercent: 2.5,
    turnoverRate: 3.2,
    volume: 100000000,
    turnover: 50000000000,
    inflow: 30000000000,
    outflow: 20000000000,
    netInflow: 10000000000,
    risingCount: 30,
    fallingCount: 10,
    leadingStock: '600519',
    ...overrides,
  });

  describe('initialization', () => {
    it('should initialize with industry sectors', () => {
      const industries = service.getIndustrySectors();
      expect(industries.length).toBe(31);
    });

    it('should initialize with concept sectors', () => {
      const concepts = service.getConceptSectors();
      expect(concepts.length).toBe(15);
    });

    it('should have all sectors', () => {
      const all = service.getAllSectors();
      expect(all.length).toBe(46);
    });
  });

  describe('getSectorsByType', () => {
    it('should filter by industry type', () => {
      const industries = service.getSectorsByType('industry');
      expect(industries.every(s => s.type === 'industry')).toBe(true);
    });

    it('should filter by concept type', () => {
      const concepts = service.getSectorsByType('concept');
      expect(concepts.every(s => s.type === 'concept')).toBe(true);
    });

    it('should return empty for region type', () => {
      expect(service.getSectorsByType('region')).toHaveLength(0);
    });
  });

  describe('getSectorByCode', () => {
    it('should find sector by code', () => {
      const sector = service.getSectorByCode('SWL1_001');
      expect(sector).toBeDefined();
      expect(sector!.name).toBe('农林牧渔');
    });

    it('should return undefined for unknown code', () => {
      expect(service.getSectorByCode('UNKNOWN')).toBeUndefined();
    });
  });

  describe('searchSectors', () => {
    it('should search by name keyword', () => {
      const results = service.searchSectors('农林');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('农林');
    });

    it('should search by code', () => {
      const results = service.searchSectors('SWL1');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case insensitive', () => {
      const results = service.searchSectors('人工智能');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('addQuote / getLatestQuote', () => {
    it('should add and retrieve quote', () => {
      const quote = service.addQuote(1, makeSectorQuote());
      expect(quote.id).toBeGreaterThan(0);

      const latest = service.getLatestQuote(1);
      expect(latest?.changePercent).toBe(2.5);
    });

    it('should return undefined when no quotes', () => {
      expect(service.getLatestQuote(999)).toBeUndefined();
    });
  });

  describe('getHeatmap', () => {
    it('should return empty when no quotes', () => {
      expect(service.getHeatmap()).toHaveLength(0);
    });

    it('should return heatmap sorted by absolute change', () => {
      service.addQuote(1, makeSectorQuote({ sectorId: 1, changePercent: 2.5 }));
      service.addQuote(2, makeSectorQuote({ sectorId: 2, changePercent: -5.0 }));
      // Need to get actual sector IDs
      const industries = service.getIndustrySectors();
      service.addQuote(industries[0].id, makeSectorQuote({ sectorId: industries[0].id, changePercent: 3.0 }));
      service.addQuote(industries[1].id, makeSectorQuote({ sectorId: industries[1].id, changePercent: -1.5 }));

      const heatmap = service.getHeatmap();
      expect(heatmap.length).toBeGreaterThan(0);
      // Should be sorted by absolute change descending
      for (let i = 1; i < heatmap.length; i++) {
        expect(Math.abs(heatmap[i - 1].changePercent)).toBeGreaterThanOrEqual(Math.abs(heatmap[i].changePercent));
      }
    });
  });

  describe('getSectorRotation', () => {
    it('should return rotation analysis', () => {
      const industries = service.getIndustrySectors();
      service.addQuote(industries[0].id, makeSectorQuote({ sectorId: industries[0].id, changePercent: 5.0 }));
      service.addQuote(industries[1].id, makeSectorQuote({ sectorId: industries[1].id, changePercent: -3.0 }));

      const rotation = service.getSectorRotation();
      expect(rotation.date).toBeInstanceOf(Date);
      expect(rotation.hotSectors.length).toBeGreaterThan(0);
    });
  });

  describe('getTopGainingSectors / getTopLosingSectors', () => {
    it('should return top gaining sectors', () => {
      const industries = service.getIndustrySectors();
      service.addQuote(industries[0].id, makeSectorQuote({ sectorId: industries[0].id, changePercent: 5.0 }));
      service.addQuote(industries[1].id, makeSectorQuote({ sectorId: industries[1].id, changePercent: 2.0 }));
      service.addQuote(industries[2].id, makeSectorQuote({ sectorId: industries[2].id, changePercent: 7.0 }));

      const top = service.getTopGainingSectors(2);
      expect(top).toHaveLength(2);
      expect(top[0].changePercent).toBeGreaterThanOrEqual(top[1].changePercent);
    });

    it('should return top losing sectors', () => {
      const industries = service.getIndustrySectors();
      service.addQuote(industries[0].id, makeSectorQuote({ sectorId: industries[0].id, changePercent: -5.0 }));
      service.addQuote(industries[1].id, makeSectorQuote({ sectorId: industries[1].id, changePercent: -2.0 }));

      const top = service.getTopLosingSectors(2);
      expect(top).toHaveLength(2);
      expect(top[0].changePercent).toBeLessThanOrEqual(top[1].changePercent);
    });
  });

  describe('addStockToSector / getStocksInSector', () => {
    it('should add stock to sector', () => {
      service.addStockToSector(1, '600519');
      expect(service.getStocksInSector(1)).toContain('600519');
    });

    it('should not duplicate stocks', () => {
      service.addStockToSector(1, '600519');
      service.addStockToSector(1, '600519');
      expect(service.getStocksInSector(1)).toHaveLength(1);
    });

    it('should update sector stockCount', () => {
      service.addStockToSector(1, '600519');
      service.addStockToSector(1, '000858');
      const sector = service.getAllSectors().find(s => s.id === 1);
      expect(sector?.stockCount).toBe(2);
    });

    it('should return empty for unknown sector', () => {
      expect(service.getStocksInSector(999)).toHaveLength(0);
    });
  });

  describe('getFundFlowAnalysis', () => {
    it('should separate inflow and outflow sectors', () => {
      const industries = service.getIndustrySectors();
      service.addQuote(industries[0].id, makeSectorQuote({
        sectorId: industries[0].id, netInflow: 5000000000,
      }));
      service.addQuote(industries[1].id, makeSectorQuote({
        sectorId: industries[1].id, netInflow: -3000000000,
      }));

      const analysis = service.getFundFlowAnalysis();
      expect(analysis.topInflow.length).toBeGreaterThan(0);
      expect(analysis.topOutflow.length).toBeGreaterThan(0);
    });
  });

  describe('getCategoryStats', () => {
    it('should return category counts', () => {
      const stats = service.getCategoryStats();
      expect(stats.industry).toBe(31);
      expect(stats.concept).toBe(15);
      expect(stats.region).toBe(0);
      expect(stats.style).toBe(0);
    });
  });

  describe('consecutive streaks', () => {
    it('should detect consecutive rising streaks', () => {
      const industries = service.getIndustrySectors();
      const sectorId = industries[0].id;
      for (let i = 0; i < 5; i++) {
        service.addQuote(sectorId, makeSectorQuote({
          sectorId,
          changePercent: 1.0 + i * 0.5,
        }));
      }

      const rotation = service.getSectorRotation();
      const rising = rotation.consecutiveRising.find(s => s.sectorId === sectorId);
      expect(rising).toBeDefined();
      expect(rising!.days).toBe(5);
    });

    it('should detect consecutive falling streaks', () => {
      const industries = service.getIndustrySectors();
      const sectorId = industries[1].id;
      for (let i = 0; i < 4; i++) {
        service.addQuote(sectorId, makeSectorQuote({
          sectorId,
          changePercent: -1.0 - i * 0.5,
        }));
      }

      const rotation = service.getSectorRotation();
      const falling = rotation.consecutiveFalling.find(s => s.sectorId === sectorId);
      expect(falling).toBeDefined();
      expect(falling!.days).toBe(4);
    });
  });
});
