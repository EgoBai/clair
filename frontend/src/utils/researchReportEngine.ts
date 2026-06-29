/**
 * 研报分析引擎
 * 券商研报解析、评级变化追踪、目标价一致性分析、研报情绪评分
 */

export interface ResearchReport {
  id: string;
  ticker: string;
  broker: string;
  analyst: string;
  date: string;
  type: 'initial' | 'update' | 'event' | 'industry' | 'strategy';
  rating: 'buy' | 'overweight' | 'hold' | 'underweight' | 'sell' | 'none';
  prevRating?: 'buy' | 'overweight' | 'hold' | 'underweight' | 'sell' | 'none';
  targetPrice: number;
  prevTargetPrice?: number;
  currentPrice: number;
  title: string;
  summary: string;
  keyPoints: string[];
}

export interface RatingChange {
  ticker: string;
  broker: string;
  date: string;
  from: string;
  to: string;
  direction: 'upgrade' | 'downgrade' | 'maintain';
  priceAtChange: number;
  targetPrice: number;
  upside: number;
}

export interface ConsensusAnalysis {
  ticker: string;
  totalReports: number;
  buyCount: number;
  holdCount: number;
  sellCount: number;
  buyRatio: number;
  avgTargetPrice: number;
  medianTargetPrice: number;
  currentPrice: number;
  avgUpside: number;
  priceRange: { low: number; high: number };
  consensusStrength: 'strong' | 'moderate' | 'weak' | 'divided';
  recentTrend: 'improving' | 'stable' | 'deteriorating';
  topBrokers: { broker: string; rating: string; target: number }[];
}

export interface AnalystTrackRecord {
  analyst: string;
  broker: string;
  totalReports: number;
  accuracy: number; // 目标价达成率
  avgReturn: number; // 平均收益
  avgDaysToTarget: number;
  specializations: string[];
  bestCalls: { ticker: string; return: number; days: number }[];
  worstCalls: { ticker: string; return: number; days: number }[];
}

export interface ReportSentiment {
  reportId: string;
  sentiment: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  score: number; // -1 to 1
  bullishKeywords: string[];
  bearishKeywords: string[];
  confidence: number;
}

const BULLISH_KEYWORDS = [
  '超预期', '增长', '放量', '突破', '看好', '推荐', '买入', '增持',
  '高增长', '业绩改善', '拐点', '催化剂', '低估', '安全边际',
  '需求旺盛', '提价', '扩产', '新产品', '政策利好', '份额提升',
];

const BEARISH_KEYWORDS = [
  '低于预期', '下滑', '萎缩', '风险', '减持', '卖出', '回避',
  '高估', '泡沫', '竞争加剧', '成本上升', '政策收紧', '需求疲软',
  '产能过剩', '库存高', '减值', '亏损', '诉讼', '监管风险',
];

/**
 * 评级转数字
 */
export function ratingToNumber(rating: ResearchReport['rating']): number {
  const map: Record<string, number> = {
    buy: 5, overweight: 4, hold: 3, underweight: 2, sell: 1, none: 0,
  };
  return map[rating] ?? 0;
}

/**
 * 追踪评级变化
 */
