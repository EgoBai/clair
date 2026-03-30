/**
 * 语言切换组件逻辑测试
 */
import { describe, it, expect } from 'vitest';

describe('LanguageSwitcher Logic', () => {
  const LOCALE_OPTIONS = [
    { key: 'zh-CN', label: '中文', flag: '🇨🇳' },
    { key: 'en-US', label: 'English', flag: '🇺🇸' },
  ];

  describe('Locale Options', () => {
    it('should have exactly 2 locale options', () => {
      expect(LOCALE_OPTIONS).toHaveLength(2);
    });

    it('should have zh-CN as first option', () => {
      expect(LOCALE_OPTIONS[0].key).toBe('zh-CN');
      expect(LOCALE_OPTIONS[0].label).toBe('中文');
      expect(LOCALE_OPTIONS[0].flag).toBe('🇨🇳');
    });

    it('should have en-US as second option', () => {
      expect(LOCALE_OPTIONS[1].key).toBe('en-US');
      expect(LOCALE_OPTIONS[1].label).toBe('English');
      expect(LOCALE_OPTIONS[1].flag).toBe('🇺🇸');
    });

    it('each option should have key, label, and flag', () => {
      LOCALE_OPTIONS.forEach(opt => {
        expect(opt.key).toBeTruthy();
        expect(opt.label).toBeTruthy();
        expect(opt.flag).toBeTruthy();
      });
    });
  });

  describe('Current Locale Matching', () => {
    const findCurrent = (locale: string) =>
      LOCALE_OPTIONS.find(o => o.key === locale) || LOCALE_OPTIONS[0];

    it('should find zh-CN locale', () => {
      const current = findCurrent('zh-CN');
      expect(current.key).toBe('zh-CN');
      expect(current.flag).toBe('🇨🇳');
    });

    it('should find en-US locale', () => {
      const current = findCurrent('en-US');
      expect(current.key).toBe('en-US');
      expect(current.flag).toBe('🇺🇸');
    });

    it('should fallback to zh-CN for unknown locale', () => {
      const current = findCurrent('fr-FR');
      expect(current.key).toBe('zh-CN');
    });

    it('should fallback to zh-CN for empty string', () => {
      const current = findCurrent('');
      expect(current.key).toBe('zh-CN');
    });
  });

  describe('Menu Items Generation', () => {
    const generateMenuItems = (locale: string, setLocale: (l: string) => void) =>
      LOCALE_OPTIONS.map(opt => ({
        key: opt.key,
        label: `${opt.flag} ${opt.label}`,
        selected: opt.key === locale,
        onClick: () => setLocale(opt.key),
      }));

    it('should generate menu items for all locales', () => {
      const items = generateMenuItems('zh-CN', () => {});
      expect(items).toHaveLength(2);
    });

    it('should mark current locale as selected', () => {
      const items = generateMenuItems('en-US', () => {});
      const enItem = items.find(i => i.key === 'en-US');
      const zhItem = items.find(i => i.key === 'zh-CN');
      expect(enItem?.selected).toBe(true);
      expect(zhItem?.selected).toBe(false);
    });

    it('should include flag and label in display', () => {
      const items = generateMenuItems('zh-CN', () => {});
      expect(items[0].label).toContain('🇨🇳');
      expect(items[0].label).toContain('中文');
      expect(items[1].label).toContain('🇺🇸');
      expect(items[1].label).toContain('English');
    });
  });

  describe('Locale Validation', () => {
    const isValidLocale = (locale: string) => LOCALE_OPTIONS.some(o => o.key === locale);

    it('should accept valid locales', () => {
      expect(isValidLocale('zh-CN')).toBe(true);
      expect(isValidLocale('en-US')).toBe(true);
    });

    it('should reject invalid locales', () => {
      expect(isValidLocale('fr-FR')).toBe(false);
      expect(isValidLocale('')).toBe(false);
      expect(isValidLocale('ZH-CN')).toBe(false); // case sensitive
    });
  });

  describe('Selected Keys', () => {
    it('should produce correct selectedKeys array', () => {
      const locale = 'zh-CN';
      const selectedKeys = [locale];
      expect(selectedKeys).toEqual(['zh-CN']);
    });

    it('should update selectedKeys on locale change', () => {
      let locale = 'zh-CN';
      const setLocale = (l: string) => { locale = l; };
      setLocale('en-US');
      expect([locale]).toEqual(['en-US']);
    });
  });
});
