/**
 * 盈利预期修正引擎V2
 * - 一致预期变动
 * - 预期修正趋势
 * - 盈利惊喜分析
 * - 分析师覆盖变化
 * - 预期修正动量
 */
export interface EarningsEstimate {
  date: string;
  epsEstimate: number;
  revenueEstimate: number;
  analystCount: number;
  buyRatings: number;
  holdRatings: number;
  sellRatings: number;
}

export interface EarningsRevisionData {
  symbol: string;
  currentEstimates: EarningsEstimate;
  historicalEstimates: EarningsEstimate[];
  actualEps?: number;
  actualRevenue?: number;
}

export interface EarningsRevisionResult {
  symbol: string;
  epsRevisionRatio: number; // EPS预期修正比
  revenueRevisionRatio: number;
  revisionTrend: 'upward' | 'stable' | 'downward';
  revisionMomentum: number; // 修正动量
  analystConsensus: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  coverageChange: 'increasing' | 'stable' | 'decreasing';
  earningsSurprise: number | null;
  revisionScore: number; // 0-100
  confidence: number;
  signals: string[];
}

export function analyzeEarningsRevision(data: EarningsRevisionData): EarningsRevisionResult {
  const signals: string[] = [];
  const { currentEstimates: cur, historicalEstimates: hist } = data;

  if (hist.length < 2) throw new Error('至少需要2期历史预期');

  // EPS修正比
  const prevEps = hist[hist.length - 1].epsEstimate;
  const epsRevisionRatio = prevEps !== 0 ? (cur.epsEstimate - prevEps) / Math.abs(prevEps) : 0;

  // 收入修正比
  const prevRev = hist[hist.length - 1].revenueEstimate;
  const revenueRevisionRatio = prevRev !== 0 ? (cur.revenueEstimate - prevRev) / Math.abs(prevRev) : 0;

  // 修正趋势
  const recentRevisions = hist.slice(-3).map(h => h.epsEstimate);
  let revisionTrend: EarningsRevisionResult['revisionTrend'];
  const avgOld = recentRevisions.reduce((s, v) => s + v, 0) / recentRevisions.length;
  if (cur.epsEstimate > avgOld * 1.02) { revisionTrend = 'upward'; signals.push('盈利预期持续上修'); }
  else if (cur.epsEstimate < avgOld * 0.98) { revisionTrend = 'downward'; signals.push('盈利预期持续下修'); }
  else revisionTrend = 'stable';

  // 修正动量
  const revisionMomentum = hist.length >= 3
    ? (hist[hist.length - 1].epsEstimate - hist[hist.length - 3].epsEstimate) / Math.abs(hist[hist.length - 3].epsEstimate || 1)
    : epsRevisionRatio;

  // 分析师共识
  const total = cur.buyRatings + cur.holdRatings + cur.sellRatings;
  let analystConsensus: EarningsRevisionResult['analystConsensus'];
  if (total > 0) {
    const buyRatio = cur.buyRatings / total;
    if (buyRatio > 0.7) analystConsensus = 'strong_buy';
    else if (buyRatio > 0.5) analystConsensus = 'buy';
    else if (buyRatio > 0.3) analystConsensus = 'hold';
    else if (buyRatio > 0.15) analystConsensus = 'sell';
    else analystConsensus = 'strong_sell';
  } else {
    analystConsensus = 'hold';
  }

  // 覆盖变化
  const prevAnalystCount = hist[hist.length - 1].analystCount;
  let coverageChange: EarningsRevisionResult['coverageChange'];
  if (cur.analystCount > prevAnalystCount + 2) { coverageChange = 'increasing'; signals.push('分析师关注度提升'); }
  else if (cur.analystCount < prevAnalystCount - 2) { coverageChange = 'decreasing'; }
  else coverageChange = 'stable';

  // 盈利惊喜
  let earningsSurprise: number | null = null;
  if (data.actualEps !== undefined) {
    earningsSurprise = prevEps !== 0 ? (data.actualEps - prevEps) / Math.abs(prevEps) : 0;
    if (earningsSurprise > 0.05) signals.push('盈利超预期');
    else if (earningsSurprise < -0.05) signals.push('盈利低于预期');
  }

  // 评分
  let score = 50;
  if (epsRevisionRatio > 0.05) score += 20;
  else if (epsRevisionRatio > 0) score += 10;
  else if (epsRevisionRatio < -0.05) score -= 20;
  else if (epsRevisionRatio < 0) score -= 10;
  if (revisionTrend === 'upward') score += 15;
  else if (revisionTrend === 'downward') score -= 15;
  if (analystConsensus === 'strong_buy') score += 15;
  else if (analystConsensus === 'buy') score += 8;
  else if (analystConsensus === 'sell') score -= 10;
  else if (analystConsensus === 'strong_sell') score -= 20;
  score = Math.max(0, Math.min(100, score));

  const confidence = Math.min(1, cur.analystCount / 10);

  return {
    symbol: data.symbol,
    epsRevisionRatio: Math.round(epsRevisionRatio * 10000) / 10000,
    revenueRevisionRatio: Math.round(revenueRevisionRatio * 10000) / 10000,
    revisionTrend,
    revisionMomentum: Math.round(revisionMomentum * 10000) / 10000,
    analystConsensus,
    coverageChange,
    earningsSurprise,
    revisionScore: score,
    confidence: Math.round(confidence * 100) / 100,
    signals,
  };
}
