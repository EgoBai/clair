/**
 * 渲染性能优化工具
 * 参考 Google Core Web Vitals 标准
 */

import { useCallback, useRef, useEffect, useMemo } from 'react';

// ==================== 虚拟滚动计算 ====================

export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  totalCount: number;
  scrollTop: number;
  overscan?: number;
}

export interface VirtualScrollResult {
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  totalHeight: number;
  offsetY: number;
}

export function calculateVirtualScroll(config: VirtualScrollConfig): VirtualScrollResult {
  const { itemHeight, containerHeight, totalCount, scrollTop, overscan = 5 } = config;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(totalCount - 1, startIndex + visibleCount + overscan * 2);

  return {
    startIndex,
    endIndex,
    visibleItems: endIndex - startIndex + 1,
    totalHeight: totalCount * itemHeight,
    offsetY: startIndex * itemHeight,
  };
}

// ==================== 批量状态更新 ====================

export function useBatchedUpdates() {
  const pendingUpdates = useRef<(() => void)[]>([]);
  const frameRef = useRef<number>(0);

  const scheduleUpdate = useCallback((update: () => void) => {
    pendingUpdates.current.push(update);
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        const updates = pendingUpdates.current.splice(0);
        updates.forEach(fn => fn());
        frameRef.current = 0;
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return scheduleUpdate;
}

// ==================== 防抖渲染 ====================

export function useThrottledRender<T>(value: T, interval = 100): T {
  const ref = useRef<T>(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        ref.current = value;
        timeoutRef.current = undefined;
      }, interval);
    }
  }, [value, interval]);

  return ref.current;
}

// ==================== 稳定化引用 ====================

export function useStableObject<T extends Record<string, unknown>>(obj: T): T {
  const ref = useRef<T>(obj);
  const stringified = JSON.stringify(obj);

  const stable = useMemo(() => {
    const parsed = JSON.parse(stringified) as T;
    ref.current = parsed;
    return parsed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stringified]);

  return stable;
}

export function useStableArray<T>(arr: T[], keyFn?: (item: T) => string): T[] {
  const key = keyFn
    ? arr.map(keyFn).join('|')
    : JSON.stringify(arr);

  return useMemo(() => arr, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ==================== 懒加载图片 ====================

export function useLazyImage(ref: React.RefObject<HTMLElement>, src: string) {
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!ref.current || loadedRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          img.src = src;
          loadedRef.current = true;
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, src]);
}

// ==================== 渲染性能分析 ====================

export class RenderProfiler {
  private static measurements: Map<string, number[]> = new Map();

  static measure(label: string, fn: () => void): number {
    const start = performance.now();
    fn();
    const duration = performance.now() - start;

    if (!this.measurements.has(label)) {
      this.measurements.set(label, []);
    }
    const arr = this.measurements.get(label)!;
    arr.push(duration);
    if (arr.length > 100) arr.shift();

    if (duration > 16) {
      console.warn(`[RenderProfiler] ${label}: ${duration.toFixed(2)}ms (>16ms frame budget)`);
    }

    return duration;
  }

  static getStats(label: string) {
    const arr = this.measurements.get(label) || [];
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      avg: arr.reduce((s, v) => s + v, 0) / arr.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples: arr.length,
    };
  }

  static clear(label?: string) {
    if (label) this.measurements.delete(label);
    else this.measurements.clear();
  }
}

// ==================== 长列表分块渲染 ====================

export async function chunkedRender<T>(
  items: T[],
  renderChunk: (chunk: T[]) => void,
  chunkSize = 100,
  yieldMs = 5
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    renderChunk(chunk);
    if (i + chunkSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, yieldMs));
    }
  }
}

// ==================== 数据缓存管理 ====================

export class DataCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs = 30000) {
    this.ttl = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) this.cache.delete(key);
    }
  }

  get size() {
    return this.cache.size;
  }

  getStats() {
    return { size: this.cache.size, ttl: this.ttl };
  }
}

// ==================== 全局数据缓存实例 ====================
export const globalDataCache = new DataCache(30000);
