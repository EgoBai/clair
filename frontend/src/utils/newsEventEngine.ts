/**
 * 新闻事件驱动分析引擎
 * 新闻分类/事件影响评估/情绪分析/事件驱动策略/异动溯源
 */

// ── 类型定义 ──

export type NewsCategory =
  | 'policy'           // 政策
  | 'earnings'         // 财报
  | 'ma'               // 并购重组
  | 'product'          // 产品/技术
  | 'governance'       // 公司治理
  | 'industry'         // 行业动态
  | 'macro'            // 宏观经济
  | 'regulatory'       // 监管
  | 'legal'            // 法律诉讼
  | 'personnel';       // 人事变动

export type SentimentLevel = 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';

export interface NewsEvent {
  id: string;
  title: string;
  content: string;
  publishTime: string;
  source: string;
  relatedStocks: string[];
  category?: NewsCategory;
}

export interface NewsClassification {
  newsId: string;
  category: NewsCategory;
  subCategory: string;
  relevance: number;       // 与A股相关度 0-1
  impactScope: 'stock' | 'sector' | 'market';
  keywords: string[];
}

export interface EventImpactAssessment {
  newsId: string;
  sentiment: SentimentLevel;
  sentimentScore: number;  // -1 to 1
  impactMagnitude: number; // 影响幅度 0-1
  impactDuration: 'ultra_short' | 'short' | 'medium' | 'long';
  expectedPriceMove: number;
  affectedSectors: string[];
  reasoning: string;
  historicalComparisons: { event: string; outcome: string; return: number }[];
}

export interface EventDrivenSignal {
  newsId: string;
  stockCode: string;
  signal: 'buy' | 'sell' | 'watch' | 'ignore';
  urgency: 'immediate' | 'today' | 'this_week' | 'monitor';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  expectedReturn: number;
  riskReward: number;
  holdingPeriod: string;
  reasoning: string;
}

export interface AnomalyTrace {
  stockCode: string;
  anomalyTime: string;
  priceMove: number;
  volumeSpike: number;
  likelyCauses: { newsId: string; title: string; confidence: number }[];
  isConfirmed: boolean;
}

export interface NewsHeatmap {
  category: NewsCategory;
  count: number;
  avgSentiment: number;
  topKeywords: string[];
  affectedStocks: string[];
  heatScore: number;       // 0-100
}

// ── 新闻分类 ──

const CATEGORY_KEYWORDS: Record<NewsCategory, string[]> = {
  policy: ['政策', '国务院', '发改委', '央行', '降准', '降息', '财政', '货币政策', '产业政策'],
  earnings: ['业绩', '财报', '营收', '净利润', '增长', '下滑', '超预期', '预告', '年报', '季报'],
  ma: ['收购', '并购', '重组', '合并', '资产注入', '借壳', '分拆', '要约'],
  product: ['产品', '技术', '研发', '专利', '突破', '创新', '发布', '量产'],
  governance: ['治理', '内控', '违规', '处罚', '信披', '质押', '减持', '增持', '回购'],
  industry: ['行业', '产业', '景气', '供需', '价格', '产能', '库存'],
  macro: ['GDP', 'CPI', 'PMI', '经济', '通胀', '通缩', '就业', '贸易', '进出口'],
  regulatory: ['证监会', '交易所', '监管', '立案', '调查', '处罚', '规范', '退市'],
  legal: ['诉讼', '仲裁', '官司', '索赔', '侵权', '合同纠纷'],
  personnel: ['董事长', '总经理', '辞职', '任命', '高管', '人事', '换届'],
};

const SENTIMENT_WORDS = {
  positive: ['增长', '突破', '创新', '超预期', '利好', '看好', '强', '高增长', '扭亏', '大增', '增持', '回购'],
  negative: ['下滑', '亏损', '暴雷', '违规', '处罚', '减持', '诉讼', '风险', '警示', '暴跌', '暴跌', '退市', '立案'],
};

