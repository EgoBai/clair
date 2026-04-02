/**
 * 数据质量评分引擎
 * 对市场数据进行多维度质量评估
 */

export interface DataQualityConfig {
  maxMissingRatio: number;
  maxOutlierStdDevs: number;
  minTimeliness: number;    // 最大延迟（秒）
  minCompleteness: number;  // 最低完整性要求
  maxGapMinutes: number;    // 最大允许间隔（分钟）
}

export interface QualityScore {
  symbol: string;
  overall: number;         // 0-100
  completeness: number;    // 数据完整性
  accuracy: number;        // 数据准确性
  timeliness: number;      // 数据时效性
  consistency: number;     // 数据一致性
  issues: QualityIssue[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface QualityIssue {
  type: 'missing' | 'outlier' | 'gap' | 'stale' | 'inconsistent' | 'duplicate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedFields: string[];
  timestamp?: number;
}

export interface DataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QualityReport {
  timestamp: number;
  totalSymbols: number;
  passingSymbols: number;
  failingSymbols: number;
  avgScore: number;
  scores: QualityScore[];
  topIssues: { type: QualityIssue['type']; count: number }[];
}

const DEFAULT_CONFIG: DataQualityConfig = {
  maxMissingRatio: 0.05,
  maxOutlierStdDevs: 4,
  minTimeliness: 300,
  minCompleteness: 0.95,
  maxGapMinutes: 10,
};

/**
 * 检测缺失数据
 */
export function detectMissingData(
  data: (DataPoint | null)[],
  expectedInterval: number,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  let missingCount = 0;
  let lastValid: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (data[i] === null) {
      missingCount++;
      continue;
    }

    if (lastValid !== null) {
      const gap = data[i]!.timestamp - lastValid;
      if (gap > expectedInterval * 1.5) {
        issues.push({
          type: 'gap',
          severity: gap > expectedInterval * 3 ? 'high' : 'medium',
          description: `Data gap of ${Math.round(gap / 1000)}s detected`,
          affectedFields: ['timestamp'],
          timestamp: data[i]!.timestamp,
        });
      }
    }
    lastValid = data[i]!.timestamp;
  }

  const missingRatio = data.length > 0 ? missingCount / data.length : 0;
  if (missingRatio > 0.01) {
    issues.push({
      type: 'missing',
      severity: missingRatio > 0.1 ? 'critical' : missingRatio > 0.05 ? 'high' : 'medium',
      description: `${(missingRatio * 100).toFixed(1)}% missing data`,
      affectedFields: ['all'],
    });
  }

  return issues;
}

/**
 * 检测异常值
 */
export function detectOutliers(data: DataPoint[], config?: Partial<DataQualityConfig>): QualityIssue[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const issues: QualityIssue[] = [];

  if (data.length < 5) return issues;

  const closes = data.map(d => d.close);
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length);

  for (let i = 0; i < returns.length; i++) {
    if (stdDev > 0 && Math.abs(returns[i] - mean) > cfg.maxOutlierStdDevs * stdDev) {
      issues.push({
        type: 'outlier',
        severity: 'medium',
        description: `Return outlier at index ${i + 1}: ${(returns[i] * 100).toFixed(2)}%`,
        affectedFields: ['close'],
        timestamp: data[i + 1]?.timestamp,
      });
    }
  }

  // 检查OHLC逻辑：high >= max(open, close), low <= min(open, close)
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d.high < Math.max(d.open, d.close) || d.low > Math.min(d.open, d.close)) {
      issues.push({
        type: 'inconsistent',
        severity: 'high',
        description: `OHLC inconsistency at index ${i}`,
        affectedFields: ['open', 'high', 'low', 'close'],
        timestamp: d.timestamp,
      });
    }
  }

  return issues;
}

/**
 * 检测重复数据
 */
