import { describe, it, expect } from 'vitest';

// 指数成分股调整引擎
interface IndexRebalance {
  indexName: string;
  effectiveDate: string;
  additions: { symbol: string; weight: number }[];
  deletions: { symbol: string; weight: number }[];
  weightChanges: { symbol: string; oldWeight: number; newWeight: number }[];
}

interface RebalanceImpact {
  symbol: string;
  action: 'add' | 'delete' | 'increase' | 'decrease';
  weightChange: number;
  estimatedFlow: number;
  priceImpact: number;
  tradingDays: number;
}

function calcRebalanceImpact(rebalance: IndexRebalance, indexAUM: number): RebalanceImpact[] {
  const impacts: RebalanceImpact[] = [];

  rebalance.additions.forEach(a => {
    const estimatedFlow = a.weight * indexAUM;
    const priceImpact = estimatedFlow / 1000000000 * 0.5; // 简化模型
    impacts.push({
      symbol: a.symbol,
      action: 'add',
      weightChange: a.weight,
      estimatedFlow,
      priceImpact,
      tradingDays: Math.ceil(estimatedFlow / 500000000),
    });
  });

  rebalance.deletions.forEach(d => {
    const estimatedFlow = d.weight * indexAUM;
    impacts.push({
      symbol: d.symbol,
      action: 'delete',
      weightChange: -d.weight,
      estimatedFlow: -estimatedFlow,
      priceImpact: -estimatedFlow / 1000000000 * 0.5,
      tradingDays: Math.ceil(estimatedFlow / 500000000),
    });
  });

  rebalance.weightChanges.forEach(w => {
    const change = w.newWeight - w.oldWeight;
    const estimatedFlow = change * indexAUM;
    impacts.push({
      symbol: w.symbol,
      action: change > 0 ? 'increase' : 'decrease',
      weightChange: change,
      estimatedFlow,
      priceImpact: estimatedFlow / 1000000000 * 0.3,
      tradingDays: Math.ceil(Math.abs(estimatedFlow) / 500000000),
    });
  });

  return impacts.sort((a, b) => Math.abs(b.estimatedFlow) - Math.abs(a.estimatedFlow));
}

function detectFrontRunningOpportunity(impacts: RebalanceImpact[]): RebalanceImpact[] {
  return impacts.filter(i =>
    i.action === 'add' && i.priceImpact > 0.005
  );
}

function calcTotalFlow(impacts: RebalanceImpact[]): { inflow: number; outflow: number; net: number } {
  const inflow = impacts.filter(i => i.estimatedFlow > 0).reduce((s, i) => s + i.estimatedFlow, 0);
  const outflow = impacts.filter(i => i.estimatedFlow < 0).reduce((s, i) => s + Math.abs(i.estimatedFlow), 0);
  return { inflow, outflow, net: inflow - outflow };
}

function estimateTrackingError(rebalance: IndexRebalance): number {
  const changeCount = rebalance.additions.length + rebalance.deletions.length + rebalance.weightChanges.length;
  return Math.min(0.05, changeCount * 0.002);
}

describe('指数成分股调整引擎', () => {
  const rebalance: IndexRebalance = {
    indexName: '沪深300',
    effectiveDate: '2024-06-17',
    additions: [
      { symbol: '300750', weight: 0.015 },
      { symbol: '002594', weight: 0.012 },
    ],
    deletions: [
      { symbol: '000002', weight: 0.008 },
    ],
    weightChanges: [
      { symbol: '600519', oldWeight: 0.05, newWeight: 0.055 },
      { symbol: '000858', oldWeight: 0.02, newWeight: 0.018 },
    ],
  };

  it('应计算调仓影响', () => {
    const impacts = calcRebalanceImpact(rebalance, 100000000000);
    expect(impacts.length).toBe(5);
    impacts.forEach(i => {
      expect(['add', 'delete', 'increase', 'decrease']).toContain(i.action);
      expect(typeof i.priceImpact).toBe('number');
    });
  });

  it('新增成分股应有正向资金流', () => {
    const impacts = calcRebalanceImpact(rebalance, 100000000000);
    const additions = impacts.filter(i => i.action === 'add');
    additions.forEach(a => {
      expect(a.estimatedFlow).toBeGreaterThan(0);
      expect(a.priceImpact).toBeGreaterThan(0);
    });
  });

  it('删除成分股应有负向资金流', () => {
    const impacts = calcRebalanceImpact(rebalance, 100000000000);
    const deletes = impacts.filter(i => i.action === 'delete');
    deletes.forEach(d => {
      expect(d.estimatedFlow).toBeLessThan(0);
      expect(d.priceImpact).toBeLessThan(0);
    });
  });

  it('应检测抢跑机会', () => {
    const impacts = calcRebalanceImpact(rebalance, 500000000000);
    const opps = detectFrontRunningOpportunity(impacts);
    opps.forEach(o => {
      expect(o.action).toBe('add');
      expect(o.priceImpact).toBeGreaterThan(0.005);
    });
  });

  it('应计算总资金流', () => {
    const impacts = calcRebalanceImpact(rebalance, 100000000000);
    const flow = calcTotalFlow(impacts);
    expect(flow.inflow).toBeGreaterThan(0);
    expect(flow.outflow).toBeGreaterThan(0);
    expect(typeof flow.net).toBe('number');
  });

  it('应估算跟踪误差', () => {
    const te = estimateTrackingError(rebalance);
    expect(te).toBeGreaterThan(0);
    expect(te).toBeLessThanOrEqual(0.05);
  });

  it('影响应按资金量排序', () => {
    const impacts = calcRebalanceImpact(rebalance, 100000000000);
    for (let i = 1; i < impacts.length; i++) {
      expect(Math.abs(impacts[i - 1].estimatedFlow)).toBeGreaterThanOrEqual(Math.abs(impacts[i].estimatedFlow));
    }
  });

  it('调仓天数应为正整数', () => {
    const impacts = calcRebalanceImpact(rebalance, 100000000000);
    impacts.forEach(i => {
      expect(i.tradingDays).toBeGreaterThanOrEqual(1);
    });
  });

  it('权重变化应正确计算', () => {
    const impacts = calcRebalanceImpact(rebalance, 100000000000);
    const moutai = impacts.find(i => i.symbol === '600519');
    expect(moutai?.weightChange).toBeCloseTo(0.005, 5);
  });

  it('空调整应返回空', () => {
    const empty: IndexRebalance = { indexName: 'test', effectiveDate: '2024-01-01', additions: [], deletions: [], weightChanges: [] };
    expect(calcRebalanceImpact(empty, 100000000)).toEqual([]);
  });
});
