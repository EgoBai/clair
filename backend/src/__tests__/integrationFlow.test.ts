import { describe, it, expect } from 'vitest';

// 数据流完整性测试
describe('Data Flow Pipeline', () => {
  interface RawData { symbol: string; price: string; volume: string; timestamp: string; }
  interface ProcessedData { symbol: string; price: number; volume: number; timestamp: number; change?: number; }
  interface ValidatedData extends ProcessedData { isValid: boolean; errors: string[]; }

  const parseRaw = (raw: RawData): ProcessedData => ({
    symbol: raw.symbol.trim().toUpperCase(),
    price: parseFloat(raw.price),
    volume: parseInt(raw.volume, 10),
    timestamp: new Date(raw.timestamp).getTime(),
  });

  const validate = (data: ProcessedData): ValidatedData => {
    const errors: string[] = [];
    if (isNaN(data.price) || data.price < 0) errors.push('invalid price');
    if (isNaN(data.volume) || data.volume < 0) errors.push('invalid volume');
    if (isNaN(data.timestamp)) errors.push('invalid timestamp');
    return { ...data, isValid: errors.length === 0, errors };
  };

  const enrich = (data: ValidatedData, prevClose: number): ValidatedData & { change: number; changePercent: number } => ({
    ...data,
    change: data.price - prevClose,
    changePercent: prevClose > 0 ? ((data.price - prevClose) / prevClose) * 100 : 0,
  });

  it('parse → validate → enrich happy path', () => {
    const raw: RawData = { symbol: ' 600519 ', price: '1800.50', volume: '1000000', timestamp: '2026-03-24T10:00:00Z' };
    const parsed = parseRaw(raw);
    expect(parsed.symbol).toBe('600519');
    expect(parsed.price).toBe(1800.50);

    const validated = validate(parsed);
    expect(validated.isValid).toBe(true);

    const enriched = enrich(validated, 1780);
    expect(enriched.change).toBeCloseTo(20.5, 1);
    expect(enriched.changePercent).toBeCloseTo(1.15, 1);
  });

  it('handles invalid price in pipeline', () => {
    const raw: RawData = { symbol: '000001', price: 'abc', volume: '1000', timestamp: '2026-03-24' };
    const validated = validate(parseRaw(raw));
    expect(validated.isValid).toBe(false);
    expect(validated.errors).toContain('invalid price');
  });

  it('handles zero prevClose without division error', () => {
    const data: ValidatedData = { symbol: 'TEST', price: 100, volume: 1000, timestamp: Date.now(), isValid: true, errors: [] };
    const enriched = enrich(data, 0);
    expect(enriched.changePercent).toBe(0);
    expect(Number.isFinite(enriched.changePercent)).toBe(true);
  });

  it('batch processing maintains order', () => {
    const raws: RawData[] = [
      { symbol: 'A', price: '10', volume: '100', timestamp: '2026-03-24' },
      { symbol: 'B', price: '20', volume: '200', timestamp: '2026-03-24' },
      { symbol: 'C', price: '30', volume: '300', timestamp: '2026-03-24' },
    ];
    const results = raws.map(r => validate(parseRaw(r)));
    expect(results.map(r => r.symbol)).toEqual(['A', 'B', 'C']);
  });

  it('filters invalid records from batch', () => {
    const raws: RawData[] = [
      { symbol: 'A', price: '10', volume: '100', timestamp: '2026-03-24' },
      { symbol: 'B', price: '-5', volume: '200', timestamp: '2026-03-24' },
      { symbol: 'C', price: '30', volume: '300', timestamp: '2026-03-24' },
    ];
    const valid = raws.map(r => validate(parseRaw(r))).filter(v => v.isValid);
    expect(valid.length).toBe(2);
  });
});

