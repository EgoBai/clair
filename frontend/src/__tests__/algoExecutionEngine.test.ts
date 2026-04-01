import { describe, it, expect } from 'vitest';

// 算法交易执行引擎
interface ExecutionOrder {
  symbol: string;
  side: 'buy' | 'sell';
  totalShares: number;
  limitPrice: number;
  urgency: 'low' | 'medium' | 'high';
  timeHorizon: number; // minutes
}

interface AlgoExecution {
  algorithm: 'TWAP' | 'VWAP' | 'POV' | 'IS';
  slices: { shares: number; targetPrice: number; timeOffset: number }[];
  expectedCost: number;
  expectedImpact: number;
  completionTime: number;
}

function planTWAP(order: ExecutionOrder): AlgoExecution {
  const sliceCount = Math.min(Math.ceil(order.timeHorizon / 5), 20);
  const sharesPerSlice = Math.floor(order.totalShares / sliceCount);
  const remainder = order.totalShares % sliceCount;
  const slices = Array.from({ length: sliceCount }, (_, i) => ({
    shares: sharesPerSlice + (i < remainder ? 1 : 0),
    targetPrice: order.limitPrice,
    timeOffset: i * (order.timeHorizon / sliceCount),
  }));
  return {
    algorithm: 'TWAP',
    slices,
    expectedCost: order.totalShares * order.limitPrice * 0.0003,
    expectedImpact: 0.001 * (order.totalShares / 100000),
    completionTime: order.timeHorizon,
  };
}

function planVWAP(order: ExecutionOrder, volumeProfile: number[]): AlgoExecution {
  const totalVol = volumeProfile.reduce((a, b) => a + b, 0) || 1;
  const slices = volumeProfile.map((vol, i) => ({
    shares: Math.round(order.totalShares * vol / totalVol),
    targetPrice: order.limitPrice,
    timeOffset: i * (order.timeHorizon / volumeProfile.length),
  }));
  return {
    algorithm: 'VWAP',
    slices: slices.filter(s => s.shares > 0),
    expectedCost: order.totalShares * order.limitPrice * 0.00025,
    expectedImpact: 0.0008 * (order.totalShares / 100000),
    completionTime: order.timeHorizon,
  };
}

function planPOV(order: ExecutionOrder, participationRate: number = 0.1): AlgoExecution {
  const estDailyVol = 5000000;
  const intervalVol = estDailyVol * (order.timeHorizon / 240) * participationRate;
  const sliceCount = Math.ceil(order.timeHorizon / 2);
  const slices = Array.from({ length: sliceCount }, (_, i) => ({
    shares: Math.min(Math.round(intervalVol / sliceCount), order.totalShares),
    targetPrice: order.limitPrice,
    timeOffset: i * 2,
  }));
  return {
    algorithm: 'POV',
    slices,
    expectedCost: order.totalShares * order.limitPrice * 0.00035,
    expectedImpact: 0.0015 * participationRate,
    completionTime: order.timeHorizon,
  };
}

function planIS(order: ExecutionOrder, arrivalPrice: number): AlgoExecution {
  const urgencyFactor = order.urgency === 'high' ? 0.2 : order.urgency === 'medium' ? 0.5 : 0.8;
  const sliceCount = Math.ceil(order.timeHorizon * urgencyFactor / 3);
  const sharesPerSlice = Math.floor(order.totalShares / sliceCount);
  const slices = Array.from({ length: sliceCount }, (_, i) => ({
    shares: sharesPerSlice,
    targetPrice: order.side === 'buy' ? arrivalPrice * (1 + 0.001 * i) : arrivalPrice * (1 - 0.001 * i),
    timeOffset: i * (order.timeHorizon / sliceCount),
  }));
  return {
    algorithm: 'IS',
    slices,
    expectedCost: order.totalShares * arrivalPrice * 0.0004 * urgencyFactor,
    expectedImpact: 0.002 * urgencyFactor,
    completionTime: order.timeHorizon * urgencyFactor,
  };
}

function compareAlgorithms(order: ExecutionOrder, volumeProfile: number[], arrivalPrice: number): AlgoExecution[] {
  return [
    planTWAP(order),
    planVWAP(order, volumeProfile),
    planPOV(order),
    planIS(order, arrivalPrice),
  ].sort((a, b) => a.expectedCost - b.expectedCost);
}

describe('算法交易执行引擎', () => {
  const order: ExecutionOrder = { symbol: '600519', side: 'buy', totalShares: 50000, limitPrice: 1800, urgency: 'medium', timeHorizon: 60 };
  const volumeProfile = [100, 80, 60, 50, 40, 30, 50, 70, 90, 120, 150, 100];

  it('应规划TWAP执行', () => {
    const exec_ = planTWAP(order);
    expect(exec_.algorithm).toBe('TWAP');
    expect(exec_.slices.length).toBeGreaterThan(0);
    const totalShares = exec_.slices.reduce((s, sl) => s + sl.shares, 0);
    expect(totalShares).toBe(order.totalShares);
  });

  it('应规划VWAP执行', () => {
    const exec_ = planVWAP(order, volumeProfile);
    expect(exec_.algorithm).toBe('VWAP');
    expect(exec_.slices.length).toBeGreaterThan(0);
  });

  it('应规划POV执行', () => {
    const exec_ = planPOV(order);
    expect(exec_.algorithm).toBe('POV');
    expect(exec_.slices.length).toBeGreaterThan(0);
  });

  it('应规划IS执行', () => {
    const exec_ = planIS(order, 1800);
    expect(exec_.algorithm).toBe('IS');
    expect(exec_.slices.length).toBeGreaterThan(0);
  });

  it('应比较各算法', () => {
    const compared = compareAlgorithms(order, volumeProfile, 1800);
    expect(compared.length).toBe(4);
    expect(compared[0].expectedCost).toBeLessThanOrEqual(compared[compared.length - 1].expectedCost);
  });

  it('高紧急度IS应更快完成', () => {
    const highUrgency = planIS({ ...order, urgency: 'high' }, 1800);
    const lowUrgency = planIS({ ...order, urgency: 'low' }, 1800);
    expect(highUrgency.completionTime).toBeLessThan(lowUrgency.completionTime);
  });

  it('预期成本应为正数', () => {
    const exec_ = planTWAP(order);
    expect(exec_.expectedCost).toBeGreaterThan(0);
  });

  it('执行时间应在时间范围内', () => {
    const exec_ = planTWAP(order);
    expect(exec_.completionTime).toBeLessThanOrEqual(order.timeHorizon + 1);
  });

  it('小单不应产生大冲击', () => {
    const smallOrder: ExecutionOrder = { ...order, totalShares: 100 };
    const exec_ = planTWAP(smallOrder);
    expect(exec_.expectedImpact).toBeLessThan(0.01);
  });

  it('空volume profile VWAP应正常', () => {
    const exec_ = planVWAP(order, []);
    expect(exec_.slices.length).toBe(0);
  });
});
