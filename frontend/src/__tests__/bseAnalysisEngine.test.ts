import { describe, it, expect } from 'vitest';
import {
  valueBSEStock,
  analyzeTransferOpportunity,
  scoreSpecialization,
  analyzeBSELiquidity,
  type BSEStock,
} from '../utils/bseAnalysisEngine';

function makeBSE(overrides: Partial<BSEStock> = {}): BSEStock {
  return {
    ticker: '830001',
    name: '测试北交所',
    industry: '制造业',
    price: 15,
    marketCap: 30e8,
    pe: 20,
    revenue: 10e8,
    revenueGrowth: 15,
    netProfit: 1.5e8,
    netProfitGrowth: 20,
    grossMargin: 0.35,
    isSpecialized: true,
    isLittleGiant: false,
    transferEligible: true,
    turnoverRate: 0.015,
    avgVolume: 5e6,
    bidAskSpread: 0.008,
    hasMarketMaker: true,
    marketMakerCount: 2,
    ...overrides,
  };
}

describe('BSE Analysis Engine', () => {
  describe('valueBSEStock', () => {
    it('should value with sector comparison', () => {
      const val = valueBSEStock(makeBSE());
      expect(val.currentPE).toBe(20);
      expect(val.sectorAvgPE).toBe(25);
      expect(val.valuationGap).toBeGreaterThan(0);
    });

    it('should apply transfer premium', () => {
      const eligible = valueBSEStock(makeBSE({ transferEligible: true }));
      const notEligible = valueBSEStock(makeBSE({ transferEligible: false }));
      expect(eligible.transferPremium).toBeGreaterThan(notEligible.transferPremium);
    });

    it('should classify discount level', () => {
      const heavy = valueBSEStock(makeBSE({ pe: 10 }), 30);
      const premium = valueBSEStock(makeBSE({ pe: 35 }), 20);
      expect(heavy.discount).toBe('heavy');
      expect(premium.discount).toBe('premium');
    });
  });

  describe('analyzeTransferOpportunity', () => {
    it('should check requirements', () => {
      const opp = analyzeTransferOpportunity(makeBSE());
      expect(opp.requirements.length).toBeGreaterThan(0);
      expect(opp.requirements.every(r => typeof r.met === 'boolean')).toBe(true);
    });

    it('should determine eligibility', () => {
      const eligible = analyzeTransferOpportunity(makeBSE({
        marketCap: 30e8, netProfit: 2e8, netProfitGrowth: 15,
        revenue: 5e8, revenueGrowth: 20,
      }));
      expect(eligible.eligible).toBe(true);
    });

    it('should identify risk factors for ineligible', () => {
      const opp = analyzeTransferOpportunity(makeBSE({
        marketCap: 5e8, netProfit: -1e8, revenueGrowth: 0,
      }));
      expect(opp.riskFactors.length).toBeGreaterThan(0);
    });
  });

  describe('scoreSpecialization', () => {
    it('should score higher for specialized companies', () => {
      const specialized = scoreSpecialization(makeBSE({ isSpecialized: true, isLittleGiant: true }));
      const normal = scoreSpecialization(makeBSE({ isSpecialized: false, isLittleGiant: false }));

      expect(specialized.totalScore).toBeGreaterThan(normal.totalScore);
      expect(specialized.category).toBe('专精特新小巨人');
    });

    it('should include sub-scores', () => {
      const score = scoreSpecialization(makeBSE());
      expect(score.rdScore).toBeGreaterThanOrEqual(0);
      expect(score.marketShareScore).toBeGreaterThanOrEqual(0);
      expect(score.profitabilityScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeBSELiquidity', () => {
    it('should score liquidity', () => {
      const liq = analyzeBSELiquidity(makeBSE());
      expect(liq.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(liq.liquidityScore).toBeLessThanOrEqual(100);
      expect(['good', 'moderate', 'poor']).toContain(liq.tier);
    });

    it('should score higher with market maker', () => {
      const withMM = analyzeBSELiquidity(makeBSE({ hasMarketMaker: true }));
      const withoutMM = analyzeBSELiquidity(makeBSE({ hasMarketMaker: false }));
      expect(withMM.liquidityScore).toBeGreaterThan(withoutMM.liquidityScore);
    });

    it('should estimate absorbable amount', () => {
      const liq = analyzeBSELiquidity(makeBSE());
      expect(liq.canAbsorb).toBeGreaterThan(0);
    });
  });
});
