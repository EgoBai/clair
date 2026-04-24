// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * We import and test the hooks individually to handle React-Rule-of-Hooks
 * constraints. The logger dependency needs proper mocking.
 */

describe('performanceOptimizer hooks', () => {
  beforeEach(() => {
    vi.stubGlobal('import', { meta: { env: { DEV: false } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('useDebounce', () => {
    it('should debounce calls', async () => {
      vi.useFakeTimers();
      const { useDebounce } = await import('../utils/performanceOptimizer');
      const fn = vi.fn();

      const { result, unmount } = renderHook(() => useDebounce(fn, 300));

      act(() => { result.current('a'); });
      act(() => { result.current('b'); });
      act(() => { result.current('c'); });

      expect(fn).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(300); });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');

      unmount();
      vi.useRealTimers();
    });

    it('should not call after unmount', async () => {
      vi.useFakeTimers();
      const { useDebounce } = await import('../utils/performanceOptimizer');
      const fn = vi.fn();

      const { result, unmount } = renderHook(() => useDebounce(fn, 100));

      act(() => { result.current(); });
      unmount();
      act(() => { vi.advanceTimersByTime(100); });

      expect(fn).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('useThrottle', () => {
    it('should call immediately on first invocation', async () => {
      vi.useFakeTimers();
      const { useThrottle } = await import('../utils/performanceOptimizer');
      const fn = vi.fn();

      const { result, unmount } = renderHook(() => useThrottle(fn, 200));

      act(() => { result.current(); });
      expect(fn).toHaveBeenCalledTimes(1);

      unmount();
      vi.useRealTimers();
    });

    it('should throttle subsequent rapid calls', async () => {
      vi.useFakeTimers();
      const { useThrottle } = await import('../utils/performanceOptimizer');
      const fn = vi.fn();

      const { result, unmount } = renderHook(() => useThrottle(fn, 200));

      act(() => { result.current(); });  // immediate
      act(() => { result.current(); });  // ignored
      act(() => { result.current(); });  // ignored

      expect(fn).toHaveBeenCalledTimes(1);

      // After delay, the trailing call should fire
      act(() => { vi.advanceTimersByTime(200); });
      expect(fn).toHaveBeenCalledTimes(2);

      unmount();
      vi.useRealTimers();
    });

    it('should clean up timeout on unmount', async () => {
      vi.useFakeTimers();
      const { useThrottle } = await import('../utils/performanceOptimizer');
      const fn = vi.fn();

      const { result, unmount } = renderHook(() => useThrottle(fn, 200));

      act(() => { result.current(); }); // fires immediately
      act(() => { result.current(); }); // trailing scheduled
      unmount();
      act(() => { vi.advanceTimersByTime(200); });

      expect(fn).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('useVirtualScroll', () => {
    it('should return initial visible items', async () => {
      const { useVirtualScroll } = await import('../utils/performanceOptimizer');
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);

      const { result } = renderHook(() => useVirtualScroll(items, 50, 400));

      expect(result.current.visibleItems.length).toBeGreaterThan(0);
      expect(result.current.totalHeight).toBe(5000);
      expect(typeof result.current.offsetY).toBe('number');
      expect(result.current.scrollRef).not.toBeNull();
    });

    it('should show first items by default', async () => {
      const { useVirtualScroll } = await import('../utils/performanceOptimizer');
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);

      const { result } = renderHook(() => useVirtualScroll(items, 50, 400));

      expect(result.current.visibleItems[0]).toBe('item-0');
    });

    it('should handle empty items', async () => {
      const { useVirtualScroll } = await import('../utils/performanceOptimizer');

      const { result } = renderHook(() => useVirtualScroll([], 50, 400));

      expect(result.current.visibleItems).toHaveLength(0);
      expect(result.current.totalHeight).toBe(0);
    });
  });

  describe('useChunkedList', () => {
    it('should return first chunk on init', async () => {
      const { useChunkedList } = await import('../utils/performanceOptimizer');
      const items = Array.from({ length: 200 }, (_, i) => i);

      const { result } = renderHook(() => useChunkedList(items, 50));

      expect(result.current.visibleItems).toHaveLength(50);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.loadedCount).toBe(50);
    });

    it('should load more on loadMore call', async () => {
      const { useChunkedList } = await import('../utils/performanceOptimizer');
      const items = Array.from({ length: 200 }, (_, i) => i);

      const { result } = renderHook(() => useChunkedList(items, 50));

      act(() => { result.current.loadMore(); });
      expect(result.current.visibleItems).toHaveLength(100);
    });

    it('should indicate no more items when all loaded', async () => {
      const { useChunkedList } = await import('../utils/performanceOptimizer');
      const items = Array.from({ length: 30 }, (_, i) => i);

      const { result } = renderHook(() => useChunkedList(items, 50));

      expect(result.current.hasMore).toBe(false);
      expect(result.current.visibleItems).toHaveLength(30);
    });

    it('should handle default chunk size', async () => {
      const { useChunkedList } = await import('../utils/performanceOptimizer');
      const items = Array.from({ length: 100 }, (_, i) => i);

      const { result } = renderHook(() => useChunkedList(items));

      expect(result.current.visibleItems).toHaveLength(50);
    });
  });

  describe('useLazyImage', () => {
    it('should start loading on mount', async () => {
      const { useLazyImage } = await import('../utils/performanceOptimizer');

      const { result } = renderHook(() => useLazyImage('https://example.com/img.jpg'));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.imageSrc).toBeNull();
    });

    it('should handle empty src', async () => {
      const { useLazyImage } = await import('../utils/performanceOptimizer');

      const { result } = renderHook(() => useLazyImage(''));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.imageSrc).toBeNull();
    });
  });

  describe('useRenderPerformance', () => {
    it('should track render count', async () => {
      // Suppress logger warnings for this test
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('import', { meta: { env: { DEV: false } } });
      const { useRenderPerformance } = await import('../utils/performanceOptimizer');

      const { result } = renderHook(() => useRenderPerformance('TestComponent'));

      expect(typeof result.current.renderCount).toBe('number');
      expect(result.current.avgRenderTime).toBeGreaterThanOrEqual(0);
    });
  });
});
