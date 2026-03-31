import { describe, it, expect } from 'vitest';
import {
  I18nManager,
  formatDate,
  formatNumber,
  formatCurrency,
  formatRelativeTime,
} from '../i18n/i18nManager';

describe('I18nManager', () => {
  const manager = new I18nManager({
    defaultLocale: 'zh-CN',
    fallbackLocale: 'en',
    translations: {
      'zh-CN': {
        greeting: '你好',
        farewell: '再见',
        items: {
          one: '{{count}} 项',
          other: '{{count}} 项',
        },
        welcome: '欢迎，{{name}}！',
        nested: { deep: { value: '深层值' } },
      },
      en: {
        greeting: 'Hello',
        farewell: 'Goodbye',
        welcome: 'Welcome, {{name}}!',
        items: {
          one: '{{count}} item',
          other: '{{count}} items',
        },
        onlyEnglish: 'English only',
      },
    },
  });

  it('should translate simple keys', () => {
    expect(manager.t('greeting')).toBe('你好');
  });

  it('should use fallback locale', () => {
    expect(manager.t('onlyEnglish')).toBe('English only');
  });

  it('should return key if not found', () => {
    expect(manager.t('nonexistent')).toBe('nonexistent');
  });

  it('should support interpolation', () => {
    expect(manager.t('welcome', { name: '小明' })).toBe('欢迎，小明！');
  });

  it('should leave unresolved interpolation placeholders', () => {
    expect(manager.t('welcome', {})).toBe('欢迎，{{name}}！');
  });

  it('should support nested keys', () => {
    expect(manager.t('nested.deep.value')).toBe('深层值');
  });

  it('should handle pluralization', () => {
    expect(manager.tn('items', 1)).toBe('1 项');
    expect(manager.tn('items', 5)).toBe('5 项');
  });

  it('should switch locale', () => {
    manager.setLocale('en');
    expect(manager.getLocale()).toBe('en');
    expect(manager.t('greeting')).toBe('Hello');
    manager.setLocale('zh-CN');
  });

  it('should check key existence', () => {
    expect(manager.has('greeting')).toBe(true);
    expect(manager.has('nonexistent')).toBe(false);
    expect(manager.has('greeting', 'en')).toBe(true);
  });

  it('should list available locales', () => {
    expect(manager.getAvailableLocales()).toContain('zh-CN');
    expect(manager.getAvailableLocales()).toContain('en');
  });

  it('should add translations dynamically', () => {
    manager.addTranslations('ja', { greeting: 'こんにちは' });
    expect(manager.has('greeting', 'ja')).toBe(true);
    manager.setLocale('ja');
    expect(manager.t('greeting')).toBe('こんにちは');
    manager.setLocale('zh-CN');
  });
});

describe('formatDate', () => {
  it('should format date in zh-CN', () => {
    const date = new Date('2024-01-15');
    const result = formatDate(date, 'zh-CN');
    expect(result).toContain('2024');
    expect(result).toContain('01');
    expect(result).toContain('15');
  });

  it('should accept timestamp', () => {
    const ts = new Date('2024-06-01').getTime();
    const result = formatDate(ts, 'en-US');
    expect(result).toContain('2024');
  });

  it('should support custom options', () => {
    const date = new Date('2024-03-15');
    const result = formatDate(date, 'en-US', { month: 'long', year: 'numeric' });
    expect(result).toContain('March');
  });
});

describe('formatNumber', () => {
  it('should format number in zh-CN', () => {
    const result = formatNumber(1234567.89, 'zh-CN');
    expect(result).toContain('1');
    expect(result).toContain('234');
  });

  it('should format with percentage', () => {
    const result = formatNumber(0.75, 'en-US', { style: 'percent' });
    expect(result).toContain('75');
  });
});

describe('formatCurrency', () => {
  it('should format CNY', () => {
    const result = formatCurrency(1234.56, 'zh-CN', 'CNY');
    expect(result).toContain('1');
    expect(result).toContain('234');
  });

  it('should format USD', () => {
    const result = formatCurrency(1234.56, 'en-US', 'USD');
    expect(result).toContain('$');
  });
});

describe('formatRelativeTime', () => {
  it('should format past time', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const result = formatRelativeTime(oneHourAgo, 'en');
    expect(result).toContain('hour');
  });

  it('should format future time', () => {
    const inTwoDays = Date.now() + 2 * 24 * 60 * 60 * 1000;
    const result = formatRelativeTime(inTwoDays, 'en');
    expect(result).toContain('day');
  });

  it('should format now', () => {
    const result = formatRelativeTime(Date.now(), 'en');
    expect(result).toContain('now');
  });
});
