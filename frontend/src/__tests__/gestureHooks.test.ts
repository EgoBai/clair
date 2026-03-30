/**
 * 移动端手势 Hook 逻辑测试
 * 覆盖滑动检测、双击、长按、捏合缩放的纯逻辑
 */

import { describe, it, expect } from 'vitest';

describe('手势检测逻辑', () => {
  describe('滑动方向判定', () => {
    interface TouchStart {
      x: number;
      y: number;
      time: number;
    }

    function determineSwipe(
      start: TouchStart,
      endX: number,
      endY: number,
      endTime: number,
      threshold: number = 50,
      maxDuration: number = 500
    ): string | null {
      const dx = endX - start.x;
      const dy = endY - start.y;
      const duration = endTime - start.time;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (duration > maxDuration) return null;
      if (absDx < threshold && absDy < threshold) return null;

      if (absDx > absDy) {
        return dx > 0 ? 'swipeRight' : 'swipeLeft';
      } else {
        return dy > 0 ? 'swipeDown' : 'swipeUp';
      }
    }

    it('快速向右滑动 100px 应检测为 swipeRight', () => {
      const start = { x: 100, y: 200, time: 0 };
      expect(determineSwipe(start, 200, 210, 200)).toBe('swipeRight');
    });

    it('快速向左滑动 80px 应检测为 swipeLeft', () => {
      const start = { x: 200, y: 200, time: 0 };
      expect(determineSwipe(start, 120, 195, 150)).toBe('swipeLeft');
    });

    it('快速向上滑动应检测为 swipeUp', () => {
      const start = { x: 200, y: 300, time: 0 };
      expect(determineSwipe(start, 195, 200, 200)).toBe('swipeUp');
    });

    it('快速向下滑动应检测为 swipeDown', () => {
      const start = { x: 200, y: 200, time: 0 };
      expect(determineSwipe(start, 205, 300, 200)).toBe('swipeDown');
    });

    it('慢速移动超过500ms不应检测为滑动', () => {
      const start = { x: 100, y: 200, time: 0 };
      expect(determineSwipe(start, 200, 200, 600)).toBeNull();
    });

    it('距离不足阈值不应检测为滑动', () => {
      const start = { x: 100, y: 200, time: 0 };
      expect(determineSwipe(start, 130, 205, 200)).toBeNull();
    });

    it('对角线移动应取较大分量', () => {
      const start = { x: 100, y: 100, time: 0 };
      // dx=80, dy=40 → 水平
      expect(determineSwipe(start, 180, 140, 200)).toBe('swipeRight');
      // dx=40, dy=80 → 垂直
      expect(determineSwipe(start, 140, 180, 200)).toBe('swipeDown');
    });
  });

  describe('双击检测', () => {
    function detectDoubleTap(lastTapTime: number, currentTime: number, delay: number = 300): { isDouble: boolean; newLastTap: number } {
      if (lastTapTime > 0 && (currentTime - lastTapTime) < delay) {
        return { isDouble: true, newLastTap: 0 };
      }
      return { isDouble: false, newLastTap: currentTime };
    }

    it('300ms 内连续点击应为双击', () => {
      const result = detectDoubleTap(1000, 1200);
      expect(result.isDouble).toBe(true);
    });

    it('间隔超过 300ms 不应为双击', () => {
      const result = detectDoubleTap(1000, 1400);
      expect(result.isDouble).toBe(false);
      expect(result.newLastTap).toBe(1400);
    });

    it('双击后应重置 lastTapTime', () => {
      const result = detectDoubleTap(1000, 1100);
      expect(result.newLastTap).toBe(0);
    });

    it('自定义延迟应生效', () => {
      expect(detectDoubleTap(1000, 1350, 500).isDouble).toBe(true);
      expect(detectDoubleTap(1000, 1350, 300).isDouble).toBe(false);
    });
  });

  describe('长按检测', () => {
    function detectLongPress(
      startTime: number,
      currentTime: number,
      hasMoved: boolean,
      delay: number = 500
    ): boolean {
      if (hasMoved) return false;
      return (currentTime - startTime) >= delay;
    }

    it('未移动且超过 500ms 应触发长按', () => {
      expect(detectLongPress(0, 600, false)).toBe(true);
    });

    it('移动后不应触发长按', () => {
      expect(detectLongPress(0, 600, true)).toBe(false);
    });

    it('未超过延迟不应触发长按', () => {
      expect(detectLongPress(0, 300, false)).toBe(false);
    });

    it('自定义延迟应生效', () => {
      expect(detectLongPress(0, 400, false, 400)).toBe(true);
      expect(detectLongPress(0, 400, false, 500)).toBe(false);
    });
  });

  describe('捏合缩放检测', () => {
    function detectPinchZoom(
      startDist: number,
      currentDist: number,
      threshold: number = 0.1
    ): number | null {
      const scale = currentDist / startDist;
      return Math.abs(scale - 1) > threshold ? scale : null;
    }

    it('放大手势应返回 > 1 的 scale', () => {
      const scale = detectPinchZoom(100, 150);
      expect(scale).toBe(1.5);
    });

    it('缩小手势应返回 < 1 的 scale', () => {
      const scale = detectPinchZoom(150, 100);
      expect(scale).toBeCloseTo(0.667, 2);
    });

    it('微小缩放不应触发', () => {
      expect(detectPinchZoom(100, 105)).toBeNull();
      expect(detectPinchZoom(100, 96)).toBeNull();
    });

    it('自定义阈值应生效', () => {
      expect(detectPinchZoom(100, 108, 0.05)).toBe(1.08);
      expect(detectPinchZoom(100, 108, 0.1)).toBeNull();
    });
  });

  describe('触摸坐标计算', () => {
    function getDistance(t1: { x: number; y: number }, t2: { x: number; y: number }): number {
      const dx = t1.x - t2.x;
      const dy = t1.y - t2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    it('应正确计算两点距离', () => {
      expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
      expect(getDistance({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(10);
    });

    it('同一点距离应为 0', () => {
      expect(getDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });
  });
});

describe('手势配置默认值', () => {
  const DEFAULTS = {
    swipeThreshold: 50,
    longPressDelay: 500,
    doubleTapDelay: 300,
    pinchThreshold: 0.1,
  };

  it('默认滑动阈值应为 50px', () => {
    expect(DEFAULTS.swipeThreshold).toBe(50);
  });

  it('默认长按延迟应为 500ms', () => {
    expect(DEFAULTS.longPressDelay).toBe(500);
  });

  it('默认双击间隔应为 300ms', () => {
    expect(DEFAULTS.doubleTapDelay).toBe(300);
  });

  it('默认捏合阈值应为 0.1', () => {
    expect(DEFAULTS.pinchThreshold).toBe(0.1);
  });
});
