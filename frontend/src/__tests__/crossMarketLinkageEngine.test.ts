import { describe, it, expect } from 'vitest';
import { analyzeCrossMarketLinkage, MarketReturns } from '../utils/crossMarketLinkageEngine';

describe('跨市场联动引擎', () => {
  const markets: MarketReturns[] = [
    { market: 'A股', returns: Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.02), dates: Array.from({ length: 50 }, (_, i) => `2026-0${Math.floor(i / 10) + 1}-${(i % 10) + 1}`) },
    { market: '港股', returns: Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.025), dates: Array.from({ length: 50 }, (_, i) => `2026-0${Math.floor(i / 10) + 1}-${(i % 10) + 1}`) },
    { market: '美股', returns: Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.015), dates: Array.from({ length: 50 }, (_, i) => `2026-0${Math.floor(i / 10) + 1}-${(i % 10) + 1}`) },
  ];

  describe('analyzeCrossMarketLinkage', () => {
    it('should compute linkages for all pairs', () => {
      const result = analyzeCrossMarketLinkage(markets);
      expect(result.linkages.length).toBe(3); // C(3,2) = 3
    });

    it('should find strongest link', () => {
      const result = analyzeCrossMarketLinkage(markets);
      expect(result.strongestLink).toBeDefined();
    });

    it('should calculate diversification benefit', () => {
      const result = analyzeCrossMarketLinkage(markets);
      expect(result.diversificationBenefit).toBeGreaterThanOrEqual(0);
      expect(result.diversificationBenefit).toBeLessThanOrEqual(1);
    });

    it('should classify contagion risk', () => {
      const result = analyzeCrossMarketLinkage(markets);
      result.linkages.forEach(l => {
        expect(['low', 'moderate', 'high']).toContain(l.contagionRisk);
      });
    });

    it('should determine composite risk', () => {
      const result = analyzeCrossMarketLinkage(markets);
      expect(['low', 'moderate', 'high']).toContain(result.compositeRisk);
    });

    it('should handle empty input', () => {
      const result = analyzeCrossMarketLinkage([]);
      expect(result.linkages.length).toBe(0);
      expect(result.compositeRisk).toBe('low');
    });

    it('should handle single market', () => {
      const result = analyzeCrossMarketLinkage([markets[0]]);
      expect(result.linkages.length).toBe(0);
    });

    it('should have correlation between -1 and 1', () => {
      const result = analyzeCrossMarketLinkage(markets);
      result.linkages.forEach(l => {
        expect(l.correlation).toBeGreaterThanOrEqual(-1);
        expect(l.correlation).toBeLessThanOrEqual(1);
      });
    });
  });
});
