/**
 * useWatchlistData — 共享自选股数据加载 hook
 * WatchlistHubPage 使用此 hook 加载一次数据，然后通过 Context 传递给
 * 「自选追踪」和「AI复盘」两个 Tab 面板，避免重复请求。
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { DEMO_WATCHLIST, DEMO_WATCHLIST_GROUPS, DEMO_STOCKS } from '../utils/demoData';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WatchlistGroup {
  id: string;
  name: string;
  stocks: WatchlistStockItem[];
  isDefault?: boolean;
}

export interface WatchlistStockItem {
  symbol: string;
  name: string;
  market: string;
  sortIndex: number;
  groupId: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change: number;
  volume?: number;
  turnoverRate?: number;
  industry?: string;
  peRatio?: number;
  pbRatio?: number;
  marketCap?: number;
}

export interface AlertItem {
  symbol: string;
  name: string;
  alerts: Array<{
    type: string;
    level: string;
    message: string;
  }>;
}

export interface StrategySignal {
  signal: 'buy' | 'sell' | 'hold';
  score: number;
}

export interface WatchlistDataState {
  /** All groups from localStorage */
  groups: WatchlistGroup[];
  /** Flat list of all symbols across groups */
  allSymbols: string[];
  /** Total stock count */
  totalCount: number;
  /** Live quotes map: symbol → StockQuote */
  quotes: Record<string, StockQuote>;
  /** Quotes loading flag */
  quotesLoading: boolean;
  /** Alerts for tracked stocks */
  alerts: AlertItem[];
  /** Alerts loading flag */
  alertsLoading: boolean;
  /** Strategy signals map: symbol → signal */
  signals: Record<string, StrategySignal>;
  /** Last refresh timestamp */
  lastRefresh: Date;
  /** Manual refresh trigger */
  refresh: () => void;
  /** Auto-refresh interval in ms (0 = disabled) */
  autoRefreshMs: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'astock_watchlist_v2';

