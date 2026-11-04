/**
 * Vitest 全局设置
 * 提供 jsdom 缺失的浏览器 API mock
 */
import { vi } from 'vitest';

// Node ≥ 22 会在全局注入实验性 localStorage 占位对象（只有接口形状，setItem/getItem 均为
// undefined），vitest 的 jsdom 环境不会覆盖这个既有全局，于是 zustand persist 落盘时抛出
// "storage.setItem is not a function"（本机 Node 25 实测；CI Node 20 无该全局故不暴露）。
// 这里补一个内存实现，行为与浏览器 Storage 契约一致（不参与被测逻辑，仅为接口可用）。
if (typeof (globalThis as any).localStorage?.setItem !== 'function') {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: memoryStorage,
  });
}

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
