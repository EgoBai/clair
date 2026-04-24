import { describe, it, expect } from 'vitest';

// 状态管理与数据流测试
describe('状态管理系统', () => {
  describe('不可变数据操作', () => {
    const deepSet = (obj: any, path: string, value: unknown): any => {
      const keys = path.split('.');
      const result = { ...obj };
      let current = result;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...(current[keys[i]] || {}) };
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return result;
    };

    const deepDelete = (obj: any, path: string): any => {
      const keys = path.split('.');
      if (keys.length === 1) {
        const { [keys[0]]: _, ...rest } = obj;
        return rest;
      }
      const result = { ...obj };
      result[keys[0]] = deepDelete(result[keys[0]], keys.slice(1).join('.'));
      return result;
    };

    const deepMerge = (target: any, source: any): any => {
      const result = { ...target };
      for (const key of Object.keys(source)) {
        if (
          typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key]) &&
          typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])
        ) {
          result[key] = deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
      return result;
    };

    it('深层设置值', () => {
      const obj = { a: { b: { c: 1 } } };
      const result = deepSet(obj, 'a.b.c', 2);
      expect(result.a.b.c).toBe(2);
      expect(obj.a.b.c).toBe(1); // 原对象不变
    });

    it('创建中间路径', () => {
      const obj = { a: {} };
      const result = deepSet(obj, 'a.b.c', 'value');
      expect(result.a.b.c).toBe('value');
    });

    it('顶层设置', () => {
      const obj = { a: 1 };
      const result = deepSet(obj, 'b', 2);
      expect(result.b).toBe(2);
      expect(result.a).toBe(1);
    });

    it('深层删除', () => {
      const obj = { a: { b: { c: 1, d: 2 } } };
      const result = deepDelete(obj, 'a.b.c');
      expect(result.a.b.c).toBeUndefined();
      expect(result.a.b.d).toBe(2);
    });

    it('顶层删除', () => {
      const obj = { a: 1, b: 2 };
      const result = deepDelete(obj, 'a');
      expect(result.a).toBeUndefined();
      expect(result.b).toBe(2);
    });

    it('深层合并', () => {
      const target = { a: { b: 1, c: 2 }, d: 3 };
      const source = { a: { b: 10, e: 20 }, f: 30 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { b: 10, c: 2, e: 20 }, d: 3, f: 30 });
    });

    it('数组替换不合并', () => {
      const target = { a: [1, 2, 3] };
      const source = { a: [4, 5] };
      const result = deepMerge(target, source);
      expect(result.a).toEqual([4, 5]);
    });
  });

  describe('Store模式', () => {
    const createStore = <T>(initialState: T) => {
      let state = initialState;
      const listeners = new Set<(state: T) => void>();

      return {
        getState: () => state,
        setState: (updater: T | ((prev: T) => T)) => {
          state = typeof updater === 'function' ? (updater as (prev: T) => T)(state) : updater;
          listeners.forEach(l => l(state));
        },
        subscribe: (listener: (state: T) => void) => {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        listenerCount: () => listeners.size,
      };
    };

    it('初始状态', () => {
      const store = createStore({ count: 0 });
      expect(store.getState().count).toBe(0);
    });

    it('更新状态', () => {
      const store = createStore({ count: 0 });
      store.setState({ count: 1 });
      expect(store.getState().count).toBe(1);
    });

    it('函数式更新', () => {
      const store = createStore({ count: 0 });
      store.setState(prev => ({ count: prev.count + 1 }));
      expect(store.getState().count).toBe(1);
    });

    it('订阅通知', () => {
      const store = createStore({ count: 0 });
      let notified = false;
      store.subscribe(() => { notified = true; });
      store.setState({ count: 1 });
      expect(notified).toBe(true);
    });

    it('取消订阅', () => {
      const store = createStore({ count: 0 });
      let count = 0;
      const unsub = store.subscribe(() => { count++; });
      store.setState({ count: 1 });
      unsub();
      store.setState({ count: 2 });
      expect(count).toBe(1);
    });

    it('多订阅者', () => {
      const store = createStore({ count: 0 });
      let a = 0, b = 0;
      store.subscribe(() => { a++; });
      store.subscribe(() => { b++; });
      store.setState({ count: 1 });
      expect(a).toBe(1);
      expect(b).toBe(1);
    });

    it('listenerCount', () => {
      const store = createStore({ count: 0 });
      expect(store.listenerCount()).toBe(0);
      const unsub = store.subscribe(() => {});
      expect(store.listenerCount()).toBe(1);
      unsub();
      expect(store.listenerCount()).toBe(0);
    });
  });

  describe('选择器', () => {
    const createSelector = <T, R>(
      selector: (state: T) => R,
      equalityFn: (a: R, b: R) => boolean = (a, b) => a === b
    ) => {
      let lastState: T | undefined;
      let lastResult: R;

      return (state: T): R => {
        if (lastState === state) return lastResult;
        const result = selector(state);
        if (lastState !== undefined && equalityFn(result, lastResult)) {
          lastState = state;
          return lastResult;
        }
        lastState = state;
        lastResult = result;
        return result;
      };
    };

    it('返回选择结果', () => {
      const selectCount = createSelector((s: { count: number }) => s.count);
      expect(selectCount({ count: 42 })).toBe(42);
    });

    it('相同状态返回缓存', () => {
      const state = { count: 1 };
      const selectCount = createSelector((s: { count: number }) => s.count);
      const r1 = selectCount(state);
      const r2 = selectCount(state);
      expect(r1).toBe(r2);
    });

    it('等值时返回缓存', () => {
      const selectObj = createSelector(
        (s: { items: number[] }) => ({ count: s.items.length }),
        (a, b) => a.count === b.count
      );
      const r1 = selectObj({ items: [1, 2, 3] });
      const r2 = selectObj({ items: [4, 5, 6] });
      expect(r1).toBe(r2); // 引用相同因为count相同
    });
  });

  describe('中间件管道', () => {
    type Middleware<T> = (state: T, action: unknown, next: () => T) => T;

    const applyMiddleware = <T>(reducer: (state: T, action: unknown) => T, middlewares: Middleware<T>[]) => {
      return (state: T, action: unknown): T => {
        let index = -1;
        const dispatch = (i: number, s: T): T => {
          if (i <= index) throw new Error('next() called twice');
          index = i;
          if (i === middlewares.length) return reducer(s, action);
          return middlewares[i](s, action, () => dispatch(i + 1, s));
        };
        return dispatch(0, state);
      };
    };

    const logger: Middleware<{ count: number }> = (state, action, next) => {
      const result = next();
      return result;
    };

    const validator: Middleware<{ count: number }> = (state, action, next) => {
      const result = next();
      if (result.count < 0) return state;
      return result;
    };

    const baseReducer = (state: { count: number }, action: unknown): { count: number } => {
      switch ((action as any).type) {
        case 'INC': return { count: state.count + 1 };
        case 'DEC': return { count: state.count - 1 };
        case 'SET': return { count: (action as any).value };
        default: return state;
      }
    };

    it('无中间件正常工作', () => {
      const reducer = applyMiddleware(baseReducer, []);
      expect(reducer({ count: 0 }, { type: 'INC' }).count).toBe(1);
    });

    it('中间件可拦截', () => {
      const reducer = applyMiddleware(baseReducer, [validator]);
      expect(reducer({ count: 0 }, { type: 'DEC' }).count).toBe(0); // 负数被拦截
    });

    it('中间件链顺序执行', () => {
      let order = '';
      const m1: Middleware<{ count: number }> = (s, a, next) => { order += '1'; return next(); };
      const m2: Middleware<{ count: number }> = (s, a, next) => { order += '2'; return next(); };
      const reducer = applyMiddleware(baseReducer, [m1, m2]);
      reducer({ count: 0 }, { type: 'INC' });
      expect(order).toBe('12');
    });

    it('中间件可修改状态', () => {
      const doubler: Middleware<{ count: number }> = (s, a, next) => {
        const result = next();
        return { count: result.count * 2 };
      };
      const reducer = applyMiddleware(baseReducer, [doubler]);
      expect(reducer({ count: 0 }, { type: 'INC' }).count).toBe(2);
    });
  });

  describe('派生状态', () => {
    const createDerived = <T, D extends unknown[]>(
      sources: [...{ get: () => D[number] }[]],
      deriveFn: (...args: D) => T
    ) => {
      let cached: { deps: unknown[]; value: T } | null = null;

      return {
        get(): T {
          const deps = sources.map(s => s.get());
          if (cached && deps.every((d, i) => d === cached!.deps[i])) {
            return cached.value;
          }
          const value = deriveFn(...(deps as D));
          cached = { deps, value };
          return value;
        },
      };
    };

    it('派生计算', () => {
      const a = 1, b = 2;
      const sum = createDerived(
        [{ get: () => a }, { get: () => b }],
        (x, y) => (x as number) + (y as number)
      );
      expect(sum.get()).toBe(3);
    });

    it('依赖不变返回缓存', () => {
      let count = 0;
      const val = 10;
      const derived = createDerived(
        [{ get: () => val }],
        (v) => { count++; return (v as number) * 2; }
      );
      derived.get();
      derived.get();
      expect(count).toBe(1);
    });

    it('依赖变化重新计算', () => {
      let count = 0;
      let val = 10;
      const source = { get: () => val };
      const derived = createDerived(
        [source],
        (v) => { count++; return (v as number) * 2; }
      );
      derived.get();
      val = 20;
      derived.get();
      expect(count).toBe(2);
    });
  });

  describe('事件总线', () => {
    const createEventBus = () => {
      const handlers = new Map<string, Set<(data: unknown) => void>>();

      return {
        on(event: string, handler: (data: unknown) => void) {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event)!.add(handler);
          return () => handlers.get(event)?.delete(handler);
        },
        emit(event: string, data?: unknown) {
          handlers.get(event)?.forEach(h => h(data));
        },
        once(event: string, handler: (data: unknown) => void) {
          const wrapper = (data: unknown) => {
            handler(data);
            handlers.get(event)?.delete(wrapper);
          };
          this.on(event, wrapper);
        },
        off(event: string, handler: (data: unknown) => void) {
          handlers.get(event)?.delete(handler);
        },
        listenerCount(event: string) {
          return handlers.get(event)?.size ?? 0;
        },
      };
    };

    it('注册和触发', () => {
      const bus = createEventBus();
      let received: unknown = null;
      bus.on('test', (d) => { received = d; });
      bus.emit('test', 42);
      expect(received).toBe(42);
    });

    it('多个监听者', () => {
      const bus = createEventBus();
      let count = 0;
      bus.on('test', () => { count++; });
      bus.on('test', () => { count++; });
      bus.emit('test');
      expect(count).toBe(2);
    });

    it('取消监听', () => {
      const bus = createEventBus();
      let count = 0;
      const unsub = bus.on('test', () => { count++; });
      unsub();
      bus.emit('test');
      expect(count).toBe(0);
    });

    it('once只触发一次', () => {
      const bus = createEventBus();
      let count = 0;
      bus.once('test', () => { count++; });
      bus.emit('test');
      bus.emit('test');
      expect(count).toBe(1);
    });

    it('listenerCount', () => {
      const bus = createEventBus();
      bus.on('a', () => {});
      bus.on('a', () => {});
      expect(bus.listenerCount('a')).toBe(2);
      expect(bus.listenerCount('b')).toBe(0);
    });

    it('无监听者不报错', () => {
      const bus = createEventBus();
      expect(() => bus.emit('nothing')).not.toThrow();
    });
  });
});
