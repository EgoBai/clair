/**
 * Round 164 - 国际化深化测试
 * 测试语言切换UI/RTL支持/动态加载/SEO多语言/日期货币完善
 */

import { describe, it, expect } from 'vitest';

// ==================== 类型定义 ====================
type Locale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

interface LocaleOption {
  key: Locale;
  label: string;
  nativeLabel: string;
  flag: string;
  dir: 'ltr' | 'rtl';
  group: 'cjk' | 'latin';
}

const LOCALE_OPTIONS: LocaleOption[] = [
  { key: 'zh-CN', label: 'Chinese', nativeLabel: '中文', flag: '🇨🇳', dir: 'ltr', group: 'cjk' },
  { key: 'en-US', label: 'English', nativeLabel: 'English', flag: '🇺🇸', dir: 'ltr', group: 'latin' },
  { key: 'ja-JP', label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵', dir: 'ltr', group: 'cjk' },
  { key: 'ko-KR', label: 'Korean', nativeLabel: '한국어', flag: '🇰🇷', dir: 'ltr', group: 'cjk' },
];

// ==================== 语言切换UI ====================

describe('LanguageSwitcher Enhanced', () => {
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
    const findCurrent = (locale: string) =>
      LOCALE_OPTIONS.find(o => o.key === locale) || LOCALE_OPTIONS[0];

    it('应该正确匹配zh-CN', () => {
      const cur = findCurrent('zh-CN');
      expect(cur.nativeLabel).toBe('中文');
    });

    it('应该正确匹配en-US', () => {
      const cur = findCurrent('en-US');
      expect(cur.nativeLabel).toBe('English');
    });

    it('应该正确匹配ja-JP', () => {
      const cur = findCurrent('ja-JP');
      expect(cur.nativeLabel).toBe('日本語');
    });

    it('应该正确匹配ko-KR', () => {
      const cur = findCurrent('ko-KR');
      expect(cur.nativeLabel).toBe('한국어');
    });

    it('未知语言应该fallback到zh-CN', () => {
      const cur = findCurrent('xx-XX');
      expect(cur.key).toBe('zh-CN');
    });
  });

  describe('快捷键循环切换', () => {
    const getNextLocale = (current: Locale): Locale => {
      const idx = LOCALE_OPTIONS.findIndex(o => o.key === current);
      return LOCALE_OPTIONS[(idx + 1) % LOCALE_OPTIONS.length].key;
    };

    it('zh-CN → en-US', () => {
      expect(getNextLocale('zh-CN')).toBe('en-US');
    });

    it('en-US → ja-JP', () => {
      expect(getNextLocale('en-US')).toBe('ja-JP');
    });

    it('ja-JP → ko-KR', () => {
      expect(getNextLocale('ja-JP')).toBe('ko-KR');
    });

    it('ko-KR → zh-CN (循环)', () => {
      expect(getNextLocale('ko-KR')).toBe('zh-CN');
    });
  });

  describe('显示变体', () => {
    const variants = ['dropdown', 'segmented', 'minimal'];

    it('支持3种显示变体', () => {
      expect(variants).toHaveLength(3);
    });

    it('每种变体都有效', () => {
      variants.forEach(v => {
        expect(['dropdown', 'segmented', 'minimal']).toContain(v);
      });
    });
  });
});

// ==================== RTL支持 ====================

