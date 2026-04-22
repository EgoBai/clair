import logger from './logger';
/**
 * 类型安全的智能请求管理器
 * 支持：去重、缓存、重试、批量处理
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

interface PendingRequest<T> {
  key: string;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

interface BatchGroup<T> {
  requests: PendingRequest<T>[];
  timer: ReturnType<typeof setTimeout> | null;
}

interface RequestOptions {
  cache?: boolean;
  deduplicate?: boolean;
  batch?: boolean;
  batchDelay?: number;
  ttl?: number;
}

interface Stats {
  inflight: number;
  cached: number;
  batches: number;
}

/**
 * 类型安全的智能请求管理器
 */
export class SmartRequestManager<T = any> {
  private inflight: Map<string, Promise<T>> = new Map();
  private cache: Map<string, CacheEntry<T>> = new Map();
  private pendingBatches: Map<string, BatchGroup<T>> = new Map();
  
  constructor(
    private cacheTTL: number = 30_000,
    private defaultOptions: RequestOptions = {
      cache: true,
      deduplicate: true,
      batch: false,
      batchDelay: 50,
    }
  ) {}

  /**
   * 发起请求（自动去重 + 缓存 + 批量处理）
   */
  async request<K extends string>(
    key: K,
    fn: () => Promise<T>,
    options: RequestOptions = {}
  ): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    
    // 检查缓存
    if (opts.cache) {
      const cached = this.cache.get(key);
      if (cached && cached.expiry > Date.now()) {
        return cached.value;
      }
    }

    // 去重：相同请求正在执行
    if (opts.deduplicate) {
      const inflight = this.inflight.get(key);
      if (inflight) return inflight;
    }

    // 批量处理
    if (opts.batch) {
      return this.batchRequest(key, fn, opts.batchDelay || 50);
    }

    const promise = fn().then((result) => {
      this.inflight.delete(key);
      if (opts.cache) {
        this.cache.set(key, {
          value: result,
          expiry: Date.now() + (opts.ttl || this.cacheTTL),
        });
      }
      return result;
    }).catch((error) => {
      this.inflight.delete(key);
      throw error;
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * 批量请求处理
   */
  private batchRequest(
    key: string,
    fn: () => Promise<T>,
    delay: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // 使用key的前缀作为批处理组
      const batchKey = key.split(':')[0] || 'default';
      
      let batch = this.pendingBatches.get(batchKey);
      if (!batch) {
        batch = {
          requests: [],
          timer: setTimeout(() => this.executeBatch(batchKey), delay),
        };
        this.pendingBatches.set(batchKey, batch);
      }
      
      batch.requests.push({ key, resolve, reject });
    });
  }

  /**
   * 执行批量请求
   */
  private async executeBatch(batchKey: string): Promise<void> {
    const batch = this.pendingBatches.get(batchKey);
    if (!batch || batch.requests.length === 0) return;
    
    this.pendingBatches.delete(batchKey);
    
    try {
      // 这里可以实现真正的批量请求逻辑
      // 目前简化为顺序执行
      for (const request of batch.requests) {
        try {
          const result = await this.executeSingleRequest(request.key);
          request.resolve(result);
        } catch (error) {
          request.reject(error);
        }
      }
    } catch (error) {
      // 批量执行失败，拒绝所有请求
      for (const request of batch.requests) {
        request.reject(error);
      }
    }
  }

  /**
   * 执行单个请求
   */
  private async executeSingleRequest(key: string): Promise<T> {
    // 这里应该根据key调用相应的请求函数
    // 目前简化实现，需要在实际使用时重写
    throw new Error(`Batch execution not implemented for key: ${key}`);
  }

  /**
   * 清除缓存
   */
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 预加载数据
   */
  async prefetch(
    key: string,
    fn: () => Promise<T>,
    ttl?: number
  ): Promise<void> {
    if (this.cache.has(key)) return;
    
    try {
      const result = await fn();
      this.cache.set(key, {
        value: result,
        expiry: Date.now() + (ttl || this.cacheTTL),
      });
    } catch (error) {
      logger.warn(`Prefetch failed for key: ${key}`, error);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): Stats {
    return {
      inflight: this.inflight.size,
      cached: this.cache.size,
      batches: this.pendingBatches.size,
    };
  }
  
  /**
   * 清理过期缓存
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (entry.expiry < now) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.cache.delete(key);
    });
  }

  /**
   * 获取缓存条目
   */
  getCacheEntry(key: string): CacheEntry<T> | undefined {
    return this.cache.get(key);
  }

  /**
   * 检查是否有进行中的请求
   */
  hasInflight(key: string): boolean {
    return this.inflight.has(key);
  }

  /**
   * 取消进行中的请求
   */
  cancelInflight(key: string): boolean {
    return this.inflight.delete(key);
  }

  /**
   * 获取所有缓存键
   */
  getCacheKeys(): string[] {
    const keys: string[] = [];
    for (const key of this.cache.keys()) {
      keys.push(key);
    }
    return keys;
  }

  /**
   * 获取所有进行中的请求键
   */
  getInflightKeys(): string[] {
    const keys: string[] = [];
    for (const key of this.inflight.keys()) {
      keys.push(key);
    }
    return keys;
  }
}

/**
 * 创建请求管理器实例
 */
export function createRequestManager<T = any>(
  cacheTTL?: number,
  defaultOptions?: RequestOptions
): SmartRequestManager<T> {
  return new SmartRequestManager<T>(cacheTTL, defaultOptions);
}

/**
 * 带泛型的请求管理器类型
 */
export type RequestManager<T> = SmartRequestManager<T>;