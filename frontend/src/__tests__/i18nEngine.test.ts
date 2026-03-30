import { describe, it, expect } from 'vitest';
import {
  createTranslator,
  formatNumberLocalized,
  formatPercentLocalized,
  formatCurrencyLocalized,
  formatDateLocalized,
  getWeekdayLocalized,
  getMonthLocalized,
  formatRelativeTime,
  pluralize,
  formatChangePercentLocalized,
  formatMarketCapLocalized,
  getSupportedLocales,
  getLocaleConfig,
  type Locale,
} from '../utils/i18nEngine';

// ==================== 翻译测试 ====================

describe('createTranslator', () => {
  it('应创建翻译器', () => {
    const { t } = createTranslator('zh-CN');
    expect(t('stock.price')).toBe('最新价');
    expect(t('stock.change')).toBe('涨跌幅');
  });

  it('英文翻译应工作', () => {
    const { t } = createTranslator('en-US');
    expect(t('stock.price')).toBe('Price');
    expect(t('stock.volume')).toBe('Volume');
  });

  it('未知key应返回原key', () => {
    const { t } = createTranslator('zh-CN');
    expect(t('unknown.key')).toBe('unknown.key');
  });

  it('应支持参数替换', () => {
    const { t } = createTranslator('zh-CN', { greeting: '你好{name}' });
    expect(t('greeting', { name: '世界' })).toBe('你好世界');
  });

  it('日文翻译应工作', () => {
    const { t } = createTranslator('ja-JP');
    expect(t('stock.price')).toBe('現在値');
    expect(t('stock.limitUp')).toBe('ストップ高');
  });

  it('韩文翻译应工作', () => {
    const { t } = createTranslator('ko-KR');
    expect(t('stock.price')).toBe('현재가');
    expect(t('stock.limitDown')).toBe('하한가');
  });
});

// ==================== 数字格式化测试 ====================

describe('formatNumberLocalized', () => {
  it('中文应使用逗号千分位', () => {
    const result = formatNumberLocalized(1234567.89, 'zh-CN');
    expect(result).toContain(',');
    expect(result).toContain('.');
  });

  it('英文应使用逗号千分位', () => {
    const result = formatNumberLocalized(1234567.89, 'en-US');
    expect(result).toContain(',');
  });

  it('负数应正确显示', () => {
    const result = formatNumberLocalized(-1234.56, 'zh-CN');
    expect(result.startsWith('-')).toBe(true);
  });

  it('零应正确显示', () => {
    const result = formatNumberLocalized(0, 'zh-CN');
    expect(result).toBe('0.00');
  });

  it('小数位数应可配置', () => {
    const result = formatNumberLocalized(1.23456, 'zh-CN', { decimals: 4 });
    const parts = result.split('.');
    expect(parts[1]?.length).toBe(4);
  });

  it('禁用千分位应无逗号', () => {
    const result = formatNumberLocalized(1234567, 'zh-CN', { useGrouping: false });
    expect(result).not.toContain(',');
  });
});

describe('formatPercentLocalized', () => {
  it('应格式化百分比', () => {
    const result = formatPercentLocalized(0.1234, 'zh-CN');
    expect(result).toContain('%');
  });

  it('英文应格式化', () => {
    const result = formatPercentLocalized(0.5, 'en-US');
    expect(result).toContain('%');
  });
});

describe('formatCurrencyLocalized', () => {
  it('人民币应在前面加¥', () => {
    const result = formatCurrencyLocalized(1000, 'zh-CN');
    expect(result.startsWith('¥')).toBe(true);
  });

  it('美元应在前面加$', () => {
    const result = formatCurrencyLocalized(1000, 'en-US');
    expect(result.startsWith('$')).toBe(true);
  });

  it('日元应在前面加¥', () => {
    const result = formatCurrencyLocalized(1000, 'ja-JP');
    expect(result.startsWith('¥')).toBe(true);
  });

  it('韩元应在前面加₩', () => {
    const result = formatCurrencyLocalized(1000, 'ko-KR');
    expect(result.startsWith('₩')).toBe(true);
  });
});

// ==================== 日期格式化测试 ====================

describe('formatDateLocalized', () => {
  const testDate = new Date('2026-03-31T10:30:45');

  it('中文日期应正确', () => {
    const result = formatDateLocalized(testDate, 'zh-CN');
    expect(result).toContain('2026');
    expect(result).toContain('03');
    expect(result).toContain('31');
    expect(result).toContain('年');
  });

  it('英文日期应正确', () => {
    const result = formatDateLocalized(testDate, 'en-US');
    expect(result).toContain('03/31/2026');
  });

  it('应支持自定义格式', () => {
    const result = formatDateLocalized(testDate, 'zh-CN', 'YYYY-MM-DD');
    expect(result).toBe('2026-03-31');
  });

  it('时间格式应正确', () => {
    const result = formatDateLocalized(testDate, 'zh-CN', 'HH:mm:ss');
    expect(result).toBe('10:30:45');
  });

  it('无效日期应返回原始值', () => {
    expect(formatDateLocalized('invalid', 'zh-CN')).toBe('invalid');
  });

  it('时间戳应正确处理', () => {
    const result = formatDateLocalized(testDate.getTime(), 'zh-CN', 'YYYY');
    expect(result).toBe('2026');
  });
});

