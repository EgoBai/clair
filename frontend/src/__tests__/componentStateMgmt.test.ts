import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { filterData, sortData } from '../utils/bloombergExportEngine';
import { formatRelativeTime } from '../i18n/i18nManager';
import { SearchHighlight } from '../components/Common/SearchHighlight';

/**
 * 影子测试迁移（批次 32b）— 组件状态管理（表格/分页/Tab/搜索高亮/相对时间）
 *
 * 迁移前：本文件自抄 8 个 helper（createTableState/paginate/sortData/filterData/createTabManager/
 * createPagination/createSearchHighlight/createRelativeTime），不 import 任何生产模块。
 * 迁移后：sortData/filterData → bloombergExportEngine；搜索高亮 → SearchHighlight 组件真实渲染；
 * 相对时间 → i18nManager.formatRelativeTime；表格状态/分页信息/Tab 管理器属纯 UI 状态机，
 * 生产仓无同契约导出，按「未迁移·生产缺口」保留内联。
 * 用例数：35 → 36（原有 describe/it 全保留；搜索高亮组新增 1 条生产多关键词用例）。
 *
 * ── 一、绑定真源 ──
 * | 本文件符号 | 生产文件:行 | 契约 |
 * | sortData | frontend/src/utils/bloombergExportEngine.ts:607-626 | 返回 [...data] 副本；数值相减（:619），
 * |   |   | 字符串 String(...).localeCompare(..., 'zh-CN')（:621）。 |
 * | filterData | frontend/src/utils/bloombergExportEngine.ts:584-605 | 声明式 FilterConfig[]（类型见 :58），
 * |   |   | filters.every（:589）；eq 严格相等、lt 走 Number(...)（:592/:596）、contains 用 String.includes 区分大小写（:598）。 |
 * | createSearchHighlight → SearchHighlight | frontend/src/components/Common/SearchHighlight.tsx:20-72 | React 组件：
 * |   |   | query.trim() 空则整段不拆（:32）；空格分词多关键词（:35-38）；escapeRegex（:16）；
 * |   |   | 命中渲染 <mark>（:65），非命中渲染 <span>（:67）。 |
 * | createRelativeTime → formatRelativeTime | frontend/src/i18n/i18nManager.ts:176-202 | 入参 timestamp；
 * |   |   | 内部取当前时间戳（:180）；单位年 365 天/月 30 天（:185-186）；Intl.RelativeTimeFormat(numeric:'auto')（:197）。 |
 *
 * ── 二、旧断言订正（旧值 → 生产值 + file:line）──
 * | 旧断言 | 生产值 + 位置 |
 * | filterData 入参为谓词表 Record<string, (item) => boolean> | 生产入参为 FilterConfig[]：{key, operator, value}
 * |   | （bloombergExportEngine.ts:584-587，类型 :58）；用例改传 [{ key:'sector', operator:'eq', value:'tech' }]
 * |   | 与 [{ key:'price', operator:'lt', value:200 }]，筛出条数不变（2 / 1 / 3）。 |
 * | sortData 为泛型 T[] 入参、无 locale | 生产入参 Record<string, unknown>[]，字符串排序显式 localeCompare(...,'zh-CN')（:621）；
 * |   | 本组 ASCII 数据结果不变，仍断言 AAPL/GOOGL 顺序与不改原数组。 |
 * | createSearchHighlight 返回 HTML 字符串，如 'Hello <mark>World</mark>' | 生产是 React 组件，非命中片段也包
 * |   | <span>（SearchHighlight.tsx:61-68），整串 HTML 变为 '<span>Hello </span><mark>World</mark>'；
 * |   | 断言改为 mark 数量 / mark 文本 / container.textContent，不再比较整串 HTML。 |
 * | 空查询返回原文字符串 | 生产 query.trim() 为空直接整段不拆（:32）：0 个 mark、textContent 仍为原文。 |
 * | 相对时间「刚刚」（<1 分钟）：30 秒 → '刚刚' | 生产走 second 单元输出 '30秒钟前'（i18nManager.ts:194-197）；
 * |   | 同仓库既有订正见 frontend/src/__tests__/dateTimeUtils.test.ts:106。 |
 * | 相对时间「天前」：2 天 → '2天前' | Intl.RelativeTimeFormat('zh-CN',{numeric:'auto'}) 对 -2 day 输出 '前天'
 * |   | （i18nManager.ts:197，生产实测；同仓 dateTimeUtils 用 5 天故未暴露）。 |
 * | 相对时间用真实系统时钟取现在 | 生产内部取当前时间戳（:180）由 vi.useFakeTimers()+vi.setSystemTime(NOW) 固定，
 * |   | NOW = Date.parse('2024-06-15T12:00:00Z') 常量，夹具确定性；5 分钟/2 小时/2 个月/2 年断言与生产一致。 |
 *
 * ── 三、未迁移·生产缺口 ──
 * - createTableState：生产无表格状态工厂导出；utils/dataTable.ts:38 DataTableProcessor 以类字段持有
 *   page/pageSize/sort/filters，且未导出 TableState 形状，契约不同。
 * - paginate：utils/dataTable.ts:76 paginate(page,pageSize) 是 builder 方法（返回 this），必须 execute()（:85）
 *   才分页切片（:106-107），无同形状纯函数；与既有迁移 frontend/src/__tests__/tableSortFilter.test.ts:4-5/:21-22
 *   的结论一致，保留内联。
 * - createPagination：totalPages/hasNext/hasPrev/startIndex/endIndex 无生产导出；DataTableProcessor 返回的
 *   pagination 只含 {page,pageSize,total}（dataTable.ts:109-115）。
 * - createTabManager：frontend/src、backend/src、shared 非测试源码无 Tab 状态机导出（页面直接用 antd Tabs/useState），
 *   保留内联。
 */

