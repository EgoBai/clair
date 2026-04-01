import { describe, it, expect } from 'vitest';

/**
 * 通知模板格式化器测试
 */

interface NumberFormatOptions {
  decimals?: number;
  thousandsSeparator?: string;
  decimalSeparator?: string;
  prefix?: string;
  suffix?: string;
  percentageMode?: boolean;
  chineseUnit?: boolean;
}

function formatNumber(value: number, options: NumberFormatOptions = {}): string {
  const { decimals = 2, thousandsSeparator = ',', decimalSeparator = '.', prefix = '', suffix = '', percentageMode = false, chineseUnit = false } = options;
  let v = value;
  if (percentageMode) v = v * 100;
  let str: string;
  if (chineseUnit) {
    if (Math.abs(v) >= 1e8) str = (v / 1e8).toFixed(decimals) + '亿';
    else if (Math.abs(v) >= 1e4) str = (v / 1e4).toFixed(decimals) + '万';
    else str = v.toFixed(decimals);
  } else {
    str = v.toFixed(decimals);
  }
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  return prefix + parts.join(decimalSeparator) + (percentageMode && !chineseUnit ? '%' : '') + suffix;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`;
  return `${Math.floor(diff / 2592000000)}个月前`;
}

function applyConditionRule(value: number, rule: { condition: string; positiveValue: string; negativeValue: string; neutralValue?: string }): string {
  if (rule.condition === '>0') return value > 0 ? rule.positiveValue : value < 0 ? rule.negativeValue : (rule.neutralValue ?? '');
  if (rule.condition === '<0') return value < 0 ? rule.positiveValue : value > 0 ? rule.negativeValue : (rule.neutralValue ?? '');
  if (rule.condition === '>=0') return value >= 0 ? rule.positiveValue : rule.negativeValue;
  return String(value);
}

function formatStockChange(change: number, changePercent: number): string {
  const sign = change >= 0 ? '+' : '';
  const color = change > 0 ? '🔴' : change < 0 ? '🟢' : '⚪';
  return `${color} ${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
}

describe('通知模板格式化器', () => {
  describe('formatNumber', () => {
    it('should format with default options', () => {
      expect(formatNumber(1234567.89)).toBe('1,234,567.89');
    });

    it('should format with custom decimals', () => {
      expect(formatNumber(1234.5678, { decimals: 1 })).toBe('1,234.6');
    });

    it('should format with prefix and suffix', () => {
      expect(formatNumber(100, { prefix: '$', suffix: ' USD' })).toBe('$100.00 USD');
    });

    it('should format as percentage', () => {
      expect(formatNumber(0.1234, { percentageMode: true })).toBe('12.34%');
    });

    it('should format with Chinese units', () => {
      expect(formatNumber(150000000, { chineseUnit: true })).toBe('1.50亿');
      expect(formatNumber(50000, { chineseUnit: true })).toBe('5.00万');
    });

    it('should handle custom separators', () => {
      expect(formatNumber(1234567, { thousandsSeparator: '.', decimalSeparator: ',' })).toBe('1.234.567,00');
    });
  });

  describe('formatRelativeTime', () => {
    it('should return 刚刚 for recent', () => {
      expect(formatRelativeTime(Date.now() - 30000)).toBe('刚刚');
    });

    it('should return minutes', () => {
      expect(formatRelativeTime(Date.now() - 300000)).toBe('5分钟前');
    });

    it('should return hours', () => {
      expect(formatRelativeTime(Date.now() - 7200000)).toBe('2小时前');
    });

    it('should return days', () => {
      expect(formatRelativeTime(Date.now() - 172800000)).toBe('2天前');
    });
  });

  describe('applyConditionRule', () => {
    it('should return positive for >0', () => {
      expect(applyConditionRule(5, { condition: '>0', positiveValue: '涨', negativeValue: '跌' })).toBe('涨');
      expect(applyConditionRule(-5, { condition: '>0', positiveValue: '涨', negativeValue: '跌' })).toBe('跌');
    });

    it('should handle neutral', () => {
      expect(applyConditionRule(0, { condition: '>0', positiveValue: '涨', negativeValue: '跌', neutralValue: '平' })).toBe('平');
    });
  });

  describe('formatStockChange', () => {
    it('should format positive change', () => {
      const result = formatStockChange(5.5, 3.2);
      expect(result).toContain('+5.50');
      expect(result).toContain('+3.20%');
    });

    it('should format negative change', () => {
      const result = formatStockChange(-3.2, -1.5);
      expect(result).toContain('-3.20');
    });
  });
});
