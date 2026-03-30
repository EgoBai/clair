import { describe, it, expect } from 'vitest';

// 布局引擎
interface Breakpoint { name: string; minWidth: number; maxWidth?: number }
interface GridConfig { columns: number; gap: number; rowGap?: number }
interface LayoutConfig { breakpoints: Breakpoint[]; grids: Record<string, GridConfig> }

class LayoutEngine {
  static getBreakpoint(width: number, breakpoints: Breakpoint[]): string {
    const sorted = [...breakpoints].sort((a, b) => b.minWidth - a.minWidth);
    for (const bp of sorted) {
      if (width >= bp.minWidth) return bp.name;
    }
    return sorted[sorted.length - 1]?.name || 'xs';
  }

  static calcGridColumns(containerWidth: number, itemMinWidth: number, gap: number = 16): number {
    if (containerWidth <= 0 || itemMinWidth <= 0) return 1;
    const cols = Math.floor((containerWidth + gap) / (itemMinWidth + gap));
    return Math.max(1, cols);
  }

  static calcGridItemWidth(containerWidth: number, columns: number, gap: number = 16): number {
    if (columns <= 0) return containerWidth;
    return (containerWidth - gap * (columns - 1)) / columns;
  }

  static generateGridStyles(config: GridConfig): Record<string, string> {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${config.columns}, 1fr)`,
      gap: `${config.rowGap || config.gap}px ${config.gap}px`,
    };
  }

  static calcResponsiveColumns(width: number, config: LayoutConfig): number {
    const bp = this.getBreakpoint(width, config.breakpoints);
    return config.grids[bp]?.columns || config.grids['default']?.columns || 1;
  }

  static calcAspectRatio(width: number, height: number): string {
    if (height === 0) return '16:9';
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
  }

  static calcContainerQueries(containerWidth: number, queries: { maxWidth: number; className: string }[]): string[] {
    return queries.filter(q => containerWidth <= q.maxWidth).map(q => q.className);
  }

  static isMobile(width: number): boolean {
    return width < 768;
  }

  static isTablet(width: number): boolean {
    return width >= 768 && width < 1024;
  }

  static isDesktop(width: number): boolean {
    return width >= 1024;
  }

  static calcSidebarWidth(totalWidth: number, collapsed: boolean): number {
    if (this.isMobile(totalWidth)) return 0;
    if (collapsed) return 64;
    if (totalWidth < 1280) return 200;
    return 256;
  }

  static calcContentWidth(totalWidth: number, sidebarWidth: number, padding: number = 24): number {
    return Math.max(0, totalWidth - sidebarWidth - padding * 2);
  }

  static calcTableColumnWidths(containerWidth: number, columns: { key: string; minWidth: number; flex?: number }[]): Record<string, number> {
    const totalMin = columns.reduce((s, c) => s + c.minWidth, 0);
    const totalFlex = columns.reduce((s, c) => s + (c.flex || 1), 0);
    const extra = Math.max(0, containerWidth - totalMin);
    const result: Record<string, number> = {};
    for (const col of columns) {
      result[col.key] = col.minWidth + extra * ((col.flex || 1) / totalFlex);
    }
    return result;
  }

  static calcStickyHeaderOffset(hasTopBanner: boolean, hasToolbar: boolean): number {
    let offset = 0;
    if (hasTopBanner) offset += 40;
    if (hasToolbar) offset += 48;
    return offset;
  }

  static calcVisibleItems(containerHeight: number, itemHeight: number, gap: number = 0, scrollTop: number = 0): { start: number; end: number; totalVisible: number } {
    const start = Math.floor(scrollTop / (itemHeight + gap));
    const visible = Math.ceil(containerHeight / (itemHeight + gap)) + 1;
    return { start, end: start + visible, totalVisible: visible };
  }

  static calcMasonryLayout(items: number[], columns: number, gap: number = 16): { x: number; y: number; width: number; height: number }[] {
    if (columns <= 0 || items.length === 0) return [];
    const colHeights = new Array(columns).fill(0);
    const result: { x: number; y: number; width: number; height: number }[] = [];
    const itemWidth = 100 / columns;

    for (const height of items) {
      const shortestCol = colHeights.indexOf(Math.min(...colHeights));
      result.push({
        x: shortestCol * itemWidth,
        y: colHeights[shortestCol],
        width: itemWidth,
        height,
      });
      colHeights[shortestCol] += height + gap;
    }
    return result;
  }

  static calcFlexSpace(containerWidth: number, items: number[], gap: number = 16, justifyContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around' = 'start'): { offsets: number[] } {
    const totalItemsWidth = items.reduce((a, b) => a + b, 0);
    const totalGap = gap * (items.length - 1);
    const freeSpace = Math.max(0, containerWidth - totalItemsWidth - totalGap);
    const offsets: number[] = [];

    switch (justifyContent) {
      case 'start': {
        let x = 0;
        for (const w of items) { offsets.push(x); x += w + gap; }
        break;
      }
      case 'center': {
        let x = freeSpace / 2;
        for (const w of items) { offsets.push(x); x += w + gap; }
        break;
      }
      case 'end': {
        let x = freeSpace;
        for (const w of items) { offsets.push(x); x += w + gap; }
        break;
      }
      case 'space-between': {
        const sp = items.length > 1 ? freeSpace / (items.length - 1) : 0;
        let x = 0;
        for (let i = 0; i < items.length; i++) { offsets.push(x); x += items[i] + gap + sp; }
        break;
      }
      case 'space-around': {
        const sp = freeSpace / items.length;
        let x = sp / 2;
        for (const w of items) { offsets.push(x); x += w + gap + sp; }
        break;
      }
    }
    return { offsets };
  }
}

describe('布局引擎', () => {
  const breakpoints: Breakpoint[] = [
    { name: 'xs', minWidth: 0 },
    { name: 'sm', minWidth: 576 },
    { name: 'md', minWidth: 768 },
    { name: 'lg', minWidth: 992 },
    { name: 'xl', minWidth: 1200 },
  ];

  describe('断点检测', () => {
    it('应该检测xs断点', () => {
      expect(LayoutEngine.getBreakpoint(400, breakpoints)).toBe('xs');
    });
    it('应该检测md断点', () => {
      expect(LayoutEngine.getBreakpoint(800, breakpoints)).toBe('md');
    });
    it('应该检测xl断点', () => {
      expect(LayoutEngine.getBreakpoint(1400, breakpoints)).toBe('xl');
    });
    it('应该检测精确边界', () => {
      expect(LayoutEngine.getBreakpoint(768, breakpoints)).toBe('md');
    });
  });

  describe('网格计算', () => {
    it('应该计算网格列数', () => {
      expect(LayoutEngine.calcGridColumns(1000, 200, 16)).toBe(4);
    });
    it('应该保证至少1列', () => {
      expect(LayoutEngine.calcGridColumns(100, 200)).toBe(1);
    });
    it('应该计算网格项宽度', () => {
      expect(LayoutEngine.calcGridItemWidth(1000, 4, 16)).toBeCloseTo(238, 0);
    });
    it('应该生成网格样式', () => {
      const styles = LayoutEngine.generateGridStyles({ columns: 3, gap: 16 });
      expect(styles.display).toBe('grid');
      expect(styles.gridTemplateColumns).toBe('repeat(3, 1fr)');
    });
  });

  describe('宽高比', () => {
    it('应该计算16:9', () => {
      expect(LayoutEngine.calcAspectRatio(1920, 1080)).toBe('16:9');
    });
    it('应该计算4:3', () => {
      expect(LayoutEngine.calcAspectRatio(800, 600)).toBe('4:3');
    });
    it('应该计算1:1', () => {
      expect(LayoutEngine.calcAspectRatio(500, 500)).toBe('1:1');
    });
    it('应该处理零高度', () => {
      expect(LayoutEngine.calcAspectRatio(100, 0)).toBe('16:9');
    });
  });

  describe('设备判断', () => {
    it('应该判断移动端', () => {
      expect(LayoutEngine.isMobile(375)).toBe(true);
      expect(LayoutEngine.isMobile(768)).toBe(false);
    });
    it('应该判断平板', () => {
      expect(LayoutEngine.isTablet(768)).toBe(true);
      expect(LayoutEngine.isTablet(1024)).toBe(false);
    });
    it('应该判断桌面', () => {
      expect(LayoutEngine.isDesktop(1024)).toBe(true);
      expect(LayoutEngine.isDesktop(768)).toBe(false);
    });
  });

  describe('侧边栏', () => {
    it('移动端不显示侧边栏', () => {
      expect(LayoutEngine.calcSidebarWidth(375, false)).toBe(0);
    });
    it('应该计算折叠侧边栏', () => {
      expect(LayoutEngine.calcSidebarWidth(1000, true)).toBe(64);
    });
    it('应该计算展开侧边栏', () => {
      expect(LayoutEngine.calcSidebarWidth(1400, false)).toBe(256);
    });
  });

  describe('内容宽度', () => {
    it('应该计算内容宽度', () => {
      expect(LayoutEngine.calcContentWidth(1200, 256, 24)).toBe(896);
    });
    it('应该处理负宽度', () => {
      expect(LayoutEngine.calcContentWidth(100, 200, 24)).toBe(0);
    });
  });

  describe('表格列宽', () => {
    it('应该分配列宽', () => {
      const widths = LayoutEngine.calcTableColumnWidths(600, [
        { key: 'name', minWidth: 100, flex: 2 },
        { key: 'price', minWidth: 80, flex: 1 },
      ]);
      expect(widths['name']).toBeGreaterThan(100);
      expect(widths['price']).toBeGreaterThan(80);
    });
  });

  describe('吸顶偏移', () => {
    it('应该计算偏移量', () => {
      expect(LayoutEngine.calcStickyHeaderOffset(true, true)).toBe(88);
      expect(LayoutEngine.calcStickyHeaderOffset(false, false)).toBe(0);
    });
  });

  describe('虚拟列表', () => {
    it('应该计算可见项', () => {
      const vis = LayoutEngine.calcVisibleItems(500, 50, 10, 100);
      expect(vis.start).toBe(1);
      expect(vis.totalVisible).toBeGreaterThan(0);
    });
  });

  describe('瀑布流', () => {
    it('应该计算瀑布流布局', () => {
      const layout = LayoutEngine.calcMasonryLayout([100, 150, 120, 80, 200], 3);
      expect(layout).toHaveLength(5);
      layout.forEach(item => {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeGreaterThanOrEqual(0);
      });
    });

    it('应该处理空数组', () => {
      expect(LayoutEngine.calcMasonryLayout([], 3)).toHaveLength(0);
    });
  });

  describe('Flex布局', () => {
    it('应该计算start对齐', () => {
      const r = LayoutEngine.calcFlexSpace(500, [100, 100, 100], 10, 'start');
      expect(r.offsets[0]).toBe(0);
    });
    it('应该计算center对齐', () => {
      const r = LayoutEngine.calcFlexSpace(500, [100, 100], 10, 'center');
      expect(r.offsets[0]).toBeCloseTo(145, 0);
    });
    it('应该计算end对齐', () => {
      const r = LayoutEngine.calcFlexSpace(500, [100, 100], 10, 'end');
      expect(r.offsets[0]).toBe(290);
    });
  });

  describe('响应式列数', () => {
    it('应该计算响应式列数', () => {
      const config: LayoutConfig = {
        breakpoints,
        grids: { xs: { columns: 1 }, sm: { columns: 2 }, md: { columns: 3 }, lg: { columns: 4 }, default: { columns: 1 } },
      };
      expect(LayoutEngine.calcResponsiveColumns(375, config)).toBe(1);
      expect(LayoutEngine.calcResponsiveColumns(800, config)).toBe(3);
    });
  });
});
