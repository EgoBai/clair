import { describe, it, expect } from 'vitest';

// 供应链风险评估引擎
interface SupplyNode {
  symbol: string;
  name: string;
  tier: number;
  revenueFromUpstream: number;
  costFromUpstream: number;
  customers: string[];
  suppliers: string[];
  region: string;
  sector: string;
}

interface SupplyChainRisk {
  symbol: string;
  concentrationRisk: number;
  geographicRisk: number;
  substitutionRisk: number;
  cascadingRisk: number;
  overallRisk: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  keyRisks: string[];
}

function buildSupplyGraph(nodes: SupplyNode[]): Map<string, SupplyNode> {
  const graph = new Map<string, SupplyNode>();
  nodes.forEach(n => graph.set(n.symbol, n));
  return graph;
}

function calcConcentrationRisk(node: SupplyNode, graph: Map<string, SupplyNode>): number {
  const supplierCount = node.suppliers.length;
  if (supplierCount === 0) return 0.8; // 无供应商=高风险
  if (supplierCount === 1) return 0.9;
  if (supplierCount <= 3) return 0.6;
  return Math.max(0.1, 1 / supplierCount);
}

function calcGeographicRisk(node: SupplyNode, nodes: SupplyNode[]): number {
  const sameRegion = nodes.filter(n =>
    n.region === node.region && n.symbol !== node.symbol
  ).length;
  const total = nodes.length - 1;
  return total > 0 ? sameRegion / total : 0;
}

function calcSubstitutionRisk(node: SupplyNode, graph: Map<string, SupplyNode>): number {
  const suppliers = node.suppliers.map(s => graph.get(s)).filter(Boolean) as SupplyNode[];
  if (suppliers.length === 0) return 0.5;
  const uniqueSectors = new Set(suppliers.map(s => s.sector));
  return uniqueSectors.size <= 1 ? 0.8 : Math.max(0.1, 1 / uniqueSectors.size);
}

function calcCascadingRisk(node: SupplyNode, graph: Map<string, SupplyNode>, depth: number = 3): number {
  const visited = new Set<string>();
  let risk = 0;
  const queue: { symbol: string; level: number }[] = [{ symbol: node.symbol, level: 0 }];

  while (queue.length > 0) {
    const { symbol, level } = queue.shift()!;
    if (visited.has(symbol) || level > depth) continue;
    visited.add(symbol);
    const current = graph.get(symbol);
    if (!current) continue;
    risk += (1 / (level + 1)) * 0.1;
    current.customers.forEach(c => queue.push({ symbol: c, level: level + 1 }));
  }
  return Math.min(1, risk);
}

function assessSupplyChainRisk(node: SupplyNode, nodes: SupplyNode[]): SupplyChainRisk {
  const graph = buildSupplyGraph(nodes);
  const concentrationRisk = calcConcentrationRisk(node, graph);
  const geographicRisk = calcGeographicRisk(node, nodes);
  const substitutionRisk = calcSubstitutionRisk(node, graph);
  const cascadingRisk = calcCascadingRisk(node, graph);

  const overallRisk = concentrationRisk * 0.3 + geographicRisk * 0.2 + substitutionRisk * 0.25 + cascadingRisk * 0.25;
  const riskLevel = overallRisk > 0.7 ? 'critical' : overallRisk > 0.5 ? 'high' : overallRisk > 0.3 ? 'medium' : 'low';

  const keyRisks: string[] = [];
  if (concentrationRisk > 0.6) keyRisks.push('供应商过于集中');
  if (geographicRisk > 0.5) keyRisks.push('区域集中风险');
  if (substitutionRisk > 0.6) keyRisks.push('替代性差');
  if (cascadingRisk > 0.5) keyRisks.push('级联传导风险');

  return { symbol: node.symbol, concentrationRisk, geographicRisk, substitutionRisk, cascadingRisk, overallRisk, riskLevel, keyRisks };
}

