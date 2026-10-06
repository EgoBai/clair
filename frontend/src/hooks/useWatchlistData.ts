/**
 * useWatchlistData — 共享自选股数据加载 hook
 * WatchlistHubPage 使用此 hook 加载一次数据，然后通过 Context 传递给
 * 「自选追踪」和「AI复盘」两个 Tab 面板，避免重复请求。
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../utils/api';

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
    /** 后端 AlertRule.alertType 原值（price_above/volume_surge/...） */
    type: string;
    /** 由后端 isTriggered 派生的展示档位，非后端字段，见 fetchAlertsForSymbols 注释 */
    level: string;
    message: string;
  }>;
}

/**
 * 后端 /api/alerts 的单条预警规则（backend/src/api/alerts.ts 的 AlertRule，节选实际用到的字段）。
 * 注意：后端返回的是**扁平规则数组**，不含 name / alerts 嵌套字段。
 */
export interface AlertRule {
  id?: number;
  symbol?: string;
  alertType?: string;
  threshold?: number;
  isActive?: boolean;
  isTriggered?: boolean;
  message?: string;
  createdAt?: string;
}

/** 一次「逐标的拉取 + 合并」的完整结果，含失败/截断的诚实记账 */
export interface AlertsFetchOutcome {
  /** 按标的分组、组内按时间倒序的预警，供 UI 直接渲染 */
  items: AlertItem[];
  /** 服务端声明的真实总条数（各标的 pagination.totalCount 之和），可能 > returnedCount */
  totalCount: number;
  /** 实际取到的条数 */
  returnedCount: number;
  /** 请求失败的标的及原因（部分失败时必须让用户知道，不能静默丢弃） */
  failedSymbols: Array<{ symbol: string; reason: string }>;
  /** 单标的条数超过 pageSize 被截断的标的 */
  truncatedSymbols: string[];
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
  /**
   * 预警查询的部分失败/截断说明（P0-ALERTFE）。
   * null = 查询完整成功；非 null = 必须展示给用户看的解释，
   * 用来把「查询失败」与「这些股票确实没有预警」区分开。
   */
  alertsNotice: string | null;
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
      // 诚实空态：localStorage 无自选股时返回空默认分组，绝不回填演示数据
      return [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }];
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.groups || [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }]);
  } catch {
    return [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }];
  }
}

/* ------------------------------------------------------------------ */
/*  Alerts data layer (P0-ALERTFE)                                     */
/* ------------------------------------------------------------------ */

/**
 * 后端 /api/alerts **只支持单个** `?symbol=<code>`（P0-ALERTSCOPE 起复数形态显式 400）。
 * 原先三处调用点都拼复数 `?symbols=a,b,c`，在stripUnknown 静默剥离下过滤条件整个消失，
 * 端点退化成「返回该 user 全量预警」——静默返回了不该返回的数据。
 *
 * 这里改为**逐标的请求后合并**。合并口径（刻意与后端单查询保持一致）：
 * - 排序：后端单查询按 `createdAt` 倒序，故合并后按 `createdAt` 倒序（同秒用 `id` 倒序破平），
 *   保证「多标的合并结果」与「后端单标的结果」的先后顺序一致，不会因并发返回顺序而抖动。
 * - 总数：`totalCount` = 各标的 `pagination.totalCount` 之和（服务端声明的真实总数，
 *   不受分页截断影响）；`returnedCount` = 实际取回并渲染的条数。两者不等即说明有截断，
 *   由 truncatedSymbols 显式记账，不静默丢数据。
 * - 分页：逐标的请求各自 pageSize=100（后端上限）。合并后不再二次分页——
 *   三处调用点均未把 totalCount 用于分页器UI（已核实：WatchlistPage 的 totalCount
 *   是「自选股数量」，与预警分页无关），故无需在前端重建分页语义。
 *
 * 诚实性：部分标的失败时**不返回空数组**，而是把失败标的与原因放进 failedSymbols，
 * 由调用方渲染成「部分标的查询失败」，与真正的「无预警」区分开。
 */

/** 后端 alertType 取值（backend/src/api/alerts.ts）→ 中文标签。未知值回落到原文，不编造。 */
const ALERT_TYPE_LABEL: Record<string, string> = {
  price_above: '价格上穿',
  price_below: '价格下穿',
  change_above: '涨幅超限',
  change_below: '跌幅超限',
  volume_surge: '放量异动',
  indicator: '指标触发',
  composite: '组合条件',
};

/**
 * 后端 AlertRule **没有** `name` 字段，用调用方提供的自选股名称解析器补齐；
 * 无解析器时回落为代码本身——宁可显示代码，也不编造股票名。
 */
function resolveAlertName(symbol: string, nameOf?: (symbol: string) => string): string {
  if (!nameOf) return symbol;
  try {
    return nameOf(symbol) || symbol;
  } catch {
    return symbol;
  }
}

