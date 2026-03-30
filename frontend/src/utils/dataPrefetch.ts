/**
 * 数据预取系统
 * 智能预测用户行为，提前加载数据
 */

import { useEffect, useRef, useCallback } from 'react';

// 预取任务
interface PrefetchTask {
  key: string;
  loader: () => Promise<unknown>;
  priority: number;
  timestamp: number;
  status: 'pending' | 'loading' | 'done' | 'error';
  result?: unknown;
  error?: Error;
}

// 预取配置
interface PrefetchConfig {
  maxConcurrent: number;
  maxCacheSize: number;
  ttl: number;
  retryAttempts: number;
  retryDelay: number;
}

const DEFAULT_CONFIG: PrefetchConfig = {
  maxConcurrent: 3,
  maxCacheSize: 50,
  ttl: 60_000,
  retryAttempts: 2,
  retryDelay: 1000,
};

/**
 * 数据预取管理器
 */
export class DataPrefetchManager {
  private queue: PrefetchTask[] = [];
  private cache = new Map<string, { data: unknown; timestamp: number }>();
  private loading = new Set<string>();
  private config: PrefetchConfig;

  constructor(config: Partial<PrefetchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // 添加预取任务
  enqueue(key: string, loader: () => Promise<unknown>, priority = 0): void {
    if (this.cache.has(key) || this.loading.has(key)) return;

    const existing = this.queue.find((t) => t.key === key);
    if (existing) {
      existing.priority = Math.max(existing.priority, priority);
      this.queue.sort((a, b) => b.priority - a.priority);
      return;
    }

    this.queue.push({
      key,
      loader,
      priority,
      timestamp: Date.now(),
      status: 'pending',
    });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.processQueue();
  }

  // 处理队列
  private async processQueue(): Promise<void> {
    while (this.loading.size < this.config.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      if (this.cache.has(task.key)) continue;

      this.loading.add(task.key);
      task.status = 'loading';

      this.executeWithRetry(task).finally(() => {
        this.loading.delete(task.key);
        this.processQueue();
      });
    }
  }

  // 带重试的执行
  private async executeWithRetry(task: PrefetchTask, attempt = 0): Promise<void> {
    try {
      const result = await task.loader();
      task.result = result;
      task.status = 'done';
      this.cache.set(task.key, { data: result, timestamp: Date.now() });
      this.cleanupCache();
    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        await new Promise((r) => setTimeout(r, this.config.retryDelay * (attempt + 1)));
        return this.executeWithRetry(task, attempt + 1);
      }
      task.error = error as Error;
      task.status = 'error';
    }
  }

  // 获取缓存
  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  // 检查是否在加载
  isLoading(key: string): boolean {
    return this.loading.has(key);
  }

  // 清理过期缓存
  private cleanupCache(): void {
    if (this.cache.size <= this.config.maxCacheSize) return;

    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize);
    toRemove.forEach(([key]) => this.cache.delete(key));
  }

  // 获取统计
  getStats() {
    return {
      queueSize: this.queue.length,
      loadingCount: this.loading.size,
      cacheSize: this.cache.size,
      maxCacheSize: this.config.maxCacheSize,
    };
  }

  // 清空所有
  clear(): void {
    this.queue = [];
    this.cache.clear();
    this.loading.clear();
  }
}

// 全局预取管理器实例
export const globalPrefetcher = new DataPrefetchManager();

/**
 * 路由预取映射
 * 根据当前页面预取可能访问的下一个页面数据
 */
export class RoutePrefetchMap {
  private routes = new Map<string, { path: string; loader: () => Promise<unknown> }[]>();

  addRoute(currentPath: string, nextPath: string, loader: () => Promise<unknown>): this {
    const existing = this.routes.get(currentPath) || [];
    existing.push({ path: nextPath, loader });
    this.routes.set(currentPath, existing);
    return this;
  }

  prefetchForRoute(currentPath: string): void {
    const nextRoutes = this.routes.get(currentPath) || [];
    nextRoutes.forEach(({ path, loader }, index) => {
      globalPrefetcher.enqueue(path, loader, nextRoutes.length - index);
    });
  }
}

/**
 * Hover 预取 Hook
 * 鼠标悬停时预取链接目标数据
 */
export function useHoverPrefetch(
  prefetchFn: () => void,
  delay = 200
): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const onMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(prefetchFn, delay);
  }, [prefetchFn, delay]);

  const onMouseLeave = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return { onMouseEnter, onMouseLeave };
}

/**
 * 视口预取 Hook
 * 元素进入视口时触发预取
 */
export function useViewportPrefetch(
  prefetchFn: () => void,
  options: IntersectionObserverInit = {}
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const hasPrefetched = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasPrefetched.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasPrefetched.current) {
          hasPrefetched.current = true;
          prefetchFn();
          observer.disconnect();
        }
      },
      { threshold: 0.1, ...options }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [prefetchFn]);

  return ref;
}

/**
 * 空闲预取 Hook
 * 浏览器空闲时预取数据
 */
export function useIdlePrefetch(prefetchFn: () => void): void {
  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(prefetchFn, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    } else {
      const timer = setTimeout(prefetchFn, 2000);
      return () => clearTimeout(timer);
    }
  }, [prefetchFn]);
}
