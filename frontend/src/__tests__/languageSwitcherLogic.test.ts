import { describe, it, expect } from 'vitest';

/**
 * 语言切换逻辑测试
 * LanguageSwitcher i18n/本地化辅助
 */

type Locale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR';

interface TranslationKey {
  key: string;
  namespace?: string;
}

interface LocaleInfo {
  code: Locale;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  dateFormat: string;
  numberFormat: {
    decimal: string;
    thousand: string;
    currency: string;
  };
}

const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  'zh-CN': {
    code: 'zh-CN',
    name: 'Chinese Simplified',
    nativeName: '简体中文',
    direction: 'ltr',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: { decimal: '.', thousand: ',', currency: '¥' },
  },
  'zh-TW': {
    code: 'zh-TW',
    name: 'Chinese Traditional',
    nativeName: '繁體中文',
    direction: 'ltr',
    dateFormat: 'YYYY/MM/DD',
    numberFormat: { decimal: '.', thousand: ',', currency: 'NT$' },
  },
  'en-US': {
    code: 'en-US',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    dateFormat: 'MM/DD/YYYY',
    numberFormat: { decimal: '.', thousand: ',', currency: '$' },
  },
  'ja-JP': {
    code: 'ja-JP',
    name: 'Japanese',
    nativeName: '日本語',
    direction: 'ltr',
    dateFormat: 'YYYY年MM月DD日',
    numberFormat: { decimal: '.', thousand: ',', currency: '¥' },
  },
  'ko-KR': {
    code: 'ko-KR',
    name: 'Korean',
    nativeName: '한국어',
    direction: 'ltr',
    dateFormat: 'YYYY.MM.DD',
    numberFormat: { decimal: '.', thousand: ',', currency: '₩' },
  },
};

function getLocaleInfo(locale: Locale): LocaleInfo {
  return LOCALE_INFO[locale];
}

function buildTranslationKey(key: string, namespace?: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

function parseTranslationKey(fullKey: string): TranslationKey {
  const idx = fullKey.indexOf(':');
  if (idx === -1) return { key: fullKey };
  return { namespace: fullKey.slice(0, idx), key: fullKey.slice(idx + 1) };
}

function interpolateMessage(template: string, params: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
  });
}

function formatNumber(value: number, locale: Locale): string {
  const info = LOCALE_INFO[locale];
  const parts = value.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, info.numberFormat.thousand);
  return `${intPart}${info.numberFormat.decimal}${parts[1]}`;
}

function formatCurrency(value: number, locale: Locale): string {
  const info = LOCALE_INFO[locale];
  return `${info.numberFormat.currency}${formatNumber(value, locale)}`;
}

function formatDate(timestamp: number, locale: Locale): string {
  const d = new Date(timestamp);
  const info = LOCALE_INFO[locale];
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return info.dateFormat
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day);
}

function detectBrowserLocale(): Locale {
  // Simulated detection
  return 'zh-CN';
}

function isValidLocale(locale: string): locale is Locale {
  return locale in LOCALE_INFO;
}