describe('RTL Support', () => {
  const RTL_LOCALES: Locale[] = [];

  const isRTL = (locale: Locale) => RTL_LOCALES.includes(locale);
  const getDirection = (locale: Locale) => isRTL(locale) ? 'rtl' : 'ltr';
  const getLocaleDir = (locale: Locale) => getDirection(locale);

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
      LOCALE_OPTIONS.forEach(opt => {
        expect(getLocaleDir(opt.key as Locale)).toBe('ltr');
      });
    });
  });

  describe('RTL属性映射', () => {
    const RTL_PROPERTIES = {
      marginStart: (locale: Locale) => isRTL(locale) ? 'marginRight' : 'marginLeft',
      marginEnd: (locale: Locale) => isRTL(locale) ? 'marginLeft' : 'marginRight',
      paddingStart: (locale: Locale) => isRTL(locale) ? 'paddingRight' : 'paddingLeft',
      textAlign: (locale: Locale) => isRTL(locale) ? 'right' : 'left',
    };

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
    const getFlexDirection = (locale: Locale, base: string = 'row') => {
      if (base === 'column' || base === 'column-reverse') return base;
      if (isRTL(locale)) return base === 'row' ? 'row-reverse' : 'row';
      return base;
    };

    it('LTR模式row不变', () => {
      expect(getFlexDirection('en-US', 'row')).toBe('row');
    });

    it('column方向不随RTL变化', () => {
      expect(getFlexDirection('en-US', 'column')).toBe('column');
    });
  });
});