describe('getWeekdayLocalized', () => {
  it('中文星期应正确', () => {
    // 2026-03-31 is a Tuesday
    const tuesday = new Date('2026-03-31');
    const result = getWeekdayLocalized(tuesday, 'zh-CN');
    expect(result).toBe('周二');
  });

  it('英文星期应正确', () => {
    const tuesday = new Date('2026-03-31');
    const result = getWeekdayLocalized(tuesday, 'en-US');
    expect(result).toBe('Tue');
  });

  it('日文星期应正确', () => {
    const tuesday = new Date('2026-03-31');
    const result = getWeekdayLocalized(tuesday, 'ja-JP');
    expect(result).toBe('火');
  });
});

describe('getMonthLocalized', () => {
  it('中文月份应正确', () => {
    const march = new Date('2026-03-15');
    expect(getMonthLocalized(march, 'zh-CN')).toBe('3月');
  });

  it('英文月份应正确', () => {
    const march = new Date('2026-03-15');
    expect(getMonthLocalized(march, 'en-US')).toBe('Mar');
  });
});

// ==================== 相对时间测试 ====================

describe('formatRelativeTime', () => {
  it('刚刚应显示', () => {
    const now = new Date();
    const result = formatRelativeTime(now, 'zh-CN');
    expect(result).toBe('刚刚');
  });

  it('分钟前应显示', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = formatRelativeTime(fiveMinAgo, 'zh-CN');
    expect(result).toContain('分钟前');
  });

  it('小时前应显示', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const result = formatRelativeTime(twoHoursAgo, 'zh-CN');
    expect(result).toContain('小时前');
  });

  it('英文相对时间应正确', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = formatRelativeTime(fiveMinAgo, 'en-US');
    expect(result).toContain('m ago');
  });

  it('日文相对时间应正确', () => {
    const now = new Date();
    expect(formatRelativeTime(now, 'ja-JP')).toBe('たった今');
  });

  it('韩文相对时间应正确', () => {
    const now = new Date();
    expect(formatRelativeTime(now, 'ko-KR')).toBe('방금');
  });
});

// ==================== 复数测试 ====================

describe('pluralize', () => {
  it('中文不区分单复数', () => {
    const rule = { one: '{n} item', other: '{n} items' };
    expect(pluralize(1, rule, 'zh-CN')).toContain('1');
    expect(pluralize(5, rule, 'zh-CN')).toContain('5');
  });

  it('英文应区分单复数', () => {
    const rule = { one: '{n} item', other: '{n} items' };
    expect(pluralize(1, rule, 'en-US')).toBe('1 item');
    expect(pluralize(5, rule, 'en-US')).toBe('5 items');
  });

  it('zero应处理', () => {
    const rule = { zero: 'no items', one: '{n} item', other: '{n} items' };
    expect(pluralize(0, rule, 'en-US')).toBe('no items');
  });
});

// ==================== A股专用格式化测试 ====================

describe('formatChangePercentLocalized', () => {
  it('正数应显示红色', () => {
    const result = formatChangePercentLocalized(2.5);
    expect(result.text).toContain('+');
    expect(result.color).toBe('red');
  });

  it('负数应显示绿色', () => {
    const result = formatChangePercentLocalized(-1.2);
    expect(result.color).toBe('green');
  });

  it('零应显示灰色', () => {
    const result = formatChangePercentLocalized(0);
    expect(result.color).toBe('gray');
  });
});

describe('formatMarketCapLocalized', () => {
  it('万亿级应显示万亿', () => {
    const result = formatMarketCapLocalized(2.3e12, 'zh-CN');
    expect(result).toContain('万亿');
  });

  it('亿级应显示亿', () => {
    const result = formatMarketCapLocalized(5e8, 'zh-CN');
    expect(result).toContain('亿');
  });

  it('英文万亿应显示T', () => {
    const result = formatMarketCapLocalized(1.5e12, 'en-US');
    expect(result).toContain('T');
  });

  it('英文十亿应显示B', () => {
    const result = formatMarketCapLocalized(5e9, 'en-US');
    expect(result).toContain('B');
  });

  it('韩文应显示正确单位', () => {
    const result = formatMarketCapLocalized(5e8, 'ko-KR');
    expect(result).toContain('억');
  });
});

// ==================== 工具函数测试 ====================

describe('getSupportedLocales', () => {
  it('应返回支持的区域列表', () => {
    const locales = getSupportedLocales();
    expect(locales.length).toBe(5);
    expect(locales.some(l => l.code === 'zh-CN')).toBe(true);
    expect(locales.some(l => l.code === 'en-US')).toBe(true);
    expect(locales.some(l => l.code === 'ja-JP')).toBe(true);
  });

  it('每个区域应有name和nativeName', () => {
    const locales = getSupportedLocales();
    locales.forEach(l => {
      expect(l.name).toBeTruthy();
      expect(l.nativeName).toBeTruthy();
    });
  });
});

describe('getLocaleConfig', () => {
  it('应返回中文配置', () => {
    const config = getLocaleConfig('zh-CN');
    expect(config.currency.code).toBe('CNY');
    expect(config.currency.symbol).toBe('¥');
  });

  it('应返回英文配置', () => {
    const config = getLocaleConfig('en-US');
    expect(config.currency.code).toBe('USD');
    expect(config.currency.symbol).toBe('$');
  });

  it('各区域应有完整配置', () => {
    const locales: Locale[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'];
    locales.forEach(locale => {
      const config = getLocaleConfig(locale);
      expect(config.numberFormat).toBeTruthy();
      expect(config.dateFormat).toBeTruthy();
      expect(config.currency).toBeTruthy();
      expect(config.dateFormat.weekday.length).toBe(7);
      expect(config.dateFormat.month.length).toBe(12);
    });
  });
});
