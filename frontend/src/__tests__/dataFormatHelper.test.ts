/**
 * 数据格式化工具测试
 * 基于 formatters.ts 的实际 API
 */
import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatPercent,
  formatDateTime,
  formatSymbol,
  formatVolume,
  formatCurrency,
  formatChange,
  formatMarketCap,
  formatTurnover,
  formatChangePercent,
  formatTurnoverRate,
  formatDate,
  formatLargeNumber,
} from '../utils/formatters';

describe('formatNumber', () => {
  it('formats integers with locale separators', () => {
    expect(formatNumber(1000)).toBe('1,000.00');
    expect(formatNumber(1000000)).toBe('1,000,000.00');
  });

  it('formats decimals', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
    expect(formatNumber(1000.1)).toBe('1,000.10');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0.00');
  });

  it('handles negative numbers', () => {
    expect(formatNumber(-1000)).toBe('-1,000.00');
    expect(formatNumber(-1234.56)).toBe('-1,234.56');
  });

  it('formats with custom decimal places', () => {
    expect(formatNumber(5.5, 0)).toBe('6');
    expect(formatNumber(5.5, 1)).toBe('5.5');
    expect(formatNumber(5.5, 3)).toBe('5.500');
  });
});

describe('formatPercent', () => {
  it('formats decimal as percentage', () => {
    expect(formatPercent(0.055)).toBe('5.50%');
    expect(formatPercent(0.1)).toBe('10.00%');
  });

  it('formats negative percentage', () => {
    expect(formatPercent(-0.032)).toBe('-3.20%');
    expect(formatPercent(-1)).toBe('-100.00%');
  });

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('formats with custom decimal places', () => {
    expect(formatPercent(0.0555, 0)).toBe('6%');
    expect(formatPercent(0.0555, 1)).toBe('5.5%');
  });
});

describe('formatDateTime', () => {
  it('formats date string', () => {
    const result = formatDateTime('2024-01-15');
    expect(result).toBeTruthy();
    expect(result).toContain('2024');
  });

  it('formats ISO date string', () => {
    const result = formatDateTime('2024-01-15T10:30:00');
    expect(result).toBeTruthy();
  });

  it('formats Date object', () => {
    const result = formatDateTime(new Date('2024-01-15T10:30:00'));
    expect(result).toBeTruthy();
  });
});

describe('formatDate', () => {
  it('formats date string to default format', () => {
    const result = formatDate('2024-01-15');
    expect(result).toBe('2024-01-15');
  });

  it('formats with custom format', () => {
    const result = formatDate(new Date('2024-01-15'), 'yyyy年MM月dd日');
    expect(result).toBe('2024年01月15日');
  });

  it('handles null', () => {
    expect(formatDate(null)).toBe('--');
  });
});

describe('formatSymbol', () => {
  it('removes SH suffix', () => {
    expect(formatSymbol('600519.SH')).toBe('600519');
  });

  it('removes SZ suffix', () => {
    expect(formatSymbol('000858.SZ')).toBe('000858');
  });

  it('removes BJ suffix', () => {
    expect(formatSymbol('830000.BJ')).toBe('830000');
  });

  it('returns original if no suffix', () => {
    expect(formatSymbol('600519')).toBe('600519');
  });

  it('handles empty string', () => {
    expect(formatSymbol('')).toBe('');
  });
});

describe('formatVolume', () => {
  it('formats as 万 for ten-thousands', () => {
    expect(formatVolume(10000)).toBe('1.00万手');
    expect(formatVolume(12345)).toContain('万手');
  });

  it('formats as 亿 for hundred-millions', () => {
    expect(formatVolume(100000000)).toBe('1.00亿手');
  });

  it('handles zero volume', () => {
    expect(formatVolume(0)).toBe('0手');
  });

  it('formats small volume as raw number', () => {
    expect(formatVolume(500)).toBe('500手');
  });
});

describe('formatCurrency', () => {
  it('formats with RMB symbol', () => {
    const result = formatCurrency(100);
    expect(result).toContain('¥');
    expect(result).toContain('100');
  });

  it('formats decimal amounts', () => {
    const result = formatCurrency(99.5);
    expect(result).toContain('¥');
    expect(result).toContain('99.50');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toContain('0');
  });
});

describe('formatChange', () => {
  it('formats positive change', () => {
    expect(formatChange(1.5)).toBe('+1.50');
  });

  it('formats negative change', () => {
    expect(formatChange(-2.3)).toBe('-2.30');
  });

  it('formats zero change', () => {
    expect(formatChange(0)).toBe('+0.00');
  });

  it('handles null', () => {
    expect(formatChange(null)).toBe('-');
  });
});

describe('formatChangePercent', () => {
  it('formats positive percent change', () => {
    const result = formatChangePercent(5.5);
    expect(result).toContain('5.50');
    expect(result).toContain('%');
  });

  it('formats negative percent change', () => {
    const result = formatChangePercent(-3.2);
    expect(result).toContain('-3.20');
    expect(result).toContain('%');
  });

  it('handles null', () => {
    expect(formatChangePercent(null)).toBe('-');
  });
});

describe('formatMarketCap', () => {
  it('formats as 亿 for large values', () => {
    expect(formatMarketCap(100000000)).toBe('1.00亿');
    expect(formatMarketCap(1500000000)).toBe('15.00亿');
  });

  it('formats as 万 for moderate values', () => {
    expect(formatMarketCap(50000)).toBe('5.00万');
  });

  it('handles zero', () => {
    expect(formatMarketCap(0)).toBe('0.00');
  });

  it('handles null', () => {
    expect(formatMarketCap(null)).toBe('--');
  });
});

describe('formatTurnoverRate', () => {
  it('formats turnover rate', () => {
    const result = formatTurnoverRate(3.5);
    expect(result).toContain('3.50');
    expect(result).toContain('%');
  });

  it('handles zero', () => {
    const result = formatTurnoverRate(0);
    expect(result).toContain('0');
  });

  it('handles null', () => {
    expect(formatTurnoverRate(null)).toBe('-');
  });
});

describe('formatLargeNumber', () => {
  it('formats thousands', () => {
    expect(formatLargeNumber(1000)).toBe('1,000');
  });

  it('formats millions', () => {
    expect(formatLargeNumber(1000000)).toBe('1,000,000');
  });

  it('formats small numbers', () => {
    expect(formatLargeNumber(500)).toBe('500');
  });
});
