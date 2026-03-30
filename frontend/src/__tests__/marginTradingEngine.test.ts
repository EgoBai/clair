import { describe, it, expect } from 'vitest';
import {
  summarizeMarginMarket,
  generateMarginSignals,
  analyzeStockMargin,
  marginHeatRanking,
  type MarginData,
  type StockMarginData,
} from '../utils/marginTradingEngine';

describe('MarginTradingEngine', () => {
  const mockMarginData: MarginData[] = Array.from({ length: 30 }, (_, i) => ({
    date: `2024-01-${String(30 - i).padStart(2, '0')}`,
    融资余额: 1.5e12 + i * 1e10,
    融资买入额: 5e10 + Math.random() * 1e10,
    融资偿还额: 4.5e10 + Math.random() * 1e10,
    融券余量: 1e8 + i * 1e6,
    融券卖出量: 5e6,
    融券偿还量: 4e6,
    融资融券余额: 1.5e12 + i * 1e10 + 1e8,
  }));

  describe('summarizeMarginMarket', () => {
    it('should return current balance', () => {
      const result = summarizeMarginMarket(mockMarginData);
      expect(result.currentBalance).toBeGreaterThan(0);
    });

    it('should calculate week change', () => {
      const result = summarizeMarginMarket(mockMarginData);
      expect(typeof result.weekChange).toBe('number');
    });

    it('should calculate month change', () => {
      const result = summarizeMarginMarket(mockMarginData);
      expect(typeof result.monthChange).toBe('number');
    });

    it('should determine trend', () => {
      const result = summarizeMarginMarket(mockMarginData);
      expect(['rising', 'falling', 'stable']).toContain(result.balanceTrend);
    });

    it('should calculate daily net buy', () => {
      const result = summarizeMarginMarket(mockMarginData);
      expect(typeof result.dailyNetBuy).toBe('number');
    });

    it('should calculate leverage ratio', () => {
      const result = summarizeMarginMarket(mockMarginData);
      expect(result.leverageRatio).toBeGreaterThanOrEqual(0);
      expect(result.leverageRatio).toBeLessThanOrEqual(1);
    });

    it('should assess risk level', () => {
      const result = summarizeMarginMarket(mockMarginData);
      expect(['low', 'medium', 'high', 'extreme']).toContain(result.riskLevel);
    });

    it('should handle empty data', () => {
      const result = summarizeMarginMarket([]);
      expect(result.currentBalance).toBe(0);
      expect(result.riskLevel).toBe('low');
    });

    it('should assign extreme risk for very high balance', () => {
      const extreme: MarginData[] = [
        {
          date: '2024-01-01',
          融资余额: 2e12,
          融资买入额: 5e10,
          融资偿还额: 4e10,
          融券余量: 1e8,
          融券卖出量: 1e6,
          融券偿还量: 1e6,
          融资融券余额: 2e12 + 1e8,
        },
      ];
      const result = summarizeMarginMarket(extreme);
      expect(result.riskLevel).toBe('extreme');
    });

    it('should handle single entry', () => {
      const result = summarizeMarginMarket([mockMarginData[0]]);
      expect(result.currentBalance).toBeGreaterThan(0);
    });

    it('should round values', () => {
      const result = summarizeMarginMarket(mockMarginData);
      expect(result.currentBalance).toBe(Math.round(result.currentBalance));
    });
  });

  describe('generateMarginSignals', () => {
    it('should generate bullish signal for rising balance', () => {
      const summary = {
        currentBalance: 1.6e12,
        weekChange: 6e10,
        monthChange: 1e11,
        balanceTrend: 'rising' as const,
        dailyNetBuy: 1e10,
        avgDailyBuy: 5e9,
        leverageRatio: 0.98,
        riskLevel: 'medium' as const,
      };
      const signals = generateMarginSignals(summary);
      expect(signals.some((s) => s.type === 'bullish')).toBe(true);
    });

    it('should generate bearish signal for falling balance', () => {
      const summary = {
        currentBalance: 1.4e12,
        weekChange: -6e10,
        monthChange: -1e11,
        balanceTrend: 'falling' as const,
        dailyNetBuy: -1e10,
        avgDailyBuy: 5e9,
        leverageRatio: 0.97,
        riskLevel: 'medium' as const,
      };
      const signals = generateMarginSignals(summary);
      expect(signals.some((s) => s.type === 'bearish')).toBe(true);
    });

    it('should generate warning for extreme risk', () => {
      const summary = {
        currentBalance: 1.9e12,
        weekChange: 1e10,
        monthChange: 2e10,
        balanceTrend: 'rising' as const,
        dailyNetBuy: 1e9,
        avgDailyBuy: 5e9,
        leverageRatio: 0.99,
        riskLevel: 'extreme' as const,
      };
      const signals = generateMarginSignals(summary);
      expect(signals.some((s) => s.type === 'warning')).toBe(true);
    });

    it('should generate warning for high risk', () => {
      const summary = {
        currentBalance: 1.6e12,
        weekChange: 1e9,
        monthChange: 2e9,
        balanceTrend: 'stable' as const,
        dailyNetBuy: 1e9,
        avgDailyBuy: 5e9,
        leverageRatio: 0.98,
        riskLevel: 'high' as const,
      };
      const signals = generateMarginSignals(summary);
      expect(signals.some((s) => s.type === 'warning')).toBe(true);
    });

    it('should generate neutral signal for stable market', () => {
      const summary = {
        currentBalance: 1.2e12,
        weekChange: 1e8,
        monthChange: 2e8,
        balanceTrend: 'stable' as const,
        dailyNetBuy: 5e9,
        avgDailyBuy: 5e9,
        leverageRatio: 0.97,
        riskLevel: 'medium' as const,
      };
      const signals = generateMarginSignals(summary);
      expect(signals.length).toBeGreaterThanOrEqual(1);
    });

    it('should assign strength between 0 and 100', () => {
      const summary = {
        currentBalance: 1.5e12,
        weekChange: 3e10,
        monthChange: 5e10,
        balanceTrend: 'rising' as const,
        dailyNetBuy: 1e10,
        avgDailyBuy: 5e9,
        leverageRatio: 0.98,
        riskLevel: 'medium' as const,
      };
      const signals = generateMarginSignals(summary);
      for (const s of signals) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });

    it('should include message in every signal', () => {
      const summary = {
        currentBalance: 1.5e12,
        weekChange: 3e10,
        monthChange: 5e10,
        balanceTrend: 'rising' as const,
        dailyNetBuy: 1e10,
        avgDailyBuy: 5e9,
        leverageRatio: 0.98,
        riskLevel: 'medium' as const,
      };
      const signals = generateMarginSignals(summary);
      for (const s of signals) {
        expect(s.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeStockMargin', () => {
    const stockData: StockMarginData[] = [
      { ticker: '600519', name: '茅台', marginBalance: 2e10, shortBalance: 1e7, marginRatio: 0.05, shortRatio: 0.001, netMargin: 1e9, fiveDayTrend: 2 },
      { ticker: '000858', name: '五粮液', marginBalance: 1.5e10, shortBalance: 5e7, marginRatio: 0.12, shortRatio: 0.03, netMargin: 5e8, fiveDayTrend: -25 },
      { ticker: '300750', name: '宁德', marginBalance: 1e10, shortBalance: 2e8, marginRatio: 0.03, shortRatio: 0.025, netMargin: 3e8, fiveDayTrend: 1 },
    ];

    it('should identify high margin stocks', () => {
      const result = analyzeStockMargin(stockData, 0.03);
      expect(result.highMargin.length).toBeGreaterThan(0);
    });

    it('should identify high short stocks', () => {
      const result = analyzeStockMargin(stockData, 0.03);
      expect(result.highShort.length).toBeGreaterThan(0);
    });

    it('should generate warnings for high margin ratio', () => {
      const result = analyzeStockMargin(stockData, 0.03);
      expect(result.warnings.some((w) => w.message.includes('杠杆过高'))).toBe(true);
    });

    it('should generate warnings for sharp margin decline', () => {
      const result = analyzeStockMargin(stockData, 0.03);
      expect(result.warnings.some((w) => w.message.includes('下降'))).toBe(true);
    });

    it('should handle empty stock data', () => {
      const result = analyzeStockMargin([], 0.03);
      expect(result.highMargin).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('marginHeatRanking', () => {
    const stockData: StockMarginData[] = [
      { ticker: '600519', name: '茅台', marginBalance: 2e10, shortBalance: 1e7, marginRatio: 0.05, shortRatio: 0.001, netMargin: 1e9, fiveDayTrend: 5 },
      { ticker: '000858', name: '五粮液', marginBalance: 1.5e10, shortBalance: 5e7, marginRatio: 0.08, shortRatio: 0.01, netMargin: 5e8, fiveDayTrend: -3 },
      { ticker: '300750', name: '宁德', marginBalance: 5e9, shortBalance: 2e8, marginRatio: 0.03, shortRatio: 0.025, netMargin: 3e8, fiveDayTrend: 8 },
    ];

    it('should rank stocks by heat score', () => {
      const result = marginHeatRanking(stockData);
      expect(result).toHaveLength(3);
      expect(result[0].rank).toBe(1);
    });

    it('should sort by heat score descending', () => {
      const result = marginHeatRanking(stockData);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].heatScore).toBeGreaterThanOrEqual(result[i].heatScore);
      }
    });

    it('should include ticker and name', () => {
      const result = marginHeatRanking(stockData);
      for (const r of result) {
        expect(r.ticker).toBeDefined();
        expect(r.name).toBeDefined();
      }
    });

    it('should cap heat score at 100', () => {
      const result = marginHeatRanking(stockData);
      for (const r of result) {
        expect(r.heatScore).toBeLessThanOrEqual(100);
      }
    });

    it('should handle single stock', () => {
      const result = marginHeatRanking([stockData[0]]);
      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
    });

    it('should handle empty data', () => {
      const result = marginHeatRanking([]);
      expect(result).toHaveLength(0);
    });
  });
});
