import { describe, it, expect } from 'vitest';

// Dashboard widget system
describe('Dashboard Widget System', () => {
  interface Widget {
    id: string; type: string; title: string;
    x: number; y: number; w: number; h: number;
    config: Record<string, any>;
  }

  const validateLayout = (widgets: Widget[], maxW = 12, maxH = 24) => {
    const errors: string[] = [];
    const positions = new Set<string>();

    for (const w of widgets) {
      if (w.x < 0 || w.y < 0) errors.push(`${w.id}: negative position`);
      if (w.w <= 0 || w.h <= 0) errors.push(`${w.id}: invalid size`);
      if (w.x + w.w > maxW) errors.push(`${w.id}: exceeds width`);
      if (w.y + w.h > maxH) errors.push(`${w.id}: exceeds height`);

      for (let x = w.x; x < w.x + w.w; x++) {
        for (let y = w.y; y < w.y + w.h; y++) {
          const key = `${x},${y}`;
          if (positions.has(key)) errors.push(`${w.id}: overlaps at ${key}`);
          positions.add(key);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  };

  const compressLayout = (widgets: Widget[]) => {
    const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
    const result: Widget[] = [];
    for (const w of sorted) {
      let newY = 0;
      for (const placed of result) {
        if (placed.x < w.x + w.w && placed.x + placed.w > w.x) {
          newY = Math.max(newY, placed.y + placed.h);
        }
      }
      result.push({ ...w, y: newY });
    }
    return result;
  };

  const getWidgetStats = (widgets: Widget[]) => {
    const byType = new Map<string, number>();
    let totalCells = 0;
    for (const w of widgets) {
      byType.set(w.type, (byType.get(w.type) || 0) + 1);
      totalCells += w.w * w.h;
    }
    return {
      total: widgets.length,
      totalCells,
      typeDistribution: Object.fromEntries(byType),
      avgSize: widgets.length > 0 ? totalCells / widgets.length : 0,
    };
  };

  const mockWidgets: Widget[] = [
    { id: 'w1', type: 'chart', title: 'K线图', x: 0, y: 0, w: 6, h: 4, config: { symbol: '600519' } },
    { id: 'w2', type: 'table', title: '自选股', x: 6, y: 0, w: 6, h: 4, config: {} },
    { id: 'w3', type: 'stat', title: '涨跌比', x: 0, y: 4, w: 3, h: 2, config: {} },
    { id: 'w4', type: 'chart', title: '资金流向', x: 3, y: 4, w: 9, h: 4, config: {} },
  ];

  it('should validate valid layout', () => {
    const result = validateLayout(mockWidgets);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect negative position', () => {
    const bad: Widget[] = [{ id: 'w1', type: 'chart', title: 'Test', x: -1, y: 0, w: 3, h: 3, config: {} }];
    const result = validateLayout(bad);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('negative position');
  });

  it('should detect invalid size', () => {
    const bad: Widget[] = [{ id: 'w1', type: 'chart', title: 'Test', x: 0, y: 0, w: 0, h: 3, config: {} }];
    const result = validateLayout(bad);
    expect(result.valid).toBe(false);
  });

  it('should detect overflow', () => {
    const bad: Widget[] = [{ id: 'w1', type: 'chart', title: 'Test', x: 10, y: 0, w: 5, h: 3, config: {} }];
    const result = validateLayout(bad, 12);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds width');
  });

  it('should detect overlap', () => {
    const bad: Widget[] = [
      { id: 'w1', type: 'chart', title: 'A', x: 0, y: 0, w: 6, h: 4, config: {} },
      { id: 'w2', type: 'table', title: 'B', x: 3, y: 2, w: 6, h: 4, config: {} },
    ];
    const result = validateLayout(bad);
    expect(result.valid).toBe(false);
  });

  it('should compress layout', () => {
    const widgets: Widget[] = [
      { id: 'w1', type: 'chart', title: 'A', x: 0, y: 5, w: 3, h: 2, config: {} },
      { id: 'w2', type: 'table', title: 'B', x: 0, y: 0, w: 3, h: 2, config: {} },
    ];
    const compressed = compressLayout(widgets);
    expect(compressed[1].y).toBe(2);
  });

  it('should get widget stats', () => {
    const stats = getWidgetStats(mockWidgets);
    expect(stats.total).toBe(4);
    expect(stats.totalCells).toBe(24 + 24 + 6 + 36);
    expect(stats.typeDistribution['chart']).toBe(2);
  });

  it('should handle empty widgets', () => {
    expect(validateLayout([]).valid).toBe(true);
    expect(compressLayout([])).toEqual([]);
    expect(getWidgetStats([]).total).toBe(0);
  });

  it('should calculate average size', () => {
    const stats = getWidgetStats(mockWidgets);
    expect(stats.avgSize).toBeGreaterThan(0);
  });

  it('should handle single widget', () => {
    const result = validateLayout([mockWidgets[0]]);
    expect(result.valid).toBe(true);
  });

  it('should handle widgets touching edges', () => {
    const widgets: Widget[] = [
      { id: 'w1', type: 'chart', title: 'A', x: 0, y: 0, w: 6, h: 3, config: {} },
      { id: 'w2', type: 'table', title: 'B', x: 6, y: 0, w: 6, h: 3, config: {} },
    ];
    const result = validateLayout(widgets);
    expect(result.valid).toBe(true);
  });

  it('should handle vertical stacking', () => {
    const widgets: Widget[] = [
      { id: 'w1', type: 'chart', title: 'A', x: 0, y: 0, w: 6, h: 3, config: {} },
      { id: 'w2', type: 'table', title: 'B', x: 0, y: 3, w: 6, h: 3, config: {} },
    ];
    const result = validateLayout(widgets);
    expect(result.valid).toBe(true);
  });
});

// Notification badge logic
describe('Notification Badge Logic', () => {
  interface Notification {
    id: string; type: 'alert' | 'news' | 'system' | 'trade';
    read: boolean; priority: 'low' | 'medium' | 'high' | 'critical';
    timestamp: number;
  }

  const processNotifications = (notifications: Notification[]) => {
    const unread = notifications.filter(n => !n.read);
    const byType = new Map<string, Notification[]>();
    const byPriority = new Map<string, Notification[]>();

    for (const n of notifications) {
      if (!byType.has(n.type)) byType.set(n.type, []);
      byType.get(n.type)!.push(n);
      if (!byPriority.has(n.priority)) byPriority.set(n.priority, []);
      byPriority.get(n.priority)!.push(n);
    }

    const unreadByType = new Map<string, number>();
    for (const n of unread) {
      unreadByType.set(n.type, (unreadByType.get(n.type) || 0) + 1);
    }

    const hasCritical = unread.some(n => n.priority === 'critical');
    const sorted = [...notifications].sort((a, b) => {
      const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
      return b.timestamp - a.timestamp;
    });

    return {
      total: notifications.length,
      unreadCount: unread.length,
      readCount: notifications.length - unread.length,
      byType: Object.fromEntries([...byType].map(([k, v]) => [k, v.length])),
      unreadByType: Object.fromEntries(unreadByType),
      hasCritical,
      sorted: sorted.slice(0, 10),
    };
  };

  const markAsRead = (notifications: Notification[], ids: string[]) => {
    const idSet = new Set(ids);
    return notifications.map(n => idSet.has(n.id) ? { ...n, read: true } : n);
  };

  const markAllRead = (notifications: Notification[], type?: string) => {
    return notifications.map(n =>
      (!type || n.type === type) ? { ...n, read: true } : n
    );
  };

  const mockNotifications: Notification[] = [
    { id: '1', type: 'alert', read: false, priority: 'critical', timestamp: 100 },
    { id: '2', type: 'news', read: false, priority: 'medium', timestamp: 90 },
    { id: '3', type: 'alert', read: true, priority: 'low', timestamp: 80 },
    { id: '4', type: 'system', read: false, priority: 'high', timestamp: 95 },
    { id: '5', type: 'trade', read: false, priority: 'medium', timestamp: 85 },
  ];

  it('should count unread', () => {
    const result = processNotifications(mockNotifications);
    expect(result.unreadCount).toBe(4);
    expect(result.readCount).toBe(1);
  });

  it('should count by type', () => {
    const result = processNotifications(mockNotifications);
    expect(result.byType['alert']).toBe(2);
    expect(result.byType['news']).toBe(1);
  });

  it('should count unread by type', () => {
    const result = processNotifications(mockNotifications);
    expect(result.unreadByType['alert']).toBe(1);
  });

  it('should detect critical unread', () => {
    const result = processNotifications(mockNotifications);
    expect(result.hasCritical).toBe(true);
  });

  it('should sort by priority then time', () => {
    const result = processNotifications(mockNotifications);
    expect(result.sorted[0].priority).toBe('critical');
  });

  it('should mark specific as read', () => {
    const result = markAsRead(mockNotifications, ['1', '2']);
    expect(result.find(n => n.id === '1')!.read).toBe(true);
    expect(result.find(n => n.id === '2')!.read).toBe(true);
    expect(result.find(n => n.id === '4')!.read).toBe(false);
  });

  it('should mark all as read', () => {
    const result = markAllRead(mockNotifications);
    expect(result.every(n => n.read)).toBe(true);
  });

  it('should mark all by type', () => {
    const result = markAllRead(mockNotifications, 'alert');
    expect(result.filter(n => n.type === 'alert').every(n => n.read)).toBe(true);
    expect(result.find(n => n.id === '2')!.read).toBe(false);
  });

  it('should handle empty notifications', () => {
    const result = processNotifications([]);
    expect(result.total).toBe(0);
    expect(result.unreadCount).toBe(0);
    expect(result.hasCritical).toBe(false);
  });

  it('should handle all read', () => {
    const allRead = mockNotifications.map(n => ({ ...n, read: true }));
    const result = processNotifications(allRead);
    expect(result.unreadCount).toBe(0);
    expect(result.hasCritical).toBe(false);
  });

  it('should handle all critical', () => {
    const allCritical = mockNotifications.map(n => ({ ...n, priority: 'critical' as const, read: false }));
    const result = processNotifications(allCritical);
    expect(result.hasCritical).toBe(true);
  });

  it('should limit sorted to 10', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`, type: 'alert' as const, read: false,
      priority: 'medium' as const, timestamp: i
    }));
    const result = processNotifications(many);
    expect(result.sorted.length).toBeLessThanOrEqual(10);
  });

  it('should not mutate original on markAsRead', () => {
    markAsRead(mockNotifications, ['1']);
    expect(mockNotifications.find(n => n.id === '1')!.read).toBe(false);
  });

  it('should not mutate original on markAllRead', () => {
    markAllRead(mockNotifications);
    expect(mockNotifications.some(n => !n.read)).toBe(true);
  });
});

// Theme CSS variable generation
describe('Theme CSS Variables', () => {
  const generateCSSVariables = (theme: 'light' | 'dark') => {
    const light = {
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f5f5f5',
      '--bg-card': '#ffffff',
      '--text-primary': '#1a1a1a',
      '--text-secondary': '#6b7280',
      '--border-color': '#e5e7eb',
      '--up-color': '#ef4444',
      '--down-color': '#22c55e',
      '--neutral-color': '#6b7280',
      '--accent-color': '#3b82f6',
      '--shadow': '0 1px 3px rgba(0,0,0,0.1)',
    };

    const dark = {
      '--bg-primary': '#1a1a2e',
      '--bg-secondary': '#16213e',
      '--bg-card': '#0f3460',
      '--text-primary': '#e5e7eb',
      '--text-secondary': '#9ca3af',
      '--border-color': '#374151',
      '--up-color': '#ef4444',
      '--down-color': '#22c55e',
      '--neutral-color': '#9ca3af',
      '--accent-color': '#60a5fa',
      '--shadow': '0 1px 3px rgba(0,0,0,0.3)',
    };

    const vars = theme === 'light' ? light : dark;
    return Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join('\n');
  };

  const getStockColor = (change: number, theme: 'light' | 'dark') => {
    if (change > 0) return theme === 'light' ? '#ef4444' : '#f87171';
    if (change < 0) return theme === 'light' ? '#22c55e' : '#4ade80';
    return theme === 'light' ? '#6b7280' : '#9ca3af';
  };

  it('should generate light theme CSS', () => {
    const css = generateCSSVariables('light');
    expect(css).toContain('--bg-primary: #ffffff');
    expect(css).toContain('--up-color: #ef4444');
  });

  it('should generate dark theme CSS', () => {
    const css = generateCSSVariables('dark');
    expect(css).toContain('--bg-primary: #1a1a2e');
    expect(css).toContain('--bg-card: #0f3460');
  });

  it('should preserve up/down colors across themes', () => {
    const light = generateCSSVariables('light');
    const dark = generateCSSVariables('dark');
    expect(light).toContain('--up-color: #ef4444');
    expect(dark).toContain('--up-color: #ef4444');
    expect(light).toContain('--down-color: #22c55e');
    expect(dark).toContain('--down-color: #22c55e');
  });

  it('should get stock color for up', () => {
    expect(getStockColor(5, 'light')).toBe('#ef4444');
    expect(getStockColor(5, 'dark')).toBe('#f87171');
  });

  it('should get stock color for down', () => {
    expect(getStockColor(-5, 'light')).toBe('#22c55e');
    expect(getStockColor(-5, 'dark')).toBe('#4ade80');
  });

  it('should get stock color for flat', () => {
    expect(getStockColor(0, 'light')).toBe('#6b7280');
    expect(getStockColor(0, 'dark')).toBe('#9ca3af');
  });

  it('should have same variable count for both themes', () => {
    const light = generateCSSVariables('light');
    const dark = generateCSSVariables('dark');
    expect(light.split('\n').length).toBe(dark.split('\n').length);
  });

  it('should have valid CSS variable names', () => {
    const css = generateCSSVariables('light');
    const lines = css.split('\n');
    for (const line of lines) {
      const varName = line.split(':')[0].trim();
      expect(varName).toMatch(/^--[a-z-]+$/);
    }
  });

  it('should have valid CSS values', () => {
    const css = generateCSSVariables('light');
    const lines = css.split('\n');
    for (const line of lines) {
      expect(line).toMatch(/: .+;$/);
    }
  });
});

// Responsive breakpoint logic
describe('Responsive Breakpoint Logic', () => {
  const breakpoints = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 };

  const getBreakpoint = (width: number) => {
    if (width >= breakpoints.xxl) return 'xxl';
    if (width >= breakpoints.xl) return 'xl';
    if (width >= breakpoints.lg) return 'lg';
    if (width >= breakpoints.md) return 'md';
    if (width >= breakpoints.sm) return 'sm';
    return 'xs';
  };

  const getColumnCount = (width: number) => {
    const bp = getBreakpoint(width);
    const cols: Record<string, number> = { xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 };
    return cols[bp];
  };

  const getSidebarWidth = (width: number, collapsed: boolean) => {
    const bp = getBreakpoint(width);
    if (bp === 'xs') return 0;
    if (bp === 'sm') return collapsed ? 0 : 200;
    return collapsed ? 64 : 240;
  };

  const getFontSize = (width: number) => {
    const bp = getBreakpoint(width);
    const sizes: Record<string, number> = { xs: 12, sm: 13, md: 14, lg: 14, xl: 15, xxl: 16 };
    return sizes[bp];
  };

  const getContentPadding = (width: number) => {
    const bp = getBreakpoint(width);
    const padding: Record<string, number> = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 };
    return padding[bp];
  };

  it('should identify xs breakpoint', () => {
    expect(getBreakpoint(320)).toBe('xs');
    expect(getBreakpoint(575)).toBe('xs');
  });

  it('should identify sm breakpoint', () => {
    expect(getBreakpoint(576)).toBe('sm');
    expect(getBreakpoint(767)).toBe('sm');
  });

  it('should identify md breakpoint', () => {
    expect(getBreakpoint(768)).toBe('md');
    expect(getBreakpoint(991)).toBe('md');
  });

  it('should identify lg breakpoint', () => {
    expect(getBreakpoint(992)).toBe('lg');
    expect(getBreakpoint(1199)).toBe('lg');
  });

  it('should identify xl breakpoint', () => {
    expect(getBreakpoint(1200)).toBe('xl');
    expect(getBreakpoint(1599)).toBe('xl');
  });

  it('should identify xxl breakpoint', () => {
    expect(getBreakpoint(1600)).toBe('xxl');
    expect(getBreakpoint(2560)).toBe('xxl');
  });

  it('should return 1 column on xs', () => {
    expect(getColumnCount(400)).toBe(1);
  });

  it('should return 4 columns on xl', () => {
    expect(getColumnCount(1400)).toBe(4);
  });

  it('should hide sidebar on xs', () => {
    expect(getSidebarWidth(400, false)).toBe(0);
  });

  it('should show sidebar on lg', () => {
    expect(getSidebarWidth(1100, false)).toBe(240);
  });

  it('should collapse sidebar', () => {
    expect(getSidebarWidth(1100, true)).toBe(64);
  });

  it('should return smaller font on xs', () => {
    expect(getFontSize(400)).toBeLessThan(getFontSize(1400));
  });

  it('should return smaller padding on xs', () => {
    expect(getContentPadding(400)).toBeLessThan(getContentPadding(1400));
  });

  it('should handle zero width', () => {
    expect(getBreakpoint(0)).toBe('xs');
    expect(getColumnCount(0)).toBe(1);
  });

  it('should handle boundary widths', () => {
    expect(getBreakpoint(576)).toBe('sm');
    expect(getBreakpoint(575)).toBe('xs');
    expect(getBreakpoint(768)).toBe('md');
    expect(getBreakpoint(767)).toBe('sm');
  });

  it('should have monotonically increasing padding', () => {
    const widths = [320, 576, 768, 992, 1200, 1600];
    const paddings = widths.map(getContentPadding);
    for (let i = 1; i < paddings.length; i++) {
      expect(paddings[i]).toBeGreaterThanOrEqual(paddings[i - 1]);
    }
  });

  it('should have monotonically increasing columns', () => {
    const widths = [320, 576, 768, 992, 1200, 1600];
    const cols = widths.map(getColumnCount);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i]).toBeGreaterThanOrEqual(cols[i - 1]);
    }
  });
});
