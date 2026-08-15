/**
 * 前端性能优化工具测试 —— 直接驱动真实模块
 * 说明: 原测试中"虚拟列表/数据降采样/分批渲染"为内联重实现, 真实模块不含这些能力, 已删除。
 *       保留并映射到真实导出: useDebounce / useBatchUpdate / ExpiringMap / ObjectPool / memoizeWithDeepCompare
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useDebounce,
  useBatchUpdate,
  ExpiringMap,
  ObjectPool,
  memoizeWithDeepCompare,
} from '../utils/performance';

describe('ExpiringMap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('应能写入并读取缓存', () => {
    const map = new ExpiringMap<number, string>(60000);
    map.set(1, 'a');
    expect(map.get(1)).toBe('a');
    expect(map.has(1)).toBe(true);
  });

  it('过期后读取应返回 undefined 并自动清理', () => {
    const map = new ExpiringMap<number, string>(60000);
    map.set(1, 'a', 100);
    expect(map.get(1)).toBe('a');
    vi.advanceTimersByTime(150);
    expect(map.get(1)).toBeUndefined();
    expect(map.has(1)).toBe(false);
  });

  it('delete / clear / size 应正常工作', () => {
    const map = new ExpiringMap<string, number>(60000);
    map.set('x', 10);
    map.set('y', 20);
    expect(map.size).toBe(2);
    expect(map.delete('x')).toBe(true);
    expect(map.size).toBe(1);
    map.clear();
    expect(map.size).toBe(0);
  });
});

describe('ObjectPool', () => {
  it('acquire 应在池空时创建新对象', () => {
    const pool = new ObjectPool(() => ({}), () => {});
    const obj = pool.acquire();
    expect(typeof obj).toBe('object');
    expect(pool.size).toBe(0);
  });

  it('release 后再次 acquire 应复用同一对象', () => {
    let resetCalled = false;
    const pool = new ObjectPool(() => ({ v: 1 }), () => { resetCalled = true; });
    const obj = pool.acquire();
    pool.release(obj);
    expect(pool.size).toBe(1);
    expect(pool.acquire()).toBe(obj);
    expect(resetCalled).toBe(true);
  });

  it('超过 maxSize 的 release 不应入池', () => {
    const pool = new ObjectPool(() => ({}), () => {}, 2);
    pool.release({});
    pool.release({});
    pool.release({});
    expect(pool.size).toBe(2);
  });
});

describe('memoizeWithDeepCompare', () => {
  it('对深相等的参数应复用缓存, 不重复计算', () => {
    let calls = 0;
    const fn = (x: { a: number }) => {
      calls++;
      return x.a + 1;
    };
    const memo = memoizeWithDeepCompare(fn);
    expect(memo({ a: 1 })).toBe(2);
    expect(memo({ a: 1 })).toBe(2); // 深相等, 命中缓存
    expect(calls).toBe(1);
    expect(memo({ a: 2 })).toBe(3);
    expect(calls).toBe(2);
  });
});

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('快速连续调用只应在延迟后执行一次', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDebounce(cb, 100));
    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(cb).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('useBatchUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 16) as unknown as number
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('多次调度应在下一帧内合并执行', () => {
    const update = vi.fn();
    const { result } = renderHook(() => useBatchUpdate());
    act(() => {
      result.current(update);
      result.current(update);
      result.current(update);
    });
    expect(update).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(update).toHaveBeenCalledTimes(3);
  });
});
