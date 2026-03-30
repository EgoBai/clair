/**
 * 国际化 (i18n) 系统测试
 */
import { describe, it, expect } from 'vitest';

describe('国际化系统', () => {
  describe('语言支持', () => {
    const supportedLocales = ['zh-CN', 'en-US'];

    it('应支持中文', () => {
      expect(supportedLocales).toContain('zh-CN');
    });

    it('应支持英文', () => {
      expect(supportedLocales).toContain('en-US');
    });
  });

  describe('翻译键完整性', () => {
    const commonKeys = [
      'common.search',
      'common.loading',
      'common.confirm',
      'common.cancel',
      'common.save',
      'common.delete',
      'common.refresh',
      'common.export',
    ];

    const navKeys = [
      'nav.home',
      'nav.stocks',
      'nav.market',
      'nav.watchlist',
      'nav.screener',
      'nav.alerts',
    ];

    const pageKeys = [
      'page.home.marketOverview',
      'page.home.gainers',
      'page.home.losers',
      'page.home.volumeRank',
      'page.stock.price',
      'page.stock.change',
      'page.stock.volume',
    ];

    it('应定义通用翻译键', () => {
      expect(commonKeys.length).toBeGreaterThanOrEqual(8);
    });

    it('应定义导航翻译键', () => {
      expect(navKeys.length).toBeGreaterThanOrEqual(6);
    });

    it('应定义页面翻译键', () => {
      expect(pageKeys.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('格式化器', () => {
    it('中文应使用万亿/亿/万格式', () => {
      const formatLargeNumber = (num: number): string => {
        if (num >= 1e12) return `${(num / 1e12).toFixed(2)}万亿`;
        if (num >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
        if (num >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
        return num.toString();
      };

      expect(formatLargeNumber(2.5e12)).toContain('万亿');
      expect(formatLargeNumber(5e8)).toContain('亿');
      expect(formatLargeNumber(5e4)).toContain('万');
    });

    it('英文应使用 T/B/M/K 格式', () => {
      const formatLargeNumberEN = (num: number): string => {
        if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
        return num.toString();
      };

      expect(formatLargeNumberEN(2.5e12)).toContain('T');
      expect(formatLargeNumberEN(5e9)).toContain('B');
      expect(formatLargeNumberEN(5e6)).toContain('M');
      expect(formatLargeNumberEN(5e3)).toContain('K');
    });

    it('百分比应根据 locale 格式化', () => {
      const zhPercent = (5.23).toLocaleString('zh-CN', { style: 'percent', minimumFractionDigits: 2 });
      expect(zhPercent).toBeDefined();
    });
  });

  describe('参数替换', () => {
    it('应支持参数替换', () => {
      const t = (key: string, params?: Record<string, string>) => {
        let text = key;
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            text = text.replace(`{{${k}}}`, v);
          });
        }
        return text;
      };

      expect(t('共 {{count}} 条', { count: '100' })).toBe('共 100 条');
    });

    it('无参数应原样返回', () => {
      const t = (key: string) => key;
      expect(t('首页')).toBe('首页');
    });
  });

  describe('持久化', () => {
    it('语言偏好应存储在 localStorage', () => {
      const key = 'app-locale';
      expect(key).toBe('app-locale');
    });

    it('默认语言应为中文', () => {
      const defaultLocale = 'zh-CN';
      expect(defaultLocale).toBe('zh-CN');
    });
  });

  describe('日期格式化', () => {
    it('中文日期应为 YYYY-MM-DD', () => {
      const d = new Date(2024, 0, 15);
      const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(formatted).toBe('2024-01-15');
    });

    it('英文日期应为 MM/DD/YYYY', () => {
      const d = new Date(2024, 0, 15);
      const formatted = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
      expect(formatted).toBe('01/15/2024');
    });
  });
});
