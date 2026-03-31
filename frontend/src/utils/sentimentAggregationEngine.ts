/**
 * 舆情聚合引擎 (Sentiment Aggregation Engine)
 * - 多源新闻聚合
 * - 情绪打分(正面/负面/中性)
 * - 热度追踪
 * - 关联股票提取
 * - 时效性衰减
 * - 突发事件检测
 */

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  source: string;
  publishTime: string;
  relatedStocks: string[];
  category: 'policy' | 'company' | 'industry' | 'macro' | 'event';
}

export interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  compound: number; // -1 to 1
  confidence: number;
}

export interface AggregatedSentiment {
  stock: string;
  sentiment: SentimentScore;
  newsCount: number;
  hotness: number;      // 0-100
  trend: 'improving' | 'stable' | 'deteriorating';
  keyTopics: string[];
  timeDecay: number;    // 综合时效性得分
}

export interface BreakingEvent {
  title: string;
  impact: 'high' | 'medium' | 'low';
  affectedStocks: string[];
  sentiment: number;
  urgency: number; // 0-100
  summary: string;
}

// 情绪关键词
const POSITIVE_WORDS = [
  '利好', '上涨', '突破', '增长', '超预期', '涨停', '创新高', '推荐',
  '买入', '增持', '业绩大增', '订单', '签约', '中标', '回购', '分红',
  '扩张', '合作', '授权', '获批', '成功', '领先', '龙头',
];

const NEGATIVE_WORDS = [
  '利空', '下跌', '跌破', '下滑', '不及预期', '跌停', '创新低', '减持',
  '卖出', '亏损', '暴雷', '处罚', '调查', '违规', '退市', '诉讼',
  '裁员', '缩减', '违约', '延期', '取消', '风险', '警告',
];

const URGENCY_WORDS = ['突发', '紧急', '重磅', '刚刚', '速递', '快讯', '公告'];

/**
 * 文本情绪分析
 */
