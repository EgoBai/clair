/**
 * 盈利预期修正引擎
 * 追踪分析师盈利预期的修正趋势、分歧度和预测能力
 */

export interface EarningsEstimate {
  analyst: string;
  date: string;
  epsEstimate: number;
  revenueEstimate: number;
  previousEps?: number;
}

export interface RevisionResult {
  symbol: string;
  currentConsensus: number;
  revisionDirection: 'up' | 'down' | 'stable';
  revisionMagnitude: number;
  revisionMomentum: number;
  analystCount: number;
  dispersion: number;
  dispersionRatio: number;
  upsideEstimate: number;
  downsideEstimate: number;
  bullishRatio: number;
  revisionHistory: { date: string; consensus: number; count: number }[];
}

/**
 * 计算修正趋势
 */
export function analyzeEarningsRevisions(
  symbol: string,
  estimates: EarningsEstimate[]
): RevisionResult {
  if (estimates.length === 0) {
    return {
      symbol, currentConsensus: 0, revisionDirection: 'stable',
      revisionMagnitude: 0, revisionMomentum: 0, analystCount: 0,
      dispersion: 0, dispersionRatio: 0, upsideEstimate: 0,
      downsideEstimate: 0, bullishRatio: 0, revisionHistory: [],
    };
  }

  const sorted = [...estimates].sort((a, b) => a.date.localeCompare(b.date));
  const epsValues = sorted.map(e => e.epsEstimate);
  const currentConsensus = epsValues.reduce((a, b) => a + b, 0) / epsValues.length;

  // 按日期分组计算共识演变
  const byDate = new Map<string, number[]>();
  sorted.forEach(e => {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e.epsEstimate);
  });

  const revisionHistory = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      consensus: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 1000) / 1000,
      count: vals.length,
    }));

  // 修正方向和幅度
  let revisionDirection: 'up' | 'down' | 'stable' = 'stable';
  let revisionMagnitude = 0;
  let revisionMomentum = 0;

  if (revisionHistory.length >= 2) {
    const first = revisionHistory[0].consensus;
    const last = revisionHistory[revisionHistory.length - 1].consensus;
    revisionMagnitude = first !== 0 ? (last - first) / Math.abs(first) : 0;
    revisionDirection = revisionMagnitude > 0.01 ? 'up' : revisionMagnitude < -0.01 ? 'down' : 'stable';

    if (revisionHistory.length >= 3) {
      const mid = revisionHistory[Math.floor(revisionHistory.length / 2)].consensus;
      const firstHalfChange = mid - first;
      const secondHalfChange = last - mid;
      revisionMomentum = secondHalfChange - firstHalfChange;
    }
  }

  // 分歧度
  const std = Math.sqrt(epsValues.reduce((s, v) => s + (v - currentConsensus) ** 2, 0) / epsValues.length);
  const dispersion = Math.round(std * 1000) / 1000;
  const dispersionRatio = currentConsensus !== 0 ? Math.round(std / Math.abs(currentConsensus) * 1000) / 1000 : 0;

  // 多空比例
  const withPrev = sorted.filter(e => e.previousEps !== undefined);
  const bullish = withPrev.filter(e => e.epsEstimate > (e.previousEps || 0)).length;
  const bullishRatio = withPrev.length > 0 ? Math.round(bullish / withPrev.length * 100) / 100 : 0;

  const sortedEps = [...epsValues].sort((a, b) => a - b);

  return {
    symbol,
    currentConsensus: Math.round(currentConsensus * 1000) / 1000,
    revisionDirection,
    revisionMagnitude: Math.round(revisionMagnitude * 10000) / 10000,
    revisionMomentum: Math.round(revisionMomentum * 10000) / 10000,
    analystCount: estimates.length,
    dispersion,
    dispersionRatio,
    upsideEstimate: sortedEps[sortedEps.length - 1],
    downsideEstimate: sortedEps[0],
    bullishRatio,
    revisionHistory,
  };
}

/**
 * 修正动量评分 (0-100)
 */
export function revisionMomentumScore(result: RevisionResult): number {
  let score = 50;
  score += result.revisionDirection === 'up' ? 20 : result.revisionDirection === 'down' ? -20 : 0;
  score += Math.min(15, Math.abs(result.revisionMagnitude) * 500);
  score += result.revisionMomentum > 0 ? 10 : result.revisionMomentum < 0 ? -10 : 0;
  score += result.bullishRatio > 0.6 ? 10 : result.bullishRatio < 0.4 ? -10 : 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
