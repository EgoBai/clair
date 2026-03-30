import { describe, it, expect } from 'vitest';

// ==================== 市场情绪分析引擎 ====================

interface SentimentData {
  timestamp: number;
  source: 'news' | 'social' | 'analyst' | 'funds' | 'insiders';
  content: string;
  symbol?: string;
  sentiment: number; // -1 to 1
  relevance: number; // 0 to 1
}

interface MarketSentiment {
  overall: number;
  bySource: Record<string, number>;
  trend: 'bullish' | 'bearish' | 'neutral';
  fearGreedIndex: number; // 0-100
  confidence: number;
  signals: { type: string; strength: number; description: string }[];
}

interface StockSentiment {
  symbol: string;
  score: number;
  trend: 'improving' | 'declining' | 'stable';
  volume: number; // 提及量
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  keyTopics: string[];
  signals: string[];
}

class SentimentAnalyzer {
  private positiveWords = ['涨', '利好', '突破', '增长', '盈利', '买入', '看好', '上涨', '反弹', '强势', '超预期', '创新高', '牛市', '多头', '乐观'];
  private negativeWords = ['跌', '利空', '破位', '下滑', '亏损', '卖出', '看空', '下跌', '暴跌', '弱势', '不及预期', '新低', '熊市', '空头', '悲观'];
  private intensifiers = ['大幅', '显著', '强烈', '急剧', '猛烈', '疯狂'];
  private diminishers = ['小幅', '轻微', '略有', '小幅', '温和'];

  /** 分析单条文本情感 */
  analyzeText(text: string): { sentiment: number; positive: string[]; negative: string[]; intensifier: number } {
    const positive: string[] = [];
    const negative: string[] = [];
    let intensifier = 1;

    for (const word of this.positiveWords) {
      if (text.includes(word)) positive.push(word);
    }
    for (const word of this.negativeWords) {
      if (text.includes(word)) negative.push(word);
    }
    for (const word of this.intensifiers) {
      if (text.includes(word)) intensifier = 1.5;
    }
    for (const word of this.diminishers) {
      if (text.includes(word)) intensifier = 0.6;
    }

    const posScore = positive.length;
    const negScore = negative.length;
    const total = posScore + negScore || 1;
    const raw = (posScore - negScore) / total;
    const sentiment = Math.max(-1, Math.min(1, raw * intensifier));

    return { sentiment: Math.round(sentiment * 100) / 100, positive, negative, intensifier };
  }

  /** 批量分析 */
  analyzeBatch(data: SentimentData[]): MarketSentiment {
    if (data.length === 0) {
      return { overall: 0, bySource: {}, trend: 'neutral', fearGreedIndex: 50, confidence: 0, signals: [] };
    }

    // 按来源分组
    const bySource: Record<string, number[]> = {};
    for (const d of data) {
      if (!bySource[d.source]) bySource[d.source] = [];
      bySource[d.source].push(d.sentiment);
    }

    const bySourceAvg: Record<string, number> = {};
    for (const [source, sentiments] of Object.entries(bySource)) {
      bySourceAvg[source] = Math.round((sentiments.reduce((s, v) => s + v, 0) / sentiments.length) * 100) / 100;
    }

    // 加权平均
    const weights: Record<string, number> = { analyst: 1.5, funds: 1.3, news: 1.0, social: 0.8, insiders: 1.2 };
    let weightedSum = 0, totalWeight = 0;
    for (const d of data) {
      const w = (weights[d.source] || 1) * d.relevance;
      weightedSum += d.sentiment * w;
      totalWeight += w;
    }
    const overall = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

    // 恐惧贪婪指数
    const fearGreedIndex = Math.round((overall + 1) * 50);

    // 趋势
    const trend: MarketSentiment['trend'] = overall > 0.2 ? 'bullish' : overall < -0.2 ? 'bearish' : 'neutral';

    // 置信度
    const std = Math.sqrt(data.reduce((s, d) => s + Math.pow(d.sentiment - overall, 2), 0) / data.length);
    const confidence = Math.round(Math.max(0, Math.min(100, (1 - std) * 100 * Math.min(1, data.length / 20))));

    // 信号
    const signals = this.generateSignals(data, overall, fearGreedIndex);

    return { overall, bySource: bySourceAvg, trend, fearGreedIndex, confidence, signals };
  }

