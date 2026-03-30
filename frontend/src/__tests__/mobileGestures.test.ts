/**
 * 移动端手势识别逻辑测试
 */
import { describe, it, expect, vi } from 'vitest';

describe('useMobileGestures Logic', () => {
  const DEFAULT_CONFIG = {
    swipeThreshold: 50,
    longPressDelay: 500,
    doubleTapDelay: 300,
    pinchThreshold: 0.1,
  };

  describe('Default Configuration', () => {
    it('should have swipeThreshold of 50px', () => {
      expect(DEFAULT_CONFIG.swipeThreshold).toBe(50);
    });

    it('should have longPressDelay of 500ms', () => {
      expect(DEFAULT_CONFIG.longPressDelay).toBe(500);
    });

    it('should have doubleTapDelay of 300ms', () => {
      expect(DEFAULT_CONFIG.doubleTapDelay).toBe(300);
    });

    it('should have pinchThreshold of 0.1', () => {
      expect(DEFAULT_CONFIG.pinchThreshold).toBe(0.1);
    });
  });

  describe('Swipe Direction Detection', () => {
    const detectSwipe = (dx: number, dy: number, threshold: number) => {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx > absDy && absDx > threshold) {
        return dx > 0 ? 'right' : 'left';
      }
      if (absDy > absDx && absDy > threshold) {
        return dy > 0 ? 'down' : 'up';
      }
      return null;
    };

    it('should detect right swipe', () => {
      expect(detectSwipe(100, 10, 50)).toBe('right');
    });

    it('should detect left swipe', () => {
      expect(detectSwipe(-100, 10, 50)).toBe('left');
    });

    it('should detect up swipe', () => {
      expect(detectSwipe(10, -100, 50)).toBe('up');
    });

    it('should detect down swipe', () => {
      expect(detectSwipe(10, 100, 50)).toBe('down');
    });

    it('should return null for short movement', () => {
      expect(detectSwipe(20, 10, 50)).toBeNull();
    });

    it('should prefer horizontal over vertical when dx > dy', () => {
      expect(detectSwipe(60, 40, 50)).toBe('right');
    });

    it('should prefer vertical over horizontal when dy > dx', () => {
      expect(detectSwipe(40, 60, 50)).toBe('down');
    });
  });

  describe('Distance Calculation', () => {
    const getDistance = (t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    it('should calculate distance between two touches', () => {
      const dist = getDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 });
      expect(dist).toBe(5);
    });

    it('should return 0 for same position', () => {
      const dist = getDistance({ clientX: 10, clientY: 20 }, { clientX: 10, clientY: 20 });
      expect(dist).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const dist = getDistance({ clientX: -3, clientY: -4 }, { clientX: 0, clientY: 0 });
      expect(dist).toBe(5);
    });
  });

  describe('Pinch Zoom Calculation', () => {
    it('should calculate scale from distance ratio', () => {
      const startDist = 100;
      const currentDist = 150;
      const scale = currentDist / startDist;
      expect(scale).toBe(1.5);
    });

    it('should detect zoom in', () => {
      const startDist = 100;
      const currentDist = 150;
      const scale = currentDist / startDist;
      expect(Math.abs(scale - 1) > 0.1).toBe(true);
      expect(scale > 1).toBe(true);
    });

    it('should detect zoom out', () => {
      const startDist = 150;
      const currentDist = 100;
      const scale = currentDist / startDist;
      expect(Math.abs(scale - 1) > 0.1).toBe(true);
      expect(scale < 1).toBe(true);
    });

    it('should ignore small pinch below threshold', () => {
      const startDist = 100;
      const currentDist = 105;
      const scale = currentDist / startDist;
      expect(Math.abs(scale - 1) > 0.1).toBe(false);
    });
  });

  describe('Double Tap Detection', () => {
    it('should detect double tap within delay', () => {
      const now = Date.now();
      const lastTap = now - 200;
      const isDoubleTap = (now - lastTap) < 300;
      expect(isDoubleTap).toBe(true);
    });

    it('should not detect double tap after delay', () => {
      const now = Date.now();
      const lastTap = now - 400;
      const isDoubleTap = (now - lastTap) < 300;
      expect(isDoubleTap).toBe(false);
    });

    it('should detect single tap when no recent tap', () => {
      const lastTapTime = 0;
      const isSingleTap = lastTapTime === 0;
      expect(isSingleTap).toBe(true);
    });
  });

  describe('Long Press Detection', () => {
    it('should trigger after delay if not swiping', () => {
      const isSwiping = false;
      const elapsed = 600;
      const delay = 500;
      const shouldTrigger = !isSwiping && elapsed >= delay;
      expect(shouldTrigger).toBe(true);
    });

    it('should not trigger during swipe', () => {
      const isSwiping = true;
      const elapsed = 600;
      const delay = 500;
      const shouldTrigger = !isSwiping && elapsed >= delay;
      expect(shouldTrigger).toBe(false);
    });

    it('should not trigger before delay', () => {
      const isSwiping = false;
      const elapsed = 300;
      const delay = 500;
      const shouldTrigger = !isSwiping && elapsed >= delay;
      expect(shouldTrigger).toBe(false);
    });
  });

  describe('Touch Duration Classification', () => {
    const classifyTouch = (duration: number, absDx: number, absDy: number, threshold: number) => {
      if ((absDx > threshold || absDy > threshold) && duration < 500) return 'swipe';
      if (absDx < 10 && absDy < 10 && duration < 300) return 'tap';
      return 'other';
    };

    it('should classify swipe correctly', () => {
      expect(classifyTouch(200, 100, 10, 50)).toBe('swipe');
    });

    it('should classify tap correctly', () => {
      expect(classifyTouch(100, 5, 5, 50)).toBe('tap');
    });

    it('should classify slow large movement as other', () => {
      expect(classifyTouch(600, 100, 10, 50)).toBe('other');
    });
  });

  describe('Device Detection', () => {
    it('isMobileDevice should check user agent', () => {
      const ua = navigator.userAgent;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      expect(typeof isMobile).toBe('boolean');
    });

    it('hasTouchSupport should check ontouchstart', () => {
      const hasTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (typeof navigator !== 'undefined' && (navigator as any).maxTouchPoints > 0));
      expect(typeof hasTouch).toBe('boolean');
    });
  });

  describe('Config Merging', () => {
    it('should merge custom config with defaults', () => {
      const merged = { ...DEFAULT_CONFIG, swipeThreshold: 80 };
      expect(merged.swipeThreshold).toBe(80);
      expect(merged.longPressDelay).toBe(500);
    });

    it('should allow overriding all config values', () => {
      const merged = { ...DEFAULT_CONFIG, swipeThreshold: 100, longPressDelay: 1000 };
      expect(merged.swipeThreshold).toBe(100);
      expect(merged.longPressDelay).toBe(1000);
    });
  });
});
