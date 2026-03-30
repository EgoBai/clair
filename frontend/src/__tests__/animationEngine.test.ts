import { describe, it, expect } from 'vitest';

// Animation & Transition Engine
interface Keyframe {
  offset: number; // 0-1
  properties: Record<string, number>;
}

interface AnimationConfig {
  duration: number;
  easing: string;
  delay: number;
  iterations: number;
  direction: 'normal' | 'reverse' | 'alternate';
  fillMode: 'none' | 'forwards' | 'backwards' | 'both';
}

const easings: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  bounce: (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  elastic: (t) => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1,
  spring: (t) => 1 - Math.cos(t * Math.PI * 2.5) * Math.exp(-t * 6),
};

function interpolateKeyframes(keyframes: Keyframe[], progress: number): Record<string, number> {
  if (keyframes.length === 0) return {};
  if (keyframes.length === 1) return { ...keyframes[0].properties };
  
  const sorted = [...keyframes].sort((a, b) => a.offset - b.offset);
  if (progress <= sorted[0].offset) return { ...sorted[0].properties };
  if (progress >= sorted[sorted.length - 1].offset) return { ...sorted[sorted.length - 1].properties };
  
  let prev = sorted[0], next = sorted[1];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].offset >= progress) { next = sorted[i]; prev = sorted[i - 1]; break; }
  }
  
  const localProgress = (progress - prev.offset) / (next.offset - prev.offset);
  const result: Record<string, number> = {};
  const allKeys = new Set([...Object.keys(prev.properties), ...Object.keys(next.properties)]);
  for (const key of allKeys) {
    const from = prev.properties[key] ?? 0;
    const to = next.properties[key] ?? 0;
    result[key] = from + (to - from) * localProgress;
  }
  return result;
}

function calculateAnimationProgress(config: AnimationConfig, elapsed: number): number {
  const totalDelay = config.delay;
  if (elapsed < totalDelay) return 0;
  
  const activeTime = elapsed - totalDelay;
  const cycleDuration = config.duration;
  if (cycleDuration <= 0) return 1;
  
  let cycle = activeTime / cycleDuration;
  if (config.iterations > 0 && cycle >= config.iterations) cycle = config.iterations - 0.001;
  
  let progress = cycle % 1;
  if (config.direction === 'reverse') progress = 1 - progress;
  else if (config.direction === 'alternate') {
    const cycleNum = Math.floor(cycle);
    if (cycleNum % 2 === 1) progress = 1 - progress;
  }
  
  const easingFn = easings[config.easing] || easings.linear;
  return easingFn(Math.min(1, Math.max(0, progress)));
}

function generateTransitionCSS(
  properties: string[],
  duration: number,
  easing: string,
  delay: number = 0
): string {
  return properties.map(p => `${p} ${duration}ms ${easing} ${delay}ms`).join(', ');
}

function calculateStaggerDelay(index: number, baseDelay: number, staggerMs: number): number {
  return baseDelay + index * staggerMs;
}

function chainAnimations(configs: AnimationConfig[]): { startTimes: number[]; totalDuration: number } {
  let current = 0;
  const startTimes: number[] = [];
  for (const config of configs) {
    startTimes.push(current + config.delay);
    current += config.delay + config.duration * config.iterations;
  }
  return { startTimes, totalDuration: current };
}

