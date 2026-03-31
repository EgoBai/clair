import { describe, it, expect } from 'vitest';
import { analyzeMarginTrading, MarginData } from '../utils/marginTradingEngine';

describe('融资融券分析引擎', () => {
  const data: MarginData[] = [
    { date: '2026-03-25', marginBuy: 1000000, marginRepay: 800000, marginBalance: 150000000, shortSell: 50000, shortRepay: 40000, shortBalance: 5000000 },
    { date: '2026-03-26', marginBuy: 1200000, marginRepay: 900000, marginBalance: 150300000, shortSell: 60000, shortRepay: 50000, shortBalance: 5010000 },
    { date: '2026-03-27', marginBuy: 800000, marginRepay: 1000000, marginBalance: 150100000, shortSell: 40000, shortRepay: 30000, shortBalance: 5020000 },
    { date: '2026-03-28', marginBuy: 1500000, marginRepay: 700000, marginBalance: 150900000, shortSell: 70000, shortRepay: 60000, shortBalance: 5030000 },
    { date: '2026-03-31', marginBuy: 1300000, marginRepay: 1100000, marginBalance: 151100000, shortSell: 55000, shortRepay: 45000, shortBalance: 5040000 },
  ];

  describe('analyzeMarginTrading', () => {
    it('should calculate current balance', () => {
      const result = analyzeMarginTrading(data);
      expect(result.currentBalance).toBe(151100000);
    });

    it('should calculate balance change', () => {
      const result = analyzeMarginTrading(data);
      expect(result.balanceChange).toBe(200000);
    });

    it('should calculate net margin flow', () => {
      const result = analyzeMarginTrading(data);
      expect(typeof result.netMarginFlow).toBe('number');
    });

    it('should calculate short ratio', () => {
      const result = analyzeMarginTrading(data);
      expect(result.shortRatio).toBeGreaterThan(0);
      expect(result.shortRatio).toBeLessThan(1);
    });

    it('should determine trend', () => {
      const result = analyzeMarginTrading(data);
      expect(['increasing', 'decreasing', 'stable']).toContain(result.marginTrend);
    });

    it('should generate signal', () => {
      const result = analyzeMarginTrading(data);
      expect(['bullish', 'bearish', 'neutral']).toContain(result.signal);
    });

    it('should calculate daily flows', () => {
      const result = analyzeMarginTrading(data);
      expect(result.dailyFlows.length).toBe(5);
    });

    it('should handle empty data', () => {
      const result = analyzeMarginTrading([]);
      expect(result.currentBalance).toBe(0);
      expect(result.signal).toBe('neutral');
    });

    it('should detect warning signals', () => {
      const highShort: MarginData[] = [{
        ...data[0], shortBalance: 60000000, marginBalance: 100000000,
      }];
      const result = analyzeMarginTrading(highShort);
      expect(result.warningSignals.length).toBeGreaterThan(0);
    });
  });
});
