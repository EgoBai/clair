// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for debounceThrottle-typed.ts - Type-safe debounce & throttle utilities
 */

type DebounceModule = typeof import('../utils/debounceThrottle-typed');

describe('debounce (pure function)', () => {
  let mod: DebounceModule;
  let fn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mod = await import('../utils/debounceThrottle-typed');
    fn = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not call immediately by default', () => {
    const debounced = mod.debounce(fn, 100);
    debounced('a');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should call after delay', () => {
    const debounced = mod.debounce(fn, 100);
    debounced('a');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('should debounce multiple calls - only last counts', () => {
    const debounced = mod.debounce(fn, 100);
    debounced('a');
    debounced('b');
    debounced('c');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('should call leading edge when leading=true', () => {
    const debounced = mod.debounce(fn, 100, { leading: true });
    debounced('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('should fire leading and trailing separately', () => {
    const debounced = mod.debounce(fn, 100, { leading: true, trailing: true });
    debounced('a');
    expect(fn).toHaveBeenCalledTimes(1); // leading
    debounced('b');
    debounced('c');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // trailing
  });

  it('should cancel pending execution', () => {
    const debounced = mod.debounce(fn, 100);
    debounced('a');
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should return pending state', () => {
    const debounced = mod.debounce(fn, 100);
    expect(debounced.pending()).toBe(false);
    debounced('a');
    expect(debounced.pending()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(debounced.pending()).toBe(false);
  });

  it('should flush pending execution immediately', () => {
    const debounced = mod.debounce(fn, 100);
    debounced('a');
    debounced.flush();
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('should respect maxWait option', () => {
    const debounced = mod.debounce(fn, 500, { maxWait: 200 });
    debounced('a');
    vi.advanceTimersByTime(150);
    debounced('b');
    // Still within delay (500), but maxWait (200) since last invoke should trigger
    vi.advanceTimersByTime(60); // 210ms total
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('should not fire trailing when trailing=false', () => {
    const debounced = mod.debounce(fn, 100, { trailing: false });
    debounced('a');
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('throttle (pure function)', () => {
  let mod: DebounceModule;
  let fn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mod = await import('../utils/debounceThrottle-typed');
    fn = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call immediately by default (leading=true)', () => {
    const throttled = mod.throttle(fn, 100);
    throttled('a');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throttle subsequent calls within interval', () => {
    const throttled = mod.throttle(fn, 100);
    throttled('a');
    throttled('b');
    throttled('c');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call after interval passes', () => {
    const throttled = mod.throttle(fn, 100);
    throttled('a');
    vi.advanceTimersByTime(200);
    throttled('b');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should support cancel', () => {
    const throttled = mod.throttle(fn, 100);
    throttled('a');
    throttled.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should support flush', () => {
    const throttled = mod.throttle(fn, 100);
    throttled('a');
    throttled('b'); // trailing scheduled
    vi.advanceTimersByTime(50);
    throttled.flush();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('rafThrottle', () => {
  let mod: DebounceModule;
  let fn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mod = await import('../utils/debounceThrottle-typed');
    fn = vi.fn();
    // Mock requestAnimationFrame to use Math.random for unique IDs
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      const id = Math.floor(Math.random() * 100000);
      window.setTimeout(() => cb(Date.now()), 0);
      return id;
    });
    // cancelAnimationFrame is a no-op with this mock since we don't need real cleanup
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should throttle via requestAnimationFrame', () => {
    const throttled = mod.rafThrottle(fn);
    throttled('a');
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('should deduplicate calls within same frame', () => {
    const throttled = mod.rafThrottle(fn);
    throttled('a');
    throttled('b');
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('should support cancel', () => {
    const throttled = mod.rafThrottle(fn);
    throttled('a');
    throttled.cancel();
    vi.advanceTimersByTime(0);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('BatchDebouncer', () => {
  let mod: DebounceModule;
  let fn1: ReturnType<typeof vi.fn>;
  let fn2: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mod = await import('../utils/debounceThrottle-typed');
    fn1 = vi.fn();
    fn2 = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should batch and execute all callbacks after delay', () => {
    const batcher = new mod.BatchDebouncer(100);
    batcher.add(fn1);
    batcher.add(fn2);
    expect(fn1).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('should reset timer on new additions', () => {
    const batcher = new mod.BatchDebouncer(100);
    batcher.add(fn1);
    vi.advanceTimersByTime(50);
    batcher.add(fn2);
    vi.advanceTimersByTime(50);
    expect(fn1).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('should support cancel', () => {
    const batcher = new mod.BatchDebouncer(100);
    batcher.add(fn1);
    batcher.cancel();
    vi.advanceTimersByTime(200);
    expect(fn1).not.toHaveBeenCalled();
  });

  it('should support flush', () => {
    const batcher = new mod.BatchDebouncer(100);
    batcher.add(fn1);
    batcher.add(fn2);
    batcher.flush();
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('should report pending state', () => {
    const batcher = new mod.BatchDebouncer(100);
    expect(batcher.pending()).toBe(false);
    batcher.add(fn1);
    expect(batcher.pending()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(batcher.pending()).toBe(false);
  });
});

describe('BatchThrottler', () => {
  let mod: DebounceModule;
  let fn1: ReturnType<typeof vi.fn>;
  let fn2: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    mod = await import('../utils/debounceThrottle-typed');
    fn1 = vi.fn();
    fn2 = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute immediately on first add', () => {
    const throttler = new mod.BatchThrottler(100);
    throttler.add(fn1);
    expect(fn1).toHaveBeenCalled();
  });

  it('should throttle subsequent adds', () => {
    const throttler = new mod.BatchThrottler(100);
    throttler.add(fn1);
    throttler.add(fn2);
    expect(fn1).toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn2).toHaveBeenCalled();
  });

  it('should support cancel', () => {
    const throttler = new mod.BatchThrottler(100);
    throttler.add(fn1);
    throttler.add(fn2);
    throttler.cancel();
    vi.advanceTimersByTime(200);
    expect(fn2).not.toHaveBeenCalled();
  });

  it('should support flush', () => {
    const throttler = new mod.BatchThrottler(100);
    throttler.add(fn1);
    throttler.add(fn2);
    throttler.flush();
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });
});
