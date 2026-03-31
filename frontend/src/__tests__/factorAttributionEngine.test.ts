import { describe, it, expect } from 'vitest';
import {
  famaFrench3Factor,
  famaFrench5Factor,
  customFactorAttribution,
  calculateFactorExposures,
  rollingAttribution,
  factorCorrelationMatrix,
  brinsonAttribution,
  factorPerformanceSummary,
  detectInteractionEffects,
  portfolioFactorAttribution,
  decomposeContributions,
  marginalContributionToRisk,
} from '../utils/factorAttributionEngine';

// Helper: generate random walk returns
function generateReturns(n: number, drift: number = 0.0003, vol: number = 0.02): number[] {
  const returns: number[] = [];
  for (let i = 0; i < n; i++) {
    returns.push(drift + vol * (Math.random() - 0.5) * 2);
  }
  return returns;
}

function generateFactorReturns(n: number): {
  marketExcess: number[];
  smb: number[];
  hml: number[];
  rmw: number[];
  cma: number[];
} {
  return {
    marketExcess: generateReturns(n, 0.0004, 0.015),
    smb: generateReturns(n, 0.0001, 0.01),
    hml: generateReturns(n, 0.0001, 0.01),
    rmw: generateReturns(n, 0.0001, 0.008),
    cma: generateReturns(n, 0.00005, 0.007),
  };
}