function readWatchlistGroups(): WatchlistGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // 演示数据降级：localStorage 无自选股时返回演示分组
      return DEMO_WATCHLIST_GROUPS.map((g, groupIdx) => ({
        id: g.id,
        name: g.name,
        isDefault: groupIdx === 0,
        stocks: DEMO_WATCHLIST
          .filter(w => w.groupId === g.id)
          .map((w, idx) => ({
            symbol: w.symbol,
            name: w.name,
            market: w.stock.market,
            sortIndex: idx,
            groupId: g.id,
          })),
      }));
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.groups || [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }]);
  } catch {
    return [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }];
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useWatchlistData(autoRefreshMs = 0): WatchlistDataState {
  const [groups, setGroups] = useState<WatchlistGroup[]>(readWatchlistGroups);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [signals, setSignals] = useState<Record<string, StrategySignal>>({});
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Derive flat symbol list
  const allSymbols = useMemo(() => {
    const syms: string[] = [];
    for (const g of groups) {
      for (const s of g.stocks) {
        if (s.symbol) syms.push(s.symbol);
      }
    }
    return syms;
  }, [groups]);

  const totalCount = allSymbols.length;
  const symbolsKey = allSymbols.join(',');

  // Sync groups from localStorage on mount and on storage events
  useEffect(() => {
    const onStorage = () => setGroups(readWatchlistGroups());
    window.addEventListener('storage', onStorage);
    // Also poll localStorage (for same-tab writes that don't fire 'storage')
    const pollTimer = setInterval(() => {
      const fresh = readWatchlistGroups();
      setGroups(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(fresh)) return fresh;
        return prev;
      });
    }, 2000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(pollTimer);
    };
  }, []);

  // ---- Fetch quotes ----
  const fetchQuotes = useCallback(async () => {
    if (allSymbols.length === 0) {
      setQuotes({});
      return;
    }
    setQuotesLoading(true);
    try {
      const resp = await apiFetch('/api/stocks/batch/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: allSymbols }),
      });
      const data = await resp.json();
      const map: Record<string, StockQuote> = {};
      if (data.success && data.data?.stocks) {
        for (const s of data.data.stocks) {
          const q = s.latestQuote || s;
          map[s.symbol] = {
            symbol: s.symbol,
            name: s.name,
            price: q.closePrice ?? q.close_price ?? q.price ?? 0,
            changePercent: q.changePercent ?? q.change_percent ?? 0,
            change: q.change ?? q.change_amount ?? 0,
            volume: q.volume,
            turnoverRate: q.turnoverRate ?? q.turnover_rate,
            industry: q.industry || s.industry,
            peRatio: q.peRatio ?? q.pe_ratio ?? undefined,
            pbRatio: q.pbRatio ?? q.pb_ratio ?? undefined,
            marketCap: q.marketCap ?? q.market_cap ?? undefined,
          };
        }
      }
      setQuotes(map);
      setLastRefresh(new Date());
    } catch {
      // 演示数据降级：API 不可达且 localStorage 无真实自选股时，使用演示行情
      const hasRealWatchlist = !!localStorage.getItem(STORAGE_KEY);
      if (!hasRealWatchlist) {
        const demoQuotes: Record<string, StockQuote> = {};
        for (const s of DEMO_STOCKS) {
          const q = s.latestQuote;
          if (!q) continue;
          demoQuotes[s.symbol] = {
            symbol: s.symbol,
            name: s.name,
            price: q.closePrice,
            changePercent: q.changePercent,
            change: q.change,
            volume: q.volume,
            industry: s.industry,
            peRatio: q.peRatio,
            pbRatio: q.pbRatio,
            marketCap: q.marketCap,
          };
        }
        setQuotes(demoQuotes);
        setLastRefresh(new Date());
      }
    } finally {
      setQuotesLoading(false);
    }
  }, [allSymbols.length, symbolsKey]);

  // ---- Fetch alerts ----
  const fetchAlerts = useCallback(async () => {
    if (allSymbols.length === 0) {
      setAlerts([]);
      return;
    }
    setAlertsLoading(true);
    try {
      const resp = await apiFetch(`/api/alerts?symbols=${allSymbols.join(',')}`);
      const data = await resp.json();
      setAlerts(data.data?.alerts || []);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, [symbolsKey]);

  // ---- Fetch strategy signals ----
  const fetchSignals = useCallback(async () => {
    if (allSymbols.length === 0) {
      setSignals({});
      return;
    }
    const newSignals: Record<string, StrategySignal> = {};
    await Promise.allSettled(
      allSymbols.map(async (sym) => {
        try {
          const resp = await apiFetch(`/api/stocks/${sym}/strategy`);
          const data = await resp.json();
          if (data.success && data.data) {
            newSignals[sym] = {
              signal: data.data.signal || 'hold',
              score: data.data.score ?? 50,
            };
          }
        } catch {
          // fail silently
        }
      }),
    );
    setSignals(newSignals);
  }, [symbolsKey]);

  // ---- Initial load + refresh ----
  const loadAll = useCallback(async () => {
    await Promise.all([fetchQuotes(), fetchAlerts(), fetchSignals()]);
  }, [fetchQuotes, fetchAlerts, fetchSignals]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefreshMs > 0) {
      intervalRef.current = setInterval(loadAll, autoRefreshMs);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    return undefined;
  }, [loadAll, autoRefreshMs]);

  return {
    groups,
    allSymbols,
    totalCount,
    quotes,
    quotesLoading,
    alerts,
    alertsLoading,
    signals,
    lastRefresh,
    refresh: loadAll,
    autoRefreshMs,
  };
}

/** Default empty state for context fallback */
export const EMPTY_WATCHLIST_DATA: WatchlistDataState = {
  groups: [],
  allSymbols: [],
  totalCount: 0,
  quotes: {},
  quotesLoading: false,
  alerts: [],
  alertsLoading: false,
  signals: {},
  lastRefresh: new Date(),
  refresh: () => {},
  autoRefreshMs: 0,
};
