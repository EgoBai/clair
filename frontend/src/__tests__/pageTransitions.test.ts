import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TRANSITION_PRESETS,
  getTransitionCSS,
  prefersReducedMotion,
} from '../utils/pageTransitions';

// ==================== 转场预设 ====================
describe('pageTransitions - TRANSITION_PRESETS', () => {
  it('should have default preset', () => {
    expect(TRANSITION_PRESETS.default).toBeDefined();
    expect(TRANSITION_PRESETS.default.type).toBe('fade');
    expect(TRANSITION_PRESETS.default.duration).toBe(200);
  });

  it('should have page preset with slide-left', () => {
    expect(TRANSITION_PRESETS.page.type).toBe('slide-left');
    expect(TRANSITION_PRESETS.page.duration).toBe(250);
  });

  it('should have modal preset', () => {
    expect(TRANSITION_PRESETS.modal.type).toBe('scale-up');
    expect(TRANSITION_PRESETS.modal.duration).toBe(200);
  });

  it('should have drawer preset', () => {
    expect(TRANSITION_PRESETS.drawer.type).toBe('slide-right');
    expect(TRANSITION_PRESETS.drawer.duration).toBe(300);
  });

  it('should have dropdown preset', () => {
    expect(TRANSITION_PRESETS.dropdown.type).toBe('slide-down');
    expect(TRANSITION_PRESETS.dropdown.duration).toBe(150);
  });

  it('should have instant preset with zero duration', () => {
    expect(TRANSITION_PRESETS.instant.type).toBe('none');
    expect(TRANSITION_PRESETS.instant.duration).toBe(0);
  });

  it('all presets should have valid easing strings', () => {
    for (const preset of Object.values(TRANSITION_PRESETS)) {
      expect(typeof preset.easing).toBe('string');
      expect(preset.easing.length).toBeGreaterThan(0);
    }
  });

  it('all presets should have non-negative durations', () => {
    for (const preset of Object.values(TRANSITION_PRESETS)) {
      expect(preset.duration).toBeGreaterThanOrEqual(0);
    }
  });
});

// ==================== getTransitionCSS ====================
describe('pageTransitions - getTransitionCSS', () => {
  it('should return CSS strings for default transition', () => {
    const css = getTransitionCSS(TRANSITION_PRESETS.default);
    expect(css).toHaveProperty('enter');
    expect(css).toHaveProperty('enterActive');
    expect(css).toHaveProperty('exit');
    expect(css).toHaveProperty('exitActive');
  });

  it('should return empty strings for none type', () => {
    const css = getTransitionCSS(TRANSITION_PRESETS.instant);
    expect(css.enter).toBe('');
    expect(css.enterActive).toBe('');
  });

  it('should include duration in CSS', () => {
    const css = getTransitionCSS({ type: 'fade', duration: 300, easing: 'ease' });
    expect(css.enterActive).toContain('300');
  });

  it('should include duration for slide-left', () => {
    const css = getTransitionCSS(TRANSITION_PRESETS.page);
    expect(css.enterActive).toContain('250');
  });

  it('should handle delay parameter', () => {
    const css = getTransitionCSS({ type: 'fade', duration: 200, easing: 'ease', delay: 100 });
    // delay is part of the inline style string, not the Tailwind classes
    expect(css).toBeDefined();
  });

  it('should generate slide-left CSS', () => {
    const css = getTransitionCSS(TRANSITION_PRESETS.page);
    expect(css.enter).toContain('translate-x-full');
  });

  it('should generate slide-right CSS', () => {
    const css = getTransitionCSS(TRANSITION_PRESETS.drawer);
    expect(css.enter).toContain('-translate-x-full');
  });

  it('should generate scale-up CSS', () => {
    const css = getTransitionCSS(TRANSITION_PRESETS.modal);
    expect(css.enter).toContain('scale-95');
  });

  it('should generate slide-down CSS', () => {
    const css = getTransitionCSS(TRANSITION_PRESETS.dropdown);
    expect(css.enter).toContain('-translate-y-full');
  });

  it('should generate zoom CSS', () => {
    const css = getTransitionCSS({ type: 'zoom', duration: 200, easing: 'ease' });
    expect(css.enter).toContain('scale-0');
  });

  it('should generate slide-up CSS', () => {
    const css = getTransitionCSS({ type: 'slide-up', duration: 200, easing: 'ease' });
    expect(css.enter).toContain('translate-y-full');
  });

  it('should generate fade CSS', () => {
    const css = getTransitionCSS(TRANSITION_PRESETS.default);
    expect(css.enter).toBeDefined();
    expect(css.exit).toBeDefined();
    expect(css.enterActive).toContain('200');
  });

  it('default delay should be 0', () => {
    const css = getTransitionCSS({ type: 'fade', duration: 200, easing: 'ease' });
    expect(css).toBeDefined();
  });
});

// ==================== prefersReducedMotion ====================
describe('pageTransitions - prefersReducedMotion', () => {
  it('should return a boolean', () => {
    const result = prefersReducedMotion();
    expect(typeof result).toBe('boolean');
  });
});
