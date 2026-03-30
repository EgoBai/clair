import { describe, it, expect } from 'vitest';

// 前端状态管理逻辑
type ActionType = string;

interface Action { type: ActionType; payload?: any; }

function createStore<T>(initialState: T, reducer: (state: T, action: Action) => T) {
  let state = initialState;
  const listeners: ((state: T) => void)[] = [];

  return {
    getState: () => state,
    dispatch: (action: Action) => {
      state = reducer(state, action);
      listeners.forEach(l => l(state));
    },
    subscribe: (listener: (state: T) => void) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

// 典型A股状态
interface AppState {
  stocks: { code: string; price: number; change: number }[];
  selectedStock: string | null;
  watchlist: string[];
  filters: { sector: string; minPrice: number; maxPrice: number };
  sortConfig: { field: string; order: 'asc' | 'desc' };
  pagination: { page: number; pageSize: number };
  loading: boolean;
  error: string | null;
  theme: 'light' | 'dark';
}

const initialState: AppState = {
  stocks: [],
  selectedStock: null,
  watchlist: [],
  filters: { sector: '', minPrice: 0, maxPrice: Infinity },
  sortConfig: { field: 'code', order: 'asc' },
  pagination: { page: 1, pageSize: 20 },
  loading: false,
  error: null,
  theme: 'light',
};

function appReducer(state: AppState = initialState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STOCKS':
      return { ...state, stocks: action.payload, loading: false };
    case 'SELECT_STOCK':
      return { ...state, selectedStock: action.payload };
    case 'ADD_TO_WATCHLIST':
      if (state.watchlist.includes(action.payload)) return state;
      return { ...state, watchlist: [...state.watchlist, action.payload] };
    case 'REMOVE_FROM_WATCHLIST':
      return { ...state, watchlist: state.watchlist.filter(c => c !== action.payload) };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload }, pagination: { ...state.pagination, page: 1 } };
    case 'SET_SORT':
      return { ...state, sortConfig: action.payload };
    case 'SET_PAGE':
      return { ...state, pagination: { ...state.pagination, page: action.payload } };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' };
    case 'RESET_FILTERS':
      return { ...state, filters: initialState.filters, pagination: { ...state.pagination, page: 1 } };
    default:
      return state;
  }
}

// Selector逻辑
function getFilteredStocks(state: AppState) {
  return state.stocks.filter(s => {
    if (state.filters.sector && s.code[0] !== state.filters.sector[0]) return false;
    if (s.price < state.filters.minPrice) return false;
    if (state.filters.maxPrice !== Infinity && s.price > state.filters.maxPrice) return false;
    return true;
  });
}

function getSortedStocks(state: AppState) {
  const filtered = getFilteredStocks(state);
  return [...filtered].sort((a, b) => {
    const aVal = (a as any)[state.sortConfig.field];
    const bVal = (b as any)[state.sortConfig.field];
    const diff = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
    return state.sortConfig.order === 'asc' ? diff : -diff;
  });
}

function getPagedStocks(state: AppState) {
  const sorted = getSortedStocks(state);
  const start = (state.pagination.page - 1) * state.pagination.pageSize;
  return sorted.slice(start, start + state.pagination.pageSize);
}

