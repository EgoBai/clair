import { describe, it, expect } from 'vitest';
import {
  analyzeLargeOrders,
  identifyMainForceBehavior,
  analyzeVolumePrice,
  analyzeChipDistribution,
  generateFlowSnapshot,
  predictFlow,
  type TradeRecord,
  type CapitalFlowSnapshot,
} from '../utils/mainForceEngine';

function makeTrades(count = 50): TradeRecord[] {
  const trades: TradeRecord[] = [];
  for (let i = 0; i < count; i++) {
    trades.push({
      time: `10:${String(i % 60).padStart(2, '0')}`,
      price: 10 + (Math.random() - 0.5) * 0.5,
      volume: Math.floor(100 + Math.random() * 500),
      amount: 10000 + Math.random() * 200000,
      direction: Math.random() > 0.5 ? 'buy' : 'sell',
      isLargeOrder: Math.random() > 0.7,
    });
  }
  return trades;
}

describe('mainForceEngine', () => {
  describe('analyzeLargeOrders', () => {
    it('should count large orders', () => {
      const trades = makeTrades(100);
      const result = analyzeLargeOrders(trades);
      expect(result.totalLargeOrders).toBeGreaterThanOrEqual(0);
      expect(result.totalLargeOrders).toBeLessThanOrEqual(100);
    });

    it('should separate buy and sell large orders', () => {
      const trades = makeTrades(100);
      const result = analyzeLargeOrders(trades);
      expect(result.largeBuyOrders + result.largeSellOrders).toBeLessThanOrEqual(result.totalLargeOrders);
    });

    it('should calculate net large flow', () => {
      const trades = makeTrades(100);
      const result = analyzeLargeOrders(trades);
      expect(typeof result.netLargeFlow).toBe('number');
    });

    it('should identify pattern', () => {
      const trades = makeTrades(100);
      const result = analyzeLargeOrders(trades);
      expect(['accumulating', 'distributing', 'mixed', 'inactive']).toContain(result.largeOrderPattern);
    });

    it('should handle empty trades', () => {
      const result = analyzeLargeOrders([]);
      expect(result.totalLargeOrders).toBe(0);
    });

    it('should detect consecutive buys', () => {
      const trades: TradeRecord[] = Array.from({ length: 10 }, (_, i) => ({
        time: `10:${String(i).padStart(2, '0')}`,
        price: 10,
        volume: 1000,
        amount: 200000,
        direction: 'buy' as const,
        isLargeOrder: true,
      }));
      const result = analyzeLargeOrders(trades);
      expect(result.consecutiveBuyCount).toBe(10);
    });
  });

  describe('identifyMainForceBehavior', () => {
    it('should detect accumulation', () => {
      const trades: TradeRecord[] = Array.from({ length: 30 }, () => ({
        time: '10:00',
        price: 10,
        volume: 500,
        amount: 200000,
        direction: 'buy',
        isLargeOrder: true,
      }));
      const behaviors = identifyMainForceBehavior(trades, 0.01, 0.5, false, false);
      expect(behaviors.some(b => b.type === 'accumulation')).toBe(true);
    });

    it('should detect distribution', () => {
      const trades: TradeRecord[] = Array.from({ length: 30 }, () => ({
        time: '10:00',
        price: 10,
        volume: 500,
        amount: 200000,
        direction: 'sell',
        isLargeOrder: true,
      }));
      const behaviors = identifyMainForceBehavior(trades, -0.02, 0.5, false, false);
      expect(behaviors.some(b => b.type === 'distribution')).toBe(true);
    });

    it('should detect limit up seal', () => {
      const trades = makeTrades(20);
      const behaviors = identifyMainForceBehavior(trades, 0.1, 0.5, true, false);
      expect(behaviors.some(b => b.type === 'limit_up_seal')).toBe(true);
    });

    it('should detect limit down seal', () => {
      const trades = makeTrades(20);
      const behaviors = identifyMainForceBehavior(trades, -0.1, 0.5, false, true);
      expect(behaviors.some(b => b.type === 'limit_down_seal')).toBe(true);
    });

    it('should include implications', () => {
      const trades = makeTrades(20);
      const behaviors = identifyMainForceBehavior(trades, 0.01, 0.2, false, false);
      for (const b of behaviors) {
        expect(b.implications.length).toBeGreaterThan(0);
      }
    });

    it('should have signal type', () => {
      const trades = makeTrades(20);
      const behaviors = identifyMainForceBehavior(trades, 0.01, 0.2, false, false);
      for (const b of behaviors) {
        expect(['bullish', 'bearish', 'neutral']).toContain(b.signal);
      }
    });
  });

  describe('analyzeVolumePrice', () => {
    it('should identify volume up price up', () => {
      const result = analyzeVolumePrice(0.03, 0.5, 100000, 200000);
      expect(result.volumePriceRelation).toBe('volume_up_price_up');
    });

    it('should identify volume up price down', () => {
      const result = analyzeVolumePrice(-0.03, 0.5, 100000, 200000);
      expect(result.volumePriceRelation).toBe('volume_up_price_down');
    });

    it('should detect abnormality', () => {
      const result = analyzeVolumePrice(0.02, 3, 100000, 500000);
      expect(result.abnormality).toBe(true);
    });

    it('should provide implication', () => {
      const result = analyzeVolumePrice(0.02, 0.3, 100000, 150000);
      expect(result.implication.length).toBeGreaterThan(0);
    });

    it('should detect extreme low volume', () => {
      const result = analyzeVolumePrice(0.01, -0.8, 100000, 20000);
      expect(result.abnormality).toBe(true);
    });
  });

  describe('analyzeChipDistribution', () => {
    it('should calculate average cost', () => {
      const trades = makeTrades(100);
      const result = analyzeChipDistribution(trades, 10);
      expect(result.avgCost).toBeGreaterThan(0);
    });

    it('should calculate profitable ratio', () => {
      const trades = makeTrades(100);
      const result = analyzeChipDistribution(trades, 10);
      expect(result.profitableRatio).toBeGreaterThanOrEqual(0);
      expect(result.profitableRatio).toBeLessThanOrEqual(1);
    });

    it('should calculate pressure and support', () => {
      const trades = makeTrades(100);
      const result = analyzeChipDistribution(trades, 10);
      expect(result.pressureLevel + result.supportLevel).toBeCloseTo(1, 2);
    });

    it('should handle empty trades', () => {
      const result = analyzeChipDistribution([], 10);
      expect(result.avgCost).toBe(10);
    });
  });

  describe('generateFlowSnapshot', () => {
    it('should calculate main inflow and outflow', () => {
      const trades = makeTrades(50);
      const snapshot = generateFlowSnapshot(trades);
      expect(snapshot.mainInflow).toBeGreaterThanOrEqual(0);
      expect(snapshot.mainOutflow).toBeGreaterThanOrEqual(0);
    });

    it('should calculate net main flow', () => {
      const trades = makeTrades(50);
      const snapshot = generateFlowSnapshot(trades);
      expect(snapshot.netMainFlow).toBeCloseTo(snapshot.mainInflow - snapshot.mainOutflow, 1);
    });

    it('should calculate main activity', () => {
      const trades = makeTrades(50);
      const snapshot = generateFlowSnapshot(trades);
      expect(snapshot.mainActivity).toBeGreaterThanOrEqual(0);
      expect(snapshot.mainActivity).toBeLessThanOrEqual(1);
    });
  });

  describe('predictFlow', () => {
    it('should predict flow direction', () => {
      const snapshots: CapitalFlowSnapshot[] = [
        { time: '10:00', mainInflow: 500, mainOutflow: 300, retailInflow: 200, retailOutflow: 150, netMainFlow: 200, netRetailFlow: 50, mainActivity: 0.4 },
        { time: '11:00', mainInflow: 600, mainOutflow: 250, retailInflow: 200, retailOutflow: 150, netMainFlow: 350, netRetailFlow: 50, mainActivity: 0.45 },
      ];
      const result = predictFlow(snapshots, []);
      expect(['inflow', 'outflow', 'neutral']).toContain(result.direction);
    });

    it('should include confidence', () => {
      const snapshots: CapitalFlowSnapshot[] = [
        { time: '10:00', mainInflow: 500, mainOutflow: 300, retailInflow: 200, retailOutflow: 150, netMainFlow: 200, netRetailFlow: 50, mainActivity: 0.4 },
      ];
      const result = predictFlow(snapshots, []);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      const result = predictFlow([], []);
      expect(result.direction).toBe('neutral');
    });

    it('should include factors', () => {
      const snapshots: CapitalFlowSnapshot[] = [
        { time: '10:00', mainInflow: 500, mainOutflow: 300, retailInflow: 200, retailOutflow: 150, netMainFlow: 200, netRetailFlow: 50, mainActivity: 0.4 },
      ];
      const result = predictFlow(snapshots, []);
      expect(result.factors.length).toBeGreaterThan(0);
    });
  });
});