function getAvailableLocales(): LocaleInfo[] {
  return Object.values(LOCALE_INFO);
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function mergeTranslations(
  base: Record<string, string>,
  overrides: Record<string, string>
): Record<string, string> {
  return { ...base, ...overrides };
}

function findMissingKeys(
  translations: Record<string, string>,
  requiredKeys: string[]
): string[] {
  return requiredKeys.filter(key => !(key in translations));
}

function buildLocaleStorageKey(prefix: string): string {
  return `${prefix}:locale`;
}

describe('语言切换逻辑', () => {
  describe('getLocaleInfo', () => {
    it('should return locale info', () => {
      const info = getLocaleInfo('zh-CN');
      expect(info.nativeName).toBe('简体中文');
      expect(info.direction).toBe('ltr');
    });

    it('should return English info', () => {
      const info = getLocaleInfo('en-US');
      expect(info.name).toBe('English');
    });
  });

  describe('buildTranslationKey / parseTranslationKey', () => {
    it('should build with namespace', () => {
      expect(buildTranslationKey('title', 'common')).toBe('common:title');
    });

    it('should build without namespace', () => {
      expect(buildTranslationKey('title')).toBe('title');
    });

    it('should parse namespaced key', () => {
      expect(parseTranslationKey('common:title')).toEqual({ namespace: 'common', key: 'title' });
    });

    it('should parse simple key', () => {
      expect(parseTranslationKey('title')).toEqual({ key: 'title' });
    });
  });

  describe('interpolateMessage', () => {
    it('should replace params', () => {
      expect(interpolateMessage('Hello {{name}}', { name: 'World' })).toBe('Hello World');
    });

    it('should handle multiple params', () => {
      expect(interpolateMessage('{{greeting}}, {{name}}!', { greeting: 'Hi', name: 'ego' })).toBe('Hi, ego!');
    });

    it('should keep placeholders for missing params', () => {
      expect(interpolateMessage('Hello {{name}}', {})).toBe('Hello {{name}}');
    });
  });

  describe('formatNumber', () => {
    it('should format with locale separators', () => {
      const result = formatNumber(1234567.89, 'en-US');
      expect(result).toContain(',');
      expect(result).toContain('.');
    });
  });

  describe('formatCurrency', () => {
    it('should format CNY', () => {
      const result = formatCurrency(1234.5, 'zh-CN');
      expect(result).toContain('¥');
    });

    it('should format USD', () => {
      const result = formatCurrency(1234.5, 'en-US');
      expect(result).toContain('$');
    });

    it('should format JPY', () => {
      const result = formatCurrency(1234.5, 'ja-JP');
      expect(result).toContain('¥');
    });
  });

  describe('formatDate', () => {
    const ts = new Date('2024-03-15').getTime();

    it('should format Chinese date', () => {
      expect(formatDate(ts, 'zh-CN')).toBe('2024-03-15');
    });

    it('should format US date', () => {
      expect(formatDate(ts, 'en-US')).toBe('03/15/2024');
    });

    it('should format Japanese date', () => {
      expect(formatDate(ts, 'ja-JP')).toBe('2024年03月15日');
    });
  });

  describe('isValidLocale', () => {
    it('should validate known locales', () => {
      expect(isValidLocale('zh-CN')).toBe(true);
      expect(isValidLocale('en-US')).toBe(true);
    });

    it('should reject unknown locales', () => {
      expect(isValidLocale('fr-FR')).toBe(false);
      expect(isValidLocale('')).toBe(false);
    });
  });

  describe('getAvailableLocales', () => {
    it('should return all locales', () => {
      const locales = getAvailableLocales();
      expect(locales).toHaveLength(5);
      expect(locales.map(l => l.code)).toContain('zh-CN');
    });
  });

  describe('pluralize', () => {
    it('should use singular for 1', () => {
      expect(pluralize(1, 'item', 'items')).toBe('item');
    });

    it('should use plural for other counts', () => {
      expect(pluralize(0, 'item', 'items')).toBe('items');
      expect(pluralize(2, 'item', 'items')).toBe('items');
    });
  });

  describe('mergeTranslations', () => {
    it('should merge override into base', () => {
      const result = mergeTranslations({ a: '1', b: '2' }, { b: 'B', c: 'C' });
      expect(result).toEqual({ a: '1', b: 'B', c: 'C' });
    });
  });

  describe('findMissingKeys', () => {
    it('should find missing keys', () => {
      const translations = { a: 'A', b: 'B' };
      expect(findMissingKeys(translations, ['a', 'b', 'c'])).toEqual(['c']);
    });

    it('should return empty when all present', () => {
      expect(findMissingKeys({ a: 'A' }, ['a'])).toEqual([]);
    });
  });

  describe('buildLocaleStorageKey', () => {
    it('should build key', () => {
      expect(buildLocaleStorageKey('app')).toBe('app:locale');
    });
  });
});
