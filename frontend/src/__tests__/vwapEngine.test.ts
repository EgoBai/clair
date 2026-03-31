import { describe, it, expect } from 'vitest';
import { createVWAPPlan, evaluateExecution, adjustExecution, VolumeProfile } from '../utils/vwapEngine';

describe('VWAP执行算法引擎', () => {
  const volumeProfile: VolumeProfile[] = [
    { timeSlot: '09:30', expectedVolumePct: 0.15 },
    { timeSlot: '10:00', expectedVolumePct: 0.12 },
    { timeSlot: '10:30', expectedVolumePct: 0.08 },
    { timeSlot: '11:00', expectedVolumePct: 0.07 },
    { timeSlot: '13:00', expectedVolumePct: 0.10 },
    { timeSlot: '13:30', expectedVolumePct: 0.08 },
    { timeSlot: '14:00', expectedVolumePct: 0.10 },
    { timeSlot: '14:30', expectedVolumePct: 0.12 },
    { timeSlot: '14:57', expectedVolumePct: 0.18 },
  ];

  it('应该创建执行计划', () => {
    const plan = createVWAPPlan(100000, '09:30', '14:57', volumeProfile);
    expect(plan.totalShares).toBe(100000);
    expect(plan.slices.length).toBe(9);
  });

  it('切片股数之和应等于总股数', () => {
    const plan = createVWAPPlan(100000, '09:30', '14:57', volumeProfile);
    const total = plan.slices.reduce((s, sl) => s + sl.targetShares, 0);
    expect(Math.abs(total - 100000)).toBeLessThanOrEqual(10); // 允许取整误差
  });

  it('应该评估执行质量', () => {
    const plan = createVWAPPlan(100000, '09:30', '14:57', volumeProfile);
    const executed = plan.slices.map(s => ({
      timeSlot: s.timeSlot,
      price: 10 + Math.random() * 0.5,
      shares: s.targetShares,
    }));
    const result = evaluateExecution(plan, executed, 10.25);
    expect(['excellent', 'good', 'fair', 'poor']).toContain(result.executionQuality);
  });

  it('应该计算VWAP', () => {
    const plan = createVWAPPlan(1000, '09:30', '14:57', volumeProfile);
    const executed = [{ timeSlot: '09:30', price: 10.5, shares: 500 }, { timeSlot: '10:00', price: 10.3, shares: 500 }];
    const result = evaluateExecution(plan, executed, 10.4);
    expect(result.actualVWAP).toBeCloseTo(10.4, 1);
  });

  it('应该计算完成率', () => {
    const plan = createVWAPPlan(1000, '09:30', '14:57', volumeProfile);
    const executed = [{ timeSlot: '09:30', price: 10.5, shares: 500 }];
    const result = evaluateExecution(plan, executed, 10.4);
    expect(result.completionRate).toBe(0.5);
  });

  it('应该自适应调整', () => {
    const plan = createVWAPPlan(100000, '09:30', '14:57', volumeProfile);
    const realized = [{ timeSlot: '09:30', volume: 50000 }];
    const adjusted = adjustExecution(plan, realized, 50000);
    expect(adjusted.length).toBe(8);
  });

  it('应该支持参与率参数', () => {
    const plan = createVWAPPlan(100000, '09:30', '14:57', volumeProfile, 0.15);
    expect(plan.participationRate).toBe(0.15);
  });

  it('应该标记执行紧急度', () => {
    const plan = createVWAPPlan(100000, '09:30', '14:57', volumeProfile);
    const urgencies = plan.slices.map(s => s.urgency);
    expect(urgencies.some(u => u === 'high')).toBe(true);
  });

  it('应该计算实施缺口', () => {
    const plan = createVWAPPlan(1000, '09:30', '14:57', volumeProfile);
    const executed = [{ timeSlot: '09:30', price: 10.5, shares: 1000 }];
    const result = evaluateExecution(plan, executed, 10.0);
    expect(result.implementationShortfall).toBe(500); // (10.5-10)/10*10000
  });

  it('应该计算市场冲击', () => {
    const plan = createVWAPPlan(1000, '09:30', '14:57', volumeProfile);
    const executed = [{ timeSlot: '09:30', price: 10.5, shares: 1000 }];
    const result = evaluateExecution(plan, executed, 10.0);
    expect(result.marketImpact).toBeGreaterThan(0);
  });
});
