/**
 * 分析师共识引擎 - 分析师评级/目标价/盈利预测/一致预期
 */

export interface AnalystRating {
  analyst: string;
  firm: string;
  date: string;
  rating: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  targetPrice: number;
  currentPrice: number;
  epsEstimate?: number;
  revenueEstimate?: number;
  notes?: string;
}

export interface ConsensusResult {
  ticker: string;
  totalAnalysts: number;
  consensus: {
    rating: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
    score: number; // 1-5
    distribution: Record<string, number>; // {strong_buy: 5, buy: 10, ...}
    avgTargetPrice: number;
    medianTargetPrice: number;
    priceUpside: number; // 上涨空间(%)
  };
  revision: {
    direction: 'up' | 'down' | 'stable';
    momentum: number; // -100 to 100
    recentUpgrades: number;
    recentDowngrades: number;
    thirtyDayChange: number;
  };
  accuracy: {
    hitRate: number; // 命中率(%)
    avgError: number; // 平均误差(%)
    bias: 'optimistic' | 'pessimistic' | 'neutral';
  };
  eps: {
    currentYear: number;
    nextYear: number;
    growth: number; // YoY(%)
    revisionTrend: 'up' | 'down' | 'stable';
    beatRate: number; // 盈利超预期率(%)
  };
}

export interface EarningsEstimate {
  year: number;
  quarter?: number;
  eps: number;
  revenue: number;
  netProfit: number;
  growth: number; // YoY%
}

export interface EarningsSurprise {
  date: string;
  actualEps: number;
  estimateEps: number;
  surprisePct: number;
  priceReaction: number; // 次日涨跌幅
}

/**
 * 计算分析师共识
 */
