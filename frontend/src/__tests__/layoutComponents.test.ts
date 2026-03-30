import { describe, it, expect } from 'vitest';

// Layout Component Logic Tests
describe('Layout Component Logic', () => {
  const calculateResponsiveGrid = (
    containerWidth: number,
    itemMinWidth: number,
    gap: number
  ): { columns: number; itemWidth: number } => {
    const maxColumns = Math.floor((containerWidth + gap) / (itemMinWidth + gap));
    const columns = Math.max(1, maxColumns);
    const itemWidth = (containerWidth - gap * (columns - 1)) / columns;
    return { columns, itemWidth };
  };

  const calculateSidebarWidth = (collapsed: boolean, baseWidth: number = 240) => {
    return collapsed ? 64 : baseWidth;
  };

  const calculateContentMargin = (sidebarWidth: number, hasMargin: boolean = true) => {
    return hasMargin ? sidebarWidth : 0;
  };

  const shouldShowScrollbar = (contentHeight: number, containerHeight: number) => {
    return contentHeight > containerHeight;
  };

  const calculateStickyOffset = (headerHeight: number, toolbarHeight: number, scrolled: boolean) => {
    return scrolled ? headerHeight + toolbarHeight : 0;
  };

  it('should calculate 4 columns for 1200px with 280px min', () => {
    const result = calculateResponsiveGrid(1200, 280, 16);
    expect(result.columns).toBe(4);
    expect(result.itemWidth).toBeCloseTo(288);
  });

  it('should calculate 1 column for small container', () => {
    const result = calculateResponsiveGrid(300, 280, 16);
    expect(result.columns).toBe(1);
    expect(result.itemWidth).toBe(300);
  });

  it('should calculate 2 columns for tablet', () => {
    const result = calculateResponsiveGrid(768, 280, 16);
    expect(result.columns).toBe(2);
  });

  it('should calculate 3 columns for medium', () => {
    const result = calculateResponsiveGrid(1024, 280, 16);
    expect(result.columns).toBe(3);
  });

  it('should collapse sidebar to 64px', () => {
    expect(calculateSidebarWidth(true)).toBe(64);
    expect(calculateSidebarWidth(false)).toBe(240);
    expect(calculateSidebarWidth(false, 280)).toBe(280);
  });

  it('should calculate content margin based on sidebar', () => {
    expect(calculateContentMargin(240)).toBe(240);
    expect(calculateContentMargin(240, false)).toBe(0);
  });

  it('should show scrollbar when content overflows', () => {
    expect(shouldShowScrollbar(1200, 800)).toBe(true);
    expect(shouldShowScrollbar(600, 800)).toBe(false);
    expect(shouldShowScrollbar(800, 800)).toBe(false);
  });

  it('should calculate sticky offsets', () => {
    expect(calculateStickyOffset(64, 48, true)).toBe(112);
    expect(calculateStickyOffset(64, 48, false)).toBe(0);
  });
});

// Tab Navigation Logic Tests
describe('Tab Navigation Logic', () => {
  interface Tab {
    key: string;
    label: string;
    closable: boolean;
    content?: string;
  }

  const manageTabs = (tabs: Tab[], action: { type: string; tab?: Tab; key?: string }) => {
    switch (action.type) {
      case 'add':
        if (action.tab && !tabs.find(t => t.key === action.tab!.key)) {
          return [...tabs, action.tab];
        }
        return tabs;
      case 'remove':
        if (!action.key) return tabs;
        return tabs.filter(t => t.key !== action.key);
      case 'closeOthers':
        return tabs.filter(t => !t.closable || t.key === action.key);
      case 'closeAll':
        return tabs.filter(t => !t.closable);
      default:
        return tabs;
    }
  };

  const tabs: Tab[] = [
    { key: 'home', label: '首页', closable: false },
    { key: 'stock-600519', label: '贵州茅台', closable: true },
    { key: 'stock-000001', label: '平安银行', closable: true },
  ];

  it('should add tab', () => {
    const result = manageTabs(tabs, {
      type: 'add',
      tab: { key: 'stock-000858', label: '五粮液', closable: true },
    });
    expect(result).toHaveLength(4);
  });

  it('should not add duplicate tab', () => {
    const result = manageTabs(tabs, {
      type: 'add',
      tab: { key: 'stock-600519', label: '贵州茅台', closable: true },
    });
    expect(result).toHaveLength(3);
  });

  it('should remove tab', () => {
    const result = manageTabs(tabs, { type: 'remove', key: 'stock-600519' });
    expect(result).toHaveLength(2);
    expect(result.find(t => t.key === 'stock-600519')).toBeUndefined();
  });

  it('should close others but keep non-closable', () => {
    const result = manageTabs(tabs, { type: 'closeOthers', key: 'stock-600519' });
    expect(result).toHaveLength(2);
    expect(result.find(t => t.key === 'home')).toBeDefined();
    expect(result.find(t => t.key === 'stock-600519')).toBeDefined();
  });

  it('should close all closable tabs', () => {
    const result = manageTabs(tabs, { type: 'closeAll' });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('home');
  });
});