describe('Animation & Transition Engine', () => {
  describe('Easing Functions', () => {
    it('linear should return t directly', () => {
      expect(easings.linear(0)).toBe(0);
      expect(easings.linear(0.5)).toBe(0.5);
      expect(easings.linear(1)).toBe(1);
    });

    it('easeIn should start slow', () => {
      expect(easings.easeIn(0.25)).toBeLessThan(0.25);
      expect(easings.easeIn(0)).toBe(0);
      expect(easings.easeIn(1)).toBe(1);
    });

    it('easeOut should end slow', () => {
      expect(easings.easeOut(0.75)).toBeGreaterThan(0.75);
      expect(easings.easeOut(0)).toBe(0);
      expect(easings.easeOut(1)).toBe(1);
    });

    it('easeInOut should be symmetric', () => {
      expect(easings.easeInOut(0)).toBe(0);
      expect(easings.easeInOut(1)).toBe(1);
      expect(easings.easeInOut(0.5)).toBeCloseTo(0.5, 1);
    });

    it('bounce should start and end at correct values', () => {
      expect(easings.bounce(0)).toBe(0);
      expect(easings.bounce(1)).toBeCloseTo(1, 2);
    });

    it('all easing functions should map 0→0 and 1→1', () => {
      for (const [name, fn] of Object.entries(easings)) {
        expect(fn(0)).toBeCloseTo(0, 5);
        expect(fn(1)).toBeCloseTo(1, 2);
      }
    });
  });

  describe('Keyframe Interpolation', () => {
    it('should return first keyframe at start', () => {
      const kfs: Keyframe[] = [
        { offset: 0, properties: { x: 0 } },
        { offset: 1, properties: { x: 100 } }
      ];
      expect(interpolateKeyframes(kfs, 0)).toEqual({ x: 0 });
    });

    it('should return last keyframe at end', () => {
      const kfs: Keyframe[] = [
        { offset: 0, properties: { x: 0 } },
        { offset: 1, properties: { x: 100 } }
      ];
      expect(interpolateKeyframes(kfs, 1)).toEqual({ x: 100 });
    });

    it('should interpolate midpoint', () => {
      const kfs: Keyframe[] = [
        { offset: 0, properties: { x: 0 } },
        { offset: 1, properties: { x: 100 } }
      ];
      expect(interpolateKeyframes(kfs, 0.5)).toEqual({ x: 50 });
    });

    it('should handle multiple properties', () => {
      const kfs: Keyframe[] = [
        { offset: 0, properties: { x: 0, y: 0, opacity: 0 } },
        { offset: 1, properties: { x: 100, y: 50, opacity: 1 } }
      ];
      const result = interpolateKeyframes(kfs, 0.5);
      expect(result.x).toBe(50);
      expect(result.y).toBe(25);
      expect(result.opacity).toBe(0.5);
    });

    it('should handle empty keyframes', () => {
      expect(interpolateKeyframes([], 0.5)).toEqual({});
    });

    it('should handle single keyframe', () => {
      const result = interpolateKeyframes([{ offset: 0.5, properties: { x: 42 } }], 0.5);
      expect(result.x).toBe(42);
    });

    it('should clamp progress before first keyframe', () => {
      const kfs: Keyframe[] = [
        { offset: 0.2, properties: { x: 20 } },
        { offset: 1, properties: { x: 100 } }
      ];
      expect(interpolateKeyframes(kfs, 0)).toEqual({ x: 20 });
    });

    it('should clamp progress after last keyframe', () => {
      const kfs: Keyframe[] = [
        { offset: 0, properties: { x: 0 } },
        { offset: 0.8, properties: { x: 80 } }
      ];
      expect(interpolateKeyframes(kfs, 1)).toEqual({ x: 80 });
    });

    it('should handle unsorted keyframes', () => {
      const kfs: Keyframe[] = [
        { offset: 1, properties: { x: 100 } },
        { offset: 0, properties: { x: 0 } }
      ];
      expect(interpolateKeyframes(kfs, 0.5)).toEqual({ x: 50 });
    });
  });

  describe('Animation Progress', () => {
    const config: AnimationConfig = { duration: 1000, easing: 'linear', delay: 0, iterations: 1, direction: 'normal', fillMode: 'none' };

    it('should return 0 before delay', () => {
      expect(calculateAnimationProgress({ ...config, delay: 500 }, 200)).toBe(0);
    });

    it('should return easing(progress) during animation', () => {
      expect(calculateAnimationProgress(config, 500)).toBeCloseTo(0.5, 1);
    });

    it('should return ~1 at end', () => {
      expect(calculateAnimationProgress(config, 1000)).toBeCloseTo(1, 1);
    });

    it('should handle reverse direction', () => {
      const reversed = { ...config, direction: 'reverse' as const };
      expect(calculateAnimationProgress(reversed, 250)).toBeCloseTo(0.75, 1);
    });

    it('should handle alternate direction on even cycles', () => {
      const alt = { ...config, direction: 'alternate' as const, iterations: 2 };
      // First cycle (0-1000ms): forward
      expect(calculateAnimationProgress(alt, 500)).toBeCloseTo(0.5, 1);
      // Second cycle (1000-2000ms): reverse
      expect(calculateAnimationProgress(alt, 1500)).toBeCloseTo(0.5, 1);
    });

    it('should cap at iterations', () => {
      const limited = { ...config, iterations: 2 };
      // At 3000ms with duration 1000 and 2 iterations, cycle=3 which >= 2, so clamped to 1.999 → progress 0.999
      const progress = calculateAnimationProgress(limited, 3000);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    });

    it('should apply easing function', () => {
      const eased = { ...config, easing: 'easeIn' };
      expect(calculateAnimationProgress(eased, 500)).toBeLessThan(0.5); // easeIn slower at start
    });
  });

  describe('CSS Transition Generation', () => {
    it('should generate basic transition', () => {
      const css = generateTransitionCSS(['opacity'], 300, 'ease');
      expect(css).toBe('opacity 300ms ease 0ms');
    });

    it('should handle multiple properties', () => {
      const css = generateTransitionCSS(['opacity', 'transform'], 300, 'ease-in-out');
      expect(css).toContain('opacity');
      expect(css).toContain('transform');
    });

    it('should include delay', () => {
      const css = generateTransitionCSS(['opacity'], 300, 'ease', 100);
      expect(css).toContain('100ms');
    });
  });

  describe('Stagger Delay', () => {
    it('should calculate staggered delays', () => {
      expect(calculateStaggerDelay(0, 0, 50)).toBe(0);
      expect(calculateStaggerDelay(1, 0, 50)).toBe(50);
      expect(calculateStaggerDelay(2, 0, 50)).toBe(100);
    });

    it('should include base delay', () => {
      expect(calculateStaggerDelay(0, 100, 50)).toBe(100);
      expect(calculateStaggerDelay(2, 100, 50)).toBe(200);
    });
  });

  describe('Animation Chaining', () => {
    it('should calculate sequential start times', () => {
      const configs: AnimationConfig[] = [
        { duration: 1000, easing: 'linear', delay: 0, iterations: 1, direction: 'normal', fillMode: 'none' },
        { duration: 500, easing: 'linear', delay: 100, iterations: 1, direction: 'normal', fillMode: 'none' },
      ];
      const result = chainAnimations(configs);
      expect(result.startTimes[0]).toBe(0);
      expect(result.startTimes[1]).toBe(1100);
      expect(result.totalDuration).toBe(1600);
    });

    it('should handle empty config array', () => {
      expect(chainAnimations([])).toEqual({ startTimes: [], totalDuration: 0 });
    });

    it('should handle single animation', () => {
      const config: AnimationConfig = { duration: 500, easing: 'linear', delay: 0, iterations: 1, direction: 'normal', fillMode: 'none' };
      const result = chainAnimations([config]);
      expect(result.startTimes).toHaveLength(1);
      expect(result.totalDuration).toBe(500);
    });
  });
});
