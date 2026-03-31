import { describe, it, expect } from 'vitest';
import {
  deduplicateNews,
  filterNews,
  aggregateNews,
  calculateImportance,
  analyzeSentiment,
  extractSymbols,
  analyzeNewsTrend,
  NewsItem,
} from '../utils/newsAggregationEngine';

function makeNews(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'n1',
    title: 'Test news',
    summary: 'Summary',
    source: 'media',
    category: 'general',
    sentiment: 'neutral',
    symbols: ['000001'],
    timestamp: Date.now(),
    importance: 5,
    tags: [],
    ...overrides,
  };
}

describe('deduplicateNews', () => {
  it('removes duplicates by title', () => {
    const items = [
      makeNews({ id: '1', title: '公司A发布财报', importance: 5 }),
      makeNews({ id: '2', title: '公司A发布财报', importance: 8 }),
    ];
    const result = deduplicateNews(items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2'); // higher importance
  });

  it('keeps different titles', () => {
    const items = [
      makeNews({ id: '1', title: '新闻A' }),
      makeNews({ id: '2', title: '新闻B' }),
    ];
    expect(deduplicateNews(items)).toHaveLength(2);
  });

  it('sorts by timestamp descending', () => {
    const items = [
      makeNews({ id: '1', title: 'Old', timestamp: 1000 }),
      makeNews({ id: '2', title: 'New', timestamp: 2000 }),
    ];
    const result = deduplicateNews(items);
    expect(result[0].timestamp).toBe(2000);
  });
});

describe('filterNews', () => {
  it('filters by source', () => {
    const items = [
      makeNews({ source: 'official' }),
      makeNews({ source: 'media' }),
    ];
    expect(filterNews(items, { sources: ['official'] })).toHaveLength(1);
  });

  it('filters by category', () => {
    const items = [
      makeNews({ category: 'earnings' }),
      makeNews({ category: 'general' }),
    ];
    expect(filterNews(items, { categories: ['earnings'] })).toHaveLength(1);
  });

  it('filters by sentiment', () => {
    const items = [
      makeNews({ sentiment: 'positive' }),
      makeNews({ sentiment: 'negative' }),
    ];
    expect(filterNews(items, { sentiment: 'positive' })).toHaveLength(1);
  });

  it('filters by importance', () => {
    const items = [
      makeNews({ importance: 8 }),
      makeNews({ importance: 3 }),
    ];
    expect(filterNews(items, { minImportance: 5 })).toHaveLength(1);
  });

  it('filters by time range', () => {
    const items = [
      makeNews({ timestamp: 1000 }),
      makeNews({ timestamp: 5000 }),
    ];
    expect(filterNews(items, { startTime: 2000, endTime: 6000 })).toHaveLength(1);
  });

  it('filters by symbols', () => {
    const items = [
      makeNews({ symbols: ['000001'] }),
      makeNews({ symbols: ['000002'] }),
    ];
    expect(filterNews(items, { symbols: ['000001'] })).toHaveLength(1);
  });

  it('filters by keywords', () => {
    const items = [
      makeNews({ title: '利好消息来了', summary: '' }),
      makeNews({ title: '普通新闻', summary: '' }),
    ];
    expect(filterNews(items, { keywords: ['利好'] })).toHaveLength(1);
  });
});

describe('aggregateNews', () => {
  it('counts by source, category, sentiment', () => {
    const items = [
      makeNews({ source: 'official', category: 'earnings', sentiment: 'positive' }),
      makeNews({ source: 'media', category: 'general', sentiment: 'negative' }),
      makeNews({ source: 'official', category: 'earnings', sentiment: 'positive' }),
    ];
    const agg = aggregateNews(items);
    expect(agg.total).toBe(3);
    expect(agg.bySource['official']).toBe(2);
    expect(agg.byCategory['earnings']).toBe(2);
    expect(agg.bySentiment['positive']).toBe(2);
  });

  it('computes time range', () => {
    const items = [
      makeNews({ timestamp: 1000 }),
      makeNews({ timestamp: 5000 }),
    ];
    const agg = aggregateNews(items);
    expect(agg.timeRange).toEqual({ earliest: 1000, latest: 5000 });
  });

  it('handles empty input', () => {
    const agg = aggregateNews([]);
    expect(agg.total).toBe(0);
    expect(agg.timeRange).toBeNull();
  });
});

describe('calculateImportance', () => {
  it('boosts regulatory sources', () => {
    const item = makeNews({ source: 'regulatory', importance: 5 });
    const score = calculateImportance(item);
    expect(score).toBeGreaterThan(5);
  });

  it('boosts earnings category', () => {
    const item = makeNews({ category: 'earnings', importance: 5 });
    const score = calculateImportance(item);
    expect(score).toBeGreaterThan(5);
  });

  it('caps at 10', () => {
    const item = makeNews({ source: 'regulatory', category: 'earnings', importance: 10, timestamp: Date.now() });
    const score = calculateImportance(item);
    expect(score).toBeLessThanOrEqual(10);
  });
});

describe('analyzeSentiment', () => {
  it('detects positive sentiment', () => {
    expect(analyzeSentiment('公司利润大幅增长超预期')).toBe('positive');
  });

  it('detects negative sentiment', () => {
    expect(analyzeSentiment('公司亏损暴跌面临风险')).toBe('negative');
  });

  it('returns neutral for mixed', () => {
    expect(analyzeSentiment('公司公告事项')).toBe('neutral');
  });
});

describe('extractSymbols', () => {
  it('extracts 6-digit codes', () => {
    expect(extractSymbols('000001今日涨停')).toContain('000001');
  });

  it('extracts with prefix', () => {
    expect(extractSymbols('SH600000发布公告')).toContain('SH600000');
  });

  it('returns empty for no matches', () => {
    expect(extractSymbols('无代码新闻')).toEqual([]);
  });
});

describe('analyzeNewsTrend', () => {
  it('calculates volume', () => {
    const now = Date.now();
    const items = [
      makeNews({ timestamp: now - 1000 }),
      makeNews({ timestamp: now - 2000 }),
      makeNews({ timestamp: now - 3000 }),
    ];
    const trend = analyzeNewsTrend(items);
    expect(trend.volume).toBe(3);
  });

  it('calculates sentiment ratio', () => {
    const now = Date.now();
    const items = [
      makeNews({ timestamp: now - 1000, sentiment: 'positive' }),
      makeNews({ timestamp: now - 2000, sentiment: 'positive' }),
      makeNews({ timestamp: now - 3000, sentiment: 'negative' }),
    ];
    const trend = analyzeNewsTrend(items);
    expect(trend.sentimentRatio).toBeGreaterThan(0);
  });

  it('detects top categories', () => {
    const now = Date.now();
    const items = [
      makeNews({ timestamp: now - 1000, category: 'earnings' }),
      makeNews({ timestamp: now - 2000, category: 'earnings' }),
      makeNews({ timestamp: now - 3000, category: 'general' }),
    ];
    const trend = analyzeNewsTrend(items);
    expect(trend.topCategories[0].category).toBe('earnings');
    expect(trend.topCategories[0].count).toBe(2);
  });

  it('detects burst', () => {
    const now = Date.now();
    const hourMs = 3600000;
    const items = [
      // Previous window (1-2 hours ago): 1 item
      makeNews({ timestamp: now - hourMs * 1.5 }),
      // Current window (0-1 hour ago): 5 items
      makeNews({ timestamp: now - 1000 }),
      makeNews({ timestamp: now - 2000 }),
      makeNews({ timestamp: now - 3000 }),
      makeNews({ timestamp: now - 4000 }),
      makeNews({ timestamp: now - 5000 }),
    ];
    const trend = analyzeNewsTrend(items, hourMs);
    expect(trend.burstDetected).toBe(true);
  });
});
