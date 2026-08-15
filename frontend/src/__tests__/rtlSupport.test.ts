import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  RTL_LOCALES,
  isRTL,
  getDirection,
  applyDirection,
  RTL_PROPERTIES,
  rtlStyle,
  getFlexDirection,
  type Locale
} from '../utils/rtlSupport';

/**
 * RTL (Right-to-Left) 支持工具测试（导入真实模块）
 */

describe('RTLSupport (real module)', () => {
  describe('default (reserved) state', () => {
    it('RTL_LOCALES should be an empty reserved array', () => {
      expect(Array.isArray(RTL_LOCALES)).toBe(true);
      expect(RTL_LOCALES).toHaveLength(0);
    });

    it('isRTL should be false for all current locales', () => {
      (['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'ar-SA'] as Locale[]).forEach(locale => {
        expect(isRTL(locale)).toBe(false);
      });
    });

    it('getDirection should be ltr for current locales', () => {
      expect(getDirection('zh-CN')).toBe('ltr');
      expect(['ltr', 'rtl']).toContain(getDirection('en-US'));
    });

    it('RTL_PROPERTIES should map to LTR physical properties', () => {
      expect(RTL_PROPERTIES.marginStart('zh-CN')).toBe('marginLeft');
      expect(RTL_PROPERTIES.marginEnd('zh-CN')).toBe('marginRight');
      expect(RTL_PROPERTIES.paddingStart('en-US')).toBe('paddingLeft');
      expect(RTL_PROPERTIES.paddingEnd('en-US')).toBe('paddingRight');
      expect(RTL_PROPERTIES.textAlign('zh-CN')).toBe('left');
      expect(RTL_PROPERTIES.float('zh-CN', 'start')).toBe('left');
      expect(RTL_PROPERTIES.float('zh-CN', 'end')).toBe('right');
    });

    it('getFlexDirection should keep base direction in LTR', () => {
      expect(getFlexDirection('zh-CN', 'column')).toBe('column');
      expect(getFlexDirection('zh-CN', 'column-reverse')).toBe('column-reverse');
      expect(getFlexDirection('zh-CN', 'row')).toBe('row');
      expect(getFlexDirection('zh-CN', 'row-reverse')).toBe('row-reverse');
      expect(getFlexDirection('zh-CN')).toBe('row');
    });

    it('rtlStyle should set direction ltr and keep base textAlign', () => {
      const s = rtlStyle('zh-CN', { color: 'red' });
      expect(s.direction).toBe('ltr');
      expect(s.color).toBe('red');
      expect(s.textAlign).toBeUndefined();
    });

    it('applyDirection should set document dir to ltr', () => {
      applyDirection('zh-CN');
      expect(document.documentElement.dir).toBe('ltr');
      expect(document.body.classList.contains('rtl')).toBe(false);
    });
  });

  describe('RTL branch (driving reserved logic via a registered locale)', () => {
    const RTL_TEST_LOCALE = 'ar-SA' as Locale;
    beforeAll(() => {
      RTL_LOCALES.push(RTL_TEST_LOCALE);
    });
    afterAll(() => {
      const i = RTL_LOCALES.indexOf(RTL_TEST_LOCALE);
      if (i >= 0) RTL_LOCALES.splice(i, 1);
    });

    it('isRTL should be true for a registered RTL locale', () => {
      expect(isRTL(RTL_TEST_LOCALE)).toBe(true);
      expect(getDirection(RTL_TEST_LOCALE)).toBe('rtl');
    });

    it('RTL_PROPERTIES should mirror physical sides', () => {
      expect(RTL_PROPERTIES.marginStart(RTL_TEST_LOCALE)).toBe('marginRight');
      expect(RTL_PROPERTIES.marginEnd(RTL_TEST_LOCALE)).toBe('marginLeft');
      expect(RTL_PROPERTIES.paddingStart(RTL_TEST_LOCALE)).toBe('paddingRight');
      expect(RTL_PROPERTIES.paddingEnd(RTL_TEST_LOCALE)).toBe('paddingLeft');
      expect(RTL_PROPERTIES.textAlign(RTL_TEST_LOCALE)).toBe('right');
      expect(RTL_PROPERTIES.float(RTL_TEST_LOCALE, 'start')).toBe('right');
      expect(RTL_PROPERTIES.float(RTL_TEST_LOCALE, 'end')).toBe('left');
    });

    it('getFlexDirection should reverse row in RTL', () => {
      expect(getFlexDirection(RTL_TEST_LOCALE, 'row')).toBe('row-reverse');
      expect(getFlexDirection(RTL_TEST_LOCALE, 'row-reverse')).toBe('row');
      expect(getFlexDirection(RTL_TEST_LOCALE, 'column')).toBe('column'); // columns untouched
    });

    it('rtlStyle should set direction rtl and override textAlign', () => {
      const s = rtlStyle(RTL_TEST_LOCALE);
      expect(s.direction).toBe('rtl');
      expect(s.textAlign).toBe('right');
    });

    it('applyDirection should set document dir to rtl and add class', () => {
      applyDirection(RTL_TEST_LOCALE);
      expect(document.documentElement.dir).toBe('rtl');
      expect(document.body.classList.contains('rtl')).toBe(true);
    });
  });
});