function alertSortTime(r: AlertRule): number {
  const t = r.createdAt ? new Date(r.createdAt).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 逐标的拉取预警并合并。绝不发送复数 `?symbols=`。
 *
 * @param symbols  自选股代码列表
 * @param nameOf   代码 → 名称 的解析器（用于补齐后端缺失的 name 字段）
 */
export async function fetchAlertsForSymbols(
  symbols: string[],
  nameOf?: (symbol: string) => string,
): Promise<AlertsFetchOutcome> {
  const uniq = Array.from(new Set(symbols.filter(Boolean)));
  const empty: AlertsFetchOutcome = {
    items: [], totalCount: 0, returnedCount: 0, failedSymbols: [], truncatedSymbols: [],
  };
  if (uniq.length === 0) return empty;

  const settled = await Promise.allSettled(
    uniq.map(async (symbol) => {
      const resp = await apiFetch(
        `/api/alerts?symbol=${encodeURIComponent(symbol)}&page=1&pageSize=100`,
      );
      const data = await resp.json();
      if (!data?.success) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      return { symbol, payload: data.data ?? {} };
    }),
  );

  // 先把所有成功的标的规则汇总成一个扁平列表（后端返回的就是扁平规则数组）
  const flat: Array<{ symbol: string; rule: AlertRule }> = [];
  const failedSymbols: AlertsFetchOutcome['failedSymbols'] = [];
  const truncatedSymbols: string[] = [];
  let totalCount = 0;

  settled.forEach((res, i) => {
    const symbol = uniq[i];
    if (res.status === 'rejected') {
      const reason = res.reason instanceof Error ? res.reason.message : String(res.reason);
      failedSymbols.push({ symbol, reason });
      return;
    }
    const { alerts, pagination } = res.value.payload;
    const rows: AlertRule[] = Array.isArray(alerts) ? alerts : [];
    const declared = Number(pagination?.totalCount);
    if (Number.isFinite(declared)) totalCount += declared;
    else totalCount += rows.length;
    // 服务端声明的总数 > 实际返回条数 ⇒ 这一标的被 pageSize 截断了，显式记账
    if (Number.isFinite(declared) && declared > rows.length) truncatedSymbols.push(symbol);
    for (const rule of rows) flat.push({ symbol, rule });
  });

  // 合并排序：createdAt 倒序，同刻用 id 倒序破平（与后端单查询口径一致，且顺序确定）
  flat.sort((a, b) => {
    const dt = alertSortTime(b.rule) - alertSortTime(a.rule);
    if (dt !== 0) return dt;
    return (b.rule.id ?? 0) - (a.rule.id ?? 0);
  });

  // 分组：保持调用方给定的标的顺序（自选股顺序对用户有意义），组内保持上面的时间倒序
  const bySymbol = new Map<string, AlertItem>();
  for (const { symbol, rule } of flat) {
    let item = bySymbol.get(symbol);
    if (!item) {
      item = { symbol, name: resolveAlertName(symbol, nameOf), alerts: [] };
      bySymbol.set(symbol, item);
    }
    item.alerts.push({
      type: rule.alertType ?? 'unknown',
      // level 是**前端派生**的展示档位：后端 AlertRule 无 level 字段。
      // 只依据后端真实的 isTriggered / isActive 推导，不臆造严重程度。
      level: rule.isTriggered ? 'critical' : rule.isActive === false ? 'inactive' : 'warning',
      message: rule.message
        || `${ALERT_TYPE_LABEL[rule.alertType ?? ''] ?? '预警规则'}（阈值 ${rule.threshold ?? '—'}）`,
    });
  }
  const items = uniq
    .map((s) => bySymbol.get(s))
    .filter((x): x is AlertItem => x !== undefined);

  return {
    items,
    totalCount,
    returnedCount: flat.length,
    failedSymbols,
    truncatedSymbols,
  };
}

/**
 * 把合并结果渲染成一句给用户看的话。
 * - 有失败标的：说明是「部分标的查询失败」，绝不退化成「无预警」
 * - 其余情况说明确实没有预警
 */
export function describeAlertsOutcome(outcome: AlertsFetchOutcome): string | null {
  const { items, failedSymbols, truncatedSymbols, totalCount, returnedCount } = outcome;
  if (failedSymbols.length > 0) {
    const list = failedSymbols.map((f) => `${f.symbol}（${f.reason}）`).join('、');
    return `部分标的查询失败：${list}。下方仅显示成功返回的 ${returnedCount} 条，失败标的的预警未能获取（不等于这些股票没有预警）。`;
  }
  if (items.length === 0) return null;
  if (truncatedSymbols.length > 0) {
    return `共 ${totalCount} 条预警，已按最近 ${returnedCount} 条显示；${truncatedSymbols.join('、')} 的预警条数超出单次拉取上限，更早的预警未加载。`;
  }
  return null;
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
  const [alertsNotice, setAlertsNotice] = useState<string | null>(null);
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
      // 诚实空态：API 不可达时保持现有 quotes（无则空），绝不回填演示行情
    } finally {
      setQuotesLoading(false);
    }
  }, [allSymbols.length, symbolsKey]);

  // ---- Fetch alerts ----
  // 代码 → 名称 解析器：后端 AlertRule 不含 name，用自选股里的名称补齐（失败则回落为代码）
  const nameOf = useCallback(
    (sym: string) => {
      for (const g of groups) {
        const hit = g.stocks.find((s) => s.symbol === sym);
        if (hit) return hit.name;
      }
      return sym;
    },
    [groups],
  );

  const fetchAlerts = useCallback(async () => {
    if (allSymbols.length === 0) {
      setAlerts([]);
      setAlertsNotice(null);
      return;
    }
    setAlertsLoading(true);
    try {
      // P0-ALERTFE：逐标的请求 ?symbol=<code> 后合并，绝不再发复数 ?symbols=
      const outcome = await fetchAlertsForSymbols(allSymbols, nameOf);
      setAlerts(outcome.items);
      setAlertsNotice(describeAlertsOutcome(outcome));
    } catch {
      // 只有连合并层本身都崩了才走到这里；不能装作「无预警」
      setAlerts([]);
      setAlertsNotice('预警查询失败：请求未能完成，无法判断这些股票是否有预警。');
    } finally {
      setAlertsLoading(false);
    }
  }, [symbolsKey, nameOf]);

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
    alertsNotice,
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
  alertsNotice: null,
  signals: {},
  lastRefresh: new Date(),
  refresh: () => {},
  autoRefreshMs: 0,
};
