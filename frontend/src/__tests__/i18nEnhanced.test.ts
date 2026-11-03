/**
 * Round 164 - 国际化深化测试
 * 测试语言切换UI/RTL支持/动态加载/SEO多语言/日期货币完善
 *
 * 影子测试治理批次 2：能绑定真实实现的段落已改为 import 生产代码：
 * - frontend/src/components/Common/LanguageSwitcher.tsx（LOCALE_OPTIONS / isCJKLocale / 组件渲染）
 * - frontend/src/utils/rtlSupport.ts
 * - frontend/src/utils/seoI18n.ts
 * - frontend/src/utils/enhancedFormatters.ts
 * - frontend/src/i18n/index.tsx 与 locales/zh-CN、locales/en-US
 *
 * 仅 "Dynamic Locale Loader" 段落仍为内联副本：生产代码目前是静态 import 语言包，
 * 没有 preload/cache/status 这套动态加载机制，无法绑定（详见迁移报告）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import LanguageSwitcher, {
  LOCALE_OPTIONS,
  isCJKLocale,
} from '../components/Common/LanguageSwitcher';
import { I18nProvider, createTranslator, messages, formatters } from '../i18n';
import type { Locale } from '../i18n';
import {
  RTL_LOCALES,
  getDirection,
  RTL_PROPERTIES,
  getFlexDirection,
} from '../utils/rtlSupport';
import {
  formatRelativeTime,
  formatTradingSession,
  getChangeColor,
  getCurrencySymbol,
  formatLargeNumber,
  getMarketTrendLabel,
} from '../utils/enhancedFormatters';
import seoI18n, {
  generateHreflangTags,
  generateLanguageStructuredData,
} from '../utils/seoI18n';

/** 用真实 I18nProvider + LanguageSwitcher 渲染指定语言 */
function renderSwitcher(
  defaultLocale: Locale = 'zh-CN',
  variant?: 'dropdown' | 'segmented' | 'minimal'
) {
  return render(
    React.createElement(
      I18nProvider,
      { defaultLocale },
      React.createElement(LanguageSwitcher, variant ? { variant } : {})
    )
  );
}

// ==================== 语言切换UI ====================

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

describe('LanguageSwitcher Enhanced', () => {
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

  describe('Locale Options完整性', () => {
    it('应该有4种语言', () => {
      expect(LOCALE_OPTIONS).toHaveLength(4);
    });

    it('每种语言都有完整字段', () => {
      LOCALE_OPTIONS.forEach(opt => {
        expect(opt.key).toBeTruthy();
        expect(opt.label).toBeTruthy();
        expect(opt.nativeLabel).toBeTruthy();
        expect(opt.flag).toBeTruthy();
        expect(['ltr', 'rtl']).toContain(opt.dir);
        expect(['cjk', 'latin']).toContain(opt.group);
      });
    });

    it('CJK分组包含中日韩', () => {
      const cjk = LOCALE_OPTIONS.filter(o => o.group === 'cjk');
      expect(cjk).toHaveLength(3);
      expect(cjk.map(o => o.key)).toEqual(['zh-CN', 'ja-JP', 'ko-KR']);
    });

    it('Latin分组包含英文', () => {
      const latin = LOCALE_OPTIONS.filter(o => o.group === 'latin');
      expect(latin).toHaveLength(1);
      expect(latin[0].key).toBe('en-US');
    });
  });

  describe('当前语言匹配', () => {
    it('应该正确匹配zh-CN', () => {
      renderSwitcher('zh-CN');
      const btn = screen.getByRole('button');
      expect(btn.textContent).toContain('中文');
      expect(btn.textContent).toContain('🇨🇳');
    });

    it('应该正确匹配en-US', () => {
      renderSwitcher('en-US');
      const btn = screen.getByRole('button');
      expect(btn.textContent).toContain('English');
      expect(btn.textContent).toContain('🇺🇸');
    });

    it('应该正确匹配ja-JP', () => {
      renderSwitcher('ja-JP');
      const btn = screen.getByRole('button');
      expect(btn.textContent).toContain('日本語');
      expect(btn.textContent).toContain('🇯🇵');
    });

    it('应该正确匹配ko-KR', () => {
      renderSwitcher('ko-KR');
      const btn = screen.getByRole('button');
      expect(btn.textContent).toContain('한국어');
      expect(btn.textContent).toContain('🇰🇷');
    });

    it('未知语言应该fallback到zh-CN', () => {
      // 组件内 current = find(locale) || LOCALE_OPTIONS[0]，用非法 locale 触发 fallback 分支
      renderSwitcher('xx-XX' as unknown as Locale);
      expect(screen.getByRole('button').textContent).toContain('中文');
    });
  });

  describe('快捷键循环切换', () => {
    const pressShortcut = () =>
      fireEvent.keyDown(window, { key: 'l', ctrlKey: true, shiftKey: true });

    it('zh-CN → en-US', () => {
      renderSwitcher('zh-CN');
      pressShortcut();
      expect(document.documentElement.lang).toBe('en-US');
      expect(localStorage.getItem('locale')).toBe('en-US');
    });

    it('en-US → ja-JP', () => {
      renderSwitcher('en-US');
      pressShortcut();
      expect(document.documentElement.lang).toBe('ja-JP');
      expect(localStorage.getItem('locale')).toBe('ja-JP');
    });

    it('ja-JP → ko-KR', () => {
      renderSwitcher('ja-JP');
      pressShortcut();
      expect(document.documentElement.lang).toBe('ko-KR');
      expect(localStorage.getItem('locale')).toBe('ko-KR');
    });

    it('ko-KR → zh-CN (循环)', () => {
      renderSwitcher('ko-KR');
      pressShortcut();
      expect(document.documentElement.lang).toBe('zh-CN');
      expect(localStorage.getItem('locale')).toBe('zh-CN');
    });
  });

  describe('显示变体', () => {
    it('支持3种显示变体', () => {
      const cases = [
        { variant: 'dropdown' as const, buttons: 1 },
        { variant: 'segmented' as const, buttons: 4 },
        { variant: 'minimal' as const, buttons: 4 },
      ];
      cases.forEach(({ variant, buttons }) => {
        renderSwitcher('zh-CN', variant);
        expect(screen.getAllByRole('button')).toHaveLength(buttons);
        cleanup();
      });
    });

    it('每种变体都有效', () => {
      renderSwitcher('zh-CN', 'minimal');
      const labels = screen.getAllByRole('button').map(b => b.getAttribute('aria-label'));
      expect(labels).toEqual([
        'Switch to Chinese',
        'Switch to English',
        'Switch to Japanese',
        'Switch to Korean',
      ]);
    });
  });
});

