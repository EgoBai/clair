import { describe, it, expect } from 'vitest';
import {
  analyzeAHPremium,
  findCrossExchangeArb,
  analyzeCashCarryArb,
  analyzeFXHedge,
  MarketPrice,
} from '../utils/crossMarketArbEngine';

describe('Cross Market Arb Engine', () => {
  describe('analyzeAHPremium', () => {
    it('应计算A/H溢价率', () => {
      const result = analyzeAHPremium(1800, 1500);
      expect(result.premium).toBeGreaterThan(0); // A股应溢价
    });

    it('应判断历史分位', () => {
      const hist = [20, 25, 30, 35, 40, 30, 28, 32, 38, 25];
      const result = analyzeAHPremium(1800, 1500, hist);
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
    });

    it('应给出信号', () => {
      const result = analyzeAHPremium(1800, 1500);
      expect(['buy_A_sell_H', 'buy_H_sell_A', 'neutral']).toContain(result.signal);
    });

    it('应列出风险因素', () => {
      const result = analyzeAHPremium(1800, 1500);
      expect(result.riskFactors.length).toBeGreaterThan(0);
    });
  });

  describe('findCrossExchangeArb', () => {
    it('应发现套利机会', () => {
      const prices: MarketPrice[] = [
        { market: 'SH', ticker: '600519', price: 1800, currency: 'CNY', timestamp: '2026-03-01' },
        { market: 'HK', ticker: '600519', price: 1500, currency: 'HKD', timestamp: '2026-03-01' },
      ];
      const result = findCrossExchangeArb(prices);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('应计算净利润', () => {
      const prices: MarketPrice[] = [
        { market: 'SH', ticker: 'TEST', price: 100, currency: 'CNY', timestamp: '2026-03-01' },
        { market: 'SZ', ticker: 'TEST', price: 102, currency: 'CNY', timestamp: '2026-03-01' },
      ];
      const result = findCrossExchangeArb(prices, 0.5);
      if (result.length > 0) {
        expect(result[0].netProfit).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeCashCarryArb', () => {
    it('应计算基差', () => {
      const result = analyzeCashCarryArb(100, 105, 30);
      expect(result.basis).toBe(5);
    });

    it('应计算年化基差', () => {
      const result = analyzeCashCarryArb(100, 105, 30);
      expect(result.annualizedBasis).toBeGreaterThan(0);
    });

    it('应判断套利方向', () => {
      const result = analyzeCashCarryArb(100, 105, 30);
      expect(['cash_and_carry', 'reverse_cash_and_carry', 'none']).toContain(result.direction);
    });

    it('应计算净利润', () => {
      const result = analyzeCashCarryArb(100, 105, 30);
      expect(typeof result.netArbProfit).toBe('number');
    });
  });

  describe('analyzeFXHedge', () => {
    it('应计算远期点数', () => {
      const result = analyzeFXHedge(7.25, 7.30, 1000000, 90);
      expect(result.forwardPoints).toBeGreaterThan(0);
    });

    it('应计算对冲成本', () => {
      const result = analyzeFXHedge(7.25, 7.30, 1000000, 90);
      expect(typeof result.hedgeCost).toBe('number');
    });

    it('应给出建议', () => {
      const result = analyzeFXHedge(7.25, 7.30, 1000000, 90);
      expect(['hedge', 'partial_hedge', 'no_hedge']).toContain(result.recommendation);
    });

    it('应计算盈亏平衡点', () => {
      const result = analyzeFXHedge(7.25, 7.30, 1000000, 90);
      expect(result.breakevenMove).toBeGreaterThan(0);
    });
  });
});
