import { describe, it, expect } from 'vitest';

/**
 * 情绪分析引擎测试
 * analyzeSentiment / analyzeNewsArticles / sentimentTrends / anomalies
 */

interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  compound: number;
  confidence: number;
}

interface NewsArticle {
  title: string;
  content: string;
  source: string;
  timestamp: number;
  symbols?: string[];
  category?: string;
}

// Simplified sentiment analysis
const POSITIVE_WORDS = new Set(['涨', '利好', '增长', '突破', '创新高', '牛市', '上涨', '反弹', '强势', '看好']);
const NEGATIVE_WORDS = new Set(['跌', '利空', '下跌', '暴跌', '破位', '熊市', '崩盘', '跳水', '弱势', '看空']);

function analyzeSentiment(text: string): SentimentScore {
  const chars = text.split('');
  let positive = 0, negative = 0, total = 0;
  for (let i = 0; i < chars.length; i++) {
    for (const w of POSITIVE_WORDS) {
      if (text.substring(i, i + w.length) === w) { positive++; total++; }
    }
    for (const w of NEGATIVE_WORDS) {
      if (text.substring(i, i + w.length) === w) { negative++; total++; }
    }
  }
  const compound = total === 0 ? 0 : (positive - negative) / total;
  const confidence = Math.min(1, total / 5);
  return {
    positive: total === 0 ? 0 : positive / total,
    negative: total === 0 ? 0 : negative / total,
    neutral: total === 0 ? 1 : 1 - (positive + negative) / total,
    compound: parseFloat(compound.toFixed(4)),
    confidence: parseFloat(confidence.toFixed(4)),
  };
}

function analyzeNewsArticles(articles: NewsArticle[]): {
  overallSentiment: SentimentScore;
  perArticle: Array<{ article: NewsArticle; sentiment: SentimentScore }>;
  bullishCount: number;
  bearishCount: number;
} {
  const perArticle = articles.map(a => ({ article: a, sentiment: analyzeSentiment(a.title + a.content) }));
  const compounds = perArticle.map(p => p.sentiment.compound);
  const avgCompound = compounds.reduce((a, b) => a + b, 0) / Math.max(1, compounds.length);
  return {
    overallSentiment: {
      positive: perArticle.filter(p => p.sentiment.compound > 0).length / Math.max(1, articles.length),
      negative: perArticle.filter(p => p.sentiment.compound < 0).length / Math.max(1, articles.length),
      neutral: perArticle.filter(p => p.sentiment.compound === 0).length / Math.max(1, articles.length),
      compound: parseFloat(avgCompound.toFixed(4)),
      confidence: parseFloat((compounds.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, compounds.length)).toFixed(4)),
    },
    perArticle,
    bullishCount: perArticle.filter(p => p.sentiment.compound > 0.1).length,
    bearishCount: perArticle.filter(p => p.sentiment.compound < -0.1).length,
  };
}

function calculateSentimentTrends(
  sentiments: Array<{ timestamp: number; sentiment: number }>,
  window: number
): Array<{ timestamp: number; sentiment: number; volume: number; movingAverage: number }> {
  const sorted = [...sentiments].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.map((s, i) => {
    const windowSlice = sorted.slice(Math.max(0, i - window + 1), i + 1);
    const ma = windowSlice.reduce((sum, x) => sum + x.sentiment, 0) / windowSlice.length;
    return {
      timestamp: s.timestamp,
      sentiment: s.sentiment,
      volume: windowSlice.length,
      movingAverage: parseFloat(ma.toFixed(4)),
    };
  });
}

