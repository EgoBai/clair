import { describe, it, expect } from 'vitest';
import { analyzeRebalance, RebalanceEvent, IndexConstituent } from '../utils/indexRebalanceEngine';

describe('指数再平衡分析引擎', () => {
  const constituents: IndexConstituent[] = [
    { stockCode: '600519', stockName: '茅台', weight: 0.05, marketCap: 2e12, turnover: 5e9, addedDate: '2020-01-01' },
    { stockCode: '000858', stockName: '五粮液', weight: 0.03, marketCap: 8e11, turnover: 3e9, addedDate: '2020-01-01' },
    { stockCode: '002415', stockName: '海康威视', weight: 0.02, marketCap: 4e11, turnover: 2e9, addedDate: '2021-06-01' },
  ];

  const event: RebalanceEvent = {
    date: '2024-03-15',
    indexCode: '000300',
    additions: [
      { stockCode: '300750', stockName: '宁德时代', weight: 0.04, marketCap: 1e12, turnover: 8e9, addedDate: '' },
      { stockCode: '688981', stockName: '中芯国际', weight: 0.015, marketCap: 3e11, turnover: 4e9, addedDate: '' },
    ],
    deletions: [
      { stockCode: '002415', stockName: '海康威视', weight: 0.02, marketCap: 4e11, turnover: 2e9, addedDate: '' },
    ],
    weightChanges: [
      { stockCode: '600519', oldWeight: 0.05, newWeight: 0.048 },
    ],
  };

  it('应该分析再平衡事件', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(result.event.date).toBe('2024-03-15');
  });

  it('应该计算被动资金买入压力', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(result.passiveImpact.buyPressure.length).toBe(2);
    expect(result.passiveImpact.buyPressure[0].amount).toBeGreaterThan(0);
  });

  it('应该计算被动资金卖出压力', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(result.passiveImpact.sellPressure.length).toBe(1);
  });

  it('应该估算跟踪误差影响', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(result.passiveImpact.trackingErrorImpact).toBeGreaterThan(0);
  });

  it('应该估算调仓成本', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(result.passiveImpact.estimatedCost).toBeGreaterThan(0);
  });

  it('应该评估流动性风险', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(['low', 'medium', 'high']).toContain(result.liquidityRisk);
  });

  it('应该建议执行策略', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(['aggressive', 'passive', 'twap']).toContain(result.executionStrategy);
  });

  it('应该计算预期收益', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(typeof result.expectedReturn).toBe('number');
  });

  it('应该计算调仓前Alpha', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(result.preRebalanceAlpha).toBeGreaterThan(0);
  });

  it('应该生成警报', () => {
    const result = analyzeRebalance(event, constituents, 1e11);
    expect(Array.isArray(result.alerts)).toBe(true);
  });
});
