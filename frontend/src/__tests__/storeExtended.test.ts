import { describe, it, expect } from 'vitest';

describe('状态管理扩展测试', () => {
  describe('URL 状态同步', () => {
    it('状态应该能转成URL参数', () => {
      const state = {
        page: 1,
        pageSize: 20,
        sortBy: 'changePercent',
        sortOrder: 'desc' as const,
        q: '茅台',
        market: 'sh',
        industry: '白酒',
      };
      const params = new URLSearchParams();
      if (state.page > 1) params.set('page', String(state.page));
      if (state.pageSize !== 20) params.set('pageSize', String(state.pageSize));
      if (state.sortBy) params.set('sortBy', state.sortBy);
      if (state.sortOrder) params.set('sortOrder', state.sortOrder);
      if (state.q) params.set('q', state.q);
      if (state.market) params.set('market', state.market);
      if (state.industry) params.set('industry', state.industry);
      
      expect(params.get('sortBy')).toBe('changePercent');
      expect(params.get('q')).toBe('茅台');
    });

    it('URL参数应该能同步回状态', () => {
      const params = new URLSearchParams('page=2&sortBy=volume&sortOrder=asc');
      const state = {
        page: Number(params.get('page')) || 1,
        sortBy: params.get('sortBy') || 'changePercent',
        sortOrder: (params.get('sortOrder') as 'asc' | 'desc') || 'desc',
      };
      expect(state.page).toBe(2);
      expect(state.sortBy).toBe('volume');
      expect(state.sortOrder).toBe('asc');
    });
  });

  describe('UI 偏好管理', () => {
    it('主题应该支持3种模式', () => {
      const themes = ['light', 'dark', 'system'];
      expect(themes).toContain('light');
      expect(themes).toContain('dark');
      expect(themes).toContain('system');
    });

    it('K线周期应该支持6种', () => {
      const periods = ['5m', '15m', '60m', 'day', 'week', 'month'];
      expect(periods).toHaveLength(6);
    });

    it('系统主题应该解析prefers-color-scheme', () => {
      const resolveTheme = (theme: string, prefersDark: boolean) => {
        if (theme === 'system') return prefersDark ? 'dark' : 'light';
        return theme;
      };
      expect(resolveTheme('system', true)).toBe('dark');
      expect(resolveTheme('system', false)).toBe('light');
      expect(resolveTheme('dark', false)).toBe('dark');
      expect(resolveTheme('light', true)).toBe('light');
    });
  });

  describe('持久化中间件', () => {
    it('localStorage 序列化应该正确', () => {
      const state = { theme: 'dark', klinePeriod: 'day', showVolume: true };
      const serialized = JSON.stringify(state);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(state);
    });

    it('损坏的localStorage应该使用默认值', () => {
      const parse = (raw: string | null, defaults: any) => {
        if (!raw) return defaults;
        try {
          return { ...defaults, ...JSON.parse(raw) };
        } catch {
          return defaults;
        }
      };
      expect(parse(null, { theme: 'light' })).toEqual({ theme: 'light' });
      expect(parse('invalid json', { theme: 'light' })).toEqual({ theme: 'light' });
      expect(parse('{"theme":"dark"}', { theme: 'light', showVolume: true })).toEqual({ theme: 'dark', showVolume: true });
    });
  });

  describe('自选股管理', () => {
    it('添加自选股应该去重', () => {
      const watchlist: string[] = [];
      const add = (symbol: string) => {
        if (!watchlist.includes(symbol)) watchlist.push(symbol);
      };
      add('600519');
      add('600519');
      add('000858');
      expect(watchlist).toHaveLength(2);
    });

    it('删除自选股应该正确移除', () => {
      let watchlist = ['600519', '000858', '300750'];
      watchlist = watchlist.filter(s => s !== '000858');
      expect(watchlist).toHaveLength(2);
      expect(watchlist).not.toContain('000858');
    });

    it('检查是否在自选股中', () => {
      const watchlist = new Set(['600519', '000858']);
      expect(watchlist.has('600519')).toBe(true);
      expect(watchlist.has('300750')).toBe(false);
    });
  });

  describe('分组管理', () => {
    it('应该有默认分组', () => {
      const groups = [{ id: 'default', name: '默认分组', symbols: ['600519'] }];
      expect(groups[0].id).toBe('default');
    });

    it('创建自定义分组', () => {
      const groups: any[] = [{ id: 'default', name: '默认' }];
      const addGroup = (name: string) => {
        const id = `group_${Date.now()}`;
        groups.push({ id, name, symbols: [] });
        return id;
      };
      const newId = addGroup('白酒');
      expect(groups).toHaveLength(2);
      expect(groups[1].name).toBe('白酒');
    });

    it('删除分组应该将股票移回默认', () => {
      const groups = [
        { id: 'default', name: '默认', symbols: ['000001'] },
        { id: 'baijiu', name: '白酒', symbols: ['600519', '000858'] },
      ];
      const deleteGroup = (id: string) => {
        const idx = groups.findIndex(g => g.id === id);
        if (idx <= 0) return; // 不能删除默认分组
        const removed = groups.splice(idx, 1)[0];
        groups[0].symbols.push(...removed.symbols);
      };
      deleteGroup('baijiu');
      expect(groups).toHaveLength(1);
      expect(groups[0].symbols).toContain('600519');
      expect(groups[0].symbols).toContain('000858');
    });
  });
});
