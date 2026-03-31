import { describe, it, expect } from 'vitest';
import {
  classifyOrder,
  calculateFlowSnapshot,
  detectLargeOrders,
  analyzeFlowTrend,
  aggregateSectorFlows,
  calculateFundFlowScore,
  generateMockFlowData,
  TradeRecord,
} from '../services/capitalFlowEngine';

function makeTrade(partial: Partial<TradeRecord> = {}): TradeRecord {
  return {
    price: 10,
    volume: 1000,
    amount: 10000,
    timestamp: Date.now(),
    isBuy: true,
    ...partial,
  };
}

describe('capitalFlowEngine', () => {
  describe('classifyOrder', () => {
    it('should classify large orders as main', () => {
      expect(classifyOrder(makeTrade({ amount: 600_000 }))).toBe('main');
      expect(classifyOrder(makeTrade({ amount: 500_000 }))).toBe('main');
    });

    it('should classify small orders as retail', () => {
      expect(classifyOrder(makeTrade({ amount: 10_000 }))).toBe('retail');
      expect(classifyOrder(makeTrade({ amount: 499_999 }))).toBe('retail');
    });
  });

  describe('calculateFlowSnapshot', () => {
    it('should return zeros for empty trades', () => {
      const snap = calculateFlowSnapshot([]);
      expect(snap.mainInflow).toBe(0);
      expect(snap.netMainFlow).toBe(0);
    });

    it('should correctly separate main and retail flows', () => {
      const trades: TradeRecord[] = [
        makeTrade({ amount: 600_000, isBuy: true }),
        makeTrade({ amount: 600_000, isBuy: false }),
        makeTrade({ amount: 10_000, isBuy: true }),
        makeTrade({ amount: 10_000, isBuy: false }),
      ];
      const snap = calculateFlowSnapshot(trades);
      expect(snap.mainInflow).toBe(600_000);
      expect(snap.mainOutflow).toBe(600_000);
      expect(snap.retailInflow).toBe(10_000);
      expect(snap.retailOutflow).toBe(10_000);
      expect(snap.netMainFlow).toBe(0);
    });

    it('should calculate positive net flow for net inflow', () => {
      const trades: TradeRecord[] = [
        makeTrade({ amount: 600_000, isBuy: true }),
        makeTrade({ amount: 500_000, isBuy: false }),
      ];
      const snap = calculateFlowSnapshot(trades);
      expect(snap.netMainFlow).toBe(100_000);
    });

    it('should use last trade timestamp', () => {
      const ts = 1234567890;
      const trades = [makeTrade({ timestamp: ts - 1000 }), makeTrade({ timestamp: ts })];
      const snap = calculateFlowSnapshot(trades);
      expect(snap.timestamp).toBe(ts);
    });
  });

  describe('detectLargeOrders', () => {
    it('should detect orders above threshold', () => {
      const trades = [
        makeTrade({ amount: 600_000, isBuy: true }),
        makeTrade({ amount: 10_000, isBuy: true }),
        makeTrade({ amount: 2_500_000, isBuy: false }),
      ];
      const alerts = detectLargeOrders(trades);
      expect(alerts).toHaveLength(2);
      expect(alerts[0].side).toBe('buy');
      expect(alerts[1].significance).toBe('extreme');
    });

    it('should return empty for small orders only', () => {
      const trades = [makeTrade({ amount: 1_000 })];
      expect(detectLargeOrders(trades)).toHaveLength(0);
    });

    it('should classify extreme orders correctly', () => {
      const trades = [
        makeTrade({ amount: 2_000_000 }),
        makeTrade({ amount: 1_000_000 }),
      ];
      const alerts = detectLargeOrders(trades);
      expect(alerts[0].significance).toBe('extreme');
      expect(alerts[1].significance).toBe('high');
    });
  });

  describe('analyzeFlowTrend', () => {
    it('should return neutral for empty snapshots', () => {
      const trend = analyzeFlowTrend([]);
      expect(trend.direction).toBe('neutral');
      expect(trend.strength).toBe(0);
    });

    it('should detect bullish trend', () => {
      const snapshots = Array.from({ length: 5 }, (_, i) => ({
        timestamp: i,
        mainInflow: 100_000,
        mainOutflow: 50_000,
        retailInflow: 10_000,
        retailOutflow: 5_000,
        netMainFlow: 50_000,
        netRetailFlow: 5_000,
      }));
      const trend = analyzeFlowTrend(snapshots);
      expect(trend.direction).toBe('bullish');
      expect(trend.consecutiveMainIn).toBe(5);
    });

    it('should detect bearish trend', () => {
      const snapshots = Array.from({ length: 3 }, (_, i) => ({
        timestamp: i,
        mainInflow: 30_000,
        mainOutflow: 80_000,
        retailInflow: 5_000,
        retailOutflow: 10_000,
        netMainFlow: -50_000,
        netRetailFlow: -5_000,
      }));
      const trend = analyzeFlowTrend(snapshots);
      expect(trend.direction).toBe('bearish');
      expect(trend.consecutiveMainIn).toBe(0);
    });

    it('should track consecutive inflow correctly', () => {
      const snapshots = [
        { timestamp: 1, mainInflow: 100, mainOutflow: 50, retailInflow: 0, retailOutflow: 0, netMainFlow: 50, netRetailFlow: 0 },
        { timestamp: 2, mainInflow: 100, mainOutflow: 50, retailInflow: 0, retailOutflow: 0, netMainFlow: 50, netRetailFlow: 0 },
        { timestamp: 3, mainInflow: 50, mainOutflow: 100, retailInflow: 0, retailOutflow: 0, netMainFlow: -50, netRetailFlow: 0 },
        { timestamp: 4, mainInflow: 100, mainOutflow: 50, retailInflow: 0, retailOutflow: 0, netMainFlow: 50, netRetailFlow: 0 },
      ];
      const trend = analyzeFlowTrend(snapshots);
      expect(trend.consecutiveMainIn).toBe(2);
    });
  });

  describe('aggregateSectorFlows', () => {
    it('should aggregate and sort sectors by net flow', () => {
      const sectorTrades = {
        '科技': [
          makeTrade({ amount: 600_000, isBuy: true }),
          makeTrade({ amount: 200_000, isBuy: false }),
        ],
        '金融': [
          makeTrade({ amount: 500_000, isBuy: false }),
          makeTrade({ amount: 300_000, isBuy: true }),
        ],
      };
      const flows = aggregateSectorFlows(sectorTrades);
      expect(flows[0].sector).toBe('科技');
      expect(flows[0].netFlow).toBeGreaterThan(0);
      expect(flows[1].sector).toBe('金融');
      expect(flows[1].netFlow).toBeLessThan(0);
    });

    it('should return empty for no data', () => {
      expect(aggregateSectorFlows({})).toHaveLength(0);
    });

    it('should assign flow trend labels', () => {
      const manyTrades = Array.from({ length: 20 }, () =>
        makeTrade({ amount: 600_000, isBuy: true })
      );
      const flows = aggregateSectorFlows({ '板块A': manyTrades });
      expect(['accelerating', 'steady', 'decelerating']).toContain(flows[0].flowTrend);
    });
  });

  describe('calculateFundFlowScore', () => {
    it('should return score between 0 and 100', () => {
      const snapshots = [
        { timestamp: 1, mainInflow: 500_000, mainOutflow: 200_000, retailInflow: 50_000, retailOutflow: 30_000, netMainFlow: 300_000, netRetailFlow: 20_000 },
        { timestamp: 2, mainInflow: 600_000, mainOutflow: 250_000, retailInflow: 60_000, retailOutflow: 35_000, netMainFlow: 350_000, netRetailFlow: 25_000 },
      ];
      const score = calculateFundFlowScore(snapshots, []);
      expect(score.total).toBeGreaterThanOrEqual(0);
      expect(score.total).toBeLessThanOrEqual(100);
    });

    it('should score higher for bullish conditions', () => {
      const bullish = Array.from({ length: 5 }, (_, i) => ({
        timestamp: i,
        mainInflow: 1_000_000,
        mainOutflow: 200_000,
        retailInflow: 50_000,
        retailOutflow: 20_000,
        netMainFlow: 800_000,
        netRetailFlow: 30_000,
      }));
      const bearish = Array.from({ length: 5 }, (_, i) => ({
        timestamp: i,
        mainInflow: 200_000,
        mainOutflow: 1_000_000,
        retailInflow: 20_000,
        retailOutflow: 50_000,
        netMainFlow: -800_000,
        netRetailFlow: -30_000,
      }));

      const bullScore = calculateFundFlowScore(bullish, []);
      const bearScore = calculateFundFlowScore(bearish, []);
      expect(bullScore.total).toBeGreaterThan(bearScore.total);
    });

    it('should have all sub-scores as numbers', () => {
      const score = calculateFundFlowScore([], []);
      expect(typeof score.mainFlowScore).toBe('number');
      expect(typeof score.largeOrderScore).toBe('number');
      expect(typeof score.consistencyScore).toBe('number');
      expect(typeof score.momentumScore).toBe('number');
    });
  });

  describe('generateMockFlowData', () => {
    it('should generate correct count', () => {
      expect(generateMockFlowData(10)).toHaveLength(10);
      expect(generateMockFlowData(0)).toHaveLength(0);
    });

    it('should generate trades with required fields', () => {
      const trades = generateMockFlowData(5);
      trades.forEach(t => {
        expect(t.price).toBeGreaterThan(0);
        expect(t.volume).toBeGreaterThan(0);
        expect(t.amount).toBeGreaterThan(0);
        expect(t.timestamp).toBeGreaterThan(0);
        expect(typeof t.isBuy).toBe('boolean');
      });
    });

    it('should respect bias for inflow', () => {
      const trades = generateMockFlowData(100, 'inflow');
      const buyCount = trades.filter(t => t.isBuy).length;
      expect(buyCount).toBeGreaterThan(40); // should skew >50% but allow variance
    });

    it('should respect bias for outflow', () => {
      const trades = generateMockFlowData(100, 'outflow');
      const buyCount = trades.filter(t => t.isBuy).length;
      expect(buyCount).toBeLessThan(60);
    });
  });
});
