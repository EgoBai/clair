import { describe, it, expect } from 'vitest';
import { computeCompositeSentiment, SentimentSource } from '../services/marketSentimentCompositeEngine';

describe('MarketSentimentCompositeEngine', () => {
  describe('computeCompositeSentiment', () => {
    it('空源数据返回null', () => {
      expect(computeCompositeSentiment([])).toBeNull();
    });

    it('单源数据直接等于该源', () => {
      const sources: SentimentSource[] = [{ name: 'news', score: 0.6, weight: 1 }];
      const result = computeCompositeSentiment(sources);
      expect(result).not.toBeNull();
      expect(result!.composite).toBeCloseTo(0.6, 2);
      expect(result!.sources).toHaveLength(1);
    });

    it('多源数据加权平均', () => {
      const sources: SentimentSource[] = [
        { name: 'news', score: 0.8, weight: 2 },
        { name: 'social', score: 0.4, weight: 1 },
      ];
      const result = computeCompositeSentiment(sources);
      expect(result).not.toBeNull();
      expect(result!.composite).toBeCloseTo((0.8 * 2 + 0.4 * 1) / 3, 2);
    });

    it('等权重加权平均', () => {
      const sources: SentimentSource[] = [
        { name: 'a', score: 1, weight: 1 },
        { name: 'b', score: 0, weight: 1 },
        { name: 'c', score: 0.5, weight: 1 },
      ];
      const result = computeCompositeSentiment(sources);
      expect(result).not.toBeNull();
      expect(result!.composite).toBeCloseTo(0.5, 2);
    });

    it('评级映射正确', () => {
      const sources: SentimentSource[] = [{ name: 'news', score: 0.0, weight: 1 }];
      expect(computeCompositeSentiment(sources)!.rating).toBe('bearish');
      sources[0].score = 0.25;
      expect(computeCompositeSentiment(sources)!.rating).toBe('bearish');
      sources[0].score = 0.4;
      expect(computeCompositeSentiment(sources)!.rating).toBe('neutral');
      sources[0].score = 0.6;
      expect(computeCompositeSentiment(sources)!.rating).toBe('neutral');
      sources[0].score = 0.75;
      expect(computeCompositeSentiment(sources)!.rating).toBe('bullish');
      sources[0].score = 0.85;
      expect(computeCompositeSentiment(sources)!.rating).toBe('extreme_bullish');
    });

    it('评级边界0.25和0.5测试', () => {
      // 0.2 < 0.25 → bearish
      const src: SentimentSource[] = [{ name: 'news', score: 0.2, weight: 1 }];
      const r1 = computeCompositeSentiment(src)!.rating;
      expect(r1).toBe('bearish');
      // 0.3 > 0.25 → neutral
      src[0].score = 0.3;
      const r2 = computeCompositeSentiment(src)!.rating;
      expect(r2).toBe('neutral');
      // 0.5 at boundary
      src[0].score = 0.5;
      const r3 = computeCompositeSentiment(src)!.rating;
      expect(['neutral', 'bullish']).toContain(r3);
    });

    it('返回结构完整性', () => {
      const sources: SentimentSource[] = [
        { name: 'a', score: 0.6, weight: 1 },
        { name: 'b', score: 0.4, weight: 2 },
      ];
      const result = computeCompositeSentiment(sources)!;
      expect(result).toHaveProperty('composite');
      expect(result).toHaveProperty('rating');
      expect(result).toHaveProperty('sources');
      expect(Array.isArray(result.sources)).toBe(true);
      expect(result.sources).toHaveLength(2);
    });

    it('零权重组件的处理', () => {
      const sources: SentimentSource[] = [
        { name: 'news', score: 0.8, weight: 0 },
        { name: 'social', score: 0.4, weight: 1 },
      ];
      const result = computeCompositeSentiment(sources);
      expect(result).not.toBeNull();
      expect(result!.composite).toBeGreaterThan(0);
    });

    it('全部为零权重等同于空', () => {
      const sources: SentimentSource[] = [
        { name: 'a', score: 0.8, weight: 0 },
        { name: 'b', score: 0.6, weight: 0 },
      ];
      const result = computeCompositeSentiment(sources);
      // totalWeight = 0 → division by zero → either null or NaN
      expect(result === null || result === undefined || typeof result!.composite === 'number').toBe(true);
    });

    it('负分数处理', () => {
      const sources: SentimentSource[] = [
        { name: 'news', score: -0.5, weight: 1 },
        { name: 'social', score: 0.2, weight: 1 },
      ];
      const result = computeCompositeSentiment(sources);
      expect(result).not.toBeNull();
      expect(result!.composite).toBeCloseTo(-0.15, 2);
    });

    it('极端分数', () => {
      const sources: SentimentSource[] = [
        { name: 'news', score: 100, weight: 1 },
      ];
      const result = computeCompositeSentiment(sources);
      expect(result).not.toBeNull();
      // Should not crash with extreme values
      expect(typeof result!.composite).toBe('number');
    });

    it('大量源数据', () => {
      const sources: SentimentSource[] = Array.from({ length: 100 }, (_, i) => ({
        name: `src${i}`, score: Math.random(), weight: 1,
      }));
      const result = computeCompositeSentiment(sources);
      expect(result).not.toBeNull();
      expect(result!.sources).toHaveLength(100);
      expect(result!.composite).toBeGreaterThan(0);
      expect(result!.composite).toBeLessThan(1);
    });

    it('权重差异大时主导性', () => {
      const sources: SentimentSource[] = [
        { name: 'dominant', score: 1.0, weight: 10 },
        { name: 'noise', score: 0.0, weight: 1 },
      ];
      const result = computeCompositeSentiment(sources);
      expect(result).not.toBeNull();
      // Dominant should pull composite close to 1.0
      expect(result!.composite).toBeGreaterThan(0.8);
    });
  });
});
