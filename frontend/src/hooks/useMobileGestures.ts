/**
 * 移动端触摸手势 Hook
 * 支持：滑动、捏合缩放、长按、双击
 * 参考富途牛牛移动端交互设计
 */

import { useRef, useCallback, useEffect, RefObject } from 'react';

interface GestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinchZoom?: (scale: number) => void;
  onLongPress?: (e: TouchEvent) => void;
  onDoubleTap?: (e: TouchEvent) => void;
  onTap?: (e: TouchEvent) => void;
}

interface GestureConfig {
  swipeThreshold?: number;     // 滑动最小距离 (px)
  longPressDelay?: number;     // 长按延迟 (ms)
  doubleTapDelay?: number;     // 双击间隔 (ms)
  pinchThreshold?: number;     // 捏合最小缩放比
}

const DEFAULT_CONFIG: Required<GestureConfig> = {
  swipeThreshold: 50,
  longPressDelay: 500,
  doubleTapDelay: 300,
  pinchThreshold: 0.1,
};

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  startDistance: number;
  lastTapTime: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  isSwiping: boolean;
  isPinching: boolean;
}

/**
 * 触摸手势 Hook
 */
export function useMobileGestures<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handlers: GestureHandlers,
  config: GestureConfig = {}
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = useRef<TouchState>({
    startX: 0, startY: 0, startTime: 0,
    startDistance: 0, lastTapTime: 0,
    longPressTimer: null, isSwiping: false, isPinching: false,
  });

  const getDistance = useCallback((t1: Touch, t2: Touch): number => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const s = state.current;
    const touch = e.touches[0];
    s.startX = touch.clientX;
    s.startY = touch.clientY;
    s.startTime = Date.now();
    s.isSwiping = false;
    s.isPinching = false;

    // 双指触摸 - 捏合
    if (e.touches.length === 2) {
      s.startDistance = getDistance(e.touches[0], e.touches[1]);
      s.isPinching = true;
      return;
    }

    // 长按检测
    if (handlers.onLongPress) {
      s.longPressTimer = setTimeout(() => {
        if (!s.isSwiping) {
          handlers.onLongPress!(e);
        }
      }, cfg.longPressDelay);
    }
  }, [handlers, cfg.longPressDelay, getDistance]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const s = state.current;

    // 清除长按定时器
    if (s.longPressTimer) {
      clearTimeout(s.longPressTimer);
      s.longPressTimer = null;
    }

    // 捏合缩放
    if (e.touches.length === 2 && s.isPinching && handlers.onPinchZoom) {
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / s.startDistance;
      if (Math.abs(scale - 1) > cfg.pinchThreshold) {
        handlers.onPinchZoom(scale);
      }
      return;
    }

    s.isSwiping = true;
  }, [handlers, cfg.pinchThreshold, getDistance]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const s = state.current;

    // 清除长按定时器
    if (s.longPressTimer) {
      clearTimeout(s.longPressTimer);
      s.longPressTimer = null;
    }

    if (s.isPinching) {
      s.isPinching = false;
      return;
    }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - s.startX;
    const dy = touch.clientY - s.startY;
    const duration = Date.now() - s.startTime;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // 滑动检测
    if ((absDx > cfg.swipeThreshold || absDy > cfg.swipeThreshold) && duration < 500) {
      if (absDx > absDy) {
        // 水平滑动
        if (dx > 0 && handlers.onSwipeRight) handlers.onSwipeRight();
        else if (dx < 0 && handlers.onSwipeLeft) handlers.onSwipeLeft();
      } else {
        // 垂直滑动
        if (dy > 0 && handlers.onSwipeDown) handlers.onSwipeDown();
        else if (dy < 0 && handlers.onSwipeUp) handlers.onSwipeUp();
      }
      return;
    }

    // 点击/双击检测
    if (absDx < 10 && absDy < 10 && duration < 300) {
      const now = Date.now();
      if (now - s.lastTapTime < cfg.doubleTapDelay) {
        // 双击
        if (handlers.onDoubleTap) handlers.onDoubleTap(e);
        s.lastTapTime = 0;
      } else {
        // 单击（延迟判断是否为双击）
        s.lastTapTime = now;
        setTimeout(() => {
          if (s.lastTapTime !== 0 && Date.now() - s.lastTapTime >= cfg.doubleTapDelay) {
            if (handlers.onTap) handlers.onTap(e);
            s.lastTapTime = 0;
          }
        }, cfg.doubleTapDelay);
      }
    }
  }, [handlers, cfg.swipeThreshold, cfg.doubleTapDelay]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);
}

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768)
  );
}

/**
 * 检测触摸支持
 */
export function hasTouchSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
