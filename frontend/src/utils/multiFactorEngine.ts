/**
 * Multi-Factor Stock Selection Engine
 *
 * 多维度因子评分、动态权重调整、排名筛选
 */

export type FactorCategory = 'value' | 'growth' | 'momentum' | 'quality' | 'volatility';

export interface FactorDefinition {
  id: string;
  name: string;
  category: FactorCategory;
  weight: number;
  direction: 'higher_better' | 'lower_better';
  minRange: number;
  maxRange: number;
}

export interface StockFactors {
  symbol: string;
  name: string;
  factors: Record<string, number>;
  timestamp: number;
}

export interface ScoringConfig {
  factors: FactorDefinition[];
  normalization: 'zscore' | 'minmax' | 'percentile';
  outlierHandling: 'clip' | 'remove' | 'ignore';
  minDataPoints: number;
}

export interface StockScore {
  symbol: string;
  name: string;
  totalScore: number;
  factorScores: Record<string, number>;
  rank: number;
  percentile: number;
  category: FactorCategory | 'composite';
}

export interface SelectionResult {
  scores: StockScore[];
  topN: StockScore[];
  stats: {
    total: number;
    scored: number;
    filtered: number;
    avgScore: number;
    scoreStd: number;
  };
}

/**
 * Z-Score标准化
 */
export function normalizeZScore(values: number[]): number[] {
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length === 0) return values.map(() => 0);

  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  const variance = valid.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / valid.length;
  const std = Math.sqrt(variance) || 1;

  return values.map(v => {
    if (v === null || isNaN(v)) return 0;
    return (v - mean) / std;
  });
}

/**
 * Min-Max标准化
 */
export function normalizeMinMax(values: number[]): number[] {
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length === 0) return values.map(() => 0);

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;

  return values.map(v => {
    if (v === null || isNaN(v)) return 0;
    return (v - min) / range;
  });
}

/**
 * 百分位排名
 */
export function normalizePercentile(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  const sorted = [...indexed].sort((a, b) => a.v - b.v);

  const ranks = new Array(values.length).fill(0);
  sorted.forEach((item, rank) => {
    ranks[item.i] = rank / (sorted.length - 1 || 1);
  });

  return ranks;
}

/**
 * 异常值处理
 */
function handleOutliers(values: number[], method: 'clip' | 'remove' | 'ignore'): number[] {
  if (method === 'ignore') return values;

  const valid = values.filter(v => !isNaN(v) && v !== null);
  const sorted = [...valid].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  if (method === 'clip') {
    return values.map(v => {
      if (isNaN(v) || v === null) return v;
      return Math.max(lower, Math.min(upper, v));
    });
  }

  // remove: replace outliers with NaN
  return values.map(v => {
    if (isNaN(v) || v === null) return v;
    return (v < lower || v > upper) ? NaN : v;
  });
}

/**
 * 评分引擎
 */
export function scoreStocks(
  stocks: StockFactors[],
  config: ScoringConfig
): SelectionResult {
  if (stocks.length === 0) {
    return { scores: [], topN: [], stats: { total: 0, scored: 0, filtered: 0, avgScore: 0, scoreStd: 0 } };
  }

  const factorDefs = config.factors;
  const factorIds = factorDefs.map(f => f.id);

  // Extract and normalize each factor
  const normalizedFactors: Map<string, number[]> = new Map();

  for (const fd of factorDefs) {
    let values = stocks.map(s => s.factors[fd.id] ?? NaN);
    values = handleOutliers(values, config.outlierHandling);

    let normalized: number[];
    switch (config.normalization) {
      case 'zscore': normalized = normalizeZScore(values); break;
      case 'minmax': normalized = normalizeMinMax(values); break;
      case 'percentile': normalized = normalizePercentile(values); break;
      default: normalized = normalizeZScore(values);
    }

    // Apply direction
    if (fd.direction === 'lower_better') {
      normalized = normalized.map(v => -v);
    }

    normalizedFactors.set(fd.id, normalized);
  }

  // Compute composite scores
  const totalWeight = factorDefs.reduce((s, f) => s + f.weight, 0) || 1;
  const scores: StockScore[] = stocks.map((stock, i) => {
    const factorScores: Record<string, number> = {};
    let totalScore = 0;

    for (const fd of factorDefs) {
      const normed = normalizedFactors.get(fd.id)![i];
      const weighted = normed * (fd.weight / totalWeight);
      factorScores[fd.id] = Math.round(weighted * 1000) / 1000;
      totalScore += weighted;
    }

    return {
      symbol: stock.symbol,
      name: stock.name,
      totalScore: Math.round(totalScore * 1000) / 1000,
      factorScores,
      rank: 0,
      percentile: 0,
      category: 'composite',
    };
  });

  // Sort and assign ranks
  scores.sort((a, b) => b.totalScore - a.totalScore);
  scores.forEach((s, i) => {
    s.rank = i + 1;
    s.percentile = Math.round(((scores.length - i) / scores.length) * 100);
  });

  const totalScores = scores.map(s => s.totalScore);
  const avgScore = totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
  const scoreStd = Math.sqrt(
    totalScores.reduce((s, v) => s + Math.pow(v - avgScore, 2), 0) / totalScores.length
  );

  return {
    scores,
    topN: scores.slice(0, Math.min(20, scores.length)),
    stats: {
      total: stocks.length,
      scored: scores.filter(s => !isNaN(s.totalScore)).length,
      filtered: stocks.length - scores.filter(s => !isNaN(s.totalScore)).length,
      avgScore: Math.round(avgScore * 1000) / 1000,
      scoreStd: Math.round(scoreStd * 1000) / 1000,
    },
  };
}

/**
 * 动态权重调整（基于因子IC值）
 */
export function adjustWeightsByIC(
  factors: FactorDefinition[],
  icValues: Record<string, number>
): FactorDefinition[] {
  const totalAbsIC = Object.values(icValues).reduce((s, ic) => s + Math.abs(ic), 0) || 1;

  return factors.map(f => ({
    ...f,
    weight: Math.abs(icValues[f.id] ?? 0) / totalAbsIC,
  }));
}

/**
 * 因子相关性过滤（移除高度相关的因子）
 */
export function filterCorrelatedFactors(
  factors: FactorDefinition[],
  correlationMatrix: Record<string, Record<string, number>>,
  threshold: number = 0.8
): FactorDefinition[] {
  const selected: FactorDefinition[] = [];
  const excluded = new Set<string>();

  // Sort by weight descending
  const sorted = [...factors].sort((a, b) => b.weight - a.weight);

  for (const f of sorted) {
    if (excluded.has(f.id)) continue;

    selected.push(f);

    // Exclude highly correlated factors
    const correlations = correlationMatrix[f.id] || {};
    for (const [otherId, corr] of Object.entries(correlations)) {
      if (Math.abs(corr) > threshold && otherId !== f.id) {
        excluded.add(otherId);
      }
    }
  }

  return selected;
}
