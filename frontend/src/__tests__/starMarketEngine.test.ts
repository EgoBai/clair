import { describe, it, expect } from 'vitest';
import {
  valueSTARStock,
  analyzeLockUp,
  analyzeRD,
  selectSTARStocks,
  type STARStock,
} from '../utils/starMarketEngine';

function makeSTAR(overrides: Partial<STARStock> = {}): STARStock {
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  return {
    ticker: '688001',
    name: '测试科技',
    ipoDate: '2025-01-01',
    industry: '半导体',
    revenue: 50e8,
    revenueGrowth: 25,
    netProfit: 5e8,
    rdExpense: 8e8,
    rdRatio: 0.16,
    patentCount: 120,
    grossMargin: 0.45,
    marketCap: 500e8,
    psRatio: 10,
    price: 100,
    ipoPrice: 50,
    ipoPremium: 120,
    lockUpShares: 2e8,
    totalShares: 5e8,
    lockUpExpiry: futureDate.toISOString().slice(0, 10),
    hasMarketMaker: true,
    isProfitable: true,
    ...overrides,
  };
}

describe('STAR Market Engine', () => {
  describe('valueSTARStock', () => {
    it('should value profitable stocks with PEG', () => {
      const stock = makeSTAR({ isProfitable: true });
      const val = valueSTARStock(stock);

      expect(val.valuationMethod).toBe('peg');
      expect(val.ps).toBe(10);
      expect(val.innovationScore).toBeGreaterThan(50);
    });

    it('should value unprofitable stocks with PS', () => {
      const stock = makeSTAR({ isProfitable: false, netProfit: -2e8 });
      const val = valueSTARStock(stock);

      expect(val.valuationMethod).toBe('ps');
    });

    it('should calculate innovation score', () => {
      const innovative = makeSTAR({ rdRatio: 0.2, patentCount: 200, grossMargin: 0.5 });
      const basic = makeSTAR({ rdRatio: 0.05, patentCount: 5, grossMargin: 0.15 });

      const valInno = valueSTARStock(innovative);
      const valBasic = valueSTARStock(basic);

      expect(valInno.innovationScore).toBeGreaterThan(valBasic.innovationScore);
    });

    it('should assess risk level', () => {
      const highRisk = makeSTAR({ psRatio: 30, isProfitable: false });
      const lowRisk = makeSTAR({ psRatio: 3, isProfitable: true, netProfit: 10e8 });

      expect(valueSTARStock(highRisk).riskLevel).toBe('high');
      expect(valueSTARStock(lowRisk).riskLevel).toBe('low');
    });
  });

  describe('analyzeLockUp', () => {
    it('should calculate lock-up metrics', () => {
      const analysis = analyzeLockUp(makeSTAR());
      expect(analysis.lockUpRatio).toBeCloseTo(0.4, 1);
      expect(analysis.daysUntilExpiry).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(analysis.risk);
    });

    it('should estimate higher pressure for large gains', () => {
      const smallGain = analyzeLockUp(makeSTAR({ price: 60, ipoPrice: 50 }));
      const bigGain = analyzeLockUp(makeSTAR({ price: 200, ipoPrice: 50 }));
      expect(bigGain.estimatedPressure).toBeGreaterThan(smallGain.estimatedPressure);
    });

    it('should include historical impact', () => {
      const analysis = analyzeLockUp(makeSTAR());
      expect(analysis.historicalImpact.avgDrop).toBeLessThan(0);
      expect(analysis.historicalImpact.maxDrop).toBeLessThan(0);
    });
  });

  describe('analyzeRD', () => {
    it('should analyze R&D metrics', () => {
      const rd = analyzeRD(makeSTAR());
      expect(rd.rdRatio).toBe(0.16);
      expect(rd.rdEfficiency).toBeGreaterThan(0);
      expect(['above', 'average', 'below']).toContain(rd.comparison.vsIndustry);
    });

    it('should compare to industry average', () => {
      const high = analyzeRD(makeSTAR({ rdRatio: 0.25 }), 0.1);
      const low = analyzeRD(makeSTAR({ rdRatio: 0.05 }), 0.1);

      expect(high.comparison.vsIndustry).toBe('above');
      expect(low.comparison.vsIndustry).toBe('below');
    });
  });

  describe('selectSTARStocks', () => {
    it('should rank by growth strategy', () => {
      const stocks = [
        makeSTAR({ ticker: 'HIGH', revenueGrowth: 50 }),
        makeSTAR({ ticker: 'LOW', revenueGrowth: 5 }),
      ];
      const ranked = selectSTARStocks(stocks, 'growth');
      expect(ranked[0].ticker).toBe('HIGH');
    });

    it('should rank by innovation strategy', () => {
      const stocks = [
        makeSTAR({ ticker: 'INNO', rdRatio: 0.25, patentCount: 200 }),
        makeSTAR({ ticker: 'BASIC', rdRatio: 0.03, patentCount: 5 }),
      ];
      const ranked = selectSTARStocks(stocks, 'innovation');
      expect(ranked[0].ticker).toBe('INNO');
    });

    it('should rank by value strategy', () => {
      const stocks = [
        makeSTAR({ ticker: 'CHEAP', psRatio: 2, isProfitable: true }),
        makeSTAR({ ticker: 'EXPENSIVE', psRatio: 25, isProfitable: false }),
      ];
      const ranked = selectSTARStocks(stocks, 'value');
      expect(ranked[0].ticker).toBe('CHEAP');
    });

    it('should include reasons', () => {
      const ranked = selectSTARStocks([makeSTAR()], 'growth');
      expect(ranked[0].reasons.length).toBeGreaterThan(0);
    });
  });
});
