import { describe, it, expect } from 'vitest';

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

function createTableState<T>(data: T[], total: number, page = 1, pageSize = 20): TableState<T> {
  return { data, loading: false, page, pageSize, total, sortBy: '', sortOrder: 'asc', filters: {} };
}

function paginate<T>(data: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return data.slice(start, start + pageSize);
}

function sortData<T>(data: T[], key: string, order: 'asc' | 'desc'): T[] {
  return [...data].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[key];
    const bVal = (b as Record<string, unknown>)[key];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const aStr = String(aVal);
    const bStr = String(bVal);
    return order === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });
}

function filterData<T>(data: T[], filters: Record<string, (item: T) => boolean>): T[] {
  return data.filter(item => Object.values(filters).every(fn => fn(item)));
}

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

function createSearchHighlight(text: string, query: string, caseSensitive = false): string {
  if (!query) return text;
  const flags = caseSensitive ? 'g' : 'gi';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, flags), '<mark>$1</mark>');
}

function createRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`;
  if (diff < 31536000000) return `${Math.floor(diff / 2592000000)}个月前`;
  return `${Math.floor(diff / 31536000000)}年前`;
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

  describe('排序逻辑', () => {
    const data = [
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

  describe('筛选逻辑', () => {
    const data = [
      { name: 'AAPL', price: 150, sector: 'tech' },
      { name: 'JPM', price: 150, sector: 'finance' },
      { name: 'GOOGL', price: 2800, sector: 'tech' },
    ];

    it('应该按条件筛选', () => {
      const result = filterData(data, { tech: (d) => d.sector === 'tech' });
      expect(result.length).toBe(2);
    });

    it('多条件应该取交集', () => {
      const result = filterData(data, {
        tech: (d) => d.sector === 'tech',
        cheap: (d) => d.price < 200,
      });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('AAPL');
    });

    it('空筛选应该返回全部', () => {
      expect(filterData(data, {}).length).toBe(3);
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

  describe('搜索高亮', () => {
    it('应该高亮匹配文本', () => {
      expect(createSearchHighlight('Hello World', 'World')).toBe('Hello <mark>World</mark>');
    });

    it('应该不区分大小写（默认）', () => {
      expect(createSearchHighlight('Hello World', 'hello')).toBe('<mark>Hello</mark> World');
    });

    it('应该支持区分大小写', () => {
      expect(createSearchHighlight('Hello World', 'hello', true)).toBe('Hello World');
    });

    it('空查询不应该高亮', () => {
      expect(createSearchHighlight('Hello World', '')).toBe('Hello World');
    });

    it('正则特殊字符应该被转义', () => {
      expect(createSearchHighlight('Price: $100', '$100')).toBe('Price: <mark>$100</mark>');
    });

    it('多次匹配都应该高亮', () => {
      const result = createSearchHighlight('abc abc abc', 'abc');
      expect((result.match(/<mark>/g) || []).length).toBe(3);
    });
  });

  describe('相对时间', () => {
    const now = Date.now();

    it('刚刚（<1分钟）', () => {
      expect(createRelativeTime(now - 30000)).toBe('刚刚');
    });

    it('分钟前', () => {
      expect(createRelativeTime(now - 300000)).toBe('5分钟前');
    });

    it('小时前', () => {
      expect(createRelativeTime(now - 7200000)).toBe('2小时前');
    });

    it('天前', () => {
      expect(createRelativeTime(now - 172800000)).toBe('2天前');
    });

    it('月前', () => {
      expect(createRelativeTime(now - 5184000000)).toBe('2个月前');
    });

    it('年前', () => {
      expect(createRelativeTime(now - 63072000000)).toBe('2年前');
    });
  });
});
