/**
 * 语言切换逻辑测试
 *
 * 影子测试治理批次 21b：本文件原先内联了 LOCALE_INFO、buildTranslationKey / parseTranslationKey、
 * interpolateMessage、formatNumber / formatCurrency / formatDate、getAvailableLocales、pluralize、
 * mergeTranslations、findMissingKeys、buildLocaleStorageKey 等自抄实现。
 * 现全部改为 import 生产代码（生产为口径真源）：
 *
 * - frontend/src/components/Common/LanguageSwitcher.tsx:20-47
 *     LOCALE_OPTIONS / getLocaleDir / isCJKLocale / getLocaleDisplayName
 * - frontend/src/components/Common/LanguageSwitcher.tsx:100-111
 *     Ctrl+Shift+L 循环切换（真实渲染 I18nProvider + LanguageSwitcher 验证）
 * - frontend/src/i18n/index.tsx:31-115 formatters
 * - frontend/src/i18n/index.tsx:146-154 SUPPORTED_LOCALES / LOCALE_NAMES
 * - frontend/src/i18n/index.tsx:161-198 I18nProvider（localStorage 键 'locale'、documentElement.lang）
 * - frontend/src/i18n/index.tsx:214-224 createTranslator
 * - frontend/src/i18n/i18nManager.ts:63-124 I18nManager（t / tn / addTranslations / has / getAvailableLocales）
 * - frontend/src/i18n/i18nManager.ts:134-171 formatDate / formatNumber / formatCurrency
 *
 * 未迁移（生产无对应 API，改绑生产等价行为，不保留内联副本）：
 * 1) buildTranslationKey / parseTranslationKey 的 namespace:key 冒号键：生产没有冒号键 API，
 *    统一使用 '.' 嵌套键（i18nManager.resolveKey、i18n/index.tsx getNestedValue）；
 *    相关断言改为直接验证生产 t() 的嵌套键解析与未知键回退。
 * 2) buildLocaleStorageKey(prefix)：生产 I18nProvider 固定使用 'locale' 键、无 prefix；
 *    改为真实渲染验证实际存储键与 documentElement.lang。
 *
 * 口径差异（旧断言 → 生产值）：
 * - 生产只支持 4 种语言，没有 zh-TW（旧自抄 LOCALE_INFO 有 5 种）。
 * - formatters.currency 的 zh-CN 分支返回不带货币符号的金额（1e4/1e8/1e12 为万/亿/万亿）；
 *   只有 i18nManager.formatCurrency 走 Intl 货币符号，且币种由第 3 参数决定、不随 locale 变。
 * - 日期：i18nManager.formatDate 用 Intl（zh-CN '2024/03/15'），
 *   formatters.date 用「2024年3月15日」模板（不补零），两套口径分别断言。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';

import LanguageSwitcher, {
  LOCALE_OPTIONS,
  getLocaleDir,
  isCJKLocale,
  getLocaleDisplayName,
} from '../components/Common/LanguageSwitcher';
import {
  I18nProvider,
  useI18n,
  createTranslator,
  messages,
  formatters,
  SUPPORTED_LOCALES,
  LOCALE_NAMES,
} from '../i18n';
import type { Locale } from '../i18n';
import { I18nManager, formatDate, formatNumber, formatCurrency } from '../i18n/i18nManager';

// ==================== 测试环境：localStorage ====================

/**
 * Node 25 自带一个无 --localstorage-file 时为空壳的全局 localStorage（没有 clear/getItem 等方法），
 * 会遮蔽 jsdom 提供的 window.localStorage；因此测试内注入内存版 Storage。
 * 仅影响测试进程，不涉及生产代码。
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  } as Storage;
}

function installMemoryStorage(): Storage {
  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
  try {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: storage,
    });
  } catch {
    // jsdom 的 window.localStorage 可能不可重定义；生产代码读的是全局 localStorage
  }
  return storage;
}

/** 探针：把 I18nProvider 当前 locale 暴露到 DOM，便于断言真实切换结果 */
function LocaleProbe() {
  const { locale } = useI18n();
  return React.createElement('span', { 'data-testid': 'locale' }, locale);
}

