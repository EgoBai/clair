import { describe, it, expect } from 'vitest';
import { EarningsQualityEngine, type EarningsData } from '../utils/earningsQualityEngine';

describe('EarningsQualityEngine', () => {
  const engine = new EarningsQualityEngine();

  const qualityEarnings: EarningsData = {
    revenue: 1000000,
    netIncome: 150000,
    operatingCashFlow: 180000,
    accountsReceivable: 100000,
    inventory: 50000,
    totalAssets: 2000000,
    revenueGrowth: 15,
    earningsGrowth: 20,
    grossMargin: 45,
    operatingMargin: 20,
    accrualsRatio: 0.03,
  };

  const poorEarnings: EarningsData = {
    revenue: 500000,
    netIncome: 50000,
    operatingCashFlow: 20000,
    accountsReceivable: 250000,
    inventory: 100000,
    totalAssets: 1000000,
    revenueGrowth: -10,
    earningsGrowth: -30,
    grossMargin: 20,
    operatingMargin: 5,
    accrualsRatio: 0.2,
  };

  describe('盈利质量评估', () => {
    it('高质量盈利应得高分', () => {
      const result = engine.assessQuality(qualityEarnings);
      expect(result.overallScore).toBeGreaterThan(60);
      expect(['A', 'B', 'C']).toContain(result.qualityGrade);
    });

    it('低质量盈利应得低分', () => {
      const result = engine.assessQuality(poorEarnings);
      expect(result.overallScore).toBeLessThan(60);
      expect(['D', 'F', 'C']).toContain(result.qualityGrade);
    });

    it('应检测红旗信号', () => {
      const result = engine.assessQuality(poorEarnings);
      expect(result.redFlags.length).toBeGreaterThan(0);
    });

    it('应检测绿旗信号', () => {
      const result = engine.assessQuality(qualityEarnings);
      expect(result.greenFlags.length).toBeGreaterThan(0);
    });

    it('现金转化率应正确计算', () => {
      const result = engine.assessQuality(qualityEarnings);
      expect(result.cashConversion).toBeCloseTo(1.2, 1);
    });

    it('评分应在0-100之间', () => {
      const result1 = engine.assessQuality(qualityEarnings);
      const result2 = engine.assessQuality(poorEarnings);
      expect(result1.overallScore).toBeGreaterThanOrEqual(0);
      expect(result1.overallScore).toBeLessThanOrEqual(100);
      expect(result2.overallScore).toBeGreaterThanOrEqual(0);
      expect(result2.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('应计风险', () => {
    it('低应计比率应标为low', () => {
      const result = engine.assessQuality(qualityEarnings);
      expect(result.accrualRisk).toBe('low');
    });

    it('高应计比率应标为high', () => {
      const result = engine.assessQuality(poorEarnings);
      expect(result.accrualRisk).toBe('high');
    });

    it('中等应计比率应标为medium', () => {
      const mid: EarningsData = { ...qualityEarnings, accrualsRatio: 0.1 };
      const result = engine.assessQuality(mid);
      expect(result.accrualRisk).toBe('medium');
    });
  });

  describe('盈利惊喜预测', () => {
    it('应预测盈利惊喜', () => {
      const estimate = engine.estimateSurprise([qualityEarnings], 2.5);
      expect(estimate.expectedEPS).toBeGreaterThan(0);
      expect(estimate.beatProbability).toBeGreaterThan(0);
      expect(estimate.beatProbability).toBeLessThanOrEqual(1);
    });

    it('高质量历史应有更高beat概率', () => {
      const goodEstimate = engine.estimateSurprise([qualityEarnings], 2.5);
      const poorEstimate = engine.estimateSurprise([poorEarnings], 2.5);
      expect(goodEstimate.beatProbability).toBeGreaterThanOrEqual(poorEstimate.beatProbability);
    });

    it('空历史数据应返回中性估计', () => {
      const estimate = engine.estimateSurprise([], 2.5);
      expect(estimate.beatProbability).toBe(0.5);
      expect(estimate.confidence).toBe(0);
    });

    it('更多历史数据应有更高置信度', () => {
      const fewData = engine.estimateSurprise([qualityEarnings], 2.5);
      const moreData = engine.estimateSurprise([qualityEarnings, qualityEarnings, qualityEarnings], 2.5);
      expect(moreData.confidence).toBeGreaterThan(fewData.confidence);
    });
  });

  describe('趋势分析', () => {
    it('利润率上升应标为improving', () => {
      const data: EarningsData[] = [
        { ...qualityEarnings, operatingMargin: 10 },
        { ...qualityEarnings, operatingMargin: 15 },
        { ...qualityEarnings, operatingMargin: 20 },
      ];
      const trend = engine.analyzeTrend(data);
      expect(trend.trend).toBe('improving');
      expect(trend.momentum).toBeGreaterThan(0);
    });

    it('利润率下降应标为deteriorating', () => {
      const data: EarningsData[] = [
        { ...qualityEarnings, operatingMargin: 20 },
        { ...qualityEarnings, operatingMargin: 15 },
        { ...qualityEarnings, operatingMargin: 10 },
      ];
      const trend = engine.analyzeTrend(data);
      expect(trend.trend).toBe('deteriorating');
      expect(trend.momentum).toBeLessThan(0);
    });

    it('利润率稳定应标为stable', () => {
      const data: EarningsData[] = [
        { ...qualityEarnings, operatingMargin: 15 },
        { ...qualityEarnings, operatingMargin: 15.5 },
        { ...qualityEarnings, operatingMargin: 15.2 },
      ];
      const trend = engine.analyzeTrend(data);
      expect(trend.trend).toBe('stable');
    });

    it('单期数据应返回stable', () => {
      const trend = engine.analyzeTrend([qualityEarnings]);
      expect(trend.trend).toBe('stable');
    });

    it('空数据应返回stable', () => {
      const trend = engine.analyzeTrend([]);
      expect(trend.trend).toBe('stable');
    });
  });

  describe('边界情况', () => {
    it('零收入不应报错', () => {
      const zeroRev: EarningsData = { ...qualityEarnings, revenue: 0 };
      expect(() => engine.assessQuality(zeroRev)).not.toThrow();
    });

    it('负利润不应报错', () => {
      const negProfit: EarningsData = { ...qualityEarnings, netIncome: -50000 };
      expect(() => engine.assessQuality(negProfit)).not.toThrow();
    });

    it('极端数据不应溢出', () => {
      const extreme: EarningsData = {
        revenue: 1e12,
        netIncome: 1e11,
        operatingCashFlow: 1.2e11,
        accountsReceivable: 5e10,
        inventory: 2e10,
        totalAssets: 5e12,
        revenueGrowth: 500,
        earningsGrowth: 800,
        grossMargin: 95,
        operatingMargin: 60,
        accrualsRatio: -0.5,
      };
      const result = engine.assessQuality(extreme);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });
  });
});
