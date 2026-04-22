import { describe, it, expect, vi } from 'vitest';
import {
  createStore,
  createComputed,
  loggingMiddleware,
  validationMiddleware,
  immutabilityMiddleware,
  derive,
  combineSelectors,
  batchUpdate,
  snapshot,
  restoreSnapshot,
} from '../utils/stateEngine';

// ==================== Store测试 ====================

describe('createStore', () => {
  it('应初始化状态', () => {
    const store = createStore({ initialState: { count: 0, name: 'test' } });
    expect(store.getState()).toEqual({ count: 0, name: 'test' });
  });

  it('setState应更新状态', () => {
    const store = createStore({ initialState: { count: 0 } });
    store.setState({ count: 5 });
    expect(store.getState().count).toBe(5);
  });

  it('setState函数式更新', () => {
    const store = createStore({ initialState: { count: 0 } });
    store.setState(prev => ({ count: prev.count + 1 }));
    expect(store.getState().count).toBe(1);
  });

  it('subscribe应通知变化', () => {
    const store = createStore({ initialState: { count: 0 } });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe应返回取消函数', () => {
    const store = createStore({ initialState: { count: 0 } });
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.setState({ count: 1 });
    unsub();
    store.setState({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('select应返回选择的值', () => {
    const store = createStore({ initialState: { count: 5, name: 'test' } });
    expect(store.select(s => s.count)).toBe(5);
    expect(store.select(s => s.name)).toBe('test');
  });

  it('dispatch应触发中间件', () => {
    const mw = vi.fn((state, action) => state);
    const store = createStore({ initialState: { count: 0 }, middleware: [mw] });
    store.dispatch('INCREMENT');
    expect(mw).toHaveBeenCalledWith(expect.anything(), 'INCREMENT', undefined);
  });

  it('reset应恢复初始状态', () => {
    const store = createStore({ initialState: { count: 0 } });
    store.setState({ count: 100 });
    store.reset();
    expect(store.getState().count).toBe(0);
  });

  it('getHistory应返回历史', () => {
    const store = createStore({ initialState: { count: 0 } });
    store.setState({ count: 1 });
    store.setState({ count: 2 });
    const history = store.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(3);
  });

  it('undo应撤销到上一状态', () => {
    const store = createStore({ initialState: { count: 0 } });
    store.setState({ count: 5 });
    expect(store.undo()).toBe(true);
    expect(store.getState().count).toBe(0);
  });

  it('redo应重做', () => {
    const store = createStore({ initialState: { count: 0 } });
    store.setState({ count: 5 });
    store.undo();
    expect(store.redo()).toBe(true);
    expect(store.getState().count).toBe(5);
  });

  it('undo到头应返回false', () => {
    const store = createStore({ initialState: { count: 0 } });
    expect(store.undo()).toBe(false);
  });

  it('redo到尾应返回false', () => {
    const store = createStore({ initialState: { count: 0 } });
    expect(store.redo()).toBe(false);
  });

  it('listener异常不应影响其他listener', () => {
    const store = createStore({ initialState: { count: 0 } });
    const badListener = () => { throw new Error('oops'); };
    const goodListener = vi.fn();

    store.subscribe(badListener);
    store.subscribe(goodListener);
    store.setState({ count: 1 });

    expect(goodListener).toHaveBeenCalled();
  });
});

// ==================== 计算属性测试 ====================

describe('createComputed', () => {
  it('应计算派生值', () => {
    const store = createStore({ initialState: { count: 5 } });
    const doubled = createComputed(store, s => s.count * 2);
    expect(doubled.get()).toBe(10);
  });

  it('应缓存结果', () => {
    const store = createStore({ initialState: { count: 5 } });
    const selector = vi.fn((s: { count: number }) => s.count * 2);
    const computed = createComputed(store, selector);
    computed.get();
    computed.get();
    // selector只在初始和状态变化时调用
    expect(selector).toHaveBeenCalledTimes(1);
  });

  it('状态变化应更新计算值', () => {
    const store = createStore({ initialState: { count: 5 } });
    const computed = createComputed(store, s => s.count * 2);
    expect(computed.get()).toBe(10);
    store.setState({ count: 10 });
    expect(computed.get()).toBe(20);
  });

  it('subscribe应通知变化', () => {
    const store = createStore({ initialState: { count: 5 } });
    const computed = createComputed(store, s => s.count * 2);
    const listener = vi.fn();
    computed.subscribe(listener);
    store.setState({ count: 10 });
    expect(listener).toHaveBeenCalledWith(20);
  });

  it('值未变不应通知', () => {
    const store = createStore({ initialState: { count: 5, name: 'a' } });
    const computed = createComputed(store, s => s.count);
    const listener = vi.fn();
    computed.subscribe(listener);
    store.setState({ name: 'b' }); // count未变
    expect(listener).not.toHaveBeenCalled();
  });
});

// ==================== 中间件测试 ====================

describe('loggingMiddleware', () => {
  it('应返回原状态不修改', () => {
    const mw = loggingMiddleware('TestStore');
    const state = { count: 0 };
    const result = mw(state, 'INCREMENT', 1);
    expect(result).toEqual(state);
  });
});

describe('validationMiddleware', () => {
  it('验证通过应不警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { );
    const mw = validationMiddleware<{ count: number }>(s => s.count >= 0);
    mw({ count: 5 }, 'SET');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('验证失败应警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { );
    const mw = validationMiddleware<{ count: number }>(s => s.count >= 0 ? true : '不能为负');
    mw({ count: -1 }, 'SET');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('immutabilityMiddleware', () => {
  it('应返回新对象', () => {
    const mw = immutabilityMiddleware<{ count: number; name: string }>();
    const state = { count: 0, name: 'a' };
    const result = mw(state, 'SET', { count: 5 });
    expect(result.count).toBe(5);
    expect(result).not.toBe(state);
  });

  it('非对象payload应返回原状态', () => {
    const mw = immutabilityMiddleware<{ count: number }>();
    const state = { count: 0 };
    const result = mw(state, 'SET', 'string');
    expect(result).toBe(state);
  });
});

// ==================== 派生状态测试 ====================

describe('derive', () => {
  it('应返回计算值', () => {
    const store = createStore({ initialState: { items: [1, 2, 3] } });
    const total = derive(store, s => s.items.reduce((a, b) => a + b, 0));
    expect(total).toBe(6);
  });
});

describe('combineSelectors', () => {
  it('应组合多个selector', () => {
    const store = createStore({ initialState: { count: 5, name: 'test' } });
    const combined = combineSelectors(
      (s: { count: number }) => s.count,
      (s: { name: string }) => s.name,
    );
    expect(combined(store.getState())).toEqual([5, 'test']);
  });
});

// ==================== 批量更新测试 ====================

describe('batchUpdate', () => {
  it('应执行多次更新', () => {
    const store = createStore({ initialState: { count: 0, name: 'a' } });
    batchUpdate(store, [
      { count: 5 },
      { name: 'b' },
    ]);
    expect(store.getState().count).toBe(5);
    expect(store.getState().name).toBe('b');
  });
});

// ==================== 快照测试 ====================

describe('snapshot/restore', () => {
  it('snapshot应创建深拷贝', () => {
    const store = createStore({ initialState: { data: { nested: [1, 2, 3] } } });
    const snap = snapshot(store);
    expect(snap).toEqual(store.getState());
    expect(snap).not.toBe(store.getState());
  });

  it('restoreSnapshot应恢复状态', () => {
    const store = createStore({ initialState: { count: 0 } });
    store.setState({ count: 100 });
    const snap = { count: 0 };
    restoreSnapshot(store, snap);
    expect(store.getState().count).toBe(0);
  });
});
