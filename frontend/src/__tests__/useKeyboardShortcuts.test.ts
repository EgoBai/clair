import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts, useShortcutHints } from '../hooks/useKeyboardShortcuts';

/**
 * 键盘快捷键 Hook 测试（导入真实模块）
 */

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

function fireKey(opts: Partial<KeyboardEventInit> & { key: string }): void {
  const evt = new KeyboardEvent('keydown', { bubbles: true, ...opts });
  document.dispatchEvent(evt);
}

describe('useKeyboardShortcuts（真实 hook）', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('应注册并返回 searchInputRef', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    expect(result.current.searchInputRef).toBeDefined();
  });

  it('Ctrl+K 应聚焦搜索', () => {
    const onSearchFocus = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearchFocus }));
    act(() => { fireKey({ key: 'k', ctrlKey: true }); });
    expect(onSearchFocus).toHaveBeenCalled();
  });

  it('Meta+K 应聚焦搜索（Mac）', () => {
    const onSearchFocus = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearchFocus }));
    act(() => { fireKey({ key: 'k', metaKey: true }); });
    expect(onSearchFocus).toHaveBeenCalled();
  });

  it('/ 应聚焦搜索', () => {
    const onSearchFocus = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearchFocus }));
    act(() => { fireKey({ key: '/' }); });
    expect(onSearchFocus).toHaveBeenCalled();
  });

  it('Escape 应触发 onEscape', () => {
    const onEscape = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onEscape }));
    act(() => { fireKey({ key: 'Escape' }); });
    expect(onEscape).toHaveBeenCalled();
  });

  it('Alt+1..6 应导航到对应路由', () => {
    renderHook(() => useKeyboardShortcuts());
    act(() => { fireKey({ key: '1', altKey: true }); });
    expect(mockNavigate).toHaveBeenCalledWith('/');
    act(() => { fireKey({ key: '2', altKey: true }); });
    expect(mockNavigate).toHaveBeenCalledWith('/stocks');
    act(() => { fireKey({ key: '3', altKey: true }); });
    expect(mockNavigate).toHaveBeenCalledWith('/market');
    act(() => { fireKey({ key: '4', altKey: true }); });
    expect(mockNavigate).toHaveBeenCalledWith('/watchlist');
    act(() => { fireKey({ key: '5', altKey: true }); });
    expect(mockNavigate).toHaveBeenCalledWith('/backtest');
    act(() => { fireKey({ key: '6', altKey: true }); });
    expect(mockNavigate).toHaveBeenCalledWith('/screener');
  });

  it('Alt+T 应切换主题', () => {
    const onToggleTheme = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onToggleTheme }));
    act(() => { fireKey({ key: 't', altKey: true }); });
    expect(onToggleTheme).toHaveBeenCalled();
  });

  it('Alt+S 应派发 toggle-sidebar 事件', () => {
    const handler = vi.fn();
    document.addEventListener('toggle-sidebar', handler);
    renderHook(() => useKeyboardShortcuts());
    act(() => { fireKey({ key: 's', altKey: true }); });
    expect(handler).toHaveBeenCalled();
    document.removeEventListener('toggle-sidebar', handler);
  });

  it('Backspace 应 navigate(-1)', () => {
    renderHook(() => useKeyboardShortcuts());
    act(() => { fireKey({ key: 'Backspace' }); });
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('输入框中的非 Escape 按键应被忽略', () => {
    const onSearchFocus = vi.fn();
    const onEscape = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearchFocus, onEscape }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    const evt = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
    Object.defineProperty(evt, 'target', { value: input });
    act(() => { document.dispatchEvent(evt); });
    expect(onSearchFocus).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('enabled=false 应禁用快捷键', () => {
    const onSearchFocus = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearchFocus, enabled: false }));
    act(() => { fireKey({ key: 'k', ctrlKey: true }); });
    expect(onSearchFocus).not.toHaveBeenCalled();
  });
});

describe('useShortcutHints（真实 hook）', () => {
  it('应返回 22 条快捷键提示', () => {
    const { result } = renderHook(() => useShortcutHints());
    expect(result.current).toHaveLength(22);
    expect(result.current.every(h => h.keys.length > 0 && h.description.length > 0)).toBe(true);
  });
});
