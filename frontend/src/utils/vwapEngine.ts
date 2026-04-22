/**
 * VWAP执行算法引擎
 * - 成交量曲线预测
 * - 执行切片规划
 * - 实时偏差监控
 * - 自适应调整
 * - 执行质量评估
 */
export interface VolumeProfile {
  timeSlot: string; // HH:MM
  expectedVolumePct: number; // 占全天比例
  realizedVolumePct?: number;
}

export interface ExecutionSlice {
  timeSlot: string;
  targetShares: number;
  targetPct: number;
  limitPrice?: number;
  urgency: 'low' | 'medium' | 'high';
}

export interface ExecutionPlan {
  totalShares: number;
  startTime: string;
  endTime: string;
  slices: ExecutionSlice[];
  expectedVWAP: number;
  participationRate: number;
}

export interface ExecutionResult {
  plan: ExecutionPlan;
  actualVWAP: number;
  implementationShortfall: number; // bps
  timingCost: number;
  marketImpact: number;
  slippage: number;
  completionRate: number;
  executionQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export function createVWAPPlan(
  totalShares: number,
  startTime: string,
  endTime: string,
  volumeProfile: VolumeProfile[],
  participationRate: number = 0.1,
  _maxParticipation: number = 0.25
): ExecutionPlan {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  
  // 筛选交易时间段内的成交量分布
  const relevantProfile = volumeProfile.filter(vp => {
    const min = timeToMinutes(vp.timeSlot);
    return min >= startMin && min <= endMin;
  });

  // 归一化
  const totalPct = relevantProfile.reduce((s, vp) => s + vp.expectedVolumePct, 0);
  const normalized = relevantProfile.map(vp => ({
    ...vp,
    normPct: totalPct > 0 ? vp.expectedVolumePct / totalPct : 1 / relevantProfile.length,
  }));

  // 生成切片
  const slices: ExecutionSlice[] = normalized.map(vp => {
    const targetShares = Math.round(totalShares * vp.normPct);
    const urgency = vp.normPct > 0.1 ? 'high' : vp.normPct > 0.05 ? 'medium' : 'low';
    return {
      timeSlot: vp.timeSlot,
      targetShares,
      targetPct: vp.normPct,
      urgency,
    };
  });

  return {
    totalShares,
    startTime,
    endTime,
    slices,
    expectedVWAP: 0, // 需要实时价格数据
    participationRate,
  };
}

export function evaluateExecution(
  plan: ExecutionPlan,
  executedPrices: Array<{ timeSlot: string; price: number; shares: number }>,
  marketVWAP: number
): ExecutionResult {
  // 实际VWAP
  const totalExecuted = executedPrices.reduce((s, e) => s + e.shares, 0);
  const totalValue = executedPrices.reduce((s, e) => s + e.price * e.shares, 0);
  const actualVWAP = totalExecuted > 0 ? totalValue / totalExecuted : 0;

  // 实施缺口 (bps)
  const implementationShortfall = marketVWAP > 0
    ? ((actualVWAP - marketVWAP) / marketVWAP) * 10000
    : 0;

  // 时机成本
  const plannedExecMap = new Map(plan.slices.map(s => [s.timeSlot, s.targetShares]));
  let timingCost = 0;
  for (const exec of executedPrices) {
    const planned = plannedExecMap.get(exec.timeSlot) ?? 0;
    if (exec.shares !== planned) {
      timingCost += Math.abs(exec.shares - planned) / plan.totalShares * 0.5;
    }
  }

  // 市场冲击
  const marketImpact = Math.abs(implementationShortfall) * 0.3;

  // 滑点
  const slippage = Math.abs(implementationShortfall) - marketImpact;

  // 完成率
  const completionRate = totalExecuted / plan.totalShares;

  // 执行质量
  let executionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  const score = Math.abs(implementationShortfall);
  if (score < 5 && completionRate > 0.99) executionQuality = 'excellent';
  else if (score < 15 && completionRate > 0.95) executionQuality = 'good';
  else if (score < 30 && completionRate > 0.9) executionQuality = 'fair';
  else executionQuality = 'poor';

  return {
    plan,
    actualVWAP,
    implementationShortfall,
    timingCost,
    marketImpact,
    slippage,
    completionRate,
    executionQuality,
  };
}

export function adjustExecution(
  plan: ExecutionPlan,
  realizedVolumes: Array<{ timeSlot: string; volume: number }>,
  remainingShares: number
): ExecutionSlice[] {
  const realizedMap = new Map(realizedVolumes.map(rv => [rv.timeSlot, rv.volume]));

  // 重分配剩余股数
  const remainingSlices = plan.slices.filter(s => !realizedMap.has(s.timeSlot));
  const remainingPct = remainingSlices.reduce((s, sl) => s + sl.targetPct, 0);

  return remainingSlices.map(sl => ({
    ...sl,
    targetShares: remainingPct > 0
      ? Math.round(remainingShares * (sl.targetPct / remainingPct))
      : Math.round(remainingShares / remainingSlices.length),
  }));
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
