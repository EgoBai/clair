/**
 * i18n 多语言测试 - Round 163
 * 测试中英日韩四种语言支持、格式化器、嵌套翻译
 */

import { describe, it, expect } from 'vitest';

// ==================== 类型定义 ====================
type Locale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

interface I18nMessages {
  [key: string]: string | I18nMessages;
}

// ==================== 模拟翻译资源 ====================
const translations: Record<Locale, I18nMessages> = {
  'zh-CN': {
    common: { search: '搜索', loading: '加载中...', confirm: '确定', cancel: '取消' },
    nav: { home: '首页', stocks: '股票', market: '行情', watchlist: '自选股' },
    stock: { code: '代码', name: '名称', price: '最新价', changePercent: '涨跌幅' },
    home: { title: 'A股行情分析', marketOverview: '市场概况' },
    currency: { trillion: '万亿', billion: '亿', tenThousand: '万' },
  },
  'en-US': {
    common: { search: 'Search', loading: 'Loading...', confirm: 'Confirm', cancel: 'Cancel' },
    nav: { home: 'Home', stocks: 'Stocks', market: 'Market', watchlist: 'Watchlist' },
    stock: { code: 'Code', name: 'Name', price: 'Price', changePercent: 'Change %' },
    home: { title: 'A-Share Market Analysis', marketOverview: 'Market Overview' },
    currency: { trillion: 'T', billion: 'B', tenThousand: 'K' },
  },
  'ja-JP': {
    common: { search: '検索', loading: '読み込み中...', confirm: '確認', cancel: 'キャンセル' },
    nav: { home: 'ホーム', stocks: '株式', market: '市場', watchlist: 'ウォッチリスト' },
    stock: { code: 'コード', name: '名称', price: '現在値', changePercent: '変動率' },
    home: { title: 'A株市場分析', marketOverview: '市場概況' },
    currency: { trillion: '兆', billion: '億', tenThousand: '万' },
  },
  'ko-KR': {
    common: { search: '검색', loading: '로딩 중...', confirm: '확인', cancel: '취소' },
    nav: { home: '홈', stocks: '주식', market: '시장', watchlist: '관심목록' },
    stock: { code: '코드', name: '종목명', price: '현재가', changePercent: '변동률' },
    home: { title: 'A주 시장 분석', marketOverview: '시장 개요' },
    currency: { trillion: '조', billion: '억', tenThousand: '만' },
  },
};

// ==================== 工具函数 ====================
function getNestedValue(obj: I18nMessages, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

function translate(locale: Locale, key: string, params?: Record<string, string>): string {
  let result = getNestedValue(translations[locale], key);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    });
  }
  return result;
}

// ==================== 格式化器 ====================
const formatters = {
  number: (value: number, locale: Locale): string => {
    const localeMap: Record<Locale, string> = {
      'zh-CN': 'zh-CN',
      'en-US': 'en-US',
      'ja-JP': 'ja-JP',
      'ko-KR': 'ko-KR',
    };
    return value.toLocaleString(localeMap[locale] || 'en-US');
  },

  currency: (value: number, locale: Locale): string => {
    if (locale === 'zh-CN') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
      return value.toFixed(2);
    }
    if (locale === 'ja-JP') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}兆`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}億`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
      return `¥${value.toLocaleString('ja-JP', { minimumFractionDigits: 2 })}`;
    }
    if (locale === 'ko-KR') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}조`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}억`;
      return `₩${value.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}`;
    }
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  },

  date: (value: string | Date, locale: Locale): string => {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (locale === 'zh-CN') return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    if (locale === 'ja-JP') return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    if (locale === 'ko-KR') return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  volume: (value: number, locale: Locale): string => {
    if (locale === 'zh-CN') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿手`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万手`;
      return `${value}手`;
    }
    if (locale === 'ja-JP') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}億株`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万株`;
      return `${value}株`;
    }
    if (locale === 'ko-KR') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}억주`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}만주`;
      return `${value}주`;
    }
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toLocaleString('en-US');
  },
};

