/**
 * 未来价值发现引擎测试
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFundamentalScore,
  calculateTechnicalScore,
  calculateCapitalFlowScore,
  calculateAIAnalysisScore,
  calculateCompositeScore,
  calculateFullScore,
  batchCalculateScores,
  sortByScore,
  filterRecommended,
  compareScores,
  analyzeDimensions,
  findStrengthsAndWeaknesses,
  type FundamentalData,
  type TechnicalData,
  type CapitalFlowData,
  type AIAnalysisData,
} from '../services/futureValueEngine';
import {
  scorePE,
  scorePB,
  scoreROE,
  scoreGrowth,
  scoreRSI,
  scoreVolumeRatio,
  normalize,
  zScore,
  percentileRank,
  calcMA,
  calcEMA,
  calcRSI,
  calcMACD,
  volumeRatio,
  linearSlope,
  volatility,
  safeNumber,
  clamp,
} from '../utils/futureValueUtils';

// ==================== 测试数据 ====================

const mockFundamental: FundamentalData = {
  pe: 15,
  pb: 2.5,
  revenueGrowth: 20,
  profitGrowth: 25,
  roe: 18,
};

const mockTechnical: TechnicalData = {
  closes: Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.1) * 10),
  volumes: Array.from({ length: 100 }, (_, i) => 1000000 + Math.random() * 500000),
  currentPrice: 105,
};

const mockCapitalFlow: CapitalFlowData = {
  mainNetInflow: 5e8,
  northboundNetBuy: 3e8,
  marginNetBuy: 1e8,
  totalMarketCap: 1e10,
};

const mockAIAnalysis: AIAnalysisData = {
  industryScore: 75,
  competitivenessScore: 80,
  riskScore: 30,
};

// ==================== 工具函数测试 ====================

describe('futureValueUtils', () => {
  describe('数据标准化', () => {
    it('normalize 应该正确归一化', () => {
      expect(normalize(5, 0, 10)).toBe(0.5);
      expect(normalize(0, 0, 10)).toBe(0);
      expect(normalize(10, 0, 10)).toBe(1);
      expect(normalize(15, 0, 10)).toBe(1);
      expect(normalize(-5, 0, 10)).toBe(0);
    });

    it('normalize 处理相同值', () => {
      expect(normalize(5, 5, 5)).toBe(0.5);
    });

    it('zScore 应该正确计算', () => {
      expect(zScore(10, 10, 5)).toBe(0);
      expect(zScore(15, 10, 5)).toBe(1);
      expect(zScore(5, 10, 5)).toBe(-1);
      expect(zScore(10, 10, 0)).toBe(0);
    });

    it('percentileRank 应该正确计算', () => {
      expect(percentileRank(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(0.4);
      expect(percentileRank(1, [1, 2, 3, 4, 5])).toBe(0);
      expect(percentileRank(10, [1, 2, 3, 4, 5])).toBe(1);
      expect(percentileRank(5, [])).toBe(0);
    });
  });

  describe('指标计算', () => {
    it('calcMA 应该正确计算移动平均', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ma = calcMA(data, 3);
      expect(ma[0]).toBeNull();
      expect(ma[1]).toBeNull();
      expect(ma[2]).toBe(2);
      expect(ma[9]).toBe(9);
    });

    it('calcMA 数据不足时返回null', () => {
      const data = [1, 2];
      const ma = calcMA(data, 5);
      expect(ma.every((v) => v === null)).toBe(true);
    });

    it('calcRSI 应该正确计算', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.5) * 5);
      const rsi = calcRSI(closes);
      expect(rsi[14]).not.toBeNull();
      expect(rsi[14]).toBeGreaterThanOrEqual(0);
      expect(rsi[14]).toBeLessThanOrEqual(100);
    });

    it('calcEMA 应该正确计算', () => {
      const data = Array.from({ length: 20 }, (_, i) => 100 + i);
      const ema = calcEMA(data, 5);
      expect(ema[4]).not.toBeNull();
      expect(ema[19]).not.toBeNull();
      expect(ema[19] as number).toBeGreaterThan(ema[4] as number);
    });

    it('calcMACD 应该返回三个序列', () => {
      const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 10);
      const macd = calcMACD(closes);
      expect(macd.dif.length).toBe(50);
      expect(macd.dea.length).toBe(50);
      expect(macd.histogram.length).toBe(50);
    });

    it('volumeRatio 应该正确计算', () => {
      const volumes = Array.from({ length: 25 }, () => 1000000);
      expect(volumeRatio(volumes)).toBe(1);

      const highVolumes = [...volumes, 2000000];
      expect(volumeRatio(highVolumes)).toBeGreaterThan(1);

      const lowVolumes = [...volumes, 500000];
      expect(volumeRatio(lowVolumes)).toBeLessThan(1);
    });
  });

  describe('评分函数', () => {
    it('scorePE 低PE得分高', () => {
      expect(scorePE(10)).toBeGreaterThan(scorePE(30));
      expect(scorePE(30)).toBeGreaterThan(scorePE(50));
    });

    it('scorePE 边界条件', () => {
      expect(scorePE(0)).toBe(0);
      expect(scorePE(-10)).toBe(0);
      expect(scorePE(200)).toBe(0);
      expect(scorePE(250)).toBe(0);
    });

    it('scorePB 低PB得分高', () => {
      expect(scorePB(1)).toBeGreaterThan(scorePB(3));
      expect(scorePB(3)).toBeGreaterThan(scorePB(5));
    });

    it('scoreROE 高ROE得分高', () => {
      expect(scoreROE(25)).toBeGreaterThan(scoreROE(15));
      expect(scoreROE(15)).toBeGreaterThan(scoreROE(5));
    });

    it('scoreROE 负ROE得0分', () => {
      expect(scoreROE(-10)).toBe(0);
    });

    it('scoreGrowth 正增长得分高', () => {
      expect(scoreGrowth(30)).toBeGreaterThan(scoreGrowth(10));
      expect(scoreGrowth(10)).toBeGreaterThan(scoreGrowth(0));
    });

    it('scoreGrowth 负增长得分低', () => {
      expect(scoreGrowth(-10)).toBeLessThan(scoreGrowth(0));
      expect(scoreGrowth(-60)).toBe(0);
    });

    it('scoreRSI 超卖得分高', () => {
      expect(scoreRSI(25)).toBeGreaterThan(scoreRSI(50));
    });

    it('scoreRSI 超买得分低', () => {
      expect(scoreRSI(75)).toBeLessThan(scoreRSI(50));
    });

    it('scoreVolumeRatio 适度放量得分最高', () => {
      expect(scoreVolumeRatio(2)).toBeGreaterThan(scoreVolumeRatio(1));
      expect(scoreVolumeRatio(2)).toBeGreaterThan(scoreVolumeRatio(5));
    });
  });

  describe('辅助函数', () => {
    it('safeNumber 处理无效值', () => {
      expect(safeNumber(undefined)).toBe(0);
      expect(safeNumber(null)).toBe(0);
      expect(safeNumber(NaN)).toBe(0);
      expect(safeNumber(Infinity)).toBe(0);
      expect(safeNumber(5, 10)).toBe(5);
      expect(safeNumber(undefined, 10)).toBe(10);
    });

    it('clamp 应该限制范围', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('linearSlope 应该计算斜率', () => {
      expect(linearSlope([1, 2, 3, 4, 5])).toBe(1);
      expect(linearSlope([5, 4, 3, 2, 1])).toBe(-1);
      expect(linearSlope([1, 1, 1, 1])).toBe(0);
      expect(linearSlope([5])).toBe(0);
    });

    it('volatility 应该计算波动率', () => {
      expect(volatility([1, 1, 1, 1])).toBe(0);
      expect(volatility([1, 2, 3, 4, 5])).toBeGreaterThan(0);
    });
  });
});

// ==================== 评分计算器测试 ====================

describe('futureValueCalculator', () => {
  describe('calculateFundamentalScore', () => {
    it('应该返回有效的基本面评分', () => {
      const result = calculateFundamentalScore(mockFundamental);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.peScore).toBeGreaterThanOrEqual(0);
      expect(result.pbScore).toBeGreaterThanOrEqual(0);
      expect(result.revenueGrowthScore).toBeGreaterThanOrEqual(0);
      expect(result.profitGrowthScore).toBeGreaterThanOrEqual(0);
      expect(result.roeScore).toBeGreaterThanOrEqual(0);
    });

    it('优质基本面应该得分高', () => {
      const goodFundamental: FundamentalData = {
        pe: 10,
        pb: 1.5,
        revenueGrowth: 30,
        profitGrowth: 40,
        roe: 25,
      };
      const result = calculateFundamentalScore(goodFundamental);
      expect(result.total).toBeGreaterThan(60);
    });
  });

  describe('calculateTechnicalScore', () => {
    it('应该返回有效的技术面评分', () => {
      const result = calculateTechnicalScore(mockTechnical);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.maScore).toBeGreaterThanOrEqual(0);
      expect(result.rsiScore).toBeGreaterThanOrEqual(0);
      expect(result.macdScore).toBeGreaterThanOrEqual(0);
      expect(result.volumeScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateCapitalFlowScore', () => {
    it('应该返回有效的资金面评分', () => {
      const result = calculateCapitalFlowScore(mockCapitalFlow);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.mainInflowScore).toBeGreaterThanOrEqual(0);
      expect(result.northboundScore).toBeGreaterThanOrEqual(0);
      expect(result.marginScore).toBeGreaterThanOrEqual(0);
    });

    it('资金流入应该得分高', () => {
      const goodFlow: CapitalFlowData = {
        mainNetInflow: 1e9,
        northboundNetBuy: 1e9,
        marginNetBuy: 5e8,
        totalMarketCap: 1e10,
      };
      const result = calculateCapitalFlowScore(goodFlow);
      expect(result.total).toBeGreaterThan(70);
    });
  });

  describe('calculateAIAnalysisScore', () => {
    it('应该返回有效的AI分析评分', () => {
      const result = calculateAIAnalysisScore(mockAIAnalysis);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    });

    it('高行业前景和竞争力应该得分高', () => {
      const goodAI: AIAnalysisData = {
        industryScore: 90,
        competitivenessScore: 85,
        riskScore: 20,
      };
      const result = calculateAIAnalysisScore(goodAI);
      expect(result.total).toBeGreaterThan(75);
    });
  });

  describe('calculateCompositeScore', () => {
    it('应该返回有效的综合评分', () => {
      const fund = calculateFundamentalScore(mockFundamental);
      const tech = calculateTechnicalScore(mockTechnical);
      const cap = calculateCapitalFlowScore(mockCapitalFlow);
      const ai = calculateAIAnalysisScore(mockAIAnalysis);

      const result = calculateCompositeScore(fund, tech, cap, ai);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.rating).toMatch(/强烈推荐|推荐|中性|谨慎|回避/);
      expect(result.timestamp).toBeTruthy();
    });
  });

  describe('calculateFullScore', () => {
    it('应该一键计算完整评分', () => {
      const result = calculateFullScore(
        mockFundamental,
        mockTechnical,
        mockCapitalFlow,
        mockAIAnalysis
      );
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.fundamental).toBeDefined();
      expect(result.technical).toBeDefined();
      expect(result.capitalFlow).toBeDefined();
      expect(result.aiAnalysis).toBeDefined();
    });
  });
});

// ==================== 批量评分测试 ====================

describe('批量评分', () => {
  it('batchCalculateScores 应该批量计算', () => {
    const inputs = [
      { symbol: '000001', name: '平安银行', ...mockFundamental, ...mockTechnical, ...mockCapitalFlow, ...mockAIAnalysis },
      { symbol: '600036', name: '招商银行', ...mockFundamental, ...mockTechnical, ...mockCapitalFlow, ...mockAIAnalysis },
    ].map((input) => ({
      symbol: input.symbol,
      name: input.name,
      fundamental: mockFundamental,
      technical: mockTechnical,
      capitalFlow: mockCapitalFlow,
      aiAnalysis: mockAIAnalysis,
    }));

    const results = batchCalculateScores(inputs);
    expect(results.length).toBe(2);
    expect(results[0].symbol).toBe('000001');
    expect(results[1].symbol).toBe('600036');
  });

  it('sortByScore 应该正确排序', () => {
    const results = [
      { symbol: 'A', name: 'A', score: { total: 60 } as any },
      { symbol: 'B', name: 'B', score: { total: 80 } as any },
      { symbol: 'C', name: 'C', score: { total: 40 } as any },
    ];

    const sorted = sortByScore(results, 'desc');
    expect(sorted[0].symbol).toBe('B');
    expect(sorted[2].symbol).toBe('C');

    const asc = sortByScore(results, 'asc');
    expect(asc[0].symbol).toBe('C');
    expect(asc[2].symbol).toBe('B');
  });

  it('filterRecommended 应该筛选推荐股票', () => {
    const results = [
      { symbol: 'A', name: 'A', score: { total: 80 } as any },
      { symbol: 'B', name: 'B', score: { total: 60 } as any },
      { symbol: 'C', name: 'C', score: { total: 40 } as any },
    ];

    const recommended = filterRecommended(results, 65);
    expect(recommended.length).toBe(1);
    expect(recommended[0].symbol).toBe('A');
  });
});

// ==================== 评分分析测试 ====================

describe('评分分析', () => {
  it('compareScores 应该对比评分变化', () => {
    const current = calculateFullScore(
      mockFundamental,
      mockTechnical,
      mockCapitalFlow,
      mockAIAnalysis
    );
    const previous = { ...current, total: current.total - 5 };

    const comparison = compareScores('000001', current, previous);
    expect(comparison.symbol).toBe('000001');
    expect(comparison.change).toBeGreaterThan(0);
    expect(comparison.trend).toBe('up');
  });

  it('compareScores 处理无历史数据', () => {
    const current = calculateFullScore(
      mockFundamental,
      mockTechnical,
      mockCapitalFlow,
      mockAIAnalysis
    );

    const comparison = compareScores('000001', current, null);
    expect(comparison.change).toBe(0);
    expect(comparison.trend).toBe('stable');
  });

  it('analyzeDimensions 应该分析各维度', () => {
    const score = calculateFullScore(
      mockFundamental,
      mockTechnical,
      mockCapitalFlow,
      mockAIAnalysis
    );

    const dimensions = analyzeDimensions(score);
    expect(dimensions.length).toBe(4);
    expect(dimensions[0].dimension).toBe('基本面');
    expect(dimensions[1].dimension).toBe('技术面');
    expect(dimensions[2].dimension).toBe('资金面');
    expect(dimensions[3].dimension).toBe('AI分析');

    for (const dim of dimensions) {
      expect(dim.weight).toBeGreaterThan(0);
      expect(dim.contribution).toBeGreaterThanOrEqual(0);
      expect(['strong', 'normal', 'weak']).toContain(dim.status);
    }
  });

  it('findStrengthsAndWeaknesses 应该找出优劣势', () => {
    const score = calculateFullScore(
      mockFundamental,
      mockTechnical,
      mockCapitalFlow,
      mockAIAnalysis
    );

    const { strengths, weaknesses } = findStrengthsAndWeaknesses(score);
    expect(Array.isArray(strengths)).toBe(true);
    expect(Array.isArray(weaknesses)).toBe(true);
  });
});
