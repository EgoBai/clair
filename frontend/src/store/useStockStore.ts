import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

// 应用状态类型
interface StockStore {
  // 状态
  stocks: Stock[];
  watchlist: string[]; // 股票代码数组
  selectedStock: Stock | null;
  loading: boolean;
  error: string | null;
  userPreferences: UserPreferences;
  
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

// 操作钩子
export const useStockActions = () => {
  const {
    setStocks,
    setLoading,
    setError,
    selectStock,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    updatePreferences,
    toggleTheme,
    toggleNotification,
    updateStockPrice,
    reset,
  } = useStockStore();
  
  return {
    setStocks,
    setLoading,
    setError,
    selectStock,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    updatePreferences,
    toggleTheme,
    toggleNotification,
    updateStockPrice,
    reset,
  };
};

// 计算钩子
export const useStockStats = () => {
  const stocks = useStocks();
  
  return {
    totalStocks: stocks.length,
    risingStocks: stocks.filter(s => s.changePercent > 0).length,
    fallingStocks: stocks.filter(s => s.changePercent < 0).length,
    totalMarketCap: stocks.reduce((sum, stock) => {
      const marketCap = parseFloat(stock.marketCap.replace('亿', '')) || 0;
      return sum + marketCap;
    }, 0),
    averageChange: stocks.length > 0
      ? stocks.reduce((sum, stock) => sum + stock.changePercent, 0) / stocks.length
      : 0,
  };
};

// 初始化示例数据
export const initializeSampleData = () => {
  const { setStocks } = useStockStore.getState();
  
  const sampleStocks: Stock[] = [
    {
      symbol: '000001',
      name: '平安银行',
      price: 12.34,
      change: 0.23,
      changePercent: 1.90,
      volume: '1.2亿',
      marketCap: '2400亿',
      industry: '银行',
      peRatio: 8.5,
      dividendYield: 3.2,
    },
    {
      symbol: '000002',
      name: '万科A',
      price: 15.67,
      change: -0.45,
      changePercent: -2.79,
      volume: '0.8亿',
      marketCap: '1800亿',
      industry: '房地产',
      peRatio: 6.2,
      dividendYield: 4.5,
    },
    {
      symbol: '000333',
      name: '美的集团',
      price: 56.78,
      change: 1.23,
      changePercent: 2.21,
      volume: '0.5亿',
      marketCap: '4000亿',
      industry: '家电',
      peRatio: 18.5,
      dividendYield: 2.8,
    },
    {
      symbol: '000858',
      name: '五粮液',
      price: 156.78,
      change: 3.45,
      changePercent: 2.25,
      volume: '0.3亿',
      marketCap: '6000亿',
      industry: '白酒',
      peRatio: 32.5,
      dividendYield: 1.2,
    },
    {
      symbol: '002415',
      name: '海康威视',
      price: 34.56,
      change: 0.78,
      changePercent: 2.31,
      volume: '0.4亿',
      marketCap: '3200亿',
      industry: '安防',
      peRatio: 25.3,
      dividendYield: 2.1,
    },
    {
      symbol: '300750',
      name: '宁德时代',
      price: 234.56,
      change: 8.45,
      changePercent: 3.73,
      volume: '0.6亿',
      marketCap: '10000亿',
      industry: '新能源',
      peRatio: 45.2,
      dividendYield: 0.8,
    },
    {
      symbol: '600036',
      name: '招商银行',
      price: 32.45,
      change: -0.23,
      changePercent: -0.70,
      volume: '0.9亿',
      marketCap: '8000亿',
      industry: '银行',
      peRatio: 7.8,
      dividendYield: 3.8,
    },
    {
      symbol: '600519',
      name: '贵州茅台',
      price: 1678.90,
      change: 45.32,
      changePercent: 2.77,
      volume: '0.1亿',
      marketCap: '21000亿',
      industry: '白酒',
      peRatio: 40.5,
      dividendYield: 1.5,
    },
    {
      symbol: '601318',
      name: '中国平安',
      price: 45.67,
      change: -0.89,
      changePercent: -1.91,
      volume: '1.1亿',
      marketCap: '8300亿',
      industry: '保险',
      peRatio: 9.2,
      dividendYield: 4.2,
    },
    {
      symbol: '601988',
      name: '中国银行',
      price: 3.45,
      change: -0.02,
      changePercent: -0.58,
      volume: '2.3亿',
      marketCap: '9500亿',
      industry: '银行',
      peRatio: 5.2,
      dividendYield: 5.8,
    },
  ];
  
  setStocks(sampleStocks);
};