function renderSwitcher(defaultLocale: Locale = 'zh-CN') {
  return render(
    React.createElement(
      I18nProvider,
      { defaultLocale },
      React.createElement(LocaleProbe, null),
      React.createElement(LanguageSwitcher, {})
    )
  );
}

function pressLocaleHotkey() {
  fireEvent.keyDown(window, { key: 'l', ctrlKey: true, shiftKey: true });
}

beforeEach(() => {
  installMemoryStorage();
  localStorage.clear();
  document.documentElement.lang = '';
  document.documentElement.removeAttribute('dir');
  document.documentElement.classList.remove('cjk-locale');
});

afterEach(() => {
  cleanup();
});

// ==================== 语言元数据 ====================

describe('语言切换逻辑', () => {
  describe('LOCALE_OPTIONS / 语言元数据', () => {
    it('只包含生产支持的 4 种语言（生产已无 zh-TW）', () => {
      const keys = LOCALE_OPTIONS.map(option => option.key);
      expect(keys).toEqual(['zh-CN', 'en-US', 'ja-JP', 'ko-KR']);
      expect(keys).not.toContain('zh-TW');
    });

    it('nativeLabel / group / dir 字段与生产一致', () => {
      expect(LOCALE_OPTIONS).toHaveLength(4);
      const byKey = Object.fromEntries(LOCALE_OPTIONS.map(option => [option.key, option]));
      expect(byKey['zh-CN'].nativeLabel).toBe('中文');
      expect(byKey['zh-CN'].group).toBe('cjk');
      expect(byKey['en-US'].nativeLabel).toBe('English');
      expect(byKey['en-US'].group).toBe('latin');
      expect(byKey['ja-JP'].nativeLabel).toBe('日本語');
      expect(byKey['ko-KR'].nativeLabel).toBe('한국어');
      for (const option of LOCALE_OPTIONS) {
        expect(option.dir).toBe('ltr');
      }
    });

    it('getLocaleDir 对全部支持语言返回 ltr（RTL_LOCALES 为空）', () => {
      for (const locale of SUPPORTED_LOCALES) {
        expect(getLocaleDir(locale)).toBe('ltr');
      }
    });

    it('isCJKLocale 区分 CJK 与拉丁语系', () => {
      expect(isCJKLocale('zh-CN')).toBe(true);
      expect(isCJKLocale('ja-JP')).toBe(true);
      expect(isCJKLocale('ko-KR')).toBe(true);
      expect(isCJKLocale('en-US')).toBe(false);
    });

    it('getLocaleDisplayName 同一语言显示原生名', () => {
      expect(getLocaleDisplayName('zh-CN', 'zh-CN')).toBe('中文');
      expect(getLocaleDisplayName('ko-KR', 'ko-KR')).toBe('한국어');
    });

    it('getLocaleDisplayName 其他语言显示英文名', () => {
      expect(getLocaleDisplayName('zh-CN', 'en-US')).toBe('Chinese');
      expect(getLocaleDisplayName('ja-JP', 'en-US')).toBe('Japanese');
    });

    it('getLocaleDisplayName 未知语言回退为原值', () => {
      expect(getLocaleDisplayName('fr-FR' as Locale, 'zh-CN')).toBe('fr-FR');
    });
  });

  describe('SUPPORTED_LOCALES / LOCALE_NAMES', () => {
    it('SUPPORTED_LOCALES 为 4 种且不含 zh-TW', () => {
      // 旧自抄断言 length 5（含 zh-TW）；生产只有 4 种，此处记录生产真实集合
      expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'en-US', 'ja-JP', 'ko-KR']);
      expect(SUPPORTED_LOCALES).not.toContain('zh-TW');
    });

    it('SUPPORTED_LOCALES.includes 等价旧 isValidLocale 校验', () => {
      // 生产没有 isValidLocale 谓词，语言合法性以 SUPPORTED_LOCALES 成员判断
      expect(SUPPORTED_LOCALES.includes('zh-CN')).toBe(true);
      expect(SUPPORTED_LOCALES.includes('en-US')).toBe(true);
      expect(SUPPORTED_LOCALES.includes('fr-FR' as Locale)).toBe(false);
      expect(SUPPORTED_LOCALES.includes('' as Locale)).toBe(false);
    });

    it('LOCALE_NAMES 与 LOCALE_OPTIONS.nativeLabel 两处口径存在差异（记录）', () => {
      // 生产两处语言显示名不一致：i18n/index.tsx:149-154 的 LOCALE_NAMES['zh-CN'] 是「简体中文」，
      // LanguageSwitcher.tsx:21 的 LOCALE_OPTIONS['zh-CN'].nativeLabel 是「中文」→ 已列「生产缺陷候选」。
      expect(LOCALE_NAMES['zh-CN']).toBe('简体中文');
      expect(LOCALE_OPTIONS.find(option => option.key === 'zh-CN')!.nativeLabel).toBe('中文');
      for (const key of ['en-US', 'ja-JP', 'ko-KR'] as Locale[]) {
        expect(LOCALE_NAMES[key]).toBe(LOCALE_OPTIONS.find(option => option.key === key)!.nativeLabel);
      }
    });
  });

  // ==================== I18nManager 翻译键 ====================

  describe('I18nManager 翻译键', () => {
    function createRealManager() {
      return new I18nManager({
        defaultLocale: 'zh-CN',
        fallbackLocale: 'en-US',
        translations: messages,
      });
    }

    it('t() 用 "." 分隔解析嵌套键（替代旧 namespace:key 冒号键）', () => {
      const manager = createRealManager();
      expect(manager.t('common.search')).toBe('搜索');
      expect(manager.t('nav.home')).toBe('首页');
    });

    it('t() 未知键回退为 key 本身', () => {
      const manager = createRealManager();
      expect(manager.t('common.unknown')).toBe('common.unknown');
      expect(manager.t('noNamespaceAtAll')).toBe('noNamespaceAtAll');
    });

    it('t() 当前语言缺失时回退 fallbackLocale', () => {
      const manager = new I18nManager({
        defaultLocale: 'zh-CN',
        fallbackLocale: 'en-US',
        translations: {
          'zh-CN': { onlyZh: '仅中文' },
          'en-US': { onlyEn: 'English only', onlyZh: 'English fallback' },
        },
      });
      expect(manager.t('onlyEn')).toBe('English only');
      expect(manager.t('onlyZh')).toBe('仅中文');
      manager.setLocale('ja-JP');
      expect(manager.getLocale()).toBe('ja-JP');
      expect(manager.t('onlyZh')).toBe('English fallback');
    });

    it('t() 完成 {{param}} 插值', () => {
      const manager = new I18nManager({
        translations: {
          'zh-CN': {
            greeting: 'Hello {{name}}',
            composed: '{{greeting}}, {{name}}!',
          },
        },
      });
      expect(manager.t('greeting', { name: 'World' })).toBe('Hello World');
      expect(manager.t('composed', { greeting: 'Hi', name: 'ego' })).toBe('Hi, ego!');
    });

    it('t() 缺参时保留占位符', () => {
      const manager = new I18nManager({
        translations: { 'zh-CN': { greeting: 'Hello {{name}}' } },
      });
      expect(manager.t('greeting', {})).toBe('Hello {{name}}');
    });

    it('tn() 按 count 选择 one/other', () => {
      const manager = new I18nManager({
        translations: {
          'zh-CN': { item: { one: 'item', other: 'items' } },
        },
      });
      expect(manager.tn('item', 1)).toBe('item');
      expect(manager.tn('item', 0)).toBe('items');
      expect(manager.tn('item', 2)).toBe('items');
    });

    it('tn() 把 count 注入插值参数', () => {
      const manager = new I18nManager({
        translations: {
          'zh-CN': { counted: { one: '{{count}} item', other: '{{count}} items' } },
        },
      });
      expect(manager.tn('counted', 1)).toBe('1 item');
      expect(manager.tn('counted', 3)).toBe('3 items');
    });

    it('addTranslations 浅合并顶层键', () => {
      const manager = new I18nManager({
        translations: { 'zh-CN': { a: '1', b: '2' } },
      });
      manager.addTranslations('zh-CN', { b: 'B', c: 'C' });
      expect(manager.t('a')).toBe('1');
      expect(manager.t('b')).toBe('B');
      expect(manager.t('c')).toBe('C');
    });

    it('addTranslations 对嵌套对象是整体替换而非深合并', () => {
      const manager = new I18nManager({
        translations: {
          'zh-CN': { common: { search: '搜索', loading: '加载中...' } },
        },
      });
      manager.addTranslations('zh-CN', { common: { search: '搜' } });
      expect(manager.t('common.search')).toBe('搜');
      // 生产是 {...old, ...new} 顶层浅合并，common 子树被整体替换，loading 丢失并回退为 key
      expect(manager.t('common.loading')).toBe('common.loading');
    });

    it('has() 逐键判断（生产无批量 findMissingKeys）', () => {
      const manager = new I18nManager({
        translations: { 'zh-CN': { a: 'A', nested: { b: 'B' } } },
      });
      expect(manager.has('a')).toBe(true);
      expect(manager.has('nested.b')).toBe(true);
      expect(manager.has('c')).toBe(false);
      expect(manager.has('nested.c')).toBe(false);
      manager.addTranslations('zh-CN', { c: 'C' });
      expect(manager.has('c')).toBe(true);
    });

    it('getAvailableLocales() 返回 translations 的键', () => {
      const manager = createRealManager();
      // 旧自抄断言 5 种（含 zh-TW）；生产语言包只有 4 种
      expect(manager.getAvailableLocales()).toEqual(['zh-CN', 'en-US', 'ja-JP', 'ko-KR']);
    });
  });

  // ==================== i18nManager 格式化函数 ====================

  describe('i18nManager 格式化函数', () => {
    const date = new Date(2024, 2, 15, 12, 0, 0);

    it('formatDate zh-CN 使用 Intl 数字日期', () => {
      // 旧自抄模板断言 '2024-03-15'；生产 Intl 默认输出 '2024/03/15'
      expect(formatDate(date, 'zh-CN')).toBe('2024/03/15');
    });

    it('formatDate en-US 支持 number 入参', () => {
      expect(formatDate(date.getTime(), 'en-US')).toBe('03/15/2024');
    });

    it('formatDate ja-JP 使用 Intl 数字日期', () => {
      // 旧自抄模板断言 '2024年03月15日'；生产 Intl 同日文字符输出 '2024/03/15'
      expect(formatDate(date, 'ja-JP')).toBe('2024/03/15');
    });

    it('formatDate ko-KR 使用 Intl 数字日期', () => {
      expect(formatDate(date, 'ko-KR')).toBe('2024. 03. 15.');
    });

    it('formatNumber en-US 使用千分位与两位小数', () => {
      expect(formatNumber(1234567.89, 'en-US')).toBe('1,234,567.89');
    });

    it('formatNumber zh-CN 使用 Intl 分组', () => {
      expect(formatNumber(1234567.89, 'zh-CN')).toBe('1,234,567.89');
    });

    it('formatCurrency zh-CN 默认人民币带符号', () => {
      expect(formatCurrency(1234.5)).toBe('¥1,234.50');
      expect(formatCurrency(1234.5, 'zh-CN', 'CNY')).toBe('¥1,234.50');
    });

    it('formatCurrency en-US 的 USD', () => {
      expect(formatCurrency(1234.5, 'en-US', 'USD')).toBe('$1,234.50');
    });

    it('formatCurrency ja-JP 的 JPY 按 Intl 零小数', () => {
      // Intl 对 JPY 默认 0 位小数并四舍五入；旧自抄固定两位小数
      const result = formatCurrency(1234.5, 'ja-JP', 'JPY');
      expect(result.endsWith('1,235')).toBe(true);
      expect(result).not.toContain('.');
    });

    it('formatCurrency 币种由第 3 参决定而非 locale', () => {
      // 旧自抄 formatCurrency(value, locale) 由 locale 决定货币符号；生产第 3 参才是币种
      expect(formatCurrency(1234.5, 'zh-CN', 'USD')).toBe('US$1,234.50');
      expect(formatCurrency(1234.5, 'en-US', 'CNY')).toBe('CN¥1,234.50');
    });
  });

  // ==================== formatters（i18n/index.tsx） ====================

  describe('formatters（i18n/index.tsx）', () => {
    const date = new Date(2024, 2, 15, 12, 0, 0);

    it('formatters.date zh-CN 使用中文年月日且不补零', () => {
      // 旧自抄断言 '2024年03月15日'；生产模板不补零
      expect(formatters.date(date, 'zh-CN')).toBe('2024年3月15日');
    });

    it('formatters.date en-US 使用英文短月', () => {
      expect(formatters.date(date, 'en-US')).toBe('Mar 15, 2024');
    });

    it('formatters.date ja-JP 与 zh-CN 同模板', () => {
      expect(formatters.date(date, 'ja-JP')).toBe('2024年3月15日');
    });

    it('formatters.date ko-KR 使用韩文模板', () => {
      expect(formatters.date(date, 'ko-KR')).toBe('2024년 3월 15일');
    });

    it('formatters.number 使用 locale 原生分组', () => {
      expect(formatters.number(1234567.89, 'en-US')).toBe('1,234,567.89');
      expect(formatters.number(1234567.89, 'zh-CN')).toBe('1,234,567.89');
    });

    it('formatters.currency zh-CN 小额不带货币符号', () => {
      // 旧自抄 formatCurrency 断言含 '¥'；生产 formatters.currency 的 zh-CN 分支只输出金额
      expect(formatters.currency(1234.5, 'zh-CN')).toBe('1234.50');
      expect(formatters.currency(1234.5, 'zh-CN')).not.toContain('¥');
    });

    it('formatters.currency en-US 带 $ 符号', () => {
      expect(formatters.currency(1234.5, 'en-US')).toBe('$1,234.50');
    });

    it('formatters.currency ja-JP 带 ¥ 符号', () => {
      expect(formatters.currency(1234.5, 'ja-JP')).toBe('¥1,234.50');
    });

    it('formatters.currency zh-CN 大额使用万单位', () => {
      expect(formatters.currency(12345678, 'zh-CN')).toBe('1234.57万');
    });
  });

  // ==================== createTranslator ====================

  describe('createTranslator', () => {
    it('createTranslator 绑定指定语言且未知键回退', () => {
      const t = createTranslator('en-US');
      expect(t('common.search')).toBe('Search');
      expect(t('common.unknown')).toBe('common.unknown');
      expect(createTranslator('ja-JP')('common.search')).toBe('検索');
    });
  });

  // ==================== I18nProvider + LanguageSwitcher（真实渲染） ====================

  describe('I18nProvider + LanguageSwitcher（真实渲染）', () => {
    it('Ctrl+Shift+L 从 zh-CN 切到 en-US', () => {
      const view = renderSwitcher();
      expect(view.getByTestId('locale').textContent).toBe('zh-CN');

      pressLocaleHotkey();

      expect(view.getByTestId('locale').textContent).toBe('en-US');
      expect(localStorage.getItem('locale')).toBe('en-US');
      expect(document.documentElement.lang).toBe('en-US');
      expect(document.documentElement.classList.contains('cjk-locale')).toBe(false);
    });

    it('再次按快捷键切到 ja-JP 并加 cjk-locale', () => {
      const view = renderSwitcher();
      pressLocaleHotkey();
      pressLocaleHotkey();

      expect(view.getByTestId('locale').textContent).toBe('ja-JP');
      expect(document.documentElement.lang).toBe('ja-JP');
      expect(document.documentElement.classList.contains('cjk-locale')).toBe(true);
    });

    it('localStorage 固定键名 locale（无 prefix）', () => {
      const view = renderSwitcher();
      pressLocaleHotkey();

      expect(view.getByTestId('locale').textContent).toBe('en-US');
      // 旧自抄断言 buildLocaleStorageKey('app') === 'app:locale'；生产固定单键 'locale'
      expect(localStorage.length).toBe(1);
      expect(localStorage.key(0)).toBe('locale');
      expect(localStorage.getItem('locale')).toBe('en-US');
    });

    it('I18nProvider 优先读取 localStorage 已保存语言', () => {
      localStorage.setItem('locale', 'ja-JP');
      const view = render(
        React.createElement(
          I18nProvider,
          { defaultLocale: 'zh-CN' },
          React.createElement(LocaleProbe, null)
        )
      );
      expect(view.getByTestId('locale').textContent).toBe('ja-JP');
      expect(document.documentElement.lang).toBe('ja-JP');
    });
  });
});
