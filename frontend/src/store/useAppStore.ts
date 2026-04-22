/**
 * 增强全局状态管理 - Zustand Store
 * 支持持久化、URL状态同步、主题切换
 * 参考富途状态管理架构
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ==================== 类型 ====================

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

// ==================== 界面偏好 ====================

export type ThemeMode = 'light' | 'dark' | 'system';
export type KLinePeriod = '5m' | '15m' | '60m' | 'day' | 'week' | 'month';

interface UIPreferences {
  theme: ThemeMode;
  klinePeriod: KLinePeriod;
  showVolume: boolean;
  sidebarCollapsed: boolean;
  watchlistGroupId: string;
}

// ==================== URL同步参数 ====================

interface URLState {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  searchKeyword: string;
  market: string;
  industry: string;
}

// ==================== Store ====================

interface AppStore {
  // === UI偏好（持久化） ===
  preferences: UIPreferences;
  setTheme: (theme: ThemeMode) => void;
  setKlinePeriod: (period: KLinePeriod) => void;
  toggleVolume: () => void;
  toggleSidebar: () => void;
  setWatchlistGroup: (id: string) => void;

  // === URL状态 ===
  urlState: URLState;
  setURLState: (state: Partial<URLState>) => void;
  syncFromURL: (params: URLSearchParams) => void;
  toURLParams: () => URLSearchParams;

  // === 股票数据 ===
  stocks: StockWithQuote[];
  setStocks: (stocks: StockWithQuote[]) => void;
  selectedStock: StockWithQuote | null;
  setSelectedStock: (stock: StockWithQuote | null) => void;

  // === 市场概况 ===
  marketSummary: MarketSummary | null;
  setMarketSummary: (summary: MarketSummary | null) => void;

  // === 自选股 ===
  watchlist: StockWithQuote[];
  setWatchlist: (list: StockWithQuote[]) => void;
  addToWatchlist: (stock: StockWithQuote) => void;
  removeFromWatchlist: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;

  // === K线/指标 ===
  klineData: unknown[];
  setKlineData: (data: unknown[]) => void;
  indicators: TechnicalIndicator[];
  setIndicators: (data: TechnicalIndicator[]) => void;

  // === 通用状态 ===
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  searchKeyword: string;
  setSearchKeyword: (keyword: string) => void;

  // === 移动端 ===
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // === UI偏好 ===
      preferences: {
        theme: 'light',
        klinePeriod: 'day',
        showVolume: true,
        sidebarCollapsed: false,
        watchlistGroupId: 'default',
      },
      setTheme: (theme) =>
        set((s) => ({ preferences: { ...s.preferences, theme } })),
      setKlinePeriod: (period) =>
        set((s) => ({ preferences: { ...s.preferences, klinePeriod: period } })),
      toggleVolume: () =>
        set((s) => ({ preferences: { ...s.preferences, showVolume: !s.preferences.showVolume } })),
      toggleSidebar: () =>
        set((s) => ({ preferences: { ...s.preferences, sidebarCollapsed: !s.preferences.sidebarCollapsed } })),
      setWatchlistGroup: (id) =>
        set((s) => ({ preferences: { ...s.preferences, watchlistGroupId: id } })),

      // === URL状态 ===
      urlState: {
        page: 1,
        pageSize: 20,
        sortBy: 'symbol',
        sortOrder: 'asc',
        searchKeyword: '',
        market: '',
        industry: '',
      },
      setURLState: (partial) =>
        set((s) => ({ urlState: { ...s.urlState, ...partial } })),
      syncFromURL: (params) => {
        const state: Partial<URLState> = {};
        const page = parseInt(params.get('page') || '');
        if (!isNaN(page)) state.page = page;
        const pageSize = parseInt(params.get('pageSize') || '');
        if (!isNaN(pageSize)) state.pageSize = pageSize;
        if (params.get('sortBy')) state.sortBy = params.get('sortBy')!;
        if (params.get('sortOrder')) state.sortOrder = params.get('sortOrder') as 'asc' | 'desc';
        if (params.get('q')) state.searchKeyword = params.get('q')!;
        if (params.get('market')) state.market = params.get('market')!;
        if (params.get('industry')) state.industry = params.get('industry')!;
        if (Object.keys(state).length > 0) {
          set((s) => ({ urlState: { ...s.urlState, ...state } }));
        }
      },
      toURLParams: () => {
        const s = get().urlState;
        const params = new URLSearchParams();
        if (s.page > 1) params.set('page', String(s.page));
        if (s.pageSize !== 20) params.set('pageSize', String(s.pageSize));
        if (s.sortBy !== 'symbol') params.set('sortBy', s.sortBy);
        if (s.sortOrder !== 'asc') params.set('sortOrder', s.sortOrder);
        if (s.searchKeyword) params.set('q', s.searchKeyword);
        if (s.market) params.set('market', s.market);
        if (s.industry) params.set('industry', s.industry);
        return params;
      },

      // === 股票数据 ===
      stocks: [],
      setStocks: (stocks) => set({ stocks }),
      selectedStock: null,
      setSelectedStock: (stock) => set({ selectedStock: stock }),

      // === 市场概况 ===
      marketSummary: null,
      setMarketSummary: (summary) => set({ marketSummary: summary }),

      // === 自选股 ===
      watchlist: [],
      setWatchlist: (list) => set({ watchlist: list }),
      addToWatchlist: (stock) =>
        set((s) => ({
          watchlist: s.watchlist.some((w) => w.symbol === stock.symbol)
            ? s.watchlist
            : [...s.watchlist, stock],
        })),
      removeFromWatchlist: (symbol) =>
        set((s) => ({ watchlist: s.watchlist.filter((w) => w.symbol !== symbol) })),
      isInWatchlist: (symbol) => get().watchlist.some((w) => w.symbol === symbol),

      // === K线/指标 ===
      klineData: [],
      setKlineData: (data) => set({ klineData: data }),
      indicators: [],
      setIndicators: (data) => set({ indicators: data }),

      // === 通用 ===
      loading: false,
      setLoading: (loading) => set({ loading }),
      error: null,
      setError: (error) => set({ error }),
      searchKeyword: '',
      setSearchKeyword: (keyword) => set({ searchKeyword: keyword }),

      // === 移动端 ===
      mobileMenuOpen: false,
      setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
    }),
    {
      name: 'a-stock-app-store',
      storage: createJSONStorage(() => localStorage),
      // 只持久化偏好设置
      partialize: (state) => ({
        preferences: state.preferences,
      }),
    }
  )
);

// ==================== 选择器工具 ====================

/** 主题模式选择器（含系统偏好检测） */
export function useResolvedTheme(): 'light' | 'dark' {
  const { theme } = useAppStore((s) => s.preferences);
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/** 当前K线周期选择器 */
export function useKlinePeriod() {
  return useAppStore((s) => s.preferences.klinePeriod);
}
