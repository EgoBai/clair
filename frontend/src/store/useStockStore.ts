import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// 股票数据类型
//
// 【诚实红线】price / change / changePercent / volume / marketCap 一律允许 null。
// null 的语义是「该字段没有真实数据」，渲染层必须显示「—」，禁止用 0 顶替
// （0 会被读成「这只股票真的涨 0%/市值 0/零成交」）。
// 具体到 GET /api/stocks（全市场列表 + 行情 join）这条契约：
//   · 它返回 latestQuote{closePrice, changePercent, turnoverRate, peRatio, volume, turnover}
//     且 latestQuote 整体可能为 null（上游未覆盖该标的）；
//   · 它**不返回** change（涨跌额），也**不返回**昨收，故 change 无法推导 → 恒为 null；
//   · 它**不返回** marketCap（总市值）→ 恒为 null。
export interface Stock {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: string | null;
  marketCap: string | null;
  industry?: string;
  peRatio?: number | null;
  dividendYield?: number | null;
}

// ---------------- GET /api/stocks 契约与显式映射 ----------------

/** /api/stocks 单只股票的 latestQuote（线上 worker 契约，全部字段可能缺失） */
export interface StocksApiQuote {
  closePrice?: number | null;
  changePercent?: number | null;
  turnoverRate?: number | null;
  peRatio?: number | null;
  volume?: number | null;
  turnover?: number | null;
}

/** /api/stocks 的 items[] 元素 */
export interface StocksApiItem {
  symbol?: string;
  name?: string;
  market?: string;
  industry?: string;
  concepts?: string[];
  latestQuote?: StocksApiQuote | null;
}

/** 列表加载状态：idle=未请求；error=请求失败（此时任何统计都不许显示数值） */
export type StocksStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 列表加载元信息：只记录可核实的事实（接口返回的 total、客户端完成请求的时刻） */
export interface StocksLoadMeta {
  /** 接口自报的全市场标的数（不是本页条数），缺失为 null */
  total: number | null;
  /** 本次请求完成时刻（本地时钟，非行情时间），未加载为 null */
  loadedAt: string | null;
  /** 接口自报的 dataSource（若有） */
  dataSource: string | null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 成交量（手）→ 带单位字符串。
 * 单位依据（已核实，非猜测）：/api/stocks 的 volume 取自腾讯行情字段 6（单位=手）。
 * 用实测样本交叉验证过：600000 浦发银行 volume=648865 手、turnover=647,740,000 元、
 * closePrice=10.02 → 648865×100 股×10.02 元 ≈ 6.50 亿，与 turnover 6.477 亿同量级吻合。
 * 缺失/非法 → null（渲染「—」），绝不用 0 顶替。
 */
export function formatVolumeLots(v: unknown): string | null {
  const n = numOrNull(v);
  if (n === null || n < 0) return null;
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿手`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万手`;
  return `${n}手`;
}

/**
 * 显式映射：/api/stocks 的 items[] → 前端扁平 Stock。
 * 该函数是**唯一**的字段映射入口，禁止在渲染层再猜测/推算字段。
 */
export function mapStockApiItem(item: StocksApiItem | null | undefined): Stock | null {
  const symbol = typeof item?.symbol === 'string' ? item.symbol.trim() : '';
  if (!symbol) return null; // 无代码的行不可定位，丢弃（不编造代码）
  const q: StocksApiQuote | null = item?.latestQuote ?? null;
  const rawName = typeof item?.name === 'string' ? item.name.trim() : '';
  return {
    symbol,
    name: rawName || symbol, // 名称缺失时退化为代码（标识符，非数据）
    price: numOrNull(q?.closePrice),
    // 诚实红线：接口无「涨跌额」且无「昨收」，无法推导（closePrice*changePercent 是估算，
    // 不是事实）→ 恒 null
    change: null,
    changePercent: numOrNull(q?.changePercent),
    volume: formatVolumeLots(q?.volume),
    // 诚实红线：接口不返回总市值 → 恒 null。算不出来就是算不出来，不填 0。
    marketCap: null,
    industry: typeof item?.industry === 'string' && item.industry.trim() ? item.industry.trim() : undefined,
    peRatio: numOrNull(q?.peRatio),
  };
}

export interface ParsedStocksResponse {
  stocks: Stock[];
  total: number | null;
  dataSource: string | null;
  message: string | null;
}

/**
 * 解析 /api/stocks 响应。
 * 契约：{ success: true, data: { items: [...], total, page, pageSize } }
 * 结构不符（data.items 不是数组）→ 抛错，由调用方转成可解释的错误提示，
 * 不做「静默当成空列表」处理（那会把接口异常显示成「今天没有股票」）。
 */
export function parseStocksResponse(payload: unknown): ParsedStocksResponse {
  const body = payload as { success?: boolean; data?: unknown; message?: string; error?: string } | null;
  if (!body || typeof body !== 'object') {
    throw new Error('行情接口返回非 JSON 对象');
  }
  if (body.success === false) {
    throw new Error(body.message || body.error || '行情接口返回 success=false');
  }
  const data = body.data as { items?: unknown; total?: unknown; dataSource?: unknown; message?: unknown } | null;
  if (!data || !Array.isArray(data.items)) {
    throw new Error('行情接口响应缺少 data.items 数组（契约不符）');
  }
  const stocks = data.items
    .map((it) => mapStockApiItem(it as StocksApiItem))
    .filter((s): s is Stock => s !== null);
  return {
    stocks,
    total: numOrNull(data.total),
    dataSource: typeof data.dataSource === 'string' ? data.dataSource : null,
    message: typeof data.message === 'string' ? data.message : null,
  };
}

// 用户偏好类型
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: 'zh' | 'en';
  notifications: {
    priceAlerts: boolean;
    marketNews: boolean;
    systemUpdates: boolean;
  };
  defaultView: 'grid' | 'list';
  itemsPerPage: number;
}

