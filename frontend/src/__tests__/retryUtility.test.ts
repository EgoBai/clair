import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, CircuitBreaker, Bulkhead } from '../services/retryUtility';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on first success', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(1);
    vi.useFakeTimers();
  });

  it('should retry on failure and succeed', async () => {
    vi.useRealTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { baseDelay: 0, maxRetries: 3, jitter: false });
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(2);
    vi.useFakeTimers();
  });

  it('should throw after max retries exceeded', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 0, jitter: false })
    ).rejects.toThrow('always fail');
    vi.useFakeTimers();
  });

  it('should respect retryCondition', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new Error('no retry'));
    const retryCondition = vi.fn().mockReturnValue(false);

    await expect(
      withRetry(fn, { maxRetries: 3, retryCondition, baseDelay: 0, jitter: false })
    ).rejects.toThrow('no retry');
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
  });

  it('should call onRetry callback', async () => {
    vi.useRealTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const onRetry = vi.fn();
    const result = await withRetry(fn, { baseDelay: 0, onRetry, jitter: false });
    expect(result.result).toBe('ok');
    expect(onRetry).toHaveBeenCalled();
    vi.useFakeTimers();
  });

  it('should track total time', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
    vi.useFakeTimers();
  });
});

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
  });

  it('should execute normally when closed', async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('should open after failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 1000 });

    for (let i = 0; i < 3; i++) {
      await cb.execute(async () => { throw new Error('fail'); }).catch(() => { );
    }

    expect(cb.getState()).toBe('open');
  });

  it('should reject when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 60000 });
    await cb.execute(async () => { throw new Error('fail'); }).catch(() => { );
    await expect(cb.execute(async () => 'ok')).rejects.toThrow('Circuit breaker is open');
  });

  it('should transition to half-open after reset timeout', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1000 });
    await cb.execute(async () => { throw new Error('fail'); }).catch(() => { );
    expect(cb.getState()).toBe('open');

    vi.advanceTimersByTime(1100);
    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
    vi.useRealTimers();
  });

  it('should call onStateChange callback', async () => {
    const onStateChange = vi.fn();
    const cb = new CircuitBreaker({ failureThreshold: 1, onStateChange });
    await cb.execute(async () => { throw new Error('fail'); }).catch(() => { );
    expect(onStateChange).toHaveBeenCalledWith('closed', 'open');
  });

  it('should reset', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    await cb.execute(async () => { throw new Error('fail'); }).catch(() => { );
    expect(cb.getState()).toBe('open');
    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getFailureCount()).toBe(0);
  });

  it('should track failure count', async () => {
    const cb = new CircuitBreaker();
    await cb.execute(async () => { throw new Error('fail'); }).catch(() => { );
    expect(cb.getFailureCount()).toBe(1);
  });
});

describe('Bulkhead', () => {
  it('should limit concurrent executions', async () => {
    const bulkhead = new Bulkhead(2);
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 5 }, () =>
      bulkhead.execute(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(r => setTimeout(r, 10));
        running--;
        return 'done';
      })
    );

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(5);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('should report active count', () => {
    const bulkhead = new Bulkhead(3);
    expect(bulkhead.getActiveCount()).toBe(0);
  });

  it('should report queue length', () => {
    const bulkhead = new Bulkhead(1, 10);
    expect(bulkhead.getQueueLength()).toBe(0);
  });

  it('should reject when queue full', async () => {
    const bulkhead = new Bulkhead(1, 1);
    // Fill the execution slot (never resolves)
    const never = new Promise<never>(() => { );
    bulkhead.execute(() => never);
    // Fill the queue slot
    bulkhead.execute(async () => 'x').catch(() => { );
    // Should reject
    await expect(bulkhead.execute(async () => 'y')).rejects.toThrow('Bulkhead queue full');
  });

  it('should execute function and return result', async () => {
    const bulkhead = new Bulkhead(5);
    const result = await bulkhead.execute(async () => 42);
    expect(result).toBe(42);
  });
});
