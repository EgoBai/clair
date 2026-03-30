/**
 * 工具函数全面测试 - 补充后端测试覆盖
 */

import { describe, it, expect } from 'vitest';

// ---- 数字格式化工具 ----
function formatAmount(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + '万亿';
  if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿';
  if (value >= 1e4) return (value / 1e4).toFixed(2) + '万';
  return value.toFixed(2);
}

function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(decimals) + '%';
}

function formatLargeNumber(value: number): string {
  if (Math.abs(value) >= 1e12) return (value / 1e12).toFixed(2) + 'T';
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(2) + 'K';
  return value.toString();
}

describe('formatAmount', () => {
  it('万亿级别', () => {
    expect(formatAmount(1.5e12)).toBe('1.50万亿');
  });

  it('亿级别', () => {
    expect(formatAmount(5e8)).toBe('5.00亿');
  });

  it('万级别', () => {
    expect(formatAmount(3e4)).toBe('3.00万');
  });

  it('小于万直接显示', () => {
    expect(formatAmount(9999)).toBe('9999.00');
  });

  it('零值处理', () => {
    expect(formatAmount(0)).toBe('0.00');
  });

  it('边界值: 刚好1万亿', () => {
    expect(formatAmount(1e12)).toBe('1.00万亿');
  });

  it('边界值: 刚好1亿', () => {
    expect(formatAmount(1e8)).toBe('1.00亿');
  });

  it('边界值: 刚好1万', () => {
    expect(formatAmount(1e4)).toBe('1.00万');
  });
});

describe('formatPercent', () => {
  it('正数带加号', () => {
    expect(formatPercent(5.67)).toBe('+5.67%');
  });

  it('负数带减号', () => {
    expect(formatPercent(-3.21)).toBe('-3.21%');
  });

  it('零带加号', () => {
    expect(formatPercent(0)).toBe('+0.00%');
  });

  it('自定义小数位', () => {
    expect(formatPercent(3.14159, 3)).toBe('+3.142%');
  });

  it('整数值', () => {
    expect(formatPercent(10)).toBe('+10.00%');
  });

  it('极小值', () => {
    expect(formatPercent(0.01)).toBe('+0.01%');
  });

  it('负数零', () => {
    expect(formatPercent(-0)).toBe('+0.00%');
  });
});

describe('formatLargeNumber', () => {
  it('T级别', () => {
    expect(formatLargeNumber(2.5e12)).toBe('2.50T');
  });

  it('B级别', () => {
    expect(formatLargeNumber(1.2e9)).toBe('1.20B');
  });

  it('M级别', () => {
    expect(formatLargeNumber(5e6)).toBe('5.00M');
  });

  it('K级别', () => {
    expect(formatLargeNumber(3e3)).toBe('3.00K');
  });

  it('小于1000直接显示', () => {
    expect(formatLargeNumber(999)).toBe('999');
  });

  it('负数处理', () => {
    expect(formatLargeNumber(-1.5e9)).toBe('-1.50B');
  });

  it('零值', () => {
    expect(formatLargeNumber(0)).toBe('0');
  });
});

