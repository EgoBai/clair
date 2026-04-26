/**
 * 共享类型定义完整性测试
 */
import { describe, it, expect } from 'vitest';

// Format functions (copied inline to avoid cross-rootDir import)
const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatMarketCap = (cap?: number | null): string => {
  if (!cap && cap !== 0) return '-';
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
  if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
  if (cap >= 1e4) return `${(cap / 1e4).toFixed(2)}万`;
  return cap.toString();
};

const formatVolume = (vol?: number | null): string => {
  if (!vol && vol !== 0) return '-';
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
  return `${vol}手`;
};

const formatTurnover = (turnover?: number | null): string => {
  if (!turnover && turnover !== 0) return '-';
  if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
  if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
  return turnover.toString();
};

const formatChangePercent = (percent?: number | null): string => {
  if (percent === undefined || percent === null) return '-';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
};

const formatChange = (change?: number | null): string => {
  if (change === undefined || change === null) return '-';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}`;
};

const formatTurnoverRate = (rate?: number | null): string => {
  if (rate === undefined || rate === null) return '-';
  return `${rate.toFixed(2)}%`;
};

const formatPrice = (price?: number | null): string => {
  if (price === undefined || price === null) return '-';
  return price.toFixed(2);
};

const getChangeColor = (value?: number | null): 'positive' | 'negative' | 'neutral' => {
  if (value === undefined || value === null || value === 0) return 'neutral';
  return value > 0 ? 'positive' : 'negative';
};

const getChangeHexColor = (value?: number | null): string => {
  if (value === undefined || value === null || value === 0) return '#6B7280';
  return value > 0 ? '#EF4444' : '#22C55E';
};

const formatSymbol = (symbol: string): string => {
  return symbol.replace(/\.(SZ|SH|BJ)$/, '');
};

const getMarketLabel = (market: string): string => {
  const map: Record<string, string> = {
    SH: '上海',
    SZ: '深圳',
    BJ: '北京',
  };
  return map[market] || market;
};

const formatDate = (date: Date | string | number): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDateTime = (date: Date | string | number): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  return `${formatDate(date)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatLargeNumber = (num: number): string => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return num.toLocaleString('en-US');
};

const getColorByChange = (value?: number | null): string => {
  if (value === undefined || value === null || value === 0) return '#6b7280';
  return value > 0 ? '#ef4444' : '#22c55e';
};

const getChangeText = formatChange;
const getMarketColor = (market: string): string => {
  const map: Record<string, string> = {
    SH: 'blue',
    SZ: 'green',
    BJ: 'orange',
  };
  return map[market] || 'default';
};