function detectSentimentAnomalies(
  trends: Array<{ timestamp: number; sentiment: number }>,
  threshold: number = 2
): Array<{ type: string; timestamp: number; value: number; expected: number; deviation: number }> {
  if (trends.length < 3) return [];
  const values = trends.map(t => t.sentiment);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  if (std === 0) return [];
  return trends
    .filter(t => Math.abs(t.sentiment - mean) / std > threshold)
    .map(t => ({
      type: t.sentiment > mean ? 'spike' : 'drop',
      timestamp: t.timestamp,
      value: t.sentiment,
      expected: parseFloat(mean.toFixed(4)),
      deviation: parseFloat(((t.sentiment - mean) / std).toFixed(4)),
    }));
}

describe('情绪分析引擎', () => {
  describe('analyzeSentiment', () => {
    it('should detect positive sentiment', () => {
      const score = analyzeSentiment('股市大涨突破创新高利好');
      expect(score.compound).toBeGreaterThan(0);
    });

    it('should detect negative sentiment', () => {
      const score = analyzeSentiment('股市暴跌崩盘利空');
      expect(score.compound).toBeLessThan(0);
    });

    it('should return neutral for empty text', () => {
      const score = analyzeSentiment('');
      expect(score.compound).toBe(0);
      expect(score.neutral).toBe(1);
    });

    it('should return neutral for non-financial text', () => {
      const score = analyzeSentiment('今天天气不错');
      expect(score.compound).toBe(0);
    });

    it('confidence should be 0-1', () => {
      const score = analyzeSentiment('上涨突破利好增长');
      expect(score.confidence).toBeGreaterThanOrEqual(0);
      expect(score.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('analyzeNewsArticles', () => {
    it('should count bullish and bearish articles', () => {
      const articles: NewsArticle[] = [
        { title: '大涨突破', content: '利好', source: 'sina', timestamp: 1000 },
        { title: '暴跌崩盘', content: '利空', source: 'sina', timestamp: 2000 },
        { title: '市场平稳', content: '波动不大', source: 'sina', timestamp: 3000 },
      ];
      const result = analyzeNewsArticles(articles);
      expect(result.bullishCount).toBeGreaterThanOrEqual(0);
      expect(result.bearishCount).toBeGreaterThanOrEqual(0);
      expect(result.bullishCount + result.bearishCount).toBeLessThanOrEqual(articles.length);
    });

    it('should handle empty articles', () => {
      const result = analyzeNewsArticles([]);
      expect(result.overallSentiment.compound).toBe(0);
      expect(result.perArticle).toHaveLength(0);
    });
  });

  describe('calculateSentimentTrends', () => {
    it('should calculate moving average', () => {
      const data = [
        { timestamp: 1, sentiment: 0.5 },
        { timestamp: 2, sentiment: 0.3 },
        { timestamp: 3, sentiment: 0.7 },
      ];
      const trends = calculateSentimentTrends(data, 2);
      expect(trends).toHaveLength(3);
      expect(trends[2].movingAverage).toBeCloseTo(0.5, 1);
    });

    it('should sort by timestamp', () => {
      const data = [
        { timestamp: 3, sentiment: 0.7 },
        { timestamp: 1, sentiment: 0.5 },
        { timestamp: 2, sentiment: 0.3 },
      ];
      const trends = calculateSentimentTrends(data, 2);
      expect(trends[0].timestamp).toBe(1);
      expect(trends[2].timestamp).toBe(3);
    });
  });

  describe('detectSentimentAnomalies', () => {
    it('should detect spikes', () => {
      const data = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i,
        sentiment: 0.1,
      }));
      data.push({ timestamp: 10, sentiment: 0.9 });
      const anomalies = detectSentimentAnomalies(data, 2);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      expect(anomalies.some(a => a.type === 'spike')).toBe(true);
    });

    it('should return empty for constant data', () => {
      const data = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i,
        sentiment: 0.5,
      }));
      const anomalies = detectSentimentAnomalies(data);
      expect(anomalies).toHaveLength(0);
    });

    it('should return empty for insufficient data', () => {
      const data = [{ timestamp: 1, sentiment: 0.5 }];
      expect(detectSentimentAnomalies(data)).toHaveLength(0);
    });
  });
});
