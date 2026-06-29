/**
 * 券商研报分析引擎
 * 分析研报评级、目标价、分析师一致预期
 */

export interface ResearchReport {
  stockCode: string;
  stockName: string;
  brokerName: string;
  analystName: string;
  rating: 'buy' | 'overweight' | 'hold' | 'underweight' | 'sell';
  previousRating: string;
  targetPrice: number;
  currentPrice: number;
  publishDate: string;
  industry: string;
}

export interface ConsensusView {
  stockCode: string;
  avgTargetPrice: number;
  medianTargetPrice: number;
  upsidePotential: number; // %
  buyCount: number;
  holdCount: number;
  sellCount: number;
  consensusRating: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  ratingChanges: { upgrades: number; downgrades: number };
  coverageDepth: number; // 覆盖分析师数
  priceDispersion: number; // 目标价离散度
}

export interface AnalystAccuracy {
  analystName: string;
  brokerName: string;
  totalReports: number;
  avgError: number; // 平均目标价偏差 %
  hitRate: number; // 目标价达成率 %
  bias: 'optimistic' | 'neutral' | 'pessimistic';
  score: number; // 0-100
}

export class ResearchReportEngine {
  /**
   * 计算一致预期
   */
  calculateConsensus(reports: ResearchReport[]): ConsensusView {
    if (reports.length === 0) {
      return {
        stockCode: '',
        avgTargetPrice: 0,
        medianTargetPrice: 0,
        upsidePotential: 0,
        buyCount: 0,
        holdCount: 0,
        sellCount: 0,
        consensusRating: 'hold',
        ratingChanges: { upgrades: 0, downgrades: 0 },
        coverageDepth: 0,
        priceDispersion: 0
      };
    }

    const stockCode = reports[0].stockCode;
    const currentPrice = reports[0].currentPrice;

    // 目标价统计
    const targets = reports.map(r => r.targetPrice).filter(t => t > 0).sort((a, b) => a - b);
    const avgTargetPrice = targets.length > 0 
      ? targets.reduce((a, b) => a + b, 0) / targets.length : 0;
    const medianTargetPrice = targets.length > 0 
      ? targets[Math.floor(targets.length / 2)] : 0;

    const upsidePotential = currentPrice > 0 
      ? ((avgTargetPrice - currentPrice) / currentPrice) * 100 : 0;

    // 评级统计
    const ratingMap: Record<string, number> = { buy: 2, overweight: 1, hold: 0, underweight: -1, sell: -2 };
    const buyCount = reports.filter(r => ['buy', 'overweight'].includes(r.rating)).length;
    const holdCount = reports.filter(r => r.rating === 'hold').length;
    const sellCount = reports.filter(r => ['underweight', 'sell'].includes(r.rating)).length;

    // 一致评级
    const avgRating = reports.reduce((s, r) => s + (ratingMap[r.rating] || 0), 0) / reports.length;
    let consensusRating: ConsensusView['consensusRating'] = 'hold';
    if (avgRating > 1.5) consensusRating = 'strong_buy';
    else if (avgRating > 0.5) consensusRating = 'buy';
    else if (avgRating < -1.5) consensusRating = 'strong_sell';
    else if (avgRating < -0.5) consensusRating = 'sell';

    // 评级变动
    let upgrades = 0, downgrades = 0;
    for (const r of reports) {
      const prev = ratingMap[r.previousRating] || 0;
      const curr = ratingMap[r.rating] || 0;
      if (curr > prev) upgrades++;
      else if (curr < prev) downgrades++;
    }

    // 离散度
    const mean = avgTargetPrice;
    const variance = targets.length > 1 
      ? targets.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / targets.length 
      : 0;
    const priceDispersion = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;

    return {
      stockCode,
      avgTargetPrice,
      medianTargetPrice,
      upsidePotential,
      buyCount,
      holdCount,
      sellCount,
      consensusRating,
      ratingChanges: { upgrades, downgrades },
      coverageDepth: reports.length,
      priceDispersion
    };
  }

