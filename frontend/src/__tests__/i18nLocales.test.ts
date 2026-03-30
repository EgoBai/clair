/**
 * i18n 多语言完整性测试
 * 验证所有 locale 文件的键一致性
 */
import { describe, it, expect } from 'vitest';
import zhCN from '../i18n/locales/zh-CN';
import enUS from '../i18n/locales/en-US';
import jaJP from '../i18n/locales/ja-JP';
import koKR from '../i18n/locales/ko-KR';

/**
 * 递归获取对象中所有叶子键的路径
 */
function getLeafKeys(obj: Record<string, any>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      keys.push(...getLeafKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('i18n 多语言完整性', () => {
  const locales = { 'zh-CN': zhCN, 'en-US': enUS, 'ja-JP': jaJP, 'ko-KR': koKR };
  const refKeys = getLeafKeys(zhCN);

  describe('语言文件结构', () => {
    it('zh-CN 应有翻译键', () => {
      expect(refKeys.length).toBeGreaterThan(50);
    });

    it('四个语言文件应存在', () => {
      expect(zhCN).toBeTruthy();
      expect(enUS).toBeTruthy();
      expect(jaJP).toBeTruthy();
      expect(koKR).toBeTruthy();
    });
  });

  describe('键一致性', () => {
    for (const [name, locale] of Object.entries(locales)) {
      if (name === 'zh-CN') continue;
      it(`${name} 应与 zh-CN 有相同数量的翻译键`, () => {
        const localeKeys = getLeafKeys(locale);
        expect(localeKeys.length).toBe(refKeys.length);
      });

      it(`${name} 应包含所有 zh-CN 的翻译键`, () => {
        const localeKeys = new Set(getLeafKeys(locale));
        for (const key of refKeys) {
          expect(localeKeys).toContain(key);
        }
      });
    }
  });

  describe('关键翻译键', () => {
    const criticalKeys = [
      'common.search',
      'common.loading',
      'common.confirm',
      'common.cancel',
      'common.error',
      'common.success',
      'nav.home',
      'nav.stocks',
      'nav.market',
      'nav.watchlist',
      'nav.screener',
      'nav.alerts',
      'home.title',
      'home.marketOverview',
      'stock.price',
      'stock.change',
      'stock.volume',
      'screener.title',
      'screener.execute',
      'watchlist.title',
      'alerts.title',
      'errors.networkError',
      'errors.serverError',
    ];

    for (const [name, locale] of Object.entries(locales)) {
      it(`${name} 应包含所有关键翻译键`, () => {
        const keys = new Set(getLeafKeys(locale));
        for (const key of criticalKeys) {
          expect(keys).toContain(key);
        }
      });
    }
  });

  describe('翻译值非空', () => {
    for (const [name, locale] of Object.entries(locales)) {
      it(`${name} 所有翻译值应为非空字符串`, () => {
        const keys = getLeafKeys(locale);
        for (const key of keys) {
          const value = key.split('.').reduce((obj: any, k) => obj?.[k], locale);
          expect(typeof value).toBe('string');
          expect(value.length).toBeGreaterThan(0);
        }
      });
    }
  });
});
