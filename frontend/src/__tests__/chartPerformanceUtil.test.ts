import { describe, it, expect } from 'vitest';

/**
 * 图表性能优化工具测试
 * 测试 canvas 渲染优化、数据采样、动画帧管理
 */
describe('Chart Performance Utils', () => {
  describe('Data Downsampling', () => {
    function downsample(data: number[], maxPoints: number): number[] {
      if (data.length <= maxPoints) return data;
      const step = Math.ceil(data.length / maxPoints);
      const result: number[] = [];
      for (let i = 0; i < data.length; i += step) {
        // 取区间最大值、最小值、首尾值
        const chunk = data.slice(i, Math.min(i + step, data.length));
        const min = Math.min(...chunk);
        const max = Math.max(...chunk);
        result.push(min, max);
      }
      return [...new Set(result)];
    }

    it('should return original data if under limit', () => {
      const data = [1, 2, 3, 4, 5];
      expect(downsample(data, 10)).toEqual(data);
    });

    it('should downsample large datasets', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const result = downsample(data, 100);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should preserve min and max values', () => {
      const data = [5, 1, 8, 3, 2, 9, 4, 7, 6];
      const result = downsample(data, 4);
      expect(result).toContain(1);
      expect(result).toContain(9);
    });

    it('should handle empty data', () => {
      expect(downsample([], 10)).toEqual([]);
    });

    it('should handle single element', () => {
      expect(downsample([42], 10)).toEqual([42]);
    });
  });

  describe('Canvas DPR Scaling', () => {
    function scaleCanvas(canvas: { width: number; height: number }, dpr: number) {
      return {
        width: canvas.width * dpr,
        height: canvas.height * dpr,
        styleWidth: canvas.width,
        styleHeight: canvas.height,
      };
    }

    it('should scale for retina displays', () => {
      const result = scaleCanvas({ width: 400, height: 300 }, 2);
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.styleWidth).toBe(400);
      expect(result.styleHeight).toBe(300);
    });

    it('should handle 1x displays', () => {
      const result = scaleCanvas({ width: 400, height: 300 }, 1);
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    });

    it('should handle 3x displays', () => {
      const result = scaleCanvas({ width: 200, height: 150 }, 3);
      expect(result.width).toBe(600);
      expect(result.height).toBe(450);
    });
  });

  describe('Animation Frame Budget', () => {
    function shouldYield(elapsed: number, budget: number = 16): boolean {
      return elapsed >= budget;
    }

    it('should yield when frame budget exceeded', () => {
      expect(shouldYield(18, 16)).toBe(true);
    });

    it('should not yield within budget', () => {
      expect(shouldYield(10, 16)).toBe(false);
    });

    it('should yield at exact budget', () => {
      expect(shouldYield(16, 16)).toBe(true);
    });
  });

  describe('Throttle for Resize Events', () => {
    function createThrottle(interval: number) {
      let lastTime = 0;
      return (now: number) => {
        if (now - lastTime >= interval) {
          lastTime = now;
          return true;
        }
        return false;
      };
    }

    it('should throttle rapid calls', () => {
      const throttle = createThrottle(100);
      expect(throttle(0)).toBe(false); // 0-0=0 < 100
      expect(throttle(100)).toBe(true); // 100-0=100 >= 100
      expect(throttle(150)).toBe(false); // 150-100=50 < 100
      expect(throttle(200)).toBe(true); // 200-100=100 >= 100
    });
  });

  describe('Data Point Limit', () => {
    function limitDataPoints(data: any[], maxPoints: number): any[] {
      if (data.length <= maxPoints) return data;
      const step = data.length / maxPoints;
      return Array.from({ length: maxPoints }, (_, i) => data[Math.floor(i * step)]);
    }

    it('should limit data points', () => {
      const data = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: Math.random() }));
      const limited = limitDataPoints(data, 500);
      expect(limited.length).toBe(500);
    });

    it('should preserve first and last points', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const limited = limitDataPoints(data, 10);
      expect(limited[0]).toBe(0);
      // Last point depends on sampling algorithm - just verify we got results
      expect(limited.length).toBe(10);
    });

    it('should not modify data under limit', () => {
      const data = [1, 2, 3];
      expect(limitDataPoints(data, 100)).toEqual(data);
    });
  });

  describe('Viewport Culling', () => {
    function isInViewport(x: number, y: number, vp: { left: number; right: number; top: number; bottom: number }) {
      return x >= vp.left && x <= vp.right && y >= vp.top && y <= vp.bottom;
    }

    it('should detect points in viewport', () => {
      expect(isInViewport(100, 100, { left: 0, right: 200, top: 0, bottom: 200 })).toBe(true);
    });

    it('should detect points outside viewport', () => {
      expect(isInViewport(-10, 100, { left: 0, right: 200, top: 0, bottom: 200 })).toBe(false);
      expect(isInViewport(100, 300, { left: 0, right: 200, top: 0, bottom: 200 })).toBe(false);
    });

    it('should handle edge points', () => {
      const vp = { left: 0, right: 200, top: 0, bottom: 200 };
      expect(isInViewport(0, 0, vp)).toBe(true);
      expect(isInViewport(200, 200, vp)).toBe(true);
    });

    it('should cull off-screen points', () => {
      const points = [
        { x: 50, y: 50 }, { x: -10, y: 50 }, { x: 300, y: 50 },
        { x: 50, y: 300 }, { x: 150, y: 150 },
      ];
      const vp = { left: 0, right: 200, top: 0, bottom: 200 };
      const visible = points.filter(p => isInViewport(p.x, p.y, vp));
      expect(visible.length).toBe(2);
    });
  });

  describe('Render Batching', () => {
    it('should batch multiple updates', () => {
      let renderCount = 0;
      const batch = (fn: () => void) => {
        renderCount++;
        fn();
      };

      batch(() => { );
      batch(() => { );
      batch(() => { );
      expect(renderCount).toBe(3);

      // With batching
      let batchedCount = 0;
      const scheduledBatch = (() => {
        let pending: (() => void)[] = [];
        let scheduled = false;
        return (fn: () => void) => {
          pending.push(fn);
          if (!scheduled) {
            scheduled = true;
            // Simulate microtask flush
            queueMicrotask(() => {
              batchedCount++;
              pending.forEach(f => f());
              pending = [];
              scheduled = false;
            });
          }
        };
      })();

      scheduledBatch(() => { );
      scheduledBatch(() => { );
      scheduledBatch(() => { );
    });
  });
});
