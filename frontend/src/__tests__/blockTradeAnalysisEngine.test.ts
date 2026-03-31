import { describe, it, expect } from 'vitest';
import {
  analyzeBlockTrade,
  aggregateBlockTrades,
  detectBlockTradeAnomalies,
  type BlockTrade,
} from '../utils/blockTradeAnalysisEngine';

function makeTrade(overrides: Partial<BlockTrade> = {}): BlockTrade {
  return {
    date: '2025-03-15',
    code: '000001.SZ',
    name: '平安银行',
    price: 10.5,
    closePrice: 11,
    volume: 100,
    amount: 1050,
    buyer: '机构专用',
    seller: '中信证券上海',
    ...overrides,
  };
}

describe('blockTradeAnalysisEngine', () => {
  describe('analyzeBlockTrade', () => {
    it('should calculate discount', () => {
      const result = analyzeBlockTrade(makeTrade({ price: 10, closePrice: 11 }));
      expect(result.avgDiscount).toBeLessThan(0);
    });

    it('should detect premium', () => {
      const result = analyzeBlockTrade(makeTrade({ price: 12, closePrice: 11 }));
      expect(result.premiumCount).toBe(1);
    });

    it('should identify institution buyer', () => {
      const result = analyzeBlockTrade(makeTrade({ buyer: '机构专用' }));
      expect(result.buyerPattern).toBe('institution');
    });

    it('should identify hot money buyer', () => {
      const result = analyzeBlockTrade(makeTrade({ buyer: '东方财富拉萨团结路' }));
      expect(result.buyerPattern).toBe('hot_money');
    });

    it('should detect accumulation intent', () => {
      const result = analyzeBlockTrade(makeTrade({ buyer: '机构专用', price: 10, closePrice: 11 }));
      expect(result.intentSignal).toBe('accumulation');
    });

    it('should assess risk level', () => {
      const highRisk = analyzeBlockTrade(makeTrade({ price: 9, closePrice: 11 }));
      expect(highRisk.riskLevel).toBe('high');
    });

    it('should include implication', () => {
      const result = analyzeBlockTrade(makeTrade());
      expect(result.implication.length).toBeGreaterThan(0);
    });
  });

  describe('aggregateBlockTrades', () => {
    it('should aggregate total amount', () => {
      const trades = [makeTrade({ amount: 1000 }), makeTrade({ amount: 2000 })];
      const result = aggregateBlockTrades(trades);
      expect(result.totalAmount).toBe(3000);
    });

    it('should rank top buyers', () => {
      const trades = [
        makeTrade({ buyer: '机构专用', amount: 5000 }),
        makeTrade({ buyer: '机构专用', amount: 3000 }),
        makeTrade({ buyer: '中信上海', amount: 1000 }),
      ];
      const result = aggregateBlockTrades(trades);
      expect(result.topBuyers[0].name).toBe('机构专用');
      expect(result.topBuyers[0].amount).toBe(8000);
    });

    it('should detect anomaly trades', () => {
      const trades = [makeTrade({ price: 9, closePrice: 11, amount: 15000 })];
      const result = aggregateBlockTrades(trades);
      expect(result.anomalyTrades.length).toBe(1);
    });

    it('should handle empty data', () => {
      const result = aggregateBlockTrades([]);
      expect(result.totalTrades).toBe(0);
    });
  });

  describe('detectBlockTradeAnomalies', () => {
    it('should warn on consecutive trades', () => {
      const trades = Array.from({ length: 5 }, () => makeTrade());
      const warnings = detectBlockTradeAnomalies(trades);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should warn on extreme discount', () => {
      const trades = [makeTrade({ price: 9, closePrice: 11 })];
      const warnings = detectBlockTradeAnomalies(trades);
      expect(warnings.some(w => w.includes('折价'))).toBe(true);
    });

    it('should warn on high institutional activity', () => {
      const trades = Array.from({ length: 10 }, () => makeTrade({ buyer: '机构专用' }));
      const warnings = detectBlockTradeAnomalies(trades);
      expect(warnings.some(w => w.includes('机构'))).toBe(true);
    });
  });
});
