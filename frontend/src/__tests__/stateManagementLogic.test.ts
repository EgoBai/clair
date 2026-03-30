import { describe, it, expect, beforeEach } from 'vitest';

describe('State Management Logic', () => {
  describe('Watchlist State Logic', () => {
    interface WatchlistItem { symbol: string; name: string; groupId: string; addedAt: string; }
    interface WatchlistGroup { id: string; name: string; items: WatchlistItem[]; }

    function addToWatchlist(groups: WatchlistGroup[], symbol: string, name: string, groupId: string = 'default'): WatchlistGroup[] {
      const exists = groups.some(g => g.items.some(i => i.symbol === symbol));
      if (exists) return groups;
      return groups.map(g =>
        g.id === groupId
          ? { ...g, items: [...g.items, { symbol, name, groupId, addedAt: new Date().toISOString() }] }
          : g
      );
    }

    function removeFromWatchlist(groups: WatchlistGroup[], symbol: string): WatchlistGroup[] {
      return groups.map(g => ({ ...g, items: g.items.filter(i => i.symbol !== symbol) }));
    }

    function createGroup(groups: WatchlistGroup[], name: string): WatchlistGroup[] {
      const id = `group-${Date.now()}`;
      return [...groups, { id, name, items: [] }];
    }

    function deleteGroup(groups: WatchlistGroup[], groupId: string): WatchlistGroup[] {
      const group = groups.find(g => g.id === groupId);
      if (!group) return groups;
      const defaultGroup = groups.find(g => g.id === 'default');
      const itemsToMove = group.items;
      return groups
        .filter(g => g.id !== groupId)
        .map(g => g.id === 'default' ? { ...g, items: [...g.items, ...itemsToMove] } : g);
    }

    function isInWatchlist(groups: WatchlistGroup[], symbol: string): boolean {
      return groups.some(g => g.items.some(i => i.symbol === symbol));
    }

    let groups: WatchlistGroup[];

    beforeEach(() => {
      groups = [{ id: 'default', name: '默认分组', items: [] }];
    });

    it('should add stock to default group', () => {
      const result = addToWatchlist(groups, '600519', '贵州茅台');
      expect(result[0].items.length).toBe(1);
      expect(result[0].items[0].symbol).toBe('600519');
    });

    it('should not add duplicate', () => {
      let result = addToWatchlist(groups, '600519', '贵州茅台');
      result = addToWatchlist(result, '600519', '贵州茅台');
      expect(result[0].items.length).toBe(1);
    });

    it('should remove stock', () => {
      let result = addToWatchlist(groups, '600519', '贵州茅台');
      result = removeFromWatchlist(result, '600519');
      expect(result[0].items.length).toBe(0);
    });

    it('should create new group', () => {
      const result = createGroup(groups, '银行股');
      expect(result.length).toBe(2);
      expect(result[1].name).toBe('银行股');
    });

    it('should delete group and move items to default', () => {
      let result = createGroup(groups, '银行股');
      const bankGroupId = result[1].id;
      result = addToWatchlist(result, '601318', '中国平安', bankGroupId);
      result = deleteGroup(result, bankGroupId);
      expect(result.length).toBe(1);
      expect(result[0].items.some(i => i.symbol === '601318')).toBe(true);
    });

    it('should check if stock is in watchlist', () => {
      let result = addToWatchlist(groups, '600519', '贵州茅台');
      expect(isInWatchlist(result, '600519')).toBe(true);
      expect(isInWatchlist(result, '000858')).toBe(false);
    });

    it('should handle removing non-existent stock', () => {
      const result = removeFromWatchlist(groups, 'NONEXIST');
      expect(result).toEqual(groups);
    });

    it('should handle deleting non-existent group', () => {
      const result = deleteGroup(groups, 'nonexistent');
      expect(result).toEqual(groups);
    });
  });

  describe('URL State Sync Logic', () => {
    function toURLParams(state: Record<string, unknown>): URLSearchParams {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(state)) {
        if (value !== null && value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      return params;
    }

    function fromURLParams<T extends Record<string, unknown>>(params: URLSearchParams, defaults: T): T {
      const result = { ...defaults };
      for (const [key, value] of params.entries()) {
        if (key in defaults) {
          const defaultVal = defaults[key];
          if (typeof defaultVal === 'number') (result as any)[key] = Number(value);
          else if (typeof defaultVal === 'boolean') (result as any)[key] = value === 'true';
          else (result as any)[key] = value;
        }
      }
      return result;
    }

    it('should convert state to URL params', () => {
      const params = toURLParams({ page: 1, q: '茅台', sortBy: 'changePercent' });
      expect(params.get('page')).toBe('1');
      expect(params.get('q')).toBe('茅台');
      expect(params.get('sortBy')).toBe('changePercent');
    });

    it('should skip null/undefined/empty values', () => {
      const params = toURLParams({ a: null, b: undefined, c: '', d: 'value' });
      expect(params.has('a')).toBe(false);
      expect(params.has('b')).toBe(false);
      expect(params.has('c')).toBe(false);
      expect(params.get('d')).toBe('value');
    });

    it('should restore state from URL params', () => {
      const params = new URLSearchParams('page=2&q=茅台&sortBy=price');
      const state = fromURLParams(params, { page: 1, q: '', sortBy: 'changePercent', market: 'all' });
      expect(state.page).toBe(2);
      expect(state.q).toBe('茅台');
      expect(state.sortBy).toBe('price');
      expect(state.market).toBe('all'); // default kept
    });

    it('should parse boolean from URL', () => {
      const params = new URLSearchParams('showVolume=true&dark=false');
      const state = fromURLParams(params, { showVolume: false, dark: true });
      expect(state.showVolume).toBe(true);
      expect(state.dark).toBe(false);
    });

    it('should handle roundtrip conversion', () => {
      const original = { page: 3, q: 'test', sortBy: 'volume', limit: 50 };
      const params = toURLParams(original);
      const restored = fromURLParams(params, original);
      expect(restored).toEqual(original);
    });
  });

  describe('Theme State Logic', () => {
    function resolveTheme(preference: 'light' | 'dark' | 'system', systemDark: boolean): 'light' | 'dark' {
      if (preference === 'system') return systemDark ? 'dark' : 'light';
      return preference;
    }

    it('should return light for light preference', () => {
      expect(resolveTheme('light', true)).toBe('light');
    });

    it('should return dark for dark preference', () => {
      expect(resolveTheme('dark', false)).toBe('dark');
    });

    it('should follow system for system preference', () => {
      expect(resolveTheme('system', true)).toBe('dark');
      expect(resolveTheme('system', false)).toBe('light');
    });
  });

  describe('Notification State Logic', () => {
    interface Notification { id: string; type: string; message: string; read: boolean; createdAt: string; }

    let _nid = 0;
    function addNotification(list: Notification[], type: string, message: string): Notification[] {
      return [{ id: `n-${++_nid}`, type, message, read: false, createdAt: new Date().toISOString() }, ...list];
    }

    function markRead(list: Notification[], id: string): Notification[] {
      return list.map(n => n.id === id ? { ...n, read: true } : n);
    }

    function markAllRead(list: Notification[]): Notification[] {
      return list.map(n => ({ ...n, read: true }));
    }

    function unreadCount(list: Notification[]): number {
      return list.filter(n => !n.read).length;
    }

    it('should add notification to front', () => {
      const list = addNotification([], 'alert', 'Price alert');
      expect(list.length).toBe(1);
      expect(list[0].read).toBe(false);
    });

    it('should mark single as read', () => {
      let list = addNotification([], 'alert', 'msg1');
      list = addNotification(list, 'info', 'msg2');
      list = markRead(list, list[1].id);
      expect(list[1].read).toBe(true);
      expect(list[0].read).toBe(false);
    });

    it('should mark all as read', () => {
      let list = addNotification([], 'alert', 'msg1');
      list = addNotification(list, 'info', 'msg2');
      list = markAllRead(list);
      expect(list.every(n => n.read)).toBe(true);
    });

    it('should count unread', () => {
      let list = addNotification([], 'alert', 'msg1');
      list = addNotification(list, 'info', 'msg2');
      expect(unreadCount(list)).toBe(2);
      list = markRead(list, list[0].id);
      expect(unreadCount(list)).toBe(1);
    });
  });
});