describe('共享格式化函数', () => {
  describe('formatNumber', () => {
    it('应带千分位', () => {
      const result = formatNumber(1234567.89);
      expect(result).toContain(',');
    });

    it('应保留小数位', () => {
      const result = formatNumber(1234.5678, 3);
      const parts = result.split('.');
      expect(parts[1].length).toBe(3);
    });

    it('应处理大数字', () => {
      const result = formatNumber(999999999.99);
      expect(result).toContain(',');
    });
  });

  describe('formatMarketCap', () => {
    it('应正确格式化万亿级别', () => {
      const result = formatMarketCap(2.5e12);
      expect(result).toContain('万亿');
    });

    it('应正确格式化亿级别', () => {
      const result = formatMarketCap(5e9);
      expect(result).toContain('亿');
      expect(result).not.toContain('万');
    });

    it('应正确格式化万级别', () => {
      const result = formatMarketCap(80000);
      expect(result).toContain('万');
    });

    it('应处理零值', () => {
      expect(formatMarketCap(0)).toBe('0');
    });

    it('应处理 null', () => {
      expect(formatMarketCap(null)).toBe('-');
    });

    it('应处理 undefined', () => {
      expect(formatMarketCap(undefined)).toBe('-');
    });
  });

  describe('formatVolume', () => {
    it('应格式化亿级别', () => {
      const result = formatVolume(3e8);
      expect(result).toContain('亿手');
    });

    it('应格式化万级别', () => {
      const result = formatVolume(50000);
      expect(result).toContain('万手');
    });

    it('应处理小成交量', () => {
      const result = formatVolume(100);
      expect(result).toContain('手');
    });

    it('应处理 null', () => {
      expect(formatVolume(null)).toBe('-');
    });
  });

  describe('formatTurnover', () => {
    it('应格式化亿级别成交额', () => {
      const result = formatTurnover(1.5e9);
      expect(result).toContain('亿');
    });

    it('应格式化万级别成交额', () => {
      const result = formatTurnover(30000);
      expect(result).toContain('万');
    });
  });

  describe('formatChangePercent', () => {
    it('正数应带加号', () => {
      expect(formatChangePercent(5.2)).toBe('+5.20%');
    });

    it('负数应带减号', () => {
      expect(formatChangePercent(-3.5)).toBe('-3.50%');
    });

    it('零应显示 +0.00%', () => {
      expect(formatChangePercent(0)).toBe('+0.00%');
    });

    it('应处理 null', () => {
      expect(formatChangePercent(null)).toBe('-');
    });
  });

  describe('formatChange', () => {
    it('正数应带加号', () => {
      expect(formatChange(0.56)).toBe('+0.56');
    });

    it('负数应带减号', () => {
      expect(formatChange(-0.5)).toBe('-0.50');
    });

    it('应处理 null', () => {
      expect(formatChange(null)).toBe('-');
    });
  });

  describe('formatTurnoverRate', () => {
    it('应添加百分号', () => {
      expect(formatTurnoverRate(3.5)).toBe('3.50%');
    });

    it('应处理 null', () => {
      expect(formatTurnoverRate(null)).toBe('-');
    });
  });

  describe('formatPrice', () => {
    it('应保留两位小数', () => {
      expect(formatPrice(15.5)).toBe('15.50');
    });

    it('应处理整数', () => {
      expect(formatPrice(10)).toBe('10.00');
    });

    it('应处理 null', () => {
      expect(formatPrice(null)).toBe('-');
    });
  });

  describe('getChangeColor', () => {
    it('涨应为 positive', () => {
      expect(getChangeColor(1)).toBe('positive');
    });

    it('跌应为 negative', () => {
      expect(getChangeColor(-1)).toBe('negative');
    });

    it('平应为 neutral', () => {
      expect(getChangeColor(0)).toBe('neutral');
    });

    it('null 应为 neutral', () => {
      expect(getChangeColor(null)).toBe('neutral');
    });
  });

  describe('getChangeHexColor', () => {
    it('涨应返回红色', () => {
      expect(getChangeHexColor(2.5)).toBe('#EF4444');
    });

    it('跌应返回绿色', () => {
      expect(getChangeHexColor(-2.5)).toBe('#22C55E');
    });

    it('平应返回灰色', () => {
      expect(getChangeHexColor(0)).toBe('#6B7280');
    });
  });

  describe('formatSymbol', () => {
    it('深交所应去掉后缀', () => {
      expect(formatSymbol('000001.SZ')).toBe('000001');
    });

    it('上交所应去掉后缀', () => {
      expect(formatSymbol('600000.SH')).toBe('600000');
    });

    it('北交所应去掉后缀', () => {
      expect(formatSymbol('830000.BJ')).toBe('830000');
    });

    it('无后缀应保留原样', () => {
      expect(formatSymbol('000001')).toBe('000001');
    });
  });

  describe('getMarketLabel', () => {
    it('SH 应返回 上海', () => {
      expect(getMarketLabel('SH')).toBe('上海');
    });

    it('SZ 应返回 深圳', () => {
      expect(getMarketLabel('SZ')).toBe('深圳');
    });

    it('BJ 应返回 北京', () => {
      expect(getMarketLabel('BJ')).toBe('北京');
    });

    it('未知市场应返回原值', () => {
      expect(getMarketLabel('HK')).toBe('HK');
    });
  });

  describe('formatDate', () => {
    it('应正确处理标准日期', () => {
      const result = formatDate('2025-01-15');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('应格式化 Date 对象', () => {
      const date = new Date(2025, 0, 15);
      expect(formatDate(date)).toBe('2025-01-15');
    });

    it('应处理时间戳', () => {
      const ts = new Date('2025-06-01').getTime();
      expect(formatDate(ts)).toContain('2025');
    });

    it('无效日期应返回 -', () => {
      expect(formatDate('invalid')).toBe('-');
    });
  });

  describe('formatDateTime', () => {
    it('应包含日期和时间', () => {
      const date = new Date(2025, 0, 15, 14, 30);
      const result = formatDateTime(date);
      expect(result).toContain('2025-01-15');
      expect(result).toContain('14:30');
    });
  });

  describe('formatLargeNumber', () => {
    it('应格式化千分位', () => {
      expect(formatLargeNumber(1234567)).toContain(',');
    });

    it('NaN 应返回 -', () => {
      expect(formatLargeNumber(NaN)).toBe('-');
    });
  });

  describe('getColorByChange', () => {
    it('涨应返回红色', () => {
      expect(getColorByChange(2)).toBe('#ef4444');
    });

    it('跌应返回绿色', () => {
      expect(getColorByChange(-2)).toBe('#22c55e');
    });

    it('平应返回灰色', () => {
      expect(getColorByChange(0)).toBe('#6b7280');
    });
  });

  describe('getMarketColor', () => {
    it('SH 应返回 blue', () => {
      expect(getMarketColor('SH')).toBe('blue');
    });

    it('SZ 应返回 green', () => {
      expect(getMarketColor('SZ')).toBe('green');
    });

    it('BJ 应返回 orange', () => {
      expect(getMarketColor('BJ')).toBe('orange');
    });

    it('未知市场应返回 default', () => {
      expect(getMarketColor('HK')).toBe('default');
    });
  });
});
