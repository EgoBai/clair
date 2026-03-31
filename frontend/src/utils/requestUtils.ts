/**
 * 请求防抖/节流工具
 * Request Debounce/Throttle Utilities
 *
 * 搜索防抖、API节流、请求合并、智能批处理
 */

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  options: { leading?: boolean; trailing?: boolean; maxWait?: number } = {}
): T & { cancel: () => void; flush: () => void; pending: () => boolean } {
  const { leading = false, trailing = true, maxWait } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;
  let lastThis: any = null;
  let lastCallTime = 0;
  let lastInvokeTime = 0;
  let result: any;

  function invoke(time: number) {
    lastInvokeTime = time;
    result = fn.apply(lastThis, lastArgs!);
    lastArgs = null;
    lastThis = null;
  }

  function shouldInvoke(time: number): boolean {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;
    return !lastCallTime ||
      timeSinceLastCall >= delay ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait);
  }

  function debounced(this: any, ...args: any[]) {
    const time = Date.now();
    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    const invokeNow = leading && !timer;

    if (shouldInvoke(time)) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (leading || trailing) invoke(time);
    }

    if (!timer && trailing) {
      timer = setTimeout(() => {
        timer = null;
        if (trailing && lastArgs) invoke(Date.now());
      }, delay);
    }

    if (invokeNow) {
      return result;
    }

    return result;
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
    lastThis = null;
    lastCallTime = 0;
  };

  debounced.flush = () => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      timer = null;
      invoke(Date.now());
    }
  };

  debounced.pending = () => timer !== null;

  return debounced as any;
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): T & { cancel: () => void; flush: () => void } {
  return debounce(fn, interval, { ...options, maxWait: interval }) as any;
}

/**
 * 请求合并器 - 合并短时间内的相同请求
 */
export class RequestBatcher<K, V> {
  private pending: Map<string, { keys: K[]; resolve: (values: V[]) => void; timer: ReturnType<typeof setTimeout> }> = new Map();
  private batchFn: (keys: K[]) => Promise<V[]>;
  private delay: number;
  private keyFn: (key: K) => string;

  constructor(
    batchFn: (keys: K[]) => Promise<V[]>,
    delay: number = 50,
    keyFn: (key: K) => string = (k) => String(k)
  ) {
    this.batchFn = batchFn;
    this.delay = delay;
    this.keyFn = keyFn;
  }

  /**
   * 请求单个值（会自动合并）
   */
  async request(key: K): Promise<V> {
    const batchKey = 'default';

    return new Promise<V>((resolve) => {
      let batch = this.pending.get(batchKey);

      if (!batch) {
        batch = { keys: [], resolve: () => {}, timer: null as any };
        batch.timer = setTimeout(() => this.executeBatch(batchKey), this.delay);
        this.pending.set(batchKey, batch);
      }

      const index = batch.keys.length;
      batch.keys.push(key);

      // 重写resolve以处理单个值
      const origResolve = batch.resolve;
      batch.resolve = (values: V[]) => {
        origResolve(values);
        resolve(values[index]);
      };
    });
  }

  private async executeBatch(batchKey: string): Promise<void> {
    const batch = this.pending.get(batchKey);
    if (!batch) return;

    this.pending.delete(batchKey);
    try {
      const values = await this.batchFn(batch.keys);
      batch.resolve(values);
    } catch {
      batch.resolve([]);
    }
  }
}

/**
 * 智能请求管理器 - 去重、缓存、重试
 */
export class SmartRequestManager {
  private inflight: Map<string, Promise<any>> = new Map();
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private cacheTTL: number;

  constructor(cacheTTL: number = 30_000) {
    this.cacheTTL = cacheTTL;
  }

  /**
   * 发起请求（自动去重 + 缓存）
   */
  async request<T>(
    key: string,
    fn: () => Promise<T>,
    options: { cache?: boolean; deduplicate?: boolean } = {}
  ): Promise<T> {
    const { cache = true, deduplicate = true } = options;

    // 检查缓存
    if (cache) {
      const cached = this.cache.get(key);
      if (cached && cached.expiry > Date.now()) {
        return cached.value as T;
      }
    }

    // 去重：相同请求正在执行
    if (deduplicate) {
      const inflight = this.inflight.get(key);
      if (inflight) return inflight;
    }

    const promise = fn().then((result) => {
      this.inflight.delete(key);
      if (cache) {
        this.cache.set(key, { value: result, expiry: Date.now() + this.cacheTTL });
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
   * 获取统计信息
   */
  getStats(): { inflight: number; cached: number } {
    return {
      inflight: this.inflight.size,
      cached: this.cache.size,
    };
  }
}
