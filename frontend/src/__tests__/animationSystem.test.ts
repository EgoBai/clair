import { describe, it, expect } from 'vitest';

// 动画系统引擎
interface AnimationConfig { duration: number; delay: number; easing: string; iterations: number; direction: 'normal' | 'reverse' | 'alternate' }
interface Keyframe { offset: number; properties: Record<string, number | string> }
interface Transition { property: string; duration: number; delay: number; easing: string }

class AnimationEngine {
  static easingFunctions: Record<string, (t: number) => number> = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => t * (2 - t),
    easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    bounce: (t) => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; },
    elastic: (t) => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1,
  };

  static interpolate(from: number, to: number, progress: number, easing: string = 'linear'): number {
    const easingFn = this.easingFunctions[easing] || this.easingFunctions.linear;
    const t = easingFn(Math.max(0, Math.min(1, progress)));
    return from + (to - from) * t;
  }

  static interpolateColor(from: string, to: string, progress: number): string {
    const parseHex = (hex: string) => {
      const h = hex.replace('#', '');
      return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
    };
    const f = parseHex(from), t = parseHex(to);
    const p = Math.max(0, Math.min(1, progress));
    const r = Math.round(f.r + (t.r - f.r) * p);
    const g = Math.round(f.g + (t.g - f.g) * p);
    const b = Math.round(f.b + (t.b - f.b) * p);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  static generateKeyframes(from: Record<string, number>, to: Record<string, number>, steps: number = 10): Keyframe[] {
    const keyframes: Keyframe[] = [];
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const props: Record<string, number> = {};
      for (const key of Object.keys(from)) {
        props[key] = from[key] + (to[key] - from[key]) * progress;
      }
      keyframes.push({ offset: progress, properties: props });
    }
    return keyframes;
  }

  static calcSpringPosition(target: number, current: number, velocity: number, stiffness: number = 0.1, damping: number = 0.8): { position: number; velocity: number } {
    const force = (target - current) * stiffness;
    const newVelocity = (velocity + force) * damping;
    return { position: current + newVelocity, velocity: newVelocity };
  }

  static createStaggerDelays(itemCount: number, baseDelay: number = 50, maxDelay: number = 500): number[] {
    const totalDelay = Math.min((itemCount - 1) * baseDelay, maxDelay);
    const step = itemCount > 1 ? totalDelay / (itemCount - 1) : 0;
    return Array.from({ length: itemCount }, (_, i) => i * step);
  }

  static calcParallaxOffset(scrollY: number, speed: number, offset: number = 0): number {
    return (scrollY - offset) * speed;
  }

  static createSequence(animations: { delay: number; duration: number }[]): { start: number; end: number; totalDuration: number } {
    let currentDelay = 0;
    let maxEnd = 0;
    for (const anim of animations) {
      const start = currentDelay + anim.delay;
      const end = start + anim.duration;
      maxEnd = Math.max(maxEnd, end);
      currentDelay = start;
    }
    return { start: 0, end: maxEnd, totalDuration: maxEnd };
  }

  static validateAnimationConfig(config: Partial<AnimationConfig>): string[] {
    const errors: string[] = [];
    if (config.duration !== undefined && config.duration < 0) errors.push('持续时间不能为负');
    if (config.delay !== undefined && config.delay < 0) errors.push('延迟不能为负');
    if (config.iterations !== undefined && config.iterations < 1 && config.iterations !== Infinity) errors.push('迭代次数至少为1');
    return errors;
  }
}

