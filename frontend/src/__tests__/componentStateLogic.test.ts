import { describe, it, expect } from 'vitest';

// 组件状态逻辑测试
describe('组件状态逻辑', () => {
  // Tab管理器
  describe('Tab管理器', () => {
    interface Tab {
      key: string;
      label: string;
      closable: boolean;
      content?: string;
    }

    function createTabManager(initialTabs: Tab[] = []) {
      let tabs = [...initialTabs];
      let activeKey = tabs.length > 0 ? tabs[0].key : '';

      return {
        getTabs: () => tabs,
        getActiveKey: () => activeKey,
        addTab: (tab: Tab) => {
          if (!tabs.find(t => t.key === tab.key)) {
            tabs = [...tabs, tab];
          }
          activeKey = tab.key;
        },
        removeTab: (key: string) => {
          const tab = tabs.find(t => t.key === key);
          if (!tab?.closable) return;
          const idx = tabs.findIndex(t => t.key === key);
          tabs = tabs.filter(t => t.key !== key);
          if (activeKey === key) {
            activeKey = tabs[Math.min(idx, tabs.length - 1)]?.key || '';
          }
        },
        setActive: (key: string) => {
          if (tabs.find(t => t.key === key)) activeKey = key;
        },
        closeOthers: (key: string) => {
          tabs = tabs.filter(t => t.key === key || !t.closable);
          activeKey = key;
        },
        closeAll: () => {
          tabs = tabs.filter(t => !t.closable);
          activeKey = tabs[0]?.key || '';
        },
      };
    }

    it('应该能添加Tab', () => {
      const mgr = createTabManager();
      mgr.addTab({ key: 'a', label: 'A', closable: true });
      expect(mgr.getTabs()).toHaveLength(1);
      expect(mgr.getActiveKey()).toBe('a');
    });

    it('重复添加应该跳过', () => {
      const mgr = createTabManager();
      mgr.addTab({ key: 'a', label: 'A', closable: true });
      mgr.addTab({ key: 'a', label: 'A', closable: true });
      expect(mgr.getTabs()).toHaveLength(1);
    });

    it('应该能删除可关闭Tab', () => {
      const mgr = createTabManager([
        { key: 'a', label: 'A', closable: true },
        { key: 'b', label: 'B', closable: true },
      ]);
      mgr.removeTab('a');
      expect(mgr.getTabs()).toHaveLength(1);
    });

    it('不可关闭Tab不应该被删除', () => {
      const mgr = createTabManager([
        { key: 'home', label: '首页', closable: false },
        { key: 'a', label: 'A', closable: true },
      ]);
      mgr.removeTab('home');
      expect(mgr.getTabs()).toHaveLength(2);
    });

    it('删除活跃Tab应该切换到相邻Tab', () => {
      const mgr = createTabManager([
        { key: 'a', label: 'A', closable: true },
        { key: 'b', label: 'B', closable: true },
      ]);
      mgr.setActive('a');
      mgr.removeTab('a');
      expect(mgr.getActiveKey()).toBe('b');
    });

    it('应该能关闭其他Tab', () => {
      const mgr = createTabManager([
        { key: 'a', label: 'A', closable: true },
        { key: 'b', label: 'B', closable: true },
        { key: 'home', label: '首页', closable: false },
      ]);
      mgr.closeOthers('b');
      const tabs = mgr.getTabs();
      expect(tabs.find(t => t.key === 'b')).toBeDefined();
      expect(tabs.find(t => t.key === 'home')).toBeDefined();
      expect(tabs.find(t => t.key === 'a')).toBeUndefined();
    });

    it('应该能关闭所有可关闭Tab', () => {
      const mgr = createTabManager([
        { key: 'a', label: 'A', closable: true },
        { key: 'home', label: '首页', closable: false },
      ]);
      mgr.closeAll();
      expect(mgr.getTabs()).toHaveLength(1);
      expect(mgr.getActiveKey()).toBe('home');
    });

    it('设置不存在的活跃Tab应该忽略', () => {
      const mgr = createTabManager([
        { key: 'a', label: 'A', closable: true },
      ]);
      mgr.setActive('nonexistent');
      expect(mgr.getActiveKey()).toBe('a');
    });
  });

  // 模态框栈
  describe('模态框栈', () => {
    function createModalStack() {
      const stack: { id: string; data: unknown }[] = [];

      return {
        open: (id: string, data?: unknown) => {
          stack.push({ id, data });
        },
        close: (id: string) => {
          const idx = stack.findIndex(m => m.id === id);
          if (idx >= 0) stack.splice(idx, 1);
        },
        closeTop: () => {
          stack.pop();
        },
        isOpen: (id: string) => stack.some(m => m.id === id),
        getStack: () => [...stack],
        count: () => stack.length,
        top: () => stack[stack.length - 1] || null,
      };
    }

    it('应该能打开模态框', () => {
      const stack = createModalStack();
      stack.open('modal1');
      expect(stack.isOpen('modal1')).toBe(true);
      expect(stack.count()).toBe(1);
    });

    it('应该支持多层模态框', () => {
      const stack = createModalStack();
      stack.open('m1');
      stack.open('m2');
      stack.open('m3');
      expect(stack.count()).toBe(3);
      expect(stack.top()?.id).toBe('m3');
    });

    it('应该能关闭指定模态框', () => {
      const stack = createModalStack();
      stack.open('m1');
      stack.open('m2');
      stack.close('m1');
      expect(stack.isOpen('m1')).toBe(false);
      expect(stack.isOpen('m2')).toBe(true);
    });

    it('应该能关闭顶层模态框', () => {
      const stack = createModalStack();
      stack.open('m1');
      stack.open('m2');
      stack.closeTop();
      expect(stack.top()?.id).toBe('m1');
    });

    it('空栈关闭应该安全', () => {
      const stack = createModalStack();
      stack.closeTop();
      expect(stack.count()).toBe(0);
    });

    it('应该支持传递数据', () => {
      const stack = createModalStack();
      stack.open('confirm', { message: '确定删除？' });
      expect(stack.top()?.data).toEqual({ message: '确定删除？' });
    });
  });

  // 分页控制器
  describe('分页控制器', () => {
    function createPaginator(total: number, pageSize: number = 10) {
      let current = 1;
      const totalPages = Math.ceil(total / pageSize);

      return {
        getCurrent: () => current,
        getTotalPages: () => totalPages,
        getPageSize: () => pageSize,
        hasNext: () => current < totalPages,
        hasPrev: () => current > 1,
        next: () => { if (current < totalPages) current++; },
        prev: () => { if (current > 1) current--; },
        goTo: (page: number) => { current = Math.max(1, Math.min(totalPages, page)); },
        first: () => { current = 1; },
        last: () => { current = totalPages; },
        getPageRange: () => {
          const start = Math.max(1, current - 2);
          const end = Math.min(totalPages, current + 2);
          return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        },
        getOffset: () => (current - 1) * pageSize,
        getInfo: () => ({
          start: (current - 1) * pageSize + 1,
          end: Math.min(current * pageSize, total),
          total,
        }),
      };
    }

    it('应该正确计算总页数', () => {
      expect(createPaginator(100, 10).getTotalPages()).toBe(10);
      expect(createPaginator(95, 10).getTotalPages()).toBe(10);
      expect(createPaginator(101, 10).getTotalPages()).toBe(11);
    });

    it('初始页应该是1', () => {
      expect(createPaginator(100).getCurrent()).toBe(1);
    });

    it('应该能翻页', () => {
      const p = createPaginator(100);
      p.next();
      expect(p.getCurrent()).toBe(2);
      p.prev();
      expect(p.getCurrent()).toBe(1);
    });

    it('第一页不应该有上一页', () => {
      expect(createPaginator(100).hasPrev()).toBe(false);
    });

    it('最后一页不应该有下一页', () => {
      const p = createPaginator(100);
      p.last();
      expect(p.hasNext()).toBe(false);
    });

    it('跳转超出范围应该钳制', () => {
      const p = createPaginator(100);
      p.goTo(100);
      expect(p.getCurrent()).toBe(10);
      p.goTo(-1);
      expect(p.getCurrent()).toBe(1);
    });

    it('页码范围应该正确', () => {
      const p = createPaginator(100);
      p.goTo(5);
      const range = p.getPageRange();
      expect(range).toContain(3);
      expect(range).toContain(5);
      expect(range).toContain(7);
    });

    it('偏移量应该正确计算', () => {
      const p = createPaginator(100);
      p.goTo(3);
      expect(p.getOffset()).toBe(20);
    });

    it('信息应该正确', () => {
      const p = createPaginator(95);
      p.goTo(5);
      const info = p.getInfo();
      expect(info.start).toBe(41);
      expect(info.end).toBe(50);
      expect(info.total).toBe(95);
    });

    it('最后一页信息应该正确', () => {
      const p = createPaginator(95);
      p.last();
      const info = p.getInfo();
      expect(info.start).toBe(91);
      expect(info.end).toBe(95);
    });

    it('零总数应该返回零页', () => {
      const p = createPaginator(0);
      expect(p.getTotalPages()).toBe(0);
      expect(p.hasNext()).toBe(false);
    });
  });

  // 排序控制器
  describe('排序控制器', () => {
    interface SortConfig {
      field: string;
      order: 'asc' | 'desc';
    }

    function createSorter<T>(data: T[], defaultField?: string) {
      let sortConfig: SortConfig | null = defaultField ? { field: defaultField, order: 'asc' } : null;

      return {
        getSortConfig: () => sortConfig,
        sort: (field: string) => {
          if (sortConfig?.field === field) {
            sortConfig = { field, order: sortConfig.order === 'asc' ? 'desc' : 'asc' };
          } else {
            sortConfig = { field, order: 'asc' };
          }
        },
        clear: () => { sortConfig = null; },
        apply: (): T[] => {
          if (!sortConfig) return [...data];
          return [...data].sort((a, b) => {
            const aVal = (a as Record<string, unknown>)[sortConfig!.field];
            const bVal = (b as Record<string, unknown>)[sortConfig!.field];
            if (typeof aVal === 'number' && typeof bVal === 'number') {
              return sortConfig!.order === 'asc' ? aVal - bVal : bVal - aVal;
            }
            const cmp = String(aVal).localeCompare(String(bVal));
            return sortConfig!.order === 'asc' ? cmp : -cmp;
          });
        },
      };
    }

    it('默认应该不排序', () => {
      const sorter = createSorter([{ name: 'b' }, { name: 'a' }]);
      expect(sorter.getSortConfig()).toBeNull();
      expect(sorter.apply()).toEqual([{ name: 'b' }, { name: 'a' }]);
    });

    it('排序应该正确', () => {
      const data = [{ price: 30 }, { price: 10 }, { price: 20 }];
      const sorter = createSorter(data);
      sorter.sort('price');
      expect(sorter.apply()[0].price).toBe(10);
    });

    it('再次排序同字段应该切换方向', () => {
      const data = [{ price: 30 }, { price: 10 }, { price: 20 }];
      const sorter = createSorter(data);
      sorter.sort('price');
      sorter.sort('price');
      expect(sorter.apply()[0].price).toBe(30);
    });

    it('排序不同字段应该重置为升序', () => {
      const data = [
        { price: 30, name: 'c' },
        { price: 10, name: 'a' },
        { price: 20, name: 'b' },
      ];
      const sorter = createSorter(data);
      sorter.sort('price');
      sorter.sort('name');
      expect(sorter.getSortConfig()?.order).toBe('asc');
    });

    it('清除排序应该恢复原序', () => {
      const data = [{ price: 30 }, { price: 10 }];
      const sorter = createSorter(data);
      sorter.sort('price');
      sorter.clear();
      expect(sorter.apply()[0].price).toBe(30);
    });

    it('字符串排序应该正确', () => {
      const data = [{ name: 'banana' }, { name: 'apple' }, { name: 'cherry' }];
      const sorter = createSorter(data);
      sorter.sort('name');
      expect(sorter.apply()[0].name).toBe('apple');
    });
  });
});
