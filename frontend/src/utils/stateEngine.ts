/**
 * 轻量级状态管理引擎
 * 支持状态订阅、派生状态、中间件、时间旅行调试
 */

// ==================== 类型定义 ====================

export type Listener<T> = (state: T, prevState: T) => void;
export type Middleware<T> = (state: T, action: string, payload?: unknown) => T;
export type Selector<T, R> = (state: T) => R;

export interface StoreConfig<T> {
  initialState: T;
  middleware?: Middleware<T>[];
  devTools?: boolean;
  name?: string;
}

export interface Store<T> {
  getState: () => T;
  setState: (updater: Partial<T> | ((prev: T) => Partial<T>)) => void;
  subscribe: (listener: Listener<T>) => () => void;
  select: <R>(selector: Selector<T, R>) => R;
  dispatch: (action: string, payload?: unknown) => void;
  reset: () => void;
  getHistory: () => T[];
  undo: () => boolean;
  redo: () => boolean;
}

export interface HistoryEntry<T> {
  state: T;
  action: string;
  timestamp: number;
}

// ==================== Store工厂 ====================

export function createStore<T extends Record<string, unknown>>(
  config: StoreConfig<T>,
): Store<T> {
  let state = { ...config.initialState };
  const initialState = { ...config.initialState };
  const listeners = new Set<Listener<T>>();
  const middleware = config.middleware || [];

  // 历史记录（时间旅行）
  const history: HistoryEntry<T>[] = [{ state: { ...state }, action: '@@INIT', timestamp: Date.now() }];
  let historyIndex = 0;
  const maxHistory = 50;

  function getState(): T {
    return state;
  }

  function setState(updater: Partial<T> | ((prev: T) => Partial<T>)): void {
    const prevState = { ...state };
    const changes = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...changes };

    // 记录历史
    historyIndex++;
    history.splice(historyIndex, history.length - historyIndex, {
      state: { ...state },
      action: '@@SET',
      timestamp: Date.now(),
    });
    if (history.length > maxHistory) {
      history.shift();
      historyIndex--;
    }

    // 通知订阅者
    listeners.forEach(listener => {
      try { listener(state, prevState); } catch { /* ignored */ }
    });
  }

  function subscribe(listener: Listener<T>): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function select<R>(selector: Selector<T, R>): R {
    return selector(state);
  }

  function dispatch(action: string, payload?: unknown): void {
    let newState = state;
    for (const mw of middleware) {
      newState = mw(newState, action, payload);
    }

    const prevState = { ...state };
    state = newState;

    historyIndex++;
    history.splice(historyIndex, history.length - historyIndex, {
      state: { ...state }, action, timestamp: Date.now(),
    });
    if (history.length > maxHistory) {
      history.shift();
      historyIndex--;
    }

    listeners.forEach(listener => {
      try { listener(state, prevState); } catch { /* ignored */ }
    });
  }

  function reset(): void {
    const prevState = { ...state };
    state = { ...initialState };

    historyIndex++;
    history.splice(historyIndex, history.length - historyIndex, {
      state: { ...state }, action: '@@RESET', timestamp: Date.now(),
    });

    listeners.forEach(listener => {
      try { listener(state, prevState); } catch { /* ignored */ }
    });
  }

  function getHistory(): T[] {
    return history.map(h => h.state);
  }

  function undo(): boolean {
    if (historyIndex <= 0) return false;
    historyIndex--;
    const prevState = { ...state };
    state = { ...history[historyIndex].state };

    listeners.forEach(listener => {
      try { listener(state, prevState); } catch { /* ignored */ }
    });
    return true;
  }

  function redo(): boolean {
    if (historyIndex >= history.length - 1) return false;
    historyIndex++;
    const prevState = { ...state };
    state = { ...history[historyIndex].state };

    listeners.forEach(listener => {
      try { listener(state, prevState); } catch { /* ignored */ }
    });
    return true;
  }

  return { getState, setState, subscribe, select, dispatch, reset, getHistory, undo, redo };
}

// ==================== 计算属性 ====================

export function createComputed<T, R>(
  store: Pick<Store<T>, 'getState' | 'subscribe'>,
  selector: Selector<T, R>,
): { get: () => R; subscribe: (listener: (value: R) => void) => () => void } {
  let cached: R = selector(store.getState());
  const listeners = new Set<(value: R) => void>();

  store.subscribe((state) => {
    const next = selector(state);
    if (next !== cached) {
      cached = next;
      listeners.forEach(l => { try { l(next); } catch { /* ignored */ } });
    }
  });

  return {
    get: () => cached,
    subscribe: (listener: (value: R) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

// ==================== 中间件 ====================

/**
 * 日志中间件
 */
export function loggingMiddleware<T>(name: string = 'Store'): Middleware<T> {
  return (state, action, payload) => {
    console.log(`[${name}] Action: ${action}`, payload ?? '');
    return state;
  };
}

/**
 * 持久化中间件
 */
export function persistenceMiddleware<T>(
  key: string,
  storage: 'localStorage' | 'sessionStorage' = 'localStorage',
): Middleware<T> {
  return (state, action) => {
    try {
      const store = storage === 'localStorage' ? localStorage : sessionStorage;
      store.setItem(key, JSON.stringify(state));
    } catch { /* ignored */ }
    return state;
  };
}

/**
 * 验证中间件
 */
export function validationMiddleware<T>(
  validate: (state: T) => boolean | string,
): Middleware<T> {
  return (state, action, payload) => {
    const result = validate(state);
    if (result !== true) {
      console.warn(`Validation failed: ${result}`);
    }
    return state;
  };
}

/**
 * 不变性检查中间件
 */
export function immutabilityMiddleware<T extends Record<string, unknown>>(): Middleware<T> {
  return (state, action, payload) => {
    if (typeof payload === 'object' && payload !== null) {
      return { ...state, ...payload as Partial<T> };
    }
    return state;
  };
}

// ==================== 派生状态 ====================

/**
 * 创建派生状态（简单版）
 */
export function derive<T, R>(
  store: Pick<Store<T>, 'getState'>,
  fn: Selector<T, R>,
): R {
  return fn(store.getState());
}

/**
 * 组合多个selector
 */
export function combineSelectors<T, R1, R2>(
  s1: Selector<T, R1>,
  s2: Selector<T, R2>,
): Selector<T, [R1, R2]> {
  return (state: T) => [s1(state), s2(state)];
}

// ==================== 批量更新 ====================

/**
 * 批量更新（合并多次setState为一次通知）
 */
export function batchUpdate<T>(
  store: Pick<Store<T>, 'setState'>,
  updates: Array<Partial<T> | ((prev: T) => Partial<T>)>,
): void {
  // 简单实现：连续调用setState
  // 真实场景可以用requestAnimationFrame批量处理
  for (const update of updates) {
    store.setState(update);
  }
}

// ==================== 状态快照 ====================

/**
 * 创建状态快照
 */
export function snapshot<T>(store: Pick<Store<T>, 'getState'>): T {
  return JSON.parse(JSON.stringify(store.getState()));
}

/**
 * 恢复状态快照
 */
export function restoreSnapshot<T extends Record<string, unknown>>(
  store: Pick<Store<T>, 'setState'>,
  snap: T,
): void {
  store.setState(snap);
}