function findHighRiskNodes(nodes: SupplyNode[]): SupplyChainRisk[] {
  return nodes
    .map(n => assessSupplyChainRisk(n, nodes))
    .filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical')
    .sort((a, b) => b.overallRisk - a.overallRisk);
}

describe('供应链风险评估引擎', () => {
  const nodes: SupplyNode[] = [
    { symbol: 'A', name: '整车厂', tier: 0, revenueFromUpstream: 0, costFromUpstream: 500, customers: [], suppliers: ['B', 'C'], region: '上海', sector: '汽车' },
    { symbol: 'B', name: '电池供应商', tier: 1, revenueFromUpstream: 300, costFromUpstream: 200, customers: ['A'], suppliers: ['D'], region: '广东', sector: '电池' },
    { symbol: 'C', name: '芯片供应商', tier: 1, revenueFromUpstream: 200, costFromUpstream: 100, customers: ['A'], suppliers: [], region: '广东', sector: '半导体' },
    { symbol: 'D', name: '锂矿商', tier: 2, revenueFromUpstream: 200, costFromUpstream: 50, customers: ['B'], suppliers: [], region: '四川', sector: '矿业' },
    { symbol: 'E', name: '轮胎供应商', tier: 1, revenueFromUpstream: 100, costFromUpstream: 60, customers: ['A'], suppliers: ['F'], region: '上海', sector: '橡胶' },
    { symbol: 'F', name: '橡胶种植', tier: 2, revenueFromUpstream: 60, costFromUpstream: 20, customers: ['E'], suppliers: [], region: '云南', sector: '农业' },
  ];

  it('应构建供应链图', () => {
    const graph = buildSupplyGraph(nodes);
    expect(graph.size).toBe(nodes.length);
    expect(graph.get('A')?.name).toBe('整车厂');
  });

  it('应计算集中度风险', () => {
    const graph = buildSupplyGraph(nodes);
    const riskA = calcConcentrationRisk(nodes[0], graph);
    const riskC = calcConcentrationRisk(nodes[2], graph);
    expect(riskC).toBeGreaterThan(riskA); // C无供应商
  });

  it('单一供应商应为高集中风险', () => {
    const graph = buildSupplyGraph(nodes);
    const risk = calcConcentrationRisk(nodes[1], graph); // B有1个供应商
    expect(risk).toBe(0.9);
  });

  it('应计算地理风险', () => {
    const geoRisk = calcGeographicRisk(nodes[2], nodes); // C在广东
    expect(geoRisk).toBeGreaterThan(0);
  });

  it('应计算替代风险', () => {
    const graph = buildSupplyGraph(nodes);
    const risk = calcSubstitutionRisk(nodes[0], graph);
    expect(risk).toBeGreaterThan(0);
  });

  it('应计算级联风险', () => {
    const graph = buildSupplyGraph(nodes);
    const risk = calcCascadingRisk(nodes[0], graph);
    expect(risk).toBeGreaterThanOrEqual(0);
    expect(risk).toBeLessThanOrEqual(1);
  });

  it('应综合评估风险', () => {
    const risk = assessSupplyChainRisk(nodes[0], nodes);
    expect(risk.overallRisk).toBeGreaterThan(0);
    expect(['low', 'medium', 'high', 'critical']).toContain(risk.riskLevel);
  });

  it('应找出高风险节点', () => {
    const highRisk = findHighRiskNodes(nodes);
    highRisk.forEach(r => {
      expect(r.riskLevel === 'high' || r.riskLevel === 'critical').toBe(true);
    });
  });

  it('风险等级应与风险值一致', () => {
    nodes.forEach(n => {
      const risk = assessSupplyChainRisk(n, nodes);
      if (risk.overallRisk > 0.7) expect(risk.riskLevel).toBe('critical');
      else if (risk.overallRisk > 0.5) expect(risk.riskLevel).toBe('high');
    });
  });

  it('无供应商节点应有集中风险警告', () => {
    const risk = assessSupplyChainRisk(nodes[2], nodes); // C无供应商
    expect(risk.keyRisks).toContain('供应商过于集中');
  });
});
