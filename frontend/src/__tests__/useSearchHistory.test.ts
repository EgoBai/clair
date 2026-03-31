// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearchHistory } from '../hooks/useSearchHistory';

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

describe('useSearchHistory', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('应该初始化空历史', () => {
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it('应该添加搜索记录', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add('贵州茅台');
    });

    expect(result.current.history).toEqual(['贵州茅台']);
  });

  it('应该去重并置顶最新搜索', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add('茅台');
      result.current.add('宁德时代');
      result.current.add('茅台');
    });

    expect(result.current.history[0]).toBe('茅台');
    expect(result.current.history).toEqual(['茅台', '宁德时代']);
  });

  it('空字符串不应该被添加', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add('');
      result.current.add('   ');
    });

    expect(result.current.history).toEqual([]);
  });

  it('应该限制最大条目数', () => {
    const { result } = renderHook(() => useSearchHistory({ maxItems: 3 }));

    act(() => {
      result.current.add('a');
      result.current.add('b');
      result.current.add('c');
      result.current.add('d');
    });

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history).toEqual(['d', 'c', 'b']);
  });

  it('应该删除单条记录', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add('茅台');
      result.current.add('宁德时代');
    });

    act(() => {
      result.current.remove('茅台');
    });

    expect(result.current.history).toEqual(['宁德时代']);
  });

  it('应该清空所有记录', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add('茅台');
      result.current.add('宁德时代');
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.history).toEqual([]);
  });

  it('应该搜索历史记录', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add('贵州茅台');
      result.current.add('宁德时代');
      result.current.add('茅台迎宾');
    });

    const found = result.current.search('茅台');
    expect(found).toContain('贵州茅台');
    expect(found).toContain('茅台迎宾');
    expect(found).not.toContain('宁德时代');
  });

  it('空查询应该返回全部历史', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add('茅台');
      result.current.add('宁德时代');
    });

    const found = result.current.search('');
    expect(found).toHaveLength(2);
  });

  it('应该支持自定义存储 key', () => {
    const { result } = renderHook(() =>
      useSearchHistory({ key: 'custom-key' })
    );

    act(() => {
      result.current.add('test');
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'custom-key',
      JSON.stringify(['test'])
    );
  });

  it('删除不存在的记录不应报错', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.remove('nonexistent');
    });

    expect(result.current.history).toEqual([]);
  });

  it('搜索应该是大小写不敏感的', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add('MAOTAI');
      result.current.add('ningde');
    });

    const found = result.current.search('maotai');
    expect(found).toEqual(['MAOTAI']);
  });
});
