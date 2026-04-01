import { describe, it, expect } from 'vitest';
import {
  formatRelativeTime,
  formatDate,
  formatDateTime,
  formatTradingSession,
  getChangeColor,
  getCurrencySymbol,
  formatLargeNumber,
  getMarketTrendLabel,
} from '../utils/enhancedFormatters';

type Locale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

describe('enhancedFormatters', () => {
  describe('formatRelativeTime', () => {
    const now = new Date('2024-06-15T12:00:00');

    it('should return 刚刚 for zh-CN', () => {
      const date = new Date('2024-06-15T11:59:30'); // 30s ago
      expect(formatRelativeTime(date, 'zh-CN', now)).toBe('刚刚');
    });

    it('should return just now for en-US', () => {
      const date = new Date('2024-06-15T11:59:30');
      expect(formatRelativeTime(date, 'en-US', now)).toBe('just now');
    });

    it('should format minutes ago', () => {
      const date = new Date('2024-06-15T11:55:00'); // 5 min ago
      expect(formatRelativeTime(date, 'zh-CN', now)).toBe('5分钟前');
      expect(formatRelativeTime(date, 'en-US', now)).toBe('5 min ago');
    });

    it('should format hours ago', () => {
      const date = new Date('2024-06-15T10:00:00'); // 2h ago
      expect(formatRelativeTime(date, 'zh-CN', now)).toBe('2小时前');
      expect(formatRelativeTime(date, 'en-US', now)).toBe('2h ago');
    });

    it('should format days ago', () => {
      const date = new Date('2024-06-13T12:00:00'); // 2d ago
      expect(formatRelativeTime(date, 'zh-CN', now)).toBe('2天前');
      expect(formatRelativeTime(date, 'en-US', now)).toBe('2d ago');
    });

    it('should return future label for future dates', () => {
      const date = new Date('2024-06-16T12:00:00');
      expect(formatRelativeTime(date, 'zh-CN', now)).toBe('未来');
    });

    it('should format Japanese', () => {
      const date = new Date('2024-06-15T11:55:00');
      expect(formatRelativeTime(date, 'ja-JP', now)).toBe('5分前');
    });

    it('should format Korean', () => {
      const date = new Date('2024-06-15T11:55:00');
      expect(formatRelativeTime(date, 'ko-KR', now)).toBe('5분 전');
    });

    it('should accept string dates', () => {
      const result = formatRelativeTime('2024-06-15T11:59:00', 'zh-CN', now);
      expect(result).toBe('1分钟前');
    });
  });

  describe('formatDate', () => {
    it('should format date for zh-CN', () => {
      const result = formatDate(new Date('2024-01-15'), 'zh-CN');
      expect(result).toContain('2024');
      expect(result).toContain('15');
    });

    it('should format date for en-US', () => {
      const result = formatDate(new Date('2024-01-15'), 'en-US');
      expect(result).toContain('2024');
    });

    it('should accept string dates', () => {
      const result = formatDate('2024-01-15', 'en-US');
      expect(result).toContain('2024');
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time', () => {
      const dt = new Date('2024-06-15T10:30:00');
      const result = formatDateTime(dt, 'zh-CN');
      expect(result).toContain('2024');
      expect(result).toContain('10');
      expect(result).toContain('30');
    });

    it('should work for en-US', () => {
      const dt = new Date('2024-06-15T10:30:00');
      const result = formatDateTime(dt, 'en-US');
      expect(result).toContain('2024');
    });
  });

  describe('formatTradingSession', () => {
    it('should show open status', () => {
      expect(formatTradingSession(true, 'zh-CN')).toBe('交易中');
      expect(formatTradingSession(true, 'en-US')).toBe('Market Open');
      expect(formatTradingSession(true, 'ja-JP')).toBe('取引中');
      expect(formatTradingSession(true, 'ko-KR')).toBe('거래 중');
    });

    it('should show closed status', () => {
      expect(formatTradingSession(false, 'zh-CN')).toBe('已休市');
      expect(formatTradingSession(false, 'en-US')).toBe('Market Closed');
    });
  });

  describe('getChangeColor', () => {
    it('should return red for positive in CJK locales', () => {
      expect(getChangeColor(1, 'zh-CN')).toBe('#ef4444');
      expect(getChangeColor(1, 'ja-JP')).toBe('#ef4444');
      expect(getChangeColor(1, 'ko-KR')).toBe('#ef4444');
    });

    it('should return green for negative in CJK locales', () => {
      expect(getChangeColor(-1, 'zh-CN')).toBe('#22c55e');
    });

    it('should return green for positive in en-US', () => {
      expect(getChangeColor(1, 'en-US')).toBe('#22c55e');
    });

    it('should return red for negative in en-US', () => {
      expect(getChangeColor(-1, 'en-US')).toBe('#ef4444');
    });

    it('should return gray for zero', () => {
      expect(getChangeColor(0, 'zh-CN')).toBe('#6b7280');
      expect(getChangeColor(0, 'en-US')).toBe('#6b7280');
    });
  });

  describe('getCurrencySymbol', () => {
    it('should return correct symbols', () => {
      expect(getCurrencySymbol('zh-CN')).toBe('¥');
      expect(getCurrencySymbol('en-US')).toBe('$');
      expect(getCurrencySymbol('ja-JP')).toBe('¥');
      expect(getCurrencySymbol('ko-KR')).toBe('₩');
    });
  });

  describe('formatLargeNumber', () => {
    it('should format Chinese compact notation', () => {
      expect(formatLargeNumber(1e12, 'zh-CN')).toBe('1.00万亿');
      expect(formatLargeNumber(5e8, 'zh-CN')).toBe('5.00亿');
      expect(formatLargeNumber(1e4, 'zh-CN')).toBe('1.00万');
    });

    it('should format English compact notation', () => {
      expect(formatLargeNumber(1e12, 'en-US')).toBe('1.00T');
      expect(formatLargeNumber(5e9, 'en-US')).toBe('5.00B');
      expect(formatLargeNumber(1e6, 'en-US')).toBe('1.00M');
      expect(formatLargeNumber(1e3, 'en-US')).toBe('1.00K');
    });

    it('should format Japanese compact notation', () => {
      expect(formatLargeNumber(1e12, 'ja-JP')).toBe('1.00兆');
      expect(formatLargeNumber(5e8, 'ja-JP')).toBe('5.00億');
    });

    it('should format Korean compact notation', () => {
      expect(formatLargeNumber(1e12, 'ko-KR')).toBe('1.00조');
      expect(formatLargeNumber(5e8, 'ko-KR')).toBe('5.00억');
    });

    it('should support custom decimals', () => {
      expect(formatLargeNumber(1.234e8, 'zh-CN', { decimals: 3 })).toBe('1.234亿');
    });

    it('should use locale format when compact is false', () => {
      const result = formatLargeNumber(1234567, 'en-US', { compact: false });
      expect(result).toContain('1');
      expect(result).toContain('234');
    });
  });

  describe('getMarketTrendLabel', () => {
    it('should return correct labels for zh-CN', () => {
      expect(getMarketTrendLabel('up', 'zh-CN')).toBe('上涨');
      expect(getMarketTrendLabel('down', 'zh-CN')).toBe('下跌');
      expect(getMarketTrendLabel('flat', 'zh-CN')).toBe('平盘');
    });

    it('should return correct labels for en-US', () => {
      expect(getMarketTrendLabel('up', 'en-US')).toBe('Rising');
      expect(getMarketTrendLabel('down', 'en-US')).toBe('Falling');
      expect(getMarketTrendLabel('flat', 'en-US')).toBe('Unchanged');
    });

    it('should return correct labels for ja-JP', () => {
      expect(getMarketTrendLabel('up', 'ja-JP')).toBe('上昇');
    });

    it('should return correct labels for ko-KR', () => {
      expect(getMarketTrendLabel('up', 'ko-KR')).toBe('상승');
    });
  });
});
