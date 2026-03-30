/**
 * 共享类型定义完整性测试
 */
import { describe, it, expect } from 'vitest';

// 由于 shared/types.ts 是纯类型文件（无运行时代码），
// 我们测试共享格式化函数的完整性
import {
  formatNumber,
  formatMarketCap,
  formatVolume,
  formatTurnover,
  formatChangePercent,
  formatChange,
  formatTurnoverRate,
  formatPrice,
  getChangeColor,
  getChangeHexColor,
  formatSymbol,
  getMarketLabel,
  formatDate,
  formatDateTime,
  formatLargeNumber,
  getColorByChange,
  getChangeText,
  getMarketColor,
} from '../../../shared/formatters';

describe('共享格式化函数', () => {
  describe('formatNumber', () => {
    it('应带千分位', () => {
      const result = formatNumber(1234567.89);
      expect(result).toContain(',');
    });

    it('默认2位小数', () => {
      const result = formatNumber(100);
      expect(result).toContain('.00');
    });

    it('自定义小数位', () => {
      const result = formatNumber(100.123, 3);
      expect(result).toContain('.123');
    });

    it('零值', () => {
      const result = formatNumber(0);
      expect(result).toContain('0');
    });

    it('负数', () => {
      const result = formatNumber(-1234.56);
      expect(result).toContain('-');
      expect(result).toContain(',');
    });
  });

  describe('formatMarketCap', () => {
    it('万亿级', () => {
      expect(formatMarketCap(2.5e12)).toContain('万亿');
    });

    it('亿级', () => {
      expect(formatMarketCap(5e8)).toContain('亿');
      expect(formatMarketCap(5e8)).not.toContain('万亿');
    });

    it('万级', () => {
      expect(formatMarketCap(5e4)).toContain('万');
    });

    it('小于万', () => {
      expect(formatMarketCap(9999)).toBe('9999');
    });

    it('null/undefined 返回 -', () => {
      expect(formatMarketCap(null)).toBe('-');
      expect(formatMarketCap(undefined)).toBe('-');
    });

    it('零值应显示 0', () => {
      expect(formatMarketCap(0)).toBe('0');
    });
  });

  describe('formatVolume', () => {
    it('亿手级', () => {
      expect(formatVolume(5e8)).toContain('亿手');
    });

    it('万手级', () => {
      expect(formatVolume(5e5)).toContain('万手');
    });

    it('手级', () => {
      expect(formatVolume(500)).toBe('500手');
    });

    it('null 返回 -', () => {
      expect(formatVolume(null)).toBe('-');
    });
  });

  describe('formatTurnover', () => {
    it('亿级', () => {
      expect(formatTurnover(5e8)).toContain('亿');
    });

    it('万级', () => {
      expect(formatTurnover(5e5)).toContain('万');
    });

    it('null 返回 -', () => {
      expect(formatTurnover(null)).toBe('-');
    });
  });

  describe('formatChangePercent', () => {
    it('正数带 +', () => {
      expect(formatChangePercent(5.23)).toMatch(/^\+5\.23%$/);
    });

    it('负数带 -', () => {
      expect(formatChangePercent(-3.15)).toMatch(/^-3\.15%$/);
    });

    it('零值', () => {
      expect(formatChangePercent(0)).toBe('+0.00%');
    });

    it('null 返回 -', () => {
      expect(formatChangePercent(null)).toBe('-');
    });
  });

  describe('formatChange', () => {
    it('正数带 +', () => {
      expect(formatChange(1.5)).toMatch(/^\+1\.50$/);
    });

    it('负数', () => {
      expect(formatChange(-2.3)).toMatch(/^-2\.30$/);
    });

    it('null 返回 -', () => {
      expect(formatChange(null)).toBe('-');
    });
  });

  describe('getChangeColor', () => {
    it('正数 → positive', () => {
      expect(getChangeColor(1)).toBe('positive');
    });

    it('负数 → negative', () => {
      expect(getChangeColor(-1)).toBe('negative');
    });

    it('零 → neutral', () => {
      expect(getChangeColor(0)).toBe('neutral');
    });

    it('null → neutral', () => {
      expect(getChangeColor(null)).toBe('neutral');
    });
  });

  describe('getChangeHexColor', () => {
    it('正数 → 红色', () => {
      expect(getChangeHexColor(1)).toBe('#EF4444');
    });

    it('负数 → 绿色', () => {
      expect(getChangeHexColor(-1)).toBe('#22C55E');
    });

    it('零 → 灰色', () => {
      expect(getChangeHexColor(0)).toBe('#6B7280');
    });
  });

  describe('formatSymbol', () => {
    it('去掉 .SZ 后缀', () => {
      expect(formatSymbol('000001.SZ')).toBe('000001');
    });

    it('去掉 .SH 后缀', () => {
      expect(formatSymbol('600519.SH')).toBe('600519');
    });

    it('去掉 .BJ 后缀', () => {
      expect(formatSymbol('830001.BJ')).toBe('830001');
    });

    it('无后缀不变', () => {
      expect(formatSymbol('000001')).toBe('000001');
    });
  });

  describe('getMarketLabel', () => {
    it('SH → 上海', () => {
      expect(getMarketLabel('SH')).toBe('上海');
    });

    it('SZ → 深圳', () => {
      expect(getMarketLabel('SZ')).toBe('深圳');
    });

    it('BJ → 北京', () => {
      expect(getMarketLabel('BJ')).toBe('北京');
    });

    it('未知返回原值', () => {
      expect(getMarketLabel('XX')).toBe('XX');
    });
  });

  describe('formatDate', () => {
    it('Date 对象', () => {
      const d = new Date(2024, 0, 15);
      expect(formatDate(d)).toBe('2024-01-15');
    });

    it('字符串', () => {
      expect(formatDate('2024-06-01')).toBe('2024-06-01');
    });

    it('无效日期返回 -', () => {
      expect(formatDate('invalid')).toBe('-');
    });

    it('月份补零', () => {
      const d = new Date(2024, 2, 5);
      expect(formatDate(d)).toBe('2024-03-05');
    });
  });

  describe('formatDateTime', () => {
    it('包含时间部分', () => {
      const d = new Date(2024, 0, 15, 9, 30);
      const result = formatDateTime(d);
      expect(result).toContain('2024-01-15');
      expect(result).toContain('09:30');
    });

    it('无效日期返回 -', () => {
      expect(formatDateTime('invalid')).toBe('-');
    });
  });

  describe('formatLargeNumber', () => {
    it('千分位格式', () => {
      expect(formatLargeNumber(1234567)).toContain(',');
    });

    it('NaN 返回 -', () => {
      expect(formatLargeNumber(NaN)).toBe('-');
    });

    it('null 返回 -', () => {
      expect(formatLargeNumber(null as any)).toBe('-');
    });
  });

  describe('getColorByChange', () => {
    it('A股红涨', () => {
      expect(getColorByChange(1)).toBe('#ef4444');
    });

    it('A股绿跌', () => {
      expect(getColorByChange(-1)).toBe('#22c55e');
    });

    it('零值灰色', () => {
      expect(getColorByChange(0)).toBe('#6b7280');
    });
  });

  describe('getChangeText', () => {
    it('正数带 +', () => {
      expect(getChangeText(3.5)).toBe('+3.50');
    });

    it('负数', () => {
      expect(getChangeText(-2.1)).toBe('-2.10');
    });

    it('null 返回 -', () => {
      expect(getChangeText(null)).toBe('-');
    });
  });

  describe('getMarketColor', () => {
    it('SH → blue', () => { expect(getMarketColor('SH')).toBe('blue'); });
    it('SZ → green', () => { expect(getMarketColor('SZ')).toBe('green'); });
    it('BJ → orange', () => { expect(getMarketColor('BJ')).toBe('orange'); });
    it('未知 → default', () => { expect(getMarketColor('XX')).toBe('default'); });
  });
});
