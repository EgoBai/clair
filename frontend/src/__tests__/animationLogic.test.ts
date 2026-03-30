/**
 * 动画与过渡逻辑测试
 */
import { describe, it, expect } from 'vitest';

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, t));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeIn(t: number): number {
  return t * t * t;
}

function springAnimation(current: number, target: number, velocity: number, stiffness: number, damping: number, dt: number) {
  const force = -stiffness * (current - target);
  const dampingForce = -damping * velocity;
  const acceleration = force + dampingForce;
  const newVelocity = velocity + acceleration * dt;
  const newPosition = current + newVelocity * dt;
  return { position: newPosition, velocity: newVelocity };
}

function countUp(start: number, end: number, duration: number, elapsed: number): number {
  const progress = Math.min(elapsed / duration, 1);
  const easedProgress = easeOut(progress);
  return lerp(start, end, easedProgress);
}

function createKeyframeSequence(keyframes: { time: number; value: number }[]) {
  return (t: number): number => {
    if (keyframes.length === 0) return 0;
    if (t <= keyframes[0].time) return keyframes[0].value;
    if (t >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (t >= keyframes[i].time && t <= keyframes[i + 1].time) {
        const localT = (t - keyframes[i].time) / (keyframes[i + 1].time - keyframes[i].time);
        return lerp(keyframes[i].value, keyframes[i + 1].value, easeInOut(localT));
      }
    }
    return 0;
  };
}

function staggerDelay(index: number, baseDelay: number, staggerMs: number): number {
  return baseDelay + index * staggerMs;
}

describe('动画逻辑', () => {
  describe('线性插值', () => {
    it('t=0返回起始值', () => {
      expect(lerp(0, 100, 0)).toBe(0);
    });

    it('t=1返回结束值', () => {
      expect(lerp(0, 100, 1)).toBe(100);
    });

    it('t=0.5返回中点', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('t<0夹到0', () => {
      expect(lerp(0, 100, -1)).toBe(0);
    });

    it('t>1夹到1', () => {
      expect(lerp(0, 100, 2)).toBe(100);
    });

    it('负值范围', () => {
      expect(lerp(-50, 50, 0.5)).toBe(0);
    });
  });

  describe('缓动函数', () => {
    it('easeInOut(0)=0', () => {
      expect(easeInOut(0)).toBe(0);
    });

    it('easeInOut(1)=1', () => {
      expect(easeInOut(1)).toBe(1);
    });

    it('easeInOut(0.5)=0.5', () => {
      expect(easeInOut(0.5)).toBe(0.5);
    });

    it('easeOut(0)=0', () => {
      expect(easeOut(0)).toBe(0);
    });

    it('easeOut(1)=1', () => {
      expect(easeOut(1)).toBe(1);
    });

    it('easeIn(0)=0', () => {
      expect(easeIn(0)).toBe(0);
    });

    it('easeIn(1)=1', () => {
      expect(easeIn(1)).toBe(1);
    });
  });

  describe('弹簧动画', () => {
    it('在目标位置静止', () => {
      const result = springAnimation(100, 100, 0, 100, 10, 0.016);
      expect(result.position).toBeCloseTo(100, 0);
    });

    it('远离目标时向目标移动', () => {
      const result = springAnimation(0, 100, 0, 100, 10, 0.016);
      expect(result.position).toBeGreaterThan(0);
    });

    it('返回位置和速度', () => {
      const result = springAnimation(50, 100, 0, 100, 10, 0.016);
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('velocity');
    });
  });

  describe('数字跳动动画', () => {
    it('起始值', () => {
      expect(countUp(0, 100, 1000, 0)).toBe(0);
    });

    it('结束值', () => {
      expect(countUp(0, 100, 1000, 1000)).toBe(100);
    });

    it('中间值在范围内', () => {
      const val = countUp(0, 100, 1000, 500);
      expect(val).toBeGreaterThan(0);
      expect(val).toBeLessThan(100);
    });

    it('超时返回结束值', () => {
      expect(countUp(0, 100, 1000, 2000)).toBe(100);
    });
  });

  describe('关键帧序列', () => {
    it('在关键帧上返回精确值', () => {
      const fn = createKeyframeSequence([
        { time: 0, value: 0 },
        { time: 0.5, value: 100 },
        { time: 1, value: 0 },
      ]);
      expect(fn(0)).toBe(0);
      expect(fn(0.5)).toBe(100);
      expect(fn(1)).toBe(0);
    });

    it('关键帧之间插值', () => {
      const fn = createKeyframeSequence([
        { time: 0, value: 0 },
        { time: 1, value: 100 },
      ]);
      expect(fn(0.5)).toBeCloseTo(50, 0);
    });

    it('空关键帧返回0', () => {
      expect(createKeyframeSequence([])(0.5)).toBe(0);
    });

    it('超出范围使用边界值', () => {
      const fn = createKeyframeSequence([
        { time: 0, value: 10 },
        { time: 1, value: 20 },
      ]);
      expect(fn(-1)).toBe(10);
      expect(fn(2)).toBe(20);
    });
  });

  describe('交错延迟', () => {
    it('第一项基础延迟', () => {
      expect(staggerDelay(0, 100, 50)).toBe(100);
    });

    it('递增延迟', () => {
      expect(staggerDelay(1, 100, 50)).toBe(150);
      expect(staggerDelay(2, 100, 50)).toBe(200);
    });

    it('零基础延迟', () => {
      expect(staggerDelay(3, 0, 100)).toBe(300);
    });
  });
});
