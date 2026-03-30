import { describe, it, expect } from 'vitest';

// 响应式布局引擎 v2
type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface ResponsiveConfig {
  breakpoint: Breakpoint;
  columns: number;
  gap: number;
  padding: number;
  fontSize: { base: number; heading: number };
}

const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536,
};

const CONFIGS: Record<Breakpoint, ResponsiveConfig> = {
  xs: { breakpoint: 'xs', columns: 1, gap: 8, padding: 12, fontSize: { base: 12, heading: 16 } },
  sm: { breakpoint: 'sm', columns: 2, gap: 12, padding: 16, fontSize: { base: 13, heading: 18 } },
  md: { breakpoint: 'md', columns: 3, gap: 16, padding: 20, fontSize: { base: 14, heading: 20 } },
  lg: { breakpoint: 'lg', columns: 4, gap: 20, padding: 24, fontSize: { base: 14, heading: 22 } },
  xl: { breakpoint: 'xl', columns: 4, gap: 24, padding: 32, fontSize: { base: 15, heading: 24 } },
  '2xl': { breakpoint: '2xl', columns: 6, gap: 24, padding: 40, fontSize: { base: 16, heading: 28 } },
};

function getBreakpoint(width: number): Breakpoint {
  const ordered: Breakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];
  for (const bp of ordered) {
    if (width >= BREAKPOINTS[bp]) return bp;
  }
  return 'xs';
}

function getConfig(width: number): ResponsiveConfig {
  return CONFIGS[getBreakpoint(width)];
}

function calcGridItemWidth(containerWidth: number, columns: number, gap: number): number {
  return (containerWidth - gap * (columns - 1)) / columns;
}

function calcResponsiveFontSize(baseSize: number, width: number, min: number = 320, max: number = 1920): number {
  const ratio = Math.min(1, Math.max(0, (width - min) / (max - min)));
  return Math.round(baseSize + ratio * 4);
}

function generateMediaQuery(bp: Breakpoint, styles: Record<string, string>): string {
  if (bp === 'xs') {
    return Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(';');
  }
  return `@media(min-width:${BREAKPOINTS[bp]}px){${Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(';')}}`;
}

function isMobile(width: number): boolean {
  return width < BREAKPOINTS.md;
}

function isTablet(width: number): boolean {
  return width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
}

function isDesktop(width: number): boolean {
  return width >= BREAKPOINTS.lg;
}

function calcContainerMaxWidth(bp: Breakpoint): number {
  const maxes: Record<Breakpoint, number> = {
    xs: 0, sm: 640, md: 720, lg: 960, xl: 1140, '2xl': 1320,
  };
  return maxes[bp];
}

describe('响应式布局引擎 v2', () => {
  describe('断点检测', () => {
    it('320应为xs', () => { expect(getBreakpoint(320)).toBe('xs'); });
    it('768应为md', () => { expect(getBreakpoint(768)).toBe('md'); });
    it('1024应为lg', () => { expect(getBreakpoint(1024)).toBe('lg'); });
    it('1536应为2xl', () => { expect(getBreakpoint(1536)).toBe('2xl'); });
    it('1920应为2xl', () => { expect(getBreakpoint(1920)).toBe('2xl'); });
  });

  describe('配置获取', () => {
    it('移动端应为单列', () => { expect(getConfig(375).columns).toBe(1); });
    it('桌面端应为多列', () => { expect(getConfig(1440).columns).toBe(4); });
    it('移动端gap应小于桌面端', () => {
      expect(getConfig(375).gap).toBeLessThan(getConfig(1440).gap);
    });
  });

  describe('网格计算', () => {
    it('应正确计算每列宽度', () => {
      // 1000px, 4列, 20px gap
      const width = calcGridItemWidth(1000, 4, 20);
      expect(width).toBeCloseTo(235, 0);
    });

    it('单列应等于容器宽度', () => {
      expect(calcGridItemWidth(500, 1, 0)).toBe(500);
    });
  });

  describe('响应式字体', () => {
    it('小屏幕应返回较小字体', () => {
      expect(calcResponsiveFontSize(16, 320)).toBeLessThan(calcResponsiveFontSize(16, 1920));
    });

    it('大屏幕应返回较大字体', () => {
      expect(calcResponsiveFontSize(16, 1920)).toBeGreaterThan(calcResponsiveFontSize(16, 320));
    });
  });

  describe('媒体查询生成', () => {
    it('xs应生成普通样式', () => {
      const mq = generateMediaQuery('xs', { display: 'block' });
      expect(mq).toBe('display:block');
    });

    it('md应生成媒体查询', () => {
      const mq = generateMediaQuery('md', { display: 'grid' });
      expect(mq).toContain('@media');
      expect(mq).toContain('768px');
    });
  });

  describe('设备类型判断', () => {
    it('375应为移动端', () => { expect(isMobile(375)).toBe(true); });
    it('768应为平板', () => { expect(isTablet(768)).toBe(true); });
    it('1440应为桌面端', () => { expect(isDesktop(1440)).toBe(true); });
    it('移动端不应是桌面端', () => { expect(isDesktop(375)).toBe(false); });
  });

  describe('容器最大宽度', () => {
    it('应返回各断点对应的最大宽度', () => {
      expect(calcContainerMaxWidth('lg')).toBe(960);
      expect(calcContainerMaxWidth('xl')).toBe(1140);
    });

    it('xs应为0（无限制）', () => {
      expect(calcContainerMaxWidth('xs')).toBe(0);
    });
  });
});
