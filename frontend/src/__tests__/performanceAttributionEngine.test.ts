import { describe, it, expect } from 'vitest';
import {
  brinsonAttribution,
  calculateRiskMetrics,
  analyzeTimingSkill,
  analyzeStyleAttribution,
} from '../utils/performanceAttributionEngine';

describe('performanceAttributionEngine', () => {
  describe('brinsonAttribution', () => {
    it('should calculate allocation, selection, interaction effects', () => {
      const portfolio = [
        { sector: '科技', weight: 0.4, return: 0.05 },
        { sector: '金融', weight: 0.3, return: 0.02 },
        { sector: '消费', weight: 0.3, return: 0.03 },
      ];
      const benchmark = [
        { sector: '科技', weight: 0.3, return: 0.04 },
        { sector: '金融', weight: 0.4, return: 0.02 },
        { sector: '消费', weight: 0.3, return: 0.03 },
      ];
      const result = brinsonAttribution(portfolio, benchmark);
      expect(typeof result.allocationEffect).toBe('number');
      expect(typeof result.selectionEffect).toBe('number');
      expect(typeof result.interactionEffect).toBe('number');
    });

    it('should breakdown by sector', () => {
      const portfolio = [{ sector: '科技', weight: 0.5, return: 0.05 }];
      const benchmark = [{ sector: '科技', weight: 0.5, return: 0.04 }];
      const result = brinsonAttribution(portfolio, benchmark);
      expect(result.sectorBreakdown.length).toBe(1);
      expect(result.sectorBreakdown[0].sector).toBe('科技');
    });

    it('should sum to total active return', () => {
      const portfolio = [
        { sector: 'A', weight: 0.6, return: 0.03 },
        { sector: 'B', weight: 0.4, return: 0.01 },
      ];
      const benchmark = [
        { sector: 'A', weight: 0.5, return: 0.02 },
        { sector: 'B', weight: 0.5, return: 0.015 },
      ];
      const result = brinsonAttribution(portfolio, benchmark);
      expect(result.allocationEffect + result.selectionEffect + result.interactionEffect)
        .toBeCloseTo(result.totalActiveReturn, 6);
    });
  });

  describe('calculateRiskMetrics', () => {
    it('should calculate total risk', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.48) * 0.02);
      const benchmark = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.015);
      const result = calculateRiskMetrics(returns, benchmark);
      expect(result.totalRisk).toBeGreaterThan(0);
    });

    it('should calculate beta', () => {
      const returns = [0.01, 0.02, -0.01, 0.015, -0.005];
      const benchmark = [0.008, 0.015, -0.008, 0.012, -0.003];
      const result = calculateRiskMetrics(returns, benchmark);
      expect(typeof result.beta).toBe('number');
    });

    it('should calculate sharpe ratio', () => {
      const returns = Array.from({ length: 50 }, () => 0.001 + (Math.random() - 0.5) * 0.01);
      const benchmark = Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.01);
      const result = calculateRiskMetrics(returns, benchmark);
      expect(typeof result.sharpeRatio).toBe('number');
    });

    it('should calculate max drawdown', () => {
      const returns = [0.05, 0.03, -0.08, -0.05, 0.02, 0.04];
      const benchmark = [0.02, 0.01, -0.03, -0.02, 0.01, 0.02];
      const result = calculateRiskMetrics(returns, benchmark);
      expect(result.maxDrawdown).toBeGreaterThan(0);
    });

    it('should handle insufficient data', () => {
      const result = calculateRiskMetrics([0.01], [0.01]);
      expect(result.totalRisk).toBe(0);
    });
  });

  describe('analyzeTimingSkill', () => {
    it('should calculate capture ratios', () => {
      const returns = [0.02, 0.01, -0.01, 0.015, -0.005];
      const benchmark = [0.015, 0.008, -0.008, 0.01, -0.003];
      const result = analyzeTimingSkill(returns, benchmark);
      expect(typeof result.upCapture).toBe('number');
      expect(typeof result.downCapture).toBe('number');
    });

    it('should calculate win rate', () => {
      const returns = [0.01, 0.02, -0.01, 0.01, 0.005];
      const benchmark = [0.01, 0.01, -0.01, 0.01, 0.005];
      const result = analyzeTimingSkill(returns, benchmark);
      expect(result.winRate).toBeGreaterThan(0);
    });

    it('should score timing and stock picking', () => {
      const returns = Array.from({ length: 50 }, () => 0.001 + Math.random() * 0.01);
      const benchmark = Array.from({ length: 50 }, () => Math.random() * 0.008);
      const result = analyzeTimingSkill(returns, benchmark);
      expect(result.timingScore).toBeGreaterThanOrEqual(0);
      expect(result.stockPickingScore).toBeGreaterThanOrEqual(0);
    });

    it('should calculate profit factor', () => {
      const returns = [0.02, 0.01, -0.005, 0.015, -0.003];
      const benchmark = [0.01, 0.008, -0.004, 0.01, -0.002];
      const result = analyzeTimingSkill(returns, benchmark);
      expect(result.profitFactor).toBeGreaterThan(0);
    });
  });

  describe('analyzeStyleAttribution', () => {
    it('should calculate factor exposures', () => {
      const holdings = [
        { code: '001', weight: 0.5, return: 0.03, marketCap: 1e10, pe: 15, momentum: 0.1 },
        { code: '002', weight: 0.5, return: 0.02, marketCap: 5e9, pe: 25, momentum: 0.05 },
      ];
      const result = analyzeStyleAttribution(holdings);
      expect(typeof result.sizeExposure).toBe('number');
      expect(typeof result.valueExposure).toBe('number');
    });

    it('should identify dominant style', () => {
      const holdings = [
        { code: '001', weight: 0.5, return: 0.03, marketCap: 1e12, pe: 10, momentum: 0.1 },
      ];
      const result = analyzeStyleAttribution(holdings);
      expect(result.dominantStyle.length).toBeGreaterThan(0);
    });

    it('should include style returns', () => {
      const holdings = [
        { code: '001', weight: 0.5, return: 0.03, marketCap: 1e10, pe: 15, momentum: 0.1 },
      ];
      const result = analyzeStyleAttribution(holdings);
      expect(result.styleReturns.length).toBeGreaterThan(0);
    });
  });
});