describe('Factor Attribution Engine', () => {
  describe('famaFrench3Factor', () => {
    it('should run 3-factor attribution', () => {
      const n = 252;
      const factors = generateFactorReturns(n);
      const stockReturns = generateReturns(n);

      const result = famaFrench3Factor(
        stockReturns,
        factors.marketExcess,
        factors.smb,
        factors.hml
      );

      expect(result).toHaveProperty('totalReturn');
      expect(result).toHaveProperty('factorReturns');
      expect(result).toHaveProperty('alpha');
      expect(result).toHaveProperty('rSquared');
      expect(result.factorReturns).toHaveLength(3);
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });

    it('should have correct factor names', () => {
      const n = 252;
      const factors = generateFactorReturns(n);
      const result = famaFrench3Factor(
        generateReturns(n),
        factors.marketExcess,
        factors.smb,
        factors.hml
      );

      expect(result.factorReturns[0].factor).toBe('Market');
      expect(result.factorReturns[1].factor).toBe('SMB');
      expect(result.factorReturns[2].factor).toBe('HML');
    });

    it('should include weight and contribution in factor returns', () => {
      const n = 252;
      const factors = generateFactorReturns(n);
      const result = famaFrench3Factor(
        generateReturns(n),
        factors.marketExcess,
        factors.smb,
        factors.hml
      );

      for (const fr of result.factorReturns) {
        expect(fr).toHaveProperty('weight');
        expect(fr).toHaveProperty('contribution');
        expect(typeof fr.weight).toBe('number');
        expect(typeof fr.contribution).toBe('number');
      }
    });

    it('should handle small datasets', () => {
      const n = 10;
      const factors = generateFactorReturns(n);
      const result = famaFrench3Factor(
        generateReturns(n),
        factors.marketExcess,
        factors.smb,
        factors.hml
      );

      expect(result.factorReturns).toHaveLength(3);
      expect(typeof result.alpha).toBe('number');
    });
  });

  describe('famaFrench5Factor', () => {
    it('should run 5-factor attribution', () => {
      const n = 252;
      const factors = generateFactorReturns(n);
      const result = famaFrench5Factor(
        generateReturns(n),
        factors.marketExcess,
        factors.smb,
        factors.hml,
        factors.rmw,
        factors.cma
      );

      expect(result.factorReturns).toHaveLength(5);
      expect(result.factorReturns.map(f => f.factor)).toEqual([
        'Market', 'SMB', 'HML', 'RMW', 'CMA',
      ]);
    });

    it('should have higher R² than 3-factor with relevant factors', () => {
      const n = 500;
      const marketExcess = generateReturns(n);
      const smb = generateReturns(n);
      const hml = generateReturns(n);
      const rmw = generateReturns(n);
      const cma = generateReturns(n);

      // Stock returns driven by all 5 factors
      const stockReturns = marketExcess.map((m, i) =>
        0.001 + 0.8 * m + 0.3 * smb[i] + 0.2 * hml[i] + 0.15 * rmw[i] + 0.1 * cma[i] + 0.005 * (Math.random() - 0.5)
      );

      const result3 = famaFrench3Factor(stockReturns, marketExcess, smb, hml);
      const result5 = famaFrench5Factor(stockReturns, marketExcess, smb, hml, rmw, cma);

      expect(result5.rSquared).toBeGreaterThanOrEqual(result3.rSquared - 0.01);
    });
  });

  describe('customFactorAttribution', () => {
    it('should work with custom factors', () => {
      const n = 252;
      const stockReturns = generateReturns(n);
      const factors = {
        momentum: generateReturns(n),
        quality: generateReturns(n),
        value: generateReturns(n),
      };

      const result = customFactorAttribution(stockReturns, factors);

      expect(result.factorReturns).toHaveLength(3);
      expect(result.factorReturns.map(f => f.factor)).toEqual(['momentum', 'quality', 'value']);
    });

    it('should work with single factor', () => {
      const n = 252;
      const stockReturns = generateReturns(n);
      const factors = { market: generateReturns(n) };

      const result = customFactorAttribution(stockReturns, factors);

      expect(result.factorReturns).toHaveLength(1);
      expect(result.factorReturns[0].factor).toBe('market');
    });

    it('should work with many factors', () => {
      const n = 252;
      const stockReturns = generateReturns(n);
      const factors: Record<string, number[]> = {};
      for (let i = 0; i < 10; i++) {
        factors[`factor_${i}`] = generateReturns(n);
      }

      const result = customFactorAttribution(stockReturns, factors);
      expect(result.factorReturns).toHaveLength(10);
    });
  });

  describe('calculateFactorExposures', () => {
    it('should return exposures with t-stats', () => {
      const n = 252;
      const factors = {
        momentum: generateReturns(n),
        value: generateReturns(n),
      };

      const exposures = calculateFactorExposures(generateReturns(n), factors);

      expect(exposures).toHaveLength(2);
      for (const exp of exposures) {
        expect(exp).toHaveProperty('factor');
        expect(exp).toHaveProperty('exposure');
        expect(exp).toHaveProperty('tStat');
        expect(exp).toHaveProperty('significant');
        expect(typeof exp.significant).toBe('boolean');
      }
    });

    it('should detect significant exposures with strong signal', () => {
      const n = 500;
      const momentum = generateReturns(n, 0, 0.02);
      const stockReturns = momentum.map(m => 0.001 + 0.9 * m + 0.001 * (Math.random() - 0.5));

      const exposures = calculateFactorExposures(stockReturns, { momentum });
      expect(exposures[0].significant).toBe(true);
    });
  });

  describe('rollingAttribution', () => {
    it('should produce rolling windows', () => {
      const n = 300;
      const factors = {
        market: generateReturns(n),
        value: generateReturns(n),
      };

      const rolling = rollingAttribution(generateReturns(n), factors, 60);

      expect(rolling.length).toBeGreaterThan(0);
      for (const r of rolling) {
        expect(r).toHaveProperty('date');
        expect(r).toHaveProperty('alpha');
        expect(r).toHaveProperty('factorContributions');
        expect(r).toHaveProperty('rSquared');
      }
    });

    it('should respect window size', () => {
      const n = 200;
      const factors = { market: generateReturns(n) };
      const rolling = rollingAttribution(generateReturns(n), factors, 60);

      // n - window + 1 windows (end from window to n inclusive)
      expect(rolling.length).toBe(200 - 60 + 1);
    });
  });

  describe('factorCorrelationMatrix', () => {
    it('should return symmetric correlation matrix', () => {
      const n = 252;
      const factors = {
        a: generateReturns(n),
        b: generateReturns(n),
        c: generateReturns(n),
      };

      const result = factorCorrelationMatrix(factors);

      expect(result.factors).toEqual(['a', 'b', 'c']);
      expect(result.matrix).toHaveLength(3);
      expect(result.matrix[0]).toHaveLength(3);

      // Diagonal should be 1
      expect(result.matrix[0][0]).toBeCloseTo(1, 5);
      expect(result.matrix[1][1]).toBeCloseTo(1, 5);

      // Symmetric
      expect(result.matrix[0][1]).toBeCloseTo(result.matrix[1][0], 5);
    });

    it('should handle perfectly correlated factors', () => {
      const n = 100;
      const base = generateReturns(n);
      const factors = {
        a: base,
        b: base.map(v => v * 2),
      };

      const result = factorCorrelationMatrix(factors);
      expect(result.matrix[0][1]).toBeCloseTo(1, 3);
    });
  });

  describe('brinsonAttribution', () => {
    it('should decompose into allocation and selection effects', () => {
      const result = brinsonAttribution(
        { tech: 0.4, finance: 0.3, consumer: 0.3 },
        { tech: 0.3, finance: 0.4, consumer: 0.3 },
        { tech: 0.12, finance: 0.08, consumer: 0.10 },
        { tech: 0.10, finance: 0.09, consumer: 0.11 }
      );

      expect(result).toHaveProperty('allocationEffect');
      expect(result).toHaveProperty('selectionEffect');
      expect(result).toHaveProperty('interactionEffect');
      expect(result).toHaveProperty('totalAllocation');
      expect(result).toHaveProperty('totalSelection');
      expect(result).toHaveProperty('totalInteraction');

      expect(Object.keys(result.allocationEffect)).toEqual(['tech', 'finance', 'consumer']);
    });

    it('should sum effects correctly', () => {
      const result = brinsonAttribution(
        { A: 0.5, B: 0.5 },
        { A: 0.5, B: 0.5 },
        { A: 0.1, B: 0.05 },
        { A: 0.08, B: 0.06 }
      );

      // When weights equal benchmark, allocation effect should be 0
      expect(result.totalAllocation).toBeCloseTo(0, 10);
    });
  });

  describe('factorPerformanceSummary', () => {
    it('should calculate performance statistics', () => {
      const returns = generateReturns(252, 0.0005, 0.015);
      const summary = factorPerformanceSummary(returns);

      expect(summary).toHaveProperty('annualizedReturn');
      expect(summary).toHaveProperty('annualizedVolatility');
      expect(summary).toHaveProperty('sharpeRatio');
      expect(summary).toHaveProperty('maxDrawdown');
      expect(summary).toHaveProperty('bestMonth');
      expect(summary).toHaveProperty('worstMonth');
      expect(summary).toHaveProperty('hitRate');
      expect(summary.annualizedVolatility).toBeGreaterThanOrEqual(0);
      expect(summary.hitRate).toBeGreaterThanOrEqual(0);
      expect(summary.hitRate).toBeLessThanOrEqual(1);
    });

    it('should handle all positive returns', () => {
      const returns = Array(252).fill(0.001);
      const summary = factorPerformanceSummary(returns);

      expect(summary.hitRate).toBe(1);
      expect(summary.maxDrawdown).toBe(0);
      expect(summary.annualizedReturn).toBeGreaterThan(0);
    });
  });

  describe('detectInteractionEffects', () => {
    it('should find interactions between factor pairs', () => {
      const n = 500;
      const factors = {
        momentum: generateReturns(n),
        value: generateReturns(n),
        quality: generateReturns(n),
      };

      const interactions = detectInteractionEffects(generateReturns(n), factors);

      // 3 factors = 3 pairs
      expect(interactions.length).toBeLessThanOrEqual(3);
      for (const i of interactions) {
        expect(i).toHaveProperty('factors');
        expect(i).toHaveProperty('interactionCoefficient');
        expect(i).toHaveProperty('tStat');
        expect(i).toHaveProperty('significant');
        expect(i.factors).toHaveLength(2);
      }
    });
  });

  describe('portfolioFactorAttribution', () => {
    it('should attribute portfolio returns to factors', () => {
      const n = 252;
      const weights = { A: 0.4, B: 0.3, C: 0.3 };
      const stockReturns: Record<string, number[]> = {
        A: generateReturns(n),
        B: generateReturns(n),
        C: generateReturns(n),
      };
      const factors = {
        market: generateReturns(n),
        value: generateReturns(n),
      };

      const result = portfolioFactorAttribution(weights, stockReturns, factors);

      expect(result.factorReturns).toHaveLength(2);
      expect(typeof result.alpha).toBe('number');
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
    });
  });

  describe('decomposeContributions', () => {
    it('should return absolute and relative contributions', () => {
      const n = 252;
      const factors = {
        market: generateReturns(n),
        value: generateReturns(n),
      };

      const attribution = customFactorAttribution(generateReturns(n), factors);
      const decomp = decomposeContributions(attribution);

      expect(decomp.absolute).toHaveLength(2);
      expect(decomp.relative).toHaveLength(2);
      expect(decomp).toHaveProperty('totalFactorContribution');
      expect(decomp).toHaveProperty('activeAlpha');
    });
  });

  describe('marginalContributionToRisk', () => {
    it('should return MCR for each factor', () => {
      const n = 252;
      const factors = {
        market: generateReturns(n),
        value: generateReturns(n),
        momentum: generateReturns(n),
      };

      const mcr = marginalContributionToRisk(generateReturns(n), factors);

      expect(Object.keys(mcr)).toEqual(['market', 'value', 'momentum']);
      for (const v of Object.values(mcr)) {
        expect(typeof v).toBe('number');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays gracefully', () => {
      const result = famaFrench3Factor([], [], [], []);
      expect(result.factorReturns).toHaveLength(3);
    });

    it('should handle constant returns', () => {
      const n = 100;
      const constant = Array(n).fill(0.001);
      const factors = { market: generateReturns(n) };

      const result = customFactorAttribution(constant, factors);
      expect(typeof result.rSquared).toBe('number');
    });

    it('should handle arrays of different lengths', () => {
      const stockReturns = generateReturns(300);
      const factors = {
        a: generateReturns(250),
        b: generateReturns(200),
      };

      const result = customFactorAttribution(stockReturns, factors);
      expect(result.factorReturns).toHaveLength(2);
    });
  });
});
