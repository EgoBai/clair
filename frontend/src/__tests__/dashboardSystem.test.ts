/**
 * M2 影子治理批次 40a：看板系统测试 → 生产实现绑定
 *
 * 绑定清单（import 处已标注生产 file:line）：
 * - frontend/src/utils/dashboardLayoutEngine.ts:49 validateLayout —— 布局校验唯一导出实现
 * - frontend/src/utils/dashboardLayoutEngine.ts:92 checkOverlap —— 边贴边不算重叠的严格判定
 * - frontend/src/utils/dashboardLayoutEngine.ts:150 autoArrange —— 替代自抄 compressLayout
 * - frontend/src/utils/dashboardLayoutEngine.ts:257 getLayoutStats —— totalWidgets/gridUtilization/byType
 * - frontend/src/utils/customThemes.ts:61 PRESET_THEMES + :193 themeToCssVars + :172 getThemeById
 * - frontend/src/utils/responsiveUtils.ts:8 BREAKPOINTS + :58 getCurrentBreakpoint
 *   + :99 getGridConfig（栅格预设 GRID_PRESETS:27）
 * - frontend/src/services/notificationService.ts:6/:17 仅绑定类型（该模块无计数/排序纯函数导出）
 *
 * 未绑定（生产无同契约导出，保留内联并在段首注明原因）：
 * 通知未读计数与优先级排序、主题涨跌色取值适配、侧边栏宽度、按断点的像素字号。
 */
import { describe, it, expect } from 'vitest';
import {
  validateLayout,
  checkOverlap,
  autoArrange,
  getLayoutStats,
} from '../utils/dashboardLayoutEngine';
import type { DashboardLayout, DashboardWidget, WidgetType } from '../utils/dashboardLayoutEngine';
import { PRESET_THEMES, getThemeById, themeToCssVars } from '../utils/customThemes';
import {
  BREAKPOINTS,
  getAdaptiveConfig,
  getCurrentBreakpoint,
  getGridConfig,
} from '../utils/responsiveUtils';
import type { NotificationPriority, NotificationType } from '../services/notificationService';

