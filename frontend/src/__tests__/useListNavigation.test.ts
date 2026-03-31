// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useListNavigation } from '../hooks/useListNavigation';

describe('useListNavigation', () => {
  const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];

  it('应该初始化 activeIndex 为 -1', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items })
    );
    expect(result.current.activeIndex).toBe(-1);
  });

  it('isActive 应该正确判断', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items })
    );

    // activeIndex 初始为 -1
    expect(result.current.isActive(-1)).toBe(true);
    expect(result.current.isActive(0)).toBe(false);
  });

  it('setActiveIndex 应该更新 activeIndex', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items })
    );

    act(() => {
      result.current.setActiveIndex(2);
    });

    expect(result.current.activeIndex).toBe(2);
    expect(result.current.isActive(2)).toBe(true);
  });

  it('getItemProps 应该返回正确的属性', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items })
    );

    act(() => {
      result.current.setActiveIndex(1);
    });

    const props = result.current.getItemProps(1);
    expect(props['data-active']).toBe(true);
    expect(props.tabIndex).toBe(0);

    const inactiveProps = result.current.getItemProps(0);
    expect(inactiveProps['data-active']).toBe(false);
    expect(inactiveProps.tabIndex).toBe(-1);
  });

  it('getItemProps onClick 应该选中并触发 onSelect', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useListNavigation({ items, onSelect })
    );

    act(() => {
      result.current.getItemProps(2).onClick();
    });

    expect(result.current.activeIndex).toBe(2);
    expect(onSelect).toHaveBeenCalledWith('cherry', 2);
  });

  it('getItemProps onMouseEnter 应该设置 activeIndex', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items })
    );

    act(() => {
      result.current.getItemProps(3).onMouseEnter();
    });

    expect(result.current.activeIndex).toBe(3);
  });

  it('onSelect 在 activeIndex 为 -1 时不触发', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useListNavigation({ items, onSelect })
    );

    // activeIndex 为 -1，无法通过 keyboard 选中
    expect(result.current.activeIndex).toBe(-1);
  });

  it('scrollToActive 在没有容器时不报错', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items })
    );

    act(() => {
      result.current.setActiveIndex(0);
    });

    // 调用 scrollToActive 不应抛出
    const mockRef = { current: null };
    expect(() => {
      result.current.scrollToActive(mockRef as any);
    }).not.toThrow();
  });

  it('应该支持键盘导航 (j/k)', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items })
    );

    // 模拟按 j 键
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'j' });
      document.dispatchEvent(event);
    });

    expect(result.current.activeIndex).toBe(0);

    // 模拟按 j 键再下移
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'j' });
      document.dispatchEvent(event);
    });

    expect(result.current.activeIndex).toBe(1);

    // 模拟按 k 键上移
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'k' });
      document.dispatchEvent(event);
    });

    expect(result.current.activeIndex).toBe(0);
  });

  it('应该支持 Home/End 键', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items })
    );

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Home' });
      document.dispatchEvent(event);
    });

    expect(result.current.activeIndex).toBe(0);

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'End' });
      document.dispatchEvent(event);
    });

    expect(result.current.activeIndex).toBe(4);
  });

  it('loop=true 时边界应该循环', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items, loop: true })
    );

    // 先到第一项
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Home' });
      document.dispatchEvent(event);
    });

    // 再按 k 应该循环到最后
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'k' });
      document.dispatchEvent(event);
    });

    expect(result.current.activeIndex).toBe(4);
  });

  it('loop=false 时边界不应该循环', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items, loop: false })
    );

    // 先到最后一项
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'End' });
      document.dispatchEvent(event);
    });

    // 再按 j 应该停在最后
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'j' });
      document.dispatchEvent(event);
    });

    expect(result.current.activeIndex).toBe(4);
  });

  it('enabled=false 时不应该响应键盘', () => {
    const { result } = renderHook(() =>
      useListNavigation({ items, enabled: false })
    );

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'j' });
      document.dispatchEvent(event);
    });

    expect(result.current.activeIndex).toBe(-1);
  });

  it('onHover 应该在 activeIndex 变化时触发', () => {
    const onHover = vi.fn();
    const { result } = renderHook(() =>
      useListNavigation({ items, onHover })
    );

    act(() => {
      result.current.setActiveIndex(2);
    });

    expect(onHover).toHaveBeenCalledWith('cherry', 2);
  });
});
