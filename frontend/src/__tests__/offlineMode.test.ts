import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  OfflineManager,
  useNetworkStatus,
  useOfflineCache,
  useOfflineQueue,
} from '../utils/offlineMode';

/**
 * 离线模式引擎测试（导入真实模块）
 * 注意：jsdom 无 IndexedDB，缓存层降级为内存 no-op，仍覆盖代码路径。
 */

describe('OfflineManager（真实模块）', () => {
  let manager: OfflineManager;

  beforeEach(() => {
    vi.stubGlobal('setInterval', vi.fn(() => 0 as unknown as ReturnType<typeof setInterval>));
    vi.stubGlobal('clearInterval', vi.fn());
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    manager = new OfflineManager();
  });

  afterEach(() => {
    manager.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('status 默认为 online（jsdom navigator.onLine）', () => {
    expect(manager.status).toBe('online');
  });

  it('onStatusChange 应在网络事件时通知', () => {
    const seen: string[] = [];
    manager.onStatusChange(s => seen.push(s));
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(seen).toContain('offline');
    expect(seen).toContain('online');
  });

  it('getCached 在无 IndexedDB 时降级返回 null', async () => {
    const cached = await manager.getCached('missing');
    expect(cached).toBeNull();
  });

  it('setCache 不应抛错', async () => {
    await expect(manager.setCache('k', { a: 1 })).resolves.toBeUndefined();
  });

  it('clearCache / cleanupCache 不抛错', async () => {
    await expect(manager.clearCache()).resolves.toBeUndefined();
    await expect(manager.cleanupCache()).resolves.toBeDefined();
  });

  it('enqueueAction / processQueue 在无 DB 时安全', async () => {
    await expect(manager.enqueueAction('add_watchlist', { symbol: '000001' })).resolves.toBeUndefined();
    const res = await manager.processQueue();
    expect(res).toHaveProperty('success');
    expect(res).toHaveProperty('failed');
  });

  it('getPendingCount 返回数字', async () => {
    const n = await manager.getPendingCount();
    expect(typeof n).toBe('number');
  });
});

describe('useNetworkStatus（真实 hook）', () => {
  beforeEach(() => {
    vi.stubGlobal('setInterval', vi.fn(() => 0 as unknown as ReturnType<typeof setInterval>));
    vi.stubGlobal('clearInterval', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('应返回 status 与 isOnline', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(['online', 'offline', 'reconnecting']).toContain(result.current.status);
    expect(result.current.isOnline).toBe(result.current.status === 'online');
  });
});

describe('useOfflineCache（真实 hook）', () => {
  beforeEach(() => {
    vi.stubGlobal('setInterval', vi.fn(() => 0 as unknown as ReturnType<typeof setInterval>));
    vi.stubGlobal('clearInterval', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('在线时应通过 fetcher 加载数据', async () => {
    const fetcher = vi.fn().mockResolvedValue({ stocks: [1, 2, 3] });
    const { result } = renderHook(() => useOfflineCache('key1', fetcher, 1000));
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(fetcher).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ stocks: [1, 2, 3] });
  });
});

describe('useOfflineQueue（真实 hook）', () => {
  beforeEach(() => {
    vi.stubGlobal('setInterval', vi.fn(() => 0 as unknown as ReturnType<typeof setInterval>));
    vi.stubGlobal('clearInterval', vi.fn());
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('enqueueAction 与 processQueue 可调用', async () => {
    const { result } = renderHook(() => useOfflineQueue());
    await act(async () => {
      await result.current.enqueueAction('add_watchlist', { symbol: '000001' });
    });
    const res = await act(async () => result.current.processQueue());
    expect(res).toHaveProperty('success');
    expect(res).toHaveProperty('failed');
  });
});