// Loading Skeleton Variants Tests
describe('Loading Skeleton Variants', () => {
  type SkeletonVariant = 'text' | 'circle' | 'rect' | 'chart' | 'table' | 'card';

  interface SkeletonConfig {
    variant: SkeletonVariant;
    width?: number | string;
    height?: number | string;
    lines?: number;
    animate: boolean;
  }

  const generateSkeleton = (variant: SkeletonVariant, options: Partial<SkeletonConfig> = {}): SkeletonConfig => {
    const defaults: Record<SkeletonVariant, SkeletonConfig> = {
      text: { variant: 'text', width: '100%', height: 16, lines: 3, animate: true },
      circle: { variant: 'circle', width: 48, height: 48, animate: true },
      rect: { variant: 'rect', width: '100%', height: 100, animate: true },
      chart: { variant: 'chart', width: '100%', height: 300, animate: true },
      table: { variant: 'table', width: '100%', height: 200, lines: 10, animate: true },
      card: { variant: 'card', width: 280, height: 160, animate: true },
    };

    return { ...defaults[variant], ...options };
  };

  it('should generate text skeleton with lines', () => {
    const skeleton = generateSkeleton('text');
    expect(skeleton.lines).toBe(3);
    expect(skeleton.height).toBe(16);
    expect(skeleton.animate).toBe(true);
  });

  it('should generate circle skeleton', () => {
    const skeleton = generateSkeleton('circle');
    expect(skeleton.width).toBe(48);
    expect(skeleton.height).toBe(48);
  });

  it('should generate chart skeleton', () => {
    const skeleton = generateSkeleton('chart');
    expect(skeleton.height).toBe(300);
  });

  it('should allow custom dimensions', () => {
    const skeleton = generateSkeleton('rect', { width: 200, height: 150 });
    expect(skeleton.width).toBe(200);
    expect(skeleton.height).toBe(150);
  });

  it('should support all variants', () => {
    const variants: SkeletonVariant[] = ['text', 'circle', 'rect', 'chart', 'table', 'card'];
    for (const v of variants) {
      const s = generateSkeleton(v);
      expect(s.variant).toBe(v);
      expect(s.animate).toBe(true);
    }
  });
});

