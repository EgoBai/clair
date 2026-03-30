import { describe, it, expect } from 'vitest';

describe('MarketHeatDashboardLogic', () => {
  function calculateHeatIndex(data: { rising: number; falling: number; flat: number; limitUp: number; limitDown: number; northboundFlow: number }): number {
    const total = data.rising + data.falling + data.flat;
    if (total === 0) return 50;
    const advRatio = data.rising / total;
    let score = 50;
    score += (advRatio - 0.5) * 60;
    score += data.limitUp > data.limitDown ? 5 : -5;
    score += data.northboundFlow > 0 ? 5 : -5;
    return Math.min(100, Math.max(0, score));
  }

  function getSentimentLevel(heatIndex: number): string {
    if (heatIndex > 80) return '极度贪婪';
    if (heatIndex > 60) return '贪婪';
    if (heatIndex < 20) return '极度恐慌';
    if (heatIndex < 40) return '恐慌';
    return '中性';
  }

  function getSentimentColor(level: string): string {
    const map: Record<string, string> = {
      '极度贪婪': '#3f8600', '贪婪': '#7cb342', '中性': '#faad14',
      '恐慌': '#d46b08', '极度恐慌': '#cf1322',
    };
    return map[level] || '#888';
  }

  function calculateDistribution(rising: number, falling: number, flat: number) {
    const total = rising + falling + flat;
    if (total === 0) return { risingPct: 0, fallingPct: 0, flatPct: 0 };
    return {
      risingPct: parseFloat((rising / total * 100).toFixed(1)),
      fallingPct: parseFloat((falling / total * 100).toFixed(1)),
      flatPct: parseFloat((flat / total * 100).toFixed(1)),
    };
  }

  function formatAmount(amount: number): string {
    if (amount >= 1e12) return (amount / 1e12).toFixed(2) + '万亿';
    if (amount >= 1e8) return (amount / 1e8).toFixed(0) + '亿';
    if (amount >= 1e4) return (amount / 1e4).toFixed(0) + '万';
    return amount.toFixed(0);
  }

  it('should calculate high heat for bullish market', () => {
    const heat = calculateHeatIndex({ rising: 4000, falling: 500, flat: 100, limitUp: 100, limitDown: 5, northboundFlow: 5e10 });
    expect(heat).toBeGreaterThan(60);
  });

  it('should calculate low heat for bearish market', () => {
    const heat = calculateHeatIndex({ rising: 500, falling: 4000, flat: 100, limitUp: 5, limitDown: 100, northboundFlow: -5e10 });
    expect(heat).toBeLessThan(40);
  });

  it('should return balanced heat for equal market', () => {
    // With equal rising/falling, score starts at 50
    // But limitUp<=limitDown adds -5 and northboundFlow<=0 adds -5 → 40
    const heat = calculateHeatIndex({ rising: 2000, falling: 2000, flat: 0, limitUp: 20, limitDown: 20, northboundFlow: 0 });
    expect(heat).toBeCloseTo(40, 0);
  });

  it('should return 50 for empty market', () => {
    const heat = calculateHeatIndex({ rising: 0, falling: 0, flat: 0, limitUp: 0, limitDown: 0, northboundFlow: 0 });
    expect(heat).toBe(50);
  });

  it('should clamp heat index to 0-100', () => {
    const extremeHigh = calculateHeatIndex({ rising: 10000, falling: 0, flat: 0, limitUp: 500, limitDown: 0, northboundFlow: 1e12 });
    expect(extremeHigh).toBeLessThanOrEqual(100);
    const extremeLow = calculateHeatIndex({ rising: 0, falling: 10000, flat: 0, limitUp: 0, limitDown: 500, northboundFlow: -1e12 });
    expect(extremeLow).toBeGreaterThanOrEqual(0);
  });

  it('should map heat index to correct sentiment', () => {
    expect(getSentimentLevel(85)).toBe('极度贪婪');
    expect(getSentimentLevel(70)).toBe('贪婪');
    expect(getSentimentLevel(50)).toBe('中性');
    expect(getSentimentLevel(30)).toBe('恐慌');
    expect(getSentimentLevel(10)).toBe('极度恐慌');
  });

  it('should return valid sentiment colors', () => {
    const levels = ['极度贪婪', '贪婪', '中性', '恐慌', '极度恐慌'];
    for (const level of levels) {
      expect(getSentimentColor(level)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('should calculate distribution percentages', () => {
    const dist = calculateDistribution(3000, 1000, 100);
    expect(dist.risingPct).toBeCloseTo(73.2, 0);
    expect(dist.fallingPct).toBeCloseTo(24.4, 0);
    expect(dist.flatPct).toBeCloseTo(2.4, 0);
  });

  it('should handle zero distribution', () => {
    const dist = calculateDistribution(0, 0, 0);
    expect(dist.risingPct).toBe(0);
    expect(dist.fallingPct).toBe(0);
    expect(dist.flatPct).toBe(0);
  });

  it('should format large amounts correctly', () => {
    expect(formatAmount(1.5e12)).toContain('万亿');
    expect(formatAmount(5e10)).toContain('亿');
  });

  it('should distribute percentages sum to 100', () => {
    const dist = calculateDistribution(3000, 1000, 100);
    const sum = dist.risingPct + dist.fallingPct + dist.flatPct;
    expect(sum).toBeCloseTo(100, 0);
  });
});
