import { describe, it, expect } from 'vitest';
import { createTWAPPlan, evaluateTWAP } from '../utils/twapEngine';

describe('TWAP执行算法引擎', () => {
  it('应该创建TWAP计划', () => {
    const plan = createTWAPPlan(100000, '09:30', '14:57', 5);
    expect(plan.totalShares).toBe(100000);
    expect(plan.slices.length).toBeGreaterThan(0);
  });

  it('切片股数之和应等于总股数', () => {
    const plan = createTWAPPlan(100000, '09:30', '14:57', 5);
    const total = plan.slices.reduce((s, sl) => s + sl.targetShares, 0);
    expect(total).toBe(100000);
  });

  it('应该标记紧急度', () => {
    const plan = createTWAPPlan(100000, '09:30', '14:57', 5);
    const urgencies = plan.slices.map(s => s.urgency);
    expect(urgencies.some(u => u === 'high')).toBe(true);
  });

  it('应该评估执行质量', () => {
    const plan = createTWAPPlan(1000, '09:30', '10:30', 10);
    const executions = plan.slices.map(s => ({
      time: s.startTime,
      price: 10 + Math.random() * 0.2,
      shares: s.targetShares,
    }));
    const result = evaluateTWAP(plan, executions, 10.1);
    expect(result.completionRate).toBeCloseTo(1, 1);
  });

  it('应该计算完成率', () => {
    const plan = createTWAPPlan(1000, '09:30', '10:30', 10);
    const executions = [{ time: '09:35', price: 10, shares: 500 }];
    const result = evaluateTWAP(plan, executions, 10);
    expect(result.completionRate).toBe(0.5);
  });

  it('应该计算时机评分', () => {
    const plan = createTWAPPlan(1000, '09:30', '10:30', 10);
    const executions = plan.slices.map(s => ({ time: s.startTime, price: 10, shares: s.targetShares }));
    const result = evaluateTWAP(plan, executions, 10);
    expect(result.timingScore).toBeGreaterThan(80);
  });

  it('应该估算市场冲击', () => {
    const plan = createTWAPPlan(1000, '09:30', '10:30', 10);
    const executions = [{ time: '09:35', price: 10.5, shares: 1000 }];
    const result = evaluateTWAP(plan, executions, 10);
    expect(result.impactEstimate).toBeGreaterThan(0);
  });

  it('应该计算剩余股数', () => {
    const plan = createTWAPPlan(1000, '09:30', '10:30', 10);
    const executions = [{ time: '09:35', price: 10, shares: 600 }];
    const result = evaluateTWAP(plan, executions, 10);
    expect(result.residualShares).toBe(400);
  });

  it('自定义切片时长应工作', () => {
    const plan = createTWAPPlan(100000, '09:30', '14:57', 15);
    expect(plan.sliceDuration).toBe(15);
  });

  it('应该计算平均执行价', () => {
    const plan = createTWAPPlan(1000, '09:30', '10:30', 10);
    const executions = [
      { time: '09:35', price: 10, shares: 500 },
      { time: '09:45', price: 10.2, shares: 500 },
    ];
    const result = evaluateTWAP(plan, executions, 10.1);
    expect(result.avgExecutionPrice).toBeCloseTo(10.1, 1);
  });
});
