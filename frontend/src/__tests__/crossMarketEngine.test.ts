import { describe, it, expect } from 'vitest';
import {
  calculateCrossCorrelation,
  buildCorrelationMatrix,
  generateCrossMarketSignal,
  detectContagionRisk,
  detectMarketRegime,
  rollingCrossCorrelation,
} from '../utils/crossMarketEngine';
import type { MarketData } from '../utils/crossMarketEngine';

function makeMarket(symbol: string, type: MarketData['type'], n: number = 200): MarketData {
  const prices: number[] = [100];
  for (let i = 1; i < n; i++) {
    prices.push(prices[i - 1] * (1 + (Math.random() - 0.5) * 0.04));
  }
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  return { symbol, name: symbol, type, returns, prices };
}

describe('Cross-Market Engine', () => {
  describe('calculateCrossCorrelation', () => {
    it('should calculate cross-correlation', () => {
      const m1 = makeMarket('SH', 'equity');
      const m2 = makeMarket('US', 'equity');
      const result = calculateCrossCorrelation(m1, m2);

      expect(result.market1).toBe('SH');
      expect(result.market2).toBe('US');
      expect(result.correlation).toBeGreaterThanOrEqual(-1);
      expect(result.correlation).toBeLessThanOrEqual(1);
      expect(result.lagCorrelation.length).toBeGreaterThan(0);
      expect(typeof result.leadLag).toBe('number');
    });

    it('should find lead-lag relationship', () => {
      const m1 = makeMarket('A', 'equity');
      const m2 = makeMarket('B', 'equity');
      const result = calculateCrossCorrelation(m1, m2, 5);

      expect(result.leadLag).toBeGreaterThanOrEqual(-5);
      expect(result.leadLag).toBeLessThanOrEqual(5);
    });

    it('should have regime correlations', () => {
      const m1 = makeMarket('A', 'equity');
      const m2 = makeMarket('B', 'equity');
      const result = calculateCrossCorrelation(m1, m2);

      expect(result.regimeCorrelations.length).toBeGreaterThan(0);
    });
  });

  describe('buildCorrelationMatrix', () => {
    it('should build correlation matrix', () => {
      const markets = [
        makeMarket('SH', 'equity'),
        makeMarket('US', 'equity'),
        makeMarket('HK', 'equity'),
        makeMarket('GOLD', 'commodity'),
      ];

      const result = buildCorrelationMatrix(markets);

      expect(result.symbols).toHaveLength(4);
      expect(result.matrix).toHaveLength(4);
      expect(result.matrix[0]).toHaveLength(4);
      // Diagonal should be 1
      expect(result.matrix[0][0]).toBeCloseTo(1, 5);
      // Symmetric
      expect(result.matrix[0][1]).toBeCloseTo(result.matrix[1][0], 5);
    });

    it('should find strong correlation pairs', () => {
      // Create correlated markets
      const base = makeMarket('BASE', 'equity', 200);
      const correlated: MarketData = {
        symbol: 'CORR', name: 'Correlated', type: 'equity',
        returns: base.returns.map(r => r + (Math.random() - 0.5) * 0.005),
        prices: base.prices,
      };
      const uncorrelated = makeMarket('UNCO', 'commodity');

      const result = buildCorrelationMatrix([base, correlated, uncorrelated]);
      expect(result.strongPairs.length).toBeGreaterThan(0);
    });
  });

  describe('generateCrossMarketSignal', () => {
    it('should generate risk signal', () => {
      const markets = [
        makeMarket('SH', 'equity'),
        makeMarket('US', 'equity'),
        makeMarket('BOND', 'bond'),
        makeMarket('OIL', 'commodity'),
      ];

      const signal = generateCrossMarketSignal(markets);

      expect(['risk_on', 'risk_off', 'neutral']).toContain(signal.signal);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      expect(signal.drivers.length).toBeGreaterThan(0);
      expect(signal.leadIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('detectContagionRisk', () => {
    it('should detect contagion risk', () => {
      const source = makeMarket('US', 'equity');
      const targets = [makeMarket('SH', 'equity'), makeMarket('EU', 'equity')];

      const risk = detectContagionRisk(source, targets);

      expect(risk.source).toBe('US');
      expect(risk.targets).toHaveLength(2);
      expect(risk.stressLevel).toBeGreaterThanOrEqual(0);
      expect(risk.stressLevel).toBeLessThanOrEqual(100);
      expect(risk.spilloverProbability).toBeGreaterThanOrEqual(0);
      expect(risk.spilloverProbability).toBeLessThanOrEqual(1);
    });

    it('should sort targets by beta', () => {
      const source = makeMarket('SRC', 'equity');
      const targets = [makeMarket('A', 'equity'), makeMarket('B', 'equity')];

      const risk = detectContagionRisk(source, targets);
      for (let i = 1; i < risk.targets.length; i++) {
        expect(Math.abs(risk.targets[i - 1].betaToSource)).toBeGreaterThanOrEqual(
          Math.abs(risk.targets[i].betaToSource)
        );
      }
    });
  });

  describe('detectMarketRegime', () => {
    it('should detect market regime', () => {
      const markets = [
        makeMarket('SH', 'equity'),
        makeMarket('US', 'equity'),
        makeMarket('HK', 'equity'),
      ];

      const regime = detectMarketRegime(markets);

      expect(['risk_on', 'risk_off', 'transitional']).toContain(regime.regime);
      expect(regime.duration).toBe(20);
      expect(regime.markets.length).toBe(3);
    });
  });

  describe('rollingCrossCorrelation', () => {
    it('should calculate rolling correlations', () => {
      const m1 = makeMarket('A', 'equity', 200);
      const m2 = makeMarket('B', 'equity', 200);

      const rolling = rollingCrossCorrelation(m1, m2, 60);

      expect(rolling.length).toBeGreaterThan(0);
      for (const r of rolling) {
        expect(r.correlation).toBeGreaterThanOrEqual(-1);
        expect(r.correlation).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle short data', () => {
      const m1 = makeMarket('A', 'equity', 5);
      const m2 = makeMarket('B', 'equity', 5);
      const result = calculateCrossCorrelation(m1, m2);
      expect(typeof result.correlation).toBe('number');
    });

    it('should handle identical markets', () => {
      const m = makeMarket('SAME', 'equity');
      const result = calculateCrossCorrelation(m, m);
      expect(result.correlation).toBeCloseTo(1, 1);
    });

    it('should handle negatively correlated markets', () => {
      const m1 = makeMarket('A', 'equity', 200);
      const m2: MarketData = {
        symbol: 'B', name: 'B', type: 'bond',
        returns: m1.returns.map(r => -r),
        prices: m1.prices,
      };
      const result = calculateCrossCorrelation(m1, m2);
      expect(result.correlation).toBeLessThan(-0.5);
    });
  });
});
