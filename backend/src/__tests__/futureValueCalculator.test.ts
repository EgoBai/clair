/**
 * 未来价值发现 - 评分计算器测试
 * 专注于基本面评分算法 [S3]
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFundamentalScore,
  calculateTechnicalScore,
  calculateCapitalFlowScore,
  calculateAIAnalysisScore,
  calculateCompositeScore,
  calculateFullScore,
  type FundamentalData,
  type TechnicalData,
  type CapitalFlowData,
  type AIAnalysisData,
} from '../services/futureValueCalculator';

// ==================== 基本面评分测试 ====================

describe('calculateFundamentalScore', () => {
  const defaultData: FundamentalData = {
    pe: 15,
    pb: 2.5,
    revenueGrowth: 20,
    profitGrowth: 25,
    roe: 18,
  };

  describe('基础验证', () => {
    it('应返回所有子项评分', () => {
      const result = calculateFundamentalScore(defaultData);
      expect(result).toHaveProperty('peScore');
      expect(result).toHaveProperty('pbScore');
      expect(result).toHaveProperty('revenueGrowthScore');
      expect(result).toHaveProperty('profitGrowthScore');
      expect(result).toHaveProperty('roeScore');
      expect(result).toHaveProperty('total');
    });

    it('所有子项评分应在0-100之间', () => {
      const result = calculateFundamentalScore(defaultData);
      expect(result.peScore).toBeGreaterThanOrEqual(0);
      expect(result.peScore).toBeLessThanOrEqual(100);
      expect(result.pbScore).toBeGreaterThanOrEqual(0);
      expect(result.pbScore).toBeLessThanOrEqual(100);
      expect(result.revenueGrowthScore).toBeGreaterThanOrEqual(0);
      expect(result.revenueGrowthScore).toBeLessThanOrEqual(100);
      expect(result.profitGrowthScore).toBeGreaterThanOrEqual(0);
      expect(result.profitGrowthScore).toBeLessThanOrEqual(100);
      expect(result.roeScore).toBeGreaterThanOrEqual(0);
      expect(result.roeScore).toBeLessThanOrEqual(100);
    });

    it('总分应在0-100之间', () => {
      const result = calculateFundamentalScore(defaultData);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    });
  });

  describe('权重验证', () => {
    it('总分应按权重: PE 25%, PB 20%, 营收增长 20%, 利润增长 20%, ROE 15%', () => {
      const result = calculateFundamentalScore(defaultData);

      const expectedTotal =
        result.peScore * 0.25 +
        result.pbScore * 0.20 +
        result.revenueGrowthScore * 0.20 +
        result.profitGrowthScore * 0.20 +
        result.roeScore * 0.15;
      expect(result.total).toBeCloseTo(expectedTotal, 2);
    });

    it('修改单个子项应按权重影响总分', () => {
      const base = calculateFundamentalScore(defaultData);
      const higherPE = calculateFundamentalScore({ ...defaultData, pe: 5 });
      const diff = higherPE.total - base.total;
      const peScoreDiff = higherPE.peScore - base.peScore;
      expect(diff).toBeCloseTo(peScoreDiff * 0.25, 2);
    });
  });

  describe('PE评分逻辑', () => {
    it('低PE应得高分', () => {
      const lowPE = calculateFundamentalScore({ ...defaultData, pe: 8 });
      const highPE = calculateFundamentalScore({ ...defaultData, pe: 40 });
      expect(lowPE.peScore).toBeGreaterThan(highPE.peScore);
    });

    it('PE在0-10范围应得90+分', () => {
      const result = calculateFundamentalScore({ ...defaultData, pe: 5 });
      expect(result.peScore).toBeGreaterThanOrEqual(90);
    });

    it('PE在10-20范围应得70-90分', () => {
      const result = calculateFundamentalScore({ ...defaultData, pe: 15 });
      expect(result.peScore).toBeGreaterThanOrEqual(70);
      expect(result.peScore).toBeLessThanOrEqual(90);
    });

    it('PE在20-30范围应得50-70分', () => {
      const result = calculateFundamentalScore({ ...defaultData, pe: 25 });
      expect(result.peScore).toBeGreaterThanOrEqual(50);
      expect(result.peScore).toBeLessThanOrEqual(70);
    });

    it('PE为0或负数应得0分', () => {
      expect(calculateFundamentalScore({ ...defaultData, pe: 0 }).peScore).toBe(0);
      expect(calculateFundamentalScore({ ...defaultData, pe: -5 }).peScore).toBe(0);
    });

    it('PE超过200应得0分', () => {
      expect(calculateFundamentalScore({ ...defaultData, pe: 250 }).peScore).toBe(0);
    });
  });

  describe('PB评分逻辑', () => {
    it('低PB应得高分', () => {
      const lowPB = calculateFundamentalScore({ ...defaultData, pb: 0.8 });
      const highPB = calculateFundamentalScore({ ...defaultData, pb: 5 });
      expect(lowPB.pbScore).toBeGreaterThan(highPB.pbScore);
    });

    it('PB在0-1范围应得90+分', () => {
      const result = calculateFundamentalScore({ ...defaultData, pb: 0.5 });
      expect(result.pbScore).toBeGreaterThanOrEqual(90);
    });

    it('PB为0或负数应得0分', () => {
      expect(calculateFundamentalScore({ ...defaultData, pb: 0 }).pbScore).toBe(0);
      expect(calculateFundamentalScore({ ...defaultData, pb: -1 }).pbScore).toBe(0);
    });
  });

  describe('营收增长评分逻辑', () => {
    it('高增长应得高分', () => {
      const highGrowth = calculateFundamentalScore({ ...defaultData, revenueGrowth: 40 });
      const lowGrowth = calculateFundamentalScore({ ...defaultData, revenueGrowth: 5 });
      expect(highGrowth.revenueGrowthScore).toBeGreaterThan(lowGrowth.revenueGrowthScore);
    });

    it('负增长应得低分', () => {
      const result = calculateFundamentalScore({ ...defaultData, revenueGrowth: -30 });
      expect(result.revenueGrowthScore).toBeLessThan(40);
    });

    it('大幅负增长应得0分', () => {
      const result = calculateFundamentalScore({ ...defaultData, revenueGrowth: -60 });
      expect(result.revenueGrowthScore).toBe(0);
    });
  });

  describe('利润增长评分逻辑', () => {
    it('高增长应得高分', () => {
      const highGrowth = calculateFundamentalScore({ ...defaultData, profitGrowth: 50 });
      const lowGrowth = calculateFundamentalScore({ ...defaultData, profitGrowth: 5 });
      expect(highGrowth.profitGrowthScore).toBeGreaterThan(lowGrowth.profitGrowthScore);
    });

    it('大幅负增长应得0分', () => {
      const result = calculateFundamentalScore({ ...defaultData, profitGrowth: -60 });
      expect(result.profitGrowthScore).toBe(0);
    });
  });

  describe('ROE评分逻辑', () => {
    it('高ROE应得高分', () => {
      const highROE = calculateFundamentalScore({ ...defaultData, roe: 25 });
      const lowROE = calculateFundamentalScore({ ...defaultData, roe: 5 });
      expect(highROE.roeScore).toBeGreaterThan(lowROE.roeScore);
    });

    it('ROE超过30应得100分', () => {
      const result = calculateFundamentalScore({ ...defaultData, roe: 35 });
      expect(result.roeScore).toBe(100);
    });

    it('负ROE应得0分', () => {
      const result = calculateFundamentalScore({ ...defaultData, roe: -10 });
      expect(result.roeScore).toBe(0);
    });
  });

  describe('综合场景', () => {
    it('优质基本面应得高分(>60)', () => {
      const result = calculateFundamentalScore({
        pe: 10,
        pb: 1.5,
        revenueGrowth: 30,
        profitGrowth: 40,
        roe: 25,
      });
      expect(result.total).toBeGreaterThan(60);
    });

    it('劣质基本面应得低分(<40)', () => {
      const result = calculateFundamentalScore({
        pe: 80,
        pb: 8,
        revenueGrowth: -20,
        profitGrowth: -30,
        roe: 3,
      });
      expect(result.total).toBeLessThan(40);
    });

    it('极端数据不应导致评分溢出', () => {
      const extremes: FundamentalData[] = [
        { pe: 0.1, pb: 0.1, revenueGrowth: 200, profitGrowth: 200, roe: 50 },
        { pe: 199, pb: 19, revenueGrowth: -49, profitGrowth: -49, roe: 0.1 },
      ];
      for (const data of extremes) {
        const result = calculateFundamentalScore(data);
        expect(result.total).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeLessThanOrEqual(100);
      }
    });
  });
});

// ==================== 技术面评分测试 ====================

describe('calculateTechnicalScore', () => {
  const baseCloses = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.1) * 10);
  const baseVolumes = Array.from({ length: 100 }, () => 1000000);

  const defaultData: TechnicalData = {
    closes: baseCloses,
    volumes: baseVolumes,
    currentPrice: 105,
  };

  describe('基础验证', () => {
    it('应返回所有子项评分', () => {
      const result = calculateTechnicalScore(defaultData);
      expect(result).toHaveProperty('maScore');
      expect(result).toHaveProperty('rsiScore');
      expect(result).toHaveProperty('macdScore');
      expect(result).toHaveProperty('volumeScore');
      expect(result).toHaveProperty('total');
    });

    it('所有子项评分应在0-100之间', () => {
      const result = calculateTechnicalScore(defaultData);
      expect(result.maScore).toBeGreaterThanOrEqual(0);
      expect(result.maScore).toBeLessThanOrEqual(100);
      expect(result.rsiScore).toBeGreaterThanOrEqual(0);
      expect(result.rsiScore).toBeLessThanOrEqual(100);
      expect(result.macdScore).toBeGreaterThanOrEqual(0);
      expect(result.macdScore).toBeLessThanOrEqual(100);
      expect(result.volumeScore).toBeGreaterThanOrEqual(0);
      expect(result.volumeScore).toBeLessThanOrEqual(100);
    });

    it('总分应在0-100之间', () => {
      const result = calculateTechnicalScore(defaultData);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    });
  });

  describe('权重验证', () => {
    it('总分应按权重: MA 30%, RSI 25%, MACD 25%, 成交量 20%', () => {
      const result = calculateTechnicalScore(defaultData);
      const expectedTotal =
        result.maScore * 0.30 +
        result.rsiScore * 0.25 +
        result.macdScore * 0.25 +
        result.volumeScore * 0.20;
      expect(result.total).toBeCloseTo(expectedTotal, 2);
    });
  });

  describe('MA趋势评分逻辑', () => {
    it('多头排列(价格>MA5>MA20)应得高分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 100 + i * 2);
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: 300,
      });
      expect(result.maScore).toBeGreaterThanOrEqual(80);
    });

    it('价格在MA20之上但MA5之下应得中等分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
      const ma20Val = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: ma20Val + 5,
      });
      expect(result.maScore).toBeGreaterThanOrEqual(50);
    });

    it('空头排列(价格<MA5<MA20)应得低分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 300 - i * 2);
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: 100,
      });
      expect(result.maScore).toBeLessThanOrEqual(30);
    });

    it('价格在MA20之下应得较低分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 200 - i);
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: 100,
      });
      expect(result.maScore).toBeLessThan(50);
    });

    it('MA20>MA60长期趋势向上应加分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 100 + i);
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: 200,
      });
      expect(result.maScore).toBeGreaterThanOrEqual(80);
    });
  });

  describe('RSI评分逻辑', () => {
    it('RSI超卖(<30)应得高分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 200 - i * 1.5);
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: 50,
      });
      expect(result.rsiScore).toBeGreaterThan(50);
    });

    it('RSI超买(>70)应得低分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 50 + i * 1.5);
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: 200,
      });
      expect(result.rsiScore).toBeLessThan(50);
    });
  });

  describe('MACD评分逻辑', () => {
    it('红柱放大应得较高分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 100 + i);
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: 200,
      });
      expect(result.macdScore).toBeGreaterThanOrEqual(60);
    });

    it('绿柱放大应得较低分', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 200 - i);
      const result = calculateTechnicalScore({
        closes,
        volumes: baseVolumes,
        currentPrice: 100,
      });
      expect(result.macdScore).toBeLessThanOrEqual(40);
    });
  });

  describe('成交量评分逻辑', () => {
    it('适度放量应得高分', () => {
      const volumes = Array.from({ length: 100 }, (_, i) =>
        i === 99 ? 2000000 : 1000000
      );
      const result = calculateTechnicalScore({
        closes: baseCloses,
        volumes,
        currentPrice: 105,
      });
      expect(result.volumeScore).toBeGreaterThanOrEqual(70);
    });

    it('极度缩量应得低分', () => {
      const volumes = Array.from({ length: 100 }, (_, i) =>
        i === 99 ? 100000 : 1000000
      );
      const result = calculateTechnicalScore({
        closes: baseCloses,
        volumes,
        currentPrice: 105,
      });
      expect(result.volumeScore).toBeLessThanOrEqual(40);
    });
  });

  describe('综合场景', () => {
    it('强势上涨应得较高总分(>50)', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 100 + i * 2);
      const volumes = Array.from({ length: 100 }, (_, i) =>
        i === 99 ? 3000000 : 1000000
      );
      const result = calculateTechnicalScore({
        closes,
        volumes,
        currentPrice: 300,
      });
      expect(result.total).toBeGreaterThan(50);
    });

    it('持续下跌应得较低总分(<55)', () => {
      const closes = Array.from({ length: 100 }, (_, i) => 300 - i * 2);
      const volumes = Array.from({ length: 100 }, (_, i) =>
        i === 99 ? 500000 : 1000000
      );
      const result = calculateTechnicalScore({
        closes,
        volumes,
        currentPrice: 100,
      });
      expect(result.total).toBeLessThan(55);
    });

    it('极端数据不应导致评分溢出', () => {
      const extremes: TechnicalData[] = [
        { closes: Array.from({ length: 100 }, (_, i) => 1 + i * 10), volumes: Array.from({ length: 100 }, () => 1e9), currentPrice: 1000 },
        { closes: Array.from({ length: 100 }, (_, i) => 1000 - i * 10), volumes: Array.from({ length: 100 }, () => 1), currentPrice: 1 },
      ];
      for (const data of extremes) {
        const result = calculateTechnicalScore(data);
        expect(result.total).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeLessThanOrEqual(100);
      }
    });
  });
});

// ==================== 资金面评分测试 ====================

describe('calculateCapitalFlowScore', () => {
  const defaultData: CapitalFlowData = {
    mainNetInflow: 5e8,
    northboundNetBuy: 3e8,
    marginNetBuy: 1e8,
    totalMarketCap: 1e10,
  };

  describe('基础验证', () => {
    it('应返回所有子项评分', () => {
      const result = calculateCapitalFlowScore(defaultData);
      expect(result).toHaveProperty('mainInflowScore');
      expect(result).toHaveProperty('northboundScore');
      expect(result).toHaveProperty('marginScore');
      expect(result).toHaveProperty('total');
    });

    it('所有子项评分应在0-100之间', () => {
      const result = calculateCapitalFlowScore(defaultData);
      expect(result.mainInflowScore).toBeGreaterThanOrEqual(0);
      expect(result.mainInflowScore).toBeLessThanOrEqual(100);
      expect(result.northboundScore).toBeGreaterThanOrEqual(0);
      expect(result.northboundScore).toBeLessThanOrEqual(100);
      expect(result.marginScore).toBeGreaterThanOrEqual(0);
      expect(result.marginScore).toBeLessThanOrEqual(100);
    });

    it('总分应在0-100之间', () => {
      const result = calculateCapitalFlowScore(defaultData);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    });
  });

  describe('权重验证', () => {
    it('总分应按权重: 主力资金40%, 北向资金35%, 融资融券25%', () => {
      const result = calculateCapitalFlowScore(defaultData);
      const expectedTotal =
        result.mainInflowScore * 0.40 +
        result.northboundScore * 0.35 +
        result.marginScore * 0.25;
      expect(result.total).toBeCloseTo(expectedTotal, 2);
    });
  });

  describe('主力资金评分逻辑', () => {
    it('大幅净流入应得高分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        mainNetInflow: 1e9,
      });
      expect(result.mainInflowScore).toBeGreaterThanOrEqual(75);
    });

    it('小幅净流入应得中等分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        mainNetInflow: 1e8,
      });
      expect(result.mainInflowScore).toBeGreaterThanOrEqual(50);
    });

    it('净流出应得低分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        mainNetInflow: -5e8,
      });
      expect(result.mainInflowScore).toBeLessThanOrEqual(40);
    });

    it('大幅净流出应得极低分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        mainNetInflow: -1e9,
      });
      expect(result.mainInflowScore).toBeLessThanOrEqual(25);
    });
  });

  describe('北向资金评分逻辑', () => {
    it('大幅净买入应得高分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        northboundNetBuy: 1e9,
      });
      expect(result.northboundScore).toBeGreaterThanOrEqual(75);
    });

    it('小幅净买入应得中等分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        northboundNetBuy: 2e8,
      });
      expect(result.northboundScore).toBeGreaterThanOrEqual(50);
    });

    it('净卖出应得低分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        northboundNetBuy: -5e8,
      });
      expect(result.northboundScore).toBeLessThanOrEqual(40);
    });

    it('大幅净卖出应得极低分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        northboundNetBuy: -1e9,
      });
      expect(result.northboundScore).toBeLessThanOrEqual(25);
    });
  });

  describe('融资融券评分逻辑', () => {
    it('融资净买入应得高分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        marginNetBuy: 2e8,
      });
      expect(result.marginScore).toBeGreaterThanOrEqual(65);
    });

    it('融资净卖出应得低分', () => {
      const result = calculateCapitalFlowScore({
        ...defaultData,
        marginNetBuy: -2e8,
      });
      expect(result.marginScore).toBeLessThanOrEqual(40);
    });
  });

  describe('综合场景', () => {
    it('大量资金流入应得高分(>70)', () => {
      const goodFlow: CapitalFlowData = {
        mainNetInflow: 1e9,
        northboundNetBuy: 1e9,
        marginNetBuy: 5e8,
        totalMarketCap: 1e10,
      };
      const result = calculateCapitalFlowScore(goodFlow);
      expect(result.total).toBeGreaterThan(70);
    });

    it('资金大幅流出应得低分(<30)', () => {
      const badFlow: CapitalFlowData = {
        mainNetInflow: -1e9,
        northboundNetBuy: -1e9,
        marginNetBuy: -5e8,
        totalMarketCap: 1e10,
      };
      const result = calculateCapitalFlowScore(badFlow);
      expect(result.total).toBeLessThan(30);
    });

    it('零资金流动应得中等分', () => {
      const zeroFlow: CapitalFlowData = {
        mainNetInflow: 0,
        northboundNetBuy: 0,
        marginNetBuy: 0,
        totalMarketCap: 1e10,
      };
      const result = calculateCapitalFlowScore(zeroFlow);
      expect(result.total).toBeGreaterThanOrEqual(30);
      expect(result.total).toBeLessThanOrEqual(60);
    });

    it('极端数据不应导致评分溢出', () => {
      const extremes: CapitalFlowData[] = [
        { mainNetInflow: 1e12, northboundNetBuy: 1e12, marginNetBuy: 1e12, totalMarketCap: 1e10 },
        { mainNetInflow: -1e12, northboundNetBuy: -1e12, marginNetBuy: -1e12, totalMarketCap: 1e10 },
      ];
      for (const data of extremes) {
        const result = calculateCapitalFlowScore(data);
        expect(result.total).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeLessThanOrEqual(100);
      }
    });
  });
});

// ==================== AI分析评分测试 ====================

describe('calculateAIAnalysisScore', () => {
  const defaultData: AIAnalysisData = {
    industryScore: 75,
    competitivenessScore: 80,
    riskScore: 30,
  };

  it('应返回有效的AI分析评分', () => {
    const result = calculateAIAnalysisScore(defaultData);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('高评分+低风险应得高分', () => {
    const result = calculateAIAnalysisScore({
      industryScore: 90,
      competitivenessScore: 85,
      riskScore: 10,
    });
    expect(result.total).toBeGreaterThan(75);
  });
});

// ==================== 综合评分测试 ====================

describe('calculateCompositeScore', () => {
  const fundamental = calculateFundamentalScore({
    pe: 15, pb: 2.5, revenueGrowth: 20, profitGrowth: 25, roe: 18,
  });
  const technical = calculateTechnicalScore({
    closes: Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.1) * 10),
    volumes: Array.from({ length: 100 }, () => 1000000),
    currentPrice: 105,
  });
  const capitalFlow = calculateCapitalFlowScore({
    mainNetInflow: 5e8, northboundNetBuy: 3e8, marginNetBuy: 1e8, totalMarketCap: 1e10,
  });
  const aiAnalysis = calculateAIAnalysisScore({
    industryScore: 75, competitivenessScore: 80, riskScore: 30,
  });

  it('总分应按权重: 基本面40% + 技术面30% + 资金面20% + AI分析10%', () => {
    const result = calculateCompositeScore(fundamental, technical, capitalFlow, aiAnalysis);
    const expectedTotal =
      fundamental.total * 0.40 +
      technical.total * 0.30 +
      capitalFlow.total * 0.20 +
      aiAnalysis.total * 0.10;
    expect(result.total).toBeCloseTo(expectedTotal, 1);
  });

  it('应返回有效评级', () => {
    const result = calculateCompositeScore(fundamental, technical, capitalFlow, aiAnalysis);
    expect(['强烈推荐', '推荐', '中性', '谨慎', '回避']).toContain(result.rating);
  });

  it('高评分应得强烈推荐', () => {
    const highFundamental = { peScore: 95, pbScore: 90, revenueGrowthScore: 95, profitGrowthScore: 95, roeScore: 95, total: 93 };
    const highTechnical = { maScore: 90, rsiScore: 85, macdScore: 90, volumeScore: 85, total: 88 };
    const highCapital = { mainInflowScore: 90, northboundScore: 85, marginScore: 90, total: 88 };
    const highAI = { industryScore: 90, competitivenessScore: 90, riskScore: 10, total: 82 };
    const result = calculateCompositeScore(highFundamental, highTechnical, highCapital, highAI);
    expect(result.rating).toBe('强烈推荐');
  });

  it('低评分应得回避', () => {
    const lowFundamental = { peScore: 10, pbScore: 10, revenueGrowthScore: 10, profitGrowthScore: 10, roeScore: 10, total: 10 };
    const lowTechnical = { maScore: 10, rsiScore: 10, macdScore: 10, volumeScore: 10, total: 10 };
    const lowCapital = { mainInflowScore: 10, northboundScore: 10, marginScore: 10, total: 10 };
    const lowAI = { industryScore: 10, competitivenessScore: 10, riskScore: 90, total: 10 };
    const result = calculateCompositeScore(lowFundamental, lowTechnical, lowCapital, lowAI);
    expect(result.rating).toBe('回避');
  });
});

// ==================== 一键评分测试 ====================

describe('calculateFullScore', () => {
  it('应一键计算完整评分', () => {
    const result = calculateFullScore(
      { pe: 15, pb: 2.5, revenueGrowth: 20, profitGrowth: 25, roe: 18 },
      {
        closes: Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.1) * 10),
        volumes: Array.from({ length: 100 }, () => 1000000),
        currentPrice: 105,
      },
      { mainNetInflow: 5e8, northboundNetBuy: 3e8, marginNetBuy: 1e8, totalMarketCap: 1e10 },
      { industryScore: 75, competitivenessScore: 80, riskScore: 30 }
    );

    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.fundamental).toBeDefined();
    expect(result.technical).toBeDefined();
    expect(result.capitalFlow).toBeDefined();
    expect(result.aiAnalysis).toBeDefined();
    expect(result.timestamp).toBeTruthy();
  });
});
