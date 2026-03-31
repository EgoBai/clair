// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce, useDebouncedValue } from '../hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该返回一个函数', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));
    expect(typeof result.current).toBe('function');
  });

  it('应该有 cancel 和 flush 方法', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));
    expect(typeof result.current.cancel).toBe('function');
    expect(typeof result.current.flush).toBe('function');
  });

  it('应该延迟执行回调', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current('test');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledWith('test');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('应该取消之前的调用', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current('first');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      result.current('second');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('cancel 应该取消待执行的回调', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current('test');
    });
    act(() => {
      result.current.cancel();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('flush 应该立即执行回调', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current('test');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      result.current.flush();
    });

    expect(callback).toHaveBeenCalledWith('test');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('多次调用 flush 不应重复执行', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current('test');
    });
    act(() => {
      result.current.flush();
      result.current.flush();
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('应该传递多个参数', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 100));

    act(() => {
      result.current('a', 'b', 123);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledWith('a', 'b', 123);
  });

  it('delay 为 0 应该在下一个 tick 执行', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 0));

    act(() => {
      result.current('test');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(callback).toHaveBeenCalledWith('test');
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该返回初始值', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('应该延迟更新值', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    );

    expect(result.current).toBe('initial');

    rerender({ value: 'updated', delay: 300 });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('updated');
  });

  it('快速更新值应该只保留最后一个', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );

    rerender({ value: 'b', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: 'c', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: 'd', delay: 300 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('d');
  });

  it('应该支持不同类型的值', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 42, delay: 100 } }
    );

    expect(result.current).toBe(42);

    rerender({ value: 100, delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(100);
  });

  it('应该支持对象类型', () => {
    const obj1 = { name: 'test' };
    const obj2 = { name: 'updated' };
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: obj1, delay: 100 } }
    );

    expect(result.current).toBe(obj1);

    rerender({ value: obj2, delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(obj2);
  });
});