// ==================== RTL支持 ====================

describe('RTL Support', () => {
  describe('方向检测', () => {
    it('zh-CN应该是ltr', () => {
      expect(getDirection('zh-CN')).toBe('ltr');
    });

    it('en-US应该是ltr', () => {
      expect(getDirection('en-US')).toBe('ltr');
    });

    it('ja-JP应该是ltr', () => {
      expect(getDirection('ja-JP')).toBe('ltr');
    });

    it('ko-KR应该是ltr', () => {
      expect(getDirection('ko-KR')).toBe('ltr');
    });

    it('当前所有语言都不是RTL', () => {
      expect(RTL_LOCALES).toHaveLength(0);
      LOCALE_OPTIONS.forEach(opt => {
        expect(getDirection(opt.key)).toBe('ltr');
      });
    });
  });

  describe('RTL属性映射', () => {
    it('LTR模式下marginStart是marginLeft', () => {
      expect(RTL_PROPERTIES.marginStart('zh-CN')).toBe('marginLeft');
    });

    it('LTR模式下marginEnd是marginRight', () => {
      expect(RTL_PROPERTIES.marginEnd('zh-CN')).toBe('marginRight');
    });

    it('LTR模式下textAlign是left', () => {
      expect(RTL_PROPERTIES.textAlign('zh-CN')).toBe('left');
    });
  });

  describe('Flex方向适配', () => {
    it('LTR模式row不变', () => {
      expect(getFlexDirection('en-US', 'row')).toBe('row');
    });

    it('column方向不随RTL变化', () => {
      expect(getFlexDirection('en-US', 'column')).toBe('column');
    });
  });
});

// ==================== 动态语言包加载 ====================
// 注意：生产代码暂无动态加载/缓存实现（i18n/index.tsx 为静态 import），
// 本段保留为设计意图用例，属于无法绑定真实实现的影子用例。

