/**
 * Alternative Data & Sentiment Analysis Engine
 * 另类数据分析与情绪引擎 - 新闻情绪、社交媒体、卫星数据等
 */

export interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  compound: number; // -1 to 1
  confidence: number;
}

export interface NewsArticle {
  title: string;
  content: string;
  source: string;
  timestamp: number;
  symbols?: string[];
  category?: string;
}

export interface SocialMention {
  platform: 'weibo' | 'xueqiu' | 'eastmoney' | 'twitter' | 'reddit';
  content: string;
  author: string;
  timestamp: number;
  likes: number;
  shares: number;
  symbols?: string[];
}

export interface SentimentTrend {
  timestamp: number;
  sentiment: number;
  volume: number;
  movingAverage: number;
}

export interface AnomalySignal {
  type: 'spike' | 'drop' | 'divergence' | 'clustering';
  timestamp: number;
  metric: string;
  value: number;
  expectedValue: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface DataQualityMetrics {
  completeness: number;
  timeliness: number;
  accuracy: number;
  consistency: number;
  overallScore: number;
  issues: string[];
}

// Chinese financial sentiment lexicon
const POSITIVE_WORDS = new Set([
  '涨', '涨了', '上涨', '大涨', '涨停', '突破', '利好', '看好', '强势',
  '创新高', '反弹', '翻红', '领涨', '爆发', '牛市', '拉升', '走强',
  '增持', '回购', '分红', '业绩增长', '超预期', '增长', '盈利', '利好',
  '加仓', '买入', '推荐', '增持', '目标价上调', '买入评级',
  'positive', 'bullish', 'surge', 'rally', 'gain', 'up', 'growth',
  'beat', 'outperform', 'upgrade', 'buy', 'strong', 'breakout',
]);

const NEGATIVE_WORDS = new Set([
  '跌', '跌了', '下跌', '大跌', '跌停', '破位', '利空', '看空', '弱势',
  '创新低', '回落', '翻绿', '领跌', '暴跌', '熊市', '跳水', '走弱',
  '减持', '质押', '暴雷', '亏损', '不及预期', '下滑', '亏损', '风险',
  '减仓', '卖出', '回避', '减持', '目标价下调', '卖出评级',
  'negative', 'bearish', 'crash', 'drop', 'down', 'decline',
  'miss', 'underperform', 'downgrade', 'sell', 'weak', 'breakdown',
]);

const INTENSIFIERS = new Set([
  '非常', '特别', '极其', '十分', '大幅', '明显', '显著', '强烈',
  'very', 'extremely', 'significantly', 'strongly', 'dramatically',
]);

const NEGATORS = new Set([
  '不', '没', '无', '非', '未', '不是', '没有', '不会',
  'not', 'no', 'never', 'neither',
]);

export function analyzeSentiment(text: string): SentimentScore {
  const words = tokenize(text);
  let positiveScore = 0;
  let negativeScore = 0;
  let hasNegator = false;

  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();

    if (NEGATORS.has(word)) {
      hasNegator = true;
      continue;
    }

    const isIntensifier = INTENSIFIERS.has(word);
    const multiplier = isIntensifier ? 1.5 : 1;

    if (POSITIVE_WORDS.has(word)) {
      if (hasNegator) {
        negativeScore += multiplier;
        hasNegator = false;
      } else {
        positiveScore += multiplier;
      }
    } else if (NEGATIVE_WORDS.has(word)) {
      if (hasNegator) {
        positiveScore += multiplier;
        hasNegator = false;
      } else {
        negativeScore += multiplier;
      }
    } else {
      hasNegator = false;
    }
  }

  const total = positiveScore + negativeScore;
  const positive = total > 0 ? positiveScore / total : 0.33;
  const negative = total > 0 ? negativeScore / total : 0.33;
  const neutral = 1 - positive - negative;
  const compound = total > 0 ? (positiveScore - negativeScore) / total : 0;
  const confidence = Math.min(1, total / 5);

  return { positive, negative, neutral: Math.max(0, neutral), compound, confidence };
}

function tokenize(text: string): string[] {
  // Simple tokenization for Chinese and English
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z\s]/g, ' ');
  const tokens: string[] = [];
  let current = '';

  for (const char of cleaned) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      if (current.trim()) tokens.push(current.trim());
      tokens.push(char);
      current = '';
    } else if (/\s/.test(char)) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  return tokens;
}

