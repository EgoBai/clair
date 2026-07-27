import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// 股票数据类型
export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  marketCap: string;
  industry?: string;
  peRatio?: number;
  dividendYield?: number;
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

  // 搜索状态
  searchResults: SearchResult[];
  searchLoading: boolean;

  // 操作
  setStocks: (stocks: Stock[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectStock: (stock: Stock | null) => void;

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
      reset: s.reset,
    }))
  );

// 计算钩子
// T4 粒度优化：派生统计用 useMemo 缓存，仅 stocks 引用变化时重算（原每次渲染都重算 3 次遍历）
export const useStockStats = () => {
  const stocks = useStocks();

  return useMemo(() => ({
    totalStocks: stocks.length,
    risingStocks: stocks.filter(s => s.changePercent > 0).length,
    fallingStocks: stocks.filter(s => s.changePercent < 0).length,
    totalMarketCap: stocks.reduce((sum, stock) => {
      const marketCap = parseFloat(stock.marketCap.replace('亿', ''));
      const marketCapVal = Number.isFinite(marketCap) ? marketCap : 0;
      return sum + marketCapVal;
    }, 0),
    averageChange: stocks.length > 0
      ? stocks.reduce((sum, stock) => sum + stock.changePercent, 0) / stocks.length
      : 0,
  }), [stocks]);
};
