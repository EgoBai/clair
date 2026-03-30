import { describe, it, expect } from 'vitest';

/**
 * 国际化(i18n)测试
 * 测试语言切换、翻译键、日期/数字格式化
 */
describe('i18n System', () => {
  const translations: Record<string, Record<string, string>> = {
    zh: {
      'app.title': 'A股行情分析',
      'nav.home': '首页',
      'nav.stocks': '股票列表',
      'nav.sectors': '板块分析',
      'nav.watchlist': '自选股',
      'nav.alerts': '预警中心',
      'stock.price': '最新价',
      'stock.change': '涨跌幅',
      'stock.volume': '成交量',
      'stock.turnover': '成交额',
      'stock.pe': '市盈率',
      'stock.pb': '市净率',
      'market.rising': '上涨',
      'market.falling': '下跌',
      'market.limitUp': '涨停',
      'market.limitDown': '跌停',
      'action.buy': '买入',
      'action.sell': '卖出',
      'action.search': '搜索',
      'action.refresh': '刷新',
      'status.loading': '加载中...',
      'status.error': '加载失败',
      'status.empty': '暂无数据',
      'time.today': '今天',
      'time.yesterday': '昨天',
      'time.thisWeek': '本周',
    },
    en: {
      'app.title': 'A-Share Market Analysis',
      'nav.home': 'Home',
      'nav.stocks': 'Stock List',
      'nav.sectors': 'Sector Analysis',
      'nav.watchlist': 'Watchlist',
      'nav.alerts': 'Alerts',
      'stock.price': 'Price',
      'stock.change': 'Change',
      'stock.volume': 'Volume',
      'stock.turnover': 'Turnover',
      'stock.pe': 'P/E Ratio',
      'stock.pb': 'P/B Ratio',
      'market.rising': 'Rising',
      'market.falling': 'Falling',
      'market.limitUp': 'Limit Up',
      'market.limitDown': 'Limit Down',
      'action.buy': 'Buy',
      'action.sell': 'Sell',
      'action.search': 'Search',
      'action.refresh': 'Refresh',
      'status.loading': 'Loading...',
      'status.error': 'Failed to load',
      'status.empty': 'No data',
      'time.today': 'Today',
      'time.yesterday': 'Yesterday',
      'time.thisWeek': 'This week',
    },
  };

  function t(key: string, lang: string = 'zh'): string {
    return translations[lang]?.[key] || key;
  }

  describe('Translation Lookup', () => {
    it('should return Chinese translations', () => {
      expect(t('app.title', 'zh')).toBe('A股行情分析');
      expect(t('nav.home', 'zh')).toBe('首页');
      expect(t('stock.price', 'zh')).toBe('最新价');
    });

    it('should return English translations', () => {
      expect(t('app.title', 'en')).toBe('A-Share Market Analysis');
      expect(t('nav.home', 'en')).toBe('Home');
      expect(t('stock.price', 'en')).toBe('Price');
    });

    it('should fallback to key for missing translations', () => {
      expect(t('nonexistent.key', 'zh')).toBe('nonexistent.key');
    });

    it('should fallback to key for missing language', () => {
      expect(t('app.title', 'ja')).toBe('app.title');
    });
  });

  describe('Translation Completeness', () => {
    it('should have same keys in all languages', () => {
      const zhKeys = Object.keys(translations.zh).sort();
      const enKeys = Object.keys(translations.en).sort();
      expect(zhKeys).toEqual(enKeys);
    });

    it('should have non-empty translations', () => {
      Object.entries(translations).forEach(([, trans]) => {
        Object.entries(trans).forEach(([, value]) => {
          expect(value.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Language Detection', () => {
    function detectLanguage(acceptLanguage?: string): string {
      if (!acceptLanguage) return 'zh';
      if (acceptLanguage.startsWith('en')) return 'en';
      return 'zh';
    }

    it('should default to Chinese', () => {
      expect(detectLanguage()).toBe('zh');
    });

    it('should detect English', () => {
      expect(detectLanguage('en-US,en;q=0.9')).toBe('en');
    });

    it('should detect Chinese', () => {
      expect(detectLanguage('zh-CN,zh;q=0.9')).toBe('zh');
    });
  });

  describe('Number Formatting', () => {
    function formatNumber(value: number, lang: string = 'zh'): string {
      if (lang === 'zh') {
        if (Math.abs(value) >= 1e8) return (value / 1e8).toFixed(2) + '亿';
        if (Math.abs(value) >= 1e4) return (value / 1e4).toFixed(2) + '万';
      }
      if (lang === 'en') {
        if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(2) + 'B';
        if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(2) + 'M';
      }
      return value.toLocaleString();
    }

    it('should format large numbers with 亿 in Chinese', () => {
      expect(formatNumber(150000000, 'zh')).toContain('亿');
    });

    it('should format medium numbers with 万 in Chinese', () => {
      expect(formatNumber(150000, 'zh')).toContain('万');
    });

    it('should format with B/M in English', () => {
      expect(formatNumber(1500000000, 'en')).toContain('B');
      expect(formatNumber(5000000, 'en')).toContain('M');
    });
  });

  describe('Date Formatting', () => {
    function formatDate(date: Date, lang: string = 'zh'): string {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      if (lang === 'zh') return `${y}年${m}月${d}日`;
      return `${y}-${m}-${d}`;
    }

    it('should format Chinese date', () => {
      const date = new Date(2024, 0, 15);
      expect(formatDate(date, 'zh')).toBe('2024年01月15日');
    });

    it('should format English date', () => {
      const date = new Date(2024, 0, 15);
      expect(formatDate(date, 'en')).toBe('2024-01-15');
    });
  });

  describe('Pluralization', () => {
    function pluralize(count: number, singular: string, plural: string): string {
      return count === 1 ? singular : plural;
    }

    it('should use singular for 1', () => {
      expect(pluralize(1, 'stock', 'stocks')).toBe('stock');
    });

    it('should use plural for other counts', () => {
      expect(pluralize(0, 'stock', 'stocks')).toBe('stocks');
      expect(pluralize(2, 'stock', 'stocks')).toBe('stocks');
      expect(pluralize(100, 'stock', 'stocks')).toBe('stocks');
    });
  });
});