export function analyzeNewsArticles(articles: NewsArticle[]): {
  overallSentiment: SentimentScore;
  bySource: Record<string, SentimentScore>;
  byCategory: Record<string, SentimentScore>;
  bySymbol: Record<string, SentimentScore>;
  trends: SentimentTrend[];
} {
  const bySource: Record<string, { scores: SentimentScore[] }> = {};
  const byCategory: Record<string, { scores: SentimentScore[] }> = {};
  const bySymbol: Record<string, { scores: SentimentScore[] }> = {};
  const allScores: SentimentScore[] = [];

  for (const article of articles) {
    const sentiment = analyzeSentiment(article.title + ' ' + article.content);
    allScores.push(sentiment);

    if (!bySource[article.source]) bySource[article.source] = { scores: [] };
    bySource[article.source].scores.push(sentiment);

    if (article.category) {
      if (!byCategory[article.category]) byCategory[article.category] = { scores: [] };
      byCategory[article.category].scores.push(sentiment);
    }

    for (const symbol of article.symbols ?? []) {
      if (!bySymbol[symbol]) bySymbol[symbol] = { scores: [] };
      bySymbol[symbol].scores.push(sentiment);
    }
  }

  return {
    overallSentiment: aggregateSentiments(allScores),
    bySource: Object.fromEntries(
      Object.entries(bySource).map(([k, v]) => [k, aggregateSentiments(v.scores)])
    ),
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, aggregateSentiments(v.scores)])
    ),
    bySymbol: Object.fromEntries(
      Object.entries(bySymbol).map(([k, v]) => [k, aggregateSentiments(v.scores)])
    ),
    trends: calculateSentimentTrends(articles.map(a => ({
      timestamp: a.timestamp,
      sentiment: analyzeSentiment(a.title + ' ' + a.content).compound,
    }))),
  };
}

export function analyzeSocialMentions(mentions: SocialMention[]): {
  overallSentiment: SentimentScore;
  byPlatform: Record<string, SentimentScore>;
  bySymbol: Record<string, { sentiment: SentimentScore; volume: number; engagement: number }>;
  influencerMentions: { author: string; sentiment: number; engagement: number }[];
} {
  const byPlatform: Record<string, SentimentScore[]> = {};
  const bySymbol: Record<string, { scores: SentimentScore[]; volume: number; engagement: number }> = {};
  const allScores: SentimentScore[] = [];

  for (const mention of mentions) {
    const sentiment = analyzeSentiment(mention.content);
    allScores.push(sentiment);

    if (!byPlatform[mention.platform]) byPlatform[mention.platform] = [];
    byPlatform[mention.platform].push(sentiment);

    const engagement = mention.likes + mention.shares * 2;
    for (const symbol of mention.symbols ?? []) {
      if (!bySymbol[symbol]) bySymbol[symbol] = { scores: [], volume: 0, engagement: 0 };
      bySymbol[symbol].scores.push(sentiment);
      bySymbol[symbol].volume++;
      bySymbol[symbol].engagement += engagement;
    }
  }

  const influencerMentions = mentions
    .map(m => ({
      author: m.author,
      sentiment: analyzeSentiment(m.content).compound,
      engagement: m.likes + m.shares * 2,
    }))
    .filter(m => m.engagement > 100)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 10);

  return {
    overallSentiment: aggregateSentiments(allScores),
    byPlatform: Object.fromEntries(
      Object.entries(byPlatform).map(([k, v]) => [k, aggregateSentiments(v)])
    ),
    bySymbol: Object.fromEntries(
      Object.entries(bySymbol).map(([k, v]) => [
        k,
        { sentiment: aggregateSentiments(v.scores), volume: v.volume, engagement: v.engagement },
      ])
    ),
    influencerMentions,
  };
}

function aggregateSentiments(scores: SentimentScore[]): SentimentScore {
  if (scores.length === 0) {
    return { positive: 0, negative: 0, neutral: 1, compound: 0, confidence: 0 };
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    positive: avg(scores.map(s => s.positive)),
    negative: avg(scores.map(s => s.negative)),
    neutral: avg(scores.map(s => s.neutral)),
    compound: avg(scores.map(s => s.compound)),
    confidence: avg(scores.map(s => s.confidence)),
  };
}

export function calculateSentimentTrends(
  data: { timestamp: number; sentiment: number }[],
  windowSize: number = 10
): SentimentTrend[] {
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
  const trends: SentimentTrend[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const window = sorted.slice(windowStart, i + 1);
    const ma = window.reduce((s, d) => s + d.sentiment, 0) / window.length;

    trends.push({
      timestamp: sorted[i].timestamp,
      sentiment: sorted[i].sentiment,
      volume: 1,
      movingAverage: ma,
    });
  }

  return trends;
}

