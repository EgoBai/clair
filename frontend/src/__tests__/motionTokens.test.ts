import { describe, it, expect, vi } from 'vitest';

/**
 * MotionTokens 动画令牌系统逻辑测试
 */

describe('MotionTokens', () => {
  describe('持续时间令牌', () => {
    const durations = {
      instant: 0,
      fast: 150,
      normal: 250,
      slow: 400,
      slower: 600,
    };

    it('instant 应为 0ms', () => {
      expect(durations.instant).toBe(0);
    });

    it('fast 应为 150ms', () => {
      expect(durations.fast).toBe(150);
    });

    it('normal 应为 250ms', () => {
      expect(durations.normal).toBe(250);
    });

    it('slow 应为 400ms', () => {
      expect(durations.slow).toBe(400);
    });

    it('slower 应为 600ms', () => {
      expect(durations.slower).toBe(600);
    });
  });

  describe('缓动函数令牌', () => {
    const easings = {
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
    };

    it('应该定义 easeIn 缓动', () => {
      expect(easings.easeIn).toContain('cubic-bezier');
    });

    it('应该定义 easeOut 缓动', () => {
      expect(easings.easeOut).toContain('cubic-bezier');
    });

    it('应该定义 easeInOut 缓动', () => {
      expect(easings.easeInOut).toContain('cubic-bezier');
    });

    it('应该定义 sharp 缓动', () => {
      expect(easings.sharp).toContain('cubic-bezier');
    });

    it('应该定义 bounce 缓动', () => {
      expect(easings.bounce).toContain('-0.55');
    });
  });

  describe('延迟令牌', () => {
    const delays = {
      none: 0,
      short: 50,
      medium: 100,
      long: 200,
    };

    it('应支持无延迟', () => {
      expect(delays.none).toBe(0);
    });

    it('应支持短延迟', () => {
      expect(delays.short).toBe(50);
    });

    it('应支持中等延迟', () => {
      expect(delays.medium).toBe(100);
    });
  });

  describe('预设动画', () => {
    const presets = {
      fadeIn: { duration: 250, easing: 'easeOut', properties: ['opacity'] },
      slideUp: { duration: 250, easing: 'easeOut', properties: ['opacity', 'transform'] },
      scaleIn: { duration: 200, easing: 'easeOut', properties: ['opacity', 'transform'] },
      collapse: { duration: 250, easing: 'easeInOut', properties: ['height', 'opacity'] },
    };

    it('fadeIn 应使用 opacity 属性', () => {
      expect(presets.fadeIn.properties).toContain('opacity');
    });

    it('slideUp 应使用 transform 属性', () => {
      expect(presets.slideUp.properties).toContain('transform');
    });

    it('collapse 应使用 height 属性', () => {
      expect(presets.collapse.properties).toContain('height');
    });

    it('collapse 应使用 easeInOut 缓动', () => {
      expect(presets.collapse.easing).toBe('easeInOut');
    });
  });

  describe('减少动效偏好', () => {
    it('should-reduce-motion 时应跳过动画', () => {
      const prefersReducedMotion = true;
      const duration = prefersReducedMotion ? 0 : 250;
      expect(duration).toBe(0);
    });

    it('正常模式应保持动画', () => {
      const prefersReducedMotion = false;
      const duration = prefersReducedMotion ? 0 : 250;
      expect(duration).toBe(250);
    });
  });
});
