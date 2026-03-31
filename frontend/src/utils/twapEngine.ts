/**
 * TWAP执行算法引擎
 * - 时间加权切片
 * - 自适应节奏调整
 * - 冲击最小化
 * - 完成率监控
 */
export interface TWAPSlice {
  startTime: string;
  endTime: string;
  targetShares: number;
  limitPrice?: number;
  urgency: 'low' | 'medium' | 'high';
}

export interface TWAPPlan {
  totalShares: number;
  startTime: string;
  endTime: string;
  sliceDuration: number; // 分钟
  slices: TWAPSlice[];
  maxParticipationRate: number;
}

export interface TWAPResult {
  plan: TWAPPlan;
  executedShares: number;
  completionRate: number;
  avgExecutionPrice: number;
  timingScore: number; // 执行时机评分 0-100
  impactEstimate: number;
  residualShares: number;
}

export function createTWAPPlan(
  totalShares: number,
  startTime: string,
  endTime: string,
  sliceDuration: number = 5,
  maxParticipation: number = 0.2
): TWAPPlan {
  const startMin = timeToMin(startTime);
  const endMin = timeToMin(endTime);
  const totalMinutes = endMin - startMin;
  const sliceCount = Math.max(1, Math.floor(totalMinutes / sliceDuration));
  const sharesPerSlice = Math.floor(totalShares / sliceCount);
  const remainder = totalShares - sharesPerSlice * sliceCount;

  const slices: TWAPSlice[] = [];
  for (let i = 0; i < sliceCount; i++) {
    const sStart = minToTime(startMin + i * sliceDuration);
    const sEnd = minToTime(startMin + (i + 1) * sliceDuration);
    const targetShares = sharesPerSlice + (i === sliceCount - 1 ? remainder : 0);
    const urgency = i < sliceCount * 0.3 ? 'low' : i < sliceCount * 0.7 ? 'medium' : 'high';
    slices.push({ startTime: sStart, endTime: sEnd, targetShares, urgency });
  }

  return { totalShares, startTime, endTime, sliceDuration, slices, maxParticipationRate: maxParticipation };
}

export function evaluateTWAP(
  plan: TWAPPlan,
  executions: Array<{ time: string; price: number; shares: number }>,
  marketVWAP: number
): TWAPResult {
  const executedShares = executions.reduce((s, e) => s + e.shares, 0);
  const completionRate = executedShares / plan.totalShares;
  const totalValue = executions.reduce((s, e) => s + e.price * e.shares, 0);
  const avgExecutionPrice = executedShares > 0 ? totalValue / executedShares : 0;

  // 时机评分
  let timingScore = 100;
  for (const exec of executions) {
    const sliceIdx = plan.slices.findIndex(s =>
      timeToMin(exec.time) >= timeToMin(s.startTime) && timeToMin(exec.time) <= timeToMin(s.endTime)
    );
    if (sliceIdx >= 0) {
      const planned = plan.slices[sliceIdx].targetShares;
      const deviation = Math.abs(exec.shares - planned) / Math.max(planned, 1);
      timingScore -= deviation * 10;
    }
  }
  timingScore = Math.max(0, Math.min(100, timingScore));

  // 市场冲击估计
  const impactEstimate = marketVWAP > 0
    ? Math.abs(avgExecutionPrice - marketVWAP) / marketVWAP * 10000
    : 0;

  return {
    plan,
    executedShares,
    completionRate,
    avgExecutionPrice,
    timingScore,
    impactEstimate,
    residualShares: plan.totalShares - executedShares,
  };
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}
