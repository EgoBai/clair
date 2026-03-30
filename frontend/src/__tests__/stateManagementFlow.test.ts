import { describe, it, expect } from 'vitest';

// 前端状态管理与数据流测试

interface AppState {
  theme: 'light' | 'dark' | 'system';
  language: 'zh-CN' | 'en-US';
  watchlist: string[];
  alerts: AlertItem[];
  settings: UserSettings;
}

interface AlertItem {
  id: string;
  symbol: string;
  type: 'price_above' | 'price_below' | 'change_percent' | 'volume';
  value: number;
  triggered: boolean;
  createdAt: number;
}

interface UserSettings {
  klinePeriod: '5m' | '15m' | '60m' | 'day' | 'week' | 'month';
  showVolume: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
}

function createReducer<S, A extends { type: string }>(
  handlers: Record<string, (state: S, action: any) => S>
): (state: S, action: A) => S {
  return (state: S, action: A) => {
    const handler = handlers[action.type];
    return handler ? handler(state, action) : state;
  };
}

const initialState: AppState = {
  theme: 'system',
  language: 'zh-CN',
  watchlist: [],
  alerts: [],
  settings: {
    klinePeriod: 'day',
    showVolume: true,
    autoRefresh: true,
    refreshInterval: 30,
  },
};

type AppAction =
  | { type: 'SET_THEME'; payload: 'light' | 'dark' | 'system' }
  | { type: 'SET_LANGUAGE'; payload: 'zh-CN' | 'en-US' }
  | { type: 'ADD_WATCHLIST'; payload: string }
  | { type: 'REMOVE_WATCHLIST'; payload: string }
  | { type: 'ADD_ALERT'; payload: Omit<AlertItem, 'id' | 'triggered' | 'createdAt'> }
  | { type: 'TRIGGER_ALERT'; payload: string }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<UserSettings> }
  | { type: 'RESET' };

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const appReducer = createReducer<AppState, AppAction>({
  SET_THEME: (state, action) => ({ ...state, theme: action.payload }),
  SET_LANGUAGE: (state, action) => ({ ...state, language: action.payload }),
  ADD_WATCHLIST: (state, action) => {
    if (state.watchlist.includes(action.payload)) return state;
    return { ...state, watchlist: [...state.watchlist, action.payload] };
  },
  REMOVE_WATCHLIST: (state, action) => ({
    ...state,
    watchlist: state.watchlist.filter(s => s !== action.payload),
  }),
  ADD_ALERT: (state, action) => ({
    ...state,
    alerts: [...state.alerts, {
      ...action.payload,
      id: generateId(),
      triggered: false,
      createdAt: Date.now(),
    }],
  }),
  TRIGGER_ALERT: (state, action) => ({
    ...state,
    alerts: state.alerts.map(a =>
      a.id === action.payload ? { ...a, triggered: true } : a
    ),
  }),
  UPDATE_SETTINGS: (state, action) => ({
    ...state,
    settings: { ...state.settings, ...action.payload },
  }),
  RESET: () => initialState,
});

// Selector functions
function selectActiveAlerts(state: AppState): AlertItem[] {
  return state.alerts.filter(a => !a.triggered);
}

function selectTriggeredAlerts(state: AppState): AlertItem[] {
  return state.alerts.filter(a => a.triggered);
}

function selectAlertsBySymbol(state: AppState, symbol: string): AlertItem[] {
  return state.alerts.filter(a => a.symbol === symbol);
}

function selectWatchlistCount(state: AppState): number {
  return state.watchlist.length;
}

function selectIsInWatchlist(state: AppState, symbol: string): boolean {
  return state.watchlist.includes(symbol);
}