describe('动画系统引擎', () => {
  describe('缓动函数', () => {
    it('linear 应返回相同值', () => {
      expect(AnimationEngine.easingFunctions.linear(0.5)).toBe(0.5);
      expect(AnimationEngine.easingFunctions.linear(0)).toBe(0);
      expect(AnimationEngine.easingFunctions.linear(1)).toBe(1);
    });
    it('easeIn 应开始慢', () => {
      expect(AnimationEngine.easingFunctions.easeIn(0.5)).toBeLessThan(0.5);
    });
    it('easeOut 应结束慢', () => {
      expect(AnimationEngine.easingFunctions.easeOut(0.5)).toBeGreaterThan(0.5);
    });
    it('easeInOut 边界正确', () => {
      expect(AnimationEngine.easingFunctions.easeInOut(0)).toBe(0);
      expect(AnimationEngine.easingFunctions.easeInOut(1)).toBeCloseTo(1, 5);
    });
    it('bounce 应在范围内', () => {
      for (let t = 0; t <= 1; t += 0.1) {
        expect(AnimationEngine.easingFunctions.bounce(t)).toBeGreaterThanOrEqual(0);
        expect(AnimationEngine.easingFunctions.bounce(t)).toBeLessThanOrEqual(1.1);
      }
    });
    it('elastic 应在范围内', () => {
      expect(AnimationEngine.easingFunctions.elastic(0)).toBe(0);
      expect(AnimationEngine.easingFunctions.elastic(1)).toBe(1);
    });
  });

  describe('插值', () => {
    it('应该线性插值', () => {
      expect(AnimationEngine.interpolate(0, 100, 0.5)).toBe(50);
    });
    it('应该限制范围', () => {
      expect(AnimationEngine.interpolate(0, 100, -0.5)).toBe(0);
      expect(AnimationEngine.interpolate(0, 100, 1.5)).toBe(100);
    });
    it('应该应用缓动', () => {
      const val = AnimationEngine.interpolate(0, 100, 0.5, 'easeIn');
      expect(val).toBeLessThan(50);
    });
    it('未知缓动应降级到linear', () => {
      expect(AnimationEngine.interpolate(0, 100, 0.5, 'nonexistent')).toBe(50);
    });
    it('起点应为from', () => {
      expect(AnimationEngine.interpolate(10, 20, 0)).toBe(10);
    });
    it('终点应为to', () => {
      expect(AnimationEngine.interpolate(10, 20, 1)).toBe(20);
    });
  });

  describe('颜色插值', () => {
    it('应该插值颜色', () => {
      const color = AnimationEngine.interpolateColor('#000000', '#ffffff', 0.5);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
    it('起点颜色', () => {
      expect(AnimationEngine.interpolateColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });
    it('终点颜色', () => {
      expect(AnimationEngine.interpolateColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });
    it('中间色应混合', () => {
      const mid = AnimationEngine.interpolateColor('#000000', '#ffffff', 0.5);
      // R, G, B should all be ~128 = 0x80
      expect(mid).toBe('#808080');
    });
  });

  describe('关键帧生成', () => {
    it('应该生成关键帧', () => {
      const kf = AnimationEngine.generateKeyframes({ x: 0, y: 0 }, { x: 100, y: 200 }, 5);
      expect(kf).toHaveLength(6);
      expect(kf[0].properties.x).toBe(0);
      expect(kf[5].properties.x).toBe(100);
    });
    it('中间关键帧应线性插值', () => {
      const kf = AnimationEngine.generateKeyframes({ x: 0 }, { x: 100 }, 2);
      expect(kf[1].properties.x).toBe(50);
    });
    it('offset应递增', () => {
      const kf = AnimationEngine.generateKeyframes({ x: 0 }, { x: 100 }, 5);
      for (let i = 1; i < kf.length; i++) {
        expect(kf[i].offset).toBeGreaterThan(kf[i - 1].offset);
      }
    });
  });

  describe('弹簧动画', () => {
    it('应向目标移动', () => {
      const result = AnimationEngine.calcSpringPosition(100, 0, 0);
      expect(result.position).toBeGreaterThan(0);
    });
    it('到达目标时速度应趋近零', () => {
      let pos = 100, vel = 0;
      for (let i = 0; i < 100; i++) {
        const r = AnimationEngine.calcSpringPosition(100, pos, vel);
        pos = r.position; vel = r.velocity;
      }
      expect(Math.abs(pos - 100)).toBeLessThan(1);
      expect(Math.abs(vel)).toBeLessThan(1);
    });
    it('应产生振荡', () => {
      const positions: number[] = [];
      let pos = 0, vel = 0;
      for (let i = 0; i < 30; i++) {
        const r = AnimationEngine.calcSpringPosition(100, pos, vel, 0.1, 0.7);
        pos = r.position; vel = r.velocity;
        positions.push(pos);
      }
      // Should overshoot at some point
      expect(Math.max(...positions)).toBeGreaterThan(100);
    });
  });

  describe('交错延迟', () => {
    it('应生成递增延迟', () => {
      const delays = AnimationEngine.createStaggerDelays(5, 50);
      expect(delays).toHaveLength(5);
      expect(delays[0]).toBe(0);
      expect(delays[4]).toBeGreaterThan(delays[0]);
    });
    it('应受最大延迟限制', () => {
      const delays = AnimationEngine.createStaggerDelays(100, 50, 200);
      expect(Math.max(...delays)).toBeLessThanOrEqual(200);
    });
    it('单元素应为零延迟', () => {
      expect(AnimationEngine.createStaggerDelays(1)).toEqual([0]);
    });
    it('空数组返回空', () => {
      expect(AnimationEngine.createStaggerDelays(0)).toEqual([]);
    });
  });

  describe('视差偏移', () => {
    it('应计算偏移量', () => {
      expect(AnimationEngine.calcParallaxOffset(100, 0.5)).toBe(50);
    });
    it('应支持偏移基准', () => {
      expect(AnimationEngine.calcParallaxOffset(100, 0.5, 50)).toBe(25);
    });
    it('零速度应无偏移', () => {
      expect(AnimationEngine.calcParallaxOffset(100, 0)).toBe(0);
    });
  });

  describe('序列编排', () => {
    it('应计算总时长', () => {
      const seq = AnimationEngine.createSequence([
        { delay: 0, duration: 300 },
        { delay: 100, duration: 200 },
      ]);
      expect(seq.totalDuration).toBe(300);
    });
    it('空序列总时长为零', () => {
      expect(AnimationEngine.createSequence([]).totalDuration).toBe(0);
    });
    it('单动画应返回其持续时间', () => {
      expect(AnimationEngine.createSequence([{ delay: 50, duration: 300 }]).totalDuration).toBe(350);
    });
  });

  describe('配置验证', () => {
    it('有效配置应无错误', () => {
      expect(AnimationEngine.validateAnimationConfig({ duration: 300, delay: 0, iterations: 1 })).toHaveLength(0);
    });
    it('负持续时间应报错', () => {
      expect(AnimationEngine.validateAnimationConfig({ duration: -1 }).length).toBeGreaterThan(0);
    });
    it('负延迟应报错', () => {
      expect(AnimationEngine.validateAnimationConfig({ delay: -1 }).length).toBeGreaterThan(0);
    });
    it('零迭代应报错', () => {
      expect(AnimationEngine.validateAnimationConfig({ iterations: 0 }).length).toBeGreaterThan(0);
    });
    it('Infinity迭代应有效', () => {
      expect(AnimationEngine.validateAnimationConfig({ iterations: Infinity })).toHaveLength(0);
    });
  });
});
