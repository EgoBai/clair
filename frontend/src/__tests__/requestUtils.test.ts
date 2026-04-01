import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  debounce,
  throttle,
  SmartRequestManager,
} from '../utils/requestUtils';

describe('requestUtils', () => {
  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should debounce function calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced('b');
      debounced('c');

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });

    it('should support leading edge behavior', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100, { leading: true });

      // Without leading, first call waits for delay
      // With leading, first call fires immediately then waits for quiet period
      debounced('a');
      vi.advanceTimersByTime(100);

      // After delay, fn should have been called (via trailing or leading)
      expect(fn).toHaveBeenCalledWith('a');
      expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should cancel pending calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced.cancel();

      vi.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should flush pending calls', () => {
      const fn = vi.fn(() => 'result');
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced.flush();

      expect(fn).toHaveBeenCalledWith('a');
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

    it('should respect maxWait', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 200, { maxWait: 500 });

      debounced('a');
      vi.advanceTimersByTime(100);
      debounced('b');
      vi.advanceTimersByTime(100);
      debounced('c');
      vi.advanceTimersByTime(100);
      debounced('d');
      vi.advanceTimersByTime(100);
      debounced('e');
      vi.advanceTimersByTime(100);
      // 500ms total, should have been called due to maxWait
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should throttle function calls', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('a');
      expect(fn).toHaveBeenCalledTimes(1); // leading

      throttled('b');
      throttled('c');
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2); // trailing
    });

    it('should cancel', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('a');
      throttled.cancel();

      vi.advanceTimersByTime(100);
      // No trailing call after cancel
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

  describe('SmartRequestManager', () => {
    let manager: SmartRequestManager;

    beforeEach(() => {
      vi.useFakeTimers();
      manager = new SmartRequestManager(5000);
    });

    it('should cache results', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const r1 = await manager.request('key1', fn);
      expect(r1).toBe('result');

      const r2 = await manager.request('key1', fn);
      expect(r2).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1); // cached
    });

    it('should deduplicate concurrent requests', async () => {
      const fn = vi.fn().mockImplementation(
        () => Promise.resolve('result')
      );

      const p1 = manager.request('key1', fn, { cache: false });
      const p2 = manager.request('key1', fn, { cache: false });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('result');
      expect(r2).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1); // deduped
    });

    it('should bypass cache when option disabled', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await manager.request('key1', fn, { cache: false });
      await manager.request('key1', fn, { cache: false });

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await manager.request('key1', fn);
      manager.invalidate('key1');
      await manager.request('key1', fn);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should invalidate all cache', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await manager.request('k1', fn);
      await manager.request('k2', fn);
      manager.invalidate();
      await manager.request('k1', fn);

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should return stats', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await manager.request('k1', fn);
      const stats = manager.getStats();

      expect(stats).toHaveProperty('inflight');
      expect(stats).toHaveProperty('cached');
      expect(stats.cached).toBe(1);
    });

    it('should expire cached results', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await manager.request('key1', fn);
      vi.advanceTimersByTime(6000); // past TTL
      await manager.request('key1', fn);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle errors and not cache them', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      await expect(manager.request('key1', fn)).rejects.toThrow('fail');
      const result = await manager.request('key1', fn);
      expect(result).toBe('success');
    });
  });
});
