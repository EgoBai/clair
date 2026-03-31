import { describe, it, expect, vi } from 'vitest';
import { SmartRequestManager } from '../utils/requestUtils';

describe('SmartRequestManager', () => {
  it('should cache results', async () => {
    const mgr = new SmartRequestManager(5000);
    const fn = vi.fn().mockResolvedValue('value');
    const r1 = await mgr.request('key', fn);
    const r2 = await mgr.request('key', fn);
    expect(r1).toBe('value');
    expect(r2).toBe('value');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should skip cache when disabled', async () => {
    const mgr = new SmartRequestManager(5000);
    const fn = vi.fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');
    const r1 = await mgr.request('key', fn, { cache: false });
    const r2 = await mgr.request('key', fn, { cache: false });
    expect(r1).toBe('v1');
    expect(r2).toBe('v2');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should invalidate specific key', async () => {
    const mgr = new SmartRequestManager(5000);
    const fn = vi.fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');
    await mgr.request('key', fn);
    mgr.invalidate('key');
    await mgr.request('key', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should invalidate all', async () => {
    const mgr = new SmartRequestManager(5000);
    await mgr.request('a', async () => 1);
    await mgr.request('b', async () => 2);
    expect(mgr.getStats().cached).toBe(2);
    mgr.invalidate();
    expect(mgr.getStats().cached).toBe(0);
  });

  it('should report stats', async () => {
    const mgr = new SmartRequestManager(5000);
    await mgr.request('key', async () => 'val');
    const stats = mgr.getStats();
    expect(stats.cached).toBe(1);
    expect(stats.inflight).toBe(0);
  });

  it('should handle errors and clear inflight', async () => {
    const mgr = new SmartRequestManager(5000);
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(mgr.request('key', fn)).rejects.toThrow('fail');
    expect(mgr.getStats().inflight).toBe(0);
  });
});

describe('debounce', () => {
  it('should create a debounced function', async () => {
    const { debounce } = await import('../utils/requestUtils');
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    expect(typeof debounced).toBe('function');
    expect(typeof debounced.cancel).toBe('function');
    expect(typeof debounced.flush).toBe('function');
    expect(typeof debounced.pending).toBe('function');
  });

  it('should report not pending initially', async () => {
    const { debounce } = await import('../utils/requestUtils');
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    expect(debounced.pending()).toBe(false);
  });
});

describe('throttle', () => {
  it('should create a throttled function', async () => {
    const { throttle } = await import('../utils/requestUtils');
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    expect(typeof throttled).toBe('function');
    expect(typeof throttled.cancel).toBe('function');
    expect(typeof throttled.flush).toBe('function');
  });
});
