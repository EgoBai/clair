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
  fluidTypography,
  fluidSpacing,
  validateTouchTarget,
  touchTargetReport,
  getAdaptiveConfig,
  containerQuery,
  safeAreaPadding,
  TYPOGRAPHY_SCALE,
  type TableColumn
} from '../utils/responsiveUtils';

describe('ResponsiveUtils (real module)', () => {
  describe('getCurrentBreakpoint', () => {
    it('should return xs for small screens', () => {
      expect(getCurrentBreakpoint(320)).toBe('xs');
      expect(getCurrentBreakpoint(639)).toBe('xs');
    });

    it('should return sm at 640px', () => {
      expect(getCurrentBreakpoint(640)).toBe('sm');
      expect(getCurrentBreakpoint(767)).toBe('sm');
    });

    it('should return md at 768px', () => {
      expect(getCurrentBreakpoint(768)).toBe('md');
    });

    it('should return lg at 1024px', () => {
      expect(getCurrentBreakpoint(1024)).toBe('lg');
    });

    it('should return xl at 1280px', () => {
      expect(getCurrentBreakpoint(1280)).toBe('xl');
    });

    it('should return 2xl at 1536px+', () => {
      expect(getCurrentBreakpoint(1536)).toBe('2xl');
      expect(getCurrentBreakpoint(3840)).toBe('2xl');
    });
  });

  describe('isBelow / isAbove', () => {
    it('should correctly check below', () => {
      expect(isBelow(375, 'md')).toBe(true);
      expect(isBelow(1024, 'md')).toBe(false);
    });

    it('should correctly check above', () => {
      expect(isAbove(1024, 'md')).toBe(true);
      expect(isAbove(375, 'md')).toBe(false);
    });
  });

  describe('responsiveValue', () => {
    it('should pick correct value per breakpoint', () => {
      expect(responsiveValue(375, { xs: 'mobile', lg: 'desktop' })).toBe('mobile');
      expect(responsiveValue(1200, { xs: 'mobile', lg: 'desktop' })).toBe('desktop');
    });

    it('should fall back to smaller breakpoints', () => {
      expect(responsiveValue(1200, { xs: 'base', md: 'mid' })).toBe('mid');
    });

    it('should return undefined when no matching breakpoint', () => {
      expect(responsiveValue(375, { lg: 'desktop' } as Record<string, string>)).toBeUndefined();
    });
  });

  describe('Grid Config', () => {
    it('should return 1 column on mobile', () => {
      expect(getGridConfig(BREAKPOINTS.xs).columns).toBe(1);
      expect(getGridConfig(320).columns).toBe(1);
    });

    it('should return 4 columns on desktop', () => {
      expect(getGridConfig(BREAKPOINTS.xl).columns).toBe(4);
    });

    it('should have increasing gap with screen size', () => {
      expect(getGridConfig(BREAKPOINTS.xs).gap).toBeLessThan(getGridConfig(BREAKPOINTS.lg).gap);
      expect(getGridConfig(BREAKPOINTS.lg).gap).toBeLessThan(getGridConfig(BREAKPOINTS['2xl']).gap);
    });
  });

  describe('calculateColumns', () => {
    it('should compute columns from available width', () => {
      expect(calculateColumns(300, 100, 10)).toBe(2);
    });

    it('should clamp to maxColumns', () => {
      expect(calculateColumns(5000, 50, 10, 6)).toBe(6);
    });

    it('should never go below 1', () => {
      expect(calculateColumns(10, 100, 10)).toBe(1);
    });
  });

  describe('Virtual List Calculation', () => {
    it('should calculate correct range at top', () => {
      const r = calculateVirtualList(500, 50, 100, 0);
      expect(r.startIndex).toBe(0);
      expect(r.endIndex).toBeGreaterThan(0);
      expect(r.totalHeight).toBe(5000);
    });

    it('should calculate correct range when scrolled', () => {
      const r = calculateVirtualList(500, 50, 100, 1000);
      expect(r.startIndex).toBe(17);
      expect(r.offsetY).toBe(850);
    });

    it('should not exceed total items', () => {
      const r = calculateVirtualList(500, 50, 10, 0);
      expect(r.endIndex).toBeLessThanOrEqual(9);
    });
  });

  describe('Media Query String', () => {
    it('should generate correct min-width', () => {
      expect(mediaQuery('md', 'up')).toBe('@media (min-width: 768px)');
    });

    it('should generate correct max-width', () => {
      expect(mediaQuery('lg', 'down')).toBe('@media (max-width: 1023px)');
    });
  });

  describe('Table Columns', () => {
    const columns: TableColumn[] = [
      { key: 'a', title: 'A', dataIndex: 'a', priority: 1 },
      { key: 'b', title: 'B', dataIndex: 'b', priority: 2 },
      { key: 'c', title: 'C', dataIndex: 'c', priority: 3 }
    ];

    it('should keep priority-1 columns always', () => {
      expect(filterColumnsByBreakpoint(columns, 320)).toHaveLength(1);
    });

    it('should add tablet columns above md', () => {
      expect(filterColumnsByBreakpoint(columns, 768)).toHaveLength(2);
    });

    it('should add desktop columns above lg', () => {
      expect(filterColumnsByBreakpoint(columns, 1024)).toHaveLength(3);
    });
  });

  describe('Fluid Typography & Spacing', () => {
    it('should produce a clamp() string for px', () => {
      const css = fluidTypography(TYPOGRAPHY_SCALE.h1);
      expect(css).toMatch(/^clamp\(/);
      expect(css).toContain('px');
    });

    it('should produce a rem-based clamp when unit is rem', () => {
      const css = fluidTypography({ ...TYPOGRAPHY_SCALE.h1, unit: 'rem' });
      expect(css).toContain('rem');
    });

    it('should produce clamp() for fluid spacing', () => {
      expect(fluidSpacing(4, 8)).toMatch(/^clamp\(/);
    });
  });

  describe('Touch Target Validation', () => {
    it('should accept 44x44', () => { expect(validateTouchTarget(44, 44)).toBe(true); });
    it('should reject 32x32', () => { expect(validateTouchTarget(32, 32)).toBe(false); });
    it('should accept 60x44', () => { expect(validateTouchTarget(60, 44)).toBe(true); });

    it('should report diff and suggestion for small targets', () => {
      const r = touchTargetReport(32, 32);
      expect(r.valid).toBe(false);
      expect(r.widthDiff).toBe(12);
      expect(r.heightDiff).toBe(12);
      expect(r.suggestion).toContain('padding');
    });

    it('should report no suggestion when valid', () => {
      expect(touchTargetReport(60, 60).suggestion).toBeUndefined();
    });
  });

  describe('Adaptive Config & helpers', () => {
    it('should classify mobile vs desktop', () => {
      expect(getAdaptiveConfig(375).isMobile).toBe(true);
      expect(getAdaptiveConfig(375).sidebarVisible).toBe(false);
      expect(getAdaptiveConfig(1280).isDesktop).toBe(true);
    });

    it('should generate container query css', () => {
      expect(containerQuery('main', 400, 'display: grid')).toBe(
        '@container main (min-width: 400px) { display: grid }'
      );
    });

    it('should return safe area padding', () => {
      const s = safeAreaPadding();
      expect(s.paddingTop).toContain('safe-area-inset-top');
    });
  });
});
