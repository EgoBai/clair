/**
 * Social Sentiment Engine
 * 
 * 社交媒体情绪分析引擎 - 分析股吧/微博/雪球等社交媒体情绪
 */

export interface SocialPost {
  id: string;
  platform: 'guba' | 'weibo' | 'xueqiu' | 'eastmoney';
  timestamp: number;
  content: string;
  likes: number;
  comments: number;
  shares: number;
  author: string;
  sentimentScore?: number;
}

export interface SentimentResult {
  overallScore: number; // -1 to 1
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  hotTopics: string[];
  sentimentTrend: 'bullish' | 'bearish' | 'neutral';
  engagementScore: number;
  influencerSentiment: number;
  volumeSignal: 'high' | 'normal' | 'low';
}

export interface TopicSentiment {
  topic: string;
  mentions: number;
  avgSentiment: number;
  trend: 'rising' | 'stable' | 'declining';
}

// ===== Keyword-based Sentiment =====

const BULLISH_KEYWORDS = [
  '涨', '买', '抄底', '利好', '看好', '强势', '突破', '涨停',
  '牛市', '上车', '加仓', '超预期', '增长', '回购', '分红',
];

const BEARISH_KEYWORDS = [
  '跌', '卖', '割肉', '利空', '暴跌', '破位', '清仓', '跌停',
  '熊市', '跑路', '减持', '暴雷', '亏损', 'st', '退市',
];

export function analyzeTextSentiment(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const kw of BULLISH_KEYWORDS) {
    if (lower.includes(kw)) score += 1;
  }

  for (const kw of BEARISH_KEYWORDS) {
    if (lower.includes(kw)) score -= 1;
  }

  const total = BULLISH_KEYWORDS.length + BEARISH_KEYWORDS.length;
  return Math.max(-1, Math.min(1, score / (total / 4)));
}

// ===== Engagement Score =====

export function calculateEngagement(posts: SocialPost[]): number {
  if (posts.length === 0) return 0;

  const totalEngagement = posts.reduce(
    (sum, p) => sum + p.likes + p.comments * 2 + p.shares * 3,
    0
  );
  const avgEngagement = totalEngagement / posts.length;

  // Normalize to 0-100
  return Math.min(100, (avgEngagement / 100) * 100);
}

// ===== Volume Signal =====

export function volumeSignal(
  posts: SocialPost[],
  historicalAvg: number = 50
): 'high' | 'normal' | 'low' {
  const ratio = posts.length / Math.max(1, historicalAvg);
  if (ratio > 1.5) return 'high';
  if (ratio < 0.7) return 'low';
  return 'normal';
}

// ===== Hot Topics =====

export function extractHotTopics(posts: SocialPost[]): string[] {
  const wordFreq = new Map<string, number>();

  for (const post of posts) {
    const words = post.content
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  // Filter common stop words
  const stopWords = new Set(['的是', '因为', '所以', '但是', '还是', '或者', '可以']);

  return [...wordFreq.entries()]
    .filter(([word, count]) => count >= 2 && !stopWords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

// ===== Influencer Sentiment =====

export function influencerSentiment(posts: SocialPost[]): number {
  // Weight posts by author engagement
  const authorEngagement = new Map<string, number>();

  for (const post of posts) {
    const engagement = post.likes + post.comments * 2;
    authorEngagement.set(
      post.author,
      (authorEngagement.get(post.author) || 0) + engagement
    );
  }

  // Find top influencers (top 20% by engagement)
  const sorted = [...authorEngagement.entries()].sort((a, b) => b[1] - a[1]);
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.2));
  const topAuthors = new Set(sorted.slice(0, topCount).map(([a]) => a));

  const influencerPosts = posts.filter((p) => topAuthors.has(p.author));
  if (influencerPosts.length === 0) return 0;

  const avgSentiment =
    influencerPosts.reduce((sum, p) => {
      const sentiment = p.sentimentScore ?? analyzeTextSentiment(p.content);
      return sum + sentiment;
    }, 0) / influencerPosts.length;

  return Math.max(-1, Math.min(1, avgSentiment));
}

// ===== Sentiment Trend =====

export function detectSentimentTrend(
  posts: SocialPost[]
): 'bullish' | 'bearish' | 'neutral' {
  if (posts.length < 4) return 'neutral';

  const sorted = [...posts].sort((a, b) => a.timestamp - b.timestamp);
  const half = Math.floor(sorted.length / 2);

  const firstHalf = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);

  const avgFirst =
    firstHalf.reduce((sum, p) => sum + (p.sentimentScore ?? analyzeTextSentiment(p.content)), 0) /
    firstHalf.length;
  const avgSecond =
    secondHalf.reduce((sum, p) => sum + (p.sentimentScore ?? analyzeTextSentiment(p.content)), 0) /
    secondHalf.length;

  const diff = avgSecond - avgFirst;

  if (diff > 0.1) return 'bullish';
  if (diff < -0.1) return 'bearish';
  return 'neutral';
}

