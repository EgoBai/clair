/**
 * 页面转场动画系统测试
 * 覆盖转场类型、CSS生成(Tailwind)、配置预设、类型安全
 */

import { describe, it, expect } from 'vitest';
import {
  TRANSITION_PRESETS,
  getTransitionCSS,
  type TransitionType,
  type TransitionConfig,
} from '../utils/pageTransitions';

// ==================== 转场预设 ====================

describe('TRANSITION_PRESETS', () => {
  it('应包含所有预设类型', () => {
    const expectedPresets = ['default', 'page', 'modal', 'drawer', 'dropdown', 'instant'];
    for (const name of expectedPresets) {
      expect(TRANSITION_PRESETS).toHaveProperty(name);
    }
  });

  it('每个预设应有完整配置', () => {
    for (const [, config] of Object.entries(TRANSITION_PRESETS)) {
      expect(config).toHaveProperty('type');
      expect(config).toHaveProperty('duration');
      expect(config).toHaveProperty('easing');
      expect(config.duration).toBeGreaterThanOrEqual(0);
      expect(config.easing).toBeTruthy();
    }
  });

  it('default 预设应为 fade 类型', () => {
    expect(TRANSITION_PRESETS.default.type).toBe('fade');
  });

  it('page 预设应为 slide-left 类型', () => {
    expect(TRANSITION_PRESETS.page.type).toBe('slide-left');
  });

  it('modal 预设应为 scale-up 类型', () => {
    expect(TRANSITION_PRESETS.modal.type).toBe('scale-up');
  });

  it('drawer 预设应为 slide-right 类型', () => {
    expect(TRANSITION_PRESETS.drawer.type).toBe('slide-right');
  });

  it('dropdown 预设应为 slide-down 类型', () => {
    expect(TRANSITION_PRESETS.dropdown.type).toBe('slide-down');
  });

  it('instant 预设应为 none 类型且duration为0', () => {
    expect(TRANSITION_PRESETS.instant.type).toBe('none');
    expect(TRANSITION_PRESETS.instant.duration).toBe(0);
  });

  it('default 预设duration应为200ms', () => {
    expect(TRANSITION_PRESETS.default.duration).toBe(200);
  });

  it('modal 预设duration应为200ms', () => {
    expect(TRANSITION_PRESETS.modal.duration).toBe(200);
  });

  it('dropdown 预设duration应为150ms', () => {
    expect(TRANSITION_PRESETS.dropdown.duration).toBe(150);
  });

  it('drawer 预设duration应为300ms', () => {
    expect(TRANSITION_PRESETS.drawer.duration).toBe(300);
  });

  it('page 预设duration应为250ms', () => {
    expect(TRANSITION_PRESETS.page.duration).toBe(250);
  });
});

// ==================== CSS生成 (Tailwind) ====================