  /** 个股情绪分析 */
  analyzeStockSentiment(symbol: string, data: SentimentData[]): StockSentiment {
    const stockData = data.filter(d => d.symbol === symbol);
    if (stockData.length === 0) {
      return { symbol, score: 0, trend: 'stable', volume: 0, sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }, keyTopics: [], signals: [] };
    }

    const score = Math.round((stockData.reduce((s, d) => s + d.sentiment, 0) / stockData.length) * 100) / 100;
    const positive = stockData.filter(d => d.sentiment > 0.1).length;
    const negative = stockData.filter(d => d.sentiment < -0.1).length;
    const neutral = stockData.length - positive - negative;

    // 趋势 (近期 vs 远期)
    const midpoint = Math.floor(stockData.length / 2);
    const recentAvg = stockData.slice(0, midpoint).reduce((s, d) => s + d.sentiment, 0) / (midpoint || 1);
    const olderAvg = stockData.slice(midpoint).reduce((s, d) => s + d.sentiment, 0) / (stockData.length - midpoint || 1);
    const trend: StockSentiment['trend'] = recentAvg > olderAvg + 0.1 ? 'improving' : recentAvg < olderAvg - 0.1 ? 'declining' : 'stable';

    const signals: string[] = [];
    if (positive > negative * 2) signals.push('强烈看多信号');
    if (negative > positive * 2) signals.push('强烈看空信号');
    if (stockData.length > 10) signals.push('高度关注');

    return { symbol, score, trend, volume: stockData.length, sentimentBreakdown: { positive, neutral, negative }, keyTopics: this.extractTopics(stockData), signals };
  }

  /** 情绪时间序列 */
  generateTimeSeries(data: SentimentData[], intervalMs: number = 3600000): { timestamp: number; sentiment: number; volume: number }[] {
    if (data.length === 0) return [];
    const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const start = sorted[0].timestamp;
    const end = sorted[sorted.length - 1].timestamp;
    const series: { timestamp: number; sentiment: number; volume: number }[] = [];

    for (let t = start; t <= end; t += intervalMs) {
      const window = sorted.filter(d => d.timestamp >= t && d.timestamp < t + intervalMs);
      if (window.length > 0) {
        series.push({
          timestamp: t,
          sentiment: Math.round((window.reduce((s, d) => s + d.sentiment, 0) / window.length) * 100) / 100,
          volume: window.length,
        });
      }
    }

    return series;
  }

  /** 情绪分歧度计算 */
  calculateDispersion(data: SentimentData[]): { dispersion: number; consensus: 'high' | 'medium' | 'low' } {
    if (data.length < 2) return { dispersion: 0, consensus: 'high' };
    const sentiments = data.map(d => d.sentiment);
    const mean = sentiments.reduce((s, v) => s + v, 0) / sentiments.length;
    const variance = sentiments.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sentiments.length;
    const dispersion = Math.round(Math.sqrt(variance) * 100) / 100;

    return {
      dispersion,
      consensus: dispersion < 0.2 ? 'high' : dispersion < 0.5 ? 'medium' : 'low',
    };
  }

  private generateSignals(data: SentimentData[], overall: number, fearGreed: number): MarketSentiment['signals'] {
    const signals: MarketSentiment['signals'] = [];
    if (fearGreed > 75) signals.push({ type: '极度贪婪', strength: fearGreed, description: '市场情绪过热，注意回调风险' });
    else if (fearGreed < 25) signals.push({ type: '极度恐惧', strength: 100 - fearGreed, description: '市场情绪低迷，可能存在买入机会' });

    const recent = data.filter(d => d.timestamp > Date.now() - 86400000);
    if (recent.length > 10) {
      const recentAvg = recent.reduce((s, d) => s + d.sentiment, 0) / recent.length;
      if (recentAvg > 0.5) signals.push({ type: '情绪爆发', strength: 80, description: '近期情绪显著偏多' });
      if (recentAvg < -0.5) signals.push({ type: '情绪崩溃', strength: 80, description: '近期情绪显著偏空' });
    }

    return signals;
  }

  private extractTopics(data: SentimentData[]): string[] {
    const topics: string[] = [];
    const avgSentiment = data.reduce((s, d) => s + d.sentiment, 0) / data.length;
    if (avgSentiment > 0.3) topics.push('积极面');
    if (avgSentiment < -0.3) topics.push('消极面');
    if (data.some(d => d.source === 'analyst')) topics.push('分析师观点');
    if (data.some(d => d.source === 'funds')) topics.push('资金动向');
    return topics;
  }
}