export function trackRatingChanges(reports: ResearchReport[]): RatingChange[] {
  const changes: RatingChange[] = [];
  const byBrokerTicker = new Map<string, ResearchReport[]>();

  reports.forEach(r => {
    const key = `${r.broker}:${r.ticker}`;
    const list = byBrokerTicker.get(key) ?? [];
    list.push(r);
    byBrokerTicker.set(key, list);
  });

  byBrokerTicker.forEach((reportList) => {
    const sorted = [...reportList].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (let i = 1; i < sorted.length; i++) {
      const _prev = sorted[i - 1];
      const curr = sorted[i];

      if (curr.prevRating && curr.prevRating !== curr.rating) {
        const fromNum = ratingToNumber(curr.prevRating as ResearchReport['rating']);
        const toNum = ratingToNumber(curr.rating);

        let direction: RatingChange['direction'];
        if (toNum > fromNum) direction = 'upgrade';
        else if (toNum < fromNum) direction = 'downgrade';
        else direction = 'maintain';

        changes.push({
          ticker: curr.ticker,
          broker: curr.broker,
          date: curr.date,
          from: curr.prevRating,
          to: curr.rating,
          direction,
          priceAtChange: curr.currentPrice,
          targetPrice: curr.targetPrice,
          upside: curr.targetPrice > 0
            ? (curr.targetPrice - curr.currentPrice) / curr.currentPrice
            : 0,
        });
      }
    }
  });

  return changes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * 共识分析
 */
export function analyzeConsensus(reports: ResearchReport[]): ConsensusAnalysis | null {
  if (reports.length === 0) return null;

  const ticker = reports[0].ticker;
  const withRating = reports.filter(r => r.rating !== 'none');
  const withTarget = reports.filter(r => r.targetPrice > 0);

  const buyCount = withRating.filter(r =>
    r.rating === 'buy' || r.rating === 'overweight'
  ).length;
  const holdCount = withRating.filter(r => r.rating === 'hold').length;
  const sellCount = withRating.filter(r =>
    r.rating === 'sell' || r.rating === 'underweight'
  ).length;

  const total = withRating.length || 1;
  const buyRatio = buyCount / total;

  const targets = withTarget.map(r => r.targetPrice).sort((a, b) => a - b);
  const avgTarget = targets.length > 0
    ? targets.reduce((s, v) => s + v, 0) / targets.length
    : 0;
  const medianTarget = targets.length > 0
    ? targets[Math.floor(targets.length / 2)]
    : 0;

  const currentPrice = reports[0].currentPrice;
  const avgUpside = avgTarget > 0 ? (avgTarget - currentPrice) / currentPrice : 0;

  let consensusStrength: ConsensusAnalysis['consensusStrength'];
  if (buyRatio > 0.8 && reports.length >= 3) consensusStrength = 'strong';
  else if (buyRatio > 0.6) consensusStrength = 'moderate';
  else if (buyRatio > 0.4) consensusStrength = 'weak';
  else consensusStrength = 'divided';

  // Recent trend: compare last 30 days vs prior 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

  const recent = reports.filter(r => new Date(r.date) >= thirtyDaysAgo);
  const prior = reports.filter(r => {
    const d = new Date(r.date);
    return d >= sixtyDaysAgo && d < thirtyDaysAgo;
  });

  const recentAvg = recent.length > 0
    ? recent.reduce((s, r) => s + ratingToNumber(r.rating), 0) / recent.length
    : 3;
  const priorAvg = prior.length > 0
    ? prior.reduce((s, r) => s + ratingToNumber(r.rating), 0) / prior.length
    : 3;

  let recentTrend: ConsensusAnalysis['recentTrend'];
  if (recentAvg > priorAvg + 0.3) recentTrend = 'improving';
  else if (recentAvg < priorAvg - 0.3) recentTrend = 'deteriorating';
  else recentTrend = 'stable';

  // Top brokers
  const byBroker = new Map<string, ResearchReport>();
  reports.forEach(r => {
    const existing = byBroker.get(r.broker);
    if (!existing || new Date(r.date) > new Date(existing.date)) {
      byBroker.set(r.broker, r);
    }
  });

  const topBrokers = Array.from(byBroker.entries())
    .map(([broker, r]) => ({ broker, rating: r.rating, target: r.targetPrice }))
    .sort((a, b) => b.target - a.target)
    .slice(0, 5);

  return {
    ticker,
    totalReports: reports.length,
    buyCount,
    holdCount,
    sellCount,
    buyRatio,
    avgTargetPrice: avgTarget,
    medianTargetPrice: medianTarget,
    currentPrice,
    avgUpside,
    priceRange: {
      low: targets.length > 0 ? targets[0] : 0,
      high: targets.length > 0 ? targets[targets.length - 1] : 0,
    },
    consensusStrength,
    recentTrend,
    topBrokers,
  };
}

/**
 * 研报情感分析
 */
export function analyzeReportSentiment(report: ResearchReport): ReportSentiment {
  const text = `${report.title} ${report.summary} ${report.keyPoints.join(' ')}`.toLowerCase();

  const bullishFound = BULLISH_KEYWORDS.filter(kw => text.includes(kw));
  const bearishFound = BEARISH_KEYWORDS.filter(kw => text.includes(kw));

  const bullishScore = bullishFound.length;
  const bearishScore = bearishFound.length;
  const total = bullishScore + bearishScore || 1;

  const rawScore = (bullishScore - bearishScore) / total;

  // Factor in rating
  const ratingBoost = ratingToNumber(report.rating) > 3 ? 0.2
    : ratingToNumber(report.rating) < 3 ? -0.2 : 0;

  const score = Math.max(-1, Math.min(1, rawScore + ratingBoost));

  let sentiment: ReportSentiment['sentiment'];
  if (score > 0.5) sentiment = 'very_positive';
  else if (score > 0.15) sentiment = 'positive';
  else if (score > -0.15) sentiment = 'neutral';
  else if (score > -0.5) sentiment = 'negative';
  else sentiment = 'very_negative';

  const confidence = Math.min(1, total / 5);

  return {
    reportId: report.id,
    sentiment,
    score,
    bullishKeywords: bullishFound,
    bearishKeywords: bearishFound,
    confidence,
  };
}

/**
 * 找出分歧最大的股票
 */
export function findMostDivided(
  consensusByTicker: ConsensusAnalysis[]
): ConsensusAnalysis[] {
  return consensusByTicker
    .filter(c => c.consensusStrength === 'divided' || c.sellCount > 0)
    .sort((a, b) => {
      // 分歧 = 有买有卖
      const aDiv = Math.min(a.buyCount, a.sellCount);
      const bDiv = Math.min(b.buyCount, b.sellCount);
      return bDiv - aDiv;
    });
}
