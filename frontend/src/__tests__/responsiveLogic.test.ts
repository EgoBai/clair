import { describe, it, expect } from 'vitest';

/**
 * 响应式逻辑测试
 * 断点/布局计算/手势/自适应
 */

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600,
};

function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.xxl) return 'xxl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

function isMobile(width: number): boolean {
  return width < BREAKPOINTS.md;
}

function calculateGridColumns(containerWidth: number, minItemWidth: number, gap = 16): number {
  if (containerWidth < minItemWidth) return 1;
  const cols = Math.floor((containerWidth + gap) / (minItemWidth + gap));
  return Math.max(1, cols);
}

function calculateResponsiveFontSize(baseSize: number, width: number, min = 12, max = 24): number {
  const scale = Math.min(1.5, Math.max(0.75, width / 1200));
  return Math.min(max, Math.max(min, Math.round(baseSize * scale)));
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T & { cancel: () => void };
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return debounced;
}

function throttle<T extends (...args: any[]) => void>(fn: T, interval: number): T {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

function calculateSafeArea(insets: { top: number; bottom: number; left: number; right: number }, base: { width: number; height: number }): { width: number; height: number; x: number; y: number } {
  return {
    width: base.width - insets.left - insets.right,
    height: base.height - insets.top - insets.bottom,
    x: insets.left,
    y: insets.top,
  };
}

function getOrientation(width: number, height: number): 'portrait' | 'landscape' {
  return height > width ? 'portrait' : 'landscape';
}

describe('响应式逻辑', () => {
  describe('getBreakpoint', () => {
    it('should return xs for small width', () => {
      expect(getBreakpoint(320)).toBe('xs');
    });

    it('should return md for tablet', () => {
      expect(getBreakpoint(800)).toBe('md');
    });

    it('should return xxl for large', () => {
      expect(getBreakpoint(1920)).toBe('xxl');
    });
  });

  describe('isMobile', () => {
    it('should be mobile for small widths', () => {
      expect(isMobile(375)).toBe(true);
    });

    it('should not be mobile for large widths', () => {
      expect(isMobile(1024)).toBe(false);
    });
  });

  describe('calculateGridColumns', () => {
    it('should calculate columns', () => {
      expect(calculateGridColumns(1200, 300)).toBeGreaterThanOrEqual(3);
    });

    it('should return 1 for small container', () => {
      expect(calculateGridColumns(100, 300)).toBe(1);
    });
  });

  describe('calculateResponsiveFontSize', () => {
    it('should scale with width', () => {
      const small = calculateResponsiveFontSize(16, 375);
      const large = calculateResponsiveFontSize(16, 1920);
      expect(large).toBeGreaterThanOrEqual(small);
    });

    it('should respect min/max', () => {
      const tiny = calculateResponsiveFontSize(16, 100);
      expect(tiny).toBeGreaterThanOrEqual(12);
    });
  });

  describe('calculateSafeArea', () => {
    it('should subtract insets', () => {
      const safe = calculateSafeArea({ top: 20, bottom: 34, left: 0, right: 0 }, { width: 375, height: 812 });
      expect(safe.height).toBe(758);
      expect(safe.y).toBe(20);
    });
  });

  describe('getOrientation', () => {
    it('should detect portrait', () => {
      expect(getOrientation(375, 812)).toBe('portrait');
    });

    it('should detect landscape', () => {
      expect(getOrientation(812, 375)).toBe('landscape');
    });
  });
});