// Undo/Redo system
function createUndoableReducer<S, A>(reducer: (state: S, action: A) => S, initialState: S) {
  let past: S[] = [];
  let present: S = initialState;
  let future: S[] = [];

  return {
    getState: () => present,
    getPast: () => past,
    getFuture: () => future,
    dispatch: (action: A) => {
      past = [...past, present];
      future = [];
      present = reducer(present, action);
      return present;
    },
    undo: () => {
      if (past.length === 0) return present;
      future = [present, ...future];
      present = past[past.length - 1];
      past = past.slice(0, -1);
      return present;
    },
    redo: () => {
      if (future.length === 0) return present;
      past = [...past, present];
      present = future[0];
      future = future.slice(1);
      return present;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}

describe('状态管理与数据流', () => {
  describe('Reducer', () => {
    it('设置主题', () => {
      const state = appReducer(initialState, { type: 'SET_THEME', payload: 'dark' });
      expect(state.theme).toBe('dark');
    });

    it('设置语言', () => {
      const state = appReducer(initialState, { type: 'SET_LANGUAGE', payload: 'en-US' });
      expect(state.language).toBe('en-US');
    });

    it('添加自选股', () => {
      const state = appReducer(initialState, { type: 'ADD_WATCHLIST', payload: '600519' });
      expect(state.watchlist).toContain('600519');
    });

    it('自选股去重', () => {
      let state = appReducer(initialState, { type: 'ADD_WATCHLIST', payload: '600519' });
      state = appReducer(state, { type: 'ADD_WATCHLIST', payload: '600519' });
      expect(state.watchlist.filter(s => s === '600519')).toHaveLength(1);
    });

    it('删除自选股', () => {
      let state = appReducer(initialState, { type: 'ADD_WATCHLIST', payload: '600519' });
      state = appReducer(state, { type: 'REMOVE_WATCHLIST', payload: '600519' });
      expect(state.watchlist).not.toContain('600519');
    });

    it('添加预警', () => {
      const state = appReducer(initialState, {
        type: 'ADD_ALERT',
        payload: { symbol: '600519', type: 'price_above', value: 2000 },
      });
      expect(state.alerts.length).toBe(1);
      expect(state.alerts[0].symbol).toBe('600519');
      expect(state.alerts[0].triggered).toBe(false);
    });

    it('触发预警', () => {
      let state = appReducer(initialState, {
        type: 'ADD_ALERT',
        payload: { symbol: '600519', type: 'price_above', value: 2000 },
      });
      const alertId = state.alerts[0].id;
      state = appReducer(state, { type: 'TRIGGER_ALERT', payload: alertId });
      expect(state.alerts[0].triggered).toBe(true);
    });

    it('更新设置', () => {
      const state = appReducer(initialState, {
        type: 'UPDATE_SETTINGS',
        payload: { klinePeriod: '60m', showVolume: false },
      });
      expect(state.settings.klinePeriod).toBe('60m');
      expect(state.settings.showVolume).toBe(false);
      expect(state.settings.autoRefresh).toBe(true); // 未修改的保留
    });

    it('部分更新不丢失其他设置', () => {
      const state = appReducer(initialState, {
        type: 'UPDATE_SETTINGS',
        payload: { refreshInterval: 60 },
      });
      expect(state.settings.klinePeriod).toBe('day');
      expect(state.settings.refreshInterval).toBe(60);
    });

    it('重置状态', () => {
      let state = appReducer(initialState, { type: 'SET_THEME', payload: 'dark' });
      state = appReducer(state, { type: 'ADD_WATCHLIST', payload: '600519' });
      state = appReducer(state, { type: 'RESET' });
      expect(state).toEqual(initialState);
    });

    it('未知action不变', () => {
      const state = appReducer(initialState, { type: 'UNKNOWN' } as any);
      expect(state).toEqual(initialState);
    });
  });

  describe('Selector', () => {
    it('活跃预警筛选', () => {
      let state = appReducer(initialState, {
        type: 'ADD_ALERT',
        payload: { symbol: '600519', type: 'price_above', value: 2000 },
      });
      state = appReducer(state, {
        type: 'ADD_ALERT',
        payload: { symbol: '000858', type: 'price_below', value: 100 },
      });
      const alertId = state.alerts[0].id;
      state = appReducer(state, { type: 'TRIGGER_ALERT', payload: alertId });
      expect(selectActiveAlerts(state)).toHaveLength(1);
      expect(selectTriggeredAlerts(state)).toHaveLength(1);
    });

    it('按股票筛选预警', () => {
      let state = appReducer(initialState, {
        type: 'ADD_ALERT',
        payload: { symbol: '600519', type: 'price_above', value: 2000 },
      });
      state = appReducer(state, {
        type: 'ADD_ALERT',
        payload: { symbol: '000858', type: 'price_below', value: 100 },
      });
      expect(selectAlertsBySymbol(state, '600519')).toHaveLength(1);
      expect(selectAlertsBySymbol(state, '300750')).toHaveLength(0);
    });

    it('自选股计数', () => {
      let state = appReducer(initialState, { type: 'ADD_WATCHLIST', payload: '600519' });
      state = appReducer(state, { type: 'ADD_WATCHLIST', payload: '000858' });
      expect(selectWatchlistCount(state)).toBe(2);
    });

    it('是否在自选股中', () => {
      const state = appReducer(initialState, { type: 'ADD_WATCHLIST', payload: '600519' });
      expect(selectIsInWatchlist(state, '600519')).toBe(true);
      expect(selectIsInWatchlist(state, '000858')).toBe(false);
    });
  });

  describe('Undo/Redo', () => {
    it('初始状态', () => {
      const store = createUndoableReducer(appReducer, initialState);
      expect(store.getState()).toEqual(initialState);
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
    });

    it('dispatch后可undo', () => {
      const store = createUndoableReducer(appReducer, initialState);
      store.dispatch({ type: 'SET_THEME', payload: 'dark' });
      expect(store.getState().theme).toBe('dark');
      expect(store.canUndo()).toBe(true);
    });

    it('undo恢复前状态', () => {
      const store = createUndoableReducer(appReducer, initialState);
      store.dispatch({ type: 'SET_THEME', payload: 'dark' });
      store.undo();
      expect(store.getState().theme).toBe('system');
      expect(store.canRedo()).toBe(true);
    });

    it('redo恢复后状态', () => {
      const store = createUndoableReducer(appReducer, initialState);
      store.dispatch({ type: 'SET_THEME', payload: 'dark' });
      store.undo();
      store.redo();
      expect(store.getState().theme).toBe('dark');
      expect(store.canRedo()).toBe(false);
    });

    it('新操作清空redo', () => {
      const store = createUndoableReducer(appReducer, initialState);
      store.dispatch({ type: 'SET_THEME', payload: 'dark' });
      store.undo();
      expect(store.canRedo()).toBe(true);
      store.dispatch({ type: 'SET_THEME', payload: 'light' });
      expect(store.canRedo()).toBe(false);
    });

    it('多次undo', () => {
      const store = createUndoableReducer(appReducer, initialState);
      store.dispatch({ type: 'SET_THEME', payload: 'dark' });
      store.dispatch({ type: 'SET_LANGUAGE', payload: 'en-US' });
      store.undo();
      expect(store.getState().language).toBe('zh-CN');
      store.undo();
      expect(store.getState().theme).toBe('system');
      expect(store.canUndo()).toBe(false);
    });
  });
});
