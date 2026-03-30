/**
 * 构建产物分析器测试
 */
import { describe, it, expect } from 'vitest';

describe('构建产物分析器', () => {
  describe('模块导出', () => {
    it('导出所有分析函数', async () => {
      const mod = await import('../utils/buildAnalyzer');
      expect(mod.BUDGETS).toBeDefined();
      expect(mod.checkBudget).toBeDefined();
      expect(mod.estimateGzipSize).toBeDefined();
      expect(mod.analyzeLoadedResources).toBeDefined();
      expect(mod.generatePerformanceReport).toBeDefined();
    });
  });

  describe('BUDGETS 阈值', () => {
    it('初始 bundle 预算为 300KB', async () => {
      const { BUDGETS } = await import('../utils/buildAnalyzer');
      expect(BUDGETS.maxInitialBundle).toBe(300 * 1024);
    });

    it('单 chunk 预算为 500KB', async () => {
      const { BUDGETS } = await import('../utils/buildAnalyzer');
      expect(BUDGETS.maxSingleChunk).toBe(500 * 1024);
    });

    it('总 JS 预算为 1.5MB', async () => {
      const { BUDGETS } = await import('../utils/buildAnalyzer');
      expect(BUDGETS.maxTotalJS).toBe(1500 * 1024);
    });

    it('CSS 预算为 200KB', async () => {
      const { BUDGETS } = await import('../utils/buildAnalyzer');
      expect(BUDGETS.maxCSS).toBe(200 * 1024);
    });

    it('单图预算为 100KB', async () => {
      const { BUDGETS } = await import('../utils/buildAnalyzer');
      expect(BUDGETS.maxImage).toBe(100 * 1024);
    });

    it('单字体预算为 100KB', async () => {
      const { BUDGETS } = await import('../utils/buildAnalyzer');
      expect(BUDGETS.maxFont).toBe(100 * 1024);
    });
  });

  describe('checkBudget', () => {
    it('通过预算检查时 passed 为 true', async () => {
      const { checkBudget } = await import('../utils/buildAnalyzer');
      const result = checkBudget('maxSingleChunk', 100 * 1024);
      expect(result.passed).toBe(true);
      expect(result.overage).toBe(0);
    });

    it('超过预算时 passed 为 false', async () => {
      const { checkBudget } = await import('../utils/buildAnalyzer');
      const result = checkBudget('maxSingleChunk', 600 * 1024);
      expect(result.passed).toBe(false);
      expect(result.overage).toBe(100 * 1024);
    });

    it('返回正确的预算值', async () => {
      const { checkBudget } = await import('../utils/buildAnalyzer');
      const result = checkBudget('maxInitialBundle', 100);
      expect(result.budget).toBe(300 * 1024);
      expect(result.actual).toBe(100);
    });

    it('边界值：等于预算时通过', async () => {
      const { checkBudget } = await import('../utils/buildAnalyzer');
      const result = checkBudget('maxSingleChunk', 500 * 1024);
      expect(result.passed).toBe(true);
    });

    it('边界值：超过1字节时失败', async () => {
      const { checkBudget } = await import('../utils/buildAnalyzer');
      const result = checkBudget('maxSingleChunk', 500 * 1024 + 1);
      expect(result.passed).toBe(false);
    });
  });

  describe('estimateGzipSize', () => {
    it('估算 gzip 大小约为原始的 30%', async () => {
      const { estimateGzipSize } = await import('../utils/buildAnalyzer');
      const original = 1000;
      const estimated = estimateGzipSize(original);
      expect(estimated).toBe(300);
    });

    it('0 字节返回 0', async () => {
      const { estimateGzipSize } = await import('../utils/buildAnalyzer');
      expect(estimateGzipSize(0)).toBe(0);
    });

    it('返回整数', async () => {
      const { estimateGzipSize } = await import('../utils/buildAnalyzer');
      const result = estimateGzipSize(333);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('analyzeLoadedResources', () => {
    it('返回分析对象', async () => {
      const { analyzeLoadedResources } = await import('../utils/buildAnalyzer');
      const analysis = analyzeLoadedResources();
      expect(analysis).toHaveProperty('totalSize');
      expect(analysis).toHaveProperty('totalGzipSize');
      expect(analysis).toHaveProperty('chunks');
      expect(analysis).toHaveProperty('topModules');
      expect(analysis).toHaveProperty('recommendations');
    });

    it('chunks 是数组', async () => {
      const { analyzeLoadedResources } = await import('../utils/buildAnalyzer');
      const analysis = analyzeLoadedResources();
      expect(Array.isArray(analysis.chunks)).toBe(true);
    });

    it('recommendations 是数组', async () => {
      const { analyzeLoadedResources } = await import('../utils/buildAnalyzer');
      const analysis = analyzeLoadedResources();
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });
  });

  describe('generatePerformanceReport', () => {
    it('返回 JSON 字符串', async () => {
      const { generatePerformanceReport } = await import('../utils/buildAnalyzer');
      const report = generatePerformanceReport();
      expect(() => JSON.parse(report)).not.toThrow();
    });

    it('JSON 包含预期字段', async () => {
      const { generatePerformanceReport } = await import('../utils/buildAnalyzer');
      const report = JSON.parse(generatePerformanceReport());
      expect(report).toHaveProperty('totalSize');
      expect(report).toHaveProperty('chunks');
      expect(report).toHaveProperty('recommendations');
    });
  });
});