describe('getTransitionCSS', () => {
  it('应返回enter/enterActive/exit/exitActive四个属性', () => {
    const config: TransitionConfig = { type: 'fade', duration: 200, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css).toHaveProperty('enter');
    expect(css).toHaveProperty('enterActive');
    expect(css).toHaveProperty('exit');
    expect(css).toHaveProperty('exitActive');
  });

  it('fade类型应生成opacity相关CSS', () => {
    const config: TransitionConfig = { type: 'fade', duration: 300, easing: 'ease-in-out' };
    const css = getTransitionCSS(config);
    expect(css.enter).toContain('opacity');
    expect(css.exit).toContain('opacity');
  });

  it('fade应使用transition-[opacity]', () => {
    const config: TransitionConfig = { type: 'fade', duration: 300, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enterActive).toContain('transition-[opacity]');
  });

  it('slide-left类型应生成translate相关CSS', () => {
    const config: TransitionConfig = { type: 'slide-left', duration: 250, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enter).toContain('translate-x');
    expect(css.exit).toContain('translate-x');
  });

  it('slide-right类型应生成正确CSS', () => {
    const config: TransitionConfig = { type: 'slide-right', duration: 250, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enter).toContain('translate-x');
    expect(css.exit).toContain('translate-x');
  });

  it('slide-up类型应生成translateY相关CSS', () => {
    const config: TransitionConfig = { type: 'slide-up', duration: 200, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enter).toContain('translate-y');
    expect(css.exit).toContain('translate-y');
  });

  it('slide-down类型应生成translateY相关CSS', () => {
    const config: TransitionConfig = { type: 'slide-down', duration: 200, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enter).toContain('translate-y');
    expect(css.exit).toContain('translate-y');
  });

  it('zoom类型应生成scale相关CSS', () => {
    const config: TransitionConfig = { type: 'zoom', duration: 300, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enter).toContain('scale');
    expect(css.exit).toContain('scale');
  });

  it('scale-up类型应生成scale相关CSS', () => {
    const config: TransitionConfig = { type: 'scale-up', duration: 200, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enter).toContain('scale');
    expect(css.exit).toContain('scale');
  });

  it('none类型应返回空CSS', () => {
    const config: TransitionConfig = { type: 'none', duration: 0, easing: 'linear' };
    const css = getTransitionCSS(config);
    expect(css.enter).toBe('');
    expect(css.enterActive).toBe('');
    expect(css.exit).toBe('');
    expect(css.exitActive).toBe('');
  });

  it('active CSS应包含transition关键字', () => {
    const config: TransitionConfig = { type: 'fade', duration: 300, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enterActive).toContain('transition');
    expect(css.exitActive).toContain('transition');
  });

  it('active CSS应包含duration', () => {
    const config: TransitionConfig = { type: 'fade', duration: 500, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enterActive).toContain('duration-500');
    expect(css.exitActive).toContain('duration-500');
  });

  it('reduceMotion为true且type不为none时仍然生成CSS', () => {
    const config: TransitionConfig = { type: 'fade', duration: 300, easing: 'ease-out', reduceMotion: true };
    const css = getTransitionCSS(config);
    // 实际实现中 reduceMotion 只影响 none 类型
    expect(css.enter).toBeTruthy();
  });
});

// ==================== 自定义转场配置 ====================

describe('自定义转场配置', () => {
  it('应支持自定义duration', () => {
    const config: TransitionConfig = { type: 'fade', duration: 1000, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enterActive).toContain('duration-1000');
  });

  it('duration为0应生成duration-0', () => {
    const config: TransitionConfig = { type: 'fade', duration: 0, easing: 'linear' };
    const css = getTransitionCSS(config);
    expect(css.enterActive).toContain('duration-0');
  });

  it('应支持组合动画类型', () => {
    const config: TransitionConfig = { type: 'slide-up', duration: 250, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enter).toBeTruthy();
    expect(css.exit).toBeTruthy();
  });

  it('fade enter应设置opacity-100', () => {
    const config: TransitionConfig = { type: 'fade', duration: 200, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.enterActive).toContain('opacity-100');
  });

  it('fade exit应设置opacity-0', () => {
    const config: TransitionConfig = { type: 'fade', duration: 200, easing: 'ease-out' };
    const css = getTransitionCSS(config);
    expect(css.exitActive).toContain('opacity-0');
  });
});

// ==================== 类型安全 ====================

describe('TransitionType类型验证', () => {
  it('所有预设的type都是合法TransitionType', () => {
    const validTypes: TransitionType[] = [
      'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down',
      'zoom', 'scale-up', 'none',
    ];
    for (const [, config] of Object.entries(TRANSITION_PRESETS)) {
      expect(validTypes).toContain(config.type);
    }
  });

  it('各转场类型生成不同的CSS', () => {
    const configs: TransitionConfig[] = [
      { type: 'fade', duration: 200, easing: 'ease-out' },
      { type: 'slide-left', duration: 200, easing: 'ease-out' },
      { type: 'zoom', duration: 200, easing: 'ease-out' },
    ];
    const cssResults = configs.map(c => getTransitionCSS(c).enter);
    // fade should differ from slide-left
    expect(cssResults[0]).not.toBe(cssResults[1]);
  });
});