export function detectSentimentAnomalies(
  trends: SentimentTrend[],
  threshold: number = 2
): AnomalySignal[] {
  const signals: AnomalySignal[] = [];
  if (trends.length < 10) return signals;

  const sentiments = trends.map(t => t.sentiment);
  const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  const std = Math.sqrt(
    sentiments.reduce((s, v) => s + (v - mean) ** 2, 0) / sentiments.length
  );

  for (const trend of trends) {
    const zScore = std > 0 ? (trend.sentiment - mean) / std : 0;

    if (Math.abs(zScore) > threshold) {
      signals.push({
        type: Math.abs(zScore) > threshold * 2 ? 'spike' : 'drop',
        timestamp: trend.timestamp,
        metric: 'sentiment',
        value: trend.sentiment,
        expectedValue: mean,
        deviation: zScore,
        severity: Math.abs(zScore) > threshold * 2 ? 'high' : 'medium',
      });
    }
  }

  return signals;
}

export function detectSentimentVolumeDivergence(
  trends: SentimentTrend[],
  window: number = 5
): { timestamp: number; type: 'bullish' | 'bearish'; strength: number }[] {
  const divergences: { timestamp: number; type: 'bullish' | 'bearish'; strength: number }[] = [];

  for (let i = window; i < trends.length; i++) {
    const sentimentWindow = trends.slice(i - window, i);
    const volumeWindow = trends.slice(i - window, i);

    const sentimentTrend = trends[i].sentiment - sentimentWindow[0].sentiment;
    const volumeTrend = trends[i].volume - volumeWindow[0].volume;

    // Divergence: sentiment and volume moving in opposite directions
    if (sentimentTrend > 0 && volumeTrend < 0) {
      divergences.push({
        timestamp: trends[i].timestamp,
        type: 'bearish',
        strength: Math.abs(sentimentTrend) * Math.abs(volumeTrend),
      });
    } else if (sentimentTrend < 0 && volumeTrend > 0) {
      divergences.push({
        timestamp: trends[i].timestamp,
        type: 'bullish',
        strength: Math.abs(sentimentTrend) * Math.abs(volumeTrend),
      });
    }
  }

  return divergences;
}

export function calculateDataQuality(
  data: Record<string, unknown>[],
  requiredFields: string[]
): DataQualityMetrics {
  const issues: string[] = [];
  let completeness = 0;
  let consistency = 0;

  if (data.length === 0) {
    return { completeness: 0, timeliness: 0, accuracy: 0, consistency: 0, overallScore: 0, issues: ['No data'] };
  }

  // Completeness: percentage of records with all required fields
  let completeRecords = 0;
  for (const record of data) {
    const hasAll = requiredFields.every(field => record[field] !== undefined && record[field] !== null);
    if (hasAll) completeRecords++;
    else issues.push(`Missing fields in record`);
  }
  completeness = completeRecords / data.length;

  // Consistency: check for type consistency
  let consistentRecords = 0;
  for (const _record of data) {
    let isConsistent = true;
    for (const field of requiredFields) {
      const values = data.map(r => typeof r[field]);
      if (new Set(values).size > 1) {
        isConsistent = false;
        issues.push(`Type inconsistency in field: ${field}`);
        break;
      }
    }
    if (isConsistent) consistentRecords++;
  }
  consistency = consistentRecords / data.length;

  const timeliness = 1; // Simplified
  const accuracy = (completeness + consistency) / 2;
  const overallScore = (completeness + timeliness + accuracy + consistency) / 4;

  return {
    completeness,
    timeliness,
    accuracy,
    consistency,
    overallScore,
    issues: [...new Set(issues)],
  };
}

export function calculateNewsImpactScore(
  article: NewsArticle,
  historicalVolatility: number = 0.02
): number {
  const sentiment = analyzeSentiment(article.title + ' ' + article.content);
  const urgencyKeywords = ['突发', '紧急', '重磅', '公告', 'breaking', 'urgent'];
  const hasUrgency = urgencyKeywords.some(kw =>
    (article.title + article.content).toLowerCase().includes(kw)
  );

  let impact = Math.abs(sentiment.compound) * sentiment.confidence;
  if (hasUrgency) impact *= 1.5;
  impact *= (1 + historicalVolatility);

  return Math.min(1, impact);
}
