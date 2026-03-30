import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle } from '../utils/debounceThrottle';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('should only call function once for multiple rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced('b');
    debounced('c');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('should cancel pending invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced.cancel();

    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should flush immediately', () => {
    const fn = vi.fn().mockReturnValue('result');
    const debounced = debounce(fn, 100);

    debounced('a');
    const result = debounced.flush();

    expect(fn).toHaveBeenCalledWith('a');
    expect(result).toBe('result');
  });

  it('should report pending status', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    expect(debounced.pending()).toBe(false);
    debounced('a');
    expect(debounced.pending()).toBe(true);

    vi.advanceTimersByTime(100);
    expect(debounced.pending()).toBe(false);
  });

  it('should support leading edge', () => {
    const fn = vi.fn().mockReturnValue('result');
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    const result = debounced('a');
    expect(fn).toHaveBeenCalledWith('a');
    expect(result).toBe('result');

    // Rapid second call should not invoke
    debounced('b');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect maxWait', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50, { maxWait: 200 });

    debounced('a');
    vi.advanceTimersByTime(40);
    debounced('b');
    vi.advanceTimersByTime(40);
    debounced('c');
    vi.advanceTimersByTime(40);
    debounced('d');
    vi.advanceTimersByTime(40);
    debounced('e');
    vi.advanceTimersByTime(40);

    // maxWait of 200 should have been reached
    expect(fn).toHaveBeenCalled();
  });

  it('should return function result', () => {
    const fn = vi.fn().mockReturnValue(42);
    const debounced = debounce(fn, 100, { leading: true });

    const result = debounced();
    expect(result).toBe(42);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call function immediately on first call (leading)', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('should suppress calls within interval', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');
    throttled('b');
    throttled('c');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('should allow calls after interval', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');
    vi.advanceTimersByTime(100);
    throttled('b');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should support trailing edge', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100, { leading: false, trailing: true });

    throttled('a');
    throttled('b');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('should cancel', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');
    throttled.cancel();

    vi.advanceTimersByTime(200);
    // Only the leading call should have happened
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should flush', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('a');
    throttled('b');
    throttled.flush();

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
