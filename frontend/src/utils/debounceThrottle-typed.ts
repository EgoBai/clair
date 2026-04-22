/**
 * 类型安全的防抖和节流工具函数
 * Type-safe Debounce & Throttle Utilities
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

interface ThrottledFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  cancel: () => void;
  flush: () => ReturnType<T> | undefined;
}

interface RafThrottledFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

/**
 * 类型安全的防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
  options: DebounceOptions = {}
): DebouncedFunction<T> {
  const { leading = false, trailing = true, maxWait } = options;
  
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime = 0;
  let lastInvokeTime = 0;
  let result: ReturnType<T> | undefined;

  const invokeFunc = (time: number): ReturnType<T> | undefined => {
    const args = lastArgs;
    lastArgs = null;
    lastInvokeTime = time;
    if (args) {
      result = fn(...args) as ReturnType<T>;
    }
    return result;
  };

  const shouldInvoke = (time: number): boolean => {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === 0 ||
      timeSinceLastCall >= delay ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  };

  const trailingEdge = (time: number): ReturnType<T> | undefined => {
    timer = null;
    maxTimer = null;
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = null;
    return result;
  };

  const leadingEdge = (time: number): ReturnType<T> | undefined => {
    lastInvokeTime = time;
    timer = setTimeout(() => {
      timer = null;
      if (trailing && lastArgs) {
        trailingEdge(Date.now());
      }
      lastArgs = null;
    }, delay);

    if (leading) {
      return invokeFunc(time);
    }
    return result;
  };

  const debounced = function (this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastCallTime = time;

    if (isInvoking) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      // Set up maxWait timer if needed
      if (maxWait !== undefined && !maxTimer) {
        maxTimer = setTimeout(() => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          maxTimer = null;
          trailingEdge(Date.now());
        }, maxWait);
      }

      return leadingEdge(time);
    }

    // Reset trailing timer
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      if (maxTimer) {
        clearTimeout(maxTimer);
        maxTimer = null;
      }
      trailingEdge(Date.now());
    }, delay);

    return result;
  };

  debounced.cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
    lastArgs = null;
    lastCallTime = 0;
    lastInvokeTime = 0;
  };

  debounced.flush = (): ReturnType<T> | undefined => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      return trailingEdge(Date.now());
    }
    return result;
  };

  debounced.pending = (): boolean => {
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
): ThrottledFunction<T> {
  return debounce(fn, interval, {
    leading: options.leading ?? true,
    trailing: options.trailing ?? true,
    maxWait: interval,
  });
}

/**
 * Request Animation Frame 节流
 */
export function rafThrottle<T extends (...args: unknown[]) => unknown>(
  fn: T
): RafThrottledFunction<T> {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;

  const throttled = function (this: unknown, ...args: Parameters<T>): void {
    lastArgs = args;
    lastThis = this;
    
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (lastArgs) {
          fn.apply(lastThis as ThisParameterType<T>, lastArgs);
          lastArgs = null;
          lastThis = null;
        }
      });
    }
  };

  throttled.cancel = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastArgs = null;
    lastThis = null;
  };

  return throttled;
}

/**
 * 防抖装饰器（用于类方法）
 */
export function debounceMethod(delay: number, options?: DebounceOptions) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const debounced = debounce(originalMethod, delay, options);
    
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return debounced.apply(this, args as Parameters<typeof originalMethod>);
    };
    
    // 添加取消方法
    descriptor.value.cancel = debounced.cancel;
    descriptor.value.flush = debounced.flush;
    descriptor.value.pending = debounced.pending;
    
    return descriptor;
  };
}

/**
 * 节流装饰器（用于类方法）
 */
export function throttleMethod(interval: number, options?: { leading?: boolean; trailing?: boolean }) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const throttled = throttle(originalMethod, interval, options);
    
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return throttled.apply(this, args as Parameters<typeof originalMethod>);
    };
    
    // 添加取消方法
    descriptor.value.cancel = throttled.cancel;
    descriptor.value.flush = throttled.flush;
    
    return descriptor;
  };
}

/**
 * 批量防抖 - 对多个函数使用同一个防抖实例
 */
export class BatchDebouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: Array<() => void> = [];

  constructor(private delay: number) {}

  add(callback: () => void): void {
    this.callbacks.push(callback);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    
    this.timer = setTimeout(() => {
      this.execute();
    }, this.delay);
  }

  private execute(): void {
    const callbacks = [...this.callbacks];
    this.callbacks = [];
    this.timer = null;
    
    callbacks.forEach(callback => callback());
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.callbacks = [];
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.execute();
    }
  }

  pending(): boolean {
    return this.timer !== null;
  }
}

/**
 * 批量节流 - 对多个函数使用同一个节流实例
 */
export class BatchThrottler {
  private lastExecTime = 0;
  private callbacks: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private interval: number) {}

  add(callback: () => void): void {
    this.callbacks.push(callback);
    this.schedule();
  }

  private schedule(): void {
    const now = Date.now();
    const timeSinceLastExec = now - this.lastExecTime;
    
    if (timeSinceLastExec >= this.interval) {
      this.execute();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.execute();
      }, this.interval - timeSinceLastExec);
    }
  }

  private execute(): void {
    const callbacks = [...this.callbacks];
    this.callbacks = [];
    this.lastExecTime = Date.now();
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    callbacks.forEach(callback => callback());
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.callbacks = [];
  }

  flush(): void {
    this.execute();
  }
}