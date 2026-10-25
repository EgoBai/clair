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
    /** 后端 alertType 原值（本地规则 price_above/volume_surge/...；Worker 异动 limit_move/...） */
    type: string;
    /** 展示档位：优先后端给的 level，无则按 isTriggered/isActive 派生，见 fetchAlertsForSymbols 注释 */
    level: string;
    message: string;
  }>;
}

/**
 * 后端 /api/alerts 的单条预警（backend/src/api/alerts.ts 的 AlertRule，节选实际用到的字段）。
 * 注意：后端返回的是**扁平数组**，不含 name / alerts 嵌套字段。
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
  /**
   * 后端给出的展示档位（critical/warning/info）。
   * 本地 Express 的 AlertRule **没有**该字段（前端从 isTriggered 派生）；
   * Worker 的行情派生异动**有**该字段（它按涨跌幅/换手率真实分档）。
   * 有则用后端的（更精确），无才派生 —— 两端共用同一解析路径。
   */
  level?: string;
}

/** 一次「逐标的拉取 + 合并」的完整结果，含失败/截断的诚实记账 */
export interface AlertsFetchOutcome {
  /** 按标的分组、组内按时间倒序的预警，供 UI 直接渲染 */
  items: AlertItem[];  /** 服务端声明的真实总条数（各标的 pagination.totalCount 之和），可能 > returnedCount */
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
  /**
   * 策略信号 map: symbol → signal。
   * P0-DEADLINK：后端**从未注册** `/api/stocks/:symbol/strategy`（实测 404，
   * `rg "stocks/.*strategy" backend/src` 零命中），原实现在此拉取后被
   * `.catch(() => null)` 吞成空对象，用户看到「无信号」却实为「无数据源」。
   * 现已删除该请求，故本字段恒为空对象，**恒定不可用**。
   * 请配合 signalsNotice 展示「未接入」说明，不要把它读成「该股无信号」。
   */
  signals: Record<string, StrategySignal>;
  /**
   * 策略信号不可用说明（P0-DEADLINK）。
   * 非 null 时必须展示给用户看，用来把「功能未接入」与「确实无信号」区分开。
   */
  signalsNotice: string | null;
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

/**
 * 策略信号「未接入」统一说明（P0-DEADLINK）。
 * 后端从未实现个股策略信号端点，前端不再请求；这里给UI 一句可直接展示的文案，
 * 避免把「没有数据源」静默渲染成「这些股票没有信号」。
 */
export const STRATEGY_SIGNALS_UNAVAILABLE_NOTICE =
  '策略信号（买入/卖出/评分）尚未接入：后端未提供个股策略信号接口，'
  + '本页不展示任何信号，避免把「无数据源」误读为「无信号」。';

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

/**
 * 后端 alertType 取值 → 中文标签。未知值回落到原文，不编造。
 *
 * 两套词表并存（两侧后端业务语义不同，但信封/分页/字段名已统一）：
 *  - 本地 Express（backend/src/api/alerts.ts）：**用户创建的预警规则**
 *    price_above / price_below / change_above / change_below / volume_surge / indicator / composite
 *  - Worker（clair-worker/worker.js）：**由实时行情派生的异动**
 *    limit_move / big_move / notable_move / volume_spike / volume_active
 * 缺标签时回落为原文（而非编造一个像样的中文名），由 UI 决定如何展示未知类型。
 */
export const ALERT_TYPE_LABEL: Record<string, string> = {
  // 本地 Express：用户创建的预警规则
  price_above: '价格上穿',
  price_below: '价格下穿',
  change_above: '涨幅超限',
  change_below: '跌幅超限',
  volume_surge: '放量异动',
  indicator: '指标触发',
  composite: '组合条件',
  // Worker：实时行情派生的异动
  limit_move: '逼近涨跌停',
  big_move: '大幅异动',
  notable_move: '显著异动',
  volume_spike: '换手率异常',
  volume_active: '交投活跃',
};

/**
 * alertType → 中文标签；未知类型返回原文（不编造）。
 * 三处渲染点（WatchlistPage / WatchlistPanel / 本模块的消息兜底）统一走这里，
 * 避免各写一份内联三元链导致「worker 的异动类型落进『预警规则』」这种误标。
 */
export function alertTypeLabel(alertType: string | undefined): string {
  if (!alertType) return '预警规则';
  return ALERT_TYPE_LABEL[alertType] ?? alertType;
}

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
      // 形状校验：成功体必须含 data.alerts 数组。
      // 旧 Worker 曾返回 { data: [ {symbol, alerts:[...]} ] }（嵌套数组，非本契约），
      // 若不校验就会把 `const {alerts} = payload` 解析成 undefined → rows=[] →
      // 「查询成功但零条」——用户会误读成「这些股票没有异动」，实为「契约不兼容」。
      // 形状不符必须显式失败，交给 failedSymbols 记账，绝不静默变空。
      const payload = data?.data;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || !Array.isArray(payload.alerts)) {
        throw new Error('响应结构不符合 /api/alerts 契约（缺少 data.alerts 数组）');
      }
      return { symbol, payload };
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
      // level 优先用后端给的档位（Worker 的行情派生异动按涨跌幅/换手率真实分档）；
      // 后端没给（本地 Express 的 AlertRule 无此字段）才按 isTriggered/isActive 派生。
      // 两种来源都是后端真实依据，不臆造严重程度。
      level: rule.level
        ?? (rule.isTriggered ? 'critical' : rule.isActive === false ? 'inactive' : 'warning'),
      message: rule.message
        || `${alertTypeLabel(rule.alertType)}（阈值 ${rule.threshold ?? '—'}）`,
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
  // ---- 策略信号：后端无此能力，恒定不可用（P0-DEADLINK）----
  // 原实现在此 fetch `/api/stocks/${sym}/strategy`，但后端 routeAutoRegistry
  // 从未注册该路径，实测恒 404，被 catch 吞掉后 signals 恒为 {}——
  // 用户看到「无信号」，实际是「没有数据源」，属静默误导。
  // 现删除请求，改为显式置空 + 给出未接入说明，由UI 如实展示。
  const signalsNotice = STRATEGY_SIGNALS_UNAVAILABLE_NOTICE;
  const [signals] = useState<Record<string, StrategySignal>>({});
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

  // ---- 策略信号：不再发请求（P0-DEADLINK）----
  // 死链 `/api/stocks/:symbol/strategy` 已删除，signals 恒为空、signalsNotice 恒为未接入说明。
  // 详见 signalsNotice 字段注释。

  // ---- Initial load + refresh ----
  const loadAll = useCallback(async () => {
    await Promise.all([fetchQuotes(), fetchAlerts()]);
  }, [fetchQuotes, fetchAlerts]);

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
    signalsNotice,
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
  signalsNotice: STRATEGY_SIGNALS_UNAVAILABLE_NOTICE,
  lastRefresh: new Date(),
  refresh: () => {},
  autoRefreshMs: 0,
};