// 搜索结果类型（包含API搜索）
export interface SearchResult {
  symbol: string;
  name: string;
  fullName?: string;
  market?: string;
  isActive?: boolean;
}

// 应用状态类型
interface StockStore {
  // 状态
  stocks: Stock[];
  watchlist: string[]; // 股票代码数组
  selectedStock: Stock | null;
  loading: boolean;
  error: string | null;
  userPreferences: UserPreferences;

  // 列表加载状态（/api/stocks 初次加载 + 手动刷新）
  stocksStatus: StocksStatus;
  stocksMeta: StocksLoadMeta;

  // 搜索状态
  searchResults: SearchResult[];
  searchLoading: boolean;

  // 操作
  setStocks: (stocks: Stock[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectStock: (stock: Stock | null) => void;

  /** 全市场列表初次加载 / 手动刷新（唯一数据入口，见 fetchAllStocks 实现） */
  fetchAllStocks: () => Promise<void>;

  // 自选股操作
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  toggleWatchlist: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;
  clearWatchlist: () => void;

  // 用户偏好操作
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  toggleTheme: () => void;
  toggleNotification: (key: keyof UserPreferences['notifications']) => void;

  // 数据操作
  updateStockPrice: (symbol: string, price: number, change: number, changePercent: number) => void;
  searchStocks: (query: string) => Stock[];
  getStockBySymbol: (symbol: string) => Stock | undefined;
  getWatchlistStocks: () => Stock[];

  // API搜索
  searchStocksAPI: (query: string) => Promise<void>;
  clearSearchResults: () => void;

  // 重置
  reset: () => void;
}

// 默认用户偏好
const defaultPreferences: UserPreferences = {
  theme: 'light',
  language: 'zh',
  notifications: {
    priceAlerts: true,
    marketNews: true,
    systemUpdates: false,
  },
  defaultView: 'grid',
  itemsPerPage: 20,
};

// 全市场列表请求参数
// pageSize >= 全市场标的数才会让 worker 走「全市场行情」分支（实测 2026-11-01 线上 total=5541），
// 6000 足够覆盖；worker 侧对全量请求有 30s 缓存。
const ALL_STOCKS_PAGE_SIZE = 6000;
// 实测线上 pageSize=6000 首次约 6.4s（1.28MB），30s 为失败上限，超时如实报错不静默
const ALL_STOCKS_TIMEOUT_MS = 30000;

// 创建store
export const useStockStore = create<StockStore>()(
  persist(
    (set, get) => ({
      // 初始状态
      stocks: [],
      watchlist: [],
      selectedStock: null,
      loading: false,
      error: null,
      userPreferences: defaultPreferences,
      stocksStatus: 'idle',
      stocksMeta: { total: null, loadedAt: null, dataSource: null },
      searchResults: [],
      searchLoading: false,
      
      // 设置股票列表
      setStocks: (stocks) => set({ stocks }),
      
      // 设置加载状态
      setLoading: (loading) => set({ loading }),
      
      // 设置错误
      setError: (error) => set({ error }),
      
      // 选择股票
      selectStock: (stock) => set({ selectedStock: stock }),

      // 全市场列表加载（初次 mount / 手动刷新共用）
      // 缺陷背景：此前 stocks 只在「搜索」时被填充，列表页永远空 → 「共 0 只 / 暂无数据」。
      fetchAllStocks: async () => {
        if (get().stocksStatus === 'loading') return; // 并发去重，避免重复打接口
        set({ stocksStatus: 'loading', loading: true, error: null });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ALL_STOCKS_TIMEOUT_MS);
        try {
          const res = await fetch(`/api/stocks?pageSize=${ALL_STOCKS_PAGE_SIZE}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          if (!res.ok) {
            throw new Error(`行情接口返回 HTTP ${res.status}`);
          }
          const payload = await res.json();
          const parsed = parseStocksResponse(payload);

          if (parsed.stocks.length === 0) {
            // 空结果 ≠ 「今天没有股票」：如实置 error，页面显示可解释提示而不是 0
            set({
              stocks: [],
              stocksStatus: 'error',
              loading: false,
              error: parsed.message || '行情接口返回 0 条股票（上游无数据，未用 0 顶替）',
              stocksMeta: {
                total: parsed.total,
                loadedAt: new Date().toISOString(),
                dataSource: parsed.dataSource,
              },
            });
            return;
          }

          set({
            stocks: parsed.stocks,
            stocksStatus: 'ready',
            loading: false,
            error: null,
            stocksMeta: {
              total: parsed.total,
              loadedAt: new Date().toISOString(),
              dataSource: parsed.dataSource,
            },
          });
        } catch (e) {
          const aborted = (e as { name?: string })?.name === 'AbortError';
          const message = aborted
            ? `行情接口超时（>${ALL_STOCKS_TIMEOUT_MS / 1000}s），本页暂不展示任何股票数据`
            : `行情接口请求失败：${(e as Error)?.message || String(e)}；本页暂不展示任何股票数据`;
          set({
            stocks: [],
            stocksStatus: 'error',
            loading: false,
            error: message,
            stocksMeta: { total: null, loadedAt: null, dataSource: null },
          });
        } finally {
          clearTimeout(timer);
        }
      },

      // 自选股操作
      addToWatchlist: (symbol) => 
        set((state) => ({
          watchlist: [...new Set([...state.watchlist, symbol])]
        })),
      
      removeFromWatchlist: (symbol) =>
        set((state) => ({
          watchlist: state.watchlist.filter(s => s !== symbol)
        })),
      
      toggleWatchlist: (symbol) =>
        set((state) => {
          const isInWatchlist = state.watchlist.includes(symbol);
          if (isInWatchlist) {
            return { watchlist: state.watchlist.filter(s => s !== symbol) };
          } else {
            return { watchlist: [...state.watchlist, symbol] };
          }
        }),
      
      isInWatchlist: (symbol) => get().watchlist.includes(symbol),
      
      clearWatchlist: () => set({ watchlist: [] }),
      
      // 用户偏好操作
      updatePreferences: (preferences) =>
        set((state) => ({
          userPreferences: { ...state.userPreferences, ...preferences }
        })),
      
      toggleTheme: () =>
        set((state) => {
          const themes: UserPreferences['theme'][] = ['light', 'dark', 'auto'];
          const currentIndex = themes.indexOf(state.userPreferences.theme);
          const nextIndex = (currentIndex + 1) % themes.length;
          return {
            userPreferences: {
              ...state.userPreferences,
              theme: themes[nextIndex]
            }
          };
        }),
      
      toggleNotification: (key) =>
        set((state) => ({
          userPreferences: {
            ...state.userPreferences,
            notifications: {
              ...state.userPreferences.notifications,
              [key]: !state.userPreferences.notifications[key]
            }
          }
        })),
      
      // 数据操作
      updateStockPrice: (symbol, price, change, changePercent) =>
        set((state) => ({
          stocks: state.stocks.map(stock =>
            stock.symbol === symbol
              ? { ...stock, price, change, changePercent }
              : stock
          ),
          selectedStock: state.selectedStock?.symbol === symbol
            ? { ...state.selectedStock, price, change, changePercent }
            : state.selectedStock
        })),
      
      searchStocks: (query) => {
        const { stocks } = get();
        const lowerQuery = query.toLowerCase();
        return stocks.filter(stock =>
          stock.symbol.toLowerCase().includes(lowerQuery) ||
          stock.name.toLowerCase().includes(lowerQuery)
        );
      },

      // API搜索 - 从后端搜索股票
      searchStocksAPI: async (query) => {
        if (!query || query.trim().length === 0) {
          set({ searchResults: [], searchLoading: false });
          return;
        }
        set({ searchLoading: true });
        try {
          const encodedQuery = encodeURIComponent(query.trim());
          // 同时按名称和代码搜索
          const [byName, bySymbol] = await Promise.all([
            fetch(`/api/stocks?name=${encodedQuery}&pageSize=10`).then(r => r.json()).catch(() => null),
            fetch(`/api/stocks?symbol=${encodedQuery}&pageSize=10`).then(r => r.json()).catch(() => null),
          ]);

          const results: SearchResult[] = [];
          const seen = new Set<string>();

          // 合并去重
          const addStocks = (data: any) => {
            if (data?.success && data?.data?.stocks) {
              for (const s of data.data.stocks) {
                if (!seen.has(s.symbol)) {
                  seen.add(s.symbol);
                  results.push({
                    symbol: s.symbol,
                    name: s.name,
                    fullName: s.fullName,
                    market: s.market,
                    isActive: s.isActive,
                  });
                }
              }
            }
          };
          addStocks(byName);
          addStocks(bySymbol);

          set({ searchResults: results, searchLoading: false });
        } catch (e) {
          console.error('API搜索失败:', e);
          set({ searchLoading: false });
        }
      },

      clearSearchResults: () => set({ searchResults: [], searchLoading: false }),
      
      getStockBySymbol: (symbol) => {
        const { stocks } = get();
        return stocks.find(stock => stock.symbol === symbol);
      },
      
      getWatchlistStocks: () => {
        const { stocks, watchlist } = get();
        return stocks.filter(stock => watchlist.includes(stock.symbol));
      },
      
      // 重置状态
      reset: () => set({
        stocks: [],
        watchlist: [],
        selectedStock: null,
        loading: false,
        error: null,
        stocksStatus: 'idle',
        stocksMeta: { total: null, loadedAt: null, dataSource: null },
        userPreferences: defaultPreferences
      }),
    }),
    {
      name: 'stock-store', // localStorage中的key
      partialize: (state) => ({
        watchlist: state.watchlist,
        userPreferences: state.userPreferences,
      }), // 只持久化这些字段
    }
  )
);

// 选择器钩子 - 用于优化性能
export const useStocks = () => useStockStore((state) => state.stocks);
export const useWatchlist = () => useStockStore((state) => state.watchlist);
export const useSelectedStock = () => useStockStore((state) => state.selectedStock);
export const useLoading = () => useStockStore((state) => state.loading);
export const useError = () => useStockStore((state) => state.error);
export const useStocksStatus = () => useStockStore((state) => state.stocksStatus);
export const useStocksMeta = () => useStockStore((state) => state.stocksMeta);
export const useUserPreferences = () => useStockStore((state) => state.userPreferences);
export const useSearchResults = () => useStockStore((state) => state.searchResults);
export const useSearchLoading = () => useStockStore((state) => state.searchLoading);

// 操作钩子
// T4 粒度优化：原实现 `useStockStore()` 全 store 订阅（无选择器），
// 任意状态变化（stocks/searchResults/loading…）都会重渲染所有调用组件。
// 改为 useShallow 聚合选择器：action 引用稳定，浅比较恒等 → 零多余重渲染。
export const useStockActions = () =>
  useStockStore(
    useShallow((s) => ({
      setStocks: s.setStocks,
      setLoading: s.setLoading,
      setError: s.setError,
      selectStock: s.selectStock,
      addToWatchlist: s.addToWatchlist,
      removeFromWatchlist: s.removeFromWatchlist,
      toggleWatchlist: s.toggleWatchlist,
      updatePreferences: s.updatePreferences,
      toggleTheme: s.toggleTheme,
      toggleNotification: s.toggleNotification,
      updateStockPrice: s.updateStockPrice,
      searchStocksAPI: s.searchStocksAPI,
      clearSearchResults: s.clearSearchResults,
      fetchAllStocks: s.fetchAllStocks,
      reset: s.reset,
    }))
  );

// 计算钩子
// T4 粒度优化：派生统计用 useMemo 缓存，仅 stocks 引用变化时重算（原每次渲染都重算 3 次遍历）
//
// 【诚实红线】所有统计值均为 number | null：
//   · null = 无法由真实数据算出（未加载 / 请求失败 / 字段缺失），页面必须显示「—」
//   · 绝不返回 0 冒充「真的是 0」
export interface StockStats {
  totalStocks: number | null;
  risingStocks: number | null;
  fallingStocks: number | null;
  /** 总市值（亿）；只要有一只标的缺市值就无法得到全量真值 → null */
  totalMarketCap: number | null;
  /** 平均涨跌幅（%）；只要有一只标的缺涨跌幅 → null */
  averageChange: number | null;
  /** 缺市值的标的数（用于页面如实说明「为什么总市值是 —」） */
  missingMarketCapCount: number;
  /** 缺涨跌幅的标的数 */
  missingChangePercentCount: number;
}

export const useStockStats = (): StockStats => {
  const stocks = useStocks();
  const status = useStocksStatus();

  return useMemo(() => {
    // 未加载 / 加载失败：统计一律 null，不显示 0
    if (status !== 'ready' || stocks.length === 0) {
      return {
        totalStocks: null,
        risingStocks: null,
        fallingStocks: null,
        totalMarketCap: null,
        averageChange: null,
        missingMarketCapCount: stocks.length,
        missingChangePercentCount: stocks.length,
      };
    }

    const withChangePercent = stocks.filter((s) => s.changePercent !== null);
    const withMarketCap = stocks.filter((s) => {
      if (s.marketCap === null) return false;
      const v = parseFloat(s.marketCap.replace('亿', ''));
      return Number.isFinite(v);
    });

    const marketCapComplete = withMarketCap.length === stocks.length;
    const changePercentComplete = withChangePercent.length === stocks.length;

    return {
      totalStocks: stocks.length,
      risingStocks: withChangePercent.filter((s) => (s.changePercent as number) > 0).length,
      fallingStocks: withChangePercent.filter((s) => (s.changePercent as number) < 0).length,
      // 缺任何一只的市值，合计值就不是真值 → null（不展示「部分合计」冒充全市场总市值）
      totalMarketCap: marketCapComplete
        ? withMarketCap.reduce((sum, s) => sum + parseFloat((s.marketCap as string).replace('亿', '')), 0)
        : null,
      averageChange: changePercentComplete
        ? withChangePercent.reduce((sum, s) => sum + (s.changePercent as number), 0) / withChangePercent.length
        : null,
      missingMarketCapCount: stocks.length - withMarketCap.length,
      missingChangePercentCount: stocks.length - withChangePercent.length,
    };
  }, [stocks, status]);
};