// Component state management logic
interface TabState {
  activeKey: string;
  tabs: { key: string; label: string; closable: boolean }[];
}

interface ModalState {
  visible: boolean;
  loading: boolean;
  data: Record<string, unknown> | null;
}

interface TableState<T> {
  data: T[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  filters: Record<string, unknown>;
}

// 未迁移：生产无同契约表格状态工厂（见文件头「未迁移」）。
function createTableState<T>(data: T[], total: number, page = 1, pageSize = 20): TableState<T> {
  return { data, loading: false, page, pageSize, total, sortBy: '', sortOrder: 'asc', filters: {} };
}

// 未迁移：生产 paginate 是 DataTableProcessor builder 方法（dataTable.ts:76），非纯函数。
function paginate<T>(data: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return data.slice(start, start + pageSize);
}

// 未迁移：生产无分页信息结构导出（dataTable.ts:109-115 的 pagination 只有 page/pageSize/total）。
function createPagination(total: number, page: number, pageSize: number) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    startIndex: (page - 1) * pageSize + 1,
    endIndex: Math.min(page * pageSize, total),
  };
}

// 未迁移：生产无 Tab 状态机导出（见文件头「未迁移」）。
function createTabManager(initialTabs: { key: string; label: string }[]) {
  let state: TabState = {
    activeKey: initialTabs[0]?.key || '',
    tabs: initialTabs.map(t => ({ ...t, closable: true })),
  };
  return {
    getState: () => state,
    addTab: (tab: { key: string; label: string }) => {
      if (!state.tabs.find(t => t.key === tab.key)) {
        state = { ...state, tabs: [...state.tabs, { ...tab, closable: true }] };
      }
      state = { ...state, activeKey: tab.key };
    },
    removeTab: (key: string) => {
      const idx = state.tabs.findIndex(t => t.key === key);
      if (idx === -1 || !state.tabs[idx].closable) return;
      const newTabs = state.tabs.filter(t => t.key !== key);
      const newActive = state.activeKey === key
        ? (newTabs[Math.min(idx, newTabs.length - 1)]?.key || '')
        : state.activeKey;
      state = { ...state, tabs: newTabs, activeKey: newActive };
    },
    setActive: (key: string) => {
      if (state.tabs.find(t => t.key === key)) {
        state = { ...state, activeKey: key };
      }
    },
  };
}

