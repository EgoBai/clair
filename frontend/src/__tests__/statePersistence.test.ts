import { describe, it, expect } from 'vitest';

// 状态持久化与同步测试
describe('状态持久化与同步', () => {
  // 序列化/反序列化
  describe('状态序列化', () => {
    interface AppState {
      theme: 'light' | 'dark';
      language: 'zh' | 'en';
      watchlist: string[];
      preferences: Record<string, unknown>;
    }

    function serializeState(state: AppState): string {
      return JSON.stringify(state, null, 0);
    }

    function deserializeState(json: string): AppState | null {
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    }

    function migrateState(state: Record<string, unknown>, version: number): Record<string, unknown> {
      // 版本迁移
      if (version === 1) {
        return { ...state, version: 2, theme: state.theme || 'light' };
      }
      if (version === 2) {
        return { ...state, version: 3, language: state.language || 'zh' };
      }
      return state;
    }

    it('应该正确序列化状态', () => {
      const state: AppState = {
        theme: 'dark',
        language: 'zh',
        watchlist: ['600519', '000001'],
        preferences: { showVolume: true },
      };
      const json = serializeState(state);
      expect(typeof json).toBe('string');
      expect(json).toContain('dark');
    });

    it('应该正确反序列化状态', () => {
      const json = '{"theme":"dark","language":"zh","watchlist":["600519"],"preferences":{}}';
      const state = deserializeState(json);
      expect(state?.theme).toBe('dark');
      expect(state?.watchlist).toEqual(['600519']);
    });

    it('无效JSON应该返回null', () => {
      expect(deserializeState('{invalid}')).toBeNull();
    });

    it('空字符串应该返回null', () => {
      expect(deserializeState('')).toBeNull();
    });

    it('v1应该迁移到v2', () => {
      const state = { watchlist: ['600519'] };
      const migrated = migrateState(state, 1);
      expect(migrated.version).toBe(2);
      expect(migrated.theme).toBe('light');
    });

    it('v2应该迁移到v3', () => {
      const state = { watchlist: ['600519'], theme: 'dark' };
      const migrated = migrateState(state, 2);
      expect(migrated.version).toBe(3);
      expect(migrated.language).toBe('zh');
    });

    it('序列化和反序列化应该是互逆操作', () => {
      const state: AppState = {
        theme: 'dark',
        language: 'en',
        watchlist: ['600519', '000001', '300750'],
        preferences: { klinePeriod: 'day', showVolume: true },
      };
      const json = serializeState(state);
      const restored = deserializeState(json);
      expect(restored).toEqual(state);
    });
  });

  // URL状态同步
  describe('URL状态同步', () => {
    function stateToURLParams(state: Record<string, unknown>): string {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(state)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          params.set(key, value.join(','));
        } else {
          params.set(key, String(value));
        }
      }
      return params.toString();
    }

    function urlParamsToState(params: string, schema: Record<string, 'string' | 'number' | 'boolean' | 'array'>): Record<string, unknown> {
      const searchParams = new URLSearchParams(params);
      const state: Record<string, unknown> = {};
      for (const [key, type] of Object.entries(schema)) {
        const value = searchParams.get(key);
        if (value === null) continue;
        switch (type) {
          case 'number': state[key] = Number(value); break;
          case 'boolean': state[key] = value === 'true'; break;
          case 'array': state[key] = value.split(',').filter(Boolean); break;
          default: state[key] = value;
        }
      }
      return state;
    }

    it('应该正确编码状态到URL参数', () => {
      const state = { page: 1, q: '茅台', market: 'sh' };
      const params = stateToURLParams(state);
      expect(params).toContain('page=1');
      expect(params).toContain('q=%E8%8C%85%E5%8F%B0');
    });

    it('应该正确解码URL参数到状态', () => {
      const params = 'page=2&q=茅台&market=sz';
      const schema = { page: 'number', q: 'string', market: 'string' };
      const state = urlParamsToState(params, schema);
      expect(state.page).toBe(2);
      expect(state.q).toBe('茅台');
      expect(state.market).toBe('sz');
    });

    it('布尔值应该正确处理', () => {
      const state = { showVolume: true, darkMode: false };
      const params = stateToURLParams(state);
      const restored = urlParamsToState(params, { showVolume: 'boolean', darkMode: 'boolean' });
      expect(restored.showVolume).toBe(true);
      expect(restored.darkMode).toBe(false);
    });

    it('数组应该逗号分隔', () => {
      const state = { tags: ['a', 'b', 'c'] };
      const params = stateToURLParams(state);
      expect(params).toContain('tags=a%2Cb%2Cc');
    });

    it('undefined和null应该跳过', () => {
      const state = { a: 1, b: undefined, c: null, d: 'test' };
      const params = stateToURLParams(state);
      expect(params).not.toContain('b=');
      expect(params).not.toContain('c=');
    });

    it('空状态应该返回空字符串', () => {
      expect(stateToURLParams({})).toBe('');
    });

    it('往返应该保持一致性', () => {
      const state = { page: 3, q: 'test', showVolume: true };
      const params = stateToURLParams(state);
      const schema = { page: 'number', q: 'string', showVolume: 'boolean' };
      const restored = urlParamsToState(params, schema);
      expect(restored).toEqual(state);
    });
  });

  // 自选股同步
  describe('自选股同步', () => {
    interface WatchlistItem {
      symbol: string;
      addedAt: number;
      group: string;
    }

    function syncWatchlist(local: WatchlistItem[], remote: WatchlistItem[]): WatchlistItem[] {
      const merged = new Map<string, WatchlistItem>();
      for (const item of local) merged.set(item.symbol, item);
      for (const item of remote) {
        const existing = merged.get(item.symbol);
        if (!existing || item.addedAt > existing.addedAt) {
          merged.set(item.symbol, item);
        }
      }
      return Array.from(merged.values()).sort((a, b) => a.addedAt - b.addedAt);
    }

    it('应该合并本地和远程', () => {
      const local: WatchlistItem[] = [
        { symbol: '600519', addedAt: 1, group: 'default' },
      ];
      const remote: WatchlistItem[] = [
        { symbol: '000001', addedAt: 2, group: 'default' },
      ];
      const merged = syncWatchlist(local, remote);
      expect(merged).toHaveLength(2);
    });

    it('相同股票应该保留较新的', () => {
      const local: WatchlistItem[] = [
        { symbol: '600519', addedAt: 1, group: 'default' },
      ];
      const remote: WatchlistItem[] = [
        { symbol: '600519', addedAt: 2, group: 'tech' },
      ];
      const merged = syncWatchlist(local, remote);
      expect(merged).toHaveLength(1);
      expect(merged[0].group).toBe('tech');
    });

    it('空列表应该返回另一个', () => {
      const items: WatchlistItem[] = [
        { symbol: '600519', addedAt: 1, group: 'default' },
      ];
      expect(syncWatchlist([], items)).toEqual(items);
      expect(syncWatchlist(items, [])).toEqual(items);
    });

    it('双方都空应该返回空', () => {
      expect(syncWatchlist([], [])).toEqual([]);
    });

    it('结果应该按时间排序', () => {
      const local: WatchlistItem[] = [
        { symbol: 'A', addedAt: 3, group: 'default' },
        { symbol: 'B', addedAt: 1, group: 'default' },
      ];
      const remote: WatchlistItem[] = [
        { symbol: 'C', addedAt: 2, group: 'default' },
      ];
      const merged = syncWatchlist(local, remote);
      expect(merged[0].symbol).toBe('B');
      expect(merged[1].symbol).toBe('C');
      expect(merged[2].symbol).toBe('A');
    });
  });

  // 偏好合并
  describe('偏好合并', () => {
    function mergePreferences(
      defaults: Record<string, unknown>,
      userPrefs: Record<string, unknown>,
      systemPrefs: Record<string, unknown>
    ): Record<string, unknown> {
      return { ...defaults, ...systemPrefs, ...userPrefs };
    }

    it('用户偏好应该覆盖系统偏好', () => {
      const defaults = { theme: 'light', lang: 'zh' };
      const system = { theme: 'dark' };
      const user = { theme: 'auto' };
      const merged = mergePreferences(defaults, user, system);
      expect(merged.theme).toBe('auto');
    });

    it('系统偏好应该覆盖默认值', () => {
      const defaults = { theme: 'light', lang: 'zh' };
      const system = { theme: 'dark' };
      const merged = mergePreferences(defaults, {}, system);
      expect(merged.theme).toBe('dark');
    });

    it('未设置的应该使用默认值', () => {
      const defaults = { theme: 'light', lang: 'zh', fontSize: 14 };
      const merged = mergePreferences(defaults, { theme: 'dark' }, {});
      expect(merged.lang).toBe('zh');
      expect(merged.fontSize).toBe(14);
    });
  });
});
