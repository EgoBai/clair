import { describe, it, expect } from 'vitest';
import {
  BREAKPOINTS,
  getCurrentBreakpoint,
  isBelow,
  isAbove,
  responsiveValue,
  getGridConfig,
  calculateVirtualList,
  calculateColumns,
  mediaQuery,
  filterColumnsByBreakpoint,
} from '../utils/responsiveUtils';

describe('Responsive Utilities', () => {
  describe('BREAKPOINTS', () => {
    it('should have all breakpoint keys', () => {
      expect(BREAKPOINTS.xs).toBe(0);
      expect(BREAKPOINTS.sm).toBe(640);
      expect(BREAKPOINTS.md).toBe(768);
      expect(BREAKPOINTS.lg).toBe(1024);
      expect(BREAKPOINTS.xl).toBe(1280);
      expect(BREAKPOINTS['2xl']).toBe(1536);
    });

    it('should be in ascending order', () => {
      expect(BREAKPOINTS.xs).toBeLessThan(BREAKPOINTS.sm);
      expect(BREAKPOINTS.sm).toBeLessThan(BREAKPOINTS.md);
      expect(BREAKPOINTS.md).toBeLessThan(BREAKPOINTS.lg);
      expect(BREAKPOINTS.lg).toBeLessThan(BREAKPOINTS.xl);
      expect(BREAKPOINTS.xl).toBeLessThan(BREAKPOINTS['2xl']);
    });
  });

  describe('getCurrentBreakpoint', () => {
    it('should return xs for small widths', () => {
      expect(getCurrentBreakpoint(320)).toBe('xs');
      expect(getCurrentBreakpoint(639)).toBe('xs');
    });

    it('should return sm at 640', () => {
      expect(getCurrentBreakpoint(640)).toBe('sm');
    });

    it('should return md at 768', () => {
      expect(getCurrentBreakpoint(768)).toBe('md');
    });

    it('should return lg at 1024', () => {
      expect(getCurrentBreakpoint(1024)).toBe('lg');
    });

    it('should return xl at 1280', () => {
      expect(getCurrentBreakpoint(1280)).toBe('xl');
    });

    it('should return 2xl at 1536+', () => {
      expect(getCurrentBreakpoint(1536)).toBe('2xl');
      expect(getCurrentBreakpoint(1920)).toBe('2xl');
    });
  });

  describe('isBelow', () => {
    it('should check below breakpoint', () => {
      expect(isBelow(500, 'sm')).toBe(true);
      expect(isBelow(640, 'sm')).toBe(false);
      expect(isBelow(800, 'lg')).toBe(true);
      expect(isBelow(1024, 'lg')).toBe(false);
    });
  });

  describe('isAbove', () => {
    it('should check above breakpoint', () => {
      expect(isAbove(640, 'sm')).toBe(true);
      expect(isAbove(639, 'sm')).toBe(false);
      expect(isAbove(1024, 'lg')).toBe(true);
      expect(isAbove(1023, 'lg')).toBe(false);
    });
  });

  describe('responsiveValue', () => {
    it('should pick value for breakpoint', () => {
      const values = { sm: 1, md: 2, lg: 3 };
      expect(responsiveValue(640, values)).toBe(1);
      expect(responsiveValue(768, values)).toBe(2);
      expect(responsiveValue(1024, values)).toBe(3);
    });

    it('should fallback to lower breakpoint', () => {
      const values = { xs: 'mobile', lg: 'desktop' };
      expect(responsiveValue(768, values)).toBe('mobile');
    });

    it('should return undefined if no match', () => {
      expect(responsiveValue(500, { lg: 'desktop' })).toBeUndefined();
    });
  });

  describe('getGridConfig', () => {
    it('should return 1 column on mobile', () => {
      const config = getGridConfig(375);
      expect(config.columns).toBe(1);
    });

    it('should return more columns on desktop', () => {
      const config = getGridConfig(1440);
      expect(config.columns).toBeGreaterThanOrEqual(3);
    });

    it('should include gap and padding', () => {
      const config = getGridConfig(768);
      expect(config.gap).toBeGreaterThan(0);
      expect(config.padding).toBeGreaterThan(0);
    });
  });

  describe('calculateVirtualList', () => {
    it('should calculate visible range', () => {
      const result = calculateVirtualList(500, 50, 100, 0, 3);
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBeLessThan(100);
      expect(result.totalHeight).toBe(5000);
      expect(result.offsetY).toBe(0);
    });

    it('should handle scroll offset', () => {
      const result = calculateVirtualList(500, 50, 100, 1000, 3);
      expect(result.startIndex).toBeGreaterThan(0);
      expect(result.offsetY).toBeGreaterThan(0);
    });

    it('should handle overscan', () => {
      const withOverscan = calculateVirtualList(500, 50, 100, 0, 5);
      const withoutOverscan = calculateVirtualList(500, 50, 100, 0, 0);
      expect(withOverscan.endIndex).toBeGreaterThanOrEqual(withoutOverscan.endIndex);
    });

    it('should clamp to total count', () => {
      const result = calculateVirtualList(10000, 50, 10, 0);
      expect(result.endIndex).toBeLessThanOrEqual(9);
    });
  });

  describe('calculateColumns', () => {
    it('should return 1 for narrow container', () => {
      expect(calculateColumns(200, 300, 16)).toBe(1);
    });

    it('should return multiple columns for wide container', () => {
      const cols = calculateColumns(1200, 200, 16);
      expect(cols).toBeGreaterThan(1);
    });

    it('should respect maxColumns', () => {
      expect(calculateColumns(10000, 100, 16, 3)).toBeLessThanOrEqual(3);
    });

    it('should always return at least 1', () => {
      expect(calculateColumns(50, 100, 16)).toBe(1);
    });
  });

  describe('mediaQuery', () => {
    it('should generate min-width query for up', () => {
      expect(mediaQuery('md', 'up')).toContain('min-width');
      expect(mediaQuery('md', 'up')).toContain('768px');
    });

    it('should generate max-width query for down', () => {
      expect(mediaQuery('md', 'down')).toContain('max-width');
      expect(mediaQuery('md', 'down')).toContain('767px');
    });
  });

  describe('filterColumnsByBreakpoint', () => {
    const columns = [
      { key: 'a', title: 'A', dataIndex: 'a', priority: 1 },
      { key: 'b', title: 'B', dataIndex: 'b', priority: 2 },
      { key: 'c', title: 'C', dataIndex: 'c', priority: 3 },
    ] as any[];

    it('should show all columns on desktop', () => {
      expect(filterColumnsByBreakpoint(columns, 1280)).toHaveLength(3);
    });

    it('should filter priority-3 on tablet', () => {
      const result = filterColumnsByBreakpoint(columns, 800);
      expect(result).toHaveLength(2);
    });

    it('should only show priority-1 on mobile', () => {
      const result = filterColumnsByBreakpoint(columns, 375);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('a');
    });
  });
});
