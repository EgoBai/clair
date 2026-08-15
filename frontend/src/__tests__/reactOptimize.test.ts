/**
 * React 渲染优化工具测试 —— 直接驱动真实模块
 * 说明: 原测试内联重实现了 stableEqual/debounce/throttle/deepClone/groupBy/sortBy/chunk/uniqueBy/safeGet 等,
 *       这些工具在真实模块中并不存在, 已删除。仅保留真实导出的 calculateVisibleRange,
 *       并补充真实 hooks: useStableRef / useStableCallback / useDebouncedValue / useBatchedUpdates / createOptimizedListItem
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, render, act } from '@testing-library/react';
import {
  calculateVisibleRange,
  useStableRef,
  useStableCallback,
  useDebouncedValue,
  useBatchedUpdates,
  createOptimizedListItem,
} from '../utils/reactOptimize';

describe('calculateVisibleRange', () => {
  const options = { itemHeight: 40, containerHeight: 400, overscan: 3 };

  it('初始滚动位置正确计算', () => {
    const result = calculateVisibleRange(0, 100, options);
    expect(result.start).toBe(0);
    expect(result.end).toBeGreaterThanOrEqual(10);
    expect(result.offsetY).toBe(0);
  });

  it('滚动后正确计算可视区域', () => {
    const result = calculateVisibleRange(400, 100, options);
    expect(result.start).toBe(7);
    expect(result.offsetY).toBe(280);
  });

  it('end不超过总数量', () => {
    expect(calculateVisibleRange(0, 5, options).end).toBeLessThanOrEqual(5);
  });

  it('start不小于0', () => {
    expect(calculateVisibleRange(0, 100, options).start).toBeGreaterThanOrEqual(0);
  });

  it('自定义overscan', () => {
    const result = calculateVisibleRange(0, 100, { ...options, overscan: 0 });
    expect(result.start).toBe(0);
  });

  it('offsetY等于start乘以itemHeight', () => {
    const result = calculateVisibleRange(800, 100, options);
    expect(result.offsetY).toBe(result.start * options.itemHeight);
  });
});

describe('useStableRef', () => {
  it('内容相同时返回同一引用, 内容变化时返回新引用', () => {
    const { result, rerender } = renderHook(({ value }) => useStableRef(value), {
      initialProps: { value: { a: 1 } },
    });
    const first = result.current;
    rerender({ value: { a: 1 } });
    expect(result.current).toBe(first);
    rerender({ value: { a: 2 } });
    expect(result.current).not.toBe(first);
    expect(result.current.a).toBe(2);
  });
});

describe('useStableCallback', () => {
  it('回调引用应保持稳定且始终调用最新回调', () => {
    let latest = 0;
    const makeCb = (v: number) => () => { latest = v; };
    const { result, rerender } = renderHook(({ cb }) => useStableCallback(cb), {
      initialProps: { cb: makeCb(1) },
    });
    const firstFn = result.current;
    result.current();
    expect(latest).toBe(1);
    rerender({ cb: makeCb(2) });
    expect(result.current).toBe(firstFn); // 引用稳定
    result.current();
    expect(latest).toBe(2); // 调用的是最新回调
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('延迟后才反映新值', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 100), {
      initialProps: { value: 1 },
    });
    expect(result.current).toBe(1);
    rerender({ value: 2 });
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe(2);
  });
});

describe('createOptimizedListItem', () => {
  it('id 不变时跳过重渲染, id 变化时重渲染', () => {
    let childRenders = 0;
    const Child = ({ id, label }: { id: string | number; label: string }) => {
      childRenders++;
      return React.createElement('div', null, label);
    };
    const Opt = createOptimizedListItem(Child);
    const { rerender } = render(React.createElement(Opt, { id: 1, label: 'a' }));
    expect(childRenders).toBe(1);
    rerender(React.createElement(Opt, { id: 1, label: 'b' }));
    expect(childRenders).toBe(1); // 仅 label 变化, id 相同 → memo 跳过重渲染
    rerender(React.createElement(Opt, { id: 2, label: 'b' }));
    expect(childRenders).toBe(2); // id 变化 → 重渲染
  });
});

describe('useBatchedUpdates', () => {
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

  it('多次调度应在下一帧合并执行', () => {
    const update = vi.fn();
    const { result } = renderHook(() => useBatchedUpdates());
    act(() => {
      result.current(update);
      result.current(update);
    });
    expect(update).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(20));
    expect(update).toHaveBeenCalledTimes(2);
  });
});