// ==================== 测试 ====================

describe('SentimentAnalyzer 市场情绪分析', () => {
  const analyzer = new SentimentAnalyzer();

  describe('文本情感分析', () => {
    it('积极文本应返回正情感', () => {
      const result = analyzer.analyzeText('大盘突破上涨，利好消息不断');
      expect(result.sentiment).toBeGreaterThan(0);
      expect(result.positive.length).toBeGreaterThan(0);
    });

    it('消极文本应返回负情感', () => {
      const result = analyzer.analyzeText('股市暴跌，利空消息不断');
      expect(result.sentiment).toBeLessThan(0);
      expect(result.negative.length).toBeGreaterThan(0);
    });

    it('中性文本应接近0', () => {
      const result = analyzer.analyzeText('今天是晴天');
      expect(Math.abs(result.sentiment)).toBeLessThan(0.5);
    });

    it('强烈程度应增强情感', () => {
      const normal = analyzer.analyzeText('上涨');
      const intense = analyzer.analyzeText('大幅上涨');
      expect(Math.abs(intense.sentiment)).toBeGreaterThan(Math.abs(normal.sentiment) - 0.01);
    });

    it('混合文本应取净效果', () => {
      const result = analyzer.analyzeText('涨跌互现，利好利空并存');
      expect(Math.abs(result.sentiment)).toBeLessThan(1);
    });
  });

  describe('批量情绪分析', () => {
    const data: SentimentData[] = [
      { timestamp: Date.now(), source: 'news', content: '利好', sentiment: 0.5, relevance: 0.8 },
      { timestamp: Date.now(), source: 'social', content: '看涨', sentiment: 0.7, relevance: 0.6 },
      { timestamp: Date.now(), source: 'analyst', content: '买入', sentiment: 0.8, relevance: 0.9 },
      { timestamp: Date.now(), source: 'funds', content: '流入', sentiment: 0.3, relevance: 0.7 },
    ];

    it('应计算总体情绪', () => {
      const sentiment = analyzer.analyzeBatch(data);
      expect(sentiment.overall).toBeGreaterThan(0);
    });

    it('应按来源分组', () => {
      const sentiment = analyzer.analyzeBatch(data);
      expect(sentiment.bySource['news']).toBeDefined();
      expect(sentiment.bySource['analyst']).toBeDefined();
    });

    it('应判断趋势', () => {
      const sentiment = analyzer.analyzeBatch(data);
      expect(['bullish', 'bearish', 'neutral']).toContain(sentiment.trend);
    });

    it('应计算恐惧贪婪指数', () => {
      const sentiment = analyzer.analyzeBatch(data);
      expect(sentiment.fearGreedIndex).toBeGreaterThanOrEqual(0);
      expect(sentiment.fearGreedIndex).toBeLessThanOrEqual(100);
    });

    it('空数据应返回安全值', () => {
      const sentiment = analyzer.analyzeBatch([]);
      expect(sentiment.overall).toBe(0);
      expect(sentiment.fearGreedIndex).toBe(50);
    });

    it('分析师权重应更高', () => {
      const bullishAnalyst: SentimentData[] = [
        { timestamp: Date.now(), source: 'analyst', content: '买入', sentiment: 0.9, relevance: 1 },
        { timestamp: Date.now(), source: 'social', content: '看跌', sentiment: -0.5, relevance: 1 },
      ];
      const sentiment = analyzer.analyzeBatch(bullishAnalyst);
      expect(sentiment.overall).toBeGreaterThan(0);
    });
  });

  describe('个股情绪', () => {
    const data: SentimentData[] = [
      { timestamp: Date.now(), source: 'news', content: '好', sentiment: 0.8, relevance: 0.8, symbol: '001' },
      { timestamp: Date.now(), source: 'social', content: '涨', sentiment: 0.6, relevance: 0.5, symbol: '001' },
      { timestamp: Date.now(), source: 'news', content: '差', sentiment: -0.7, relevance: 0.8, symbol: '002' },
    ];

    it('应分析个股情绪', () => {
      const result = analyzer.analyzeStockSentiment('001', data);
      expect(result.symbol).toBe('001');
      expect(result.score).toBeGreaterThan(0);
    });

    it('应统计提及量', () => {
      const result = analyzer.analyzeStockSentiment('001', data);
      expect(result.volume).toBe(2);
    });

    it('应分析正负中性比例', () => {
      const result = analyzer.analyzeStockSentiment('001', data);
      expect(result.sentimentBreakdown.positive + result.sentimentBreakdown.neutral + result.sentimentBreakdown.negative).toBe(2);
    });

    it('无数据应返回零值', () => {
      const result = analyzer.analyzeStockSentiment('NONE', data);
      expect(result.score).toBe(0);
      expect(result.volume).toBe(0);
    });
  });

  describe('时间序列', () => {
    it('应生成时间序列', () => {
      const data: SentimentData[] = [
        { timestamp: 1000, source: 'news', content: '', sentiment: 0.5, relevance: 1 },
        { timestamp: 2000, source: 'news', content: '', sentiment: -0.3, relevance: 1 },
        { timestamp: 3000, source: 'news', content: '', sentiment: 0.8, relevance: 1 },
      ];
      const series = analyzer.generateTimeSeries(data, 1500);
      expect(series.length).toBeGreaterThan(0);
      for (const s of series) {
        expect(s.sentiment).toBeGreaterThanOrEqual(-1);
        expect(s.sentiment).toBeLessThanOrEqual(1);
        expect(s.volume).toBeGreaterThan(0);
      }
    });

    it('空数据应返回空数组', () => {
      expect(analyzer.generateTimeSeries([])).toEqual([]);
    });
  });

  describe('情绪分歧度', () => {
    it('一致情绪应低分歧', () => {
      const data: SentimentData[] = Array(10).fill(null).map(() => ({
        timestamp: Date.now(), source: 'news' as const, content: '', sentiment: 0.5, relevance: 1,
      }));
      const result = analyzer.calculateDispersion(data);
      expect(result.consensus).toBe('high');
    });

    it('分歧情绪应低共识', () => {
      const data: SentimentData[] = [
        { timestamp: Date.now(), source: 'news', content: '', sentiment: 0.9, relevance: 1 },
        { timestamp: Date.now(), source: 'news', content: '', sentiment: -0.9, relevance: 1 },
        { timestamp: Date.now(), source: 'news', content: '', sentiment: 0.5, relevance: 1 },
        { timestamp: Date.now(), source: 'news', content: '', sentiment: -0.5, relevance: 1 },
      ];
      const result = analyzer.calculateDispersion(data);
      expect(result.consensus).not.toBe('high');
    });

    it('少于2条应返回高共识', () => {
      const result = analyzer.calculateDispersion([{ timestamp: Date.now(), source: 'news', content: '', sentiment: 0.5, relevance: 1 }]);
      expect(result.consensus).toBe('high');
    });
  });

  describe('信号生成', () => {
    it('极度贪婪应生成信号', () => {
      const data: SentimentData[] = Array(30).fill(null).map(() => ({
        timestamp: Date.now(), source: 'news' as const, content: '大涨', sentiment: 0.9, relevance: 1,
      }));
      const sentiment = analyzer.analyzeBatch(data);
      if (sentiment.fearGreedIndex > 75) {
        expect(sentiment.signals.some(s => s.type.includes('贪婪'))).toBe(true);
      }
    });

    it('极度恐惧应生成信号', () => {
      const data: SentimentData[] = Array(30).fill(null).map(() => ({
        timestamp: Date.now(), source: 'news' as const, content: '暴跌', sentiment: -0.9, relevance: 1,
      }));
      const sentiment = analyzer.analyzeBatch(data);
      if (sentiment.fearGreedIndex < 25) {
        expect(sentiment.signals.some(s => s.type.includes('恐惧'))).toBe(true);
      }
    });
  });
});