export function classifyNews(news: NewsEvent): NewsClassification {
  const text = `${news.title} ${news.content}`.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[category] = keywords.filter(kw => text.includes(kw)).length;
  }

  const bestCategory = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
  const category = (bestCategory[1] > 0 ? bestCategory[0] : 'industry') as NewsCategory;

  const matchedKeywords = CATEGORY_KEYWORDS[category].filter(kw => text.includes(kw));
  const relevance = news.relatedStocks.length > 0 ? 0.8 : 0.3;
  const impactScope = news.relatedStocks.length > 3 ? 'sector'
    : news.relatedStocks.length > 0 ? 'stock' : 'market';

  return {
    newsId: news.id,
    category,
    subCategory: category,
    relevance,
    impactScope,
    keywords: matchedKeywords.slice(0, 5),
  };
}

// ── 情绪分析 ──

export function analyzeSentiment(news: NewsEvent): { sentiment: SentimentLevel; score: number } {
  const text = `${news.title} ${news.content}`;

  const positiveCount = SENTIMENT_WORDS.positive.filter(w => text.includes(w)).length;
  const negativeCount = SENTIMENT_WORDS.negative.filter(w => text.includes(w)).length;

  const score = (positiveCount - negativeCount) / Math.max(positiveCount + negativeCount, 1);

  let sentiment: SentimentLevel;
  if (score > 0.5) sentiment = 'very_positive';
  else if (score > 0.1) sentiment = 'positive';
  else if (score > -0.1) sentiment = 'neutral';
  else if (score > -0.5) sentiment = 'negative';
  else sentiment = 'very_negative';

  return { sentiment, score: roundTo(score, 2) };
}

// ── 事件影响评估 ──

export function assessEventImpact(
  news: NewsEvent,
  classification: NewsClassification,
  _currentPrice: number
): EventImpactAssessment {
  const { sentiment, score } = analyzeSentiment(news);

  // 影响幅度
  let impactMagnitude = 0.3;
  if (classification.category === 'policy') impactMagnitude = 0.7;
  if (classification.category === 'ma') impactMagnitude = 0.8;
  if (classification.category === 'earnings') impactMagnitude = 0.6;
  if (classification.category === 'regulatory') impactMagnitude = 0.65;
  if (classification.impactScope === 'market') impactMagnitude *= 1.2;

  // 影响持续时间
  let impactDuration: EventImpactAssessment['impactDuration'];
  if (classification.category === 'policy' || classification.category === 'macro') impactDuration = 'long';
  else if (classification.category === 'earnings') impactDuration = 'medium';
  else if (classification.category === 'ma') impactDuration = 'medium';
  else impactDuration = 'short';

  const expectedPriceMove = score * impactMagnitude * 0.05;

  // 受影响行业
  const affectedSectors: string[] = [];
  if (classification.category === 'policy') affectedSectors.push('全行业');
  if (classification.category === 'earnings' && news.relatedStocks.length > 0) affectedSectors.push('个股及同行业');

  const reasoning = `事件类型:${classification.category} 情绪:${sentiment} 影响度:${impactMagnitude.toFixed(2)}`;

  // 历史对比
  const historicalComparisons = [
    { event: `类似${classification.category}事件`, outcome: score > 0 ? '上涨' : '下跌', return: expectedPriceMove },
  ];

  return {
    newsId: news.id,
    sentiment,
    sentimentScore: score,
    impactMagnitude: roundTo(impactMagnitude, 2),
    impactDuration,
    expectedPriceMove: roundTo(expectedPriceMove, 4),
    affectedSectors,
    reasoning,
    historicalComparisons,
  };
}

// ── 事件驱动信号 ──

export function generateEventSignals(
  news: NewsEvent,
  impact: EventImpactAssessment,
  currentPrice: number
): EventDrivenSignal[] {
  const signals: EventDrivenSignal[] = [];

  for (const stockCode of news.relatedStocks) {
    let signal: EventDrivenSignal['signal'];
    let urgency: EventDrivenSignal['urgency'];

    if (impact.sentimentScore > 0.3 && impact.impactMagnitude > 0.5) {
      signal = 'buy';
      urgency = 'immediate';
    } else if (impact.sentimentScore > 0.1) {
      signal = 'buy';
      urgency = 'today';
    } else if (impact.sentimentScore < -0.3 && impact.impactMagnitude > 0.5) {
      signal = 'sell';
      urgency = 'immediate';
    } else if (impact.sentimentScore < -0.1) {
      signal = 'sell';
      urgency = 'today';
    } else {
      signal = 'watch';
      urgency = 'monitor';
    }

    const targetMove = impact.expectedPriceMove;
    const targetPrice = roundTo(currentPrice * (1 + targetMove), 2);
    const stopLoss = roundTo(currentPrice * (1 - Math.abs(targetMove) * 1.5), 2);
    const expectedReturn = Math.abs(targetMove);
    const riskReward = Math.abs(targetMove) / (Math.abs(targetMove) * 1.5);

    signals.push({
      newsId: news.id,
      stockCode,
      signal,
      urgency,
      entryPrice: currentPrice,
      targetPrice,
      stopLoss,
      expectedReturn: roundTo(expectedReturn, 4),
      riskReward: roundTo(riskReward, 2),
      holdingPeriod: impact.impactDuration === 'long' ? '1-4周' : impact.impactDuration === 'medium' ? '3-10天' : '1-3天',
      reasoning: `${impact.reasoning} | 目标涨幅${(targetMove * 100).toFixed(1)}%`,
    });
  }

  return signals;
}

