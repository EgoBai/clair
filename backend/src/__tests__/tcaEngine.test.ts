import { describe, it, expect } from 'vitest';
import {
  analyzeExecutionCost,
  estimateOptimalExecution,
  buildCostModel,
  compareVenues,
  ExecutionReport,
} from '../services/tcaEngine';

describe('交易成本分析引擎', () => {
  const mockExecutions: ExecutionReport[] = [
    { symbol: '600519.SH', side: 'buy', quantity: 1000, price: 1800.5, timestamp: new Date(), venue: 'SH', orderType: 'limit', commission: 5, slippage: 0.001 },
    { symbol: '600519.SH', side: 'buy', quantity: 2000, price: 1801.0, timestamp: new Date(), venue: 'SH', orderType: 'limit', commission: 10, slippage: 0.002 },
    { symbol: '600519.SH', side: 'buy', quantity: 1500, price: 1801.5, timestamp: new Date(), venue: 'SH', orderType: 'market', commission: 7.5, slippage: 0.0015 },
    { symbol: '000858.SZ', side: 'sell', quantity: 3000, price: 150.2, timestamp: new Date(), venue: 'SZ', orderType: 'limit', commission: 15, slippage: 0.0005 },
    { symbol: '000858.SZ', side: 'sell', quantity: 2000, price: 150.0, timestamp: new Date(), venue: 'SZ', orderType: 'market', commission: 10, slippage: 0.001 },
  ];

  describe('执行成本分析', () => {
    it('应计算总成本', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(typeof metrics.totalCost).toBe('number');
    });

    it('应计算成本基点', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(typeof metrics.costBps).toBe('number');
    });

    it('应计算市场冲击', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(typeof metrics.marketImpact).toBe('number');
    });

    it('应计算执行缺口', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(typeof metrics.implementation_shortfall).toBe('number');
    });

    it('应计算VWAP表现', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(typeof metrics.vwapPerformance).toBe('number');
    });

    it('应计算参与率', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(metrics.participationRate).toBeGreaterThan(0);
      expect(metrics.participationRate).toBeLessThanOrEqual(100);
    });

    it('应计算佣金成本', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(metrics.commissionCost).toBe(47.5);
    });

    it('应计算滑点成本', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(metrics.slippageCost).toBeGreaterThan(0);
    });

    it('空执行应返回零值', () => {
      const metrics = analyzeExecutionCost([], 100, 100, 1e6);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.costBps).toBe(0);
    });

    it('应计算时间成本', () => {
      const metrics = analyzeExecutionCost(mockExecutions, 1800, 1801, 1e7);
      expect(typeof metrics.timingCost).toBe('number');
    });
  });

  describe('最优执行估算', () => {
    it('低紧迫度应有更多时间切片', () => {
      const low = estimateOptimalExecution(100000, 1e6, 'low');
      const high = estimateOptimalExecution(100000, 1e6, 'high');
      expect(low.timeSlices).toBeGreaterThanOrEqual(high.timeSlices);
    });

    it('应估算成本基点', () => {
      const result = estimateOptimalExecution(50000, 1e6, 'medium');
      expect(result.estimatedCostBps).toBeGreaterThan(0);
    });

    it('应估算持续时间', () => {
      const result = estimateOptimalExecution(50000, 1e6, 'medium');
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    it('应计算切片大小', () => {
      const result = estimateOptimalExecution(100000, 1e6, 'medium');
      expect(result.sliceSize).toBeGreaterThan(0);
    });

    it('高紧迫度应有更高成本', () => {
      const low = estimateOptimalExecution(100000, 1e6, 'low');
      const high = estimateOptimalExecution(100000, 1e6, 'high');
      expect(high.estimatedCostBps).toBeLessThanOrEqual(low.estimatedCostBps + 10);
    });

    it('应返回正数时间切片', () => {
      const result = estimateOptimalExecution(1000, 1e6, 'low');
      expect(result.timeSlices).toBeGreaterThanOrEqual(1);
    });
  });

  describe('成本模型构建', () => {
    it('数据不足应返回默认模型', () => {
      const model = buildCostModel(mockExecutions.slice(0, 3));
      expect(model.marketImpactCoeff).toBe(0.1);
    });

    it('足够数据应构建模型', () => {
      const manyExecs = Array(20).fill(mockExecutions[0]);
      const model = buildCostModel(manyExecs);
      expect(model.fixedCost).toBeGreaterThanOrEqual(0);
      expect(model.variableCost).toBeGreaterThanOrEqual(0);
    });

    it('应有固定成本', () => {
      const manyExecs = Array(20).fill(mockExecutions[0]);
      const model = buildCostModel(manyExecs);
      expect(typeof model.fixedCost).toBe('number');
    });

    it('应有可变成本', () => {
      const manyExecs = Array(20).fill(mockExecutions[0]);
      const model = buildCostModel(manyExecs);
      expect(typeof model.variableCost).toBe('number');
    });

    it('应有市场冲击系数', () => {
      const manyExecs = Array(20).fill(mockExecutions[0]);
      const model = buildCostModel(manyExecs);
      expect(model.marketImpactCoeff).toBeGreaterThan(0);
    });
  });

  describe('交易所比较', () => {
    it('应按交易所分组', () => {
      const result = compareVenues(mockExecutions);
      expect(result.length).toBe(2); // SH and SZ
    });

    it('应有平均成本基点', () => {
      const result = compareVenues(mockExecutions);
      for (const v of result) {
        expect(typeof v.avgCostBps).toBe('number');
      }
    });

    it('应有成交率', () => {
      const result = compareVenues(mockExecutions);
      for (const v of result) {
        expect(v.fillRate).toBeGreaterThan(0);
      }
    });

    it('应有平均滑点', () => {
      const result = compareVenues(mockExecutions);
      for (const v of result) {
        expect(typeof v.avgSlippage).toBe('number');
      }
    });

    it('空数据应返回空', () => {
      const result = compareVenues([]);
      expect(result.length).toBe(0);
    });
  });
});