describe('Dynamic Locale Loader', () => {
  const LOCALE_IMPORTERS: Record<Locale, () => Promise<any>> = {
    'zh-CN': () => Promise.resolve({ default: { test: '测试' } }),
    'en-US': () => Promise.resolve({ default: { test: 'Test' } }),
    'ja-JP': () => Promise.resolve({ default: { test: 'テスト' } }),
    'ko-KR': () => Promise.resolve({ default: { test: '테스트' } }),
  };

  const cache = new Map<string, any>();

  const preloadLocale = async (locale: Locale) => {
    if (cache.has(locale)) return cache.get(locale);
    const mod = await LOCALE_IMPORTERS[locale]();
    const entry = { status: 'loaded', messages: mod.default };
    cache.set(locale, entry);
    return entry;
  };

  describe('预加载', () => {
    it('应该能预加载zh-CN', async () => {
      const result = await preloadLocale('zh-CN');
      expect(result.status).toBe('loaded');
      expect(result.messages.test).toBe('测试');
    });

    it('应该能预加载en-US', async () => {
      const result = await preloadLocale('en-US');
      expect(result.status).toBe('loaded');
      expect(result.messages.test).toBe('Test');
    });

    it('应该能预加载ja-JP', async () => {
      const result = await preloadLocale('ja-JP');
      expect(result.status).toBe('loaded');
      expect(result.messages.test).toBe('テスト');
    });

    it('应该能预加载ko-KR', async () => {
      const result = await preloadLocale('ko-KR');
      expect(result.status).toBe('loaded');
      expect(result.messages.test).toBe('테스트');
    });
  });

  describe('缓存', () => {
    it('重复加载应该走缓存', async () => {
      await preloadLocale('zh-CN');
      expect(cache.has('zh-CN')).toBe(true);
    });

    it('清除缓存后应重新加载', () => {
      cache.delete('zh-CN');
      expect(cache.has('zh-CN')).toBe(false);
    });

    it('批量预加载', async () => {
      cache.clear();
      const locales: Locale[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
      await Promise.all(locales.map(l => preloadLocale(l)));
      expect(cache.size).toBe(4);
    });
  });

  describe('缓存统计', () => {
    it('应该正确统计加载状态', () => {
      const stats = { total: 0, loaded: 0, loading: 0, error: 0 };
      cache.forEach(entry => {
        stats.total++;
        if (entry.status === 'loaded') stats.loaded++;
      });
      expect(stats.loaded).toBe(4);
      expect(stats.error).toBe(0);
    });
  });
});

// ==================== SEO多语言 ====================

describe('SEO i18n', () => {
  const HREFLANG_MAP = seoI18n.HREFLANG_MAP;
  const OG_LOCALE_MAP = seoI18n.OG_LOCALE_MAP;

  describe('hreflang映射', () => {
    it('每种语言都有hreflang代码', () => {
      LOCALE_OPTIONS.forEach(opt => {
        expect(HREFLANG_MAP[opt.key]).toBeTruthy();
      });
    });

    it('zh-CN映射正确', () => {
      expect(HREFLANG_MAP['zh-CN']).toBe('zh-CN');
    });

    it('en-US映射正确', () => {
      expect(HREFLANG_MAP['en-US']).toBe('en-US');
    });
  });

  describe('Open Graph locale', () => {
    it('每种语言都有OG locale', () => {
      LOCALE_OPTIONS.forEach(opt => {
        expect(OG_LOCALE_MAP[opt.key]).toBeTruthy();
      });
    });

    it('OG locale用下划线分隔', () => {
      Object.values(OG_LOCALE_MAP).forEach(loc => {
        expect(loc).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
      });
    });
  });

  describe('hreflang标签生成', () => {
    it('应该生成4个hreflang标签 + x-default', () => {
      const urls = {
        'zh-CN': 'https://example.com/zh',
        'en-US': 'https://example.com/en',
        'ja-JP': 'https://example.com/ja',
        'ko-KR': 'https://example.com/ko',
      };
      const html = generateHreflangTags(urls);
      const lines = html.split('\n');
      expect(lines).toHaveLength(5); // 4 locales + x-default
    });

    it('应该包含x-default', () => {
      const urls = { 'en-US': 'https://example.com/en' } as Record<Locale, string>;
      const html = generateHreflangTags(urls);
      expect(html).toContain('x-default');
      expect(html).toContain('https://example.com/en');
    });
  });

  describe('结构化数据', () => {
    it('应该包含正确的语言标记', () => {
      const data = JSON.parse(generateLanguageStructuredData('zh-CN', '首页', 'https://example.com'));
      expect(data.inLanguage).toBe('zh-CN');
      expect(data['@type']).toBe('WebPage');
    });

    it('应该生成有效的JSON-LD', () => {
      const json = generateLanguageStructuredData('en-US', 'Home', 'https://example.com');
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});

// ==================== 增强格式化器 ====================

describe('Enhanced Formatters', () => {
  describe('相对时间', () => {
    const now = new Date('2024-01-15T10:00:00');

    it('30秒前 → 刚刚', () => {
      const d = new Date('2024-01-15T09:59:30');
      expect(formatRelativeTime(d, 'zh-CN', now)).toBe('刚刚');
    });

    it('5分钟前 → 5分钟前', () => {
      const d = new Date('2024-01-15T09:55:00');
      expect(formatRelativeTime(d, 'zh-CN', now)).toBe('5分钟前');
    });

    it('2小时前 → 2小时前', () => {
      const d = new Date('2024-01-15T08:00:00');
      expect(formatRelativeTime(d, 'zh-CN', now)).toBe('2小时前');
    });

    it('英文：5 min ago', () => {
      const d = new Date('2024-01-15T09:55:00');
      expect(formatRelativeTime(d, 'en-US', now)).toBe('5 min ago');
    });

    it('日文：5分前', () => {
      const d = new Date('2024-01-15T09:55:00');
      expect(formatRelativeTime(d, 'ja-JP', now)).toBe('5分前');
    });

    it('韩文：5분 전', () => {
      const d = new Date('2024-01-15T09:55:00');
      expect(formatRelativeTime(d, 'ko-KR', now)).toBe('5분 전');
    });
  });

  describe('涨跌颜色', () => {
    it('CJK地区：涨=红', () => {
      expect(getChangeColor(1.5, 'zh-CN')).toBe('#ef4444');
    });

    it('CJK地区：跌=绿', () => {
      expect(getChangeColor(-1.5, 'zh-CN')).toBe('#22c55e');
    });

    it('西方：涨=绿', () => {
      expect(getChangeColor(1.5, 'en-US')).toBe('#22c55e');
    });

    it('西方：跌=红', () => {
      expect(getChangeColor(-1.5, 'en-US')).toBe('#ef4444');
    });

    it('平盘=灰', () => {
      expect(getChangeColor(0, 'zh-CN')).toBe('#6b7280');
    });
  });

  describe('币种符号', () => {
    it('人民币 ¥', () => expect(getCurrencySymbol('zh-CN')).toBe('¥'));
    it('美元 $', () => expect(getCurrencySymbol('en-US')).toBe('$'));
    it('日元 ¥', () => expect(getCurrencySymbol('ja-JP')).toBe('¥'));
    it('韩元 ₩', () => expect(getCurrencySymbol('ko-KR')).toBe('₩'));
  });

  describe('大数字格式化', () => {
    it('中文：1万亿', () => {
      expect(formatLargeNumber(1.5e12, 'zh-CN')).toBe('1.50万亿');
    });

    it('中文：100亿', () => {
      expect(formatLargeNumber(100e8, 'zh-CN')).toBe('100.00亿');
    });

    it('英文：1.5T', () => {
      expect(formatLargeNumber(1.5e12, 'en-US')).toBe('1.50T');
    });

    it('英文：500M', () => {
      expect(formatLargeNumber(500e6, 'en-US')).toBe('500.00M');
    });

    it('日文：1兆', () => {
      expect(formatLargeNumber(1e12, 'ja-JP')).toBe('1.00兆');
    });

    it('韩文：1조', () => {
      expect(formatLargeNumber(1e12, 'ko-KR')).toBe('1.00조');
    });
  });

  describe('交易时段', () => {
    it('中文：交易中/已休市', () => {
      expect(formatTradingSession(true, 'zh-CN')).toBe('交易中');
      expect(formatTradingSession(false, 'zh-CN')).toBe('已休市');
    });

    it('英文：Market Open/Closed', () => {
      expect(formatTradingSession(true, 'en-US')).toBe('Market Open');
      expect(formatTradingSession(false, 'en-US')).toBe('Market Closed');
    });

    it('日文：取引中/取引終了', () => {
      expect(formatTradingSession(true, 'ja-JP')).toBe('取引中');
      expect(formatTradingSession(false, 'ja-JP')).toBe('取引終了');
    });

    it('韩文：거래 중/거래 종료', () => {
      expect(formatTradingSession(true, 'ko-KR')).toBe('거래 중');
      expect(formatTradingSession(false, 'ko-KR')).toBe('거래 종료');
    });
  });

  describe('市场趋势文案', () => {
    it('中文四态', () => {
      expect(getMarketTrendLabel('up', 'zh-CN')).toBe('上涨');
      expect(getMarketTrendLabel('down', 'zh-CN')).toBe('下跌');
      expect(getMarketTrendLabel('flat', 'zh-CN')).toBe('平盘');
    });

    it('英文四态', () => {
      expect(getMarketTrendLabel('up', 'en-US')).toBe('Rising');
      expect(getMarketTrendLabel('down', 'en-US')).toBe('Falling');
      expect(getMarketTrendLabel('flat', 'en-US')).toBe('Unchanged');
    });

    it('日文四态', () => {
      expect(getMarketTrendLabel('up', 'ja-JP')).toBe('上昇');
      expect(getMarketTrendLabel('down', 'ja-JP')).toBe('下落');
      expect(getMarketTrendLabel('flat', 'ja-JP')).toBe('変動なし');
    });
  });

  describe('CJK检测', () => {
    it('zh-CN是CJK', () => expect(isCJKLocale('zh-CN')).toBe(true));
    it('ja-JP是CJK', () => expect(isCJKLocale('ja-JP')).toBe(true));
    it('ko-KR是CJK', () => expect(isCJKLocale('ko-KR')).toBe(true));
    it('en-US不是CJK', () => expect(isCJKLocale('en-US')).toBe(false));
  });
});

// ==================== 动态语言包内容验证 ====================

describe('Dynamic Locale Pack Content', () => {
  const tZh = createTranslator('zh-CN');
  const tEn = createTranslator('en-US');

  describe('中文语言包', () => {
    it('有完整的高级筛选翻译', () => {
      expect(tZh('advancedScreener.title')).toBe('高级选股器');
      expect(tZh('advancedScreener.saveAsTemplate')).toBeTruthy();
    });

    it('有完整的导出翻译', () => {
      expect(tZh('export.title')).toBe('数据导出');
      expect(tZh('export.success')).toBe('导出成功');
    });

    it('有完整的错误翻译', () => {
      expect(tZh('errors.networkError')).toBeTruthy();
      expect(tZh('errors.serverError')).toBeTruthy();
      expect(tZh('errors.notFound')).toBeTruthy();
    });
  });

  describe('英文语言包', () => {
    it('有完整的英文翻译', () => {
      expect(tEn('advancedScreener.title')).toBe('Advanced Screener');
      expect(tEn('export.success')).toBe('Export successful');
    });
  });

  describe('语言包完整性对比', () => {
    it('中英文语言包都有内容', () => {
      const zhKeys = Object.keys(messages['zh-CN']);
      const enKeys = Object.keys(messages['en-US']);
      expect(zhKeys.length).toBeGreaterThan(0);
      expect(enKeys.length).toBeGreaterThan(0);
      expect(enKeys.sort()).toEqual(zhKeys.sort());
    });
  });
});

// ==================== 集成场景 ====================

describe('i18n Integration Scenarios', () => {
  describe('语言切换流程', () => {
    let currentLocale: Locale = 'zh-CN';
    const setLocale = (l: Locale) => { currentLocale = l; };

    it('切换到en-US时方向为ltr，非CJK', () => {
      setLocale('en-US');
      expect(getDirection(currentLocale)).toBe('ltr');
      expect(isCJKLocale(currentLocale)).toBe(false);
    });

    it('切换到ja-JP时方向为ltr，CJK', () => {
      setLocale('ja-JP');
      expect(getDirection(currentLocale)).toBe('ltr');
      expect(isCJKLocale(currentLocale)).toBe(true);
    });

    it('切换回zh-CN恢复CJK', () => {
      setLocale('zh-CN');
      expect(isCJKLocale(currentLocale)).toBe(true);
    });
  });

  describe('完整格式化链', () => {
    const format = (value: number, locale: Locale) => ({
      text: formatters.percent(value, locale),
      color: getChangeColor(value, locale),
    });

    it('中文 +3.5% → 红色', () => {
      const r = format(3.5, 'zh-CN');
      expect(r.text).toBe('+3.50%');
      expect(r.color).toBe('#ef4444');
    });

    it('英文 +3.5% → 绿色', () => {
      const r = format(3.5, 'en-US');
      expect(r.text).toBe('+3.50%');
      expect(r.color).toBe('#22c55e');
    });

    it('中文 -2.1% → 绿色', () => {
      const r = format(-2.1, 'zh-CN');
      expect(r.text).toBe('-2.10%');
      expect(r.color).toBe('#22c55e');
    });
  });
});
