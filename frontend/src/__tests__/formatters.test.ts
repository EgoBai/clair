import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  formatVolume,
  formatAmount,
  formatPercent,
  formatMarketCap,
  formatChange,
  formatPE,
  formatPB,
  formatTime,
  formatDate,
  formatRelativeTime,
  formatStockCode,
  getChangeColorClass,
  getChangeColor,
} from '../utils/formatters';

describe('formatters', () => {
  describe('formatPrice', () => {
    it('should format price with 2 decimals', () => {
      expect(formatPrice(99.567)).toBe('99.57');
      expect(formatPrice(100)).toBe('100.00');
    });

    it('should handle custom decimals', () => {
      expect(formatPrice(99.567, 3)).toBe('99.567');
      expect(formatPrice(99.567, 0)).toBe('100');
    });

    it('should return -- for null/undefined/NaN', () => {
      expect(formatPrice(null)).toBe('--');
      expect(formatPrice(undefined)).toBe('--');
      expect(formatPrice(NaN)).toBe('--');
    });

    it('should handle zero', () => {
      expect(formatPrice(0)).toBe('0.00');
    });
  });

  describe('formatVolume', () => {
    it('should format in 亿 for large volumes', () => {
      expect(formatVolume(1e8)).toBe('1.00亿');
      expect(formatVolume(5e8)).toBe('5.00亿');
    });

    it('should format in 万 for medium volumes', () => {
      expect(formatVolume(1e4)).toBe('1.00万');
      expect(formatVolume(5e5)).toBe('50.00万');
    });

    it('should format small volumes with locale string', () => {
      expect(formatVolume(1000)).toBe('1,000');
    });

    it('should return -- for null/undefined/NaN', () => {
      expect(formatVolume(null)).toBe('--');
      expect(formatVolume(undefined)).toBe('--');
      expect(formatVolume(NaN)).toBe('--');
    });
  });

  describe('formatAmount', () => {
    it('should format in 万亿 for large amounts', () => {
      expect(formatAmount(1e12)).toBe('1.00万亿');
      expect(formatAmount(3.5e12)).toBe('3.50万亿');
    });

    it('should format in 亿 for medium amounts', () => {
      expect(formatAmount(1e8)).toBe('1.00亿');
      expect(formatAmount(9.99e8)).toBe('9.99亿');
    });

    it('should format in 万 for smaller amounts', () => {
      expect(formatAmount(1e4)).toBe('1.00万');
    });

    it('should format small amounts with toFixed', () => {
      expect(formatAmount(9999)).toBe('9999.00');
    });

    it('should return -- for null/undefined/NaN', () => {
      expect(formatAmount(null)).toBe('--');
      expect(formatAmount(undefined)).toBe('--');
    });
  });

  describe('formatPercent', () => {
    it('should add + sign for positive values', () => {
      expect(formatPercent(5.25)).toBe('+5.25%');
      expect(formatPercent(0.01)).toBe('+0.01%');
    });

    it('should not add sign for negative values', () => {
      expect(formatPercent(-3.5)).toBe('-3.50%');
    });

    it('should add + for zero', () => {
      expect(formatPercent(0)).toBe('+0.00%');
    });

    it('should handle custom decimals', () => {
      expect(formatPercent(5.1234, 3)).toBe('+5.123%');
    });

    it('should return -- for null/undefined/NaN', () => {
      expect(formatPercent(null)).toBe('--');
      expect(formatPercent(NaN)).toBe('--');
    });
  });

  describe('formatMarketCap', () => {
    it('should format in 万亿 for large caps', () => {
      expect(formatMarketCap(2e12)).toBe('2.00万亿');
    });

    it('should format in 亿 for mid caps', () => {
      expect(formatMarketCap(1e10)).toBe('100.00亿');
    });

    it('should fallback to formatAmount for small', () => {
      expect(formatMarketCap(5000)).toBe('5000.00');
    });

    it('should return -- for null', () => {
      expect(formatMarketCap(null)).toBe('--');
    });
  });

  describe('formatChange', () => {
    it('should add + for positive changes', () => {
      expect(formatChange(1.5)).toBe('+1.50');
    });

    it('should not add sign for negative', () => {
      expect(formatChange(-0.5)).toBe('-0.50');
    });

    it('should return -- for null', () => {
      expect(formatChange(null)).toBe('--');
    });
  });

  describe('formatPE', () => {
    it('should format valid PE', () => {
      expect(formatPE(25.5)).toBe('25.50');
    });

    it('should return 亏损 for negative PE', () => {
      expect(formatPE(-10)).toBe('亏损');
    });

    it('should return -- for null', () => {
      expect(formatPE(null)).toBe('--');
    });
  });

  describe('formatPB', () => {
    it('should format valid PB', () => {
      expect(formatPB(3.2)).toBe('3.20');
    });

    it('should return -- for null', () => {
      expect(formatPB(null)).toBe('--');
    });
  });

  describe('formatTime', () => {
    it('should format timestamp', () => {
      const ts = new Date('2024-01-15T10:30:00').getTime();
      expect(formatTime(ts)).toMatch(/10:30/);
    });

    it('should return -- for null', () => {
      expect(formatTime(null)).toBe('--');
    });

    it('should return -- for invalid', () => {
      expect(formatTime('invalid')).toBe('--');
    });
  });

  describe('formatDate', () => {
    it('should format date', () => {
      const date = new Date('2024-01-15').getTime();
      expect(formatDate(date)).toMatch(/2024/);
    });

    it('should return -- for null', () => {
      expect(formatDate(null)).toBe('--');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format seconds ago', () => {
      const ts = Date.now() - 30000;
      expect(formatRelativeTime(ts)).toBe('30秒前');
    });

    it('should format minutes ago', () => {
      const ts = Date.now() - 120000;
      expect(formatRelativeTime(ts)).toBe('2分钟前');
    });

    it('should format hours ago', () => {
      const ts = Date.now() - 3600000 * 2;
      expect(formatRelativeTime(ts)).toBe('2小时前');
    });

    it('should format days ago', () => {
      const ts = Date.now() - 86400000 * 5;
      expect(formatRelativeTime(ts)).toBe('5天前');
    });

    it('should fallback to formatDate for old dates', () => {
      const ts = Date.now() - 86400000 * 60;
      expect(formatRelativeTime(ts)).not.toContain('天前');
    });
  });

  describe('formatStockCode', () => {
    it('should normalize code', () => {
      expect(formatStockCode('600036')).toBe('600036');
    });

    it('should remove prefix', () => {
      expect(formatStockCode('sh600036')).toBe('600036');
      expect(formatStockCode('sz000001')).toBe('000001');
    });

    it('should handle dots', () => {
      expect(formatStockCode('600.036')).toBe('600036');
    });

    it('should return empty for empty input', () => {
      expect(formatStockCode('')).toBe('');
    });
  });

  describe('getChangeColorClass', () => {
    it('should return stock-up for positive', () => {
      expect(getChangeColorClass(1)).toBe('stock-up');
    });

    it('should return stock-down for negative', () => {
      expect(getChangeColorClass(-1)).toBe('stock-down');
    });

    it('should return stock-flat for zero', () => {
      expect(getChangeColorClass(0)).toBe('stock-flat');
    });

    it('should return empty for null', () => {
      expect(getChangeColorClass(null)).toBe('');
    });
  });

  describe('getChangeColor', () => {
    it('should return red for positive (China style)', () => {
      expect(getChangeColor(1)).toBe('#ef4444');
    });

    it('should return green for negative', () => {
      expect(getChangeColor(-1)).toBe('#22c55e');
    });

    it('should return gray for zero', () => {
      expect(getChangeColor(0)).toBe('#666');
    });

    it('should return gray for null', () => {
      expect(getChangeColor(null)).toBe('#666');
    });
  });
});
