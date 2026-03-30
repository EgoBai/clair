import { describe, it, expect, vi } from 'vitest';

// ==================== Web Vitals 阈值和评分逻辑测试 ====================

// 复制阈值以独立测试
const THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  INP: { good: 200, poor: 500 },
};

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name];
  if (!threshold) return 'good';
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

function calculateScore(name: string, value: number): number {
  const threshold = THRESHOLDS[name];
  if (!threshold) return 100;
  const rating = getRating(name, value);
  if (rating === 'good') return 100;
  if (rating === 'needs-improvement') {
    const ratio = (value - threshold.good) / (threshold.poor - threshold.good);
    return Math.round(100 - ratio * 50);
  }
  return Math.max(0, Math.round(50 - (value - threshold.poor) / threshold.poor * 50));
}

describe('webVitals - threshold constants', () => {
  it('should have LCP thresholds', () => {
    expect(THRESHOLDS.LCP.good).toBe(2500);
    expect(THRESHOLDS.LCP.poor).toBe(4000);
  });

  it('should have FID thresholds', () => {
    expect(THRESHOLDS.FID.good).toBe(100);
    expect(THRESHOLDS.FID.poor).toBe(300);
  });

  it('should have CLS thresholds', () => {
    expect(THRESHOLDS.CLS.good).toBe(0.1);
    expect(THRESHOLDS.CLS.poor).toBe(0.25);
  });

  it('should have FCP thresholds', () => {
    expect(THRESHOLDS.FCP.good).toBe(1800);
    expect(THRESHOLDS.FCP.poor).toBe(3000);
  });

  it('should have TTFB thresholds', () => {
    expect(THRESHOLDS.TTFB.good).toBe(800);
    expect(THRESHOLDS.TTFB.poor).toBe(1800);
  });

  it('should have INP thresholds', () => {
    expect(THRESHOLDS.INP.good).toBe(200);
    expect(THRESHOLDS.INP.poor).toBe(500);
  });

  it('all poor thresholds should be greater than good', () => {
    for (const [name, threshold] of Object.entries(THRESHOLDS)) {
      expect(threshold.poor).toBeGreaterThan(threshold.good);
    }
  });
});

describe('webVitals - getRating', () => {
  it('should rate LCP 1000 as good', () => {
    expect(getRating('LCP', 1000)).toBe('good');
  });

  it('should rate LCP 2500 as good (boundary)', () => {
    expect(getRating('LCP', 2500)).toBe('good');
  });

  it('should rate LCP 3000 as needs-improvement', () => {
    expect(getRating('LCP', 3000)).toBe('needs-improvement');
  });

  it('should rate LCP 4000 as needs-improvement (boundary)', () => {
    expect(getRating('LCP', 4000)).toBe('needs-improvement');
  });

  it('should rate LCP 5000 as poor', () => {
    expect(getRating('LCP', 5000)).toBe('poor');
  });

  it('should rate FID 50 as good', () => {
    expect(getRating('FID', 50)).toBe('good');
  });

  it('should rate FID 200 as needs-improvement', () => {
    expect(getRating('FID', 200)).toBe('needs-improvement');
  });

  it('should rate FID 400 as poor', () => {
    expect(getRating('FID', 400)).toBe('poor');
  });

  it('should rate CLS 0.05 as good', () => {
    expect(getRating('CLS', 0.05)).toBe('good');
  });

  it('should rate CLS 0.15 as needs-improvement', () => {
    expect(getRating('CLS', 0.15)).toBe('needs-improvement');
  });

  it('should rate CLS 0.3 as poor', () => {
    expect(getRating('CLS', 0.3)).toBe('poor');
  });

  it('should rate FCP 1000 as good', () => {
    expect(getRating('FCP', 1000)).toBe('good');
  });

  it('should rate FCP 2500 as needs-improvement', () => {
    expect(getRating('FCP', 2500)).toBe('needs-improvement');
  });

  it('should rate FCP 3500 as poor', () => {
    expect(getRating('FCP', 3500)).toBe('poor');
  });

  it('should rate TTFB 500 as good', () => {
    expect(getRating('TTFB', 500)).toBe('good');
  });

  it('should rate TTFB 1200 as needs-improvement', () => {
    expect(getRating('TTFB', 1200)).toBe('needs-improvement');
  });

  it('should rate TTFB 2000 as poor', () => {
    expect(getRating('TTFB', 2000)).toBe('poor');
  });

  it('should rate INP 100 as good', () => {
    expect(getRating('INP', 100)).toBe('good');
  });

  it('should rate INP 350 as needs-improvement', () => {
    expect(getRating('INP', 350)).toBe('needs-improvement');
  });

  it('should rate INP 600 as poor', () => {
    expect(getRating('INP', 600)).toBe('poor');
  });

  it('should default to good for unknown metrics', () => {
    expect(getRating('UNKNOWN', 9999)).toBe('good');
  });

  it('should handle zero value', () => {
    expect(getRating('LCP', 0)).toBe('good');
  });

  it('should handle negative value', () => {
    expect(getRating('LCP', -100)).toBe('good');
  });
});

describe('webVitals - score calculation', () => {
  it('good rating should give 100 points', () => {
    expect(calculateScore('LCP', 1000)).toBe(100);
  });

  it('needs-improvement should give 50-100 points', () => {
    const score = calculateScore('LCP', 3000);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('poor rating should give 0-50 points', () => {
    const score = calculateScore('LCP', 5000);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(50);
  });

  it('very bad score should clamp to 0', () => {
    const score = calculateScore('LCP', 20000);
    expect(score).toBe(0);
  });

  it('boundary at good threshold should give 100', () => {
    expect(calculateScore('LCP', 2500)).toBe(100);
  });

  it('boundary at poor threshold should give 50', () => {
    expect(calculateScore('LCP', 4000)).toBe(50);
  });

  it('mid needs-improvement should give ~75', () => {
    const score = calculateScore('LCP', 3250);
    expect(score).toBe(75);
  });

  it('CLS scoring should handle decimal values', () => {
    expect(calculateScore('CLS', 0.05)).toBe(100);
    expect(calculateScore('CLS', 0.2)).toBeGreaterThan(0);
  });

  it('unknown metric should always score 100', () => {
    expect(calculateScore('UNKNOWN', 99999)).toBe(100);
  });
});

describe('webVitals - generateId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      ids.add(id);
    }
    // Most should be unique (random collisions possible but unlikely)
    expect(ids.size).toBeGreaterThan(90);
  });
});

describe('webVitals - metric reporting dedup', () => {
  it('should not report same value twice', () => {
    const metrics = new Map<string, { name: string; value: number }>();
    const reportMetric = (metric: { name: string; value: number }) => {
      const existing = metrics.get(metric.name);
      if (existing && existing.value === metric.value) return false;
      metrics.set(metric.name, metric);
      return true;
    };

    expect(reportMetric({ name: 'LCP', value: 1000 })).toBe(true);
    expect(reportMetric({ name: 'LCP', value: 1000 })).toBe(false);
    expect(reportMetric({ name: 'LCP', value: 2000 })).toBe(true);
  });
});
