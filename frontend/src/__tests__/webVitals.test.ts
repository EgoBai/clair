/**
 * Web Vitals 性能监控测试
 */

import { describe, it, expect } from 'vitest';

describe('Web Vitals 阈值', () => {
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

  describe('LCP评级', () => {
    it('2.0秒应为good', () => {
      expect(getRating('LCP', 2000)).toBe('good');
    });

    it('3.0秒应为needs-improvement', () => {
      expect(getRating('LCP', 3000)).toBe('needs-improvement');
    });

    it('5.0秒应为poor', () => {
      expect(getRating('LCP', 5000)).toBe('poor');
    });
  });

  describe('FID评级', () => {
    it('50ms应为good', () => {
      expect(getRating('FID', 50)).toBe('good');
    });

    it('200ms应为needs-improvement', () => {
      expect(getRating('FID', 200)).toBe('needs-improvement');
    });

    it('400ms应为poor', () => {
      expect(getRating('FID', 400)).toBe('poor');
    });
  });

  describe('CLS评级', () => {
    it('0.05应为good', () => {
      expect(getRating('CLS', 0.05)).toBe('good');
    });

    it('0.18应为needs-improvement', () => {
      expect(getRating('CLS', 0.18)).toBe('needs-improvement');
    });

    it('0.35应为poor', () => {
      expect(getRating('CLS', 0.35)).toBe('poor');
    });
  });

  describe('FCP评级', () => {
    it('1.5秒应为good', () => {
      expect(getRating('FCP', 1500)).toBe('good');
    });

    it('2.5秒应为needs-improvement', () => {
      expect(getRating('FCP', 2500)).toBe('needs-improvement');
    });

    it('4.0秒应为poor', () => {
      expect(getRating('FCP', 4000)).toBe('poor');
    });
  });

  describe('TTFB评级', () => {
    it('500ms应为good', () => {
      expect(getRating('TTFB', 500)).toBe('good');
    });

    it('1200ms应为needs-improvement', () => {
      expect(getRating('TTFB', 1200)).toBe('needs-improvement');
    });

    it('2500ms应为poor', () => {
      expect(getRating('TTFB', 2500)).toBe('poor');
    });
  });

  describe('边界值', () => {
    it('阈值边界应正确分类', () => {
      // 精确边界
      expect(getRating('LCP', 2500)).toBe('good');
      expect(getRating('LCP', 2501)).toBe('needs-improvement');
      expect(getRating('LCP', 4000)).toBe('needs-improvement');
      expect(getRating('LCP', 4001)).toBe('poor');
    });

    it('零值应为good', () => {
      expect(getRating('LCP', 0)).toBe('good');
      expect(getRating('FID', 0)).toBe('good');
      expect(getRating('CLS', 0)).toBe('good');
    });
  });
});

describe('性能评分计算', () => {
  function calculateScore(rating: 'good' | 'needs-improvement' | 'poor'): number {
    switch (rating) {
      case 'good': return 100;
      case 'needs-improvement': return 50;
      case 'poor': return 0;
    }
  }

  it('全部good应得100分', () => {
    const scores = ['good', 'good', 'good'].map(calculateScore);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBe(100);
  });

  it('混合评级应正确平均', () => {
    const scores = ['good', 'needs-improvement', 'poor'].map(calculateScore);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBeCloseTo(50, 0);
  });
});
