import { describe, it, expect } from 'vitest';
import {
  SupplyChainRiskEngine,
  type SupplyNode,
  type SupplyChain,
} from '../utils/supplyChainRiskEngine';

/**
 * 供应链风险引擎测试 (导入真实模块)
 */

const engine = new SupplyChainRiskEngine();

function makeNode(over: Partial<SupplyNode> = {}): SupplyNode {
  return {
    id: 'n1',
    name: 'Node1',
    type: 'supplier',
    tier: 1,
    revenueShare: 30,
    country: '中国',
    industry: '电子',
    isExclusive: false,
    ...over,
  };
}

function makeChain(over: Partial<SupplyChain> = {}): SupplyChain {
  return {
    companyId: '600519',
    companyName: '测试公司',
    suppliers: [],
    customers: [],
    createdAt: '2024-01-01',
    ...over,
  };
}

describe('SupplyChainRiskEngine.calculateConcentrationRisk', () => {
  it('空供应链应为低风险', () => {
    const r = engine.calculateConcentrationRisk(makeChain());
    expect(r.supplierHHI).toBe(0);
    expect(r.customerHHI).toBe(0);
    expect(r.topSupplierShare).toBe(0);
    expect(r.singleSourceRisk).toBe(0);
    expect(r.riskLevel).toBe('low');
  });

  it('独家高占比应为极高风险', () => {
    const chain = makeChain({
      suppliers: [makeNode({ revenueShare: 100, country: '中国', isExclusive: true })],
    });
    const r = engine.calculateConcentrationRisk(chain);
    expect(r.singleSourceRisk).toBe(100);
    expect(r.riskLevel).toBe('critical');
  });

  it('应计算前5大供应商占比', () => {
    const chain = makeChain({
      suppliers: [
        makeNode({ id: 's1', revenueShare: 40 }),
        makeNode({ id: 's2', revenueShare: 30 }),
      ],
    });
    const r = engine.calculateConcentrationRisk(chain);
    expect(r.topSupplierShare).toBe(70);
  });
});

describe('SupplyChainRiskEngine.assessDisruptionRisk', () => {
  it('应评估中断影响', () => {
    const node = makeNode({ id: 's1', name: '供应商A', country: '中国', revenueShare: 40, isExclusive: true });
    const factors = [{ type: 'geopolitical', probability: 0.5, region: '中国' }];
    const disruptions = engine.assessDisruptionRisk(node, factors);
    expect(disruptions).toHaveLength(1);
    const d = disruptions[0];
    expect(d.disruptionType).toBe('geopolitical');
    expect(d.impact).toBeCloseTo(60, 1); // 40 * 1.5
    expect(d.probability).toBeCloseTo(0.65, 2); // 0.5 * 1.3
    expect(d.mitigationOptions).toContain('寻找替代供应商');
    expect(d.timeToRecover).toBe(90);
  });

  it('非本地区域因子应被忽略', () => {
    const node = makeNode({ id: 's1', country: '中国' });
    const factors = [{ type: 'geopolitical', probability: 0.5, region: '美国' }];
    const disruptions = engine.assessDisruptionRisk(node, factors);
    expect(disruptions).toHaveLength(0);
  });
});

describe('SupplyChainRiskEngine.calculateResilience', () => {
  it('评分应在 0-100 范围', () => {
    const chain = makeChain({
      suppliers: [
        makeNode({ country: '中国', industry: '电子', tier: 1 }),
        makeNode({ id: 's2', country: '美国', industry: '机械', tier: 2 }),
      ],
    });
    const r = engine.calculateResilience(chain);
    expect(r.diversificationScore).toBeGreaterThan(0);
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
    expect(r.overallScore).toBeLessThanOrEqual(100);
  });
});

describe('SupplyChainRiskEngine.stressTest', () => {
  it('应计算收入影响', () => {
    const chain = makeChain({
      suppliers: [
        makeNode({ id: 's1', revenueShare: 50, tier: 1 }),
        makeNode({ id: 's2', revenueShare: 50, tier: 2 }),
      ],
    });
    const results = engine.stressTest(chain, [{ name: '断供', affectedNodes: ['s1'], severity: 100 }]);
    expect(results).toHaveLength(1);
    expect(results[0].revenueImpact).toBe(50); // 50 * 100 / 100
    expect(results[0].mitigated).toBe(false);
  });
});

describe('SupplyChainRiskEngine.findAlternatives', () => {
  it('应找到同类替代供应商', () => {
    const node = makeNode({ id: 's1', type: 'supplier', industry: '电子', country: '中国', tier: 1, revenueShare: 30 });
    const all = [
      node,
      makeNode({ id: 's2', industry: '电子', country: '中国', tier: 1, revenueShare: 20 }),
      makeNode({ id: 's3', type: 'customer', industry: '电子' }),
    ];
    const alternatives = engine.findAlternatives(node, all);
    expect(alternatives.length).toBeGreaterThanOrEqual(1);
    expect(alternatives[0].supplier.id).toBe('s2');
  });
});