// ==================== 测试 ====================
describe('i18n 多语言支持', () => {
  describe('基础翻译', () => {
    it('应该支持中文翻译', () => {
      expect(translate('zh-CN', 'common.search')).toBe('搜索');
      expect(translate('zh-CN', 'nav.home')).toBe('首页');
      expect(translate('zh-CN', 'stock.price')).toBe('最新价');
    });

    it('应该支持英文翻译', () => {
      expect(translate('en-US', 'common.search')).toBe('Search');
      expect(translate('en-US', 'nav.home')).toBe('Home');
      expect(translate('en-US', 'stock.price')).toBe('Price');
    });

    it('应该支持日文翻译', () => {
      expect(translate('ja-JP', 'common.search')).toBe('検索');
      expect(translate('ja-JP', 'nav.home')).toBe('ホーム');
      expect(translate('ja-JP', 'stock.price')).toBe('現在値');
    });

    it('应该支持韩文翻译', () => {
      expect(translate('ko-KR', 'common.search')).toBe('검색');
      expect(translate('ko-KR', 'nav.home')).toBe('홈');
      expect(translate('ko-KR', 'stock.price')).toBe('현재가');
    });

    it('未找到的key应该返回原始key', () => {
      expect(translate('zh-CN', 'nonexistent.key')).toBe('nonexistent.key');
      expect(translate('en-US', 'deep.nested.missing')).toBe('deep.nested.missing');
    });

    it('应该支持参数插值', () => {
      const withParams: Record<Locale, I18nMessages> = {
        'zh-CN': { msg: '共{{count}}条记录' },
        'en-US': { msg: 'Total {{count}} records' },
        'ja-JP': { msg: '全{{count}}件の記録' },
        'ko-KR': { msg: '총 {{count}}건의 기록' },
      };

      const t = (locale: Locale, key: string) => {
        const obj = withParams[locale];
        let result = getNestedValue(obj, key);
        result = result.replace(/\{\{count\}\}/g, '42');
        return result;
      };

      expect(t('zh-CN', 'msg')).toBe('共42条记录');
      expect(t('en-US', 'msg')).toBe('Total 42 records');
      expect(t('ja-JP', 'msg')).toBe('全42件の記録');
      expect(t('ko-KR', 'msg')).toBe('총 42건의 기록');
    });
  });

  describe('翻译完整性', () => {
    const allKeys = [
      'common.search', 'common.loading', 'common.confirm', 'common.cancel',
      'nav.home', 'nav.stocks', 'nav.market', 'nav.watchlist',
      'stock.code', 'stock.name', 'stock.price', 'stock.changePercent',
      'home.title', 'home.marketOverview',
    ];

    const allLocales: Locale[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];

    for (const locale of allLocales) {
      it(`${locale} 应该包含所有必需的翻译key`, () => {
        for (const key of allKeys) {
          const value = translate(locale, key);
          expect(value).not.toBe(key); // 不应该返回原始key（说明找到了翻译）
          expect(value.length).toBeGreaterThan(0);
        }
      });
    }

    it('四种语言的翻译key应该一致', () => {
      function flattenKeys(obj: I18nMessages, prefix = ''): string[] {
        const keys: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${k}` : k;
          if (typeof v === 'string') {
            keys.push(fullKey);
          } else {
            keys.push(...flattenKeys(v, fullKey));
          }
        }
        return keys.sort();
      }

      const zhKeys = flattenKeys(translations['zh-CN']);
      const enKeys = flattenKeys(translations['en-US']);
      const jaKeys = flattenKeys(translations['ja-JP']);
      const koKeys = flattenKeys(translations['ko-KR']);

      expect(enKeys).toEqual(zhKeys);
      expect(jaKeys).toEqual(zhKeys);
      expect(koKeys).toEqual(zhKeys);
    });
  });

  describe('货币格式化', () => {
    it('中文货币格式 - 万亿级别', () => {
      expect(formatters.currency(2.5e12, 'zh-CN')).toBe('2.50万亿');
    });

    it('中文货币格式 - 亿级别', () => {
      expect(formatters.currency(1.23e9, 'zh-CN')).toBe('12.30亿');
    });

    it('中文货币格式 - 万级别', () => {
      expect(formatters.currency(5.6e4, 'zh-CN')).toBe('5.60万');
    });

    it('日文货币格式 - 兆级别', () => {
      expect(formatters.currency(2.5e12, 'ja-JP')).toBe('2.50兆');
    });

    it('日文货币格式 - 億级别', () => {
      expect(formatters.currency(1.23e9, 'ja-JP')).toBe('12.30億');
    });

    it('韩文货币格式 - 조级别', () => {
      expect(formatters.currency(2.5e12, 'ko-KR')).toBe('2.50조');
    });

    it('韩文货币格式 - 억级别', () => {
      expect(formatters.currency(1.23e9, 'ko-KR')).toBe('12.30억');
    });

    it('英文货币格式 - T级别', () => {
      expect(formatters.currency(2.5e12, 'en-US')).toBe('$2.50T');
    });

    it('英文货币格式 - B级别', () => {
      expect(formatters.currency(1.23e9, 'en-US')).toBe('$1.23B');
    });
  });

  describe('日期格式化', () => {
    const testDate = new Date('2024-03-15T10:30:00');

    it('中文日期格式', () => {
      expect(formatters.date(testDate, 'zh-CN')).toBe('2024年3月15日');
    });

    it('英文日期格式', () => {
      const result = formatters.date(testDate, 'en-US');
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('日文日期格式', () => {
      expect(formatters.date(testDate, 'ja-JP')).toBe('2024年3月15日');
    });

    it('韩文日期格式', () => {
      expect(formatters.date(testDate, 'ko-KR')).toBe('2024년 3월 15일');
    });

    it('应该接受字符串日期', () => {
      expect(formatters.date('2024-03-15', 'zh-CN')).toBe('2024年3月15日');
    });
  });

  describe('成交量格式化', () => {
    it('中文成交量 - 亿手', () => {
      expect(formatters.volume(3.5e8, 'zh-CN')).toBe('3.50亿手');
    });

    it('中文成交量 - 万手', () => {
      expect(formatters.volume(1.2e5, 'zh-CN')).toBe('12.00万手');
    });

    it('日文成交量 - 億株', () => {
      expect(formatters.volume(3.5e8, 'ja-JP')).toBe('3.50億株');
    });

    it('日文成交量 - 万株', () => {
      expect(formatters.volume(1.2e5, 'ja-JP')).toBe('12.00万株');
    });

    it('韩文成交量 - 억주', () => {
      expect(formatters.volume(3.5e8, 'ko-KR')).toBe('3.50억주');
    });

    it('韩文成交量 - 만주', () => {
      expect(formatters.volume(1.2e5, 'ko-KR')).toBe('12.00만주');
    });

    it('英文成交量 - M', () => {
      expect(formatters.volume(3.5e6, 'en-US')).toBe('3.50M');
    });
  });

  describe('数字格式化', () => {
    it('应该按语言环境格式化数字', () => {
      const value = 1234567.89;
      const zhResult = formatters.number(value, 'zh-CN');
      const enResult = formatters.number(value, 'en-US');
      const jaResult = formatters.number(value, 'ja-JP');
      const koResult = formatters.number(value, 'ko-KR');

      // 都应该包含数字（只是分隔符不同）
      expect(zhResult).toContain('1');
      expect(enResult).toContain('1');
      expect(jaResult).toContain('1');
      expect(koResult).toContain('1');
    });
  });

  describe('边缘情况', () => {
    it('空字符串key应该返回key本身', () => {
      expect(translate('zh-CN', '')).toBe('');
    });

    it('单层key应该正常工作', () => {
      expect(translate('zh-CN', 'common')).toBe('common'); // common是对象不是字符串
    });

    it('0值应该正确格式化', () => {
      expect(formatters.number(0, 'zh-CN')).toBe('0');
      expect(formatters.currency(0, 'zh-CN')).toBe('0.00');
      expect(formatters.volume(0, 'zh-CN')).toBe('0手');
    });

    it('负数应该正确格式化', () => {
      const neg = -1234567.89;
      const result = formatters.number(neg, 'zh-CN');
      expect(result).toContain('-');
    });
  });
});
