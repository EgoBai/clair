/**
 * 全局状态管理 - Zustand Store
 */

import { create } from 'zustand';

export interface StockInfo {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry?: string;
  isActive: boolean;
}

export interface DailyQuote {
  id: number;
  stockId: number;
  tradeDate: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  turnover: number;
  change: number;
  changePercent: number;
  amplitude: number;
  turnoverRate: number;
  peRatio?: number;
  pbRatio?: number;
  marketCap?: number;
  circulatingMarketCap?: number;
}

export interface StockWithQuote extends StockInfo {
  latestQuote?: DailyQuote;
}

export interface MarketSummary {
  date: string;
  totalStocks: number;
  totalMarketCap: number;
  totalVolume: number;
  totalTurnover: number;
  risingStocks: number;
  fallingStocks: number;
  unchangedStocks: number;
}

export interface TechnicalIndicator {
  tradeDate: string;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
  bollUpper?: number;
  bollMiddle?: number;
  bollLower?: number;
}

interface AppStore {
  // 股票列表
  stocks: StockWithQuote[];
  setStocks: (stocks: StockWithQuote[]) => void;

  // 选中的股票
  selectedStock: StockWithQuote | null;
  setSelectedStock: (stock: StockWithQuote | null) => void;

  // 市场概况
  marketSummary: MarketSummary | null;
  setMarketSummary: (summary: MarketSummary | null) => void;

  // 自选股
  watchlist: StockWithQuote[];
  setWatchlist: (list: StockWithQuote[]) => void;
  addToWatchlist: (stock: StockWithQuote) => void;
  removeFromWatchlist: (symbol: string) => void;

  // K线数据
  klineData: any[];
  setKlineData: (data: any[]) => void;

  // 技术指标
  indicators: TechnicalIndicator[];
  setIndicators: (data: TechnicalIndicator[]) => void;

  // 加载状态
  loading: boolean;
  setLoading: (loading: boolean) => void;

  // 错误状态
  error: string | null;
  setError: (error: string | null) => void;

  // 搜索
  searchKeyword: string;
  setSearchKeyword: (keyword: string) => void;

  // 侧边栏
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // 移动端菜单
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  stocks: [],
  setStocks: (stocks) => set({ stocks }),

  selectedStock: null,
  setSelectedStock: (stock) => set({ selectedStock: stock }),

  marketSummary: null,
  setMarketSummary: (summary) => set({ marketSummary: summary }),

  watchlist: [],
  setWatchlist: (list) => set({ watchlist: list }),
  addToWatchlist: (stock) =>
    set((state) => ({
      watchlist: state.watchlist.some((s) => s.symbol === stock.symbol)
        ? state.watchlist
        : [...state.watchlist, stock],
    })),
  removeFromWatchlist: (symbol) =>
    set((state) => ({
      watchlist: state.watchlist.filter((s) => s.symbol !== symbol),
    })),

  klineData: [],
  setKlineData: (data) => set({ klineData: data }),

  indicators: [],
  setIndicators: (data) => set({ indicators: data }),

  loading: false,
  setLoading: (loading) => set({ loading }),

  error: null,
  setError: (error) => set({ error }),

  searchKeyword: '',
  setSearchKeyword: (keyword) => set({ searchKeyword: keyword }),

  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  mobileMenuOpen: false,
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
}));
