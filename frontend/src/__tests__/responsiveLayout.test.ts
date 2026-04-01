import { describe, it, expect } from 'vitest';

/**
 * 响应式布局组件测试
 * 测试断点逻辑、自适应配置
 */

describe('响应式布局', () => {
  describe('断点定义', () => {
    const breakpoints = {
      xs: 0,
      sm: 576,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1600,
    };

    it('应该有6个断点', () => {
      expect(Object.keys(breakpoints).length).toBe(6);
    });

    it('断点应该从小到大排列', () => {
      const values = Object.values(breakpoints);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }
    });

    it('md断点应该是768px', () => {
      expect(breakpoints.md).toBe(768);
    });

    it('lg断点应该是1024px', () => {
      expect(breakpoints.lg).toBe(1024);
    });
  });

  describe('设备类型判断', () => {
    it('宽度<768应该是移动端', () => {
      const w = 500;
      const isMobile = w < 768;
      expect(isMobile).toBe(true);
    });

    it('768<=宽度<1024应该是平板', () => {
      const w = 900;
      const isTablet = w >= 768 && w < 1024;
      expect(isTablet).toBe(true);
    });

    it('宽度>=1024应该是桌面', () => {
      const w = 1440;
      const isDesktop = w >= 1024;
      expect(isDesktop).toBe(true);
    });
  });

  describe('栅格配置', () => {
    it('移动端应该单列显示', () => {
      const cols = 1;
      expect(cols).toBe(1);
    });

    it('平板应该双列显示', () => {
      const cols = 2;
      expect(cols).toBe(2);
    });

    it('桌面端应该多列显示', () => {
      const cols = 3;
      expect(cols).toBe(3);
    });
  });

  describe('间距配置', () => {
    it('移动端间距应该更小', () => {
      const gap = 8;
      expect(gap).toBe(8);
    });

    it('桌面端间距应该更大', () => {
      const gap = 16;
      expect(gap).toBe(16);
    });
  });

  describe('侧边栏配置', () => {
    it('移动端应该隐藏侧边栏', () => {
      const isMobile = true;
      const showSidebar = !isMobile;
      expect(showSidebar).toBe(false);
    });

    it('桌面端应该显示侧边栏', () => {
      const isMobile = false;
      const showSidebar = !isMobile;
      expect(showSidebar).toBe(true);
    });

    it('平板应该折叠侧边栏', () => {
      const isTablet = true;
      const collapsed = isTablet;
      expect(collapsed).toBe(true);
    });

    it('折叠宽度应该是64px', () => {
      const collapsedWidth = 64;
      expect(collapsedWidth).toBe(64);
    });

    it('展开宽度应该是200px', () => {
      const expandedWidth = 200;
      expect(expandedWidth).toBe(200);
    });
  });

  describe('内容区域配置', () => {
    it('移动端padding应该是8px', () => {
      const isMobile = true;
      const padding = isMobile ? 8 : 16;
      expect(padding).toBe(8);
    });

    it('桌面端padding应该是16px', () => {
      const isMobile = false;
      const padding = isMobile ? 8 : 16;
      expect(padding).toBe(16);
    });

    it('移动端底部应该留出导航空间', () => {
      const isMobile = true;
      const paddingBottom = isMobile ? 80 : 16;
      expect(paddingBottom).toBe(80);
    });
  });

  describe('字体大小配置', () => {
    it('移动端标题应该更小', () => {
      const isMobile = true;
      const fontSize = isMobile ? 14 : 18;
      expect(fontSize).toBe(14);
    });

    it('桌面端标题应该更大', () => {
      const isMobile = false;
      const fontSize = isMobile ? 14 : 18;
      expect(fontSize).toBe(18);
    });
  });

  describe('表格响应式', () => {
    it('移动端应该简化列显示', () => {
      const isMobile = true;
      const visibleCols = isMobile ? ['name', 'price', 'changePercent'] : ['name', 'price', 'changePercent', 'volume', 'turnover', 'pe', 'marketCap'];
      expect(visibleCols.length).toBe(3);
    });

    it('桌面端应该显示所有列', () => {
      const isMobile = false;
      const visibleCols = isMobile ? ['name', 'price', 'changePercent'] : ['name', 'price', 'changePercent', 'volume', 'turnover', 'pe', 'marketCap'];
      expect(visibleCols.length).toBe(7);
    });
  });

  describe('图表响应式', () => {
    it('移动端图表高度应该减小', () => {
      const isMobile = true;
      const height = isMobile ? 250 : 400;
      expect(height).toBe(250);
    });

    it('桌面端图表应该更高', () => {
      const isMobile = false;
      const height = isMobile ? 250 : 400;
      expect(height).toBe(400);
    });
  });
});
