// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useDebounce,
  useWindowSize,
  useIsMobile,
  useAsyncData,
  useLocalStorage,
  usePrevious,
} from '../hooks/useHooks';

describe('useDebounce (useHooks)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该返回初始值', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('应该延迟更新值', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 200 } }
    );

    rerender({ value: 'b', delay: 200 });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('b');
  });

  it('快速更新应该只保留最后一个', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 200 } }
    );

    rerender({ value: 'b', delay: 200 });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ value: 'c', delay: 200 });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ value: 'd', delay: 200 });

    act(() => { vi.advanceTimersByTime(200); });

    expect(result.current).toBe('d');
  });
});

describe('useWindowSize', () => {
  it('应该返回当前窗口尺寸', () => {
    const { result } = renderHook(() => useWindowSize());
    expect(result.current.width).toBeGreaterThan(0);
    expect(result.current.height).toBeGreaterThan(0);
  });

  it('resize 时应该更新尺寸', () => {
    const { result } = renderHook(() => useWindowSize());

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 600, writable: true });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.width).toBe(800);
    expect(result.current.height).toBe(600);
  });
});

describe('useIsMobile', () => {
  it('桌面宽度应该返回 false', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('移动宽度应该返回 true', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('应该支持自定义断点', () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, writable: true });
    const { result } = renderHook(() => useIsMobile(1000));
    expect(result.current).toBe(true);
  });
});

describe('useAsyncData', () => {
  it('应该管理 loading/data/error 状态', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    const { result } = renderHook(() => useAsyncData(fetcher));

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current.data).toBe('data');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('应该处理错误', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAsyncData(fetcher));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('immediate=false 不应该立即加载', () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    const { result } = renderHook(() => useAsyncData(fetcher, [], false));

    expect(result.current.loading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refresh 应该重新加载数据', async () => {
    let count = 0;
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(++count));
    const { result } = renderHook(() => useAsyncData(fetcher));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current.data).toBe(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toBe(2);
  });

  it('非 Error 对象应该转换为字符串', async () => {
    const fetcher = vi.fn().mockRejectedValue('string error');
    const { result } = renderHook(() => useAsyncData(fetcher));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current.error).toBe('未知错误');
  });
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('应该返回初始值', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('应该从 localStorage 读取已有值', () => {
    localStorageMock.setItem('key', JSON.stringify('stored'));
    const { result } = renderHook(() => useLocalStorage('key', 'default'));
    expect(result.current[0]).toBe('stored');
  });

  it('应该更新值并写入 localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'init'));

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('key', JSON.stringify('updated'));
  });

  it('应该支持函数式更新', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0));

    act(() => {
      result.current[1](prev => prev + 1);
    });

    expect(result.current[0]).toBe(1);
  });

  it('应该支持对象类型', () => {
    const { result } = renderHook(() =>
      useLocalStorage('obj', { name: 'test' })
    );

    act(() => {
      result.current[1]({ name: 'updated' });
    });

    expect(result.current[0]).toEqual({ name: 'updated' });
  });

  it('损坏的 localStorage 应该回退到初始值', () => {
    localStorageMock.setItem('key', 'not-json{{{');
    const { result } = renderHook(() => useLocalStorage('key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});

describe('usePrevious', () => {
  it('初始值应该为 undefined', () => {
    const { result } = renderHook(() => usePrevious('hello'));
    expect(result.current).toBeUndefined();
  });

  it('应该返回上一次的值', () => {
    const { result, rerender } = renderHook(
      ({ value }) => usePrevious(value),
      { initialProps: { value: 'first' } }
    );

    rerender({ value: 'second' });
    expect(result.current).toBe('first');

    rerender({ value: 'third' });
    expect(result.current).toBe('second');
  });

  it('应该支持数字类型', () => {
    const { result, rerender } = renderHook(
      ({ value }) => usePrevious(value),
      { initialProps: { value: 1 } }
    );

    rerender({ value: 2 });
    expect(result.current).toBe(1);
  });

  it('应该支持对象类型', () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const { result, rerender } = renderHook(
      ({ value }) => usePrevious(value),
      { initialProps: { value: obj1 } }
    );

    rerender({ value: obj2 });
    expect(result.current).toBe(obj1);
  });
});
