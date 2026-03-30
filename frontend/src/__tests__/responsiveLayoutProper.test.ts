import { describe, it, expect } from 'vitest';

describe('ResponsiveLayoutProper', () => {
  // 综合响应式配置
  describe('Complete Responsive Config', () => {
    interface ResponsiveState {
      breakpoint: string;
      isMobile: boolean;
      isTablet: boolean;
      isDesktop: boolean;
      columns: number;
      sidebarVisible: boolean;
      tableScroll: boolean;
      touchFriendly: boolean;
      headerHeight: number;
      contentPadding: number;
    }

    function fullConfig(w: number): ResponsiveState {
      const isMobile = w < 768;
      const isTablet = w >= 768 && w < 1024;
      const isDesktop = w >= 1024;

      let breakpoint = 'xs';
      if (w >= 1536) breakpoint = '2xl';
      else if (w >= 1280) breakpoint = 'xl';
      else if (w >= 1024) breakpoint = 'lg';
      else if (w >= 768) breakpoint = 'md';
      else if (w >= 640) breakpoint = 'sm';

      let columns = 1;
      if (w >= 1280) columns = 4;
      else if (w >= 1024) columns = 3;
      else if (w >= 768) columns = 2;

      return {
        breakpoint,
        isMobile,
        isTablet,
        isDesktop,
        columns,
        sidebarVisible: !isMobile,
        tableScroll: isMobile,
        touchFriendly: isMobile,
        headerHeight: isMobile ? 52 : 64,
        contentPadding: isMobile ? 8 : isTablet ? 12 : 16,
      };
    }

    it('should produce correct config for iPhone SE', () => {
      const c = fullConfig(375);
      expect(c.breakpoint).toBe('xs');
      expect(c.isMobile).toBe(true);
      expect(c.columns).toBe(1);
      expect(c.sidebarVisible).toBe(false);
      expect(c.touchFriendly).toBe(true);
    });

    it('should produce correct config for iPad', () => {
      const c = fullConfig(810);
      expect(c.breakpoint).toBe('md');
      expect(c.isTablet).toBe(true);
      expect(c.columns).toBe(2);
      expect(c.sidebarVisible).toBe(true);
    });

    it('should produce correct config for MacBook', () => {
      const c = fullConfig(1440);
      expect(c.breakpoint).toBe('xl');
      expect(c.isDesktop).toBe(true);
      expect(c.columns).toBe(4);
      expect(c.tableScroll).toBe(false);
    });
  });

  // 响应式图片
  describe('Responsive Images', () => {
    function imgSrcSet(base: string, sizes: number[]) {
      return sizes.map((s) => `${base}-${s}.webp ${s}w`).join(', ');
    }

    function imgSizes(breakpoints: string[]) {
      return breakpoints.join(', ');
    }

    it('should generate srcset', () => {
      const srcset = imgSrcSet('/img/logo', [320, 640, 1024]);
      expect(srcset).toContain('320w');
      expect(srcset).toContain('640w');
      expect(srcset).toContain('1024w');
    });

    it('should generate sizes attribute', () => {
      const sizes = imgSizes(['(max-width: 768px) 100vw', '(max-width: 1200px) 50vw', '33vw']);
      expect(sizes).toContain('100vw');
    });
  });

  // 响应式表单
  describe('Responsive Forms', () => {
    function formLayout(w: number) {
      if (w < 640) return { direction: 'column' as const, labelPos: 'top' as const, inputWidth: '100%' };
      if (w < 1024) return { direction: 'row' as const, labelPos: 'left' as const, inputWidth: '60%' };
      return { direction: 'row' as const, labelPos: 'left' as const, inputWidth: '400px' };
    }

    it('should stack form on mobile', () => {
      const f = formLayout(375);
      expect(f.direction).toBe('column');
      expect(f.inputWidth).toBe('100%');
    });

    it('should use row layout on desktop', () => {
      const f = formLayout(1440);
      expect(f.direction).toBe('row');
      expect(f.inputWidth).toBe('400px');
    });
  });

  // 响应式分页
  describe('Responsive Pagination', () => {
    function paginationConfig(w: number) {
      if (w < 640) return { showTotal: false, showSizeChanger: false, simple: true, pageSize: 10 };
      if (w < 1024) return { showTotal: true, showSizeChanger: false, simple: false, pageSize: 20 };
      return { showTotal: true, showSizeChanger: true, simple: false, pageSize: 20 };
    }

    it('should use simple pagination on mobile', () => {
      expect(paginationConfig(375).simple).toBe(true);
      expect(paginationConfig(375).showTotal).toBe(false);
    });

    it('should use full pagination on desktop', () => {
      expect(paginationConfig(1440).showSizeChanger).toBe(true);
      expect(paginationConfig(1440).simple).toBe(false);
    });
  });

  // 热力图自适应
  describe('Heatmap Responsive', () => {
    function heatmapConfig(w: number) {
      if (w < 768) return { cellSize: 24, showLabels: false, cols: 8, rows: 6 };
      if (w < 1024) return { cellSize: 32, showLabels: true, cols: 12, rows: 8 };
      return { cellSize: 40, showLabels: true, cols: 16, rows: 10 };
    }

    it('should reduce heatmap complexity on mobile', () => {
      const h = heatmapConfig(375);
      expect(h.showLabels).toBe(false);
      expect(h.cellSize).toBe(24);
    });

    it('should show full heatmap on desktop', () => {
      const h = heatmapConfig(1440);
      expect(h.showLabels).toBe(true);
      expect(h.cols).toBe(16);
    });
  });

  // K线图自适应
  describe('KLine Chart Responsive', () => {
    function klineConfig(w: number) {
      if (w < 768) {
        return { width: w - 16, height: 280, showVolume: false, showMA: false, candleWidth: 4, showCrosshair: true };
      }
      if (w < 1024) {
        return { width: w - 24, height: 360, showVolume: true, showMA: true, candleWidth: 6, showCrosshair: true };
      }
      return { width: Math.min(w - 32, 1200), height: 450, showVolume: true, showMA: true, candleWidth: 8, showCrosshair: true };
    }

    it('should hide volume on mobile kline', () => {
      expect(klineConfig(375).showVolume).toBe(false);
    });

    it('should show all indicators on desktop', () => {
      const c = klineConfig(1440);
      expect(c.showVolume).toBe(true);
      expect(c.showMA).toBe(true);
      expect(c.height).toBe(450);
    });
  });

  // 列表 vs 详情布局切换
  describe('Layout Mode Switch', () => {
    function layoutMode(w: number, hasDetail: boolean) {
      if (w < 768) return hasDetail ? 'detail-full' as const : 'list-full' as const;
      if (w < 1024) return hasDetail ? 'split-7-5' as const : 'list-full' as const;
      return hasDetail ? 'split-8-4' as const : 'list-full' as const;
    }

    it('should use full detail on mobile', () => {
      expect(layoutMode(375, true)).toBe('detail-full');
    });

    it('should use split layout on tablet', () => {
      expect(layoutMode(800, true)).toBe('split-7-5');
    });

    it('should use wider split on desktop', () => {
      expect(layoutMode(1440, true)).toBe('split-8-4');
    });
  });

  // 密度切换
  describe('Density Mode', () => {
    function densityMode(w: number) {
      if (w < 640) return 'compact' as const;
      if (w < 1024) return 'normal' as const;
      return 'comfortable' as const;
    }

    it('should use compact on mobile', () => {
      expect(densityMode(375)).toBe('compact');
    });

    it('should use comfortable on desktop', () => {
      expect(densityMode(1440)).toBe('comfortable');
    });
  });

  // 主题色响应
  describe('Theme Responsive', () => {
    function themeVars(w: number, dark: boolean) {
      return {
        '--bg': dark ? '#0f0f23' : '#f5f5f5',
        '--surface': dark ? '#16213e' : '#fff',
        '--text': dark ? '#e0e0e0' : '#111827',
        '--card-shadow': w < 768 ? 'none' : '0 2px 8px rgba(0,0,0,0.1)',
        '--border-radius': w < 768 ? '8px' : '12px',
      };
    }

    it('should generate correct light vars', () => {
      const v = themeVars(1440, false);
      expect(v['--bg']).toBe('#f5f5f5');
    });

    it('should generate correct dark vars', () => {
      const v = themeVars(1440, true);
      expect(v['--bg']).toBe('#0f0f23');
    });

    it('should remove shadow on mobile', () => {
      expect(themeVars(375, false)['--card-shadow']).toBe('none');
    });
  });
});
