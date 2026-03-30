import { describe, it, expect } from 'vitest';

describe('Responsive Layout Proper', () => {
  describe('Breakpoint Detection', () => {
    const breakpoints = {
      mobile: 480,
      tablet: 768,
      laptop: 1024,
      desktop: 1280,
      wide: 1600,
    };

    function getBreakpoint(width: number): string {
      if (width <= breakpoints.mobile) return 'mobile';
      if (width <= breakpoints.tablet) return 'tablet';
      if (width <= breakpoints.laptop) return 'laptop';
      if (width <= breakpoints.desktop) return 'desktop';
      return 'wide';
    }

    function getColumnCount(width: number): number {
      const bp = getBreakpoint(width);
      switch (bp) {
        case 'mobile': return 1;
        case 'tablet': return 2;
        case 'laptop': return 3;
        case 'desktop': return 4;
        default: return 4;
      }
    }

    function getSidebarVisible(width: number): boolean {
      return width > breakpoints.tablet;
    }

    function getFontSize(width: number): number {
      const bp = getBreakpoint(width);
      switch (bp) {
        case 'mobile': return 12;
        case 'tablet': return 13;
        default: return 14;
      }
    }

    it('should detect mobile breakpoint', () => {
      expect(getBreakpoint(320)).toBe('mobile');
      expect(getBreakpoint(480)).toBe('mobile');
    });

    it('should detect tablet breakpoint', () => {
      expect(getBreakpoint(600)).toBe('tablet');
      expect(getBreakpoint(768)).toBe('tablet');
    });

    it('should detect laptop breakpoint', () => {
      expect(getBreakpoint(900)).toBe('laptop');
      expect(getBreakpoint(1024)).toBe('laptop');
    });

    it('should detect desktop breakpoint', () => {
      expect(getBreakpoint(1200)).toBe('desktop');
      expect(getBreakpoint(1280)).toBe('desktop');
    });

    it('should detect wide breakpoint', () => {
      expect(getBreakpoint(1920)).toBe('wide');
    });

    it('should return 1 column on mobile', () => {
      expect(getColumnCount(375)).toBe(1);
    });

    it('should return 2 columns on tablet', () => {
      expect(getColumnCount(600)).toBe(2);
    });

    it('should return 4 columns on desktop', () => {
      expect(getColumnCount(1440)).toBe(4);
    });

    it('should hide sidebar on mobile', () => {
      expect(getSidebarVisible(375)).toBe(false);
    });

    it('should show sidebar on desktop', () => {
      expect(getSidebarVisible(1024)).toBe(true);
    });

    it('should use smaller font on mobile', () => {
      expect(getFontSize(375)).toBe(12);
    });

    it('should use larger font on desktop', () => {
      expect(getFontSize(1440)).toBe(14);
    });
  });

  describe('Table Responsiveness', () => {
    interface Column { key: string; label: string; priority: number; minWidth: number; }

    function getVisibleColumns(columns: Column[], containerWidth: number): Column[] {
      const sorted = [...columns].sort((a, b) => b.priority - a.priority);
      const result: Column[] = [];
      let usedWidth = 0;
      for (const col of sorted) {
        if (usedWidth + col.minWidth <= containerWidth) {
          result.push(col);
          usedWidth += col.minWidth;
        }
      }
      return result.sort((a, b) => columns.indexOf(a) - columns.indexOf(b));
    }

    it('should show all columns when space allows', () => {
      const cols: Column[] = [
        { key: 'name', label: '名称', priority: 10, minWidth: 100 },
        { key: 'price', label: '价格', priority: 9, minWidth: 80 },
        { key: 'change', label: '涨跌', priority: 8, minWidth: 80 },
      ];
      expect(getVisibleColumns(cols, 500).length).toBe(3);
    });

    it('should hide low priority columns when space is limited', () => {
      const cols: Column[] = [
        { key: 'name', label: '名称', priority: 10, minWidth: 100 },
        { key: 'price', label: '价格', priority: 9, minWidth: 80 },
        { key: 'change', label: '涨跌', priority: 8, minWidth: 80 },
        { key: 'volume', label: '成交量', priority: 5, minWidth: 100 },
        { key: 'turnover', label: '成交额', priority: 4, minWidth: 100 },
      ];
      const visible = getVisibleColumns(cols, 300);
      expect(visible.length).toBeLessThan(5);
      expect(visible.some(c => c.key === 'name')).toBe(true);
    });

    it('should handle empty columns', () => {
      expect(getVisibleColumns([], 500)).toEqual([]);
    });

    it('should handle very narrow container', () => {
      const cols: Column[] = [
        { key: 'name', label: '名称', priority: 10, minWidth: 100 },
        { key: 'price', label: '价格', priority: 9, minWidth: 80 },
      ];
      const visible = getVisibleColumns(cols, 50);
      expect(visible.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Grid Layout Calculation', () => {
    function calculateGrid(items: number, containerWidth: number, minItemWidth: number): { columns: number; rows: number } {
      const columns = Math.max(1, Math.floor(containerWidth / minItemWidth));
      const rows = Math.ceil(items / columns);
      return { columns, rows };
    }

    it('should calculate grid for wide container', () => {
      const grid = calculateGrid(10, 1200, 300);
      expect(grid.columns).toBe(4);
      expect(grid.rows).toBe(3);
    });

    it('should calculate grid for narrow container', () => {
      const grid = calculateGrid(10, 350, 300);
      expect(grid.columns).toBe(1);
      expect(grid.rows).toBe(10);
    });

    it('should handle exact fit', () => {
      const grid = calculateGrid(4, 1200, 300);
      expect(grid.columns).toBe(4);
      expect(grid.rows).toBe(1);
    });

    it('should handle empty items', () => {
      const grid = calculateGrid(0, 1200, 300);
      expect(grid.rows).toBe(0);
    });

    it('should handle single item', () => {
      const grid = calculateGrid(1, 1200, 300);
      expect(grid.columns).toBe(4);
      expect(grid.rows).toBe(1);
    });
  });

  describe('Content Adaptation', () => {
    function shouldShowFullContent(width: number, contentType: 'chart' | 'table' | 'card'): boolean {
      if (contentType === 'chart') return width > 600;
      if (contentType === 'table') return width > 480;
      return true;
    }

    function getChartHeight(width: number): number {
      if (width <= 480) return 200;
      if (width <= 768) return 300;
      return 400;
    }

    it('should show full chart on desktop', () => {
      expect(shouldShowFullContent(1024, 'chart')).toBe(true);
    });

    it('should hide full chart on mobile', () => {
      expect(shouldShowFullContent(375, 'chart')).toBe(false);
    });

    it('should show full table on tablet+', () => {
      expect(shouldShowFullContent(768, 'table')).toBe(true);
    });

    it('should always show cards', () => {
      expect(shouldShowFullContent(320, 'card')).toBe(true);
    });

    it('should use shorter chart on mobile', () => {
      expect(getChartHeight(375)).toBe(200);
    });

    it('should use taller chart on desktop', () => {
      expect(getChartHeight(1440)).toBe(400);
    });
  });
});
