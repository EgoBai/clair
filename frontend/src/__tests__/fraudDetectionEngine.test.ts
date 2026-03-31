import { describe, it, expect } from 'vitest';
import { detectFraud, FinancialData } from '../utils/fraudDetectionEngine';

describe('财务造假检测引擎', () => {
  const normalData: FinancialData = {
    revenue: 10000, cogs: 6000, sga: 1500, depreciation: 500,
    netIncome: 2000, accountsReceivable: 1500, currentAssets: 5000,
    totalAssets: 20000, ppe: 8000, currentLiabilities: 3000, totalDebt: 5000,
    cashFromOperations: 2200, revenuePrior: 9000, arPrior: 1200,
    cogsPrior: 5500, currentAssetsPrior: 4500, ppePrior: 7500,
    currentLiabilitiesPrior: 2800,
  };

  const suspiciousData: FinancialData = {
    revenue: 15000, cogs: 7000, sga: 800, depreciation: 200,
    netIncome: 5000, accountsReceivable: 6000, currentAssets: 8000,
    totalAssets: 25000, ppe: 9000, currentLiabilities: 5000, totalDebt: 8000,
    cashFromOperations: 500, revenuePrior: 9000, arPrior: 1200,
    cogsPrior: 5500, currentAssetsPrior: 4500, ppePrior: 7500,
    currentLiabilitiesPrior: 2800,
  };

  it('应该计算M-Score', () => {
    const result = detectFraud(normalData);
    expect(typeof result.mScore.mScore).toBe('number');
  });

  it('正常公司M-Score应较低', () => {
    const result = detectFraud(normalData);
    expect(result.mScore.mScore).toBeLessThan(-1.78);
  });

  it('可疑公司应有更高风险', () => {
    const normal = detectFraud(normalData);
    const suspicious = detectFraud(suspiciousData);
    const normalFlags = normal.redFlags.length;
    const suspiciousFlags = suspicious.redFlags.length;
    expect(suspiciousFlags).toBeGreaterThanOrEqual(normalFlags);
  });

  it('应该计算现金流匹配度', () => {
    const result = detectFraud(normalData);
    expect(typeof result.cashFlowMismatch).toBe('number');
  });

  it('应该检测应收账款异常', () => {
    const result = detectFraud(suspiciousData);
    expect(typeof result.arTurnoverAnomaly).toBe('boolean');
  });

  it('应该检测毛利率异常', () => {
    const result = detectFraud(suspiciousData);
    expect(typeof result.grossMarginAnomaly).toBe('boolean');
  });

  it('应该判断整体风险等级', () => {
    const result = detectFraud(normalData);
    expect(['low', 'medium', 'high', 'critical']).toContain(result.overallRisk);
  });

  it('应该列出红旗', () => {
    const result = detectFraud(suspiciousData);
    expect(Array.isArray(result.redFlags)).toBe(true);
  });

  it('应该计算置信度', () => {
    const result = detectFraud(normalData);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it('应该计算M-Score各分量', () => {
    const result = detectFraud(normalData);
    expect(typeof result.mScore.dsri).toBe('number');
    expect(typeof result.mScore.gmi).toBe('number');
    expect(typeof result.mScore.tata).toBe('number');
  });

  it('可疑数据应生成红旗', () => {
    const result = detectFraud(suspiciousData);
    expect(result.redFlags.length).toBeGreaterThan(0);
  });

  it('应该判断操纵概率', () => {
    const result = detectFraud(normalData);
    expect(['low', 'moderate', 'high']).toContain(result.mScore.manipulationProbability);
  });
});
