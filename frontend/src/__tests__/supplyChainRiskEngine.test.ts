import { describe, it, expect } from 'vitest';

/**
 * 供应链风险引擎测试
 */

interface SupplyNode {
  id: string;
  name: string;
  type: 'upstream' | 'downstream' | 'peer';
  dependency: number; // 0-1
  revenue_exposure: number; // 0-1
}

interface SupplyChainRisk {
  stockCode: string;
  totalRisk: number;
  upstreamRisk: number;
  downstreamRisk: number;
  concentrationRisk: number;
  disruptionRisk: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

function analyzeSupplyChainRisk(stockCode: string, upstream: SupplyNode[], downstream: SupplyNode[]): SupplyChainRisk {
  const upstreamExposure = upstream.reduce((s, n) => s + n.revenue_exposure * n.dependency, 0);
  const downstreamExposure = downstream.reduce((s, n) => s + n.revenue_exposure * n.dependency, 0);
  const upstreamConc = upstream.length > 0 ? Math.max(...upstream.map(n => n.revenue_exposure)) : 0;
  const downstreamConc = downstream.length > 0 ? Math.max(...downstream.map(n => n.revenue_exposure)) : 0;
  const concentrationRisk = Math.max(upstreamConc, downstreamConc);
  const disruptionRisk = (upstreamExposure + downstreamExposure) / 2;
  const totalRisk = parseFloat(((upstreamExposure * 0.4 + downstreamExposure * 0.3 + concentrationRisk * 0.3) * 100).toFixed(2));
  const riskLevel = totalRisk > 60 ? 'critical' : totalRisk > 40 ? 'high' : totalRisk > 20 ? 'medium' : 'low';
  const recommendations: string[] = [];
  if (upstreamConc > 0.5) recommendations.push('上游客户集中度过高，建议拓展供应商');
  if (downstreamConc > 0.5) recommendations.push('下游客户集中度过高，建议拓展销售渠道');
  if (upstreamExposure > 0.7) recommendations.push('上游依赖度高，存在断供风险');
  return { stockCode, totalRisk, upstreamRisk: parseFloat((upstreamExposure * 100).toFixed(2)), downstreamRisk: parseFloat((downstreamExposure * 100).toFixed(2)), concentrationRisk: parseFloat((concentrationRisk * 100).toFixed(2)), disruptionRisk: parseFloat((disruptionRisk * 100).toFixed(2)), riskLevel, recommendations };
}

function calculateCorrelationRisk(nodes: SupplyNode[]): number {
  if (nodes.length < 2) return 0;
  const deps = nodes.map(n => n.dependency);
  const avg = deps.reduce((a, b) => a + b, 0) / deps.length;
  const variance = deps.reduce((s, d) => s + (d - avg) ** 2, 0) / deps.length;
  return parseFloat((variance * 100).toFixed(2));
}

describe('供应链风险引擎', () => {
  const makeNode = (id: string, exposure = 0.3, dep = 0.5): SupplyNode => ({
    id, name: `Node${id}`, type: 'upstream', dependency: dep, revenue_exposure: exposure,
  });

  describe('analyzeSupplyChainRisk', () => {
    it('should return low risk for diversified supply chain', () => {
      const risk = analyzeSupplyChainRisk('600519',
        [makeNode('1', 0.1), makeNode('2', 0.1), makeNode('3', 0.1)],
        [makeNode('4', 0.1), makeNode('5', 0.1)]
      );
      expect(risk.riskLevel).toBe('low');
    });

    it('should flag high concentration', () => {
      const risk = analyzeSupplyChainRisk('001', [makeNode('1', 0.8)], []);
      expect(risk.recommendations.length).toBeGreaterThan(0);
    });

    it('should calculate total risk 0-100', () => {
      const risk = analyzeSupplyChainRisk('001', [makeNode('1', 0.5)], [makeNode('2', 0.3)]);
      expect(risk.totalRisk).toBeGreaterThanOrEqual(0);
      expect(risk.totalRisk).toBeLessThanOrEqual(100);
    });

    it('should handle empty nodes', () => {
      const risk = analyzeSupplyChainRisk('001', [], []);
      expect(risk.totalRisk).toBe(0);
      expect(risk.riskLevel).toBe('low');
    });
  });

  describe('calculateCorrelationRisk', () => {
    it('should return 0 for single node', () => {
      expect(calculateCorrelationRisk([makeNode('1')])).toBe(0);
    });

    it('should measure dependency variance', () => {
      const risk = calculateCorrelationRisk([makeNode('1', 0.5, 0.9), makeNode('2', 0.5, 0.1)]);
      expect(risk).toBeGreaterThan(0);
    });

    it('should be 0 for equal dependencies', () => {
      expect(calculateCorrelationRisk([makeNode('1', 0.5, 0.5), makeNode('2', 0.5, 0.5)])).toBe(0);
    });
  });
});
