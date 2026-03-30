import { describe, it, expect } from 'vitest';

describe('ResponsiveUtils', () => {
  const BREAKPOINTS = { xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };

  function getCurrentBreakpoint(w: number): string {
    if (w >= 1536) return '2xl';
    if (w >= 1280) return 'xl';
    if (w >= 1024) return 'lg';
    if (w >= 768) return 'md';
    if (w >= 640) return 'sm';
    return 'xs';
  }

  function isBelow(w: number, bp: string): boolean {
    return w < (BREAKPOINTS as Record<string, number>)[bp];
  }

  function isAbove(w: number, bp: string): boolean {
    return w >= (BREAKPOINTS as Record<string, number>)[bp];
  }

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
    function rv<T>(w: number, vals: Record<string, T>): T | undefined {
      const order = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];
      let bp = 'xs';
      if (w >= 1536) bp = '2xl';
      else if (w >= 1280) bp = 'xl';
      else if (w >= 1024) bp = 'lg';
      else if (w >= 768) bp = 'md';
      else if (w >= 640) bp = 'sm';

      const bps: Record<string, number> = BREAKPOINTS;
      for (const key of order) {
        if (bps[key] <= bps[bp] && vals[key] !== undefined) return vals[key];
      }
      return undefined;
    }

    it('should pick correct value per breakpoint', () => {
      expect(rv(375, { xs: 'mobile', lg: 'desktop' })).toBe('mobile');
      expect(rv(1200, { xs: 'mobile', lg: 'desktop' })).toBe('desktop');
    });

    it('should fall back to smaller breakpoints', () => {
      expect(rv(1200, { xs: 'base', md: 'mid' })).toBe('mid');
    });
  });

  describe('Grid Config', () => {
    const GRID: Record<string, { columns: number; gap: number; padding: number }> = {
      xs: { columns: 1, gap: 8, padding: 12 },
      sm: { columns: 1, gap: 12, padding: 16 },
      md: { columns: 2, gap: 16, padding: 20 },
      lg: { columns: 3, gap: 16, padding: 24 },
      xl: { columns: 4, gap: 20, padding: 24 },
      '2xl': { columns: 4, gap: 24, padding: 32 },
    };

    it('should return 1 column on mobile', () => {
      expect(GRID.xs.columns).toBe(1);
    });

    it('should return 4 columns on desktop', () => {
      expect(GRID.xl.columns).toBe(4);
    });

    it('should have increasing gap with screen size', () => {
      expect(GRID.xs.gap).toBeLessThan(GRID.lg.gap);
      expect(GRID.lg.gap).toBeLessThan(GRID['2xl'].gap);
    });
  });

  describe('Virtual List Calculation', () => {
    function calcVirtList(
      containerH: number, itemH: number, total: number, scrollT: number, overscan = 3
    ) {
      const totalHeight = total * itemH;
      const startIndex = Math.max(0, Math.floor(scrollT / itemH) - overscan);
      const visibleCount = Math.ceil(containerH / itemH);
      const endIndex = Math.min(total - 1, startIndex + visibleCount + overscan * 2);
      return { startIndex, endIndex, offsetY: startIndex * itemH, totalHeight };
    }

    it('should calculate correct range at top', () => {
      const r = calcVirtList(500, 50, 100, 0);
      expect(r.startIndex).toBe(0);
      expect(r.endIndex).toBeGreaterThan(0);
      expect(r.totalHeight).toBe(5000);
    });

    it('should calculate correct range when scrolled', () => {
      const r = calcVirtList(500, 50, 100, 1000);
      expect(r.startIndex).toBe(17);
      expect(r.offsetY).toBe(850);
    });

    it('should not exceed total items', () => {
      const r = calcVirtList(500, 50, 10, 0);
      expect(r.endIndex).toBeLessThanOrEqual(9);
    });
  });

  describe('Media Query String', () => {
    function mq(bp: string, dir: 'up' | 'down'): string {
      const bps: Record<string, number> = BREAKPOINTS;
      const px = bps[bp] ?? 0;
      return dir === 'up'
        ? `@media (min-width: ${px}px)`
        : `@media (max-width: ${px - 1}px)`;
    }

    it('should generate correct min-width', () => {
      expect(mq('md', 'up')).toBe('@media (min-width: 768px)');
    });

    it('should generate correct max-width', () => {
      expect(mq('lg', 'down')).toBe('@media (max-width: 1023px)');
    });
  });

  describe('Touch Target Validation', () => {
    const MIN = 44;
    function valid(w: number, h: number) { return w >= MIN && h >= MIN; }

    it('should accept 44x44', () => { expect(valid(44, 44)).toBe(true); });
    it('should reject 32x32', () => { expect(valid(32, 32)).toBe(false); });
    it('should accept 60x44', () => { expect(valid(60, 44)).toBe(true); });
  });
});