// Market Session Timer Tests
describe('Market Session Timer', () => {
  const isMarketOpen = (date: Date): boolean => {
    const day = date.getDay();
    if (day === 0 || day === 6) return false; // Weekend
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const time = hours * 60 + minutes;
    // Morning: 9:30-11:30, Afternoon: 13:00-15:00
    return (time >= 9 * 60 + 30 && time < 11 * 60 + 30) ||
           (time >= 13 * 60 && time < 15 * 60);
  };

  const getMarketPhase = (date: Date): 'pre-market' | 'morning' | 'lunch-break' | 'afternoon' | 'after-market' | 'weekend' => {
    const day = date.getDay();
    if (day === 0 || day === 6) return 'weekend';
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const time = hours * 60 + minutes;
    if (time < 9 * 60 + 30) return 'pre-market';
    if (time < 11 * 60 + 30) return 'morning';
    if (time < 13 * 60) return 'lunch-break';
    if (time < 15 * 60) return 'afternoon';
    return 'after-market';
  };

  const getTimeUntilOpen = (date: Date): number => {
    if (isMarketOpen(date)) return 0;
    const day = date.getDay();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const time = hours * 60 + minutes;
    const openTime = 9 * 60 + 30;

    if (day >= 1 && day <= 5 && time < openTime) {
      return (openTime - time) * 60 * 1000;
    }
    // After market or weekend - next day
    let daysToAdd = 1;
    if (day === 5) daysToAdd = 3;
    if (day === 6) daysToAdd = 2;
    return daysToAdd * 24 * 60 * 60 * 1000;
  };

  it('should detect market open on weekday morning', () => {
    const date = new Date('2026-03-24T10:00:00'); // Tuesday 10:00
    expect(isMarketOpen(date)).toBe(true);
    expect(getMarketPhase(date)).toBe('morning');
  });

  it('should detect market open on weekday afternoon', () => {
    const date = new Date('2026-03-24T14:00:00');
    expect(isMarketOpen(date)).toBe(true);
    expect(getMarketPhase(date)).toBe('afternoon');
  });

  it('should detect market closed on weekend', () => {
    const date = new Date('2026-03-28T10:00:00'); // Saturday
    expect(isMarketOpen(date)).toBe(false);
    expect(getMarketPhase(date)).toBe('weekend');
  });

  it('should detect lunch break', () => {
    const date = new Date('2026-03-24T12:00:00');
    expect(isMarketOpen(date)).toBe(false);
    expect(getMarketPhase(date)).toBe('lunch-break');
  });

  it('should detect pre-market', () => {
    const date = new Date('2026-03-24T09:00:00');
    expect(getMarketPhase(date)).toBe('pre-market');
  });

  it('should detect after-market', () => {
    const date = new Date('2026-03-24T16:00:00');
    expect(getMarketPhase(date)).toBe('after-market');
  });

  it('should return 0 when market is open', () => {
    const date = new Date('2026-03-24T10:00:00');
    expect(getTimeUntilOpen(date)).toBe(0);
  });

  it('should calculate time until opening', () => {
    const date = new Date('2026-03-24T09:00:00');
    const ms = getTimeUntilOpen(date);
    expect(ms).toBe(30 * 60 * 1000); // 30 minutes
  });
});

// Export Data Format Tests
describe('Export Data Formats', () => {
  const toCSV = (data: Record<string, any>[], columns: string[]): string => {
    const header = columns.join(',');
    const rows = data.map(row =>
      columns.map(col => {
        const val = row[col];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val ?? '');
      }).join(',')
    );
    return [header, ...rows].join('\n');
  };

  const toTSV = (data: Record<string, any>[], columns: string[]): string => {
    const header = columns.join('\t');
    const rows = data.map(row => columns.map(col => String(row[col] ?? '')).join('\t'));
    return [header, ...rows].join('\n');
  };

  const toMarkdown = (data: Record<string, any>[], columns: string[]): string => {
    const header = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const rows = data.map(row => `| ${columns.map(col => String(row[col] ?? '')).join(' | ')} |`);
    return [header, separator, ...rows].join('\n');
  };

  const data = [
    { code: '600519', name: '贵州茅台', price: 1800 },
    { code: '000001', name: '平安银行', price: 12.5 },
  ];

  it('should generate valid CSV', () => {
    const csv = toCSV(data, ['code', 'name', 'price']);
    expect(csv).toContain('code,name,price');
    expect(csv).toContain('600519,贵州茅台,1800');
  });

  it('should escape CSV values with commas', () => {
    const csv = toCSV([{ name: 'Test, Inc.' }], ['name']);
    expect(csv).toContain('"Test, Inc."');
  });

  it('should escape CSV values with quotes', () => {
    const csv = toCSV([{ name: 'Say "Hello"' }], ['name']);
    expect(csv).toContain('"Say ""Hello"""');
  });

  it('should generate TSV', () => {
    const tsv = toTSV(data, ['code', 'name']);
    expect(tsv).toContain('code\tname');
    expect(tsv).toContain('600519\t贵州茅台');
  });

  it('should generate markdown table', () => {
    const md = toMarkdown(data, ['code', 'name', 'price']);
    expect(md).toContain('| code | name | price |');
    expect(md).toContain('| --- | --- | --- |');
    expect(md).toContain('| 600519 | 贵州茅台 | 1800 |');
  });

  it('should handle null values', () => {
    const csv = toCSV([{ name: null, price: 0 }], ['name', 'price']);
    expect(csv).toContain(',0');
  });
});
