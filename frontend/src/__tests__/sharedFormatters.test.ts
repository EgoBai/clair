/**
 * 共享格式化函数 + 日期工具 补充测试
 * 目标: 25+ 测试用例
 */

import { describe, it, expect } from 'vitest';
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
    it('应格式化带千分位', () => {
      expect(formatNumber(1234567.89)).toContain('1,234,567');
    });

    it('应支持指定小数位', () => {
      expect(formatNumber(123.456, 0)).toContain('123');
    });

    it('零应正常格式化', () => {
      expect(formatNumber(0)).toContain('0');
    });

    it('负数应正常格式化', () => {
      const result = formatNumber(-1234.56);
      expect(result).toContain('1,234');
    });
  });

  describe('formatMarketCap', () => {
    it('万亿级别', () => {
      expect(formatMarketCap(2.5e12)).toContain('万亿');
    });

    it('亿级别', () => {
      expect(formatMarketCap(5e8)).toContain('亿');
    });

    it('万级别', () => {
      expect(formatMarketCap(50000)).toContain('万');
    });

    it('null/undefined应返回-', () => {
      expect(formatMarketCap(null)).toBe('-');
      expect(formatMarketCap(undefined)).toBe('-');
    });

    it('0应返回0', () => {
      expect(formatMarketCap(0)).toBe('0');
    });
  });

  describe('formatVolume', () => {
    it('亿手级别', () => {
      expect(formatVolume(1.5e8)).toContain('亿手');
    });

    it('万手级别', () => {
      expect(formatVolume(50000)).toContain('万手');
    });

    it('小数量应显示手', () => {
      expect(formatVolume(500)).toContain('手');
    });

    it('null应返回-', () => {
      expect(formatVolume(null)).toBe('-');
    });
  });

  describe('formatTurnover', () => {
    it('亿级别', () => {
      expect(formatTurnover(3e8)).toContain('亿');
    });

    it('万级别', () => {
      expect(formatTurnover(80000)).toContain('万');
    });

    it('null应返回-', () => {
      expect(formatTurnover(null)).toBe('-');
    });
  });

  describe('formatChangePercent', () => {
    it('正数应带+号', () => {
      expect(formatChangePercent(3.25)).toBe('+3.25%');
    });

    it('负数应带-号', () => {
      expect(formatChangePercent(-1.5)).toBe('-1.50%');
    });

    it('零应带+号', () => {
      expect(formatChangePercent(0)).toBe('+0.00%');
    });

    it('null应返回-', () => {
      expect(formatChangePercent(null)).toBe('-');
    });
  });

  describe('formatChange', () => {
    it('正数应带+号', () => {
      expect(formatChange(5.5)).toBe('+5.50');
    });

    it('负数应带-号', () => {
      expect(formatChange(-2.3)).toBe('-2.30');
    });

    it('null应返回-', () => {
      expect(formatChange(null)).toBe('-');
    });
  });

  describe('formatPrice', () => {
    it('应保留2位小数', () => {
      expect(formatPrice(1688.5)).toBe('1688.50');
    });

    it('null应返回-', () => {
      expect(formatPrice(null)).toBe('-');
    });
  });

  describe('getChangeColor', () => {
    it('正数应为positive', () => {
      expect(getChangeColor(1)).toBe('positive');
    });

    it('负数应为negative', () => {
      expect(getChangeColor(-1)).toBe('negative');
    });

    it('零应为neutral', () => {
      expect(getChangeColor(0)).toBe('neutral');
    });

    it('null应为neutral', () => {
      expect(getChangeColor(null)).toBe('neutral');
    });
  });

  describe('getChangeHexColor', () => {
    it('正数应为红色', () => {
      expect(getChangeHexColor(1)).toBe('#EF4444');
    });

    it('负数应为绿色', () => {
      expect(getChangeHexColor(-1)).toBe('#22C55E');
    });

    it('零应为灰色', () => {
      expect(getChangeHexColor(0)).toBe('#6B7280');
    });
  });

  describe('formatSymbol', () => {
    it('应去除.SZ后缀', () => {
      expect(formatSymbol('000001.SZ')).toBe('000001');
    });

    it('应去除.SH后缀', () => {
      expect(formatSymbol('600519.SH')).toBe('600519');
    });

    it('应去除.BJ后缀', () => {
      expect(formatSymbol('830001.BJ')).toBe('830001');
    });

    it('无后缀应保持不变', () => {
      expect(formatSymbol('000001')).toBe('000001');
    });
  });

  describe('getMarketLabel', () => {
    it('SH应返回上海', () => {
      expect(getMarketLabel('SH')).toBe('上海');
    });

    it('SZ应返回深圳', () => {
      expect(getMarketLabel('SZ')).toBe('深圳');
    });

    it('BJ应返回北京', () => {
      expect(getMarketLabel('BJ')).toBe('北京');
    });

    it('未知市场应返回原值', () => {
      expect(getMarketLabel('HK')).toBe('HK');
    });
  });

  describe('formatDate', () => {
    it('应格式化日期', () => {
      const date = new Date('2024-03-15T10:30:00');
      expect(formatDate(date)).toBe('2024-03-15');
    });

    it('字符串日期应格式化', () => {
      expect(formatDate('2024-01-01')).toBe('2024-01-01');
    });

    it('无效日期应返回-', () => {
      expect(formatDate('invalid')).toBe('-');
    });
  });

  describe('formatDateTime', () => {
    it('应包含时间', () => {
      const date = new Date('2024-03-15T14:30:00');
      const result = formatDateTime(date);
      expect(result).toContain('2024-03-15');
      expect(result).toContain('14:30');
    });

    it('无效日期应返回-', () => {
      expect(formatDateTime('invalid')).toBe('-');
    });
  });

  describe('formatLargeNumber', () => {
    it('应使用千分位', () => {
      expect(formatLargeNumber(1234567)).toContain('1,234,567');
    });

    it('NaN应返回-', () => {
      expect(formatLargeNumber(NaN)).toBe('-');
    });
  });

  describe('getColorByChange', () => {
    it('A股红涨', () => {
      expect(getColorByChange(5)).toBe('#ef4444');
    });

    it('A股绿跌', () => {
      expect(getColorByChange(-3)).toBe('#22c55e');
    });

    it('零为灰色', () => {
      expect(getColorByChange(0)).toBe('#6b7280');
    });
  });

  describe('getChangeText', () => {
    it('正数带+', () => {
      expect(getChangeText(2.5)).toBe('+2.50');
    });

    it('负数带-', () => {
      expect(getChangeText(-1.2)).toBe('-1.20');
    });

    it('null返回-', () => {
      expect(getChangeText(null)).toBe('-');
    });
  });

  describe('getMarketColor', () => {
    it('SH应为blue', () => {
      expect(getMarketColor('SH')).toBe('blue');
    });

    it('SZ应为green', () => {
      expect(getMarketColor('SZ')).toBe('green');
    });

    it('未知应为default', () => {
      expect(getMarketColor('XX')).toBe('default');
    });
  });
});
