import { describe, it, expect } from 'vitest';
import {
  compareStocks,
  industryComparison,
  type StockProfile,
} from '../utils/stockComparisonEngine';

/**
 * 个股对比分析引擎测试 (导入真实模块)
 */

function makeStock(overrides: Partial<StockProfile> = {}): StockProfile {
  return {
    code: '600519',
    name: '贵州茅台',
    price: 1800,
    marketCap: 25000e8,
    pe: 35,
    pb: 10,
    ps: 15,
    roe: 30,
    revenueGrowth: 15,
    profitGrowth: 18,
    grossMargin: 90,
    netMargin: 50,
    debtRatio: 0.2,
    currentRatio: 3,
    dividendYield: 1.5,
    turnoverRate: 0.5,
    weekReturn: 2,
    monthReturn: 5,
    yearReturn: 20,
    volatility: 0.2,
    beta: 0.8,
    industry: '白酒',
    ...overrides,
  };
}

describe('Stock Comparison Engine', () => {
  const stocks: StockProfile[] = [
    makeStock(),
    makeStock({ code: '000858', name: '五粮液', price: 150, marketCap: 8000e8, pe: 28, pb: 7, ps: 8, roe: 25, revenueGrowth: 12, profitGrowth: 15, grossMargin: 80, netMargin: 35, dividendYield: 1.2, beta: 0.9 }),
    makeStock({ code: '000001', name: '平安银行', price: 12.5, marketCap: 3000e8, pe: 5.5, pb: 0.7, ps: 1.5, roe: 12, revenueGrowth: 8, profitGrowth: 10, grossMargin: 40, netMargin: 25, debtRatio: 0.9, currentRatio: 1.2, dividendYield: 3, beta: 1.2, industry: '银行' }),
  ];

  describe('对比分析', () => {
    it('应该返回 8 个对比维度', () => {
      const result = compareStocks(stocks);
      expect(result.dimensions.length).toBe(8);
    });

    it('ROE 维度应包含各股票的真实值', () => {
      const result = compareStocks(stocks);
      const roeDim = result.dimensions.find(d => d.dimension === 'ROE');
      expect(roeDim).toBeDefined();
      expect(roeDim!.values.map(v => v.value)).toEqual([30, 25, 12]);
      expect(roeDim!.leader).toBe('600519');
    });

    it('应该生成排名且唯一', () => {
      const result = compareStocks(stocks);
      expect(result.rankings.length).toBe(3);
      const ranks = result.rankings.map(r => r.rank);
      expect(new Set(ranks).size).toBe(3);
    });

    it('应该生成雷达图数据', () => {
      const result = compareStocks(stocks);
      expect(result.radarData.length).toBe(3);
      for (const rd of result.radarData) {
        expect(rd.overallScore).toBeGreaterThanOrEqual(0);
        expect(rd.overallScore).toBeLessThanOrEqual(100);
      }
    });

    it('应该生成投资建议', () => {
      const result = compareStocks(stocks);
      expect(result.recommendation.length).toBe(3);
      for (const rec of result.recommendation) {
        expect(['强烈推荐', '推荐', '中性', '回避']).toContain(rec.verdict);
      }
    });
  });

  describe('边界条件', () => {
    it('单只股票应返回空结果', () => {
      const result = compareStocks([stocks[0]]);
      expect(result.dimensions).toHaveLength(0);
      expect(result.rankings).toHaveLength(0);
      expect(result.radarData).toHaveLength(0);
      expect(result.recommendation).toHaveLength(0);
    });

    it('空数组应返回空结果', () => {
      const result = compareStocks([]);
      expect(result.dimensions).toHaveLength(0);
      expect(result.rankings).toHaveLength(0);
    });
  });

  describe('行业对比', () => {
    it('应按行业聚合', () => {
      const result = industryComparison(stocks);
      expect(result.length).toBe(2); // 白酒 + 银行
      const baijiu = result.find(r => r.industry === '白酒');
      expect(baijiu?.avgPE).toBeCloseTo(31.5, 1); // (35+28)/2
      expect(baijiu?.count).toBe(2);
    });
  });
});
