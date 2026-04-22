/**
 * Debounce & Throttle Utilities
 * 防抖和节流工具函数
 */

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
  options: { leading?: boolean; trailing?: boolean; maxWait?: number } = {}
): T & { cancel: () => void; flush: () => void; pending: () => boolean } {
  const { leading = false, trailing = true, maxWait } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime: number = 0;
  let lastInvokeTime: number = 0;
  let result: ReturnType<T>;

  const invokeFunc = (time: number) => {
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

  const trailingEdge = (time: number) => {
    timer = null;
    maxTimer = null;
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = null;
    return result;
  };

  const leadingEdge = (time: number) => {
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

  const debounced = function (this: unknown, ...args: Parameters<T>) {
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
  } as T & { cancel: () => void; flush: () => void; pending: () => boolean };

  debounced.cancel = () => {
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

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      return trailingEdge(Date.now());
    }
    return result;
  };

  debounced.pending = () => {
    return timer !== null;
  };

  return debounced;
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  interval: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): T & { cancel: () => void; flush: () => void } {
  return debounce(fn, interval, {
    leading: options.leading ?? true,
    trailing: options.trailing ?? true,
    maxWait: interval,
  }) as T & { cancel: () => void; flush: () => void };
}

/**
 * Request Animation Frame throttle
 */
export function rafThrottle<T extends (...args: unknown[]) => unknown>(
  fn: T
): T & { cancel: () => void } {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = function (this: unknown, ...args: Parameters<T>) {
    lastArgs = args;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (lastArgs) {
          fn.apply(this, lastArgs);
          lastArgs = null;
        }
      });
    }
  } as T & { cancel: () => void };

  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastArgs = null;
  };

  return throttled;
}
