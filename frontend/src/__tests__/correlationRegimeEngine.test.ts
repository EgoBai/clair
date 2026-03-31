/**
 * 相关性体制检测引擎测试
 */
import { describe, it, expect } from 'vitest';
import { CorrelationRegimeEngine } from '../utils/correlationRegimeEngine';
import type { CorrelationMatrix } from '../utils/correlationRegimeEngine';

describe('CorrelationRegimeEngine', () => {
  const engine = new CorrelationRegimeEngine();

  const generateReturns = (count: number, correlation: number = 0) => {
    const r1 = Array.from({ length: count }, () => (Math.random() - 0.5) * 0.04);
    const r2 = r1.map(v => v * correlation + (Math.random() - 0.5) * 0.04 * (1 - Math.abs(correlation)));
    return { r1, r2 };
  };

  describe('calculateCorrelation', () => {
    it('应该计算相关性矩阵', () => {
      const returns = new Map<string, number[]>();
      returns.set('asset1', Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04));
      returns.set('asset2', Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04));
      returns.set('asset3', Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04));

      const result = engine.calculateCorrelation(returns);

      expect(result.assets.length).toBe(3);
      expect(result.matrix.length).toBe(3);
      expect(result.matrix[0][0]).toBe(1); // 对角线为1
      expect(result.matrix[0][1]).toBeGreaterThanOrEqual(-1);
      expect(result.matrix[0][1]).toBeLessThanOrEqual(1);
      expect(result.matrix[0][1]).toBe(result.matrix[1][0]); // 对称
    });

    it('高度正相关的资产应返回高相关系数', () => {
      const returns = new Map<string, number[]>();
      const base = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.04);
      returns.set('asset1', base);
      returns.set('asset2', base.map(v => v + (Math.random() - 0.5) * 0.001));

      const result = engine.calculateCorrelation(returns);
      expect(result.matrix[0][1]).toBeGreaterThan(0.8);
    });

    it('空数据应返回空矩阵', () => {
      const result = engine.calculateCorrelation(new Map());
      expect(result.assets.length).toBe(0);
      expect(result.matrix.length).toBe(0);
    });
  });

  describe('detectRegime', () => {
    it('应该检测相关性体制', () => {
      const matrix: CorrelationMatrix = {
        assets: ['a', 'b', 'c'],
        matrix: [[1, 0.6, 0.5], [0.6, 1, 0.7], [0.5, 0.7, 1]],
        timestamp: Date.now()
      };

      const result = engine.detectRegime(matrix);

      expect(['low', 'normal', 'high', 'crisis']).toContain(result.regime);
      expect(result.avgCorrelation).toBeGreaterThan(0);
      expect(result.maxCorrelation).toBeGreaterThanOrEqual(result.minCorrelation);
      expect(result.dispersion).toBeGreaterThanOrEqual(0);
      expect(['risk_on', 'risk_off', 'neutral']).toContain(result.riskOnOff);
    });

    it('高相关矩阵应检测危机体制', () => {
      const matrix: CorrelationMatrix = {
        assets: ['a', 'b', 'c'],
        matrix: [[1, 0.9, 0.85], [0.9, 1, 0.88], [0.85, 0.88, 1]],
        timestamp: Date.now()
      };

      const result = engine.detectRegime(matrix);
      expect(result.regime).toBe('crisis');
      expect(result.riskOnOff).toBe('risk_off');
    });

    it('低相关矩阵应检测低体制', () => {
      const matrix: CorrelationMatrix = {
        assets: ['a', 'b', 'c'],
        matrix: [[1, 0.05, -0.02], [0.05, 1, 0.08], [-0.02, 0.08, 1]],
        timestamp: Date.now()
      };

      const result = engine.detectRegime(matrix);
      expect(result.regime).toBe('low');
      expect(result.riskOnOff).toBe('risk_on');
    });
  });

  describe('analyzeDynamicCorrelation', () => {
    it('应该分析动态相关性', () => {
      const { r1, r2 } = generateReturns(100, 0.5);
      const result = engine.analyzeDynamicCorrelation(r1, r2, 'A', 'B', 20);

      expect(result.asset1).toBe('A');
      expect(result.asset2).toBe('B');
      expect(result.rollingCorr.length).toBeGreaterThan(0);
      expect(result.ewmaCorr.length).toBe(result.rollingCorr.length);
      expect(['increasing', 'decreasing', 'stable']).toContain(result.trend);
      expect(result.currentRegime).toBeTruthy();
    });

    it('不足数据应返回空', () => {
      const result = engine.analyzeDynamicCorrelation([1, 2, 3], [1, 2, 3], 'A', 'B', 20);
      expect(result.rollingCorr.length).toBe(0);
    });
  });

  describe('analyzeTailDependency', () => {
    it('应该分析尾部依赖', () => {
      const { r1, r2 } = generateReturns(200, 0.6);
      const result = engine.analyzeTailDependency(r1, r2, 'A', 'B');

      expect(result.asset1).toBe('A');
      expect(result.asset2).toBe('B');
      expect(result.lowerTailDep).toBeGreaterThanOrEqual(0);
      expect(result.lowerTailDep).toBeLessThanOrEqual(1);
      expect(result.upperTailDep).toBeGreaterThanOrEqual(0);
      expect(result.upperTailDep).toBeLessThanOrEqual(1);
      expect(typeof result.asymmetry).toBe('number');
      expect(typeof result.crisisAmplification).toBe('number');
    });

    it('不足数据应返回零值', () => {
      const result = engine.analyzeTailDependency([1, 2], [1, 2], 'A', 'B');
      expect(result.lowerTailDep).toBe(0);
      expect(result.upperTailDep).toBe(0);
    });
  });

  describe('analyzeStability', () => {
    it('应该分析相关性稳定性', () => {
      const series: CorrelationMatrix[] = Array.from({ length: 50 }, () => ({
        assets: ['a', 'b'],
        matrix: [[1, 0.5 + (Math.random() - 0.5) * 0.1], [0.5 + (Math.random() - 0.5) * 0.1, 1]],
        timestamp: Date.now()
      }));

      const result = engine.analyzeStability(series);

      expect(result.overallStability).toBeGreaterThanOrEqual(0);
      expect(result.overallStability).toBeLessThanOrEqual(100);
      expect(result.mostStablePairs.length).toBeGreaterThan(0);
      expect(result.structuralBreaks).toBeGreaterThanOrEqual(0);
      expect(result.regimePersistence).toBeGreaterThanOrEqual(0);
      expect(result.regimePersistence).toBeLessThanOrEqual(1);
    });

    it('不足数据应返回默认值', () => {
      const result = engine.analyzeStability([]);
      expect(result.overallStability).toBe(50);
      expect(result.structuralBreaks).toBe(0);
    });
  });
});
