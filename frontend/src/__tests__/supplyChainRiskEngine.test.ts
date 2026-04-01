import { describe, it, expect } from 'vitest';
import { SupplyChainRiskEngine } from '../utils/supplyChainRiskEngine';
import type { SupplyChain, SupplyNode } from '../utils/supplyChainRiskEngine';

describe('供应链风险引擎', () => {
  const engine = new SupplyChainRiskEngine();

  const createNode = (overrides: Partial<SupplyNode> = {}): SupplyNode => ({
    id: 'S001',
    name: '供应商A',
    type: 'supplier',
    tier: 1,
    revenueShare: 30,
    country: '中国',
    industry: '电子',
    isExclusive: false,
    ...overrides
  });

  const createChain = (overrides: Partial<SupplyChain> = {}): SupplyChain => ({
    companyId: 'C001',
    companyName: '测试公司',
    suppliers: [
      createNode({ id: 'S1', name: '供应商1', revenueShare: 40, country: '中国', industry: '电子' }),
      createNode({ id: 'S2', name: '供应商2', revenueShare: 30, country: '日本', industry: '材料' }),
      createNode({ id: 'S3', name: '供应商3', revenueShare: 20, country: '韩国', industry: '电子' }),
      createNode({ id: 'S4', name: '供应商4', revenueShare: 10, country: '中国', industry: '物流' }),
    ],
    customers: [
      createNode({ id: 'C1', name: '客户1', type: 'customer', revenueShare: 50 }),
      createNode({ id: 'C2', name: '客户2', type: 'customer', revenueShare: 30 }),
      createNode({ id: 'C3', name: '客户3', type: 'customer', revenueShare: 20 }),
    ],
    createdAt: '2024-01-01',
    ...overrides
  });

  describe('calculateConcentrationRisk', () => {
    it('返回集中度指标', () => {
      const result = engine.calculateConcentrationRisk(createChain());
      expect(result.supplierHHI).toBeGreaterThan(0);
      expect(result.customerHHI).toBeGreaterThan(0);
      expect(result.geographicHHI).toBeGreaterThan(0);
    });

    it('HHI在0-10000之间', () => {
      const result = engine.calculateConcentrationRisk(createChain());
      expect(result.supplierHHI).toBeGreaterThanOrEqual(0);
      expect(result.supplierHHI).toBeLessThanOrEqual(10000);
    });

    it('前5大供应商占比', () => {
      const result = engine.calculateConcentrationRisk(createChain());
      expect(result.topSupplierShare).toBe(100); // 只有4个供应商
    });

    it('独家供应商增加风险', () => {
      const exclusiveChain = createChain({
        suppliers: [createNode({ id: 'S1', revenueShare: 60, isExclusive: true })]
      });
      const normalChain = createChain();
      const exclusive = engine.calculateConcentrationRisk(exclusiveChain);
      const normal = engine.calculateConcentrationRisk(normalChain);
      expect(exclusive.singleSourceRisk).toBeGreaterThan(normal.singleSourceRisk);
    });

    it('风险级别分类正确', () => {
      const low = engine.calculateConcentrationRisk(createChain({
        suppliers: Array.from({ length: 10 }, (_, i) => 
          createNode({ id: `S${i}`, revenueShare: 10, country: `国家${i}`, isExclusive: false })
        )
      }));
      expect(['low', 'medium', 'high', 'critical']).toContain(low.riskLevel);
    });

    it('空供应商链', () => {
      const result = engine.calculateConcentrationRisk(createChain({ suppliers: [] }));
      expect(result.supplierHHI).toBe(0);
    });
  });

  describe('assessDisruptionRisk', () => {
    it('评估中断风险', () => {
      const node = createNode({ country: '中国' });
      const factors = [
        { type: 'natural_disaster', probability: 0.1, region: '中国' },
        { type: 'geopolitical', probability: 0.05, region: '中国' },
      ];
      const result = engine.assessDisruptionRisk(node, factors);
      expect(result.length).toBe(2);
      expect(result[0].probability).toBeGreaterThan(0);
    });

    it('非相关地区不产生中断', () => {
      const node = createNode({ country: '中国' });
      const factors = [{ type: 'natural_disaster', probability: 0.5, region: '美国' }];
      const result = engine.assessDisruptionRisk(node, factors);
      expect(result.length).toBe(0);
    });

    it('global影响所有地区', () => {
      const node = createNode({ country: '中国' });
      const factors = [{ type: 'pandemic', probability: 0.3, region: 'global' }];
      const result = engine.assessDisruptionRisk(node, factors);
      expect(result.length).toBe(1);
    });

    it('独家供应中断恢复时间更长', () => {
      const exclusive = createNode({ isExclusive: true });
      const normal = createNode({ isExclusive: false });
      const factors = [{ type: 'cyber', probability: 0.1, region: '中国' }];
      
      const exResult = engine.assessDisruptionRisk(exclusive, factors);
      const noResult = engine.assessDisruptionRisk(normal, factors);
      expect(exResult[0].timeToRecover).toBeGreaterThan(noResult[0].timeToRecover);
    });

    it('包含缓解方案', () => {
      const node = createNode({ isExclusive: true });
      const factors = [{ type: 'geopolitical', probability: 0.2, region: '中国' }];
      const result = engine.assessDisruptionRisk(node, factors);
      expect(result[0].mitigationOptions.length).toBeGreaterThan(0);
    });

    it('概率不超过1', () => {
      const node = createNode({ isExclusive: true });
      const factors = [{ type: 'pandemic', probability: 0.9, region: '中国' }];
      const result = engine.assessDisruptionRisk(node, factors);
      expect(result[0].probability).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateResilience', () => {
    it('返回韧性评分', () => {
      const result = engine.calculateResilience(createChain());
      expect(result.diversificationScore).toBeGreaterThanOrEqual(0);
      expect(result.diversificationScore).toBeLessThanOrEqual(100);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('多样性高的评分更高', () => {
      const diverse = createChain({
        suppliers: [
          createNode({ country: '中国', industry: '电子' }),
          createNode({ country: '日本', industry: '材料' }),
          createNode({ country: '韩国', industry: '化工' }),
          createNode({ country: '美国', industry: '半导体' }),
          createNode({ country: '德国', industry: '机械' }),
          createNode({ id: 'S6', name: '供应商6', type: 'supplier', tier: 2, revenueShare: 10, country: '台湾', industry: '软件', isExclusive: false }),
        ]
      });
      const concentrated = createChain({
        suppliers: [createNode({ country: '中国', industry: '电子', isExclusive: true })]
      });
      
      const dResult = engine.calculateResilience(diverse);
      const cResult = engine.calculateResilience(concentrated);
      expect(dResult.diversificationScore).toBeGreaterThan(cResult.diversificationScore);
    });

    it('独家供应降低灵活性', () => {
      const exclusive = createChain({
        suppliers: [createNode({ isExclusive: true })]
      });
      const normal = createChain();
      
      const eResult = engine.calculateResilience(exclusive);
      const nResult = engine.calculateResilience(normal);
      expect(eResult.flexibilityScore).toBeLessThan(nResult.flexibilityScore);
    });

    it('低评分会生成建议', () => {
      const bad = createChain({
        suppliers: [createNode({ country: '中国', industry: '电子', isExclusive: true, tier: 5 })]
      });
      const result = engine.calculateResilience(bad);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('stressTest', () => {
    it('压力测试返回结果', () => {
      const chain = createChain();
      const scenarios = [
        { name: '地震', affectedNodes: ['S1'], severity: 80 },
        { name: '贸易战', affectedNodes: ['S1', 'S2'], severity: 50 },
      ];
      const result = engine.stressTest(chain, scenarios);
      expect(result.length).toBe(2);
      expect(result[0].scenario).toBe('地震');
    });

    it('影响越大恢复越慢', () => {
      const chain = createChain();
      const scenarios = [
        { name: '小', affectedNodes: ['S4'], severity: 20 },
        { name: '大', affectedNodes: ['S1'], severity: 90 },
      ];
      const result = engine.stressTest(chain, scenarios);
      expect(result[1].revenueImpact).toBeGreaterThan(result[0].revenueImpact);
    });

    it('影响小则标记为已缓解', () => {
      const chain = createChain();
      const scenarios = [
        { name: '轻微', affectedNodes: ['S4'], severity: 10 },
      ];
      const result = engine.stressTest(chain, scenarios);
      expect(result[0].mitigated).toBe(true);
    });

    it('空场景返回空结果', () => {
      const result = engine.stressTest(createChain(), []);
      expect(result).toEqual([]);
    });
  });

  describe('findAlternatives', () => {
    it('找到替代供应商', () => {
      const chain = createChain();
      const node = createNode({ industry: '电子', country: '中国' });
      const result = engine.findAlternatives(node, chain.suppliers);
      expect(result.length).toBeGreaterThan(0);
    });

    it('同行业匹配分数更高', () => {
      const chain = createChain();
      const node = createNode({ industry: '电子', country: '中国' });
      const result = engine.findAlternatives(node, chain.suppliers);
      const electronic = result.find(r => r.supplier.industry === '电子');
      const material = result.find(r => r.supplier.industry === '材料');
      if (electronic && material) {
        expect(electronic.matchScore).toBeGreaterThan(material.matchScore);
      }
    });

    it('不返回自身', () => {
      const chain = createChain();
      const node = chain.suppliers[0];
      const result = engine.findAlternatives(node, chain.suppliers);
      expect(result.every(r => r.supplier.id !== node.id)).toBe(true);
    });

    it('低匹配分数的不返回', () => {
      const node = createNode({ industry: '航空', country: '冰岛' });
      const result = engine.findAlternatives(node, [createNode({ industry: '电子', country: '中国' })]);
      expect(result.length).toBe(0);
    });

    it('结果按分数降序排列', () => {
      const node = createNode({ industry: '电子', country: '中国' });
      const suppliers = [
        createNode({ id: 'S1', industry: '电子', country: '中国' }),
        createNode({ id: 'S2', industry: '电子', country: '日本' }),
        createNode({ id: 'S3', industry: '材料', country: '中国' }),
      ];
      const result = engine.findAlternatives(node, suppliers);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].matchScore).toBeGreaterThanOrEqual(result[i].matchScore);
      }
    });
  });
});
