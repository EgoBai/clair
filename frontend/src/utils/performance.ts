/**
 * 前端性能优化工具
 */

import { useCallback, useRef, useEffect, useState } from 'react';

// ==================== 防抖和节流 ====================

/**
 * 防抖Hook
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

/**
 * 节流Hook
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef(0);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args) => {
      const now = Date.now();
      if (now - lastCallRef.current >= delay) {
        lastCallRef.current = now;
        callbackRef.current(...args);
      }
    }) as T,
    [delay]
  );
}

// ==================== 懒加载 ====================

/**
 * Intersection Observer Hook - 用于懒加载
 */
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
        setEntry(entry);
      },
      options
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [options.threshold, options.root, options.rootMargin]);

  return { ref: elementRef, isIntersecting, entry };
}

/**
 * 图片懒加载Hook
 */
export function useLazyImage(src: string, placeholder?: string) {
  const [imageSrc, setImageSrc] = useState(placeholder || '');
  const [isLoaded, setIsLoaded] = useState(false);
  const { ref, isIntersecting } = useIntersectionObserver({
    threshold: 0.1
  });

  useEffect(() => {
    if (isIntersecting && src) {
      const img = new Image();
      img.onload = () => {
        setImageSrc(src);
        setIsLoaded(true);
      };
      img.src = src;
    }
  }, [isIntersecting, src]);

  return { ref, imageSrc, isLoaded };
}

// ==================== 内存优化 ====================

/**
 * 带过期的缓存Map - 避免内存泄漏
 */
export class ExpiringMap<K, V> {
  private map = new Map<K, { value: V; expiry: number }>();
  private defaultTTL: number;

  constructor(defaultTTL: number = 60000) {
    this.defaultTTL = defaultTTL;
    
    // 定期清理过期项
    setInterval(() => this.cleanup(), 30000);
  }

  set(key: K, value: V, ttl?: number): void {
    this.map.set(key, {
      value,
      expiry: Date.now() + (ttl || this.defaultTTL)
    });
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiry) {
      this.map.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    this.cleanup();
    return this.map.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expiry) {
        this.map.delete(key);
      }
    }
  }
}

// ==================== 批处理 ====================

/**
 * 批处理更新Hook - 合并多个状态更新
 */
export function useBatchUpdate() {
  const pendingUpdatesRef = useRef<Array<() => void>>([]);
  const frameRef = useRef<number>();

  const scheduleUpdate = useCallback((update: () => void) => {
    pendingUpdatesRef.current.push(update);

    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        const updates = pendingUpdatesRef.current;
        pendingUpdatesRef.current = [];
        frameRef.current = undefined;

        // 执行所有待处理的更新
        updates.forEach(fn => fn());
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return scheduleUpdate;
}

// ==================== 性能监控 ====================

/**
 * 性能监控Hook
 */
export function usePerformanceMonitor(name: string) {
  const startTimeRef = useRef<number>();

  const start = useCallback(() => {
    startTimeRef.current = performance.now();
  }, []);

  const end = useCallback(() => {
    if (startTimeRef.current) {
      const duration = performance.now() - startTimeRef.current;
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
      
      // 可以发送到分析服务
      if (duration > 100) {
        console.warn(`[Performance Warning] ${name} took ${duration.toFixed(2)}ms`);
      }
      
      startTimeRef.current = undefined;
      return duration;
    }
    return 0;
  }, [name]);

  return { start, end };
}

/**
 * 组件渲染计数器
 */
export function useRenderCount(componentName: string) {
  const countRef = useRef(0);

  useEffect(() => {
    countRef.current++;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Render] ${componentName}: ${countRef.current} renders`);
    }
  });

  return countRef.current;
}

// ==================== 数据优化 ====================

/**
 * 对象池 - 复用对象减少GC
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(factory: () => T, reset: (obj: T) => void, maxSize = 100) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  clear(): void {
    this.pool = [];
  }

  get size(): number {
    return this.pool.length;
  }
}

// ==================== 记忆化 ====================

/**
 * 深度比较记忆化
 */
export function memoizeWithDeepCompare<T extends (...args: any[]) => any>(
  fn: T
): T {
  const cache = new Map<string, { args: any[]; result: any }>();

  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached && deepCompare(cached.args, args)) {
      return cached.result;
    }

    const result = fn(...args);
    cache.set(key, { args, result });

    // 限制缓存大小
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }

    return result;
  }) as T;
}

function deepCompare(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, idx) => deepCompare(item, b[idx]));
  }
  
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepCompare(a[key], b[key]));
  }
  
  return false;
}
