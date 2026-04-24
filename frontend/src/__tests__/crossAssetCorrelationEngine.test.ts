import { describe, it, expect } from 'vitest';
import { CrossAssetCorrelationEngine } from '../utils/crossAssetCorrelationEngine';

describe('Cross Asset Correlation Engine', () => {
  const engine = new CrossAssetCorrelationEngine();

  const makeReturns = (n = 100, corr = 0) => {
    const r1 = Array.from({ length: n }, () => (Math.random() - 0.5) * 0.02);
    const r2 = r1.map(r => r * corr + (Math.random() - 0.5) * 0.02 * (1 - Math.abs(corr)));
    return { r1, r2 };
  };

  describe('calcCorrelation', () => {
    it('应计算正相关', () => {
      const { r1, r2 } = makeReturns(100, 0.8);
      const result = engine.calcCorrelation(r1, r2);
      expect(result.correlation).toBeGreaterThan(0);
    });

    it('应计算负相关', () => {
      const { r1, r2 } = makeReturns(100, -0.8);
      const result = engine.calcCorrelation(r1, r2);
      expect(result.correlation).toBeLessThan(0);
    });

    it('相关系数应在-1到1之间', () => {
      const { r1, r2 } = makeReturns(100, 0.5);
      const result = engine.calcCorrelation(r1, r2);
      expect(result.correlation).toBeGreaterThanOrEqual(-1);
      expect(result.correlation).toBeLessThanOrEqual(1);
    });

    it('趋势应为有效值', () => {
      const { r1, r2 } = makeReturns(100, 0.5);
      const result = engine.calcCorrelation(r1, r2);
      expect(['strengthening', 'weakening', 'stable']).toContain(result.trend);
    });

    it('数据不足应返回零', () => {
      const result = engine.calcCorrelation([1, 2], [1, 2]);
      expect(result.correlation).toBe(0);
    });
  });

  describe('calcCorrelationMatrix', () => {
    it('应计算相关性矩阵', () => {
      const returnsMap = {
        A: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02),
        B: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02),
        C: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02),
      };
      const result = engine.calcCorrelationMatrix(returnsMap);
      expect(result.assets.length).toBe(3);
      expect(result.matrix.length).toBe(3);
      expect(result.matrix[0][0]).toBe(1);
    });

    it('分散化比率应在0-1之间', () => {
      const returnsMap = {
        A: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02),
        B: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02),
      };
      const result = engine.calcCorrelationMatrix(returnsMap);
      expect(result.diversificationRatio).toBeGreaterThanOrEqual(0);
      expect(result.diversificationRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('detectSafeHaven', () => {
    it('应检测避险模式', () => {
      const stock = Array.from({ length: 30 }, () => -0.01);
      const gold = Array.from({ length: 30 }, () => 0.01);
      const bond = Array.from({ length: 30 }, () => 0.005);
      const dollar = Array.from({ length: 30 }, () => 0.003);
      const result = engine.detectSafeHaven(stock, gold, bond, dollar);
      expect(result.isSafeHavenMode).toBe(true);
      expect(['low', 'medium', 'high', 'extreme']).toContain(result.riskLevel);
    });

    it('风险等级应为有效值', () => {
      const stock = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
      const gold = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.01);
      const bond = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.005);
      const dollar = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.005);
      const result = engine.detectSafeHaven(stock, gold, bond, dollar);
      expect(['low', 'medium', 'high', 'extreme']).toContain(result.riskLevel);
    });
  });

  describe('suggestAllocation', () => {
    it('应建议资产配置', () => {
      const stock = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
      const bond = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.005);
      const gold = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.01);
      const result = engine.suggestAllocation(stock, bond, gold, 'medium');
      const total = result.equityWeight + result.bondWeight + result.goldWeight + result.cashWeight;
      expect(Math.abs(total - 1)).toBeLessThan(0.02);
    });

    it('极端风险应降低股票配置', () => {
      const stock = Array.from({ length: 30 }, () => -0.02);
      const bond = Array.from({ length: 30 }, () => 0.005);
      const gold = Array.from({ length: 30 }, () => 0.01);
      const extreme = engine.suggestAllocation(stock, bond, gold, 'extreme');
      const normal = engine.suggestAllocation(stock, bond, gold, 'low');
      expect(extreme.equityWeight).toBeLessThan(normal.equityWeight);
    });
  });
});
