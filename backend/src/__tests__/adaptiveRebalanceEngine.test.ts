import { describe, it, expect } from 'vitest';
import { AdaptiveRebalanceEngine, PortfolioWeight, TaxLot } from '../services/adaptiveRebalanceEngine';

describe('AdaptiveRebalanceEngine', () => {
  const engine = new AdaptiveRebalanceEngine();

  const makeWeights = (): PortfolioWeight[] => [
    { asset: 'A', target: 0.4, current: 0.45, drift: 0.05 },
    { asset: 'B', target: 0.3, current: 0.25, drift: -0.05 },
    { asset: 'C', target: 0.3, current: 0.30, drift: 0 },
  ];

  describe('thresholdRebalance', () => {
    it('no rebalance when drift below threshold', () => {
      const weights: PortfolioWeight[] = [
        { asset: 'A', target: 0.5, current: 0.51, drift: 0.01 },
        { asset: 'B', target: 0.5, current: 0.49, drift: -0.01 },
      ];
      const signal = engine.thresholdRebalance(weights, 100000, 0.05);
      expect(signal.shouldRebalance).toBe(false);
      expect(signal.trigger).toBe('none');
    });

    it('triggers rebalance when drift exceeds threshold', () => {
      const weights = makeWeights();
      const signal = engine.thresholdRebalance(weights, 100000, 0.03);
      expect(signal.trades.length).toBeGreaterThan(0);
      expect(signal.totalTurnover).toBeGreaterThan(0);
    });

    it('urgency is in [0, 1]', () => {
      const weights = makeWeights();
      const signal = engine.thresholdRebalance(weights, 100000, 0.03);
      expect(signal.urgency).toBeGreaterThanOrEqual(0);
      expect(signal.urgency).toBeLessThanOrEqual(1);
    });

    it('trades have valid amounts', () => {
      const weights = makeWeights();
      const signal = engine.thresholdRebalance(weights, 100000, 0.03);
      signal.trades.forEach(t => {
        expect(t.amount).toBeGreaterThan(0);
        expect(['buy', 'sell']).toContain(t.action);
        expect(t.estimatedCost).toBeGreaterThan(0);
      });
    });
  });

  describe('timeRebalance', () => {
    it('no rebalance before interval', () => {
      const signal = engine.timeRebalance(makeWeights(), 100000, 10, 30);
      expect(signal.shouldRebalance).toBe(false);
    });

    it('rebalances at interval', () => {
      const signal = engine.timeRebalance(makeWeights(), 100000, 30, 30);
      expect(signal.shouldRebalance).toBe(true);
    });

    it('urgency increases with time', () => {
      const early = engine.timeRebalance(makeWeights(), 100000, 5, 30);
      const late = engine.timeRebalance(makeWeights(), 100000, 25, 30);
      expect(late.urgency).toBeGreaterThan(early.urgency);
    });
  });

  describe('calculateDriftTolerance', () => {
    it('returns tolerance for each asset', () => {
      const vol = new Map([['A', 0.02], ['B', 0.03], ['C', 0.01]]);
      const result = engine.calculateDriftTolerance(makeWeights(), vol);
      expect(result.length).toBe(3);
      result.forEach(r => {
        expect(r.lowerBound).toBeLessThan(0);
        expect(r.upperBound).toBeGreaterThan(0);
        expect(typeof r.isBreached).toBe('boolean');
      });
    });

    it('higher volatility = wider tolerance', () => {
      const vol1 = new Map([['A', 0.01]]);
      const vol2 = new Map([['A', 0.05]]);
      const w: PortfolioWeight[] = [{ asset: 'A', target: 1, current: 1, drift: 0 }];
      const t1 = engine.calculateDriftTolerance(w, vol1);
      const t2 = engine.calculateDriftTolerance(w, vol2);
      expect(t2[0].upperBound).toBeGreaterThan(t1[0].upperBound);
    });
  });

  describe('riskBudgetRebalance', () => {
    it('returns signal for matching dimensions', () => {
      const weights = makeWeights();
      const cov = [[0.04, 0.01, 0.02], [0.01, 0.03, 0.01], [0.02, 0.01, 0.025]];
      const budgets = [0.4, 0.3, 0.3];
      const signal = engine.riskBudgetRebalance(weights, 100000, cov, budgets);
      expect(signal.trigger).toBe('risk');
      expect(signal.urgency).toBeGreaterThanOrEqual(0);
    });

    it('handles mismatched dimensions', () => {
      const signal = engine.riskBudgetRebalance(makeWeights(), 100000, [[1]], [1]);
      expect(signal.shouldRebalance).toBe(false);
    });

    it('trades have valid structure', () => {
      const weights = makeWeights();
      const cov = [[0.04, 0.01, 0.02], [0.01, 0.03, 0.01], [0.02, 0.01, 0.025]];
      const budgets = [0.5, 0.25, 0.25];
      const signal = engine.riskBudgetRebalance(weights, 100000, cov, budgets);
      signal.trades.forEach(t => {
        expect(t.amount).toBeGreaterThan(0);
        expect(['buy', 'sell']).toContain(t.action);
      });
    });
  });

  describe('taxLossHarvest', () => {
    it('harvests losses from losing positions', () => {
      const lots: TaxLot[] = [
        { asset: 'A', quantity: 100, costBasis: 50, currentPrice: 40, purchaseDate: '2025-01-01', unrealizedGain: -1000, isLongTerm: true },
        { asset: 'B', quantity: 100, costBasis: 30, currentPrice: 35, purchaseDate: '2025-06-01', unrealizedGain: 500, isLongTerm: false },
      ];
      const replacements = new Map([['A', 'A-ALT']]);
      const result = engine.taxLossHarvest(lots, replacements);
      expect(result.harvestedLoss).toBe(1000);
      expect(result.trades.length).toBe(2); // sell + buy replacement
      expect(result.netTaxBenefit).toBeGreaterThan(0);
    });

    it('skips positions with small losses', () => {
      const lots: TaxLot[] = [
        { asset: 'A', quantity: 10, costBasis: 50, currentPrice: 49, purchaseDate: '2025-01-01', unrealizedGain: -10, isLongTerm: true },
      ];
      const result = engine.taxLossHarvest(lots, new Map(), 0.25, 100);
      expect(result.harvestedLoss).toBe(0);
    });

    it('detects wash sale risk', () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const lots: TaxLot[] = [
        { asset: 'A', quantity: 100, costBasis: 50, currentPrice: 30, purchaseDate: recentDate, unrealizedGain: -2000, isLongTerm: false },
      ];
      const result = engine.taxLossHarvest(lots, new Map());
      expect(result.washSaleRisk).toContain('A');
    });
  });

  describe('optimalFrequency', () => {
    it('returns scores for each frequency', () => {
      const vol = new Map([['A', 0.02]]);
      const w: PortfolioWeight[] = [{ asset: 'A', target: 1, current: 1, drift: 0 }];
      const result = engine.optimalFrequency(w, vol);
      expect(result.length).toBe(6);
      result.forEach(r => {
        expect(r.frequency).toBeGreaterThan(0);
        expect(r.expectedCost).toBeGreaterThanOrEqual(0);
        expect(r.expectedDrift).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeGreaterThan(0);
      });
    });

    it('more frequent = higher cost, lower drift', () => {
      const vol = new Map([['A', 0.02]]);
      const w: PortfolioWeight[] = [{ asset: 'A', target: 1, current: 1, drift: 0 }];
      const result = engine.optimalFrequency(w, vol);
      // Daily has lower expected drift than monthly
      const daily = result.find(r => r.frequency === 1)!;
      const monthly = result.find(r => r.frequency === 30)!;
      expect(daily.expectedDrift).toBeLessThan(monthly.expectedDrift);
    });
  });
});
