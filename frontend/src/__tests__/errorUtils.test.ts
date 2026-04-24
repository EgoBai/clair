/**
 * errorUtils 错误处理工具测试
 * 分类判断、友好消息、安全执行、重试策略
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isNetworkError,
  isAuthError,
  isDataError,
  getFriendlyErrorMessage,
  safeExecute,
  safeExecuteAsync,
  executeWithRetry,
  defaultRetryStrategy,
} from '../components/Common/errorHandling/errorUtils';

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn() },
}));

describe('isNetworkError', () => {
  it('returns true for network error messages', () => {
    expect(isNetworkError(new Error('Network error'))).toBe(true);
    expect(isNetworkError(new Error('fetch failed'))).toBe(true);
    expect(isNetworkError(new Error('timeout occurred'))).toBe(true);
    expect(isNetworkError(new Error('HTTP 500'))).toBe(true);
    expect(isNetworkError(new Error('network connection'))).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isNetworkError(new Error('TypeError: invalid value'))).toBe(false);
    expect(isNetworkError(new Error('Not found'))).toBe(false);
    expect(isNetworkError(new Error('authorization failed'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isNetworkError('string error')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError(42)).toBe(false);
    expect(isNetworkError({})).toBe(false);
  });

  it('handles case sensitivity correctly', () => {
    expect(isNetworkError(new Error('NETWORK'))).toBe(false);
    expect(isNetworkError(new Error('Timeout'))).toBe(false);
  });
});

describe('isAuthError', () => {
  it('returns true for auth error messages', () => {
    expect(isAuthError(new Error('401 Unauthorized'))).toBe(true);
    expect(isAuthError(new Error('403 Forbidden'))).toBe(true);
    expect(isAuthError(new Error('unauthorized'))).toBe(true);
    expect(isAuthError(new Error('forbidden'))).toBe(true);
    expect(isAuthError(new Error('invalid token'))).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isAuthError(new Error('Network error'))).toBe(false);
    expect(isAuthError(new Error('404 Not Found'))).toBe(false);
    expect(isAuthError({ message: '401' } as Error)).toBe(false);
  });

  it('returns false for non-Error', () => {
    expect(isAuthError('unauthorized')).toBe(false);
    expect(isAuthError(null)).toBe(false);
  });
});

describe('isDataError', () => {
  it('returns true for data error messages', () => {
    expect(isDataError(new Error('data parse failed'))).toBe(true);
    expect(isDataError(new Error('parse error'))).toBe(true);
    expect(isDataError(new Error('JSON parse'))).toBe(true);
    expect(isDataError(new Error('format error'))).toBe(true);
    expect(isDataError(new Error('invalid data'))).toBe(true);
  });

  it('returns false for non-data errors', () => {
    expect(isDataError(new Error('Network error'))).toBe(false);
    expect(isDataError(new Error('401 Unauthorized'))).toBe(false);
  });
});

describe('getFriendlyErrorMessage', () => {
  it('returns default message for null/undefined', () => {
    const msg = '默认错误消息';
    expect(getFriendlyErrorMessage(null, msg)).toBe(msg);
    expect(getFriendlyErrorMessage(undefined, msg)).toBe(msg);
  });

  it('returns default message when no error provided', () => {
    expect(getFriendlyErrorMessage(null)).toBe('发生未知错误');
    expect(getFriendlyErrorMessage(undefined)).toBe('发生未知错误');
  });

  it('returns string errors directly', () => {
    expect(getFriendlyErrorMessage('发生了错误')).toBe('发生了错误');
    expect(getFriendlyErrorMessage('404: Not Found')).toBe('404: Not Found');
  });

  it('returns friendly message for network errors', () => {
    const err = new Error('fetch failed: timeout');
    expect(getFriendlyErrorMessage(err)).toBe('网络连接失败，请检查网络后重试');
  });

  it('returns friendly message for auth errors', () => {
    const err = new Error('401 Unauthorized');
    expect(getFriendlyErrorMessage(err)).toBe('登录已过期，请重新登录');
  });

  it('returns friendly message for data errors', () => {
    const err = new Error('JSON parse error');
    expect(getFriendlyErrorMessage(err)).toBe('数据加载失败，请稍后重试');
  });

  it('strips technical prefix from generic errors', () => {
    const err = new Error('Error: something happened\nstack trace line');
    const result = getFriendlyErrorMessage(err);
    expect(result).not.toContain('Error:');
    expect(result).not.toContain('\n');
  });

  it('returns generic error message stripped of trace', () => {
    const err = new Error('type error: value undefined');
    const result = getFriendlyErrorMessage(err);
    expect(result).toContain('type error');
    expect(result).not.toContain('Error:');
  });

  it('returns correct message by priority: network > auth > data', () => {
    // Message contains both network and auth keywords
    const err = new Error('Network error: 401 Unauthorized');
    expect(getFriendlyErrorMessage(err)).toBe('网络连接失败，请检查网络后重试');
  });
});

describe('safeExecute', () => {
  it('returns function result on success', () => {
    const result = safeExecute(() => 42, 0);
    expect(result).toBe(42);
  });

  it('returns default value on error', () => {
    const result = safeExecute(() => { throw new Error('fail'); }, 'fallback');
    expect(result).toBe('fallback');
  });

  it('calls onError callback when function throws', () => {
    const onError = vi.fn();
    const result = safeExecute(() => { throw new Error('test error'); }, 0, onError);
    expect(result).toBe(0);
    expect(onError).toHaveBeenCalled();
  });

  it('handles side effects in function', () => {
    let sideEffect = 0;
    safeExecute(() => { sideEffect = 1; return sideEffect; }, 0);
    expect(sideEffect).toBe(1);
  });

  it('does not modify output when function succeeds', () => {
    const obj = { key: 'value' };
    const result = safeExecute(() => obj, {});
    expect(result).toBe(obj);
  });
});

describe('safeExecuteAsync', () => {
  it('returns resolved value on success', async () => {
    const result = await safeExecuteAsync(async () => 'success', 'fallback');
    expect(result).toBe('success');
  });

  it('returns default value when promise rejects', async () => {
    const result = await safeExecuteAsync(
      async () => { throw new Error('fail'); },
      'fallback'
    );
    expect(result).toBe('fallback');
  });

  it('calls onError on rejection', async () => {
    const onError = vi.fn();
    await safeExecuteAsync(
      async () => { throw new Error('async error'); },
      null,
      onError
    );
    expect(onError).toHaveBeenCalled();
  });
});

describe('defaultRetryStrategy', () => {
  it('has default max retries of 3', () => {
    expect(defaultRetryStrategy.maxRetries).toBe(3);
  });

  it('has base delay of 1000ms', () => {
    expect(defaultRetryStrategy.baseDelay).toBe(1000);
  });

  it('has max delay of 10000ms', () => {
    expect(defaultRetryStrategy.maxDelay).toBe(10000);
  });

  it('should retry for network errors', () => {
    expect(defaultRetryStrategy.shouldRetry(new Error('network error'), 1)).toBe(true);
    expect(defaultRetryStrategy.shouldRetry(new Error('data parse'), 1)).toBe(true);
  });

  it('should not retry for auth errors', () => {
    expect(defaultRetryStrategy.shouldRetry(new Error('401 Unauthorized'), 1)).toBe(false);
  });

  it('should not retry for unknown errors', () => {
    expect(defaultRetryStrategy.shouldRetry(new Error('random error'), 1)).toBe(false);
  });
});

describe('executeWithRetry', () => {
  it('returns result on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await executeWithRetry(fn, { ...defaultRetryStrategy, baseDelay: 1 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('network error'));
      return Promise.resolve('success');
    });
    
    const result = await executeWithRetry(fn, { ...defaultRetryStrategy, baseDelay: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error('network error'))); // network error should be retried
    
    await expect(
      executeWithRetry(fn, { ...defaultRetryStrategy, baseDelay: 10 })
    ).rejects.toThrow('network error');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('uses custom retry strategy and succeeds', async () => {
    const customStrategy = {
      maxRetries: 3,
      baseDelay: 1,
      maxDelay: 1000,
      shouldRetry: () => true, // always retry
    };
    
    let callCount = 0;
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) return Promise.reject(new Error('err'));
      return Promise.resolve('ok');
    });

    const result = await executeWithRetry(fn, customStrategy);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error('auth error')));
    const customStrategy = {
      ...defaultRetryStrategy,
      maxRetries: 3,
      shouldRetry: () => false,
    };

    await expect(
      executeWithRetry(fn, customStrategy)
    ).rejects.toThrow('auth error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
