import { describe, it, expect } from 'vitest';
import {
  analyzeExecutionCost,
  estimateOptimalExecution,
  buildCostModel,
  compareVenues,
  ExecutionReport,
} from '../services/tcaEngine';

const makeExec = (overrides: Partial<ExecutionReport> = {}): ExecutionReport => ({
  symbol: 'sh600000',
  side: 'buy',
  quantity: 1000,
  price: 10.05,
  timestamp: new Date(),
  venue: 'SSE',
  orderType: 'market',
  commission: 5,
  slippage: 0.01,
  ...overrides,
});

describe('tcaEngine', () => {
  describe('analyzeExecutionCost', () => {
    it('should return zeros for empty executions', () => {
      const metrics = analyzeExecutionCost([], 10, 10, 1000000);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.costBps).toBe(0);
    });

    it('should calculate implementation shortfall', () => {
      const execs = [makeExec({ price: 10.10, side: 'buy' })];
      const metrics = analyzeExecutionCost(execs, 10.00, 10.05, 1000000);
      expect(metrics.implementation_shortfall).toBeGreaterThan(0);
    });

    it('should calculate VWAP performance for buy', () => {
      const execs = [makeExec({ price: 10.00, side: 'buy' })];
      const metrics = analyzeExecutionCost(execs, 10.00, 10.10, 1000000);
      expect(metrics.vwapPerformance).toBeGreaterThan(0); // bought below VWAP
    });

    it('should calculate VWAP performance for sell', () => {
      const execs = [makeExec({ price: 10.10, side: 'sell' })];
      const metrics = analyzeExecutionCost(execs, 10.00, 10.00, 1000000);
      expect(metrics.vwapPerformance).toBeGreaterThan(0); // sold above VWAP
    });

    it('should calculate participation rate', () => {
      const execs = [makeExec({ quantity: 10000 })];
      const metrics = analyzeExecutionCost(execs, 10, 10, 100000);
      expect(metrics.participationRate).toBeCloseTo(10, 1);
    });

    it('should sum commissions', () => {
      const execs = [
        makeExec({ commission: 5 }),
        makeExec({ commission: 8 }),
      ];
      const metrics = analyzeExecutionCost(execs, 10, 10, 1000000);
      expect(metrics.commissionCost).toBe(13);
    });

    it('should sum slippage costs', () => {
      const execs = [
        makeExec({ quantity: 1000, slippage: 0.01 }),
        makeExec({ quantity: 2000, slippage: 0.02 }),
      ];
      const metrics = analyzeExecutionCost(execs, 10, 10, 1000000);
      expect(metrics.slippageCost).toBeCloseTo(50, 1);
    });
  });

  describe('estimateOptimalExecution', () => {
    it('should estimate for low urgency', () => {
      const result = estimateOptimalExecution(50000, 1000000, 'low');
      expect(result.timeSlices).toBeGreaterThan(0);
      expect(result.sliceSize).toBeGreaterThan(0);
      expect(result.estimatedCostBps).toBeGreaterThan(0);
    });

    it('should estimate for high urgency', () => {
      const result = estimateOptimalExecution(50000, 1000000, 'high');
      expect(result.timeSlices).toBeGreaterThan(0);
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    it('should have fewer slices for high urgency vs low', () => {
      const low = estimateOptimalExecution(100000, 1000000, 'low');
      const high = estimateOptimalExecution(100000, 1000000, 'high');
      // high urgency = larger slices = fewer time slices
      expect(high.sliceSize).toBeGreaterThan(low.sliceSize);
    });

    it('should calculate estimated cost', () => {
      const result = estimateOptimalExecution(10000, 1000000, 'medium');
      expect(result.estimatedCostBps).toBeGreaterThan(0);
    });
  });

  describe('buildCostModel', () => {
    it('should return defaults for insufficient data', () => {
      const model = buildCostModel([]);
      expect(model.marketImpactCoeff).toBe(0.1);
      expect(model.fixedCost).toBe(0);
    });

    it('should return defaults for less than 10 executions', () => {
      const model = buildCostModel([makeExec()]);
      expect(model.fixedCost).toBe(0);
    });

    it('should build model from historical data', () => {
      const execs = Array(15).fill(null).map(() => makeExec({ commission: 5, slippage: 0.02 }));
      const model = buildCostModel(execs);
      expect(model.fixedCost).toBe(5);
      expect(model.variableCost).toBeCloseTo(0.02, 5);
    });
  });

  describe('compareVenues', () => {
    it('should group by venue', () => {
      const execs = [
        makeExec({ venue: 'SSE', commission: 5, slippage: 0.01 }),
        makeExec({ venue: 'SSE', commission: 6, slippage: 0.02 }),
        makeExec({ venue: 'SZSE', commission: 3, slippage: 0.005 }),
      ];
      const result = compareVenues(execs);
      expect(result.length).toBe(2);
      const sse = result.find(v => v.venue === 'SSE');
      const szse = result.find(v => v.venue === 'SZSE');
      expect(sse).toBeDefined();
      expect(szse).toBeDefined();
    });

    it('should handle empty executions', () => {
      const result = compareVenues([]);
      expect(result).toEqual([]);
    });

    it('should calculate average slippage per venue', () => {
      const execs = [
        makeExec({ venue: 'SSE', slippage: 0.01 }),
        makeExec({ venue: 'SSE', slippage: 0.03 }),
      ];
      const result = compareVenues(execs);
      expect(result[0].avgSlippage).toBeCloseTo(0.02, 5);
    });
  });
});
