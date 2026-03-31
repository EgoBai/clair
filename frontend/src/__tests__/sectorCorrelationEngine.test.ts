import { describe, it, expect } from 'vitest';
import { SectorCorrelationEngine } from '../utils/sectorCorrelationEngine';

describe('SectorCorrelationEngine', () => {
  const engine = new SectorCorrelationEngine();

  describe('Pearson相关系数', () => {
    it('完全正相关应为1', () => {
      const x = [1, 2, 3, 4, 5];
      expect(engine.pearsonCorrelation(x, x)).toBe(1);
    });

    it('完全负相关应为-1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 4, 3, 2, 1];
      expect(engine.pearsonCorrelation(x, y)).toBe(-1);
    });

    it('不相关应接近0', () => {
      const x = [1, -1, 1, -1, 1, -1, 1, -1];
      const y = [1, 1, -1, -1, 1, 1, -1, -1];
      expect(Math.abs(engine.pearsonCorrelation(x, y))).toBeLessThan(0.5);
    });

    it('单数据点应返回0', () => {
      expect(engine.pearsonCorrelation([1], [2])).toBe(0);
    });

    it('空数据应返回0', () => {
      expect(engine.pearsonCorrelation([], [])).toBe(0);
    });

    it('常数序列应返回0', () => {
      expect(engine.pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  describe('相关性矩阵', () => {
    it('应计算对称矩阵', () => {
      const returns = {
        '科技': [0.01, 0.02, -0.01, 0.03],
        '消费': [0.005, 0.01, -0.005, 0.015],
        '金融': [-0.01, 0.005, 0.02, -0.005],
      };
      const matrix = engine.computeCorrelationMatrix(returns);
      expect(matrix.sectors).toEqual(['科技', '消费', '金融']);
      expect(matrix.matrix.length).toBe(3);
      expect(matrix.matrix[0].length).toBe(3);

      // 对称性
      expect(matrix.matrix[0][1]).toBe(matrix.matrix[1][0]);
      // 对角线为1
      expect(matrix.matrix[0][0]).toBe(1);
      expect(matrix.matrix[1][1]).toBe(1);
    });

    it('对角线应为1', () => {
      const returns = { 'A': [1, 2, 3], 'B': [4, 5, 6] };
      const matrix = engine.computeCorrelationMatrix(returns);
      for (let i = 0; i < matrix.sectors.length; i++) {
        expect(matrix.matrix[i][i]).toBe(1);
      }
    });
  });

  describe('相关性变化检测', () => {
    it('应检测相关性变化', () => {
      const current = {
        'A': [0.01, 0.02, 0.01, 0.02],
        'B': [0.01, 0.02, 0.01, 0.02], // 高相关
      };
      const previous = {
        'A': [0.01, -0.01, 0.01, -0.01],
        'B': [-0.01, 0.01, -0.01, 0.01], // 之前不相关
      };
      const changes = engine.detectCorrelationChanges(current, previous);
      expect(changes.length).toBeGreaterThan(0);
    });

    it('无显著变化应返回空', () => {
      const data = {
        'A': [0.01, 0.02, 0.01, 0.02],
        'B': [0.005, 0.01, 0.005, 0.01],
      };
      const changes = engine.detectCorrelationChanges(data, data);
      expect(changes.length).toBe(0);
    });

    it('应按变化幅度排序', () => {
      const current = {
        'A': [0.01, 0.02, 0.01, 0.02],
        'B': [0.01, 0.02, 0.01, 0.02],
        'C': [-0.01, 0.01, -0.01, 0.01],
      };
      const previous = {
        'A': [0.01, 0.01, 0.01, 0.01],
        'B': [-0.01, -0.01, -0.01, -0.01],
        'C': [0.01, 0.01, 0.01, 0.01],
      };
      const changes = engine.detectCorrelationChanges(current, previous);
      for (let i = 1; i < changes.length; i++) {
        expect(Math.abs(changes[i - 1].change)).toBeGreaterThanOrEqual(Math.abs(changes[i].change));
      }
    });
  });

  describe('相关性聚类', () => {
    it('应将高相关板块聚为一类', () => {
      const corrMatrix = {
        sectors: ['A', 'B', 'C', 'D'],
        matrix: [
          [1, 0.9, 0.1, 0.1],
          [0.9, 1, 0.1, 0.1],
          [0.1, 0.1, 1, 0.8],
          [0.1, 0.1, 0.8, 1],
        ],
      };
      const clusters = engine.clusterSectors(corrMatrix, 0.5);
      expect(clusters.length).toBe(2);
      expect(clusters[0].members.length).toBe(2);
      expect(clusters[1].members.length).toBe(2);
    });

    it('所有板块互不相关时应各自成类', () => {
      const corrMatrix = {
        sectors: ['A', 'B', 'C'],
        matrix: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      };
      const clusters = engine.clusterSectors(corrMatrix, 0.5);
      expect(clusters.length).toBe(3);
    });

    it('完全相关时应聚为一类', () => {
      const corrMatrix = {
        sectors: ['A', 'B', 'C'],
        matrix: [
          [1, 1, 1],
          [1, 1, 1],
          [1, 1, 1],
        ],
      };
      const clusters = engine.clusterSectors(corrMatrix, 0.5);
      expect(clusters.length).toBe(1);
      expect(clusters[0].members.length).toBe(3);
    });

    it('应包含组内平均相关性', () => {
      const corrMatrix = {
        sectors: ['A', 'B'],
        matrix: [[1, 0.8], [0.8, 1]],
      };
      const clusters = engine.clusterSectors(corrMatrix);
      expect(clusters[0].avgIntraCorrelation).toBeCloseTo(0.8, 1);
    });
  });

  describe('分散化评分', () => {
    it('低相关组合应得高分', () => {
      const corrMatrix = {
        sectors: ['A', 'B', 'C'],
        matrix: [
          [1, 0.1, 0.1],
          [0.1, 1, 0.1],
          [0.1, 0.1, 1],
        ],
      };
      const result = engine.assessDiversification(corrMatrix, ['A', 'B', 'C']);
      expect(result.score).toBeGreaterThan(70);
    });

    it('高相关组合应得低分', () => {
      const corrMatrix = {
        sectors: ['A', 'B', 'C'],
        matrix: [
          [1, 0.9, 0.9],
          [0.9, 1, 0.9],
          [0.9, 0.9, 1],
        ],
      };
      const result = engine.assessDiversification(corrMatrix, ['A', 'B', 'C']);
      expect(result.score).toBeLessThan(20);
    });

    it('应识别独立对', () => {
      const corrMatrix = {
        sectors: ['A', 'B', 'C'],
        matrix: [
          [1, 0.1, 0.9],
          [0.1, 1, 0.2],
          [0.9, 0.2, 1],
        ],
      };
      const result = engine.assessDiversification(corrMatrix, ['A', 'B', 'C']);
      expect(result.independentPairs.length).toBeGreaterThan(0);
    });

    it('应识别高相关对', () => {
      const corrMatrix = {
        sectors: ['A', 'B', 'C'],
        matrix: [
          [1, 0.1, 0.95],
          [0.1, 1, 0.2],
          [0.95, 0.2, 1],
        ],
      };
      const result = engine.assessDiversification(corrMatrix, ['A', 'B', 'C']);
      expect(result.correlatedPairs.length).toBeGreaterThan(0);
    });

    it('空组合应得100分', () => {
      const corrMatrix = { sectors: ['A'], matrix: [[1]] };
      const result = engine.assessDiversification(corrMatrix, []);
      expect(result.score).toBe(100);
    });
  });
});
