/**
 * News & Announcement Aggregation Engine
 *
 * 多源新闻聚合、去重、分类、优先级排序
 */

export type NewsSource = 'official' | 'media' | 'social' | 'regulatory' | 'analyst';
export type NewsCategory = 'earnings' | 'policy' | 'ma' | 'ipo' | 'dividend' | 'risk' | 'industry' | 'general';
export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: NewsSource;
  category: NewsCategory;
  sentiment: Sentiment;
  symbols: string[];
  timestamp: number;
  url?: string;
  importance: number; // 0-10
  tags: string[];
}

export interface NewsFilter {
  sources?: NewsSource[];
  categories?: NewsCategory[];
  symbols?: string[];
  sentiment?: Sentiment;
  minImportance?: number;
  startTime?: number;
  endTime?: number;
  keywords?: string[];
}

export interface AggregatedNews {
  items: NewsItem[];
  total: number;
  bySource: Record<NewsSource, number>;
  byCategory: Record<NewsCategory, number>;
  bySentiment: Record<Sentiment, number>;
  timeRange: { earliest: number; latest: number } | null;
}

/**
 * 新闻去重（基于标题相似度）
 */
export function deduplicateNews(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();

  for (const item of items) {
    const key = normalizeTitle(item.title);
    const existing = seen.get(key);

    if (!existing || item.importance > existing.importance) {
      seen.set(key, item);
    }
  }

  return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 标题标准化（用于去重）
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, '')
    .replace(/(公告|快讯|突发|独家|重磅)/g, '')
    .slice(0, 50);
}

/**
 * 过滤新闻
 */
export function filterNews(items: NewsItem[], filter: NewsFilter): NewsItem[] {
  return items.filter(item => {
    if (filter.sources && !filter.sources.includes(item.source)) return false;
    if (filter.categories && !filter.categories.includes(item.category)) return false;
    if (filter.sentiment && item.sentiment !== filter.sentiment) return false;
    if (filter.minImportance !== undefined && item.importance < filter.minImportance) return false;
    if (filter.startTime && item.timestamp < filter.startTime) return false;
    if (filter.endTime && item.timestamp > filter.endTime) return false;
    if (filter.symbols && !filter.symbols.some(s => item.symbols.includes(s))) return false;
    if (filter.keywords && !filter.keywords.some(kw =>
      item.title.includes(kw) || item.summary.includes(kw) || item.tags.includes(kw)
    )) return false;
    return true;
  });
}

/**
 * 聚合新闻
 */
export function aggregateNews(items: NewsItem[]): AggregatedNews {
  const bySource: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const bySentiment: Record<string, number> = {};

  let earliest = Infinity;
  let latest = -Infinity;

  for (const item of items) {
    bySource[item.source] = (bySource[item.source] || 0) + 1;
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    bySentiment[item.sentiment] = (bySentiment[item.sentiment] || 0) + 1;
    if (item.timestamp < earliest) earliest = item.timestamp;
    if (item.timestamp > latest) latest = item.timestamp;
  }

  return {
    items: items.sort((a, b) => b.timestamp - a.timestamp),
    total: items.length,
    bySource: bySource as Record<NewsSource, number>,
    byCategory: byCategory as Record<NewsCategory, number>,
    bySentiment: bySentiment as Record<Sentiment, number>,
    timeRange: items.length > 0 ? { earliest, latest } : null,
  };
}

/**
 * 新闻重要性评分
 */
export function calculateImportance(item: NewsItem): number {
  let score = item.importance;

  // Source weight
  const sourceWeight: Record<NewsSource, number> = {
    regulatory: 2.0,
    official: 1.5,
    media: 1.0,
    analyst: 1.2,
    social: 0.8,
  };
  score *= sourceWeight[item.source];

  // Category weight
  const categoryWeight: Record<NewsCategory, number> = {
    earnings: 1.5,
    policy: 1.3,
    ma: 1.4,
    ipo: 1.2,
    dividend: 1.1,
    risk: 1.5,
    industry: 1.0,
    general: 0.8,
  };
  score *= categoryWeight[item.category];

  // Recency boost (within 1 hour)
  const ageHours = (Date.now() - item.timestamp) / 3600000;
  if (ageHours < 1) score *= 1.3;

  return Math.min(10, Math.round(score * 10) / 10);
}

/**
 * 情感分析（简单关键词匹配）
 */
export function analyzeSentiment(text: string): Sentiment {
  const positiveWords = ['利好', '增长', '突破', '创新高', '超预期', '利润', '大幅', '强势', '涨停', '放量'];
  const negativeWords = ['利空', '下跌', '暴跌', '亏损', '低于预期', '风险', '警示', '处罚', '跌停', '减持'];

  let posCount = 0;
  let negCount = 0;

  for (const w of positiveWords) {
    if (text.includes(w)) posCount++;
  }
  for (const w of negativeWords) {
    if (text.includes(w)) negCount++;
  }

  if (posCount > negCount) return 'positive';
  if (negCount > posCount) return 'negative';
  return 'neutral';
}

/**
 * 从标题提取股票代码
 */
export function extractSymbols(text: string): string[] {
  const patterns = [
    /(?:SH|SZ|BJ)?\d{6}/gi,
    /[A-Z]{1,5}/g,
  ];

  const symbols = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        if (m.length >= 4) symbols.add(m.toUpperCase());
      }
    }
  }
  return [...symbols];
}

/**
 * 新闻趋势分析
 */
export function analyzeNewsTrend(
  items: NewsItem[],
  windowMs: number = 3600000
): {
  volume: number;
  sentimentRatio: number;
  topCategories: { category: NewsCategory; count: number }[];
  burstDetected: boolean;
} {
  const now = Date.now();
  const recent = items.filter(i => now - i.timestamp < windowMs);
  const older = items.filter(i => now - i.timestamp >= windowMs && now - i.timestamp < windowMs * 2);

  const categoryCount = new Map<NewsCategory, number>();
  let positiveCount = 0;
  let negativeCount = 0;

  for (const item of recent) {
    categoryCount.set(item.category, (categoryCount.get(item.category) || 0) + 1);
    if (item.sentiment === 'positive') positiveCount++;
    if (item.sentiment === 'negative') negativeCount++;
  }

  const total = positiveCount + negativeCount || 1;
  const sentimentRatio = (positiveCount - negativeCount) / total;

  const topCategories = [...categoryCount.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Burst detection: >2x volume compared to previous window
  const burstDetected = older.length > 0 ? recent.length > older.length * 2 : recent.length > 10;

  return {
    volume: recent.length,
    sentimentRatio,
    topCategories,
    burstDetected,
  };
}