// Dashboard widget system
describe('Dashboard Widget System', () => {
  const FIXED_TS = 1700000000000;

  // 生产 DashboardWidget 的位置在 position 对象里；旧内联 Widget 是扁平 x/y/w/h 且类型含 'stat'，
  // 后者不在生产 WidgetType 枚举中，故改用 'gauge'。
  const makeWidget = (
    id: string,
    type: WidgetType,
    x: number,
    y: number,
    w: number,
    h: number,
    overrides: Partial<DashboardWidget> = {}
  ): DashboardWidget => ({
    id, type, title: id,
    position: { x, y, w, h },
    config: {},
    visible: true,
    locked: false,
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
    ...overrides,
  });

  const makeLayout = (widgets: DashboardWidget[], columns = 12): DashboardLayout => ({
    id: 'layout-1', name: '测试布局', columns, rowHeight: 100, gap: 16,
    widgets, isDefault: false, createdAt: FIXED_TS, updatedAt: FIXED_TS,
  });

  const mockWidgets: DashboardWidget[] = [
    makeWidget('w1', 'chart', 0, 0, 6, 4),
    makeWidget('w2', 'table', 6, 0, 6, 4),
    makeWidget('w3', 'gauge', 0, 4, 3, 2),
    makeWidget('w4', 'chart', 3, 4, 9, 4),
  ];

  it('should validate valid layout', () => {
    const result = validateLayout(makeLayout(mockWidgets));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should detect negative position', () => {
    const bad = [makeWidget('w1', 'chart', -1, 0, 3, 3)];
    const result = validateLayout(makeLayout(bad));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('negative position');
  });

  it('should detect invalid size', () => {
    const bad = [makeWidget('w1', 'chart', 0, 0, 0, 3)];
    const result = validateLayout(makeLayout(bad));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('invalid size');
  });

  it('should report overflow as warning, not error', () => {
    // 旧断言错在严重级别：生产 validateLayout 把列溢出只放进 warnings
    // （dashboardLayoutEngine.ts:72-74），valid 只看 errors，因此 valid 仍为 true。
    const bad = [makeWidget('w1', 'chart', 10, 0, 5, 3)];
    const result = validateLayout(makeLayout(bad));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings[0]).toContain('overflows columns');
  });

  it('should report overlap as warning, not error', () => {
    // 旧断言错在严重级别：生产把两两重叠只放进 warnings（:78-84），valid 仍为 true。
    const bad = [
      makeWidget('w1', 'chart', 0, 0, 6, 4),
      makeWidget('w2', 'table', 3, 2, 6, 4),
    ];
    const result = validateLayout(makeLayout(bad));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings[0]).toContain('overlap');
  });

  it('should treat edge-adjacent widgets as non-overlapping', () => {
    const touching = { x: 6, y: 0, w: 6, h: 3 };
    const intersect = { x: 5, y: 0, w: 6, h: 3 };
    expect(checkOverlap({ x: 0, y: 0, w: 6, h: 3 }, touching)).toBe(false);
    expect(checkOverlap({ x: 0, y: 0, w: 6, h: 3 }, intersect)).toBe(true);
  });

  it('should auto-arrange layout without overlaps', () => {
    // 旧 compressLayout 是自抄的列堆叠实现，生产无导出；改绑 autoArrange 的行优先首次适配。
    // 输入：w2 在 (0,0) 3x2，w1 在 (0,5) 3x2；排序后 w1 落在第 0 行第 3 列。
    const widgets = [
      makeWidget('w1', 'chart', 0, 5, 3, 2),
      makeWidget('w2', 'table', 0, 0, 3, 2),
    ];
    const arranged = autoArrange(makeLayout(widgets));
    expect(arranged.widgets).toHaveLength(2);
    expect(arranged.widgets[1].position).toEqual({ x: 3, y: 0, w: 3, h: 2 });
  });

  it('should get widget stats', () => {
    const stats = getLayoutStats(makeLayout(mockWidgets));
    expect(stats.totalWidgets).toBe(4);
    // 旧断言错在字段：生产 getLayoutStats 没有 totalCells，改为同源的 gridUtilization。
    // totalCells = columns * max(y + h) = 12 * 8 = 96，usedCells = 24 + 24 + 6 + 36 = 90。
    expect(stats.gridUtilization).toBe(94);
    expect(stats.byType['chart']).toBe(2);
  });

  it('should handle empty widgets', () => {
    expect(validateLayout(makeLayout([])).valid).toBe(true);
    expect(autoArrange(makeLayout([])).widgets).toEqual([]);
    expect(getLayoutStats(makeLayout([])).totalWidgets).toBe(0);
  });

  it('should count locked widgets', () => {
    // 旧用例断言 avgSize，生产 getLayoutStats 无该字段，改为统计 lockedWidgets/visibleWidgets。
    const widgets = mockWidgets.map(w => w.id === 'w2' ? { ...w, locked: true } : w);
    const stats = getLayoutStats(makeLayout(widgets));
    expect(stats.lockedWidgets).toBe(1);
    expect(stats.visibleWidgets).toBe(4);
  });

  it('should handle single widget', () => {
    const result = validateLayout(makeLayout([mockWidgets[0]]));
    expect(result.valid).toBe(true);
  });

  it('should handle widgets touching edges', () => {
    const widgets = [
      makeWidget('w1', 'chart', 0, 0, 6, 3),
      makeWidget('w2', 'table', 6, 0, 6, 3),
    ];
    const result = validateLayout(makeLayout(widgets));
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('should handle vertical stacking', () => {
    const widgets = [
      makeWidget('w1', 'chart', 0, 0, 6, 3),
      makeWidget('w2', 'table', 0, 3, 6, 3),
    ];
    const result = validateLayout(makeLayout(widgets));
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

// Notification badge logic
describe('Notification Badge Logic', () => {
  // 生产无同契约导出：notificationService.ts 只有 notificationApi（getUnreadCount:147 走 fetch）、
  // PRIORITY_COLORS、formatNotificationTime，没有未读计数/优先级排序的纯函数，故保留内联规格。
  // 枚举改用生产类型：priority 'urgent'（旧 'critical' 生产不存在，:17）、
  // type 'price_alert'（旧 'alert' 不在 NotificationType 中，:6）。
  interface Notification {
    id: string; type: NotificationType;
    read: boolean; priority: NotificationPriority;
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

    const hasUrgent = unread.some(n => n.priority === 'urgent');
    const pOrder: Record<NotificationPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...notifications].sort((a, b) => {
      if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
      return b.timestamp - a.timestamp;
    });

    return {
      total: notifications.length,
      unreadCount: unread.length,
      readCount: notifications.length - unread.length,
      byType: Object.fromEntries([...byType].map(([k, v]) => [k, v.length])),
      unreadByType: Object.fromEntries(unreadByType),
      hasUrgent,
      sorted: sorted.slice(0, 10),
    };
  };

  const markAsRead = (notifications: Notification[], ids: string[]) => {
    const idSet = new Set(ids);
    return notifications.map(n => idSet.has(n.id) ? { ...n, read: true } : n);
  };

  const markAllRead = (notifications: Notification[], type?: NotificationType) => {
    return notifications.map(n =>
      (!type || n.type === type) ? { ...n, read: true } : n
    );
  };

  const mockNotifications: Notification[] = [
    { id: '1', type: 'price_alert', read: false, priority: 'urgent', timestamp: 100 },
    { id: '2', type: 'news', read: false, priority: 'medium', timestamp: 90 },
    { id: '3', type: 'price_alert', read: true, priority: 'low', timestamp: 80 },
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
    expect(result.byType['price_alert']).toBe(2);
    expect(result.byType['news']).toBe(1);
  });

  it('should count unread by type', () => {
    const result = processNotifications(mockNotifications);
    expect(result.unreadByType['price_alert']).toBe(1);
  });

  it('should detect urgent unread', () => {
    const result = processNotifications(mockNotifications);
    expect(result.hasUrgent).toBe(true);
  });

  it('should sort by priority then time', () => {
    const result = processNotifications(mockNotifications);
    expect(result.sorted[0].priority).toBe('urgent');
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
    const result = markAllRead(mockNotifications, 'price_alert');
    expect(result.filter(n => n.type === 'price_alert').every(n => n.read)).toBe(true);
    expect(result.find(n => n.id === '2')!.read).toBe(false);
  });

  it('should handle empty notifications', () => {
    const result = processNotifications([]);
    expect(result.total).toBe(0);
    expect(result.unreadCount).toBe(0);
    expect(result.hasUrgent).toBe(false);
  });

  it('should handle all read', () => {
    const allRead = mockNotifications.map(n => ({ ...n, read: true }));
    const result = processNotifications(allRead);
    expect(result.unreadCount).toBe(0);
    expect(result.hasUrgent).toBe(false);
  });

  it('should handle all urgent', () => {
    const allUrgent = mockNotifications.map(n => ({ ...n, priority: 'urgent' as const, read: false }));
    const result = processNotifications(allUrgent);
    expect(result.hasUrgent).toBe(true);
  });

  it('should limit sorted to 10', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: String(i), type: 'price_alert' as const, read: false,
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
  // 生产实现：customThemes.ts:61 PRESET_THEMES + :193 themeToCssVars（全仓唯一 CSS 变量生成器）。
  // 生产没有 generateCSSVariables 导出；旧断言的 --bg-primary / --up-color #ef4444 / dark #f87171
  // 均无生产依据，已按 PRESET_THEMES 的 --color-* 口径订正（A 股红涨绿跌 #cf1322 / #3f8600）。
  const generateCSSVariables = (themeId: 'light' | 'dark') => themeToCssVars(getThemeById(themeId));

  // 生产无 getStockColor(change, theme) 导出：useThemeTokens.ts:9 是依赖 useResolvedTheme 的 React hook，
  // 不能作纯函数单测；这里从 PRESET_THEMES 取涨跌色，属数据绑定而非函数绑定。
  const getStockColor = (change: number, themeId: 'light' | 'dark') => {
    const { up, down, flat } = getThemeById(themeId).colors;
    if (change > 0) return up;
    if (change < 0) return down;
    return flat;
  };

  const varLines = (css: string) => css.split('\n').filter(line => line.trim().startsWith('--'));

  it('should generate light theme CSS', () => {
    const css = generateCSSVariables('light');
    expect(css).toContain('--color-background: #f0f2f5');
    expect(css).toContain('--color-up: #cf1322');
  });

  it('should generate dark theme CSS', () => {
    const css = generateCSSVariables('dark');
    expect(css).toContain('--color-background: #141414');
    expect(css).toContain('--color-surface: #1f1f1f');
  });

  it('should preserve up/down colors across themes', () => {
    // 生产亮/暗主题的涨跌色相同（dark 只改背景与文字），旧断言值虽是 #ef4444/#22c55e，
    // 但「跨主题一致」这一行为在生产成立，数值改为 #cf1322/#3f8600。
    const light = generateCSSVariables('light');
    const dark = generateCSSVariables('dark');
    expect(light).toContain('--color-up: #cf1322');
    expect(dark).toContain('--color-up: #cf1322');
    expect(light).toContain('--color-down: #3f8600');
    expect(dark).toContain('--color-down: #3f8600');
  });

  it('should get stock color for up', () => {
    expect(getStockColor(5, 'light')).toBe('#cf1322');
    // 旧断言错在暗色涨色：生产 dark.up 与 light.up 同值 #cf1322，旧 #f87171 无生产依据。
    expect(getStockColor(5, 'dark')).toBe('#cf1322');
  });

  it('should get stock color for down', () => {
    expect(getStockColor(-5, 'light')).toBe('#3f8600');
    expect(getStockColor(-5, 'dark')).toBe('#3f8600');
  });

  it('should get stock color for flat', () => {
    expect(getStockColor(0, 'light')).toBe('#999999');
    // 旧断言错在暗色平盘色：生产 dark.flat 是 #595959，与 light 的 #999999 不同。
    expect(getStockColor(0, 'dark')).toBe('#595959');
  });

  it('should have same variable count for both themes', () => {
    // 旧断言按行数比较，生产输出带 ':root {'/'}' 包装行，改比 -- 变量个数。
    const lightVars = generateCSSVariables('light').match(/--[A-Za-z-]+:/g) || [];
    const darkVars = generateCSSVariables('dark').match(/--[A-Za-z-]+:/g) || [];
    expect(lightVars.length).toBeGreaterThan(0);
    expect(lightVars.length).toBe(darkVars.length);
  });

  it('should have valid CSS variable names', () => {
    // 旧断言错在未过滤 ':root {'/'}' 包装行；且 --color-textSecondary 含大写、
    // --chart-ma5/ma10/ma20/ma60 含数字，旧正则只允许小写字母。
    for (const line of varLines(generateCSSVariables('light'))) {
      const varName = line.split(':')[0].trim();
      expect(varName).toMatch(/^--[A-Za-z0-9-]+$/);
    }
  });

  it('should have valid CSS values', () => {
    for (const line of varLines(generateCSSVariables('light'))) {
      expect(line).toMatch(/: .+;$/);
    }
  });

  it('should fall back to first preset theme for unknown id', () => {
    expect(getThemeById('does-not-exist').id).toBe('light');
    expect(PRESET_THEMES[0].id).toBe('light');
  });
});

// Responsive breakpoint logic
describe('Responsive Breakpoint Logic', () => {
  // 生产实现：responsiveUtils.ts:8 BREAKPOINTS / :58 getCurrentBreakpoint / :99 getGridConfig
  // （栅格预设 GRID_PRESETS:27）。旧断言的 576/992/1200/1600 与 'xxl' 键均非生产口径。
  const getBreakpoint = (width: number) => getCurrentBreakpoint(width);
  const getColumnCount = (width: number) => getGridConfig(width).columns;
  const getContentPadding = (width: number) => getGridConfig(width).padding;

  // 生产无导出：侧边栏只有 AppLayout.tsx:221 的固定 margin-left: 240px，
  // 没有按断点的宽度/折叠映射，保留内联规格。
  const getSidebarWidth = (width: number, collapsed: boolean) => {
    const bp = getCurrentBreakpoint(width);
    if (bp === 'xs') return 0;
    if (bp === 'sm') return collapsed ? 0 : 200;
    return collapsed ? 64 : 240;
  };

  // 生产无导出：TYPOGRAPHY_SCALE 是流体字号区间，不是按断点的像素字号，保留内联规格。
  const getFontSize = (width: number) => {
    const bp = getCurrentBreakpoint(width);
    const sizes: Record<string, number> = { xs: 12, sm: 13, md: 14, lg: 14, xl: 15, '2xl': 16 };
    return sizes[bp];
  };

  it('should identify xs breakpoint', () => {
    expect(getBreakpoint(320)).toBe('xs');
    expect(getBreakpoint(BREAKPOINTS.sm - 1)).toBe('xs');
  });

  it('should identify sm breakpoint', () => {
    expect(getBreakpoint(BREAKPOINTS.sm)).toBe('sm');
    expect(getBreakpoint(BREAKPOINTS.md - 1)).toBe('sm');
  });

  it('should identify md breakpoint', () => {
    expect(getBreakpoint(BREAKPOINTS.md)).toBe('md');
    expect(getBreakpoint(BREAKPOINTS.lg - 1)).toBe('md');
  });

  it('should identify lg breakpoint', () => {
    expect(getBreakpoint(BREAKPOINTS.lg)).toBe('lg');
    expect(getBreakpoint(BREAKPOINTS.xl - 1)).toBe('lg');
  });

  it('should identify xl breakpoint', () => {
    expect(getBreakpoint(BREAKPOINTS.xl)).toBe('xl');
    expect(getBreakpoint(BREAKPOINTS['2xl'] - 1)).toBe('xl');
  });

  it('should identify 2xl breakpoint', () => {
    // 旧断言用 'xxl'，生产键名是 '2xl'（responsiveUtils.ts:14）。
    expect(getBreakpoint(BREAKPOINTS['2xl'])).toBe('2xl');
    expect(getBreakpoint(2560)).toBe('2xl');
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
    expect(getBreakpoint(BREAKPOINTS.sm)).toBe('sm');
    expect(getBreakpoint(BREAKPOINTS.sm - 1)).toBe('xs');
    expect(getBreakpoint(BREAKPOINTS.md)).toBe('md');
    expect(getBreakpoint(BREAKPOINTS.md - 1)).toBe('sm');
  });

  it('should have monotonically increasing padding', () => {
    const widths = [320, BREAKPOINTS.sm, BREAKPOINTS.md, BREAKPOINTS.lg, BREAKPOINTS.xl, BREAKPOINTS['2xl']];
    const paddings = widths.map(getContentPadding);
    for (let i = 1; i < paddings.length; i++) {
      expect(paddings[i]).toBeGreaterThanOrEqual(paddings[i - 1]);
    }
  });

  it('should have monotonically increasing columns', () => {
    const widths = [320, BREAKPOINTS.sm, BREAKPOINTS.md, BREAKPOINTS.lg, BREAKPOINTS.xl, BREAKPOINTS['2xl']];
    const cols = widths.map(getColumnCount);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i]).toBeGreaterThanOrEqual(cols[i - 1]);
    }
  });

  it('should adapt layout config by width', () => {
    const mobile = getAdaptiveConfig(400);
    expect(mobile.breakpoint).toBe('xs');
    expect(mobile.columns).toBe(1);
    expect(mobile.sidebarVisible).toBe(false);
    const desktop = getAdaptiveConfig(1100);
    expect(desktop.breakpoint).toBe('lg');
    expect(desktop.columns).toBe(3);
    expect(desktop.sidebarVisible).toBe(true);
  });
});