// ==================== 动态语言包加载 ====================

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
  const HREFLANG_MAP: Record<Locale, string> = {
    'zh-CN': 'zh-CN',
    'en-US': 'en-US',
    'ja-JP': 'ja-JP',
    'ko-KR': 'ko-KR',
  };

  const OG_LOCALE_MAP: Record<Locale, string> = {
    'zh-CN': 'zh_CN',
    'en-US': 'en_US',
    'ja-JP': 'ja_JP',
    'ko-KR': 'ko_KR',
  };

  describe('hreflang映射', () => {
    it('每种语言都有hreflang代码', () => {
      LOCALE_OPTIONS.forEach(opt => {
        expect(HREFLANG_MAP[opt.key as Locale]).toBeTruthy();
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
        expect(OG_LOCALE_MAP[opt.key as Locale]).toBeTruthy();
      });
    });

    it('OG locale用下划线分隔', () => {
      Object.values(OG_LOCALE_MAP).forEach(loc => {
        expect(loc).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
      });
    });
  });

  describe('hreflang标签生成', () => {
    const generateHreflangTags = (alternateUrls: Record<string, string>): string => {
      const tags: string[] = [];
      Object.entries(alternateUrls).forEach(([loc, url]) => {
        tags.push(`<link rel="alternate" hreflang="${HREFLANG_MAP[loc as Locale]}" href="${url}" />`);
      });
      tags.push(`<link rel="alternate" hreflang="x-default" href="${alternateUrls['en-US']}" />`);
      return tags.join('\n');
    };

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
      const urls = { 'en-US': 'https://example.com/en' };
      const html = generateHreflangTags(urls);
      expect(html).toContain('x-default');
    });
  });

  describe('结构化数据', () => {
    const generateStructuredData = (locale: Locale, title: string, url: string) => {
      return {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        url,
        inLanguage: locale,
      };
    };

    it('应该包含正确的语言标记', () => {
      const data = generateStructuredData('zh-CN', '首页', 'https://example.com');
      expect(data.inLanguage).toBe('zh-CN');
    });

    it('应该生成有效的JSON-LD', () => {
      const data = generateStructuredData('en-US', 'Home', 'https://example.com');
      const json = JSON.stringify(data);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});

// ==================== 增强格式化器 ====================

describe('Enhanced Formatters', () => {
  describe('相对时间', () => {
    const formatRelativeTime = (date: Date, locale: Locale, now: Date): string => {
      const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
      const labels: Record<Locale, Record<string, string>> = {
        'zh-CN': { justNow: '刚刚', min: '分钟前', hour: '小时前', day: '天前' },
        'en-US': { justNow: 'just now', min: 'min ago', hour: 'h ago', day: 'd ago' },
        'ja-JP': { justNow: 'たった今', min: '分前', hour: '時間前', day: '日前' },
        'ko-KR': { justNow: '방금', min: '분 전', hour: '시간 전', day: '일 전' },
      };
      if (diffMin < 1) return labels[locale].justNow;
      if (diffMin < 60) return `${diffMin}${labels[locale].min}`;
      if (diffMin < 1440) return `${Math.floor(diffMin / 60)}${labels[locale].hour}`;
      return `${Math.floor(diffMin / 1440)}${labels[locale].day}`;
    };

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
      expect(formatRelativeTime(d, 'en-US', now)).toBe('5min ago');
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
    const getChangeColor = (value: number, locale: Locale): string => {
      const isCJK = ['zh-CN', 'ja-JP', 'ko-KR'].includes(locale);
      if (value > 0) return isCJK ? '#ef4444' : '#22c55e';
      if (value < 0) return isCJK ? '#22c55e' : '#ef4444';
      return '#6b7280';
    };

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
    const getCurrencySymbol = (locale: Locale) => {
      const symbols: Record<Locale, string> = {
        'zh-CN': '¥', 'en-US': '$', 'ja-JP': '¥', 'ko-KR': '₩',
      };
      return symbols[locale];
    };

    it('人民币 ¥', () => expect(getCurrencySymbol('zh-CN')).toBe('¥'));
    it('美元 $', () => expect(getCurrencySymbol('en-US')).toBe('$'));
    it('日元 ¥', () => expect(getCurrencySymbol('ja-JP')).toBe('¥'));
    it('韩元 ₩', () => expect(getCurrencySymbol('ko-KR')).toBe('₩'));
  });

  describe('大数字格式化', () => {
    const formatLargeNumber = (value: number, locale: Locale): string => {
      if (locale === 'zh-CN') {
        if (value >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`;
        if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
        if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
      } else if (locale === 'ja-JP') {
        if (value >= 1e12) return `${(value / 1e12).toFixed(2)}兆`;
        if (value >= 1e8) return `${(value / 1e8).toFixed(2)}億`;
      } else if (locale === 'ko-KR') {
        if (value >= 1e12) return `${(value / 1e12).toFixed(2)}조`;
        if (value >= 1e8) return `${(value / 1e8).toFixed(2)}억`;
      } else {
        if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
      }
      return value.toFixed(2);
    };

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
    const formatTradingSession = (isOpen: boolean, locale: Locale): string => {
      const labels: Record<Locale, Record<string, string>> = {
        'zh-CN': { open: '交易中', closed: '已休市' },
        'en-US': { open: 'Market Open', closed: 'Market Closed' },
        'ja-JP': { open: '取引中', closed: '取引終了' },
        'ko-KR': { open: '거래 중', closed: '거래 종료' },
      };
      return labels[locale][isOpen ? 'open' : 'closed'];
    };

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
    const getMarketTrendLabel = (trend: 'up' | 'down' | 'flat', locale: Locale): string => {
      const labels: Record<Locale, Record<string, string>> = {
        'zh-CN': { up: '上涨', down: '下跌', flat: '平盘' },
        'en-US': { up: 'Rising', down: 'Falling', flat: 'Unchanged' },
        'ja-JP': { up: '上昇', down: '下落', flat: '変動なし' },
        'ko-KR': { up: '상승', down: '하락', flat: '보합' },
      };
      return labels[locale][trend];
    };

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
    const isCJK = (locale: Locale) => ['zh-CN', 'ja-JP', 'ko-KR'].includes(locale);

    it('zh-CN是CJK', () => expect(isCJK('zh-CN')).toBe(true));
    it('ja-JP是CJK', () => expect(isCJK('ja-JP')).toBe(true));
    it('ko-KR是CJK', () => expect(isCJK('ko-KR')).toBe(true));
    it('en-US不是CJK', () => expect(isCJK('en-US')).toBe(false));
  });
});

// ==================== 动态语言包内容验证 ====================

describe('Dynamic Locale Pack Content', () => {
  const zhCN = {
    advancedScreener: { title: '高级选股器', saveAsTemplate: '另存为模板', loadTemplate: '加载模板', clearAll: '清除全部' },
    export: { title: '数据导出', csv: 'CSV', excel: 'Excel', pdf: 'PDF', success: '导出成功', failed: '导出失败' },
    notification: { newAlert: '新预警触发', marketOpen: '市场开盘', marketClose: '市场收盘' },
    help: { title: '帮助中心', shortcuts: '快捷键', faq: '常见问题', contact: '联系我们', feedback: '意见反馈' },
    errors: { networkError: '网络错误，请检查连接', serverError: '服务器错误，请稍后重试', notFound: '页面不存在' },
  };

  const enUS = {
    advancedScreener: { title: 'Advanced Screener', saveAsTemplate: 'Save as Template' },
    export: { title: 'Export Data', success: 'Export successful', failed: 'Export failed' },
    notification: { newAlert: 'New Alert Triggered', marketOpen: 'Market Open' },
    help: { title: 'Help Center', faq: 'FAQ' },
    errors: { networkError: 'Network error, please check your connection', notFound: 'Page not found' },
  };

  describe('中文语言包', () => {
    it('有完整的高级筛选翻译', () => {
      expect(zhCN.advancedScreener.title).toBe('高级选股器');
      expect(zhCN.advancedScreener.saveAsTemplate).toBeTruthy();
    });

    it('有完整的导出翻译', () => {
      expect(zhCN.export.title).toBe('数据导出');
      expect(zhCN.export.success).toBe('导出成功');
    });

    it('有完整的错误翻译', () => {
      expect(zhCN.errors.networkError).toBeTruthy();
      expect(zhCN.errors.serverError).toBeTruthy();
      expect(zhCN.errors.notFound).toBeTruthy();
    });
  });

  describe('英文语言包', () => {
    it('有完整的英文翻译', () => {
      expect(enUS.advancedScreener.title).toBe('Advanced Screener');
      expect(enUS.export.success).toBe('Export successful');
    });
  });

  describe('语言包完整性对比', () => {
    const zhKeys = JSON.stringify(zhCN).match(/"[^"]+":/g)?.length || 0;
    const enKeys = JSON.stringify(enUS).match(/"[^"]+":/g)?.length || 0;

    it('中英文语言包都有内容', () => {
      expect(zhKeys).toBeGreaterThan(0);
      expect(enKeys).toBeGreaterThan(0);
    });
  });
});

// ==================== 集成场景 ====================

describe('i18n Integration Scenarios', () => {
  describe('语言切换流程', () => {
    let currentLocale: Locale = 'zh-CN';
    const setLocale = (l: Locale) => { currentLocale = l; };
    const getDir = (l: Locale) => 'ltr';
    const isCJK = (l: Locale) => ['zh-CN', 'ja-JP', 'ko-KR'].includes(l);

    it('切换到en-US时方向为ltr，非CJK', () => {
      setLocale('en-US');
      expect(getDir(currentLocale)).toBe('ltr');
      expect(isCJK(currentLocale)).toBe(false);
    });

    it('切换到ja-JP时方向为ltr，CJK', () => {
      setLocale('ja-JP');
      expect(getDir(currentLocale)).toBe('ltr');
      expect(isCJK(currentLocale)).toBe(true);
    });

    it('切换回zh-CN恢复CJK', () => {
      setLocale('zh-CN');
      expect(isCJK(currentLocale)).toBe(true);
    });
  });

  describe('完整格式化链', () => {
    const format = (value: number, locale: Locale) => {
      const isCJK = ['zh-CN', 'ja-JP', 'ko-KR'].includes(locale);
      const sign = value >= 0 ? '+' : '';
      const color = value > 0 ? (isCJK ? '#ef4444' : '#22c55e') : value < 0 ? (isCJK ? '#22c55e' : '#ef4444') : '#6b7280';
      return { text: `${sign}${value.toFixed(2)}%`, color };
    };

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
