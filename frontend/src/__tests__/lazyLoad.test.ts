import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { lazyWithRetry, preloadComponent, createLazyMount } from '../utils/lazyLoad';

/**
 * 组件懒加载工具测试 —— 直接驱动真实模块：
 * 通过 React 渲染 / Suspense / 真实 IntersectionObserver 桩覆盖真实行为。
 */

class ErrorBoundary extends React.Component<
  { onError?: (e: any) => void; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(e: any) {
    this.props.onError?.(e);
  }
  render() {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children;
  }
}

const e = React.createElement;

describe('lazyWithRetry', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('成功路径应渲染懒加载组件', async () => {
    const Inner = () => e('div', null, 'ok');
    const factory = vi.fn().mockResolvedValue({ default: Inner });
    const Lazy = lazyWithRetry(factory);
    expect(Lazy.$$typeof).toBe(Symbol.for('react.lazy'));

    const { container } = render(
      e(React.Suspense, { fallback: null }, e(Lazy))
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('ok');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('应重试直至成功并调用 onError', async () => {
    const Inner = () => e('div', null, 'ok');
    let attempts = 0;
    const onError = vi.fn();
    const factory = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail' + attempts);
      return { default: Inner };
    });
    const Lazy = lazyWithRetry(factory, { retryCount: 3, retryDelay: 1, onError });

    const { container } = render(
      e(React.Suspense, { fallback: null }, e(Lazy))
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(container.textContent).toContain('ok');
    expect(attempts).toBe(3);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('重试耗尽应抛出最后错误', async () => {
    const onError = vi.fn();
    const factory = vi.fn().mockRejectedValue(new Error('Always fails'));
    const Lazy = lazyWithRetry(factory, { retryCount: 3, retryDelay: 1, onError });
    const caught = vi.fn();

    render(
      e(ErrorBoundary, { onError: caught },
        e(React.Suspense, { fallback: null }, e(Lazy)))
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(factory).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(3);
    expect(caught).toHaveBeenCalled();
  });
});

describe('preloadComponent', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('多次 preload 只触发一次 factory', async () => {
    const factory = vi.fn().mockResolvedValue({ default: () => e('div', null, 'x') });
    const { component, preload } = preloadComponent(factory);
    expect(component.$$typeof).toBe(Symbol.for('react.lazy'));

    preload();
    preload();
    preload();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('createLazyMount / useInView', () => {
  beforeEach(() => {
    (globalThis as any).IntersectionObserver = class {
      private cb: any;
      constructor(cb: any) {
        this.cb = cb;
      }
      observe(el: any) {
        this.cb([{ isIntersecting: true, target: el }], this);
      }
      disconnect() {}
      unobserve() {}
    } as any;
  });
  afterEach(() => {
    cleanup();
    delete (globalThis as any).IntersectionObserver;
    vi.restoreAllMocks();
  });

  it('进入视口后 inView 应为 true', async () => {
    const { useInView } = createLazyMount();
    let api: any;
    function Host() {
      api = useInView();
      return e('div', { ref: api.ref });
    }
    render(e(Host));
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.inView).toBe(true);
    expect(api.ref).toBeDefined();
  });

  it('LazyMount 在视口内应渲染 children', async () => {
    const { LazyMount } = createLazyMount();
    const { container } = render(
      e(LazyMount as any, null, e('span', null, 'hi'))
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain('hi');
  });
});
