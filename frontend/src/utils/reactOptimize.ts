import logger from './logger';
/**
 * React 渲染优化工具
 * memo、useMemo 优化组件，避免不必要的重渲染
 */

import React, { memo, useCallback, useRef, useEffect, useState } from 'react';

// ==================== 稳定化 Hooks ====================

/**
 * 稳定化引用 - 避免子组件因对象引用变化而重渲染
 */
export function useStableRef<T>(value: T): T {
  const ref = useRef(value);
  if (JSON.stringify(ref.current) !== JSON.stringify(value)) {
    ref.current = value;
  }
  return ref.current;
}

/**
 * 稳定化回调 - 返回固定引用的回调函数
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback(((...args: any[]) => callbackRef.current(...args)) as T, []);
}

/**
 * 防抖值 - 返回防抖后的值
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ==================== 优化组件工厂 ====================

/**
 * 创建优化的列表项组件
 * 使用 React.memo + 浅比较
 */
export function createOptimizedListItem<P extends { id: string | number }>(
  Component: React.ComponentType<P>
) {
  return memo(Component, (prev, next) => {
    // 只比较 id 和关键字段
    return prev.id === next.id;
  });
}

// ==================== 虚拟化工具 ====================

export interface VirtualListOptions {
  itemHeight: number;
  overscan?: number;
  containerHeight: number;
}

/**
 * 虚拟列表计算 - 返回可视区域内的项目索引
 */
export function calculateVisibleRange(
  scrollTop: number,
  totalItems: number,
  options: VirtualListOptions
): { start: number; end: number; offsetY: number } {
  const { itemHeight, overscan = 3, containerHeight } = options;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(totalItems, start + visibleCount + overscan * 2);
  return { start, end, offsetY: start * itemHeight };
}

// ==================== 性能监控 ====================

/**
 * 渲染性能监控 HOC
 */
export function withPerformanceMonitor<P extends object>(
  Component: React.ComponentType<P>,
  name: string
) {
  return memo((props: P) => {
    const renderCount = useRef(0);
    const lastRenderTime = useRef(performance.now());

    renderCount.current++;
    const now = performance.now();
    const duration = now - lastRenderTime.current;

    if (duration > 16 && renderCount.current > 1) {
      logger.warn(`[Perf] ${name} 渲染耗时 ${duration.toFixed(1)}ms (第${renderCount.current}次渲染)`);
    }
    lastRenderTime.current = now;

    return React.createElement(Component, props);
  });
}

// ==================== 图片懒加载 ====================

/**
 * Intersection Observer 图片懒加载 Hook
 */
export function useLazyImage(src: string, placeholder?: string) {
  const [imageSrc, setImageSrc] = useState(placeholder || '');
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current || !src) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setImageSrc(src);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [src]);

  const onLoad = useCallback(() => setIsLoaded(true), []);

  return { imgRef, imageSrc, isLoaded, onLoad };
}

// ==================== 批量更新 ====================

/**
 * 批量状态更新 - 合并多次 setState 为一次渲染
 */
export function useBatchedUpdates() {
  const [, forceUpdate] = useState({});
  const pendingUpdates = useRef<(() => void)[]>([]);
  const frameRef = useRef<number>(0);

  const batchUpdate = useCallback((update: () => void) => {
    pendingUpdates.current.push(update);
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        const updates = pendingUpdates.current.splice(0);
        updates.forEach((fn) => fn());
        forceUpdate({});
        frameRef.current = 0;
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return batchUpdate;
}
