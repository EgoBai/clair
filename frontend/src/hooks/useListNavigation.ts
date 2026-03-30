/**
 * 列表键盘导航 Hook
 * 支持 J/K 上下导航、Enter 选中、Home/End 跳转
 */

import { useEffect, useCallback, useRef, useState } from 'react';

interface UseListNavigationOptions<T> {
  items: T[];
  onSelect?: (item: T, index: number) => void;
  onHover?: (item: T, index: number) => void;
  enabled?: boolean;
  loop?: boolean; // 到达边界时循环
  getId?: (item: T) => string | number;
}

interface UseListNavigationReturn {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  isActive: (index: number) => boolean;
  getItemProps: (index: number) => {
    'data-active': boolean;
    tabIndex: number;
    onClick: () => void;
    onMouseEnter: () => void;
  };
  scrollToActive: (containerRef: React.RefObject<HTMLElement>) => void;
}

export function useListNavigation<T>(
  options: UseListNavigationOptions<T>
): UseListNavigationReturn {
  const { items, onSelect, onHover, enabled = true, loop = true, getId } = options;
  const [activeIndex, setActiveIndex] = useState(-1);

  const moveUp = useCallback(() => {
    setActiveIndex(prev => {
      if (prev <= 0) return loop ? items.length - 1 : 0;
      return prev - 1;
    });
  }, [items.length, loop]);

  const moveDown = useCallback(() => {
    setActiveIndex(prev => {
      if (prev >= items.length - 1) return loop ? 0 : items.length - 1;
      return prev + 1;
    });
  }, [items.length, loop]);

  const goToFirst = useCallback(() => setActiveIndex(0), []);
  const goToLast = useCallback(() => setActiveIndex(items.length - 1), [items.length]);

  const selectCurrent = useCallback(() => {
    if (activeIndex >= 0 && activeIndex < items.length) {
      onSelect?.(items[activeIndex], activeIndex);
    }
  }, [activeIndex, items, onSelect]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          moveDown();
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          moveUp();
          break;
        case 'Home':
          e.preventDefault();
          goToFirst();
          break;
        case 'End':
          e.preventDefault();
          goToLast();
          break;
        case 'Enter':
          e.preventDefault();
          selectCurrent();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, moveUp, moveDown, goToFirst, goToLast, selectCurrent]);

  // activeIndex 变化时触发 hover
  useEffect(() => {
    if (activeIndex >= 0 && activeIndex < items.length) {
      onHover?.(items[activeIndex], activeIndex);
    }
  }, [activeIndex, items, onHover]);

  const isActive = useCallback((index: number) => index === activeIndex, [activeIndex]);

  const getItemProps = useCallback((index: number) => ({
    'data-active': index === activeIndex,
    tabIndex: index === activeIndex ? 0 : -1,
    onClick: () => {
      setActiveIndex(index);
      onSelect?.(items[index], index);
    },
    onMouseEnter: () => {
      setActiveIndex(index);
    },
  }), [activeIndex, items, onSelect]);

  const scrollToActive = useCallback((containerRef: React.RefObject<HTMLElement>) => {
    if (!containerRef.current || activeIndex < 0) return;
    const activeEl = containerRef.current.querySelector(`[data-active="true"]`);
    activeEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  return { activeIndex, setActiveIndex, isActive, getItemProps, scrollToActive };
}