  /**
   * 分析师准确性评估
   */
  evaluateAnalystAccuracy(
    analystName: string,
    brokerName: string,
    reports: { targetPrice: number; actualPrice: number; publishDate: string }[]
  ): AnalystAccuracy {
    const totalReports = reports.length;
    if (totalReports === 0) {
      return { analystName, brokerName, totalReports: 0, avgError: 0, hitRate: 0, bias: 'neutral', score: 50 };
    }

    const errors = reports.map(r => 
      r.actualPrice > 0 ? ((r.targetPrice - r.actualPrice) / r.actualPrice) * 100 : 0
    );
    const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

    // 目标价达成（在±10%范围内）
    const hits = reports.filter(r => {
      const error = r.actualPrice > 0 ? Math.abs((r.targetPrice - r.actualPrice) / r.actualPrice) : 1;
      return error <= 0.1;
    }).length;
    const hitRate = (hits / totalReports) * 100;

    let bias: AnalystAccuracy['bias'] = 'neutral';
    if (avgError > 10) bias = 'optimistic';
    else if (avgError < -10) bias = 'pessimistic';

    const score = Math.max(0, Math.min(100, 50 + hitRate / 2 - Math.abs(avgError) / 2));

    return { analystName, brokerName, totalReports, avgError, hitRate, bias, score };
  }

  /**
   * 研报情绪指数
   */
  calculateSentimentIndex(
    reports: ResearchReport[],
    _windowDays: number = 30
  ): {
    date: string;
    sentimentScore: number; // -100到100
    momentum: number;
    breadth: number;
    signal: 'bullish' | 'neutral' | 'bearish';
  }[] {
    const sorted = [...reports].sort((a, b) => a.publishDate.localeCompare(b.publishDate));
    const dateMap = new Map<string, ResearchReport[]>();

    for (const r of sorted) {
      const existing = dateMap.get(r.publishDate) || [];
      existing.push(r);
      dateMap.set(r.publishDate, existing);
    }

    const ratingScores: Record<string, number> = { buy: 100, overweight: 50, hold: 0, underweight: -50, sell: -100 };

    return Array.from(dateMap.entries()).map(([date, dayReports]) => {
      const scores = dayReports.map(r => ratingScores[r.rating] || 0);
      const sentimentScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      
      const buyLike = dayReports.filter(r => ['buy', 'overweight'].includes(r.rating)).length;
      const breadth = buyLike / dayReports.length;

      let signal: 'bullish' | 'neutral' | 'bearish' = 'neutral';
      if (sentimentScore > 30) signal = 'bullish';
      else if (sentimentScore < -30) signal = 'bearish';

      return { date, sentimentScore, momentum: 0, breadth, signal };
    });
  }

  /**
   * 评级变动事件分析
   */
  analyzeRatingChanges(
    reports: ResearchReport[]
  ): {
    stockCode: string;
    changes: {
      broker: string;
      from: string;
      to: string;
      date: string;
      impact: 'positive' | 'negative' | 'neutral';
    }[];
    netImpact: number;
  }[] {
    const ratingOrder: Record<string, number> = { buy: 3, overweight: 2, hold: 1, underweight: 0, sell: -1 };
    const stockMap = new Map<string, ResearchReport[]>();

    for (const r of reports) {
      const existing = stockMap.get(r.stockCode) || [];
      existing.push(r);
      stockMap.set(r.stockCode, existing);
    }

    return Array.from(stockMap.entries()).map(([stockCode, stockReports]) => {
      const changes = stockReports
        .filter(r => r.rating !== r.previousRating && r.previousRating !== '')
        .map(r => {
          const fromScore = ratingOrder[r.previousRating] || 0;
          const toScore = ratingOrder[r.rating] || 0;
          const diff = toScore - fromScore;
          return {
            broker: r.brokerName,
            from: r.previousRating,
            to: r.rating,
            date: r.publishDate,
            impact: diff > 0 ? 'positive' as const : diff < 0 ? 'negative' as const : 'neutral' as const
          };
        });

      const netImpact = changes.reduce((s, c) => 
        s + (c.impact === 'positive' ? 1 : c.impact === 'negative' ? -1 : 0), 0);

      return { stockCode, changes, netImpact };
    });
  }
}