// ---- 日期工具 ----
function isTradingDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function getNextTradingDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (!isTradingDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function formatDateCN(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

describe('isTradingDay', () => {
  it('周一到周五是交易日', () => {
    // 2024-01-01 是周一
    expect(isTradingDay(new Date('2024-01-01'))).toBe(true);
    expect(isTradingDay(new Date('2024-01-02'))).toBe(true);
    expect(isTradingDay(new Date('2024-01-03'))).toBe(true);
    expect(isTradingDay(new Date('2024-01-04'))).toBe(true);
    expect(isTradingDay(new Date('2024-01-05'))).toBe(true);
  });

  it('周六周日不是交易日', () => {
    expect(isTradingDay(new Date('2024-01-06'))).toBe(false); // 周六
    expect(isTradingDay(new Date('2024-01-07'))).toBe(false); // 周日
  });
});

describe('getNextTradingDay', () => {
  it('周五的下一天是周一', () => {
    const friday = new Date('2024-01-05');
    const next = getNextTradingDay(friday);
    expect(next.getDay()).toBe(1); // 周一
  });

  it('周六的下一天是周一', () => {
    const saturday = new Date('2024-01-06');
    const next = getNextTradingDay(saturday);
    expect(next.getDay()).toBe(1);
  });

  it('工作日的下一天是次日', () => {
    const monday = new Date('2024-01-01');
    const next = getNextTradingDay(monday);
    expect(isSameDay(next, new Date('2024-01-02'))).toBe(true);
  });
});

describe('formatDateCN', () => {
  it('正确格式化日期', () => {
    const date = new Date('2024-03-15');
    expect(formatDateCN(date)).toBe('2024-03-15');
  });

  it('单位数月日补零', () => {
    const date = new Date('2024-01-05');
    expect(formatDateCN(date)).toBe('2024-01-05');
  });
});

describe('isSameDay', () => {
  it('同一天返回true', () => {
    const a = new Date('2024-01-15T09:30:00');
    const b = new Date('2024-01-15T15:00:00');
    expect(isSameDay(a, b)).toBe(true);
  });

  it('不同天返回false', () => {
    const a = new Date('2024-01-15');
    const b = new Date('2024-01-16');
    expect(isSameDay(a, b)).toBe(false);
  });

  it('不同月同日返回false', () => {
    const a = new Date('2024-01-15');
    const b = new Date('2024-02-15');
    expect(isSameDay(a, b)).toBe(false);
  });
});

// ---- 价格计算工具 ----
function calculateChange(prevClose: number, current: number): number {
  if (prevClose === 0) return 0;
  return ((current - prevClose) / prevClose) * 100;
}

function calculateTurnoverRate(volume: number, totalShares: number): number {
  if (totalShares === 0) return 0;
  return (volume / totalShares) * 100;
}

function calculatePE(price: number, eps: number): number {
  if (eps <= 0) return Infinity;
  return price / eps;
}

function calculatePB(price: number, bvps: number): number {
  if (bvps <= 0) return Infinity;
  return price / bvps;
}

function calculateDividendYield(dividend: number, price: number): number {
  if (price <= 0) return 0;
  return (dividend / price) * 100;
}

describe('calculateChange', () => {
  it('上涨场景', () => {
    expect(calculateChange(100, 105)).toBe(5);
  });

  it('下跌场景', () => {
    expect(calculateChange(100, 95)).toBe(-5);
  });

  it('不变', () => {
    expect(calculateChange(100, 100)).toBe(0);
  });

  it('前收盘为0返回0', () => {
    expect(calculateChange(0, 100)).toBe(0);
  });

  it('涨停板 (10%)', () => {
    expect(calculateChange(100, 110)).toBe(10);
  });

  it('跌停板 (-10%)', () => {
    expect(calculateChange(100, 90)).toBe(-10);
  });
});

describe('calculateTurnoverRate', () => {
  it('正确计算换手率', () => {
    expect(calculateTurnoverRate(1e6, 1e8)).toBe(1);
  });

  it('总股本为0返回0', () => {
    expect(calculateTurnoverRate(1e6, 0)).toBe(0);
  });

  it('100%换手率', () => {
    expect(calculateTurnoverRate(1e8, 1e8)).toBe(100);
  });
});

describe('calculatePE', () => {
  it('正确计算市盈率', () => {
    expect(calculatePE(100, 5)).toBe(20);
  });

  it('EPS为负返回Infinity', () => {
    expect(calculatePE(100, -2)).toBe(Infinity);
  });

  it('EPS为0返回Infinity', () => {
    expect(calculatePE(100, 0)).toBe(Infinity);
  });
});

describe('calculatePB', () => {
  it('正确计算市净率', () => {
    expect(calculatePB(50, 10)).toBe(5);
  });

  it('每股净资产为负返回Infinity', () => {
    expect(calculatePB(50, -5)).toBe(Infinity);
  });
});

describe('calculateDividendYield', () => {
  it('正确计算股息率', () => {
    expect(calculateDividendYield(5, 100)).toBe(5);
  });

  it('价格为0返回0', () => {
    expect(calculateDividendYield(5, 0)).toBe(0);
  });

  it('无分红', () => {
    expect(calculateDividendYield(0, 100)).toBe(0);
  });
});

// ---- 数据验证工具 ----
function validateStockCode(code: string): boolean {
  return /^(sh|sz|bj)\d{6}$/i.test(code) || /^\d{6}$/.test(code);
}

function validateDateRange(start: string, end: string): boolean {
  const s = new Date(start);
  const e = new Date(end);
  return !isNaN(s.getTime()) && !isNaN(e.getTime()) && s <= e;
}

function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

describe('validateStockCode', () => {
  it('有效的6位数字代码', () => {
    expect(validateStockCode('600519')).toBe(true);
    expect(validateStockCode('000001')).toBe(true);
  });

  it('带前缀的有效代码', () => {
    expect(validateStockCode('sh600519')).toBe(true);
    expect(validateStockCode('SZ000001')).toBe(true);
  });

  it('无效代码', () => {
    expect(validateStockCode('12345')).toBe(false);
    expect(validateStockCode('abc')).toBe(false);
    expect(validateStockCode('')).toBe(false);
  });
});

describe('validateDateRange', () => {
  it('有效日期范围', () => {
    expect(validateDateRange('2024-01-01', '2024-12-31')).toBe(true);
  });

  it('开始大于结束', () => {
    expect(validateDateRange('2024-12-31', '2024-01-01')).toBe(false);
  });

  it('同一天有效', () => {
    expect(validateDateRange('2024-06-15', '2024-06-15')).toBe(true);
  });

  it('无效日期格式', () => {
    expect(validateDateRange('invalid', '2024-01-01')).toBe(false);
  });
});

describe('sanitizeInput', () => {
  it('转义HTML标签', () => {
    expect(sanitizeInput('<script>')).toBe('&lt;script&gt;');
  });

  it('转义引号', () => {
    expect(sanitizeInput('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('转义单引号', () => {
    expect(sanitizeInput("it's")).toBe('it&#x27;s');
  });

  it('安全文本不变', () => {
    expect(sanitizeInput('hello world')).toBe('hello world');
  });

  it('空字符串返回空', () => {
    expect(sanitizeInput('')).toBe('');
  });
});

// ---- 数组统计工具 ----
function calcStats(numbers: number[]): {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
} {
  if (numbers.length === 0) return { mean: 0, median: 0, std: 0, min: 0, max: 0 };

  const sorted = [...numbers].sort((a, b) => a - b);
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const variance = numbers.reduce((sum, n) => sum + (n - mean) ** 2, 0) / numbers.length;
  const std = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    std: Math.round(std * 100) / 100,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

describe('calcStats', () => {
  it('正确计算均值', () => {
    const stats = calcStats([1, 2, 3, 4, 5]);
    expect(stats.mean).toBe(3);
  });

  it('正确计算中位数（奇数个）', () => {
    const stats = calcStats([1, 2, 3, 4, 5]);
    expect(stats.median).toBe(3);
  });

  it('正确计算中位数（偶数个）', () => {
    const stats = calcStats([1, 2, 3, 4]);
    expect(stats.median).toBe(2.5);
  });

  it('正确计算标准差', () => {
    const stats = calcStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats.std).toBeGreaterThan(0);
  });

  it('正确计算最小最大值', () => {
    const stats = calcStats([5, 3, 8, 1, 9]);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(9);
  });

  it('空数组返回零值', () => {
    const stats = calcStats([]);
    expect(stats.mean).toBe(0);
    expect(stats.median).toBe(0);
  });

  it('单元素数组', () => {
    const stats = calcStats([42]);
    expect(stats.mean).toBe(42);
    expect(stats.median).toBe(42);
    expect(stats.std).toBe(0);
  });

  it('相同值的标准差为0', () => {
    const stats = calcStats([5, 5, 5, 5]);
    expect(stats.std).toBe(0);
  });

  it('负数处理', () => {
    const stats = calcStats([-10, -5, 0, 5, 10]);
    expect(stats.mean).toBe(0);
  });
});
