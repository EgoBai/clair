import { describe, it, expect, beforeEach } from 'vitest';
import { CorrelationEngine } from '../utils/correlationEngine';

describe('CorrelationEngine', () => {
  let engine: CorrelationEngine;

  const createStock = (symbol: string, name: string, prices: number[]) => ({
    symbol,
    name,
    prices,
    dates: prices.map((_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`),
  });

  beforeEach(() => {
    engine = new CorrelationEngine({ minDataPoints: 5, smoothing: 0 });
  });

  describe('Pearson相关性', () => {
    it('应该计算完全正相关', () => {
      const stock1 = createStock('000001', '平安银行', [10, 11, 12, 13, 14, 15]);
      const stock2 = createStock('000002', '万科A', [20, 22, 24, 26, 28, 30]);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(result.correlation).toBeGreaterThan(0.9);
      expect(result.strength).toBe('strong');
      expect(result.direction).toBe('positive');
    });

    it('应该计算负相关', () => {
      const stock1 = createStock('000001', '平安银行', [10, 12, 10, 15, 9, 14]);
      const stock2 = createStock('000003', 'PT金田', [30, 25, 32, 22, 34, 20]);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(result.correlation).toBeLessThan(0);
      expect(result.direction).toBe('negative');
    });

    it('应该处理波动相关性', () => {
      const stock1 = createStock('000001', '平安银行', [10, 12, 8, 15, 9, 14]);
      const stock2 = createStock('000004', '国农科技', [20, 24, 16, 30, 18, 28]);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(result.correlation).toBeGreaterThan(0.5);
      expect(result.strength).toBe('strong');
    });

    it('应该处理相同价格', () => {
      const stock1 = createStock('000001', '平安银行', [10, 10, 10, 10, 10]);
      const stock2 = createStock('000002', '万科A', [20, 22, 24, 26, 28]);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(result.correlation).toBe(0);
    });

    it('应该包含置信度', () => {
      const stock1 = createStock('000001', '平安银行', [10, 11, 12, 13, 14, 15]);
      const stock2 = createStock('000002', '万科A', [20, 22, 24, 26, 28, 30]);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });
  });

  describe('Spearman相关性', () => {
    it('应该使用Spearman算法', () => {
      const engine2 = new CorrelationEngine({ algorithm: 'spearman', minDataPoints: 5, smoothing: 0 });
      const stock1 = createStock('000001', '平安银行', [10, 11, 12, 13, 14]);
      const stock2 = createStock('000002', '万科A', [20, 22, 24, 26, 28]);

      const result = engine2.computePairCorrelation(stock1, stock2);
      expect(result.correlation).toBeGreaterThan(0);
      expect(result.strength).toBe('strong');
    });
  });

  describe('Kendall相关性', () => {
    it('应该使用Kendall算法', () => {
      const engine2 = new CorrelationEngine({ algorithm: 'kendall', minDataPoints: 5, smoothing: 0 });
      const stock1 = createStock('000001', '平安银行', [10, 11, 12, 13, 14]);
      const stock2 = createStock('000002', '万科A', [20, 22, 24, 26, 28]);

      const result = engine2.computePairCorrelation(stock1, stock2);
      expect(result.correlation).toBeGreaterThan(0);
    });
  });

  describe('矩阵构建', () => {
    it('应该构建相关性矩阵', () => {
      const stocks = [
        createStock('000001', '平安银行', [10, 11, 12, 13, 14]),
        createStock('000002', '万科A', [20, 22, 24, 26, 28]),
        createStock('000003', 'PT金田', [5, 6, 7, 8, 9]),
      ];

      const matrix = engine.buildMatrix(stocks);
      expect(matrix.symbols).toHaveLength(3);
      expect(matrix.matrix).toHaveLength(3);
      expect(matrix.matrix[0]).toHaveLength(3);
      // 对角线为1
      expect(matrix.matrix[0][0]).toBe(1);
      expect(matrix.matrix[1][1]).toBe(1);
      expect(matrix.matrix[2][2]).toBe(1);
      // 对称性
      expect(matrix.matrix[0][1]).toBe(matrix.matrix[1][0]);
      expect(matrix.matrix[0][2]).toBe(matrix.matrix[2][0]);
    });

    it('应该计算矩阵统计信息', () => {
      const stocks = [
        createStock('000001', '平安银行', [10, 11, 12, 13, 14]),
        createStock('000002', '万科A', [20, 22, 24, 26, 28]),
        createStock('000003', 'PT金田', [5, 6, 7, 8, 9]),
      ];

      const matrix = engine.buildMatrix(stocks);
      expect(matrix.stats.avgCorrelation).toBeDefined();
      expect(matrix.stats.maxCorrelation).toBeGreaterThanOrEqual(matrix.stats.minCorrelation);
      expect(matrix.timestamp).toBeGreaterThan(0);
    });

    it('应该检测聚类', () => {
      const stocks = [
        createStock('000001', '平安银行', [10, 11, 12, 13, 14, 15]),
        createStock('000002', '万科A', [20, 22, 24, 26, 28, 30]),
        createStock('000003', 'PT金田', [100, 50, 100, 50, 100, 50]),
      ];

      const matrix = engine.buildMatrix(stocks);
      expect(Array.isArray(matrix.stats.clusters)).toBe(true);
    });
  });

  describe('投资组合分散度', () => {
    it('应该评估分散度', () => {
      const stocks = [
        createStock('000001', '平安银行', [10, 11, 12, 13, 14]),
        createStock('000002', '万科A', [20, 22, 24, 26, 28]),
      ];

      const matrix = engine.buildMatrix(stocks);
      const div = engine.calculateDiversification(matrix);
      expect(div.score).toBeGreaterThanOrEqual(0);
      expect(div.score).toBeLessThanOrEqual(100);
      expect(['excellent', 'good', 'moderate', 'poor']).toContain(div.level);
      expect(div.recommendation).toBeTruthy();
    });
  });

  describe('缓存', () => {
    it('应该缓存矩阵结果', () => {
      const stocks = [
        createStock('000001', '平安银行', [10, 11, 12, 13, 14]),
        createStock('000002', '万科A', [20, 22, 24, 26, 28]),
      ];

      const m1 = engine.buildMatrix(stocks);
      const m2 = engine.buildMatrix(stocks);
      expect(m1.timestamp).toBe(m2.timestamp);
    });

    it('应该清除缓存', () => {
      engine.clearCache();
      const stocks = [
        createStock('000001', '平安银行', [10, 11, 12, 13, 14]),
        createStock('000002', '万科A', [20, 22, 24, 26, 28]),
      ];

      const m = engine.buildMatrix(stocks);
      expect(m.timestamp).toBeGreaterThan(0);
    });
  });

  describe('配置', () => {
    it('应该更新配置', () => {
      engine.updateConfig({ algorithm: 'spearman', period: 30 });
      const stocks = [
        createStock('000001', '平安银行', [10, 11, 12, 13, 14]),
        createStock('000002', '万科A', [20, 22, 24, 26, 28]),
      ];

      const matrix = engine.buildMatrix(stocks);
      expect(matrix.config.algorithm).toBe('spearman');
      expect(matrix.config.period).toBe(30);
    });

    it('应该使用默认配置', () => {
      const stocks = [
        createStock('000001', '平安银行', [10, 11, 12, 13, 14]),
        createStock('000002', '万科A', [20, 22, 24, 26, 28]),
      ];

      const matrix = engine.buildMatrix(stocks);
      expect(matrix.config.algorithm).toBe('pearson');
      expect(matrix.config.period).toBe(60);
    });
  });

  describe('边界条件', () => {
    it('应该处理空数据', () => {
      const stock1 = createStock('000001', '平安银行', []);
      const stock2 = createStock('000002', '万科A', []);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(result.correlation).toBe(0);
    });

    it('应该处理单个价格', () => {
      const stock1 = createStock('000001', '平安银行', [10]);
      const stock2 = createStock('000002', '万科A', [20]);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(result.correlation).toBe(0);
    });

    it('应该处理不等长数据', () => {
      const stock1 = createStock('000001', '平安银行', [10, 11, 12]);
      const stock2 = createStock('000002', '万科A', [20, 22, 24, 26, 28]);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(typeof result.correlation).toBe('number');
    });

    it('应该处理零价格', () => {
      const stock1 = createStock('000001', '平安银行', [0, 10, 0, 15, 0]);
      const stock2 = createStock('000002', '万科A', [20, 22, 24, 26, 28]);

      const result = engine.computePairCorrelation(stock1, stock2);
      expect(typeof result.correlation).toBe('number');
    });

    it('应该处理大矩阵', () => {
      const stocks = Array.from({ length: 20 }, (_, i) =>
        createStock(`0000${String(i).padStart(2, '0')}`, `股票${i}`,
          Array.from({ length: 10 }, () => Math.random() * 100))
      );

      const matrix = engine.buildMatrix(stocks);
      expect(matrix.symbols).toHaveLength(20);
      expect(matrix.matrix).toHaveLength(20);
    });
  });
});
