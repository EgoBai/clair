/**
 * 前端测试 - 格式化工具 + 自定义Hooks
 */

import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  formatChangePercent,
  formatVolume,
  formatTurnover,
  formatMarketCap,
  formatDate,
  formatDateTime,
  formatNumber,
  formatLargeNumber,
  getColorByChange,
  getChangeText,
} from '../../../shared/formatters';

// ==================== 格式化函数测试 ====================

describe('formatPrice', () => {
  it('应该格式化为2位小数', () => {
    expect(formatPrice(12.345)).toBe('12.35');
    expect(formatPrice(100)).toBe('100.00');
  });

  it('null/undefined应该返回"-"', () => {
    expect(formatPrice(null as any)).toBe('-');
    expect(formatPrice(undefined as any)).toBe('-');
  });
});

describe('formatChangePercent', () => {
  it('正数应该带+号', () => {
    expect(formatChangePercent(5.67)).toBe('+5.67%');
  });

  it('负数应该带-号', () => {
    expect(formatChangePercent(-3.21)).toBe('-3.21%');
  });

  it('零应该带+号', () => {
    expect(formatChangePercent(0)).toBe('+0.00%');
  });
});

describe('formatVolume', () => {
  it('亿以上应该用亿', () => {
    expect(formatVolume(150000000)).toBe('1.50亿');
  });

  it('万以上应该用万', () => {
    expect(formatVolume(150000)).toBe('15.00万');
  });

  it('小数直接显示', () => {
    expect(formatVolume(500)).toBe('500');
  });
});

describe('formatTurnover', () => {
  it('应该正确转换亿/万', () => {
    expect(formatTurnover(123456789)).toBe('1.23亿');
    expect(formatTurnover(123456)).toBe('12.35万');
  });
});

describe('formatMarketCap', () => {
  it('万亿级别', () => {
    expect(formatMarketCap(2.5e12)).toBe('2.50万亿');
  });

  it('亿级别', () => {
    expect(formatMarketCap(5e10)).toBe('500.00亿');
  });
});

describe('formatDate', () => {
  it('应该格式化为YYYY-MM-DD', () => {
    const date = new Date('2026-03-24T10:30:00');
    expect(formatDate(date)).toBe('2026-03-24');
  });

  it('字符串输入也应该工作', () => {
    expect(formatDate('2026-01-01')).toBe('2026-01-01');
  });
});

describe('formatLargeNumber', () => {
  it('应该添加千分位', () => {
    expect(formatLargeNumber(1234567)).toBe('1,234,567');
  });
});

describe('getColorByChange', () => {
  it('上涨应该返回红色', () => {
    expect(getColorByChange(5)).toBe('#ef4444');
  });

  it('下跌应该返回绿色', () => {
    expect(getColorByChange(-3)).toBe('#22c55e');
  });

  it('平盘应该返回灰色', () => {
    expect(getColorByChange(0)).toBe('#6b7280');
  });
});

describe('getChangeText', () => {
  it('应该正确显示涨跌文字', () => {
    expect(getChangeText(2.5)).toBe('+2.50');
    expect(getChangeText(-1.3)).toBe('-1.30');
    expect(getChangeText(0)).toBe('+0.00');
  });
});
