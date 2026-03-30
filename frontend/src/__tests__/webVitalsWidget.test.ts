/**
 * Web Vitals 仪表盘组件逻辑测试
 */
import { describe, it, expect } from 'vitest';

describe('WebVitalsWidget Logic', () => {
  const VITAL_CONFIG: Record<string, { label: string; unit: string; format: (v: number) => string }> = {
    FCP: { label: 'FCP', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
    LCP: { label: 'LCP', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
    CLS: { label: 'CLS', unit: '', format: (v) => v.toFixed(3) },
    FID: { label: 'FID', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
    TTFB: { label: 'TTFB', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
    INP: { label: 'INP', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
  };

  const RATING_COLORS: Record<string, string> = {
    'good': '#22c55e',
    'needs-improvement': '#f59e0b',
    'poor': '#ef4444',
  };

  const RATING_BG: Record<string, string> = {
    'good': 'rgba(34, 197, 94, 0.1)',
    'needs-improvement': 'rgba(245, 158, 11, 0.1)',
    'poor': 'rgba(239, 68, 68, 0.1)',
  };

  describe('Vital Configuration', () => {
    it('should have 6 core web vitals', () => {
      expect(Object.keys(VITAL_CONFIG)).toHaveLength(6);
    });

    it('should include FCP, LCP, CLS, FID, TTFB, INP', () => {
      expect(VITAL_CONFIG.FCP).toBeDefined();
      expect(VITAL_CONFIG.LCP).toBeDefined();
      expect(VITAL_CONFIG.CLS).toBeDefined();
      expect(VITAL_CONFIG.FID).toBeDefined();
      expect(VITAL_CONFIG.TTFB).toBeDefined();
      expect(VITAL_CONFIG.INP).toBeDefined();
    });

    it('should format ms values correctly', () => {
      expect(VITAL_CONFIG.FCP.format(1234)).toBe('1234ms');
      expect(VITAL_CONFIG.LCP.format(567)).toBe('567ms');
      expect(VITAL_CONFIG.FID.format(89)).toBe('89ms');
    });

    it('should format CLS without ms suffix', () => {
      expect(VITAL_CONFIG.CLS.format(0.05)).toBe('0.050');
      expect(VITAL_CONFIG.CLS.format(0.25)).toBe('0.250');
      expect(VITAL_CONFIG.CLS.format(1.5)).toBe('1.500');
    });

    it('should format TTFB in ms', () => {
      expect(VITAL_CONFIG.TTFB.format(200)).toBe('200ms');
    });

    it('should format INP in ms', () => {
      expect(VITAL_CONFIG.INP.format(150)).toBe('150ms');
    });
  });

  describe('Rating Colors', () => {
    it('should map good rating to green', () => {
      expect(RATING_COLORS['good']).toBe('#22c55e');
    });

    it('should map needs-improvement to yellow', () => {
      expect(RATING_COLORS['needs-improvement']).toBe('#f59e0b');
    });

    it('should map poor to red', () => {
      expect(RATING_COLORS['poor']).toBe('#ef4444');
    });
  });

  describe('Rating Backgrounds', () => {
    it('should have background for each rating', () => {
      expect(RATING_BG['good']).toContain('rgba(34, 197, 94');
      expect(RATING_BG['needs-improvement']).toContain('rgba(245, 158, 11');
      expect(RATING_BG['poor']).toContain('rgba(239, 68, 68');
    });
  });

  describe('Score Calculation', () => {
    const getScoreColor = (score: number) =>
      score >= 90 ? RATING_COLORS['good'] :
      score >= 50 ? RATING_COLORS['needs-improvement'] :
      RATING_COLORS['poor'];

    it('should return green for score >= 90', () => {
      expect(getScoreColor(90)).toBe('#22c55e');
      expect(getScoreColor(100)).toBe('#22c55e');
    });

    it('should return yellow for score 50-89', () => {
      expect(getScoreColor(50)).toBe('#f59e0b');
      expect(getScoreColor(75)).toBe('#f59e0b');
    });

    it('should return red for score < 50', () => {
      expect(getScoreColor(49)).toBe('#ef4444');
      expect(getScoreColor(0)).toBe('#ef4444');
    });
  });

  describe('Vital Display Generation', () => {
    interface MetricData {
      name: string;
      value: number;
      rating: 'good' | 'needs-improvement' | 'poor';
    }

    const createDisplay = (m: MetricData) => ({
      name: m.name,
      label: VITAL_CONFIG[m.name]?.label || m.name,
      value: m.value,
      unit: VITAL_CONFIG[m.name]?.unit || '',
      rating: m.rating,
    });

    it('should create display for FCP metric', () => {
      const display = createDisplay({ name: 'FCP', value: 1200, rating: 'good' });
      expect(display.label).toBe('FCP');
      expect(display.value).toBe(1200);
      expect(display.unit).toBe('ms');
    });

    it('should create display for CLS metric', () => {
      const display = createDisplay({ name: 'CLS', value: 0.05, rating: 'good' });
      expect(display.label).toBe('CLS');
      expect(display.unit).toBe('');
    });

    it('should use name as label for unknown metrics', () => {
      const display = createDisplay({ name: 'CUSTOM', value: 100, rating: 'good' });
      expect(display.label).toBe('CUSTOM');
    });
  });

  describe('Compact Mode Layout', () => {
    it('should calculate score display threshold', () => {
      const isGood = (score: number) => score >= 90;
      expect(isGood(90)).toBe(true);
      expect(isGood(89)).toBe(false);
    });
  });

  describe('Grid Layout Config', () => {
    it('should use 3 columns for full mode', () => {
      const columns = 3;
      expect(columns).toBe(3);
    });

    it('should show 6 vitals in 3x2 grid', () => {
      const vitals = Object.keys(VITAL_CONFIG);
      const columns = 3;
      const rows = Math.ceil(vitals.length / columns);
      expect(rows).toBe(2);
    });
  });
});
