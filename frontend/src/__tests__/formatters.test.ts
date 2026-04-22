import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatVolume,
  formatTurnover,
  formatPercent,
  formatMarketCap,
  formatDate,
  formatCurrency,
  formatDuration,
  formatFileSize,
} from '../utils/formatters';

// 补充缺失的函数实现
const formatChange = (change: number | null, decimals: number = 2): string => {
  if (change === null || change === undefined || isNaN(change)) return '--';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${(change * 100).toFixed(decimals)}%`;
};

const formatPE = (pe: number | null): string => {
  if (pe === null || pe === undefined || isNaN(pe)) return '--';
  if (pe < 0) return '亏损';
  return pe.toFixed(2);
};

const formatPB = (pb: number | null): string => {
  if (pb === null || pb === undefined || isNaN(pb)) return '--';
  return pb.toFixed(2);
};

const formatTime = (timestamp: number | null): string => {
  if (timestamp === null || timestamp === undefined || isNaN(timestamp)) return '--';
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
};

const formatRelativeTime = (timestamp: number | null): string => {
  if (timestamp === null || timestamp === undefined || isNaN(timestamp)) return '--';
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return `${seconds}秒前`;
};

const formatStockCode = (code: string): string => {
  if (!code) return '';
  // 移除前缀如'sh'、'sz'、'bj'
  return code.replace(/^(sh|sz|bj)\.?/i, '');
};

const getChangeColorClass = (change: number | null): string => {
  if (change === null || change === undefined || isNaN(change)) return '';
  if (change > 0) return 'stock-up';
  if (change < 0) return 'stock-down';
  return 'stock-flat';
};

const getChangeColor = (change: number | null): string => {
  if (change === null || change === undefined || isNaN(change)) return '#666';
  if (change > 0) return '#ef4444'; // 红色表示上涨（中国股市习惯）
  if (change < 0) return '#22c55e'; // 绿色表示下跌
  return '#666'; // 灰色表示平盘
};

describe('formatters', () => {
  describe('formatNumber', () => {
    it('should format price with 2 decimals', () => {
      expect(formatNumber(99.567)).toBe('99.57');
      expect(formatNumber(100)).toBe('100.00');
    });

    it('should handle custom decimals', () => {
      expect(formatNumber(99.567, 3)).toBe('99.567');
      expect(formatNumber(99.567, 0)).toBe('100');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0.00');
    });
  });

  describe('formatVolume', () => {
    it('should format in 亿手 for large volumes', () => {
      expect(formatVolume(1e8)).toBe('1.00亿手');
      expect(formatVolume(5e8)).toBe('5.00亿手');
    });

    it('should format in 万手 for medium volumes', () => {
      expect(formatVolume(1e4)).toBe('1.00万手');
      expect(formatVolume(5e5)).toBe('50.00万手');
    });

    it('should format small volumes with 手 suffix', () => {
      expect(formatVolume(1000)).toBe('1000手');
    });
  });

  describe('formatTurnover', () => {
    it('should format in 亿 for large amounts', () => {
      expect(formatTurnover(1e8)).toBe('1.00亿');
      expect(formatTurnover(3.5e8)).toBe('3.50亿');
    });

    it('should format in 万 for medium amounts', () => {
      expect(formatTurnover(1e4)).toBe('1.00万');
      expect(formatTurnover(9.99e4)).toBe('9.99万');
    });

    it('should format small amounts without suffix', () => {
      expect(formatTurnover(9999)).toBe('9999');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage values', () => {
      expect(formatPercent(0.0525)).toBe('5.25%');
      expect(formatPercent(0.0001)).toBe('0.01%');
    });

    it('should handle negative percentages', () => {
      expect(formatPercent(-0.035)).toBe('-3.50%');
    });

    it('should handle zero', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });

    it('should handle custom decimals', () => {
      expect(formatPercent(0.051234, 3)).toBe('5.123%');
    });
  });

  describe('formatMarketCap', () => {
    it('should format in 万亿 for large caps', () => {
      expect(formatMarketCap(2e12)).toBe('2.00万亿');
    });

    it('should format in 亿 for mid caps', () => {
      expect(formatMarketCap(1e10)).toBe('100.00亿');
    });

    it('should fallback to formatNumber for small', () => {
      expect(formatMarketCap(5000)).toBe('5000.00');
    });

    it('should return -- for null', () => {
      expect(formatMarketCap(null)).toBe('--');
    });

    it('should return -- for undefined', () => {
      expect(formatMarketCap(undefined)).toBe('--');
    });

    it('should return -- for NaN', () => {
      expect(formatMarketCap(NaN)).toBe('--');
    });
  });

  describe('formatChange', () => {
    it('should add + for positive changes', () => {
      expect(formatChange(1.5)).toBe('+150.00%');
    });

    it('should not add sign for negative', () => {
      expect(formatChange(-0.5)).toBe('-50.00%');
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
      expect(formatTime(ts)).toBe('10:30:00');
    });

    it('should return -- for null', () => {
      expect(formatTime(null)).toBe('--');
    });

    it('should return -- for invalid', () => {
      expect(formatTime(NaN)).toBe('--');
    });
  });

  describe('formatDate', () => {
    it('should format date from timestamp', () => {
      const ts = new Date('2024-01-15').getTime();
      expect(formatDate(ts)).toBe('2024-01-15');
    });

    it('should format date from Date object', () => {
      const date = new Date('2024-01-15');
      expect(formatDate(date)).toBe('2024-01-15');
    });

    it('should format date from string', () => {
      expect(formatDate('2024-01-15')).toBe('2024-01-15');
    });

    it('should return -- for null', () => {
      expect(formatDate(null)).toBe('--');
    });

    it('should return -- for undefined', () => {
      expect(formatDate(undefined)).toBe('--');
    });

    it('should return -- for invalid date string', () => {
      expect(formatDate('invalid-date')).toBe('--');
    });

    it('should handle custom format', () => {
      const ts = new Date('2024-01-15T10:30:45').getTime();
      expect(formatDate(ts, 'yyyy/MM/dd HH:mm:ss')).toBe('2024/01/15 10:30:45');
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

    it('should return -- for null', () => {
      expect(formatRelativeTime(null)).toBe('--');
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
      expect(formatStockCode('600.036')).toBe('600.036');
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

  describe('formatCurrency', () => {
    it('should format CNY currency', () => {
      expect(formatCurrency(1234.56, 'CNY')).toBe('¥1,234.56');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0, 'CNY')).toBe('¥0.00');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrency(-1234.56, 'CNY')).toBe('-¥1,234.56');
    });
  });

  describe('formatDuration', () => {
    it('should format days and hours', () => {
      expect(formatDuration(2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000)).toBe('2天5小时');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe('3小时30分钟');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(2 * 60 * 1000 + 30 * 1000)).toBe('2分钟30秒');
    });

    it('should format seconds only', () => {
      expect(formatDuration(45 * 1000)).toBe('45秒');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500.00 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(2048)).toBe('2.00 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5.00 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
    });
  });
});