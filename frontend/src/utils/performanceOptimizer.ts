import logger from './logger';
/**
 * 性能优化工具
 * 提供React组件性能优化相关功能
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 防抖Hook
 * @param callback 回调函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

/**
 * 节流Hook
 * @param callback 回调函数
 * @param delay 延迟时间（毫秒）
 * @returns 节流后的函数
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastCallRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;

      if (timeSinceLastCall >= delay) {
        lastCallRef.current = now;
        callback(...args);
      } else if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          callback(...args);
          timeoutRef.current = undefined;
        }, delay - timeSinceLastCall);
      }
    },
    [callback, delay]
  );
}

/**
 * 虚拟滚动优化
 * @param items 项目列表
 * @param itemHeight 项目高度
 * @param containerHeight 容器高度
 * @returns 可见项目
 */
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  // 计算可见项目
  const startIndex = Math.floor(scrollTop / itemHeight);
  const visibleItemCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(startIndex + visibleItemCount + 2, items.length); // +2 作为缓冲

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return {
    scrollRef,
    handleScroll,
    visibleItems,
    offsetY,
    totalHeight: items.length * itemHeight,
  };
}

/**
 * 图片懒加载Hook
 * @param src 图片URL
 * @returns 图片加载状态和URL
 */
export function useLazyImage(src: string): {
  isLoading: boolean;
  error: Error | null;
  imageSrc: string | null;
} {
  const [state, setState] = useState<{
    isLoading: boolean;
    error: Error | null;
    imageSrc: string | null;
  }>({
    isLoading: true,
    error: null,
    imageSrc: null,
  });

  useEffect(() => {
    if (!src) {
      setState({ isLoading: false, error: null, imageSrc: null });
      return;
    }

    const img = new Image();
    let isMounted = true;

    const handleLoad = () => {
      if (isMounted) {
        setState({ isLoading: false, error: null, imageSrc: src });
      }
    };

    const handleError = () => {
      if (isMounted) {
        setState({
          isLoading: false,
          error: new Error(`Failed to load image: ${src}`),
          imageSrc: null,
        });
      }
    };

    img.src = src;
    img.onload = handleLoad;
    img.onerror = handleError;

    return () => {
      isMounted = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return state;
}

/**
 * 组件渲染性能监控
 * @param componentName 组件名称
 * @returns 渲染次数和平均渲染时间
 */
export function useRenderPerformance(componentName: string) {
  const renderCountRef = useRef(0);
  const totalRenderTimeRef = useRef(0);
  const lastRenderStartRef = useRef<number | null>(null);

  useEffect(() => {
    renderCountRef.current++;
    
    if (lastRenderStartRef.current !== null) {
      const renderTime = performance.now() - lastRenderStartRef.current;
      totalRenderTimeRef.current += renderTime;
      
      const avgRenderTime = totalRenderTimeRef.current / renderCountRef.current;
      
      // 如果平均渲染时间超过阈值，发出警告
      if (avgRenderTime > 16) { // 超过60fps的阈值
        logger.warn(
          `[性能警告] ${componentName} 平均渲染时间: ${avgRenderTime.toFixed(2)}ms`,
          `(总渲染次数: ${renderCountRef.current})`
        );
      }
    }
    
    lastRenderStartRef.current = performance.now();
  });

  return {
    renderCount: renderCountRef.current,
    avgRenderTime: renderCountRef.current > 0 
      ? totalRenderTimeRef.current / renderCountRef.current 
      : 0,
  };
}

/**
 * 内存使用监控
 */
export function useMemoryMonitor() {
  const [memoryUsage, setMemoryUsage] = useState<{
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  } | null>(null);

  useEffect(() => {
    if (!('memory' in performance)) {
      logger.warn('浏览器不支持 memory API');
      return;
    }

    const checkMemory = () => {
      const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
      const memory = perf.memory;
      if (memory) {
        setMemoryUsage({
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
        });
      }
    };

    // 初始检查
    checkMemory();

    // 定期检查内存使用情况
    const intervalId = setInterval(checkMemory, 10000); // 每10秒检查一次

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return memoryUsage;
}

/**
 * 优化大列表渲染
 * @param items 项目列表
 * @param chunkSize 分块大小
 * @returns 分块后的项目
 */
export function useChunkedList<T>(items: T[], chunkSize: number = 50) {
  const [visibleChunks, setVisibleChunks] = useState(1);

  const loadMore = useCallback(() => {
    setVisibleChunks(prev => prev + 1);
  }, []);

  const visibleItems = items.slice(0, visibleChunks * chunkSize);
  const hasMore = visibleItems.length < items.length;

  return {
    visibleItems,
    hasMore,
    loadMore,
    totalItems: items.length,
    loadedCount: visibleItems.length,
  };
}

// React hooks are imported at top of file