// ===== Full Sentiment Analysis =====

export function analyzeSocialSentiment(
  posts: SocialPost[],
  historicalAvg?: number
): SentimentResult {
  if (posts.length === 0) {
    return {
      overallScore: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      hotTopics: [],
      sentimentTrend: 'neutral',
      engagementScore: 0,
      influencerSentiment: 0,
      volumeSignal: 'low',
    };
  }

  // Score each post
  const scoredPosts = posts.map((p) => ({
    ...p,
    sentimentScore: p.sentimentScore ?? analyzeTextSentiment(p.content),
  }));

  const bullish = scoredPosts.filter((p) => p.sentimentScore > 0.1);
  const bearish = scoredPosts.filter((p) => p.sentimentScore < -0.1);
  const neutral = scoredPosts.filter(
    (p) => Math.abs(p.sentimentScore) <= 0.1
  );

  const overallScore =
    scoredPosts.reduce((sum, p) => sum + p.sentimentScore, 0) /
    scoredPosts.length;

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    bullishCount: bullish.length,
    bearishCount: bearish.length,
    neutralCount: neutral.length,
    hotTopics: extractHotTopics(posts),
    sentimentTrend: detectSentimentTrend(scoredPosts),
    engagementScore: Math.round(calculateEngagement(posts) * 100) / 100,
    influencerSentiment: Math.round(influencerSentiment(posts) * 100) / 100,
    volumeSignal: volumeSignal(posts, historicalAvg),
  };
}

// ===== Topic-level Sentiment =====

export function analyzeTopicSentiment(
  posts: SocialPost[],
  topics: string[]
): TopicSentiment[] {
  return topics.map((topic) => {
    const relatedPosts = posts.filter((p) => p.content.includes(topic));
    const avgSentiment =
      relatedPosts.length > 0
        ? relatedPosts.reduce(
            (sum, p) => sum + (p.sentimentScore ?? analyzeTextSentiment(p.content)),
            0
          ) / relatedPosts.length
        : 0;

    // Trend: compare recent vs older posts about this topic
    const sorted = [...relatedPosts].sort((a, b) => a.timestamp - b.timestamp);
    const half = Math.floor(sorted.length / 2);
    let trend: 'rising' | 'stable' | 'declining' = 'stable';

    if (sorted.length >= 4) {
      const firstAvg =
        sorted.slice(0, half).reduce((s, p) => s + analyzeTextSentiment(p.content), 0) / half;
      const secondAvg =
        sorted.slice(half).reduce((s, p) => s + analyzeTextSentiment(p.content), 0) /
        (sorted.length - half);
      if (secondAvg - firstAvg > 0.1) trend = 'rising';
      else if (secondAvg - firstAvg < -0.1) trend = 'declining';
    }

    return {
      topic,
      mentions: relatedPosts.length,
      avgSentiment: Math.round(avgSentiment * 100) / 100,
      trend,
    };
  });
}