export function calculateConsensus(
  ticker: string,
  ratings: AnalystRating[],
  currentPrice: number,
  earningsEstimates?: EarningsEstimate[],
  earningsHistory?: EarningsSurprise[],
): ConsensusResult {
  const totalAnalysts = ratings.length;

  if (totalAnalysts === 0) {
    return {
      ticker,
      totalAnalysts: 0,
      consensus: { rating: 'hold', score: 3, distribution: {}, avgTargetPrice: currentPrice, medianTargetPrice: currentPrice, priceUpside: 0 },
      revision: { direction: 'stable', momentum: 0, recentUpgrades: 0, recentDowngrades: 0, thirtyDayChange: 0 },
      accuracy: { hitRate: 50, avgError: 0, bias: 'neutral' },
      eps: { currentYear: 0, nextYear: 0, growth: 0, revisionTrend: 'stable', beatRate: 50 },
    };
  }

  // 评级分布
  const ratingScore: Record<string, number> = { strong_buy: 5, buy: 4, hold: 3, sell: 2, strong_sell: 1 };
  const distribution: Record<string, number> = {};
  let totalScore = 0;
  ratings.forEach(r => {
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    totalScore += ratingScore[r.rating] || 3;
  });
  const avgScore = totalScore / totalAnalysts;

  // 共识评级
  let consensusRating: ConsensusResult['consensus']['rating'];
  if (avgScore >= 4.5) consensusRating = 'strong_buy';
  else if (avgScore >= 3.5) consensusRating = 'buy';
  else if (avgScore >= 2.5) consensusRating = 'hold';
  else if (avgScore >= 1.5) consensusRating = 'sell';
  else consensusRating = 'strong_sell';

  // 目标价
  const targetPrices = ratings.map(r => r.targetPrice).sort((a, b) => a - b);
  const avgTargetPrice = targetPrices.reduce((a, b) => a + b, 0) / targetPrices.length;
  const medianTargetPrice = targetPrices[Math.floor(targetPrices.length / 2)];
  const priceUpside = ((avgTargetPrice - currentPrice) / currentPrice) * 100;

  // 评级修订
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentRatings = ratings.filter(r => new Date(r.date) >= thirtyDaysAgo);

  let recentUpgrades = 0;
  let recentDowngrades = 0;
  recentRatings.forEach(r => {
    const score = ratingScore[r.rating] || 3;
    if (score >= 4) recentUpgrades++;
    else if (score <= 2) recentDowngrades++;
  });

  const momentum = ((recentUpgrades - recentDowngrades) / Math.max(1, recentRatings.length)) * 100;
  let revisionDirection: 'up' | 'down' | 'stable';
  if (momentum > 20) revisionDirection = 'up';
  else if (momentum < -20) revisionDirection = 'down';
  else revisionDirection = 'stable';

  const thirtyDayChange = recentUpgrades - recentDowngrades;

  // 分析师准确度
  let hitRate = 50;
  let avgError = 0;
  let bias: 'optimistic' | 'pessimistic' | 'neutral' = 'neutral';

  if (earningsHistory && earningsHistory.length > 0) {
    const beats = earningsHistory.filter(e => e.surprisePct > 0).length;
    hitRate = (beats / earningsHistory.length) * 100;
    avgError = earningsHistory.reduce((s, e) => s + Math.abs(e.surprisePct), 0) / earningsHistory.length;

    const avgSurprise = earningsHistory.reduce((s, e) => s + e.surprisePct, 0) / earningsHistory.length;
    if (avgSurprise > 2) bias = 'pessimistic'; // 分析师常低估
    else if (avgSurprise < -2) bias = 'optimistic'; // 分析师常高估
  }

  // EPS预测
  const currentYear = new Date().getFullYear();
  const currentYearEst = earningsEstimates?.find(e => e.year === currentYear && !e.quarter);
  const nextYearEst = earningsEstimates?.find(e => e.year === currentYear + 1 && !e.quarter);

  const currentYearEps = currentYearEst?.eps || 0;
  const nextYearEps = nextYearEst?.eps || 0;
  const epsGrowth = currentYearEps > 0 ? ((nextYearEps - currentYearEps) / currentYearEps) * 100 : 0;

  let epsRevisionTrend: 'up' | 'down' | 'stable' = 'stable';
  if (epsGrowth > 15) epsRevisionTrend = 'up';
  else if (epsGrowth < -5) epsRevisionTrend = 'down';

  const beatRate = earningsHistory && earningsHistory.length > 0
    ? (earningsHistory.filter(e => e.surprisePct > 0).length / earningsHistory.length) * 100
    : 50;

  return {
    ticker,
    totalAnalysts,
    consensus: {
      rating: consensusRating,
      score: Math.round(avgScore * 100) / 100,
      distribution,
      avgTargetPrice: Math.round(avgTargetPrice * 100) / 100,
      medianTargetPrice: Math.round(medianTargetPrice * 100) / 100,
      priceUpside: Math.round(priceUpside * 100) / 100,
    },
    revision: {
      direction: revisionDirection,
      momentum: Math.round(momentum),
      recentUpgrades,
      recentDowngrades,
      thirtyDayChange,
    },
    accuracy: {
      hitRate: Math.round(hitRate * 10) / 10,
      avgError: Math.round(avgError * 100) / 100,
      bias,
    },
    eps: {
      currentYear: currentYearEps,
      nextYear: nextYearEps,
      growth: Math.round(epsGrowth * 100) / 100,
      revisionTrend: epsRevisionTrend,
      beatRate: Math.round(beatRate * 10) / 10,
    },
  };
}

/**
 * 比较多只股票的分析师共识
 */
export function compareConsensus(
  results: ConsensusResult[],
): Array<{ ticker: string; rank: number; compositeScore: number }> {
  return results.map(r => {
    const ratingScore = { strong_buy: 100, buy: 75, hold: 50, sell: 25, strong_sell: 0 };
    const score1 = ratingScore[r.consensus.rating] || 50;
    const score2 = Math.min(100, Math.max(0, r.consensus.priceUpside + 50));
    const score3 = Math.min(100, Math.max(0, r.revision.momentum + 50));
    const score4 = r.accuracy.hitRate;

    const compositeScore = score1 * 0.3 + score2 * 0.25 + score3 * 0.25 + score4 * 0.2;

    return { ticker: r.ticker, rank: 0, compositeScore: Math.round(compositeScore * 10) / 10 };
  })
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((item, i) => ({ ...item, rank: i + 1 }));
}
