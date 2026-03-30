/**
 * Vitest 全局设置
 * 提供 jsdom 缺失的浏览器 API mock
 */
import { vi } from 'vitest';

// matchMedia mock (Ant Design 依赖) - 仅在 jsdom 环境
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ResizeObserver mock - 必须是可构造函数（rc-resize-observer 用 new 调用）
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
}

// IntersectionObserver mock - 必须是可构造函数
if (typeof globalThis.IntersectionObserver === 'undefined') {
  (globalThis as any).IntersectionObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
    constructor(_callback?: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
  };
}

// scrollIntoView mock
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn() as any;
}
