/**
 * 影子测试迁移：Dashboard Widgets
 * 原文件 frontend/src/__tests__/dashboardWidgets.test.ts（482 行 / 34 例）
 *
 * 一、原自抄实现的问题
 * 1. 布局校验把「重叠」判为硬错误（valid=false）；生产 dashboardLayoutEngine 只把重叠、列溢出
 *    记入 warnings，valid 仅由 errors 决定。旧断言 result.valid=false 与生产契约相反，已订正。
 * 2. 自抄 compactLayout 按列高堆叠，生产无同契约导出；改用同引擎 autoArrange（行优先网格铺放），
 *    旧 y 坐标断言不适用于生产网格，按生产实测位置重写。
 * 3. 分页/排序自抄 slice+sort，生产 DataTableProcessor 同时覆盖筛选、分页、排序，改绑生产。
 * 4. 主题自抄 --bg-primary/--text-primary/#ff4d4f/#52c41a 均非生产命名；生产 customThemes 输出
 *    --color-*、--chart-*、--font-*、--space-*，A 股涨跌色为 #cf1322/#3f8600，亮暗主题 flat
 *    实际不同（#999999/#595959），旧「flat 相同」断言错误。
 * 5. 搜索高亮自抄用 split(regex) 且 regex.test 受 lastIndex 影响；改渲染真实组件并断言 DOM。
 * 6. 通知 priority 自造 'critical'；生产前端枚举为 'urgent'（notificationService.ts:17），已订正。
 * 7. 刷新调度自抄用当前时间戳，迁移后改为确定性自增 tick（语义不变，满足测试确定性约束）。
 *
 * 二、绑定生产实现
 * - 布局：frontend/src/utils/dashboardLayoutEngine.ts:49 validateLayout、:92 checkOverlap、:150 autoArrange。
 *   选型理由：全仓仅此文件导出布局校验/重叠/自动排列三种语义，无第二实现。
 * - 分页排序：frontend/src/utils/dataTable.ts:38 DataTableProcessor。
 *   选型理由：bloombergExportEngine.ts:584/607 同语义但依赖 xlsx，CI 只装 backend 依赖（D43），不可用。
 * - 主题：frontend/src/utils/customThemes.ts:61 PRESET_THEMES、:193 themeToCssVars。
 *   选型理由：frontend/src/styles/theme.ts 只有图表/排版常量，不生成 CSS 变量，契约不符。
 * - 搜索高亮：frontend/src/components/Common/SearchHighlight.tsx:20（React Testing Library 渲染）。
 *
 * 三、未迁移清单
 * - Dashboard Data Refresh：生产无独立调度器导出；真实自动刷新在 hooks（useMarketAnalytics.ts:232
 *   等）组件 effect 内，脱离 React 生命周期无法单测。保留内联，仅把当前时间戳换成自增 tick。
 * - Notification Badge：生产 notificationService.getUnreadCount(:147) 走 fetch，无纯数组计数导出；
 *   保留内联，但 priority 枚举对齐生产 'low'|'medium'|'high'|'urgent'。
 * - fuzzyMatch：全仓无模糊匹配导出（IndustryMapPage.tsx:355 仅名称互含判断），保留内联并注明。
 * - compactLayout：生产无导出，已由 autoArrange 覆盖，不再保留。
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import {
  validateLayout,
  checkOverlap,
  autoArrange,
  type DashboardLayout,
  type DashboardWidget,
} from '../utils/dashboardLayoutEngine';
import { PRESET_THEMES, themeToCssVars } from '../utils/customThemes';
import { DataTableProcessor } from '../utils/dataTable';
import { SearchHighlight } from '../components/Common/SearchHighlight';

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: '1',
    type: 'chart',
    title: '图表',
    position: { x: 0, y: 0, w: 6, h: 4 },
    config: {},
    visible: true,
    locked: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeLayout(overrides: Partial<DashboardLayout> = {}): DashboardLayout {
  return {
    id: 'layout1',
    name: '默认布局',
    columns: 12,
    rowHeight: 80,
    gap: 8,
    widgets: [],
    isDefault: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function positionsOf(layout: DashboardLayout): Array<[number, number]> {
  return layout.widgets.map(w => [w.position.x, w.position.y]);
}

// Dashboard Widget Layout
describe('Dashboard Widget Layout', () => {
  it('should validate non-overlapping layout', () => {
    const layout = makeLayout({
      widgets: [
        makeWidget({ id: '1', position: { x: 0, y: 0, w: 6, h: 4 } }),
        makeWidget({ id: '2', type: 'table', position: { x: 6, y: 0, w: 6, h: 4 } }),
      ],
    });
    const result = validateLayout(layout);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('should detect overlapping widgets', () => {
    const layout = makeLayout({
      widgets: [
        makeWidget({ id: '1', position: { x: 0, y: 0, w: 8, h: 4 } }),
        makeWidget({ id: '2', type: 'table', position: { x: 4, y: 2, w: 8, h: 4 } }),
      ],
    });
    const result = validateLayout(layout);
    // 订正：生产把重叠记入 warnings，valid 仍为 true（旧断言期待 false 是自抄错误契约）。
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(['Widgets 1 and 2 overlap']);
    expect(checkOverlap(layout.widgets[0].position, layout.widgets[1].position)).toBe(true);
  });

  it('should detect invalid positions', () => {
    const layout = makeLayout({
      widgets: [makeWidget({ id: '1', position: { x: -1, y: 0, w: 6, h: 4 } })],
    });
    const result = validateLayout(layout);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Widget 1 has negative position']);
  });

  it('should report column overflow as warning only', () => {
    const layout = makeLayout({
      columns: 12,
      widgets: [makeWidget({ id: '1', position: { x: 8, y: 0, w: 6, h: 4 } })],
    });
    const result = validateLayout(layout);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(['Widget 1 overflows columns']);
  });

  it('should compact layout vertically', () => {
    const layout = makeLayout({
      widgets: [
        makeWidget({ id: '1', position: { x: 0, y: 10, w: 6, h: 4 } }),
        makeWidget({ id: '2', position: { x: 6, y: 10, w: 6, h: 4 } }),
        makeWidget({ id: '3', position: { x: 0, y: 20, w: 12, h: 4 } }),
      ],
    });
    const compacted = autoArrange(layout);
    expect(positionsOf(compacted)).toEqual([[0, 0], [6, 0], [0, 4]]);
  });

  it('should auto-arrange in columns', () => {
    const layout = makeLayout({
      columns: 2,
      widgets: [
        makeWidget({ id: '1', position: { x: 0, y: 0, w: 1, h: 3 } }),
        makeWidget({ id: '2', position: { x: 0, y: 0, w: 1, h: 2 } }),
        makeWidget({ id: '3', position: { x: 0, y: 0, w: 1, h: 4 } }),
      ],
    });
    const arranged = autoArrange(layout);
    expect(positionsOf(arranged)).toEqual([[0, 0], [1, 0], [1, 2]]);
  });

  it('should handle single widget', () => {
    const result = validateLayout(makeLayout({
      widgets: [makeWidget({ id: '1', position: { x: 0, y: 0, w: 12, h: 6 } })],
    }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should handle empty layout', () => {
    const result = validateLayout(makeLayout({ widgets: [] }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('should treat touching widgets as non-overlapping', () => {
    const layout = makeLayout({
      widgets: [
        makeWidget({ id: '1', position: { x: 0, y: 0, w: 4, h: 4 } }),
        makeWidget({ id: '2', position: { x: 4, y: 0, w: 4, h: 4 } }),
      ],
    });
    expect(checkOverlap(layout.widgets[0].position, layout.widgets[1].position)).toBe(false);
    expect(checkOverlap(
      { x: 0, y: 0, w: 4, h: 4 },
      { x: 0, y: 4, w: 4, h: 4 },
    )).toBe(false);
  });
});

// Dashboard Data Refresh（未迁移，见文件头第三节）
describe('Dashboard Data Refresh', () => {
  class RefreshScheduler {
    private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
    private lastRefresh: Map<string, number> = new Map();
    private paused = new Set<string>();
    private tick = 0;

    register(id: string, intervalMs: number, callback: () => void) {
      this.lastRefresh.set(id, ++this.tick);
      const timer = setInterval(() => {
        if (!this.paused.has(id)) {
          this.lastRefresh.set(id, ++this.tick);
          callback();
        }
      }, intervalMs);
      this.timers.set(id, timer);
    }

    unregister(id: string) {
      const timer = this.timers.get(id);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(id);
      }
      this.lastRefresh.delete(id);
      this.paused.delete(id);
    }

    pause(id: string) {
      this.paused.add(id);
    }

    resume(id: string) {
      this.paused.delete(id);
    }

    isPaused(id: string) {
      return this.paused.has(id);
    }

    getActiveCount() {
      return this.timers.size - this.paused.size;
    }

    getLastRefresh(id: string) {
      return this.lastRefresh.get(id) ?? null;
    }
  }

  it('should register refresh timers', () => {
    const scheduler = new RefreshScheduler();
    let count = 0;
    scheduler.register('w1', 1000, () => { count++; });
    expect(scheduler.getLastRefresh('w1')).not.toBeNull();
    expect(count).toBe(0);
    scheduler.unregister('w1');
  });

  it('should pause and resume', () => {
    const scheduler = new RefreshScheduler();
    scheduler.register('w1', 1000, () => {});
    scheduler.pause('w1');
    expect(scheduler.isPaused('w1')).toBe(true);
    expect(scheduler.getActiveCount()).toBe(0);
    scheduler.resume('w1');
    expect(scheduler.isPaused('w1')).toBe(false);
    expect(scheduler.getActiveCount()).toBe(1);
    scheduler.unregister('w1');
  });

  it('should track multiple widgets', () => {
    const scheduler = new RefreshScheduler();
    scheduler.register('w1', 1000, () => {});
    scheduler.register('w2', 2000, () => {});
    scheduler.register('w3', 5000, () => {});
    expect(scheduler.getActiveCount()).toBe(3);
    scheduler.unregister('w2');
    expect(scheduler.getActiveCount()).toBe(2);
  });

  it('should clean up on unregister', () => {
    const scheduler = new RefreshScheduler();
    scheduler.register('w1', 1000, () => {});
    scheduler.unregister('w1');
    expect(scheduler.getLastRefresh('w1')).toBeNull();
    expect(scheduler.isPaused('w1')).toBe(false);
    expect(scheduler.getActiveCount()).toBe(0);
  });
});

// Stock List Pagination & Sorting
describe('Stock List Pagination & Sorting', () => {
  type Stock = {
    code: string;
    name: string;
    price: number;
    changePercent: number;
    volume: number;
    amount: number;
    turnover: number;
  };

  // 确定性 fixture：Math.imul LCG，固定 seed=42，替代原有随机数生成。
  const makeStocks = (count = 55): Stock[] => {
    let seed = 42;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    return Array.from({ length: count }, (_, i) => ({
      code: String(600000 + i).padStart(6, '0'),
      name: `股票${i + 1}`,
      price: 10 + i * 0.5,
      changePercent: Number((-5 + next() * 10).toFixed(4)),
      volume: 1e6 + i * 1e5,
      amount: 1e8 + i * 1e7,
      turnover: Number((next() * 10).toFixed(4)),
    }));
  };

  const stocks = makeStocks();

  it('should paginate correctly', () => {
    const pageOf = (page: number) =>
      new DataTableProcessor<Stock>(stocks).paginate(page, 20).execute().data;
    expect(pageOf(1)).toHaveLength(20);
    expect(pageOf(2)).toHaveLength(20);
    expect(pageOf(3)).toHaveLength(15);
    expect(pageOf(4)).toHaveLength(0);
  });

  it('should sort by price ascending', () => {
    const sorted = new DataTableProcessor<Stock>(stocks)
      .sortBy('price', 'asc')
      .execute().data;
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].price).toBeGreaterThanOrEqual(sorted[i - 1].price);
    }
  });

  it('should sort by price descending', () => {
    const sorted = new DataTableProcessor<Stock>(stocks)
      .sortBy('price', 'desc')
      .execute().data;
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].price).toBeLessThanOrEqual(sorted[i - 1].price);
    }
  });

  it('should sort by code alphabetically', () => {
    const sorted = new DataTableProcessor<Stock>(stocks)
      .sortBy('code', 'asc')
      .execute().data;
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].code >= sorted[i - 1].code).toBe(true);
    }
  });

  it('should not mutate original array', () => {
    const originalCodes = stocks.map(s => s.code);
    new DataTableProcessor<Stock>(stocks).sortBy('price', 'desc').execute();
    expect(stocks.map(s => s.code)).toEqual(originalCodes);
    expect(stocks[0].code).toBe('600000');
  });

  it('should calculate total pages', () => {
    const result = new DataTableProcessor<Stock>(stocks).paginate(1, 20).execute();
    expect(result.pagination.total).toBe(55);
    expect(result.pagination.pageSize).toBe(20);
    expect(Math.ceil(result.pagination.total / result.pagination.pageSize)).toBe(3);
  });

  it('should handle page 1 and last page', () => {
    const page1 = new DataTableProcessor<Stock>(stocks).paginate(1, 20).execute().data;
    expect(page1[0].code).toBe('600000');
    const lastPage = new DataTableProcessor<Stock>(stocks).paginate(3, 20).execute().data;
    expect(lastPage[lastPage.length - 1].code).toBe('600054');
  });

  it('should sort then paginate with stable total', () => {
    const result = new DataTableProcessor<Stock>(stocks)
      .sortBy('price', 'desc')
      .paginate(1, 20)
      .execute();
    expect(result.data).toHaveLength(20);
    expect(result.pagination.total).toBe(55);
    expect(result.data[0].code).toBe('600054');
  });
});

// Theme CSS Variables
describe('Theme CSS Variables', () => {
  const light = PRESET_THEMES.find(t => t.id === 'light')!;
  const dark = PRESET_THEMES.find(t => t.id === 'dark')!;

  it('should have same color semantics in both themes', () => {
    expect(light.colors.up).toBe(dark.colors.up);
    expect(light.colors.down).toBe(dark.colors.down);
    // 订正：生产亮/暗主题 flat 分别为 #999999 / #595959，旧断言「两者相同」错误。
    expect(light.colors.flat).not.toBe(dark.colors.flat);
  });

  it('should have different backgrounds', () => {
    expect(light.colors.background).toBe('#f0f2f5');
    expect(dark.colors.background).toBe('#141414');
    expect(light.colors.background).not.toBe(dark.colors.background);
  });

  it('should generate valid CSS', () => {
    const css = themeToCssVars(light);
    expect(css.startsWith(':root {')).toBe(true);
    expect(css.endsWith('}')).toBe(true);
    expect(css).toContain('--color-background: #f0f2f5;');
    expect(css).toContain('--color-up: #cf1322;');
    expect(css).toContain('--border-radius: 6px;');
  });

  it('should have red for up (A-share convention)', () => {
    expect(light.colors.up).toBe('#cf1322');
    expect(dark.colors.up).toBe('#cf1322');
    expect(light.colors.up).toMatch(/^#[0-9a-f]{6}$/i);
    expect(themeToCssVars(dark)).toContain('--color-up: #cf1322;');
  });

  it('should have green for down (A-share convention)', () => {
    expect(light.colors.down).toBe('#3f8600');
    expect(dark.colors.down).toBe('#3f8600');
    expect(light.colors.down).not.toBe(light.colors.up);
  });

  it('should emit chart, font and spacing variables', () => {
    const css = themeToCssVars(dark);
    expect(css).toContain('--chart-ma5: #d89614;');
    expect(css).toContain('--font-md: 14px;');
    expect(css).toContain('--space-lg: 24px;');
    expect(css).toContain('--color-flat: #595959;');
  });
});

// Notification Badge Logic（未迁移，见文件头第三节；枚举对齐生产 notificationService.ts:17）
describe('Notification Badge Logic', () => {
  type NotificationType = 'price' | 'volume' | 'news' | 'system';
  // 生产前端 priority 为 'low'|'medium'|'high'|'urgent'（无 'critical'），原自造值已订正。
  type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

  interface Notification {
    id: string;
    type: NotificationType;
    read: boolean;
    priority: NotificationPriority;
    timestamp: number;
  }

  const countUnread = (notifications: Notification[]) =>
    notifications.filter(n => !n.read).length;

  const countByType = (notifications: Notification[]) => {
    const counts: Record<string, number> = {};
    for (const n of notifications) {
      if (!n.read) counts[n.type] = (counts[n.type] || 0) + 1;
    }
    return counts;
  };

  const filterUrgentUnread = (notifications: Notification[]) =>
    notifications.filter(n => n.priority === 'urgent' && !n.read);

  const markAllRead = (notifications: Notification[]) =>
    notifications.map(n => ({ ...n, read: true }));

  const markReadByType = (notifications: Notification[], type: NotificationType) =>
    notifications.map(n => n.type === type ? { ...n, read: true } : n);

  const notifications: Notification[] = [
    { id: '1', type: 'price', read: false, priority: 'high', timestamp: 1 },
    { id: '2', type: 'price', read: true, priority: 'low', timestamp: 2 },
    { id: '3', type: 'volume', read: false, priority: 'urgent', timestamp: 3 },
    { id: '4', type: 'news', read: false, priority: 'medium', timestamp: 4 },
    { id: '5', type: 'system', read: false, priority: 'low', timestamp: 5 },
  ];

  it('should count unread notifications', () => {
    expect(countUnread(notifications)).toBe(4);
  });

  it('should count by type', () => {
    const counts = countByType(notifications);
    expect(counts['price']).toBe(1);
    expect(counts['volume']).toBe(1);
    expect(counts['news']).toBe(1);
  });

  it('should filter urgent unread', () => {
    const urgent = filterUrgentUnread(notifications);
    expect(urgent).toHaveLength(1);
    expect(urgent[0].id).toBe('3');
  });

  it('should mark all as read', () => {
    const all = markAllRead(notifications);
    expect(all.every(n => n.read)).toBe(true);
    expect(countUnread(all)).toBe(0);
  });

  it('should mark by type', () => {
    const result = markReadByType(notifications, 'price');
    expect(result.filter(n => n.type === 'price').every(n => n.read)).toBe(true);
    expect(result.filter(n => n.type !== 'price').some(n => !n.read)).toBe(true);
    expect(countUnread(result)).toBe(3);
  });

  it('should exclude already-read urgent notifications', () => {
    expect(filterUrgentUnread(markAllRead(notifications))).toHaveLength(0);
  });
});

// Search Highlight Logic
describe('Search Highlight Logic', () => {
  // 模糊匹配生产无同契约导出（rg fuzzyMatch 仅 IndustryMapPage.tsx:355 名称互含），保留内联。
  const fuzzyMatch = (text: string, query: string): boolean => {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i++) {
      if (lower[i] === q[qi]) qi++;
    }
    return qi === q.length;
  };

  it('should highlight exact matches', () => {
    const { container } = render(React.createElement(SearchHighlight, {
      text: '贵州茅台酒股份有限公司',
      query: '茅台',
    }));
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('茅台');
    expect(container.textContent).toBe('贵州茅台酒股份有限公司');
  });

  it('should handle case insensitive matching', () => {
    const { container } = render(React.createElement(SearchHighlight, {
      text: 'Kweichow Moutai',
      query: 'kweichow',
    }));
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('Kweichow');
  });

  it('should respect case sensitive matching', () => {
    const { container } = render(React.createElement(SearchHighlight, {
      text: 'Kweichow Moutai',
      query: 'kweichow',
      caseSensitive: true,
    }));
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('Kweichow Moutai');
  });

  it('should handle no match', () => {
    const { container } = render(React.createElement(SearchHighlight, {
      text: '平安银行',
      query: '茅台',
    }));
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('平安银行');
  });

  it('should handle empty query', () => {
    const { container } = render(React.createElement(SearchHighlight, {
      text: '贵州茅台',
      query: '',
    }));
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('贵州茅台');
  });

  it('should highlight multiple keywords', () => {
    const { container } = render(React.createElement(SearchHighlight, {
      text: '贵州茅台酒股份有限公司',
      query: '茅台 股份',
    }));
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0].textContent).toBe('茅台');
    expect(marks[1].textContent).toBe('股份');
  });

  it('should fuzzy match abbreviation', () => {
    expect(fuzzyMatch('Kweichow Moutai', 'kw')).toBe(true);
    expect(fuzzyMatch('Kweichow Moutai', 'mt')).toBe(true);
    expect(fuzzyMatch('Kweichow Moutai', 'zgyh')).toBe(false);
  });

  it('should fuzzy match partial', () => {
    expect(fuzzyMatch('Kweichow Moutai', 'km')).toBe(true);
    expect(fuzzyMatch('Kweichow Moutai', 'xyz')).toBe(false);
  });
});
