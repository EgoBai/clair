/**
 * 策略信号评分引擎
 * 多维度信号质量评估与组合
 */

export interface SignalComponent {
  name: string;
  value: number;         // -1 to 1
  weight: number;
  confidence: number;    // 0 to 1
  recency: number;       // 信号新旧度 (0 to 1, 1=最新)
}

export interface SignalScore {
  composite: number;     // -1 to 1
  confidence: number;    // 0 to 1
  components: SignalComponent[];
  agreement: number;     // 信号一致度
  strength: 'weak' | 'moderate' | 'strong' | 'very_strong';
  direction: 'bullish' | 'bearish' | 'neutral';
}

export interface SignalHistory {
  timestamp: number;
  score: SignalScore;
  outcome?: number;      // 实际结果收益
}

export interface SignalAccuracy {
  totalSignals: number;
  correctSignals: number;
  accuracy: number;
  avgReturn: number;
  sharpe: number;
  maxDrawdown: number;
  byStrength: Record<string, { count: number; accuracy: number; avgReturn: number }>;
}

/**
 * 加权复合信号评分
 */
export function computeSignalScore(components: SignalComponent[]): SignalScore {
  if (components.length === 0) {
    return {
      composite: 0, confidence: 0, components: [],
      agreement: 0, strength: 'weak', direction: 'neutral',
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let confidenceSum = 0;

  for (const c of components) {
    const decayedWeight = c.weight * c.confidence * c.recency;
    weightedSum += c.value * decayedWeight;
    totalWeight += decayedWeight;
    confidenceSum += c.confidence * c.weight;
  }

  const totalWeightNorm = components.reduce((s, c) => s + c.weight, 0);
  const composite = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const confidence = totalWeightNorm > 0 ? confidenceSum / totalWeightNorm : 0;

  // 信号一致度
  const directions = components.map(c => Math.sign(c.value));
  const positiveCount = directions.filter(d => d > 0).length;
  const negativeCount = directions.filter(d => d < 0).length;
  const maxAgreement = Math.max(positiveCount, negativeCount, components.length - positiveCount - negativeCount);
  const agreement = maxAgreement / components.length;

  // 信号强度
  const absComposite = Math.abs(composite);
  let strength: SignalScore['strength'];
  if (absComposite > 0.7) strength = 'very_strong';
  else if (absComposite > 0.4) strength = 'strong';
  else if (absComposite > 0.15) strength = 'moderate';
  else strength = 'weak';

  const direction: SignalScore['direction'] =
    composite > 0.05 ? 'bullish' : composite < -0.05 ? 'bearish' : 'neutral';

  return { composite, confidence, components, agreement, strength, direction };
}

/**
 * 信号衰减函数
 */
export function decaySignal(value: number, age: number, halfLife: number): number {
  const decayFactor = Math.pow(0.5, age / halfLife);
  return value * decayFactor;
}

/**
 * 动态权重调整（基于近期准确率）
 */
export function adaptiveWeights(
  components: SignalComponent[],
  recentAccuracy: Record<string, number>,
): SignalComponent[] {
  return components.map(c => ({
    ...c,
    weight: c.weight * (recentAccuracy[c.name] ?? 0.5),
  }));
}

/**
 * 信号冲突检测
 */
export function detectSignalConflicts(components: SignalComponent[]): {
  hasConflict: boolean;
  conflictingPairs: [string, string][];
  conflictSeverity: number;
} {
  const conflictingPairs: [string, string][] = [];
  let maxConflict = 0;

  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const a = components[i];
      const b = components[j];

      // 两个信号方向相反且都有较高置信度
      if (Math.sign(a.value) !== Math.sign(b.value) &&
          Math.abs(a.value) > 0.2 && Math.abs(b.value) > 0.2) {
        conflictingPairs.push([a.name, b.name]);
        const severity = Math.abs(a.value - b.value) * Math.min(a.confidence, b.confidence);
        maxConflict = Math.max(maxConflict, severity);
      }
    }
  }

  return {
    hasConflict: conflictingPairs.length > 0,
    conflictingPairs,
    conflictSeverity: maxConflict,
  };
}

/**
 * 回测信号准确率
 */
export function computeSignalAccuracy(
  history: SignalHistory[],
  threshold = 0.1,
): SignalAccuracy {
  const validHistory = history.filter(h => h.outcome !== undefined);
  const totalSignals = validHistory.length;

  const correctSignals = validHistory.filter(h => {
    const predicted = h.score.composite > threshold ? 1 : h.score.composite < -threshold ? -1 : 0;
    const actual = (h.outcome ?? 0) > 0 ? 1 : (h.outcome ?? 0) < 0 ? -1 : 0;
    return predicted === actual || predicted === 0;
  }).length;

  const accuracy = totalSignals > 0 ? correctSignals / totalSignals : 0;
  const returns = validHistory.map(h => h.outcome ?? 0);
  const avgReturn = returns.length > 0 ? returns.reduce((s, v) => s + v, 0) / returns.length : 0;

  // Sharpe
  const mean = avgReturn;
  const variance = returns.length > 1
    ? returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1) : 0;
  const sharpe = variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(252) : 0;

  // 最大回撤
  let cumulative = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const r of returns) {
    cumulative *= (1 + r);
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, (peak - cumulative) / peak);
  }

  // 按强度分类
  const byStrength: SignalAccuracy['byStrength'] = {};
  for (const h of validHistory) {
    const s = h.score.strength;
    if (!byStrength[s]) byStrength[s] = { count: 0, accuracy: 0, avgReturn: 0 };
    byStrength[s].count++;
  }

  for (const s of Object.keys(byStrength)) {
    const subset = validHistory.filter(h => h.score.strength === s);
    const correct = subset.filter(h => {
      const predicted = h.score.composite > threshold ? 1 : h.score.composite < -threshold ? -1 : 0;
      const actual = (h.outcome ?? 0) > 0 ? 1 : (h.outcome ?? 0) < 0 ? -1 : 0;
      return predicted === actual || predicted === 0;
    }).length;
    byStrength[s].accuracy = subset.length > 0 ? correct / subset.length : 0;
    byStrength[s].avgReturn = subset.length > 0
      ? subset.reduce((sum, h) => sum + (h.outcome ?? 0), 0) / subset.length : 0;
  }

  return { totalSignals, correctSignals, accuracy, avgReturn, sharpe, maxDrawdown, byStrength };
}

/**
 * 信号过滤器（基于置信度和一致性）
 */
export function filterSignals(
  components: SignalComponent[],
  minConfidence = 0.5,
  minAgreement = 0.6,
): SignalComponent[] {
  const score = computeSignalScore(components);
  if (score.confidence < minConfidence || score.agreement < minAgreement) {
    return [];
  }
  return components.filter(c => c.confidence >= minConfidence * 0.5);
}

/**
 * 多时间框架信号聚合
 */
export function aggregateMultiTimeframe(
  timeframeSignals: { timeframe: string; components: SignalComponent[] }[],
  timeframeWeights: Record<string, number>,
): SignalScore {
  const allComponents: SignalComponent[] = [];

  for (const { timeframe, components } of timeframeSignals) {
    const tfWeight = timeframeWeights[timeframe] ?? 1;
    for (const c of components) {
      allComponents.push({ ...c, weight: c.weight * tfWeight });
    }
  }

  return computeSignalScore(allComponents);
}
