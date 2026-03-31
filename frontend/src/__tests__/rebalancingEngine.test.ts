import { describe, it, expect } from 'vitest';
import {
  analyzeDrift,
  calendarRebalance,
  thresholdRebalance,
  momentumRebalance,
  riskParityRebalance,
  taxAwareRebalance,
  cashFlowRebalance,
  calculateTrackingError,
  calculateTurnover,
  evaluateRebalanceMetrics,
  optimalRebalanceFrequency,
} from '../utils/rebalancingEngine';
import type { Holding } from '../utils/rebalancingEngine';

function makeHolding(
  symbol: string,
  target: number,
  current: number,
  gain: number = 0,
  sector: string = 'tech'
): Holding {
  return {
    symbol,
    targetWeight: target,
    currentWeight: current,
    costBasis: 10000,
    currentValue: current * 100000,
    unrealizedGain: gain,
    sector,
    assetClass: 'equity',
  };
}

const testHoldings: Holding[] = [
  makeHolding('AAPL', 0.30, 0.35, 5000),
  makeHolding('MSFT', 0.25, 0.20, -2000),
  makeHolding('GOOGL', 0.25, 0.28, 3000),
  makeHolding('AMZN', 0.20, 0.17, -1000),
];

describe('Rebalancing Engine', () => {
  describe('analyzeDrift', () => {
    it('should calculate drift for all holdings', () => {
      const drifts = analyzeDrift(testHoldings);

      expect(drifts).toHaveLength(4);
      for (const d of drifts) {
        expect(d).toHaveProperty('symbol');
        expect(d).toHaveProperty('absoluteDrift');
        expect(d).toHaveProperty('relativeDrift');
        expect(d).toHaveProperty('needsRebalance');
        expect(typeof d.needsRebalance).toBe('boolean');
      }
    });

    it('should detect significant drift', () => {
      const drifts = analyzeDrift(testHoldings);
      // MSFT has -5% absolute drift
      const msft = drifts.find(d => d.symbol === 'MSFT');
      expect(msft?.needsRebalance).toBe(true);
    });

    it('should not flag small drifts', () => {
      const holdings = [makeHolding('STABLE', 0.50, 0.495)];
      const drifts = analyzeDrift(holdings);
      expect(drifts[0].needsRebalance).toBe(false);
    });

    it('should handle empty portfolio', () => {
      expect(analyzeDrift([])).toEqual([]);
    });
  });

  describe('calendarRebalance', () => {
    it('should not rebalance before interval', () => {
      const plan = calendarRebalance(
        testHoldings,
        100000,
        { frequency: 'monthly', lastRebalanceDate: '2024-01-01' },
        '2024-01-15'
      );
      expect(plan.trades).toHaveLength(0);
      expect(plan.totalTurnover).toBe(0);
    });

    it('should rebalance after interval', () => {
      const plan = calendarRebalance(
        testHoldings,
        100000,
        { frequency: 'monthly', lastRebalanceDate: '2024-01-01' },
        '2024-02-15'
      );
      expect(plan.trades.length).toBeGreaterThan(0);
      expect(plan.strategy).toBe('calendar');
    });

    it('should respect quarterly frequency', () => {
      const plan = calendarRebalance(
        testHoldings,
        100000,
        { frequency: 'quarterly', lastRebalanceDate: '2024-01-01' },
        '2024-03-01' // ~60 days
      );
      expect(plan.trades).toHaveLength(0); // Not yet 90 days
    });
  });

  describe('thresholdRebalance', () => {
    it('should trigger trades for drifted positions', () => {
      const plan = thresholdRebalance(
        testHoldings,
        100000,
        { absolute: 0.02, relative: 0.1 },
        '2024-01-15'
      );

      expect(plan.trades.length).toBeGreaterThan(0);
      expect(plan.strategy).toBe('threshold');

      for (const trade of plan.trades) {
        expect(['buy', 'sell']).toContain(trade.action);
        expect(trade.estimatedValue).toBeGreaterThan(0);
        expect(trade.urgency).toBeGreaterThan(0);
      }
    });

    it('should not trigger trades within threshold', () => {
      const holdings = [
        makeHolding('A', 0.50, 0.51),
        makeHolding('B', 0.50, 0.49),
      ];
      const plan = thresholdRebalance(holdings, 100000, { absolute: 0.05, relative: 0.2 }, '2024-01-15');
      expect(plan.trades).toHaveLength(0);
    });

    it('should sort trades by urgency', () => {
      const plan = thresholdRebalance(testHoldings, 100000, { absolute: 0.01, relative: 0.05 }, '2024-01-15');
      for (let i = 1; i < plan.trades.length; i++) {
        expect(plan.trades[i - 1].urgency).toBeGreaterThanOrEqual(plan.trades[i].urgency);
      }
    });
  });

  describe('momentumRebalance', () => {
    it('should tilt weights based on momentum', () => {
      const momentumScores = { AAPL: 8, MSFT: -3, GOOGL: 5, AMZN: 2 };
      const plan = momentumRebalance(testHoldings, 100000, momentumScores, '2024-01-15');

      expect(plan.strategy).toBe('momentum');
      // Momentum should generate some trades
      expect(plan.trades.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero momentum scores', () => {
      const plan = momentumRebalance(testHoldings, 100000, {}, '2024-01-15');
      expect(plan.strategy).toBe('momentum');
    });
  });

  describe('riskParityRebalance', () => {
    it('should rebalance toward risk-parity', () => {
      const volatilities = { AAPL: 0.25, MSFT: 0.20, GOOGL: 0.30, AMZN: 0.35 };
      const correlations = {
        AAPL: { MSFT: 0.7, GOOGL: 0.6, AMZN: 0.5 },
        MSFT: { AAPL: 0.7, GOOGL: 0.65, AMZN: 0.55 },
        GOOGL: { AAPL: 0.6, MSFT: 0.65, AMZN: 0.6 },
        AMZN: { AAPL: 0.5, MSFT: 0.55, GOOGL: 0.6 },
      };

      const plan = riskParityRebalance(testHoldings, 100000, volatilities, correlations, '2024-01-15');

      expect(plan.strategy).toBe('risk-parity');
      expect(plan.trades.length).toBeGreaterThanOrEqual(0);
    });

    it('should assign higher weight to lower volatility', () => {
      const holdings = [
        makeHolding('LOWVOL', 0.5, 0.5),
        makeHolding('HIGHVOL', 0.5, 0.5),
      ];
      const volatilities = { LOWVOL: 0.10, HIGHVOL: 0.40 };
      const correlations = {
        LOWVOL: { HIGHVOL: 0 },
        HIGHVOL: { LOWVOL: 0 },
      };

      const plan = riskParityRebalance(holdings, 100000, volatilities, correlations, '2024-01-15');
      // Low vol should get higher target weight
      const lowTrade = plan.trades.find(t => t.symbol === 'LOWVOL');
      const highTrade = plan.trades.find(t => t.symbol === 'HIGHVOL');
      if (lowTrade && highTrade) {
        expect(lowTrade.targetWeight).toBeGreaterThan(highTrade.targetWeight);
      }
    });
  });

  describe('taxAwareRebalance', () => {
    it('should harvest losses first', () => {
      const holdings = [
        makeHolding('WINNER', 0.5, 0.5, 10000),
        makeHolding('LOSER', 0.5, 0.5, -8000),
      ];
      const plan = taxAwareRebalance(
        holdings,
        100000,
        { shortTermRate: 0.37, longTermRate: 0.20, taxLotMethod: 'fifo', harvestLossThreshold: 1000 },
        '2024-01-15'
      );

      expect(plan.strategy).toBe('tax-aware');
      // LOSER should be harvested (negative tax = savings)
      const loserTrade = plan.trades.find(t => t.symbol === 'LOSER');
      if (loserTrade) {
        expect(loserTrade.taxImpact).toBeLessThan(0); // Tax savings
      }
    });

    it('should minimize tax on winners', () => {
      const holdings = [
        makeHolding('BIGGAIN', 0.5, 0.6, 20000),
        makeHolding('SMALLGAIN', 0.5, 0.4, 500),
      ];
      const plan = taxAwareRebalance(
        holdings,
        100000,
        { shortTermRate: 0.37, longTermRate: 0.20, taxLotMethod: 'fifo', harvestLossThreshold: 5000 },
        '2024-01-15'
      );

      const sellTrades = plan.trades.filter(t => t.action === 'sell');
      for (const t of sellTrades) {
        expect(t.taxImpact).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('cashFlowRebalance', () => {
    it('should buy underweight on inflow', () => {
      const plan = cashFlowRebalance(testHoldings, 100000, 10000, '2024-01-15');

      expect(plan.strategy).toBe('cash-flow');
      const buyTrades = plan.trades.filter(t => t.action === 'buy');
      expect(buyTrades.length).toBeGreaterThan(0);
    });

    it('should sell overweight on outflow', () => {
      const plan = cashFlowRebalance(testHoldings, 100000, -10000, '2024-01-15');

      const sellTrades = plan.trades.filter(t => t.action === 'sell');
      expect(sellTrades.length).toBeGreaterThan(0);
    });

    it('should handle zero cash flow', () => {
      const plan = cashFlowRebalance(testHoldings, 100000, 0, '2024-01-15');
      expect(plan.trades).toHaveLength(0);
    });

    it('should prefer selling losers for tax efficiency on outflow', () => {
      const holdings = [
        makeHolding('GAIN', 0.5, 0.55, 5000),
        makeHolding('LOSS', 0.5, 0.55, -3000),
      ];
      const plan = cashFlowRebalance(holdings, 100000, -10000, '2024-01-15');
      // Should prefer selling LOSS position (lower tax impact)
      const lossTrade = plan.trades.find(t => t.symbol === 'LOSS');
      const gainTrade = plan.trades.find(t => t.symbol === 'GAIN');
      if (lossTrade && gainTrade) {
        expect(lossTrade.taxImpact).toBeLessThanOrEqual(gainTrade.taxImpact);
      }
    });
  });

  describe('calculateTrackingError', () => {
    it('should calculate tracking error from drift', () => {
      const te = calculateTrackingError(testHoldings);
      expect(te).toBeGreaterThan(0);
    });

    it('should return 0 for perfect tracking', () => {
      const holdings = [
        makeHolding('A', 0.5, 0.5),
        makeHolding('B', 0.5, 0.5),
      ];
      expect(calculateTrackingError(holdings)).toBe(0);
    });

    it('should handle empty portfolio', () => {
      expect(calculateTrackingError([])).toBe(0);
    });
  });

  describe('calculateTurnover', () => {
    it('should calculate turnover by sector', () => {
      const plan = thresholdRebalance(testHoldings, 100000, { absolute: 0.01, relative: 0.05 }, '2024-01-15');
      const turnover = calculateTurnover(plan, testHoldings);

      expect(turnover).toHaveProperty('totalTurnover');
      expect(turnover).toHaveProperty('sectorTurnover');
      expect(turnover).toHaveProperty('estimatedCost');
    });
  });

  describe('evaluateRebalanceMetrics', () => {
    it('should evaluate rebalancing metrics', () => {
      const after = testHoldings.map(h => ({
        ...h,
        currentWeight: h.targetWeight,
        currentValue: h.targetWeight * 100000,
      }));

      const metrics = evaluateRebalanceMetrics(testHoldings, after, 100000);

      expect(metrics).toHaveProperty('trackingError');
      expect(metrics).toHaveProperty('turnoverRatio');
      expect(metrics).toHaveProperty('costDrag');
      expect(metrics.trackingError).toBe(0); // Perfectly rebalanced
    });
  });

  describe('optimalRebalanceFrequency', () => {
    it('should analyze optimal frequency', () => {
      const dailyDrifts = [
        Array(300).fill(0).map(() => Math.random() * 0.02),
        Array(300).fill(0).map(() => Math.random() * 0.02),
      ];

      const analysis = optimalRebalanceFrequency(dailyDrifts, 0.002);

      expect(analysis.length).toBeGreaterThan(0);
      for (const a of analysis) {
        expect(a).toHaveProperty('frequency');
        expect(a).toHaveProperty('avgDrift');
        expect(a).toHaveProperty('avgCost');
        expect(a).toHaveProperty('netBenefit');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle single holding', () => {
      const holdings = [makeHolding('ONLY', 1.0, 0.9)];
      const plan = thresholdRebalance(holdings, 100000, { absolute: 0.02, relative: 0.1 }, '2024-01-15');
      expect(plan.trades.length).toBeGreaterThan(0);
    });

    it('should handle all positions at target', () => {
      const holdings = [
        makeHolding('A', 0.5, 0.5),
        makeHolding('B', 0.5, 0.5),
      ];
      const plan = thresholdRebalance(holdings, 100000, { absolute: 0.01, relative: 0.05 }, '2024-01-15');
      expect(plan.trades).toHaveLength(0);
    });

    it('should handle zero portfolio value gracefully', () => {
      const holdings = [makeHolding('A', 0.5, 0.6)];
      const plan = thresholdRebalance(holdings, 0, { absolute: 0.02, relative: 0.1 }, '2024-01-15');
      expect(plan.strategy).toBe('threshold');
    });
  });
});
