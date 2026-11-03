/**
 * 影子测试迁移（批次 22b）
 *
 * 旧文件自带 translations 字典与 t/detectLanguage/formatNumber/formatDate/pluralize 副本，
 * 断言的是副本。现已全部 import 生产实现。
 *
 * 已绑定生产实现：
 * - ../i18n/index.tsx: messages（:22，4 语言包）/ createTranslator（:214）/
 *   formatters.currency（:42）/ formatters.date（:71）
 * - ../i18n/i18nManager.ts: formatDate（:134）/ formatNumber（:151）
 * - ../utils/i18nEngine.ts: detectBrowserLocale（:490）/ formatMarketCapLocalized（:452）/
 *   formatDateLocalized（:322）/ pluralize（:411）
 *
 * 旧断言错在哪：
 *
 * | 旧断言 | 生产输出 | 依据 |
 * | --- | --- | --- |
 * | t('app.title') 等 3 键 | 生产语言包没有 app.title，标题键是 home.title | i18n/locales/zh-CN.ts |
 * | t('app.title', 'ja') 返回 key | Locale 联合不含 'ja'；运行时 createTranslator('ja') 因语言包缺失返回 key | i18n/index.tsx:214 |
 * | detectLanguage('en-US,...') → 'en' | detectBrowserLocale() 读 navigator.language，返回完整码 'en-US' | i18nEngine.ts:490 |
 * | zh 数字含「亿」/「万」 | formatters.currency：'1.50亿'/'15.00万'；i18nManager.formatNumber 只做千分位 | i18n/index.tsx:42；i18nManager.ts:151 |
 * | en 数字含 B/M | formatters.currency：'$1.50B'/'$5.00M'；i18nEngine.formatMarketCapLocalized 缩放有缺陷 | i18n/index.tsx:42；i18nEngine.ts:452 |
 * | zh 日期 '2024年01月15日' | formatters.date：'2024年1月15日'（不补零）；旧值只在 i18nEngine.formatDateLocalized 成立 | i18n/index.tsx:71；i18nEngine.ts:322 |
 * | en 日期 '2024-01-15' | formatters.date：'Jan 15, 2024'；i18nManager.formatDate：'01/15/2024' | i18n/index.tsx:71；i18nManager.ts:134 |
 * | pluralize(1, 'stock', 'stocks') | 生产 pluralize(count, PluralRule, locale)，用 {n} 占位 | i18nEngine.ts:411 |
 *
 * 未迁移：无。原 16 个用例全部改绑生产实现，并新增 7 个用例覆盖 4 语言包、完整 locale 检测与
 * 三套格式化实现的实际输出。
 *
 * 生产缺陷候选（只报告不修）：
 * - i18nEngine.formatMarketCapLocalized 对 en-US/ja-JP/ko-KR 仍按中文 1e8/1e4 缩放：
 *   1.5e9 → '15.00B'（应为 1.50B）、5e6 → '500.00M'（应为 5.00M）。
 * - 三套数字/日期格式化并存且输出不一致（i18n/index formatters、i18nManager Intl、i18nEngine 模板）；
 *   其中 i18nManager 与 i18nEngine 在 src 内无生产调用方，utils/index.ts:107 还把 i18nEngine
 *   导出注释为「module not found」。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createTranslator, formatters, messages, type I18nMessages, type Locale } from '../i18n';
import { formatDate, formatNumber } from '../i18n/i18nManager';
import {
  detectBrowserLocale,
  formatDateLocalized,
  formatMarketCapLocalized,
  pluralize,
} from '../utils/i18nEngine';

describe('i18n System', () => {
  describe('Translation Lookup', () => {
    it('should return Chinese translations', () => {
      const t = createTranslator('zh-CN');
      expect(t('home.title')).toBe('A股行情分析');
      expect(t('nav.home')).toBe('首页');
      expect(t('stock.price')).toBe('最新价');
    });

    it('should return English translations', () => {
      const t = createTranslator('en-US');
      expect(t('home.title')).toBe('A-Share Market Analysis');
      expect(t('nav.home')).toBe('Home');
      expect(t('stock.price')).toBe('Price');
    });

    it('should fallback to key for missing translations', () => {
      expect(createTranslator('zh-CN')('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should fallback to key for unsupported locale', () => {
      // Locale 联合类型不含 'ja'；运行时 messages['ja'] 为 undefined，getNestedValue 返回原始 key。
      const t = createTranslator('ja' as unknown as Locale);
      expect(t('home.title')).toBe('home.title');
    });
  });

  describe('Translation Completeness', () => {
    const locales = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'] as const;

    const flattenMessages = (obj: I18nMessages, prefix = ''): Record<string, string> => {
      const flat: Record<string, string> = {};
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string') {
          flat[fullKey] = value;
        } else {
          Object.assign(flat, flattenMessages(value, fullKey));
        }
      }
      return flat;
    };

    const flattened = Object.fromEntries(
      locales.map(locale => [locale, flattenMessages(messages[locale])]),
    ) as Record<Locale, Record<string, string>>;

    it('should have same keys in all languages', () => {
      const zhKeys = Object.keys(flattened['zh-CN']).sort();
      expect(zhKeys.length).toBeGreaterThan(100);
      locales.forEach(locale => {
        expect(Object.keys(flattened[locale]).sort()).toEqual(zhKeys);
      });
    });

    it('should have non-empty translations', () => {
      locales.forEach(locale => {
        Object.values(flattened[locale]).forEach(value => {
          expect(value.trim().length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Language Detection', () => {
    const originalLanguage = navigator.language;

    const setNavigatorLanguage = (language: string): void => {
      Object.defineProperty(window.navigator, 'language', { value: language, configurable: true });
    };

    afterEach(() => {
      Object.defineProperty(window.navigator, 'language', { value: originalLanguage, configurable: true });
    });

    it('should default to Chinese for unsupported browser languages', () => {
      setNavigatorLanguage('fr-FR');
      expect(detectBrowserLocale()).toBe('zh-CN');
    });

    it('should detect English', () => {
      setNavigatorLanguage('en-US');
      expect(detectBrowserLocale()).toBe('en-US');
    });

    it('should detect Chinese', () => {
      setNavigatorLanguage('zh-CN');
      expect(detectBrowserLocale()).toBe('zh-CN');
    });

    it('should detect Traditional Chinese', () => {
      setNavigatorLanguage('zh-TW');
      expect(detectBrowserLocale()).toBe('zh-TW');
    });

    it('should detect Japanese', () => {
      setNavigatorLanguage('ja-JP');
      expect(detectBrowserLocale()).toBe('ja-JP');
    });
  });

  describe('Number Formatting', () => {
    it('should format large numbers with 亿 in Chinese', () => {
      expect(formatters.currency(150000000, 'zh-CN')).toBe('1.50亿');
    });

    it('should format medium numbers with 万 in Chinese', () => {
      expect(formatters.currency(150000, 'zh-CN')).toBe('15.00万');
    });

    it('should format with B/M in English', () => {
      expect(formatters.currency(1500000000, 'en-US')).toBe('$1.50B');
      expect(formatters.currency(5000000, 'en-US')).toBe('$5.00M');
    });

    it('should format with Intl grouping only in i18nManager.formatNumber', () => {
      // i18nManager 不做亿/万/B/M 缩写，旧断言绑错了函数。
      expect(formatNumber(150000000, 'zh-CN')).toBe('150,000,000');
      expect(formatNumber(1234567.89, 'en-US')).toBe('1,234,567.89');
    });

    it('should record formatMarketCapLocalized scale for non-Chinese locales', () => {
      expect(formatMarketCapLocalized(150000000, 'zh-CN')).toBe('1.50亿');
      expect(formatMarketCapLocalized(150000, 'zh-CN')).toBe('15.00万');
      // 生产缺陷候选：非中文 locale 仍按 1e8/1e4 缩放，1.5e9 显示为 15.00B、5e6 显示为 500.00M。
      expect(formatMarketCapLocalized(1500000000, 'en-US')).toBe('15.00B');
      expect(formatMarketCapLocalized(5000000, 'en-US')).toBe('500.00M');
    });
  });

  describe('Date Formatting', () => {
    it('should format Chinese date', () => {
      expect(formatters.date(new Date(2024, 0, 15), 'zh-CN')).toBe('2024年1月15日');
      expect(formatters.date(new Date(2024, 0, 15), 'ja-JP')).toBe('2024年1月15日');
    });

    it('should format English date', () => {
      expect(formatters.date(new Date(2024, 0, 15), 'en-US')).toBe('Jan 15, 2024');
    });

    it('should format dates with i18nManager Intl slash format', () => {
      expect(formatDate(new Date(2024, 0, 15), 'zh-CN')).toBe('2024/01/15');
      expect(formatDate(new Date(2024, 0, 15), 'en-US')).toBe('01/15/2024');
    });

    it('should format dates with i18nEngine template format', () => {
      // 旧 zh 断言 '2024年01月15日' 只在这个模块成立；旧 en 断言 '2024-01-15' 在生产 i18n 中无对应。
      expect(formatDateLocalized(new Date(2024, 0, 15), 'zh-CN')).toBe('2024年01月15日');
      expect(formatDateLocalized(new Date(2024, 0, 15), 'en-US')).toBe('01/15/2024');
    });
  });

  describe('Pluralization', () => {
    it('should use singular for 1', () => {
      expect(pluralize(1, { one: '{n} stock', other: '{n} stocks' }, 'en-US')).toBe('1 stock');
    });

    it('should use plural for other counts', () => {
      expect(pluralize(0, { one: '{n} stock', other: '{n} stocks' }, 'en-US')).toBe('0 stocks');
      expect(pluralize(2, { one: '{n} stock', other: '{n} stocks' }, 'en-US')).toBe('2 stocks');
      expect(pluralize(100, { one: '{n} stock', other: '{n} stocks' }, 'en-US')).toBe('100 stocks');
    });

    it('should honor zero rule and Chinese one form', () => {
      expect(pluralize(0, { zero: 'no stocks', one: '{n} stock', other: '{n} stocks' }, 'en-US')).toBe('no stocks');
      expect(pluralize(1, { one: '{n}只股票', other: '{n}只股票' }, 'zh-CN')).toBe('1只股票');
    });
  });
});
