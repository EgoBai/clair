import { describe, it, expect } from 'vitest';

describe('ResponsiveUtils Logic', () => {
  // 排版系统
  describe('Typography System', () => {
    const TYPOGRAPHY = {
      h1: { min: 20, max: 32, minVw: 375, maxVw: 1280 },
      h2: { min: 18, max: 28, minVw: 375, maxVw: 1280 },
      body: { min: 13, max: 15, minVw: 375, maxVw: 1280 },
      caption: { min: 11, max: 13, minVw: 375, maxVw: 1280 },
      price: { min: 16, max: 22, minVw: 375, maxVw: 1280 },
    };

    function fluidSize(cfg: { min: number; max: number; minVw: number; maxVw: number }, vw: number): number {
      if (vw <= cfg.minVw) return cfg.min;
      if (vw >= cfg.maxVw) return cfg.max;
      return cfg.min + ((cfg.max - cfg.min) * (vw - cfg.minVw)) / (cfg.maxVw - cfg.minVw);
    }

    it('should return min at smallest viewport', () => {
      expect(fluidSize(TYPOGRAPHY.h1, 375)).toBe(20);
    });

    it('should return max at largest viewport', () => {
      expect(fluidSize(TYPOGRAPHY.h1, 1280)).toBe(32);
    });

    it('should interpolate body text', () => {
      const mid = fluidSize(TYPOGRAPHY.body, 827);
      expect(mid).toBeGreaterThan(13);
      expect(mid).toBeLessThan(15);
    });
  });

  // 间距系统
  describe('Spacing System', () => {
    const SPACING = {
      xs: { min: 4, max: 8 },
      sm: { min: 8, max: 12 },
      md: { min: 12, max: 20 },
      lg: { min: 16, max: 32 },
    };

    function fluidSpace(min: number, max: number, vw: number): number {
      if (vw <= 375) return min;
      if (vw >= 1280) return max;
      return min + ((max - min) * (vw - 375)) / (1280 - 375);
    }

    it('should scale all spacing values', () => {
      Object.values(SPACING).forEach(({ min, max }) => {
        expect(fluidSpace(min, max, 375)).toBe(min);
        expect(fluidSpace(min, max, 1280)).toBe(max);
      });
    });
  });

  // 图表尺寸
  describe('Chart Sizing', () => {
    function chartSize(w: number) {
      if (w < 768) return { width: '100%', height: 240, ratio: '4:3' };
      if (w < 1024) return { width: '100%', height: 320, ratio: '16:9' };
      return { width: '100%', height: 400, ratio: '16:9' };
    }

    it('should adapt chart to screen', () => {
      expect(chartSize(375).height).toBe(240);
      expect(chartSize(800).height).toBe(320);
      expect(chartSize(1440).height).toBe(400);
    });
  });

  // 表格密度
  describe('Table Density', () => {
    function tableDensity(w: number) {
      if (w < 640) return { padding: '6px 4px', fontSize: 11 };
      if (w < 1024) return { padding: '8px 8px', fontSize: 12 };
      return { padding: '12px 16px', fontSize: 14 };
    }

    it('should compact table on mobile', () => {
      const d = tableDensity(375);
      expect(d.fontSize).toBe(11);
      expect(d.padding).toContain('6px');
    });

    it('should expand table on desktop', () => {
      const d = tableDensity(1440);
      expect(d.fontSize).toBe(14);
    });
  });

  // 卡片布局
  describe('Card Grid', () => {
    function cardGrid(w: number) {
      if (w < 640) return { cols: 1, gap: 8, cardPad: 8 };
      if (w < 768) return { cols: 1, gap: 12, cardPad: 12 };
      if (w < 1024) return { cols: 2, gap: 16, cardPad: 16 };
      if (w < 1280) return { cols: 3, gap: 16, cardPad: 16 };
      return { cols: 4, gap: 20, cardPad: 20 };
    }

    it('should be single column on mobile', () => {
      expect(cardGrid(375).cols).toBe(1);
    });

    it('should increase columns on larger screens', () => {
      expect(cardGrid(1440).cols).toBe(4);
    });
  });

  // 手势区域
  describe('Gesture Area', () => {
    function gestureConfig(w: number) {
      return {
        swipeThreshold: w < 768 ? 50 : 80,
        longPressMs: 500,
        doubleTapMs: 300,
        pinchEnabled: w < 768,
      };
    }

    it('should use smaller swipe threshold on mobile', () => {
      expect(gestureConfig(375).swipeThreshold).toBe(50);
      expect(gestureConfig(1440).swipeThreshold).toBe(80);
    });

    it('should enable pinch only on mobile', () => {
      expect(gestureConfig(375).pinchEnabled).toBe(true);
      expect(gestureConfig(1440).pinchEnabled).toBe(false);
    });
  });

  // 导航模式
  describe('Navigation Mode', () => {
    function navMode(w: number) {
      if (w < 768) return { mode: 'bottom-tabs' as const, items: 5, showLabels: true };
      if (w < 1024) return { mode: 'sidebar-collapsed' as const, items: 20, showLabels: false };
      return { mode: 'sidebar' as const, items: 20, showLabels: true };
    }

    it('should use bottom tabs on mobile', () => {
      expect(navMode(375).mode).toBe('bottom-tabs');
      expect(navMode(375).items).toBe(5);
    });

    it('should use sidebar on desktop', () => {
      expect(navMode(1440).mode).toBe('sidebar');
    });

    it('should collapse sidebar on tablet', () => {
      expect(navMode(800).mode).toBe('sidebar-collapsed');
      expect(navMode(800).showLabels).toBe(false);
    });
  });

  // 侧边栏折叠行为
  describe('Sidebar Collapse', () => {
    function sidebarState(w: number, userCollapsed: boolean) {
      if (w < 768) return { visible: false, collapsed: false, width: 0 };
      if (w < 1024) return { visible: true, collapsed: true, width: 64 };
      return { visible: true, collapsed: userCollapsed, width: userCollapsed ? 64 : 200 };
    }

    it('should hide sidebar on mobile', () => {
      expect(sidebarState(375, false).visible).toBe(false);
    });

    it('should always collapse on tablet', () => {
      expect(sidebarState(800, false).collapsed).toBe(true);
      expect(sidebarState(800, false).width).toBe(64);
    });

    it('should respect user preference on desktop', () => {
      expect(sidebarState(1440, false).width).toBe(200);
      expect(sidebarState(1440, true).width).toBe(64);
    });
  });

  // 弹窗尺寸
  describe('Modal Sizing', () => {
    function modalSize(w: number) {
      if (w < 640) return { width: '100vw', fullscreen: true };
      if (w < 1024) return { width: '80vw', fullscreen: false };
      return { width: 520, fullscreen: false };
    }

    it('should fullscreen modal on phone', () => {
      expect(modalSize(375).fullscreen).toBe(true);
    });

    it('should use fixed width on desktop', () => {
      expect(modalSize(1440).width).toBe(520);
    });
  });

  // 下拉菜单位置
  describe('Dropdown Position', () => {
    function dropdownPos(w: number, triggerX: number) {
      const menuWidth = 200;
      const spaceRight = w - triggerX;
      return spaceRight < menuWidth ? 'left' : 'right';
    }

    it('should align left when near right edge', () => {
      expect(dropdownPos(400, 350)).toBe('left');
    });

    it('should align right when enough space', () => {
      expect(dropdownPos(1440, 100)).toBe('right');
    });
  });

  // 弹性布局换行
  describe('Flex Wrap', () => {
    function flexWrap(containerW: number, itemW: number, gap: number, count: number) {
      const totalWidth = itemW * count + gap * (count - 1);
      return totalWidth > containerW ? 'wrap' : 'nowrap';
    }

    it('should wrap when items overflow', () => {
      expect(flexWrap(375, 120, 8, 5)).toBe('wrap');
    });

    it('should not wrap when items fit', () => {
      expect(flexWrap(1440, 120, 8, 5)).toBe('nowrap');
    });
  });
});
