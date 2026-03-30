import { describe, it, expect } from 'vitest';

/**
 * 响应式布局工具测试
 * 测试断点系统、媒体查询、自适应计算
 */
describe('Responsive Layout Utils', () => {
  describe('Breakpoint System', () => {
    const breakpoints = {
      xs: 0,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200,
      xxl: 1600,
    };

    function getBreakpoint(width: number): string {
      if (width >= breakpoints.xxl) return 'xxl';
      if (width >= breakpoints.xl) return 'xl';
      if (width >= breakpoints.lg) return 'lg';
      if (width >= breakpoints.md) return 'md';
      if (width >= breakpoints.sm) return 'sm';
      return 'xs';
    }

    function isMobile(width: number): boolean {
      return width < breakpoints.md;
    }

    function isTablet(width: number): boolean {
      return width >= breakpoints.md && width < breakpoints.lg;
    }

    function isDesktop(width: number): boolean {
      return width >= breakpoints.lg;
    }

    it('should detect mobile breakpoint', () => {
      expect(getBreakpoint(375)).toBe('xs');
      expect(getBreakpoint(500)).toBe('xs');
      expect(isMobile(375)).toBe(true);
      expect(isMobile(768)).toBe(false);
    });

    it('should detect tablet breakpoint', () => {
      expect(getBreakpoint(768)).toBe('md');
      expect(getBreakpoint(800)).toBe('md');
      expect(isTablet(800)).toBe(true);
      expect(isTablet(1024)).toBe(false);
    });

    it('should detect desktop breakpoint', () => {
      expect(getBreakpoint(1200)).toBe('xl');
      expect(getBreakpoint(1920)).toBe('xxl');
      expect(isDesktop(1200)).toBe(true);
      expect(isDesktop(800)).toBe(false);
    });

    it('should handle exact breakpoint values', () => {
      expect(getBreakpoint(576)).toBe('sm');
      expect(getBreakpoint(768)).toBe('md');
      expect(getBreakpoint(992)).toBe('lg');
    });
  });

  describe('Grid Column Calculation', () => {
    function getGridCols(breakpoint: string): { sidebar: number; content: number } {
      const grids: Record<string, { sidebar: number; content: number }> = {
        xs: { sidebar: 0, content: 24 },
        sm: { sidebar: 0, content: 24 },
        md: { sidebar: 6, content: 18 },
        lg: { sidebar: 5, content: 19 },
        xl: { sidebar: 4, content: 20 },
        xxl: { sidebar: 3, content: 21 },
      };
      return grids[breakpoint] || grids.md;
    }

    it('should hide sidebar on mobile', () => {
      const { sidebar } = getGridCols('xs');
      expect(sidebar).toBe(0);
    });

    it('should show sidebar on larger screens', () => {
      const { sidebar } = getGridCols('lg');
      expect(sidebar).toBeGreaterThan(0);
    });

    it('should always sum to 24', () => {
      ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'].forEach(bp => {
        const { sidebar, content } = getGridCols(bp);
        expect(sidebar + content).toBe(24);
      });
    });
  });

  describe('Responsive Font Sizes', () => {
    function getFontSize(base: number, breakpoint: string): number {
      const multipliers: Record<string, number> = {
        xs: 0.85,
        sm: 0.9,
        md: 1,
        lg: 1,
        xl: 1.05,
        xxl: 1.1,
      };
      return Math.round(base * (multipliers[breakpoint] || 1));
    }

    it('should scale down on mobile', () => {
      expect(getFontSize(16, 'xs')).toBeLessThan(16);
    });

    it('should scale up on large screens', () => {
      expect(getFontSize(16, 'xxl')).toBeGreaterThan(16);
    });

    it('should not scale at md', () => {
      expect(getFontSize(16, 'md')).toBe(16);
    });
  });

  describe('Container Width', () => {
    function getContainerWidth(breakpoint: string): number | string {
      const widths: Record<string, number | string> = {
        xs: '100%',
        sm: '100%',
        md: 720,
        lg: 960,
        xl: 1140,
        xxl: 1320,
      };
      return widths[breakpoint] || '100%';
    }

    it('should use fluid width on mobile', () => {
      expect(getContainerWidth('xs')).toBe('100%');
    });

    it('should use fixed width on desktop', () => {
      expect(getContainerWidth('xl')).toBe(1140);
    });
  });

  describe('Responsive Table Columns', () => {
    interface Column {
      key: string;
      label: string;
      priority: number; // 1=always, 2=tablet+, 3=desktop+
    }

    function getVisibleColumns(columns: Column[], breakpoint: string): Column[] {
      const minPriority = breakpoint === 'xs' ? 1 : breakpoint === 'md' ? 2 : 3;
      return columns.filter(c => {
        if (breakpoint === 'xs') return c.priority === 1;
        if (breakpoint === 'md') return c.priority <= 2;
        return true;
      });
    }

    const columns: Column[] = [
      { key: 'symbol', label: '代码', priority: 1 },
      { key: 'name', label: '名称', priority: 1 },
      { key: 'price', label: '最新价', priority: 1 },
      { key: 'change', label: '涨跌幅', priority: 1 },
      { key: 'volume', label: '成交量', priority: 2 },
      { key: 'turnover', label: '成交额', priority: 2 },
      { key: 'pe', label: '市盈率', priority: 3 },
      { key: 'pb', label: '市净率', priority: 3 },
    ];

    it('should show only priority 1 on mobile', () => {
      const visible = getVisibleColumns(columns, 'xs');
      expect(visible.length).toBe(4);
      visible.forEach(c => expect(c.priority).toBe(1));
    });

    it('should show priority 1-2 on tablet', () => {
      const visible = getVisibleColumns(columns, 'md');
      expect(visible.length).toBe(6);
    });

    it('should show all on desktop', () => {
      const visible = getVisibleColumns(columns, 'xl');
      expect(visible.length).toBe(8);
    });
  });

  describe('Responsive Image Sizes', () => {
    function getOptimalImageSize(containerWidth: number): number {
      if (containerWidth <= 400) return 400;
      if (containerWidth <= 800) return 800;
      if (containerWidth <= 1200) return 1200;
      return 1600;
    }

    it('should return correct image size', () => {
      expect(getOptimalImageSize(300)).toBe(400);
      expect(getOptimalImageSize(600)).toBe(800);
      expect(getOptimalImageSize(1000)).toBe(1200);
      expect(getOptimalImageSize(1920)).toBe(1600);
    });
  });
});
