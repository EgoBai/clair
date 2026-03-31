// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useRenderTracker,
  useMemoryMonitor,
  useLongTaskDetector,
} from '../hooks/useRenderPerformance';

describe('useRenderTracker', () => {
  it('should return initial metrics', () => {
    const { result } = renderHook(() => useRenderTracker('TestComponent'));
    expect(result.current.renderCount).toBeGreaterThanOrEqual(0);
    expect(result.current.totalRenderTime).toBeGreaterThanOrEqual(0);
    expect(result.current.renderHistory).toBeDefined();
  });

  it('should track render count on rerender', () => {
    const { result, rerender } = renderHook(() => useRenderTracker('Test'));
    const initialCount = result.current.renderCount;
    rerender();
    expect(result.current.renderCount).toBeGreaterThan(initialCount);
  });

  it('should calculate average render time', () => {
    const { result, rerender } = renderHook(() => useRenderTracker('Test'));
    rerender();
    rerender();
    if (result.current.renderCount > 0) {
      expect(result.current.avgRenderTime).toBeGreaterThanOrEqual(0);
      const expected = result.current.totalRenderTime / result.current.renderCount;
      expect(result.current.avgRenderTime).toBeCloseTo(expected, 5);
    }
  });

  it('should track render history with timestamps', () => {
    const { result, rerender } = renderHook(() => useRenderTracker('Test'));
    rerender();
    expect(result.current.renderHistory.length).toBeGreaterThanOrEqual(1);
    const entry = result.current.renderHistory[0];
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.duration).toBeGreaterThanOrEqual(0);
  });

  it('should cap history at 100 entries', () => {
    const { result, rerender } = renderHook(() => useRenderTracker('Test'));
    for (let i = 0; i < 105; i++) rerender();
    expect(result.current.renderHistory.length).toBeLessThanOrEqual(100);
  });

  it('should track slow renders', () => {
    const { result, rerender } = renderHook(() =>
      useRenderTracker('Test', { slowRenderMs: 0, criticalRenderMs: 0 })
    );
    rerender();
    expect(result.current.slowRenders).toBeGreaterThanOrEqual(0);
  });

  it('should accept custom threshold', () => {
    const { result } = renderHook(() =>
      useRenderTracker('Test', { slowRenderMs: 1, criticalRenderMs: 5 })
    );
    expect(result.current).toBeDefined();
  });

  it('should track last render time', () => {
    const { result, rerender } = renderHook(() => useRenderTracker('Test'));
    rerender();
    expect(result.current.lastRenderTime).toBeGreaterThanOrEqual(0);
  });
});

describe('useMemoryMonitor', () => {
  it('should report unsupported when no memory API', () => {
    const { result } = renderHook(() => useMemoryMonitor(1000));
    expect(result.current.isSupported).toBe(false);
  });

  it('should return zero values when unsupported', () => {
    const { result } = renderHook(() => useMemoryMonitor());
    expect(result.current.usedJSHeapSize).toBe(0);
    expect(result.current.usagePercent).toBe(0);
    expect(result.current.totalJSHeapSize).toBe(0);
    expect(result.current.heapLimit).toBe(0);
  });

  it('should accept custom interval', () => {
    const { result } = renderHook(() => useMemoryMonitor(500));
    expect(result.current).toBeDefined();
  });
});

describe('useLongTaskDetector', () => {
  it('should start with zero counts', () => {
    const { result } = renderHook(() => useLongTaskDetector());
    expect(result.current.longTaskCount).toBe(0);
    expect(result.current.longestTask).toBe(0);
  });

  it('should accept threshold parameter', () => {
    const { result } = renderHook(() => useLongTaskDetector(100));
    expect(result.current).toBeDefined();
  });

  it('should accept callback', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useLongTaskDetector(50, cb));
    expect(result.current).toBeDefined();
  });

  it('should handle unsupported environment', () => {
    const { result } = renderHook(() => useLongTaskDetector());
    expect(typeof result.current.isSupported).toBe('boolean');
  });
});
