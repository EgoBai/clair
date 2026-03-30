import { describe, it, expect } from 'vitest';

describe('MarketSentimentCalculator', () => {
  interface MarketSnapshot {
    rising: number;
    falling: number;
    flat: number;
    limitUp: number;
    limitDown: number;
    totalVolume: number;
    totalAmount: number;
    newHigh: number;
    newLow: number;
    avgChangePercent: number;
    northboundFlow: number;
  }

  function calculateFearGreedIndex(snapshot: MarketSnapshot): { score: number; level: string; color: string } {
    let score = 50;
    const total = snapshot.rising + snapshot.falling + snapshot.flat;
    if (total === 0) return { score: 50, level: '中性', color: '#faad14' };
    const advRatio = snapshot.rising / total;
    score += (advRatio - 0.5) * 60;
    score += snapshot.limitUp > snapshot.limitDown ? 5 : -5;
    score += snapshot.northboundFlow > 0 ? 5 : -5;
    score += snapshot.newHigh > snapshot.newLow ? 3 : -3;
    score = Math.max(0, Math.min(100, score));
    let level: string, color: string;
    if (score <= 20) { level = '极度恐慌'; color = '#cf1322'; }
    else if (score <= 40) { level = '恐慌'; color = '#d46b08'; }
    else if (score <= 60) { level = '中性'; color = '#faad14'; }
    else if (score <= 80) { level = '贪婪'; color = '#7cb342'; }
    else { level = '极度贪婪'; color = '#3f8600'; }
    return { score, level, color };
  }

  function calculateMarketHeat(snapshot: MarketSnapshot): number {
    const total = snapshot.rising + snapshot.falling + snapshot.flat;
    if (total === 0) return 0;
    let heat = 0;
    heat += (snapshot.rising / total) * 30;
    heat += Math.min(snapshot.limitUp / total, 0.1) * 200;
    heat += Math.min(snapshot.totalAmount / 1e12, 2) * 15;
    heat += Math.max(0, snapshot.northboundFlow / 1e10) * 5;
    return Math.min(100, Math.max(0, heat));
  }

  function calculateSentimentSummary(snapshot: MarketSnapshot) {
    const total = snapshot.rising + snapshot.falling + snapshot.flat;
    const fearGreed = calculateFearGreedIndex(snapshot);
    const heat = calculateMarketHeat(snapshot);
    const breadth = total > 0 ? ((snapshot.rising - snapshot.falling) / total * 100) : 0;
    const strength = snapshot.avgChangePercent;
    return { fearGreed, heat, breadth, strength, summary: fearGreed.level };
  }

  const bullish: MarketSnapshot = { rising: 3500, falling: 500, flat: 200, limitUp: 120, limitDown: 5, totalVolume: 8e10, totalAmount: 1.2e12, newHigh: 200, newLow: 10, avgChangePercent: 2.5, northboundFlow: 8e10 };
  const bearish: MarketSnapshot = { rising: 400, falling: 3600, flat: 200, limitUp: 10, limitDown: 150, totalVolume: 9e10, totalAmount: 1.3e12, newHigh: 15, newLow: 300, avgChangePercent: -2.8, northboundFlow: -6e10 };
  const neutral: MarketSnapshot = { rising: 2100, falling: 2000, flat: 100, limitUp: 30, limitDown: 25, totalVolume: 6e10, totalAmount: 8e11, newHigh: 50, newLow: 45, avgChangePercent: 0.1, northboundFlow: 1e9 };

  it('should calculate high score for bullish market', () => {
    const result = calculateFearGreedIndex(bullish);
    expect(result.score).toBeGreaterThan(60);
    expect(['贪婪', '极度贪婪']).toContain(result.level);
  });

  it('should calculate low score for bearish market', () => {
    const result = calculateFearGreedIndex(bearish);
    expect(result.score).toBeLessThan(40);
    expect(['恐慌', '极度恐慌']).toContain(result.level);
  });

  it('should calculate neutral score', () => {
    const result = calculateFearGreedIndex(neutral);
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it('should return score in 0-100 range', () => {
    const results = [calculateFearGreedIndex(bullish), calculateFearGreedIndex(bearish), calculateFearGreedIndex(neutral)];
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('should have valid color hex', () => {
    const results = [calculateFearGreedIndex(bullish), calculateFearGreedIndex(bearish), calculateFearGreedIndex(neutral)];
    for (const r of results) {
      expect(r.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('should handle zero total', () => {
    const zero: MarketSnapshot = { rising: 0, falling: 0, flat: 0, limitUp: 0, limitDown: 0, totalVolume: 0, totalAmount: 0, newHigh: 0, newLow: 0, avgChangePercent: 0, northboundFlow: 0 };
    const result = calculateFearGreedIndex(zero);
    expect(result.score).toBe(50);
    expect(result.level).toBe('中性');
  });

  it('should calculate market heat', () => {
    const heat = calculateMarketHeat(bullish);
    expect(heat).toBeGreaterThan(0);
    expect(heat).toBeLessThanOrEqual(100);
  });

  it('should return higher heat for active market', () => {
    const hotHeat = calculateMarketHeat(bullish);
    const coldHeat = calculateMarketHeat(bearish);
    expect(hotHeat).toBeGreaterThan(coldHeat);
  });

  it('should calculate sentiment summary', () => {
    const summary = calculateSentimentSummary(bullish);
    expect(summary.fearGreed).toBeDefined();
    expect(summary.heat).toBeDefined();
    expect(summary.breadth).toBeDefined();
    expect(summary.strength).toBeDefined();
    expect(summary.summary).toBeDefined();
  });

  it('should have breadth > 0 for bullish', () => {
    const summary = calculateSentimentSummary(bullish);
    expect(summary.breadth).toBeGreaterThan(0);
  });

  it('should have breadth < 0 for bearish', () => {
    const summary = calculateSentimentSummary(bearish);
    expect(summary.breadth).toBeLessThan(0);
  });

  it('should include strength in summary', () => {
    const bullishSummary = calculateSentimentSummary(bullish);
    const bearishSummary = calculateSentimentSummary(bearish);
    expect(bullishSummary.strength).toBeGreaterThan(bearishSummary.strength);
  });
});