export function detectDuplicates(data: DataPoint[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const seen = new Set<number>();

  for (const d of data) {
    if (seen.has(d.timestamp)) {
      issues.push({
        type: 'duplicate',
        severity: 'medium',
        description: `Duplicate timestamp: ${d.timestamp}`,
        affectedFields: ['timestamp'],
        timestamp: d.timestamp,
      });
    }
    seen.add(d.timestamp);
  }

  return issues;
}

/**
 * 检测数据时效性
 */
export function detectStaleData(
  data: DataPoint[],
  currentTime: number,
  config?: Partial<DataQualityConfig>,
): QualityIssue[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const issues: QualityIssue[] = [];

  if (data.length === 0) {
    issues.push({
      type: 'stale',
      severity: 'critical',
      description: 'No data available',
      affectedFields: ['all'],
    });
    return issues;
  }

  const latest = data[data.length - 1];
  const age = (currentTime - latest.timestamp) / 1000;

  if (age > cfg.minTimeliness) {
    issues.push({
      type: 'stale',
      severity: age > cfg.minTimeliness * 3 ? 'critical' : 'high',
      description: `Data is ${Math.round(age)}s old`,
      affectedFields: ['timestamp'],
      timestamp: latest.timestamp,
    });
  }

  return issues;
}

/**
 * 计算完整性分数
 */
export function computeCompletenessScore(data: (DataPoint | null)[]): number {
  if (data.length === 0) return 0;
  const validCount = data.filter(d => d !== null).length;
  return validCount / data.length;
}

/**
 * 计算准确性分数
 */
export function computeAccuracyScore(issues: QualityIssue[]): number {
  const weights = { critical: 20, high: 10, medium: 5, low: 2 };
  let deductions = 0;

  for (const issue of issues) {
    if (issue.type === 'outlier' || issue.type === 'inconsistent') {
      deductions += weights[issue.severity];
    }
  }

  return Math.max(0, 1 - deductions / 100);
}

/**
 * 计算一致性分数
 */
export function computeConsistencyScore(data: DataPoint[]): number {
  if (data.length < 2) return 1;

  let issues = 0;
  const volumes = data.map(d => d.volume);
  const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;

  for (let i = 1; i < data.length; i++) {
    // 检查价格连续性（单日变动不超过50%）
    const change = Math.abs(data[i].close - data[i - 1].close) / data[i - 1].close;
    if (change > 0.5) issues++;

    // 检查成交量异常
    if (avgVol > 0 && data[i].volume > avgVol * 100) issues++;
  }

  return Math.max(0, 1 - issues / data.length);
}

/**
 * 综合质量评分
 */
export function evaluateDataQuality(
  symbol: string,
  data: (DataPoint | null)[],
  currentTime: number,
  config?: Partial<DataQualityConfig>,
): QualityScore {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const expectedInterval = 60000; // 1分钟

  const validData = data.filter((d): d is DataPoint => d !== null);
  const allIssues: QualityIssue[] = [
    ...detectMissingData(data, expectedInterval),
    ...detectOutliers(validData, cfg),
    ...detectDuplicates(validData),
    ...detectStaleData(validData, currentTime, cfg),
  ];

  const completeness = computeCompletenessScore(data);
  const accuracy = computeAccuracyScore(allIssues);
  const consistency = computeConsistencyScore(validData);

  // 时效性分数
  const latest = validData.length > 0 ? validData[validData.length - 1] : null;
  const age = latest ? (currentTime - latest.timestamp) / 1000 : Infinity;
  const timeliness = age < cfg.minTimeliness ? 1 : Math.max(0, 1 - (age - cfg.minTimeliness) / cfg.minTimeliness);

  const overall = completeness * 30 + accuracy * 30 + consistency * 20 + timeliness * 20;

  let grade: QualityScore['grade'];
  if (overall >= 90) grade = 'A';
  else if (overall >= 75) grade = 'B';
  else if (overall >= 60) grade = 'C';
  else if (overall >= 40) grade = 'D';
  else grade = 'F';

  return {
    symbol,
    overall,
    completeness,
    accuracy,
    timeliness,
    consistency,
    issues: allIssues,
    grade,
  };
}

/**
 * 生成质量报告
 */
export function generateQualityReport(
  evaluations: QualityScore[],
): QualityReport {
  const issueCounts: Record<string, number> = {};
  for (const ev of evaluations) {
    for (const issue of ev.issues) {
      issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
    }
  }

  const topIssues = Object.entries(issueCounts)
    .map(([type, count]) => ({ type: type as QualityIssue['type'], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const passingSymbols = evaluations.filter(e => e.overall >= 60).length;

  return {
    timestamp: Date.now(),
    totalSymbols: evaluations.length,
    passingSymbols,
    failingSymbols: evaluations.length - passingSymbols,
    avgScore: evaluations.length > 0
      ? evaluations.reduce((s, e) => s + e.overall, 0) / evaluations.length : 0,
    scores: evaluations,
    topIssues,
  };
}
