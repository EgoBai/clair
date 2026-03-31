import { describe, it, expect } from 'vitest';

describe('另类数据信号引擎', () => {
  // NLP Sentiment Score (simplified)
  function sentimentScore(texts: string[]) {
    const positive = ['涨', '好', '利好', '突破', '增长', '强', '超预期', 'buy', 'bullish', 'positive'];
    const negative = ['跌', '差', '利空', '破位', '下跌', '弱', '不及预期', 'sell', 'bearish', 'negative'];
    let pos = 0, neg = 0, total = 0;
    for (const text of texts) {
      const lower = text.toLowerCase();
      for (const w of positive) if (lower.includes(w)) pos++;
      for (const w of negative) if (lower.includes(w)) neg++;
      total++;
    }
    const score = total > 0 ? (pos - neg) / (pos + neg + 1) : 0;
    return { score, posCount: pos, negCount: neg, total };
  }

  // Satellite/Alternative Activity Index
  function activityIndex(values: number[], baseline: number, window = 10) {
    if (values.length < window) return [];
    return values.slice(window - 1).map((_, i) => {
      const avg = values.slice(i, i + window).reduce((a, b) => a + b, 0) / window;
      return (avg - baseline) / baseline * 100;
    });
  }

  // Social Media Buzz
  function socialBuzz(mentions: number[], baseline: number[], window = 7) {
    if (mentions.length < window || baseline.length < window) return [];
    const result: number[] = [];
    for (let i = window - 1; i < mentions.length; i++) {
      const mAvg = mentions.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0) / window;
      const bAvg = baseline[Math.min(i, baseline.length - 1)] || 1;
      result.push(mAvg / bAvg);
    }
    return result;
  }

  // Patent Filing Activity
  function patentActivity(filingDates: number[], quarterly = true) {
    if (!filingDates.length) return [];
    const period = quarterly ? 90 : 30;
    const maxDate = Math.max(...filingDates);
    const minDate = Math.min(...filingDates);
    const nPeriods = Math.ceil((maxDate - minDate) / period);
    return Array.from({ length: nPeriods }, (_, i) => {
      const start = minDate + i * period;
      const end = start + period;
      return filingDates.filter(d => d >= start && d < end).length;
    });
  }

  // Supply Chain Disruption Score
  function supplyChainDisruption(events: { severity: number; duration: number; date: number }[], window = 30) {
    if (!events.length) return [];
    const maxDate = Math.max(...events.map(e => e.date));
    const scores: number[] = [];
    for (let d = maxDate - window; d <= maxDate; d++) {
      const relevant = events.filter(e => e.date >= d - window && e.date <= d);
      const score = relevant.reduce((s, e) => s + e.severity * e.duration, 0) / (window + 1);
      scores.push(score);
    }
    return scores;
  }

  // Composite Alternative Data Signal
  function compositeSignal(signals: { value: number; weight: number }[]) {
    if (!signals.length) return { score: 0, confidence: 0 };
    const totalWeight = signals.reduce((s, sig) => s + Math.abs(sig.weight), 0);
    const weightedSum = signals.reduce((s, sig) => s + sig.value * sig.weight, 0);
    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const variance = signals.reduce((s, sig) => s + (sig.value - score) ** 2 * sig.weight, 0) / totalWeight;
    const confidence = Math.max(0, 1 - Math.sqrt(variance));
    return { score, confidence };
  }

  describe('NLP情绪分析', () => {
    it('正面文本得分为正', () => {
      const result = sentimentScore(['利好突破', '强势上涨', '超预期增长']);
      expect(result.score).toBeGreaterThan(0);
      expect(result.posCount).toBeGreaterThan(result.negCount);
    });

    it('负面文本得分为负', () => {
      const result = sentimentScore(['利空下跌', '破位下跌', '不及预期']);
      expect(result.score).toBeLessThan(0);
    });

    it('空文本得分为0', () => {
      const result = sentimentScore([]);
      expect(result.score).toBe(0);
    });

    it('混合文本', () => {
      const result = sentimentScore(['涨势好', '差走势', '涨势好']);
      expect(result.posCount).toBeGreaterThan(result.negCount);
    });
  });

  describe('活动指数', () => {
    it('计算偏差百分比', () => {
      const values = Array.from({ length: 30 }, () => 100 + Math.random() * 20);
      const result = activityIndex(values, 100, 10);
      expect(result.length).toBeGreaterThan(0);
    });

    it('数据不足返回空', () => {
      expect(activityIndex([100, 101], 100, 10)).toEqual([]);
    });
  });

  describe('社交媒体热度', () => {
    it('热度比率', () => {
      const mentions = Array.from({ length: 20 }, () => Math.random() * 100);
      const baseline = Array.from({ length: 20 }, () => 50);
      const result = socialBuzz(mentions, baseline, 5);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });

  describe('专利申请活动', () => {
    it('按季度统计', () => {
      const dates = [1, 5, 50, 90, 95, 100, 180, 200];
      const result = patentActivity(dates, true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.reduce((a, b) => a + b, 0)).toBe(dates.length);
    });
  });

  describe('供应链中断', () => {
    it('计算中断得分', () => {
      const events = [
        { severity: 3, duration: 5, date: 100 },
        { severity: 2, duration: 3, date: 95 },
      ];
      const result = supplyChainDisruption(events, 30);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });

  describe('综合另类数据信号', () => {
    it('加权平均得分', () => {
      const signals = [
        { value: 0.5, weight: 2 },
        { value: -0.3, weight: 1 },
        { value: 0.8, weight: 1 },
      ];
      const { score, confidence } = compositeSignal(signals);
      expect(score).toBeGreaterThan(0);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('空信号返回零', () => {
      const { score, confidence } = compositeSignal([]);
      expect(score).toBe(0);
      expect(confidence).toBe(0);
    });
  });
});
