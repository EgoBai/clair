/**
 * 异常检测引擎
 * 多维异常检测: 统计方法 + 机器学习简化
 */

// ==================== 类型定义 ====================
export interface AnomalyPoint {
  index: number;
  value: number;
  score: number; // 0-1, 越高越异常
  method: string;
  expectedValue: number;
  deviation: number;
}

export interface AnomalyDetectionResult {
  anomalies: AnomalyPoint[];
  normalRange: { lower: number; upper: number };
  anomalyRate: number;
  methods: string[];
  consensusAnomalies: AnomalyPoint[]; // 多方法一致检测
}

export interface TimeSeriesAnomaly {
  timestamp: number;
  value: number;
  type: 'point' | 'contextual' | 'collective';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  surroundingValues: number[];
}

export interface MultivariateAnomaly {
  index: number;
  scores: Map<string, number>; // 每个维度的异常分
  compositeScore: number;
  topContributors: string[]; // 最大贡献维度
  isAnomaly: boolean;
}

export interface AnomalyTrend {
  windowAnomalyRate: number[];
  trend: 'increasing' | 'decreasing' | 'stable';
  currentRisk: 'low' | 'medium' | 'high';
  predictedNextAnomaly: number; // 预测下一个异常点位置
}

// ==================== 核心引擎 ====================
export class AnomalyDetectionEngine {
  /**
   * Z-Score异常检测
   */
  detectZScoreAnomalies(data: number[], threshold: number = 3): AnomalyPoint[] {
    if (data.length < 3) return [];

    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length;
    const std = Math.sqrt(variance);

    if (std === 0) return [];

    const anomalies: AnomalyPoint[] = [];
    for (let i = 0; i < data.length; i++) {
      const zScore = Math.abs((data[i] - mean) / std);
      if (zScore > threshold) {
        anomalies.push({
          index: i,
          value: data[i],
          score: Math.min(1, zScore / (threshold * 2)),
          method: 'z-score',
          expectedValue: mean,
          deviation: zScore
        });
      }
    }
    return anomalies;
  }

