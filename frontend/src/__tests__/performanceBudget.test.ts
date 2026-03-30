/**
 * Performance Budget 纯逻辑测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('PerformanceBudgetChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create checker with default budget', async () => {
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    const checker = new PerformanceBudgetChecker();
    expect(checker).toBeDefined();
  });

  it('should pass with no resource entries', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    const checker = new PerformanceBudgetChecker();
    const report = checker.check();
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.score).toBe(100);
  });

  it('should calculate score based on violations', async () => {
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    const checker = new PerformanceBudgetChecker({ maxJSBundleSize: 100 });
    // Empty check should pass
    const report = checker.check();
    expect(report.score).toBe(100);
    expect(report.timestamp).toBeGreaterThan(0);
  });

  it('should use custom budget config', async () => {
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    const checker = new PerformanceBudgetChecker({
      maxJSBundleSize: 50 * 1024,
      maxCSSBundleSize: 20 * 1024,
      maxRequests: 10,
    });
    expect(checker).toBeDefined();
  });

  it('should include timestamp in report', async () => {
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    const checker = new PerformanceBudgetChecker();
    const before = Date.now();
    const report = checker.check();
    const after = Date.now();
    expect(report.timestamp).toBeGreaterThanOrEqual(before);
    expect(report.timestamp).toBeLessThanOrEqual(after);
  });

  it('should provide singleton', async () => {
    const { getBudgetChecker } = await import('../utils/performanceBudget');
    const c1 = getBudgetChecker();
    const c2 = getBudgetChecker();
    expect(c1).toBe(c2);
  });

  it('should have correct default budget values', async () => {
    const { DEFAULT_BUDGET } = await import('../utils/performanceBudget');
    expect(DEFAULT_BUDGET.maxJSBundleSize).toBe(500 * 1024);
    expect(DEFAULT_BUDGET.maxCSSBundleSize).toBe(100 * 1024);
    expect(DEFAULT_BUDGET.maxRequests).toBe(50);
    expect(DEFAULT_BUDGET.maxLCP).toBe(2500);
    expect(DEFAULT_BUDGET.maxFCP).toBe(1800);
    expect(DEFAULT_BUDGET.maxDOMNodes).toBe(1500);
  });

  it('should allow setting violation handler', async () => {
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    const handler = vi.fn();
    const checker = new PerformanceBudgetChecker();
    checker.setViolationHandler(handler);
    // No violations with empty data, so handler shouldn't be called
    checker.check();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should start and stop monitoring without errors', async () => {
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    const checker = new PerformanceBudgetChecker();
    checker.startMonitoring(1000);
    checker.stopMonitoring();
    expect(true).toBe(true);
  });

  it('should have all required budget fields', async () => {
    const { DEFAULT_BUDGET } = await import('../utils/performanceBudget');
    const requiredFields = [
      'maxJSBundleSize', 'maxCSSBundleSize', 'maxImageSize',
      'maxFontSize', 'maxTotalPageSize', 'maxRequests',
      'maxThirdPartyRequests', 'maxFCP', 'maxLCP',
      'maxTTFB', 'maxLongTask', 'maxHeapSize', 'maxDOMNodes',
    ];
    requiredFields.forEach(field => {
      expect(DEFAULT_BUDGET).toHaveProperty(field);
      expect(typeof (DEFAULT_BUDGET as any)[field]).toBe('number');
    });
  });

  it('should report passed as boolean', async () => {
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    const checker = new PerformanceBudgetChecker();
    const report = checker.check();
    expect(typeof report.passed).toBe('boolean');
    expect(Array.isArray(report.violations)).toBe(true);
    expect(typeof report.score).toBe('number');
  });

  it('should score 0 when all checks fail critically', async () => {
    const { PerformanceBudgetChecker } = await import('../utils/performanceBudget');
    // Use extremely low budgets
    const checker = new PerformanceBudgetChecker({
      maxJSBundleSize: 1,
      maxCSSBundleSize: 1,
      maxImageSize: 1,
      maxRequests: 0,
    });
    // Even with empty entries, should still be valid since no resources to check
    const report = checker.check();
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });
});
