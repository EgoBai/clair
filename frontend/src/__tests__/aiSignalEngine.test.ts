import { describe, it, expect } from 'vitest';
import {
  generateStockSignal,
  rankStocks,
  technicalSignals,
  detectConsensus,
} from '../utils/aiSignalEngine';
import type { SignalComponent, StockSignal } from '../utils/aiSignalEngine';

function makeComponent(name: string, value: number, category: SignalComponent['category'] = 'technical'): SignalComponent {
  return { name, value, weight: 0.5, confidence: 0.8, category };
}

describe('AI Signal Engine', () => {
  describe('generateStockSignal', () => {
    it('should generate composite signal', () => {
      const components = [
        makeComponent('rsi', 0.6),
        makeComponent('macd', 0.4),
        makeComponent('volume', 0.3),
      ];

      const signal = generateStockSignal('AAPL', components);

      expect(signal.symbol).toBe('AAPL');
      expect(signal.compositeScore).toBeGreaterThan(0);
      expect(signal.direction).toBe('buy');
      expect(signal.confidence).toBeGreaterThan(0);
      expect(signal.topDrivers.length).toBeGreaterThan(0);
      expect(signal.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle conflicting signals', () => {
      const components = [
        makeComponent('bull', 0.8),
        makeComponent('bear', -0.8),
        makeComponent('neutral', 0),
      ];

      const signal = generateStockSignal('TEST', components);
      expect(signal.direction).toBe('hold');
      expect(signal.riskScore).toBeGreaterThan(0);
    });

    it('should handle empty components', () => {
      const signal = generateStockSignal('EMPTY', []);
      expect(signal.compositeScore).toBe(0);
      expect(signal.direction).toBe('hold');
      expect(signal.confidence).toBe(0);
    });

    it('should respect custom weights', () => {
      const components = [
        makeComponent('low_weight', 0.9),
        makeComponent('high_weight', -0.5),
      ];
      components[0].weight = 0.1;
      components[1].weight = 1.0;

      const signal = generateStockSignal('TEST', components, {
        weights: { high_weight: 10 },
      });

      // High weight signal should dominate
      expect(signal.compositeScore).toBeLessThan(0);
    });

    it('should filter by minimum confidence', () => {
      const components = [
        makeComponent('high_conf', 0.8),
        makeComponent('low_conf', 0.5),
      ];
      components[1].confidence = 0.1;

      const signal = generateStockSignal('TEST', components, { minConfidence: 0.5 });
      expect(signal.components).toHaveLength(1);
    });

    it('should determine time horizon', () => {
      const techOnly = [makeComponent('rsi', 0.5, 'technical')];
      const fundMacro = [
        makeComponent('pe', 0.5, 'fundamental'),
        makeComponent('gdp', 0.3, 'macro'),
      ];

      const techSignal = generateStockSignal('TECH', techOnly);
      const fundSignal = generateStockSignal('FUND', fundMacro);

      expect(techSignal.timeHorizon).toBe('short');
      expect(fundSignal.timeHorizon).toBe('long');
    });
  });

  describe('rankStocks', () => {
    it('should rank by composite score', () => {
      const signals: StockSignal[] = [
        { ...generateStockSignal('A', [makeComponent('x', 0.3)]), compositeScore: 20 },
        { ...generateStockSignal('B', [makeComponent('x', 0.8)]), compositeScore: 60 },
        { ...generateStockSignal('C', [makeComponent('x', -0.5)]), compositeScore: -30 },
      ];

      const ranked = rankStocks(signals);
      expect(ranked[0].symbol).toBe('B');
      expect(ranked[2].symbol).toBe('C');
    });
  });

  describe('technicalSignals', () => {
    it('should generate technical signals', () => {
      const closes = Array(100).fill(0).map((_, i) => 100 + i * 0.1 + Math.random() * 2);
      const volumes = Array(100).fill(0).map(() => 1000 + Math.random() * 500);

      const signals = technicalSignals(closes, volumes);

      expect(signals.length).toBeGreaterThan(0);
      for (const s of signals) {
        expect(s.value).toBeGreaterThanOrEqual(-1);
        expect(s.value).toBeLessThanOrEqual(1);
        expect(s.category).toBe('technical');
      }
    });

    it('should handle short data', () => {
      const signals = technicalSignals([100, 101, 102], [100, 200, 300]);
      expect(signals.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectConsensus', () => {
    it('should detect bullish consensus', () => {
      const signals: StockSignal[] = Array(5).fill(null).map((_, i) =>
        generateStockSignal(`S${i}`, [makeComponent('x', 0.6 + Math.random() * 0.2)])
      );

      const result = detectConsensus(signals);
      expect(result.consensus).toBe('bullish');
      expect(result.strength).toBeGreaterThan(0.5);
    });

    it('should detect mixed consensus', () => {
      const signals: StockSignal[] = [
        generateStockSignal('BULL', [makeComponent('x', 0.8)]),
        generateStockSignal('BEAR', [makeComponent('x', -0.8)]),
      ];

      const result = detectConsensus(signals);
      expect(result.consensus).toBe('mixed');
    });

    it('should identify outliers', () => {
      const signals: StockSignal[] = [
        { ...generateStockSignal('A', [makeComponent('x', 0.5)]), compositeScore: 50 },
        { ...generateStockSignal('B', [makeComponent('x', 0.6)]), compositeScore: 55 },
        { ...generateStockSignal('OUTLIER', [makeComponent('x', -0.8)]), compositeScore: -70 },
      ];

      const result = detectConsensus(signals);
      expect(result.outliers).toContain('OUTLIER');
    });
  });

  describe('edge cases', () => {
    it('should handle all zero signals', () => {
      const components = [
        makeComponent('a', 0),
        makeComponent('b', 0),
      ];
      const signal = generateStockSignal('ZERO', components);
      expect(signal.compositeScore).toBe(0);
      expect(signal.direction).toBe('hold');
    });

    it('should handle single component', () => {
      const signal = generateStockSignal('SINGLE', [makeComponent('only', 0.7)]);
      expect(['buy', 'strong_buy']).toContain(signal.direction);
    });
  });
});