  /**
   * IQR异常检测
   */
  detectIQRAnomalies(data: number[], multiplier: number = 1.5): AnomalyPoint[] {
    if (data.length < 4) return [];

    const sorted = [...data].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q3 = this.percentile(sorted, 75);
    const iqr = q3 - q1;
    const lower = q1 - multiplier * iqr;
    const upper = q3 + multiplier * iqr;

    const anomalies: AnomalyPoint[] = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] < lower || data[i] > upper) {
        const deviation = data[i] < lower
          ? (lower - data[i]) / iqr
          : (data[i] - upper) / iqr;
        anomalies.push({
          index: i,
          value: data[i],
          score: Math.min(1, deviation / 3),
          method: 'iqr',
          expectedValue: (q1 + q3) / 2,
          deviation
        });
      }
    }
    return anomalies;
  }

  /**
   * 移动平均异常检测
   */
  detectMovingAverageAnomalies(
    data: number[],
    windowSize: number = 20,
    threshold: number = 2.5
  ): AnomalyPoint[] {
    if (data.length < windowSize + 1) return [];

    const anomalies: AnomalyPoint[] = [];

    for (let i = windowSize; i < data.length; i++) {
      const window = data.slice(i - windowSize, i);
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
      const std = Math.sqrt(variance);

      if (std === 0) continue;

      const deviation = Math.abs(data[i] - mean) / std;
      if (deviation > threshold) {
        anomalies.push({
          index: i,
          value: data[i],
          score: Math.min(1, deviation / (threshold * 2)),
          method: 'moving-average',
          expectedValue: mean,
          deviation
        });
      }
    }
    return anomalies;
  }

  /**
   * EWMA异常检测
   */
  detectEWMAAnomalies(
    data: number[],
    alpha: number = 0.2,
    threshold: number = 3
  ): AnomalyPoint[] {
    if (data.length < 5) return [];

    const anomalies: AnomalyPoint[] = [];
    let ewma = data[0];
    let ewmaVar = 0;

    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - ewma;
      ewma = alpha * data[i] + (1 - alpha) * ewma;
      ewmaVar = alpha * diff * diff + (1 - alpha) * ewmaVar;
      const std = Math.sqrt(ewmaVar);

      if (std > 0 && Math.abs(diff) / std > threshold) {
        anomalies.push({
          index: i,
          value: data[i],
          score: Math.min(1, Math.abs(diff) / std / (threshold * 2)),
          method: 'ewma',
          expectedValue: ewma,
          deviation: Math.abs(diff) / std
        });
      }
    }
    return anomalies;
  }

  /**
   * 综合异常检测 (多方法投票)
   */
  detectAnomalies(
    data: number[],
    zThreshold: number = 3,
    iqrMultiplier: number = 1.5,
    maWindow: number = 20,
    minVotes: number = 2
  ): AnomalyDetectionResult {
    const zAnomalies = this.detectZScoreAnomalies(data, zThreshold);
    const iqrAnomalies = this.detectIQRAnomalies(data, iqrMultiplier);
    const maAnomalies = this.detectMovingAverageAnomalies(data, maWindow);

    const allAnomalies = [...zAnomalies, ...iqrAnomalies, ...maAnomalies];
    const methods = ['z-score', 'iqr', 'moving-average'];

    // 共识异常: 被多个方法检测到
    const voteMap = new Map<number, { votes: number; anomaly: AnomalyPoint }>();
    for (const a of allAnomalies) {
      const existing = voteMap.get(a.index);
      if (existing) {
        existing.votes++;
        if (a.score > existing.anomaly.score) existing.anomaly = a;
      } else {
        voteMap.set(a.index, { votes: 1, anomaly: a });
      }
    }

    const consensusAnomalies: AnomalyPoint[] = [];
    for (const [, { votes, anomaly }] of voteMap) {
      if (votes >= minVotes) {
        consensusAnomalies.push({ ...anomaly, score: Math.min(1, anomaly.score * (votes / methods.length + 0.5)) });
      }
    }

    // 正常范围
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q3 = this.percentile(sorted, 75);
    const iqr = q3 - q1;

    return {
      anomalies: allAnomalies,
      normalRange: { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr },
      anomalyRate: data.length > 0 ? consensusAnomalies.length / data.length : 0,
      methods,
      consensusAnomalies
    };
  }

  /**
   * 时间序列异常检测
   */
  detectTimeSeriesAnomalies(
    values: number[],
    timestamps: number[],
    windowSize: number = 20
  ): TimeSeriesAnomaly[] {
    if (values.length < windowSize + 1) return [];

    const anomalies: TimeSeriesAnomaly[] = [];

    for (let i = windowSize; i < values.length - 1; i++) {
      const window = values.slice(i - windowSize, i);
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);

      if (std === 0) continue;

      const dev = Math.abs(values[i] - mean) / std;

      // 点异常
      if (dev > 3) {
        const surrounding = values.slice(Math.max(0, i - 3), Math.min(values.length, i + 4));
        let severity: TimeSeriesAnomaly['severity'];
        if (dev > 5) severity = 'critical';
        else if (dev > 4) severity = 'high';
        else if (dev > 3.5) severity = 'medium';
        else severity = 'low';

        anomalies.push({
          timestamp: timestamps[i],
          value: values[i],
          type: 'point',
          severity,
          description: `价格偏离均值${dev.toFixed(1)}个标准差`,
          surroundingValues: surrounding
        });
      }

      // 上下文异常: 连续同方向变化
      if (i >= 3) {
        const changes = [values[i] - values[i-1], values[i-1] - values[i-2], values[i-2] - values[i-3]];
        const allSameDir = changes.every(c => c > 0) || changes.every(c => c < 0);
        if (allSameDir) {
          const totalChange = Math.abs(values[i] - values[i-3]) / Math.abs(values[i-3]) * 100;
          if (totalChange > 5) {
            anomalies.push({
              timestamp: timestamps[i],
              value: values[i],
              type: 'contextual',
              severity: totalChange > 10 ? 'high' : 'medium',
              description: `连续单向变化${totalChange.toFixed(1)}%`,
              surroundingValues: values.slice(Math.max(0, i - 3), i + 1)
            });
          }
        }
      }
    }

    return anomalies;
  }

  /**
   * 多维异常检测
   */
  detectMultivariateAnomalies(
    dimensions: Map<string, number[]>,
    threshold: number = 0.7
  ): MultivariateAnomaly[] {
    const dimNames = Array.from(dimensions.keys());
    const firstDim = dimensions.get(dimNames[0]);
    if (!firstDim || firstDim.length < 5) return [];

    const n = firstDim.length;
    const results: MultivariateAnomaly[] = [];

    // 计算每维度的Z-Score
    const zScores = new Map<string, number[]>();
    for (const [name, values] of dimensions) {
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      zScores.set(name, values.map(v => std > 0 ? Math.abs((v - mean) / std) : 0));
    }

    for (let i = 0; i < n; i++) {
      const scores = new Map<string, number>();
      let compositeSum = 0;

      for (const name of dimNames) {
        const z = zScores.get(name)![i];
        const score = Math.min(1, z / 4); // 归一化到0-1
        scores.set(name, score);
        compositeSum += score;
      }

      const compositeScore = compositeSum / dimNames.length;
      const topContributors = dimNames
        .sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0))
        .slice(0, 3);

      results.push({
        index: i,
        scores,
        compositeScore: Math.round(compositeScore * 10000) / 10000,
        topContributors,
        isAnomaly: compositeScore > threshold
      });
    }

    return results;
  }

  /**
   * 异常趋势分析
   */
  analyzeAnomalyTrend(
    data: number[],
    windowSize: number = 50,
    stepSize: number = 10
  ): AnomalyTrend {
    if (data.length < windowSize) {
      return { windowAnomalyRate: [], trend: 'stable', currentRisk: 'low', predictedNextAnomaly: -1 };
    }

    const windowAnomalyRate: number[] = [];

    for (let i = 0; i <= data.length - windowSize; i += stepSize) {
      const window = data.slice(i, i + windowSize);
      const result = this.detectAnomalies(window, 3, 1.5, Math.min(20, windowSize), 2);
      windowAnomalyRate.push(result.anomalyRate);
    }

    // 趋势判断
    const recent = windowAnomalyRate.slice(-3);
    const earlier = windowAnomalyRate.slice(0, 3);
    const avgRecent = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
    const avgEarlier = earlier.length > 0 ? earlier.reduce((s, v) => s + v, 0) / earlier.length : 0;

    let trend: AnomalyTrend['trend'];
    if (avgRecent > avgEarlier * 1.5) trend = 'increasing';
    else if (avgRecent < avgEarlier * 0.5) trend = 'decreasing';
    else trend = 'stable';

    let currentRisk: AnomalyTrend['currentRisk'];
    if (avgRecent > 0.1) currentRisk = 'high';
    else if (avgRecent > 0.05) currentRisk = 'medium';
    else currentRisk = 'low';

    // 预测下一个异常 (简化: 基于最近异常间隔)
    const consensusResult = this.detectAnomalies(data);
    const anomalyIndices = consensusResult.consensusAnomalies.map(a => a.index).sort((a, b) => a - b);
    let predictedNext = -1;
    if (anomalyIndices.length >= 2) {
      const intervals = [];
      for (let i = 1; i < anomalyIndices.length; i++) {
        intervals.push(anomalyIndices[i] - anomalyIndices[i - 1]);
      }
      const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      predictedNext = Math.round(anomalyIndices[anomalyIndices.length - 1] + avgInterval);
    }

    return {
      windowAnomalyRate,
      trend,
      currentRisk,
      predictedNextAnomaly: predictedNext
    };
  }

  // ==================== 辅助方法 ====================
  private percentile(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }
}

export default AnomalyDetectionEngine;