describe('组件状态管理', () => {
  describe('表格状态', () => {
    it('应该创建初始状态', () => {
      const state = createTableState([1, 2, 3], 100);
      expect(state.page).toBe(1);
      expect(state.pageSize).toBe(20);
      expect(state.total).toBe(100);
      expect(state.loading).toBe(false);
    });

    it('应该支持自定义页码和页大小', () => {
      const state = createTableState([], 50, 3, 10);
      expect(state.page).toBe(3);
      expect(state.pageSize).toBe(10);
    });
  });

  describe('分页逻辑', () => {
    it('应该正确分页', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(paginate(data, 1, 3)).toEqual([1, 2, 3]);
      expect(paginate(data, 2, 3)).toEqual([4, 5, 6]);
      expect(paginate(data, 4, 3)).toEqual([10]);
    });

    it('超出范围应该返回空', () => {
      expect(paginate([1, 2, 3], 5, 10)).toEqual([]);
    });

    it('应该创建分页信息', () => {
      const p = createPagination(100, 3, 10);
      expect(p.totalPages).toBe(10);
      expect(p.hasNext).toBe(true);
      expect(p.hasPrev).toBe(true);
      expect(p.startIndex).toBe(21);
      expect(p.endIndex).toBe(30);
    });

    it('首页应该没有上一页', () => {
      const p = createPagination(100, 1, 10);
      expect(p.hasPrev).toBe(false);
      expect(p.hasNext).toBe(true);
    });

    it('末页应该没有下一页', () => {
      const p = createPagination(100, 10, 10);
      expect(p.hasNext).toBe(false);
      expect(p.hasPrev).toBe(true);
    });

    it('零总数应该有零页', () => {
      const p = createPagination(0, 1, 10);
      expect(p.totalPages).toBe(0);
    });
  });

  describe('排序逻辑（生产 bloombergExportEngine.sortData）', () => {
    const data: Record<string, unknown>[] = [
      { name: 'AAPL', price: 150 },
      { name: 'GOOGL', price: 2800 },
      { name: 'MSFT', price: 300 },
    ];

    it('应该升序排序数字', () => {
      const sorted = sortData(data, 'price', 'asc');
      expect(sorted[0].name).toBe('AAPL');
      expect(sorted[2].name).toBe('GOOGL');
    });

    it('应该降序排序数字', () => {
      const sorted = sortData(data, 'price', 'desc');
      expect(sorted[0].name).toBe('GOOGL');
      expect(sorted[2].name).toBe('AAPL');
    });

    it('应该排序字符串', () => {
      const sorted = sortData(data, 'name', 'asc');
      expect(sorted[0].name).toBe('AAPL');
    });

    it('不应该修改原始数组', () => {
      const original = [...data];
      sortData(data, 'price', 'desc');
      expect(data[0].name).toBe(original[0].name);
    });
  });

  describe('筛选逻辑（生产 bloombergExportEngine.filterData）', () => {
    const data: Record<string, unknown>[] = [
      { name: 'AAPL', price: 150, sector: 'tech' },
      { name: 'JPM', price: 150, sector: 'finance' },
      { name: 'GOOGL', price: 2800, sector: 'tech' },
    ];

    it('应该按条件筛选', () => {
      const result = filterData(data, [{ key: 'sector', operator: 'eq', value: 'tech' }]);
      expect(result.length).toBe(2);
    });

    it('多条件应该取交集', () => {
      const result = filterData(data, [
        { key: 'sector', operator: 'eq', value: 'tech' },
        { key: 'price', operator: 'lt', value: 200 },
      ]);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('AAPL');
    });

    it('空筛选应该返回全部', () => {
      expect(filterData(data, []).length).toBe(3);
    });
  });

  describe('Tab管理器', () => {
    it('应该初始化标签', () => {
      const mgr = createTabManager([{ key: 'tab1', label: 'Tab 1' }]);
      expect(mgr.getState().activeKey).toBe('tab1');
      expect(mgr.getState().tabs.length).toBe(1);
    });

    it('应该添加标签', () => {
      const mgr = createTabManager([{ key: 'tab1', label: 'Tab 1' }]);
      mgr.addTab({ key: 'tab2', label: 'Tab 2' });
      expect(mgr.getState().tabs.length).toBe(2);
      expect(mgr.getState().activeKey).toBe('tab2');
    });

    it('不应该重复添加', () => {
      const mgr = createTabManager([{ key: 'tab1', label: 'Tab 1' }]);
      mgr.addTab({ key: 'tab1', label: 'Tab 1' });
      expect(mgr.getState().tabs.length).toBe(1);
    });

    it('应该删除标签', () => {
      const mgr = createTabManager([
        { key: 'tab1', label: 'Tab 1' },
        { key: 'tab2', label: 'Tab 2' },
      ]);
      mgr.removeTab('tab1');
      expect(mgr.getState().tabs.length).toBe(1);
    });

    it('删除活跃标签应该切换到相邻标签', () => {
      const mgr = createTabManager([
        { key: 'tab1', label: 'Tab 1' },
        { key: 'tab2', label: 'Tab 2' },
        { key: 'tab3', label: 'Tab 3' },
      ]);
      mgr.setActive('tab2');
      mgr.removeTab('tab2');
      expect(mgr.getState().activeKey).toBe('tab3');
    });

    it('应该设置活跃标签', () => {
      const mgr = createTabManager([
        { key: 'tab1', label: 'Tab 1' },
        { key: 'tab2', label: 'Tab 2' },
      ]);
      mgr.setActive('tab2');
      expect(mgr.getState().activeKey).toBe('tab2');
    });

    it('无效标签不应该切换', () => {
      const mgr = createTabManager([{ key: 'tab1', label: 'Tab 1' }]);
      mgr.setActive('invalid');
      expect(mgr.getState().activeKey).toBe('tab1');
    });

    it('空标签列表初始化', () => {
      const mgr = createTabManager([]);
      expect(mgr.getState().activeKey).toBe('');
      expect(mgr.getState().tabs.length).toBe(0);
    });
  });

  describe('搜索高亮（生产 SearchHighlight 渲染）', () => {
    const renderHighlight = (text: string, query: string, caseSensitive = false) =>
      render(React.createElement(SearchHighlight, { text, query, caseSensitive }));

    it('应该高亮匹配文本', () => {
      const { container } = renderHighlight('Hello World', 'World');
      expect(container.querySelectorAll('mark')).toHaveLength(1);
      expect(container.querySelector('mark')?.textContent).toBe('World');
      expect(container.textContent).toBe('Hello World');
    });

    it('应该不区分大小写（默认）', () => {
      const { container } = renderHighlight('Hello World', 'hello');
      expect(container.querySelectorAll('mark')).toHaveLength(1);
      expect(container.querySelector('mark')?.textContent).toBe('Hello');
    });

    it('应该支持区分大小写', () => {
      const { container } = renderHighlight('Hello World', 'hello', true);
      expect(container.querySelectorAll('mark')).toHaveLength(0);
      expect(container.textContent).toBe('Hello World');
    });

    it('空查询不应该高亮', () => {
      const { container } = renderHighlight('Hello World', '');
      expect(container.querySelectorAll('mark')).toHaveLength(0);
      expect(container.textContent).toBe('Hello World');
    });

    it('正则特殊字符应该被转义', () => {
      const { container } = renderHighlight('Price: $100', '$100');
      expect(container.querySelectorAll('mark')).toHaveLength(1);
      expect(container.querySelector('mark')?.textContent).toBe('$100');
    });

    it('多次匹配都应该高亮', () => {
      const { container } = renderHighlight('abc abc abc', 'abc');
      expect(container.querySelectorAll('mark')).toHaveLength(3);
    });

    it('多关键词（空格分隔）都应该高亮', () => {
      const { container } = renderHighlight('Hello World', 'Hello World');
      const marks = container.querySelectorAll('mark');
      expect(Array.from(marks).map(m => m.textContent)).toEqual(['Hello', 'World']);
      expect(container.textContent).toBe('Hello World');
    });
  });

  describe('相对时间（生产 i18nManager.formatRelativeTime）', () => {
    const NOW = Date.parse('2024-06-15T12:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('刚刚（<1分钟）', () => {
      expect(formatRelativeTime(NOW - 30000)).toBe('30秒钟前');
    });

    it('分钟前', () => {
      expect(formatRelativeTime(NOW - 300000)).toBe('5分钟前');
    });

    it('小时前', () => {
      expect(formatRelativeTime(NOW - 7200000)).toBe('2小时前');
    });

    it('天前', () => {
      expect(formatRelativeTime(NOW - 172800000)).toBe('前天');
    });

    it('月前', () => {
      expect(formatRelativeTime(NOW - 5184000000)).toBe('2个月前');
    });

    it('年前', () => {
      expect(formatRelativeTime(NOW - 63072000000)).toBe('2年前');
    });
  });
});