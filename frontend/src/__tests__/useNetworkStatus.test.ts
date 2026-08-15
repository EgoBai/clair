import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus, type NetworkType } from '../hooks/useNetworkStatus';

/**
 * useNetworkStatus Hook 测试（导入真实模块）
 */

function mockConnection(conn: { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean } | null) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: conn
      ? { ...conn, addEventListener() {}, removeEventListener() {} }
      : undefined,
  });
}

describe('useNetworkStatus（真实 hook）', () => {
  beforeEach(() => {
    vi.stubGlobal('setInterval', vi.fn(() => 0 as unknown as ReturnType<typeof setInterval>));
    vi.stubGlobal('clearInterval', vi.fn());
    mockConnection(null);
  });
  afterEach(() => {
    mockConnection(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('默认状态', () => {
    it('应返回完整 NetworkStatus 字段且类型正确', () => {
      const { result } = renderHook(() => useNetworkStatus());
      expect(typeof result.current.isOnline).toBe('boolean');
      expect(typeof result.current.effectiveType).toBe('string');
      expect(typeof result.current.downlink).toBe('number');
      expect(typeof result.current.rtt).toBe('number');
      expect(typeof result.current.saveData).toBe('boolean');
      expect(typeof result.current.quality).toBe('string');
      expect(result.current.offlineDuration).toBe(0);
      expect(result.current.effectiveType).toBe('unknown');
      expect(result.current.quality).toBe('good'); // computeQuality(true, 0, 'unknown')
    });
  });

  describe('在线/离线事件', () => {
    it('离线事件应标记 isOnline=false 且 quality=offline', () => {
      const { result } = renderHook(() => useNetworkStatus());
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      act(() => { window.dispatchEvent(new Event('offline')); });
      expect(result.current.isOnline).toBe(false);
      expect(result.current.quality).toBe('offline');
      expect(result.current.offlineDuration).toBeGreaterThanOrEqual(0);
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    it('重新在线应恢复 isOnline=true', () => {
      const { result } = renderHook(() => useNetworkStatus());
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      act(() => { window.dispatchEvent(new Event('offline')); });
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      act(() => { window.dispatchEvent(new Event('online')); });
      expect(result.current.isOnline).toBe(true);
    });

    it('回调 onChange / onOffline / onReconnect 应触发', () => {
      const onChange = vi.fn();
      const onOffline = vi.fn();
      const onReconnect = vi.fn();
      renderHook(() => useNetworkStatus({ onChange, onOffline, onReconnect }));
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      act(() => { window.dispatchEvent(new Event('offline')); });
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      act(() => { window.dispatchEvent(new Event('online')); });
      expect(onChange).toHaveBeenCalled();
      expect(onOffline).toHaveBeenCalled();
      expect(onReconnect).toHaveBeenCalled();
    });
  });

  describe('质量计算（通过 connection 模拟驱动真实 computeQuality）', () => {
    const cases: Array<[Partial<{ effectiveType: string; rtt: number }>, string]> = [
      [{ effectiveType: '4g', rtt: 0 }, 'excellent'],
      [{ effectiveType: 'wifi', rtt: 0 }, 'excellent'],
      [{ effectiveType: 'ethernet', rtt: 0 }, 'excellent'],
      [{ effectiveType: '3g', rtt: 0 }, 'good'],
      [{ effectiveType: '2g', rtt: 0 }, 'fair'],
      [{ effectiveType: 'slow-2g', rtt: 0 }, 'poor'],
      [{ effectiveType: 'unknown', rtt: 0 }, 'good'],
      [{ effectiveType: '4g', rtt: 50 }, 'excellent'],
      [{ effectiveType: '4g', rtt: 200 }, 'good'],
      [{ effectiveType: '4g', rtt: 500 }, 'fair'],
      [{ effectiveType: '4g', rtt: 2000 }, 'poor'],
    ];

    cases.forEach(([conn, expectedQuality]) => {
      it(`quality=${expectedQuality} for ${JSON.stringify(conn)}`, () => {
        mockConnection(conn as any);
        const { result } = renderHook(() => useNetworkStatus());
        expect(result.current.quality).toBe(expectedQuality);
      });
    });
  });

  describe('NetworkType 类型完整性', () => {
    it('NetworkType 字面量集合', () => {
      const valid: NetworkType[] = ['wifi', '4g', '3g', '2g', 'slow-2g', 'ethernet', 'unknown'];
      expect(valid).toHaveLength(7);
    });
  });
});