// 状态同步测试
describe('State Synchronization', () => {
  interface AppState {
    theme: 'light' | 'dark';
    language: 'zh' | 'en';
    watchlist: string[];
    filters: { market: string; industry: string; sortBy: string; sortOrder: string };
  }

  const stateToURL = (state: AppState): URLSearchParams => {
    const params = new URLSearchParams();
    params.set('theme', state.theme);
    params.set('lang', state.language);
    if (state.filters.market) params.set('market', state.filters.market);
    if (state.filters.sortBy) params.set('sort', state.filters.sortBy);
    if (state.filters.sortOrder) params.set('order', state.filters.sortOrder);
    return params;
  };

  const urlToState = (params: URLSearchParams, defaults: AppState): AppState => ({
    theme: (params.get('theme') as AppState['theme']) || defaults.theme,
    language: (params.get('lang') as AppState['language']) || defaults.language,
    watchlist: defaults.watchlist,
    filters: {
      market: params.get('market') || defaults.filters.market,
      industry: defaults.filters.industry,
      sortBy: params.get('sort') || defaults.filters.sortBy,
      sortOrder: params.get('order') || defaults.filters.sortOrder,
    },
  });

  const defaults: AppState = { theme: 'light', language: 'zh', watchlist: [], filters: { market: '', industry: '', sortBy: 'price', sortOrder: 'desc' } };

  it('round-trips state through URL', () => {
    const state: AppState = { ...defaults, theme: 'dark', language: 'en', filters: { ...defaults.filters, market: 'sz', sortBy: 'changePercent' } };
    const params = stateToURL(state);
    const restored = urlToState(params, defaults);
    expect(restored.theme).toBe('dark');
    expect(restored.language).toBe('en');
    expect(restored.filters.market).toBe('sz');
    expect(restored.filters.sortBy).toBe('changePercent');
  });

  it('uses defaults for missing URL params', () => {
    const params = new URLSearchParams();
    const restored = urlToState(params, defaults);
    expect(restored.theme).toBe('light');
    expect(restored.filters.sortBy).toBe('price');
  });

  it('merges state updates correctly', () => {
    const merge = (prev: AppState, update: Partial<AppState>): AppState => ({ ...prev, ...update });
    const updated = merge(defaults, { theme: 'dark' });
    expect(updated.theme).toBe('dark');
    expect(updated.language).toBe('zh');
  });

  it('watchlist deduplication', () => {
    const addToWatchlist = (list: string[], symbol: string) =>
      list.includes(symbol) ? list : [...list, symbol];
    const list = addToWatchlist(['600519', '000858'], '600519');
    expect(list.length).toBe(2);
    const list2 = addToWatchlist(['600519', '000858'], '601318');
    expect(list2.length).toBe(3);
  });

  it('watchlist removal', () => {
    const removeFromWatchlist = (list: string[], symbol: string) =>
      list.filter(s => s !== symbol);
    const list = removeFromWatchlist(['600519', '000858', '601318'], '000858');
    expect(list).toEqual(['600519', '601318']);
  });
});

// 缓存策略集成测试
describe('Cache Strategy Integration', () => {
  interface CacheEntry<T> { data: T; expiry: number; hits: number; }

  const createCache = (ttlMs: number) => {
    const store = new Map<string, CacheEntry<unknown>>();
    return {
      get<T>(key: string): T | null {
        const entry = store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) { store.delete(key); return null; }
        entry.hits++;
        return entry.data as T;
      },
      set<T>(key: string, data: T): void {
        store.set(key, { data, expiry: Date.now() + ttlMs, hits: 0 });
      },
      invalidate(pattern: string): void {
        for (const key of store.keys()) {
          if (key.includes(pattern)) store.delete(key);
        }
      },
      stats() {
        let totalHits = 0;
        store.forEach(e => { totalHits += e.hits; });
        return { entries: store.size, totalHits };
      },
    };
  };

  it('caches and retrieves data', () => {
    const cache = createCache(30000);
    cache.set('stock:600519', { price: 1800 });
    const data = cache.get<{ price: number }>('stock:600519');
    expect(data?.price).toBe(1800);
  });

  it('returns null for expired entries', () => {
    const cache = createCache(1); // 1ms TTL
    cache.set('key', 'value');
    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait */ }
    const data = cache.get('key');
    expect(data).toBeNull();
  });

  it('returns null for missing keys', () => {
    const cache = createCache(30000);
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('tracks hit count', () => {
    const cache = createCache(30000);
    cache.set('key', 'val');
    cache.get('key');
    cache.get('key');
    cache.get('key');
    expect(cache.stats().totalHits).toBe(3);
  });

  it('invalidates by pattern', () => {
    const cache = createCache(30000);
    cache.set('stock:600519', 1);
    cache.set('stock:000858', 2);
    cache.set('etf:510300', 3);
    cache.invalidate('stock:');
    expect(cache.get('stock:600519')).toBeNull();
    expect(cache.get('stock:000858')).toBeNull();
    expect(cache.get('etf:510300')).toBe(3);
  });

  it('stats reflect correct counts', () => {
    const cache = createCache(30000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.stats().entries).toBe(3);
  });
});

