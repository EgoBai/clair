/**
 * RebalanceScheduler - 再平衡调度引擎
 * 计算最优再平衡频率和触发条件
 */

export interface RebalanceSignal {
  driftScore: number;      // 0-1
  costScore: number;       // 0-1
  momentumScore: number;   // -1 到 1
  timestamp: number;
}

export interface RebalanceDecision {
  shouldRebalance: boolean;
  urgency: 'low' | 'medium' | 'high';
  reason: string;
  score: number;
  nextCheckMs: number;
}

export function evaluateRebalance(
  signal: RebalanceSignal,
  driftThreshold: number = 0.3,
  costBudget: number = 0.005
): RebalanceDecision {
  const driftOk = signal.driftScore >= driftThreshold;
  const costOk = signal.costScore <= costBudget * 200;
  const compositeScore = signal.driftScore * 0.5 + (1 - signal.costScore / 100) * 0.3 + Math.abs(signal.momentumScore) * 0.2;

  const shouldRebalance = driftOk && costOk;
  let urgency: RebalanceDecision['urgency'];
  if (compositeScore > 0.7) urgency = 'high';
  else if (compositeScore > 0.4) urgency = 'medium';
  else urgency = 'low';

  let reason = '';
  if (driftOk) reason += 'drift_exceeded ';
  if (costOk) reason += 'cost_acceptable ';
  if (Math.abs(signal.momentumScore) > 0.5) reason += 'momentum_shift ';

  const nextCheckMs = urgency === 'high' ? 60000 : urgency === 'medium' ? 300000 : 900000;

  return { shouldRebalance, urgency, reason: reason.trim() || 'no_trigger', score: Math.round(compositeScore * 100) / 100, nextCheckMs };
}