// ── 异动溯源 ──

export function traceAnomaly(
  stockCode: string,
  anomalyTime: string,
  priceMove: number,
  volumeSpike: number,
  recentNews: NewsEvent[]
): AnomalyTrace {
  const likelyCauses = recentNews
    .filter(n => n.relatedStocks.includes(stockCode) || n.relatedStocks.length === 0)
    .map(n => {
      const classification = classifyNews(n);
      const relevance = classification.relevance;
      const timeRelevance = 1; // 简化处理
      const confidence = relevance * timeRelevance * 0.8;
      return { newsId: n.id, title: n.title, confidence: roundTo(confidence, 2) };
    })
    .filter(c => c.confidence > 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return {
    stockCode,
    anomalyTime,
    priceMove: roundTo(priceMove, 4),
    volumeSpike: roundTo(volumeSpike, 2),
    likelyCauses,
    isConfirmed: likelyCauses.length > 0 && likelyCauses[0].confidence > 0.6,
  };
}

// ── 新闻热度分析 ──

export function analyzeNewsHeat(newsItems: NewsEvent[]): NewsHeatmap[] {
  const categoryMap = new Map<NewsCategory, NewsEvent[]>();

  for (const news of newsItems) {
    const classification = classifyNews(news);
    if (!categoryMap.has(classification.category)) {
      categoryMap.set(classification.category, []);
    }
    categoryMap.get(classification.category)!.push(news);
  }

  const heatmaps: NewsHeatmap[] = [];
  for (const [category, items] of categoryMap) {
    const sentiments = items.map(n => analyzeSentiment(n).score);
    const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;

    const allStocks = new Set<string>();
    items.forEach(n => n.relatedStocks.forEach(s => allStocks.add(s)));

    const allText = items.map(n => n.title).join(' ');
    const topKeywords = Object.values(CATEGORY_KEYWORDS[category])
      .filter(kw => allText.includes(kw))
      .slice(0, 5);

    const heatScore = Math.min(100, items.length * 10 + Math.abs(avgSentiment) * 20);

    heatmaps.push({
      category,
      count: items.length,
      avgSentiment: roundTo(avgSentiment, 2),
      topKeywords,
      affectedStocks: [...allStocks].slice(0, 10),
      heatScore: roundTo(heatScore, 1),
    });
  }

  return heatmaps.sort((a, b) => b.heatScore - a.heatScore);
}

// ── 综合分析 ──

export function runNewsAnalysis(news: NewsEvent[], currentPrices: Record<string, number>) {
  const classifications = news.map(n => classifyNews(n));
  const impacts = news.map((n, i) => assessEventImpact(n, classifications[i], currentPrices[n.relatedStocks[0]] || 10));
  const allSignals = news.flatMap((n, i) =>
    generateEventSignals(n, impacts[i], currentPrices[n.relatedStocks[0]] || 10)
  );
  const heatmaps = analyzeNewsHeat(news);

  const buySignals = allSignals.filter(s => s.signal === 'buy').sort((a, b) => b.expectedReturn - a.expectedReturn);
  const sellSignals = allSignals.filter(s => s.signal === 'sell');

  return {
    classifications,
    impacts,
    signals: allSignals,
    heatmaps,
    summary: {
      totalNews: news.length,
      buyOpportunities: buySignals.length,
      sellWarnings: sellSignals.length,
      topBuy: buySignals[0] || null,
      topSell: sellSignals[0] || null,
      hottestCategory: heatmaps[0]?.category || null,
    },
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