describe('前端状态管理', () => {
  describe('createStore', () => {
    it('应该返回初始状态', () => {
      const store = createStore({ count: 0 }, (s) => s);
      expect(store.getState()).toEqual({ count: 0 });
    });

    it('dispatch应该更新状态', () => {
      const store = createStore({ count: 0 }, (state, action) => {
        if (action.type === 'INCREMENT') return { count: state.count + 1 };
        return state;
      });
      store.dispatch({ type: 'INCREMENT' });
      expect(store.getState().count).toBe(1);
    });

    it('subscribe应该在状态变化时通知', () => {
      const store = createStore({ count: 0 }, (state, action) => {
        if (action.type === 'INCREMENT') return { count: state.count + 1 };
        return state;
      });
      let notified = false;
      store.subscribe(() => { notified = true; });
      store.dispatch({ type: 'INCREMENT' });
      expect(notified).toBe(true);
    });

    it('unsubscribe应该停止通知', () => {
      const store = createStore({ count: 0 }, (state, action) => {
        if (action.type === 'INCREMENT') return { count: state.count + 1 };
        return state;
      });
      let count = 0;
      const unsub = store.subscribe(() => { count++; });
      store.dispatch({ type: 'INCREMENT' });
      unsub();
      store.dispatch({ type: 'INCREMENT' });
      expect(count).toBe(1);
    });
  });

  describe('appReducer', () => {
    it('SET_STOCKS应该设置股票列表', () => {
      const stocks = [{ code: '600000', price: 10, change: 1 }];
      const result = appReducer(initialState, { type: 'SET_STOCKS', payload: stocks });
      expect(result.stocks).toEqual(stocks);
      expect(result.loading).toBe(false);
    });

    it('SELECT_STOCK应该设置选中股票', () => {
      const result = appReducer(initialState, { type: 'SELECT_STOCK', payload: '600000' });
      expect(result.selectedStock).toBe('600000');
    });

    it('ADD_TO_WATCHLIST应该添加到自选', () => {
      const result = appReducer(initialState, { type: 'ADD_TO_WATCHLIST', payload: '600000' });
      expect(result.watchlist).toContain('600000');
    });

    it('重复添加不应该产生重复', () => {
      let state = appReducer(initialState, { type: 'ADD_TO_WATCHLIST', payload: '600000' });
      state = appReducer(state, { type: 'ADD_TO_WATCHLIST', payload: '600000' });
      expect(state.watchlist.filter(c => c === '600000')).toHaveLength(1);
    });

    it('REMOVE_FROM_WATCHLIST应该移除', () => {
      let state = appReducer(initialState, { type: 'ADD_TO_WATCHLIST', payload: '600000' });
      state = appReducer(state, { type: 'REMOVE_FROM_WATCHLIST', payload: '600000' });
      expect(state.watchlist).not.toContain('600000');
    });

    it('SET_FILTERS应该合并筛选条件并重置页码', () => {
      let state = appReducer(initialState, { type: 'SET_PAGE', payload: 5 });
      state = appReducer(state, { type: 'SET_FILTERS', payload: { minPrice: 10 } });
      expect(state.filters.minPrice).toBe(10);
      expect(state.pagination.page).toBe(1);
    });

    it('SET_SORT应该设置排序', () => {
      const result = appReducer(initialState, { type: 'SET_SORT', payload: { field: 'price', order: 'desc' } });
      expect(result.sortConfig).toEqual({ field: 'price', order: 'desc' });
    });

    it('SET_PAGE应该设置页码', () => {
      const result = appReducer(initialState, { type: 'SET_PAGE', payload: 3 });
      expect(result.pagination.page).toBe(3);
    });

    it('SET_LOADING应该设置loading', () => {
      const result = appReducer(initialState, { type: 'SET_LOADING', payload: true });
      expect(result.loading).toBe(true);
    });

    it('SET_ERROR应该设置error并清除loading', () => {
      const loadingState = { ...initialState, loading: true };
      const result = appReducer(loadingState, { type: 'SET_ERROR', payload: '网络错误' });
      expect(result.error).toBe('网络错误');
      expect(result.loading).toBe(false);
    });

    it('TOGGLE_THEME应该切换主题', () => {
      const result = appReducer(initialState, { type: 'TOGGLE_THEME' });
      expect(result.theme).toBe('dark');
      const result2 = appReducer(result, { type: 'TOGGLE_THEME' });
      expect(result2.theme).toBe('light');
    });

    it('RESET_FILTERS应该重置筛选', () => {
      const modified = { ...initialState, filters: { sector: 'tech', minPrice: 10, maxPrice: 100 } };
      const result = appReducer(modified, { type: 'RESET_FILTERS' });
      expect(result.filters).toEqual(initialState.filters);
    });

    it('未知action应该返回原状态', () => {
      const result = appReducer(initialState, { type: 'UNKNOWN' });
      expect(result).toEqual(initialState);
    });
  });

  describe('Selectors', () => {
    const testState: AppState = {
      stocks: [
        { code: '600000', price: 10, change: 1 },
        { code: '000001', price: 20, change: -1 },
        { code: '300001', price: 30, change: 2 },
        { code: '600001', price: 5, change: -0.5 },
      ],
      selectedStock: null,
      watchlist: [],
      filters: { sector: '', minPrice: 0, maxPrice: Infinity },
      sortConfig: { field: 'code', order: 'asc' },
      pagination: { page: 1, pageSize: 2 },
      loading: false,
      error: null,
      theme: 'light',
    };

    it('getFilteredStocks应该返回所有（无筛选）', () => {
      expect(getFilteredStocks(testState)).toHaveLength(4);
    });

    it('getSortedStocks应该按code升序', () => {
      const sorted = getSortedStocks(testState);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].code >= sorted[i - 1].code).toBe(true);
      }
    });

    it('getPagedStocks应该返回分页数据', () => {
      const paged = getPagedStocks(testState);
      expect(paged).toHaveLength(2);
    });

    it('第2页应该返回正确的数据', () => {
      const paged = getPagedStocks({ ...testState, pagination: { page: 2, pageSize: 2 } });
      expect(paged).toHaveLength(2);
    });

    it('超出范围应该返回空', () => {
      const paged = getPagedStocks({ ...testState, pagination: { page: 99, pageSize: 2 } });
      expect(paged).toHaveLength(0);
    });
  });
});
