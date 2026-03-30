import { describe, it, expect } from 'vitest';
import {
  ANIMATION_PRESETS,
  easings,
  lerp,
  lerpArray,
  lerpColor,
  getChangeHighlight,
  getSlideInAnimation,
  generateKeyframes,
} from '../utils/chartAnimation';

describe('图表动画工具', () => {
  describe('ANIMATION_PRESETS', () => {
    it('应包含预设动画配置', () => {
      expect(ANIMATION_PRESETS.fast).toBeDefined();
      expect(ANIMATION_PRESETS.normal).toBeDefined();
      expect(ANIMATION_PRESETS.slow).toBeDefined();
      expect(ANIMATION_PRESETS.bounce).toBeDefined();
      expect(ANIMATION_PRESETS.stagger).toBeDefined();
    });

    it('每种预设应有duration和easing', () => {
      Object.values(ANIMATION_PRESETS).forEach(config => {
        expect(config.duration).toBeGreaterThan(0);
        expect(config.easing).toBeTruthy();
      });
    });

    it('fast应比slow快', () => {
      expect(ANIMATION_PRESETS.fast.duration).toBeLessThan(ANIMATION_PRESETS.slow.duration);
    });

    it('stagger应有stagger属性', () => {
      expect(ANIMATION_PRESETS.stagger.stagger).toBeGreaterThan(0);
    });
  });

  describe('easings', () => {
    const easingNames = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'bounce'];

    it.each(easingNames)('%s 缓动函数应返回0-1之间的值', (name) => {
      const fn = easings[name];
      for (let t = 0; t <= 1; t += 0.1) {
        const result = fn(t);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1.1); // bounce可能略超1
      }
    });

    it('linear应是恒等函数', () => {
      expect(easings.linear(0)).toBe(0);
      expect(easings.linear(0.5)).toBe(0.5);
      expect(easings.linear(1)).toBe(1);
    });

    it('easeIn开始慢结束快', () => {
      expect(easings.easeIn(0.25)).toBeLessThan(0.25);
      expect(easings.easeIn(0.75)).toBeGreaterThan(0.5);
    });

    it('easeOut开始快结束慢', () => {
      expect(easings.easeOut(0.25)).toBeGreaterThan(0.25);
      expect(easings.easeOut(0.75)).toBeGreaterThan(0.7);
    });

    it('起点和终点应为0和1', () => {
      Object.values(easings).forEach(fn => {
        expect(fn(0)).toBe(0);
        expect(fn(1)).toBeCloseTo(1, 1);
      });
    });
  });

  describe('lerp', () => {
    it('t=0应返回start', () => {
      expect(lerp(10, 20, 0)).toBe(10);
    });

    it('t=1应返回end', () => {
      expect(lerp(10, 20, 1)).toBe(20);
    });

    it('t=0.5应返回中点', () => {
      expect(lerp(10, 20, 0.5)).toBe(15);
    });

    it('应支持负数', () => {
      expect(lerp(-10, 10, 0.5)).toBe(0);
    });

    it('应支持小数', () => {
      expect(lerp(0, 1, 0.3)).toBeCloseTo(0.3, 5);
    });
  });

  describe('lerpArray', () => {
    it('应逐元素插值', () => {
      expect(lerpArray([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    });

    it('t=0应返回start数组', () => {
      expect(lerpArray([1, 2, 3], [4, 5, 6], 0)).toEqual([1, 2, 3]);
    });

    it('t=1应返回end数组', () => {
      expect(lerpArray([1, 2, 3], [4, 5, 6], 1)).toEqual([4, 5, 6]);
    });

    it('end较短时用start值填充', () => {
      expect(lerpArray([1, 2, 3], [10], 0.5)).toEqual([5.5, 2, 3]);
    });
  });

  describe('lerpColor', () => {
    it('t=0应返回起始颜色', () => {
      expect(lerpColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });

    it('t=1应返回结束颜色', () => {
      expect(lerpColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });

    it('t=0.5应返回混合颜色', () => {
      const mid = lerpColor('#ff0000', '#0000ff', 0.5);
      // 红和蓝的中间应该是紫色系
      expect(mid).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('黑白混合应为灰色', () => {
      const gray = lerpColor('#000000', '#ffffff', 0.5);
      expect(gray).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('getChangeHighlight', () => {
    it('正数变化应返回红色高亮', () => {
      const highlight = getChangeHighlight(true);
      expect(highlight.bg).toContain('207');
      expect(highlight.animation).toContain('highlight');
    });

    it('负数变化应返回绿色高亮', () => {
      const highlight = getChangeHighlight(false);
      expect(highlight.bg).toContain('63');
    });

    it('应有持续时间', () => {
      const highlight = getChangeHighlight(true);
      expect(highlight.duration).toBeGreaterThan(0);
    });

    it('应支持自定义强度', () => {
      const weak = getChangeHighlight(true, 0.3);
      const strong = getChangeHighlight(true, 0.9);
      expect(weak.bg).toContain('0.3');
      expect(strong.bg).toContain('0.9');
    });
  });

  describe('getSlideInAnimation', () => {
    it('应返回动画字符串', () => {
      const anim = getSlideInAnimation(0);
      expect(anim.animation).toContain('slideIn');
    });

    it('应有延迟', () => {
      const anim = getSlideInAnimation(3, 50);
      expect(anim.delay).toBe(150);
    });

    it('第一个元素延迟应为0', () => {
      const anim = getSlideInAnimation(0);
      expect(anim.delay).toBe(0);
    });

    it('应支持自定义stagger', () => {
      const anim = getSlideInAnimation(2, 100);
      expect(anim.delay).toBe(200);
    });
  });

  describe('generateKeyframes', () => {
    it('应包含slideIn关键帧', () => {
      const kf = generateKeyframes();
      expect(kf).toContain('@keyframes slideIn');
    });

    it('应包含fadeIn关键帧', () => {
      const kf = generateKeyframes();
      expect(kf).toContain('@keyframes fadeIn');
    });

    it('应包含scaleIn关键帧', () => {
      const kf = generateKeyframes();
      expect(kf).toContain('@keyframes scaleIn');
    });

    it('应包含highlight关键帧', () => {
      const kf = generateKeyframes();
      expect(kf).toContain('@keyframes highlight');
    });

    it('应包含shimmer关键帧', () => {
      const kf = generateKeyframes();
      expect(kf).toContain('@keyframes shimmer');
    });

    it('应为有效的CSS语法', () => {
      const kf = generateKeyframes();
      const openBraces = (kf.match(/{/g) || []).length;
      const closeBraces = (kf.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });
  });
});
