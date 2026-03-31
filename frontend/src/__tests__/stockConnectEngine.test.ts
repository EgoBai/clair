import { describe, it, expect } from 'vitest';
import {
  analyzeFlowDirection,
  analyzeNorthboundHoldings,
  analyzeFlowStyle,
  type StockConnectFlow,
  type NorthboundHoldings,
} from '../utils/stockConnectEngine';

function makeFlows(count = 10): StockConnectFlow[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2025-03-${String(i + 1).padStart(2, '0')}`,
    northbound: {
      netBuy: (Math.random() - 0.4) * 1e8,
      buyAmount: 5e8 + Math.random() * 2e8,
      sellAmount: 4e8 + Math.random() * 2e8,
      topBuy: [{ code: '000001', amount: 1e7 }],
      topSell: [{ code: '000002', amount: 5e6 }],
    },
    southbound: {
      netBuy: (Math.random() - 0.5) * 5e7,
      buyAmount: 3e8,
      sellAmount: 2.5e8,
      topBuy: [{ code: '00700', amount: 5e6 }],
    },
  }));
}

describe('stockConnectEngine', () => {
  describe('analyzeFlowDirection', () => {
    it('should calculate total net inflow', () => {
      const flows = makeFlows(10);
      const result = analyzeFlowDirection(flows);
      expect(typeof result.totalNetInflow).toBe('number');
    });

    it('should determine flow trend', () => {
      const flows = makeFlows(20);
      const result = analyzeFlowDirection(flows);
      expect(['accelerating_in', 'steady_in', 'steady_out', 'accelerating_out', 'volatile']).toContain(result.flowTrend);
    });

    it('should build cumulative flow', () => {
      const flows = makeFlows(10);
      const result = analyzeFlowDirection(flows);
      expect(result.cumulativeFlow.length).toBe(10);
    });

    it('should identify anomaly days', () => {
      const flows = makeFlows(10);
      const result = analyzeFlowDirection(flows);
      expect(Array.isArray(result.anomalyDays)).toBe(true);
    });

    it('should handle empty data', () => {
      const result = analyzeFlowDirection([]);
      expect(result.totalNetInflow).toBe(0);
    });

    it('should include period string', () => {
      const flows = makeFlows(5);
      const result = analyzeFlowDirection(flows);
      expect(result.period).toContain('~');
    });
  });

  describe('analyzeNorthboundHoldings', () => {
    it('should generate signals', () => {
      const holdings: NorthboundHoldings[] = [
        { code: '000001', name: '平安银行', shares: 1e8, marketValue: 1e9, ratioToFloat: 0.05, changeFromYesterday: 1e6, consecutiveDays: 7 },
      ];
      const signals = analyzeNorthboundHoldings(holdings);
      expect(signals.length).toBe(1);
      expect(['strong_buy', 'buy', 'hold', 'reduce', 'sell']).toContain(signals[0].signal);
    });

    it('should detect increasing trend', () => {
      const holdings: NorthboundHoldings[] = [
        { code: '001', name: 'A', shares: 1e8, marketValue: 1e9, ratioToFloat: 0.06, changeFromYesterday: 1e6, consecutiveDays: 8 },
      ];
      const signals = analyzeNorthboundHoldings(holdings);
      expect(signals[0].northboundTrend).toBe('increasing');
    });

    it('should sort by value score', () => {
      const holdings: NorthboundHoldings[] = [
        { code: '001', name: 'A', shares: 1e7, marketValue: 1e8, ratioToFloat: 0.01, changeFromYesterday: 0, consecutiveDays: 1 },
        { code: '002', name: 'B', shares: 1e8, marketValue: 1e9, ratioToFloat: 0.08, changeFromYesterday: 1e6, consecutiveDays: 10 },
      ];
      const signals = analyzeNorthboundHoldings(holdings);
      expect(signals[0].valueScore).toBeGreaterThanOrEqual(signals[1].valueScore);
    });

    it('should include reasoning', () => {
      const holdings: NorthboundHoldings[] = [
        { code: '001', name: 'A', shares: 1e8, marketValue: 1e9, ratioToFloat: 0.05, changeFromYesterday: 1e6, consecutiveDays: 6 },
      ];
      const signals = analyzeNorthboundHoldings(holdings);
      expect(signals[0].reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeFlowStyle', () => {
    it('should analyze style preference', () => {
      const holdings: NorthboundHoldings[] = [
        { code: '001', name: '大盘', shares: 1e8, marketValue: 2e9, ratioToFloat: 0.05, changeFromYesterday: 1e6, consecutiveDays: 3 },
        { code: '002', name: '小盘', shares: 1e7, marketValue: 5e8, ratioToFloat: 0.03, changeFromYesterday: -5e5, consecutiveDays: -1 },
      ];
      const result = analyzeFlowStyle(holdings);
      expect(result.largeCapRatio).toBeGreaterThan(0);
      expect(['大盘价值', '中小盘成长']).toContain(result.stylePreference);
    });
  });
});
