import { describe, it, expect } from 'vitest';
import { analyzeSupplyChain, SupplyChainData } from '../utils/supplyChainEngine';

describe('供应链风险分析引擎', () => {
  const healthySupplyChain: SupplyChainData = {
    suppliers: [
      { name: 'A', share: 0.15 }, { name: 'B', share: 0.12 },
      { name: 'C', share: 0.10 }, { name: 'D', share: 0.08 },
      { name: '其他', share: 0.55 },
    ],
    customers: [
      { name: 'X', share: 0.20 }, { name: 'Y', share: 0.15 },
      { name: 'Z', share: 0.10 }, { name: '其他', share: 0.55 },
    ],
    totalPurchases: 500_000_000,
    totalRevenue: 800_000_000,
    inventory: 80_000_000,
    cogs: 480_000_000,
    accountsPayable: 60_000_000,
    accountsReceivable: 80_000_000,
    inventoryTurnover: 6,
    payableTurnover: 8,
    industryAvgInventoryTurnover: 5,
    geopoliticalRisk: 0.1,
    singleSourceParts: 5,
    totalParts: 100,
  };

  it('应计算供应商集中度HHI', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(r.supplierConcentration).toBeGreaterThan(0);
    expect(r.supplierConcentration).toBeLessThan(1);
  });

  it('应计算客户集中度HHI', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(r.customerConcentration).toBeGreaterThan(0);
  });

  it('应评估存货健康度', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(['excellent', 'good', 'warning', 'critical']).toContain(r.inventoryHealth);
  });

  it('应评估议价能力', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(['strong', 'moderate', 'weak']).toContain(r.bargainingPower);
  });

  it('应计算供应链韧性', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(r.supplyChainResilience).toBeGreaterThan(30);
  });

  it('应输出风险等级', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(['low', 'medium', 'high', 'critical']).toContain(r.riskLevel);
  });

  it('应计算供应天数', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(r.supplyDays).toBeGreaterThan(0);
  });

  it('应计算回款天数', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(r.collectionDays).toBeGreaterThan(0);
  });

  it('应输出单一来源风险', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(r.singleSourceRisk).toBe(0.05);
  });

  it('应输出改进建议', () => {
    const r = analyzeSupplyChain(healthySupplyChain);
    expect(Array.isArray(r.recommendations)).toBe(true);
  });
});
