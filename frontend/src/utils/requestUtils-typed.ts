/**
 * 类型安全的请求防抖/节流工具
 * Type-safe Request Debounce/Throttle Utilities
 */

interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
}

interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  cancel: () => void;
  flush: () => ReturnType<T> | undefined;
  pending: () => boolean;
}

/**
 * 类型安全的防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
  options: DebounceOptions = {}
): DebouncedFunction<T> {
  const { leading = false, trailing = true } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: ThisParameterType<T> | null = null;
  let result: ReturnType<T> | undefined;

  function invoke(): ReturnType<T> | undefined {
    if (lastArgs && lastThis !== null) {
      result = fn.apply(lastThis, lastArgs) as ReturnType<T>;
    }
    lastArgs = null;
    lastThis = null;
    return result;
  }

  function debounced(this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> | undefined {
    lastArgs = args;
    lastThis = this;

    if (timer) {
      clearTimeout(timer);
    }

    if (leading && !timer) {
      // 立即执行
      timer = setTimeout(() => {
        timer = null;
      }, delay);
      return invoke();
    }

    if (trailing) {
      timer = setTimeout(() => {
        timer = null;
        invoke();
      }, delay);
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
  };

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return invoke();
  };

  debounced.pending = () => {
    return timer !== null;
  };

  return debounced;
}

/**
 * 类型安全的节流函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  interval: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): DebouncedFunction<T> {
  const { leading = true, trailing = true } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: ThisParameterType<T> | null = null;
  let lastCallTime = 0;
  let result: ReturnType<T> | undefined;

  function invoke(): ReturnType<T> | undefined {
    if (lastArgs && lastThis !== null) {
      result = fn.apply(lastThis, lastArgs) as ReturnType<T>;
    }
    lastArgs = null;
    lastThis = null;
    return result;
  }

  function throttled(this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> | undefined {
    const now = Date.now();
    lastArgs = args;
    lastThis = this;

    if (leading && now - lastCallTime >= interval) {
      lastCallTime = now;
      return invoke();
    }

    if (!timer && trailing) {
      timer = setTimeout(() => {
        timer = null;
        lastCallTime = Date.now();
        invoke();
      }, interval - (now - lastCallTime));
    }

    return result;
  }

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
    lastThis = null;
  };

  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return invoke();
  };

  throttled.pending = () => {
    return timer !== null;
  };

  return throttled;
}

/**
 * 请求合并器
 */
export class RequestBatcher<T, R> {
  private batch: Array<{ args: T; resolve: (value: R) => void; reject: (reason: unknown) => void }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private batchFn: (args: T[]) => Promise<R[]>,
    private delay: number = 100
  ) {}

  request(args: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.batch.push({ args, resolve, reject });

      if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.delay);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const batch = [...this.batch];
    this.batch = [];
    this.timer = null;

    try {
      const results = await this.batchFn(batch.map(b => b.args));
      batch.forEach((b, i) => b.resolve(results[i]));
    } catch (error) {
      batch.forEach(b => b.reject(error));
    }
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.batch.forEach(b => b.reject(new Error('Request cancelled')));
    this.batch = [];
  }
}