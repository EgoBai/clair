/**
 * Virtual Scroll Hook
 * 虚拟滚动 - 大列表性能优化
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

export interface VirtualScrollConfig {
  itemHeight: number;
  overscan?: number;
  containerHeight: number;
}

export interface VirtualScrollResult<T> {
  virtualItems: Array<{ index: number; item: T; style: React.CSSProperties }>;
  totalHeight: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollToIndex: (index: number) => void;
  scrollToTop: () => void;
}

export function useVirtualScroll<T>(
  items: T[],
  config: VirtualScrollConfig
): VirtualScrollResult<T> {
  const { itemHeight, overscan = 5, containerHeight } = config;
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const totalHeight = items.length * itemHeight;

  const { startIndex, endIndex, virtualItems } = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length - 1, Math.floor(scrollTop / itemHeight) + visibleCount + overscan);

    const vItems = [];
    for (let i = start; i <= end; i++) {
      if (items[i] !== undefined) {
        vItems.push({
          index: i,
          item: items[i],
          style: {
            position: 'absolute' as const,
            top: i * itemHeight,
            left: 0,
            right: 0,
            height: itemHeight,
          },
        });
      }
    }

    return { startIndex: start, endIndex: end, virtualItems: vItems };
  }, [items, itemHeight, scrollTop, overscan, containerHeight]);

  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToIndex = useCallback((index: number) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = index * itemHeight;
    }
  }, [itemHeight]);

  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  return {
    virtualItems,
    totalHeight,
    containerRef,
    scrollToIndex,
    scrollToTop,
  };
}

/**
 * Dynamic height virtual scroll (measures items)
 */
export interface DynamicVirtualScrollConfig {
  estimatedHeight: number;
  overscan?: number;
  containerHeight: number;
}

export function useDynamicVirtualScroll<T>(
  items: T[],
  config: DynamicVirtualScrollConfig
) {
  const { estimatedHeight, overscan = 5, containerHeight } = config;
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<Map<number, number>>(new Map());

  const getItemHeight = useCallback((index: number): number => {
    return heightsRef.current.get(index) ?? estimatedHeight;
  }, [estimatedHeight]);

  const { virtualItems, totalHeight } = useMemo(() => {
    // Calculate positions
    const positions: Array<{ top: number; height: number }> = [];
    let currentTop = 0;

    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight(i);
      positions.push({ top: currentTop, height });
      currentTop += height;
    }

    // Find visible range
    let startIdx = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].top + positions[i].height >= scrollTop) {
        startIdx = Math.max(0, i - overscan);
        break;
      }
    }

    let endIdx = items.length - 1;
    for (let i = startIdx; i < positions.length; i++) {
      if (positions[i].top > scrollTop + containerHeight) {
        endIdx = Math.min(items.length - 1, i + overscan);
        break;
      }
    }

    const vItems = [];
    for (let i = startIdx; i <= endIdx; i++) {
      vItems.push({
        index: i,
        item: items[i],
        style: {
          position: 'absolute' as const,
          top: positions[i].top,
          left: 0,
          right: 0,
        },
        measureRef: (el: HTMLDivElement | null) => {
          if (el) {
            const rect = el.getBoundingClientRect();
            heightsRef.current.set(i, rect.height);
          }
        },
      });
    }

    return { virtualItems: vItems, totalHeight: currentTop };
  }, [items, scrollTop, overscan, containerHeight, getItemHeight]);

  const handleScroll = useCallback((e: Event) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return { virtualItems, totalHeight, containerRef };
}
