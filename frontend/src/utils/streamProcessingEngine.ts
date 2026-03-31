/**
 * 数据流处理引擎 - 实时数据流/窗口聚合/异常检测/事件触发
 */

export interface StreamEvent<T = number> {
  timestamp: number;
  value: T;
  metadata?: Record<string, unknown>;
}

export interface WindowConfig {
  size: number; // 窗口大小
  slide: number; // 滑动步长
  type: 'tumbling' | 'sliding' | 'session';
}

export interface AggregationResult {
  windowStart: number;
  windowEnd: number;
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  std: number;
  median: number;
  p95: number;
  p99: number;
}

export interface AnomalyDetection {
  isAnomaly: boolean;
  score: number; // 异常分数 0-1
  method: 'zscore' | 'iqr' | 'isolation';
  expectedRange: [number, number];
  actualValue: number;
  deviation: number;
}

export interface StreamTrigger {
  id: string;
  condition: string;
  callback: string; // callback name
  active: boolean;
  triggerCount: number;
  lastTriggered?: number;
}

/**
 * 滑动窗口聚合
 */
export function slidingWindowAggregate(
  events: StreamEvent[],
  config: WindowConfig,
): AggregationResult[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const results: AggregationResult[] = [];

  const start = sorted[0].timestamp;
  const end = sorted[sorted.length - 1].timestamp;

  if (config.type === 'tumbling') {
    for (let ws = start; ws <= end; ws += config.size) {
      const we = ws + config.size;
      const windowEvents = sorted.filter(e => e.timestamp >= ws && e.timestamp < we);
      if (windowEvents.length > 0) {
        results.push(computeWindowStats(ws, we, windowEvents));
      }
    }
  } else {
    // sliding
    for (let ws = start; ws <= end; ws += config.slide) {
      const we = ws + config.size;
      const windowEvents = sorted.filter(e => e.timestamp >= ws && e.timestamp < we);
      if (windowEvents.length > 0) {
        results.push(computeWindowStats(ws, we, windowEvents));
      }
    }
  }

  return results;
}

function computeWindowStats(ws: number, we: number, events: StreamEvent[]): AggregationResult {
  const values = events.map(e => e.value);
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));

  return {
    windowStart: ws,
    windowEnd: we,
    count: n,
    sum: Math.round(sum * 10000) / 10000,
    mean: Math.round(mean * 10000) / 10000,
    min: sorted[0],
    max: sorted[n - 1],
    std: Math.round(std * 10000) / 10000,
    median: sorted[Math.floor(n / 2)],
    p95: sorted[Math.floor(n * 0.95)] || sorted[n - 1],
    p99: sorted[Math.floor(n * 0.99)] || sorted[n - 1],
  };
}

/**
 * Z-Score异常检测
 */
export function detectAnomalyZScore(
  value: number,
  history: number[],
  threshold: number = 3,
): AnomalyDetection {
  if (history.length < 5) {
    return {
      isAnomaly: false, score: 0, method: 'zscore',
      expectedRange: [value, value], actualValue: value, deviation: 0,
    };
  }

  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const std = Math.sqrt(history.reduce((s, v) => s + (v - mean) ** 2, 0) / (history.length - 1));
  const zScore = std > 0 ? Math.abs((value - mean) / std) : 0;

  const expectedRange: [number, number] = [mean - threshold * std, mean + threshold * std];
  const isAnomaly = zScore > threshold;
  const score = Math.min(1, zScore / (threshold * 2));

  return {
    isAnomaly,
    score: Math.round(score * 1000) / 1000,
    method: 'zscore',
    expectedRange: [Math.round(expectedRange[0] * 10000) / 10000, Math.round(expectedRange[1] * 10000) / 10000],
    actualValue: value,
    deviation: Math.round(zScore * 100) / 100,
  };
}

/**
 * IQR异常检测
 */
export function detectAnomalyIQR(
  value: number,
  history: number[],
  multiplier: number = 1.5,
): AnomalyDetection {
  if (history.length < 5) {
    return {
      isAnomaly: false, score: 0, method: 'iqr',
      expectedRange: [value, value], actualValue: value, deviation: 0,
    };
  }

  const sorted = [...history].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - multiplier * iqr;
  const upper = q3 + multiplier * iqr;

  const isAnomaly = value < lower || value > upper;
  const deviation = value < lower ? (lower - value) / iqr : value > upper ? (value - upper) / iqr : 0;
  const score = Math.min(1, deviation / 3);

  return {
    isAnomaly,
    score: Math.round(score * 1000) / 1000,
    method: 'iqr',
    expectedRange: [Math.round(lower * 10000) / 10000, Math.round(upper * 10000) / 10000],
    actualValue: value,
    deviation: Math.round(deviation * 100) / 100,
  };
}

/**
 * 指数加权移动平均
 */
export function ewma(events: StreamEvent[], alpha: number = 0.3): number[] {
  if (events.length === 0) return [];

  const result: number[] = [events[0].value];
  for (let i = 1; i < events.length; i++) {
    result.push(alpha * events[i].value + (1 - alpha) * result[i - 1]);
  }
  return result;
}

/**
 * 变点检测 (CUSUM)
 */
export function detectChangePoint(
  series: number[],
  threshold: number = 5,
): Array<{ index: number; type: 'increase' | 'decrease'; magnitude: number }> {
  if (series.length < 3) return [];

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const std = Math.sqrt(series.reduce((s, v) => s + (v - mean) ** 2, 0) / (series.length - 1));

  const changePoints: Array<{ index: number; type: 'increase' | 'decrease'; magnitude: number }> = [];

  let cumSum = 0;
  let minCumSum = 0;
  let maxCumSum = 0;

  for (let i = 0; i < series.length; i++) {
    cumSum += (series[i] - mean) / (std || 1);

    if (cumSum - minCumSum > threshold) {
      changePoints.push({ index: i, type: 'increase', magnitude: Math.round((cumSum - minCumSum) * 100) / 100 });
      cumSum = 0;
      minCumSum = 0;
      maxCumSum = 0;
    } else if (maxCumSum - cumSum > threshold) {
      changePoints.push({ index: i, type: 'decrease', magnitude: Math.round((maxCumSum - cumSum) * 100) / 100 });
      cumSum = 0;
      minCumSum = 0;
      maxCumSum = 0;
    }

    minCumSum = Math.min(minCumSum, cumSum);
    maxCumSum = Math.max(maxCumSum, cumSum);
  }

  return changePoints;
}