// 权限与安全逻辑测试
describe('Authorization Logic', () => {
  type Role = 'guest' | 'user' | 'admin';
  interface Permission { resource: string; actions: string[]; }

  const rolePermissions: Record<Role, Permission[]> = {
    guest: [{ resource: 'stock', actions: ['read'] }, { resource: 'news', actions: ['read'] }],
    user: [{ resource: 'stock', actions: ['read'] }, { resource: 'watchlist', actions: ['read', 'write'] }, { resource: 'portfolio', actions: ['read', 'write'] }],
    admin: [{ resource: '*', actions: ['*'] }],
  };

  const hasPermission = (role: Role, resource: string, action: string): boolean => {
    const perms = rolePermissions[role];
    return perms.some(p =>
      (p.resource === '*' || p.resource === resource) &&
      (p.actions.includes('*') || p.actions.includes(action))
    );
  };

  it('guest can read stocks', () => {
    expect(hasPermission('guest', 'stock', 'read')).toBe(true);
  });

  it('guest cannot write watchlist', () => {
    expect(hasPermission('guest', 'watchlist', 'write')).toBe(false);
  });

  it('user can manage watchlist', () => {
    expect(hasPermission('user', 'watchlist', 'read')).toBe(true);
    expect(hasPermission('user', 'watchlist', 'write')).toBe(true);
  });

  it('admin has full access', () => {
    expect(hasPermission('admin', 'anything', 'delete')).toBe(true);
  });

  it('user cannot access admin resources', () => {
    expect(hasPermission('user', 'admin-panel', 'read')).toBe(false);
  });
});

// 数据聚合测试
describe('Data Aggregation', () => {
  interface Trade { symbol: string; price: number; volume: number; side: 'buy' | 'sell'; timestamp: number; }

  const trades: Trade[] = [
    { symbol: '600519', price: 1800, volume: 100, side: 'buy', timestamp: 1 },
    { symbol: '600519', price: 1810, volume: 200, side: 'sell', timestamp: 2 },
    { symbol: '000858', price: 150, volume: 300, side: 'buy', timestamp: 3 },
    { symbol: '600519', price: 1790, volume: 150, side: 'buy', timestamp: 4 },
  ];

  it('aggregates volume by symbol', () => {
    const bySymbol = new Map<string, number>();
    trades.forEach(t => { bySymbol.set(t.symbol, (bySymbol.get(t.symbol) || 0) + t.volume); });
    expect(bySymbol.get('600519')).toBe(450);
    expect(bySymbol.get('000858')).toBe(300);
  });

  it('calculates VWAP by symbol', () => {
    const vwapBySymbol = (trades: Trade[]) => {
      const bySymbol = new Map<string, { amount: number; volume: number }>();
      trades.forEach(t => {
        const curr = bySymbol.get(t.symbol) || { amount: 0, volume: 0 };
        curr.amount += t.price * t.volume;
        curr.volume += t.volume;
        bySymbol.set(t.symbol, curr);
      });
      const result = new Map<string, number>();
      bySymbol.forEach((v, k) => { result.set(k, v.volume > 0 ? v.amount / v.volume : 0); });
      return result;
    };
    const vwap = vwapBySymbol(trades);
    expect(vwap.get('600519')).toBeCloseTo(1801.11, 0);
  });

  it('separates buy/sell volume', () => {
    const buyVol = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.volume, 0);
    const sellVol = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.volume, 0);
    expect(buyVol).toBe(550);
    expect(sellVol).toBe(200);
  });

  it('calculates net flow (buy - sell)', () => {
    const netFlow = trades.reduce((s, t) => s + (t.side === 'buy' ? 1 : -1) * t.price * t.volume, 0);
    expect(netFlow).toBe(1800 * 100 - 1810 * 200 + 150 * 300 + 1790 * 150);
  });
});
