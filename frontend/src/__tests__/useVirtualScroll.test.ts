import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, render, act } from '@testing-library/react';
import { useVirtualScroll, useDynamicVirtualScroll } from '../hooks/useVirtualScroll';

/**
 * 虚拟滚动 Hook 测试（导入真实模块）
 */

const items = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Item ${i}` }));

/** 让 jsdom 元素表现为可滚动（否则 scrollTop 被钳制为 0） */
function makeScrollable(el: HTMLElement): void {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 40000 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 400 });
}

describe('useVirtualScroll（真实 hook）', () => {
  it('初始（scrollTop=0）应渲染顶部 overscan 窗口', () => {
    const { result } = renderHook(() =>
      useVirtualScroll(items, { itemHeight: 40, containerHeight: 400, overscan: 5 })
    );
    expect(result.current.totalHeight).toBe(40000);
    expect(result.current.virtualItems).toHaveLength(16); // 0..15
    expect(result.current.virtualItems[0].index).toBe(0);
    expect(result.current.virtualItems[0].item.id).toBe(0);
    expect(result.current.virtualItems[0].style.top).toBe(0);
    expect(result.current.virtualItems[15].index).toBe(15);
    expect(result.current.virtualItems[15].style.top).toBe(600);
  });

  it('滚动后应渲染对应窗口', () => {
    let api: ReturnType<typeof useVirtualScroll<(typeof items)[number]>> | undefined;
    function Host() {
      api = useVirtualScroll(items, { itemHeight: 40, containerHeight: 400, overscan: 5 });
      return React.createElement('div', { ref: api.containerRef as React.RefObject<HTMLDivElement> });
    }
    const { container } = render(React.createElement(Host));
    const cdiv = container.querySelector('div') as HTMLDivElement;
    makeScrollable(cdiv);

    act(() => {
      cdiv.scrollTop = 400; // 滚动 10 项
      cdiv.dispatchEvent(new Event('scroll'));
    });

    expect(api!.virtualItems[0].index).toBe(5); // floor(400/40)-5
    expect(api!.virtualItems[api!.virtualItems.length - 1].index).toBe(25);
  });

  it('scrollToIndex / scrollToTop 应更新容器 scrollTop', () => {
    let api: ReturnType<typeof useVirtualScroll<(typeof items)[number]>> | undefined;
    function Host() {
      api = useVirtualScroll(items, { itemHeight: 40, containerHeight: 400, overscan: 5 });
      return React.createElement('div', { ref: api.containerRef as React.RefObject<HTMLDivElement> });
    }
    const { container } = render(React.createElement(Host));
    const cdiv = container.querySelector('div') as HTMLDivElement;
    makeScrollable(cdiv);

    act(() => { api!.scrollToIndex(5); });
    expect(cdiv.scrollTop).toBe(200);
    act(() => { api!.scrollToTop(); });
    expect(cdiv.scrollTop).toBe(0);
  });

  it('空列表应返回空 virtualItems 与 0 总高', () => {
    const { result } = renderHook(() =>
      useVirtualScroll([], { itemHeight: 40, containerHeight: 400, overscan: 5 })
    );
    expect(result.current.virtualItems).toHaveLength(0);
    expect(result.current.totalHeight).toBe(0);
  });
});

describe('useDynamicVirtualScroll（真实 hook）', () => {
  it('应使用估算高度计算总高与可视项', () => {
    const { result } = renderHook(() =>
      useDynamicVirtualScroll(items, { estimatedHeight: 40, containerHeight: 400, overscan: 5 })
    );
    expect(result.current.totalHeight).toBe(40000);
    expect(result.current.virtualItems.length).toBeGreaterThan(0);
    expect(result.current.virtualItems[0].index).toBe(0);
    expect(result.current.virtualItems[0].style.top).toBe(0);
    expect(typeof result.current.virtualItems[0].measureRef).toBe('function');
  });

  it('空列表总高为 0', () => {
    const { result } = renderHook(() =>
      useDynamicVirtualScroll([], { estimatedHeight: 40, containerHeight: 400 })
    );
    expect(result.current.totalHeight).toBe(0);
  });
});