export function analyzeTextSentiment(text: string): SentimentScore {
  let positiveScore = 0;
  let negativeScore = 0;

  for (const word of POSITIVE_WORDS) {
    if (text.includes(word)) positiveScore++;
  }
  for (const word of NEGATIVE_WORDS) {
    if (text.includes(word)) negativeScore++;
  }

  const total = positiveScore + negativeScore;
  const positive = total > 0 ? positiveScore / total : 0.5;
  const negative = total > 0 ? negativeScore / total : 0.5;
  const neutral = 1 - positive - negative;
  const compound = positive - negative;
  const confidence = Math.min(1, total / 5);

  return {
    positive: Math.round(positive * 100) / 100,
    negative: Math.round(negative * 100) / 100,
    neutral: Math.round(Math.max(0, neutral) * 100) / 100,
    compound: Math.round(compound * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * 时效性衰减权重
 */
export function timeDecayWeight(publishTime: string, currentTime: string): number {
  const pub = new Date(publishTime).getTime();
  const curr = new Date(currentTime).getTime();
  const hoursDiff = (curr - pub) / (1000 * 60 * 60);

  if (hoursDiff < 0) return 1;
  if (hoursDiff < 1) return 1;
  if (hoursDiff < 6) return 0.8;
  if (hoursDiff < 24) return 0.5;
  if (hoursDiff < 72) return 0.3;
  if (hoursDiff < 168) return 0.1;
  return 0.05;
}

/**
 * 聚合股票舆情
 */
export function aggregateStockSentiment(
  stock: string,
  news: NewsItem[],
  currentTime: string
): AggregatedSentiment {
  const stockNews = news.filter(n => n.relatedStocks.includes(stock));

  if (stockNews.length === 0) {
    return {
      stock,
      sentiment: { positive: 0, negative: 0, neutral: 1, compound: 0, confidence: 0 },
      newsCount: 0,
      hotness: 0,
      trend: 'stable',
      keyTopics: [],
      timeDecay: 0,
    };
  }

  // 加权情绪聚合
  let totalWeight = 0;
  let weightedCompound = 0;
  const sentiments: SentimentScore[] = [];

  for (const item of stockNews) {
    const weight = timeDecayWeight(item.publishTime, currentTime);
    const sentiment = analyzeTextSentiment(item.title + item.content);
    weightedCompound += sentiment.compound * weight;
    totalWeight += weight;
    sentiments.push(sentiment);
  }

  const avgCompound = totalWeight > 0 ? weightedCompound / totalWeight : 0;
  const avgPositive = sentiments.reduce((s, v) => s + v.positive, 0) / sentiments.length;
  const avgNegative = sentiments.reduce((s, v) => s + v.negative, 0) / sentiments.length;

  // 热度
  const hotness = Math.min(100, Math.round(stockNews.length * 15 + totalWeight * 10));

  // 趋势
  const half = Math.floor(stockNews.length / 2);
  const recentSentiment = stockNews.slice(-half).reduce((s, n) => {
    return s + analyzeTextSentiment(n.title + n.content).compound;
  }, 0) / Math.max(half, 1);
  const earlierSentiment = stockNews.slice(0, half).reduce((s, n) => {
    return s + analyzeTextSentiment(n.title + n.content).compound;
  }, 0) / Math.max(half, 1);

  let trend: AggregatedSentiment['trend'];
  if (recentSentiment > earlierSentiment + 0.1) trend = 'improving';
  else if (recentSentiment < earlierSentiment - 0.1) trend = 'deteriorating';
  else trend = 'stable';

  // 关键话题
  const topicMap = new Map<string, number>();
  for (const item of stockNews) {
    for (const word of [...POSITIVE_WORDS, ...NEGATIVE_WORDS]) {
      if (item.title.includes(word)) {
        topicMap.set(word, (topicMap.get(word) || 0) + 1);
      }
    }
  }
  const keyTopics = [...topicMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    stock,
    sentiment: {
      positive: Math.round(avgPositive * 100) / 100,
      negative: Math.round(avgNegative * 100) / 100,
      neutral: Math.round(Math.max(0, 1 - avgPositive - avgNegative) * 100) / 100,
      compound: Math.round(avgCompound * 100) / 100,
      confidence: Math.round(Math.min(1, sentiments.reduce((s, v) => s + v.confidence, 0) / sentiments.length) * 100) / 100,
    },
    newsCount: stockNews.length,
    hotness,
    trend,
    keyTopics,
    timeDecay: Math.round(totalWeight * 100) / 100,
  };
}

/**
 * 检测突发事件
 */
export function detectBreakingEvents(
  news: NewsItem[],
  currentTime: string
): BreakingEvent[] {
  const events: BreakingEvent[] = [];

  for (const item of news) {
    const isUrgent = URGENCY_WORDS.some(w => item.title.includes(w));
    const sentiment = analyzeTextSentiment(item.title + item.content);
    const decay = timeDecayWeight(item.publishTime, currentTime);

    if (isUrgent && decay > 0.5) {
      const urgency = Math.round(decay * 50 + Math.abs(sentiment.compound) * 30 + (item.relatedStocks.length * 5));
      const impact: BreakingEvent['impact'] = urgency > 70 ? 'high' : urgency > 40 ? 'medium' : 'low';

      events.push({
        title: item.title,
        impact,
        affectedStocks: item.relatedStocks,
        sentiment: sentiment.compound,
        urgency: Math.min(100, urgency),
        summary: item.content.slice(0, 100),
      });
    }
  }

  return events.sort((a, b) => b.urgency - a.urgency);
}

/**
 * 板块情绪对比
 */
export function compareSectorSentiments(
  sectors: { name: string; news: NewsItem[] }[],
  currentTime: string
): { name: string; sentiment: number; newsCount: number; rank: number }[] {
  const results = sectors.map(sector => {
    let totalWeight = 0;
    let weightedSentiment = 0;

    for (const item of sector.news) {
      const weight = timeDecayWeight(item.publishTime, currentTime);
      const sentiment = analyzeTextSentiment(item.title + item.content);
      weightedSentiment += sentiment.compound * weight;
      totalWeight += weight;
    }

    return {
      name: sector.name,
      sentiment: totalWeight > 0 ? Math.round(weightedSentiment / totalWeight * 100) / 100 : 0,
      newsCount: sector.news.length,
      rank: 0,
    };
  });

  results.sort((a, b) => b.sentiment - a.sentiment);
  results.forEach((r, i) => { r.rank = i + 1; });

  return results;
}
