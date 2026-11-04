/**
 * 工具函数测试（迁移自影子实现，绑定生产实现）
 *
 * 一、原自抄实现的问题
 * 1. formatPercent 自抄把入参当百分数并补 '+'；生产 formatters.formatPercent 收小数比率并 ×100，不带正号（正号属 formatChangePercent）。
 * 2. formatLargeNumber 自抄按 K/M/B/T 缩写；生产用 toLocaleString('en-US') 千分位、不缩写，NaN/null/undefined 返回 '-'。
 * 3. isTradingDay / getNextTradingDay 自抄只跳周末；生产 tradingCalendar 含法定休市表（2025/2026/2027），nextTradingDay 返回 'YYYY-MM-DD' 字符串。
 * 4. calculateChange 自抄返回裸百分比；生产返回 { change, changePercent }，prevClose=0 时 change 仍为价差、changePercent=0。
 * 5. calculateDividendYield 自抄只拦 price===0；生产拦 price<=0。
 * 6. sanitizeInput 自抄漏转义 & 与 /（及反引号）；生产 encodeHTML 覆盖 & < > " ' 反引号 / 七个字符。
 * 7. calcStats 自抄用总体方差 ÷n；生产 calculateStdDev 用样本方差 ÷(n-1)。
 * 8. calculatePE / calculatePB / validateDateRange / isSameDay / median 生产无对应导出，保留本地实现（见第三节）。
 *
 * 二、绑定生产实现（file:line）
 * - formatAmount → frontend/src/utils/dataTransformUtils.ts:45
 * - formatPercent → frontend/src/utils/formatters.ts:60
 * - formatChangePercent → frontend/src/utils/formatters.ts:148
 * - formatLargeNumber → frontend/src/utils/formatters.ts:219
 * - formatDate → frontend/src/utils/formatters.ts:70（替代无生产的 formatDateCN）
 * - isTradingDay → backend/src/utils/tradingCalendar.ts:379
 * - nextTradingDay → backend/src/utils/tradingCalendar.ts:417（替代旧 getNextTradingDay，返回字符串）
 * - calculateChange → backend/src/models/Stock.ts:225
 * - calculateTurnoverRate → backend/src/models/Stock.ts:236
 * - calculateDividendYield → backend/src/utils/exRights.ts:424
 * - validateStockCode → frontend/src/utils/securityEngine.ts:177（返回 ValidationResult，取 .valid/.sanitized）
 * - encodeHTML → frontend/src/utils/securityEngine.ts:54
 * - calculateMean → frontend/src/utils/correlationMatrix.ts:54
 * - calculateStdDev → frontend/src/utils/correlationMatrix.ts:59
 *
 * 三、未迁移清单及原因
 * - calculatePE / calculatePB：生产仅有 scorePE/scorePB 打分函数，无 PE/PB 计算导出。
 * - validateDateRange：生产只有单日 isValidTradeDate（frontend/src/utils/validation.ts），无区间校验导出。
 * - isSameDay：生产无同日布尔判定导出（tradingCalendar.localDayKey 只返回归一化 Date）。
 * - median：生产无中位数导出。
 * 上述用例保留原自抄实现并加注释，用例数与断言数不减少。
 */

import { describe, it, expect } from 'vitest';

import { formatAmount } from '../../../frontend/src/utils/dataTransformUtils';
import {
  formatPercent,
  formatChangePercent,
  formatLargeNumber,
  formatDate,
} from '../../../frontend/src/utils/formatters';
import { isTradingDay, nextTradingDay } from '../utils/tradingCalendar';
import { calculateChange, calculateTurnoverRate } from '../models/Stock';
import { calculateDividendYield } from '../utils/exRights';
import { validateStockCode, encodeHTML } from '../../../frontend/src/utils/securityEngine';
import { calculateMean, calculateStdDev } from '../../../frontend/src/utils/correlationMatrix';

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
  it('小数比率换算为百分比', () => {
    // 生产口径：0.0567 表示 5.67%；旧自抄 5.67 → '+5.67%' 口径错误
    expect(formatPercent(0.0567)).toBe('5.67%');
  });

  it('负数比率', () => {
    expect(formatPercent(-0.0321)).toBe('-3.21%');
  });

  it('零值', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('自定义小数位', () => {
    expect(formatPercent(0.0314159, 3)).toBe('3.142%');
  });

  it('整十百分比', () => {
    expect(formatPercent(0.1)).toBe('10.00%');
  });

  it('极小值', () => {
    expect(formatPercent(0.0001)).toBe('0.01%');
  });

  it('负数零', () => {
    expect(formatPercent(-0)).toBe('0.00%');
  });
});

describe('formatChangePercent（生产带正号口径）', () => {
  it('正数带加号', () => {
    expect(formatChangePercent(5.67)).toBe('+5.67%');
  });

  it('负数带减号', () => {
    expect(formatChangePercent(-3.21)).toBe('-3.21%');
  });

  it('零带加号', () => {
    expect(formatChangePercent(0)).toBe('+0.00%');
  });

  it('四舍五入到两位', () => {
    expect(formatChangePercent(5.678)).toBe('+5.68%');
  });

  it('空值返回横线', () => {
    expect(formatChangePercent(undefined)).toBe('-');
    expect(formatChangePercent(null)).toBe('-');
  });
});

describe('formatLargeNumber', () => {
  it('万亿级别使用千分位', () => {
    expect(formatLargeNumber(2.5e12)).toBe('2,500,000,000,000');
  });

  it('十亿级别使用千分位', () => {
    expect(formatLargeNumber(1.2e9)).toBe('1,200,000,000');
  });

  it('百万级别使用千分位', () => {
    expect(formatLargeNumber(5e6)).toBe('5,000,000');
  });

  it('千级别使用千分位', () => {
    expect(formatLargeNumber(3e3)).toBe('3,000');
  });

  it('小于1000直接显示', () => {
    expect(formatLargeNumber(999)).toBe('999');
  });

  it('负数处理', () => {
    expect(formatLargeNumber(-1.5e9)).toBe('-1,500,000,000');
  });

  it('零值', () => {
    expect(formatLargeNumber(0)).toBe('0');
  });

  it('NaN 返回横线', () => {
    expect(formatLargeNumber(NaN)).toBe('-');
  });
});

describe('isTradingDay', () => {
  it('2026年工作日是交易日', () => {
    expect(isTradingDay('2026-01-05')).toBe(true);
    expect(isTradingDay('2026-01-06')).toBe(true);
    expect(isTradingDay('2026-01-07')).toBe(true);
    expect(isTradingDay('2026-01-08')).toBe(true);
    expect(isTradingDay('2026-01-09')).toBe(true);
  });

  it('周六周日不是交易日', () => {
    expect(isTradingDay('2026-01-10')).toBe(false);
    expect(isTradingDay('2026-01-11')).toBe(false);
  });

  it('法定休市日不是交易日（旧实现只跳周末）', () => {
    expect(isTradingDay('2026-01-01')).toBe(false); // 元旦
    expect(isTradingDay('2026-02-16')).toBe(false); // 春节
    expect(isTradingDay('2026-10-01')).toBe(false); // 国庆
  });
});

describe('nextTradingDay', () => {
  it('周五的下一天是下周一', () => {
    expect(nextTradingDay('2026-01-09')).toBe('2026-01-12');
  });

  it('周六的下一天是下周一', () => {
    expect(nextTradingDay('2026-01-10')).toBe('2026-01-12');
  });

  it('工作日的下一天是次日', () => {
    expect(nextTradingDay('2026-01-05')).toBe('2026-01-06');
  });

  it('节前最后交易日后跳到节后（旧实现只跳周末）', () => {
    expect(nextTradingDay('2026-09-30')).toBe('2026-10-08');
  });
});

describe('formatDate', () => {
  it('正确格式化日期', () => {
    expect(formatDate(new Date(2026, 2, 15))).toBe('2026-03-15');
  });

  it('单位数月日补零', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

// 未迁移：生产无 isSameDay 导出，保留原自抄实现
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

describe('isSameDay（未迁移）', () => {
  it('同一天返回true', () => {
    const a = new Date(2026, 0, 15, 9, 30);
    const b = new Date(2026, 0, 15, 15, 0);
    expect(isSameDay(a, b)).toBe(true);
  });

  it('不同天返回false', () => {
    const a = new Date(2026, 0, 15);
    const b = new Date(2026, 0, 16);
    expect(isSameDay(a, b)).toBe(false);
  });

  it('不同月同日返回false', () => {
    const a = new Date(2026, 0, 15);
    const b = new Date(2026, 1, 15);
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe('calculateChange', () => {
  it('上涨场景', () => {
    const result = calculateChange(105, 100);
    expect(result.change).toBe(5);
    expect(result.changePercent).toBe(5);
  });

  it('下跌场景', () => {
    const result = calculateChange(95, 100);
    expect(result.change).toBe(-5);
    expect(result.changePercent).toBe(-5);
  });

  it('不变', () => {
    const result = calculateChange(100, 100);
    expect(result.change).toBe(0);
    expect(result.changePercent).toBe(0);
  });

  it('前收盘为0：change为价差、changePercent为0（旧实现只返回百分比且为0）', () => {
    const result = calculateChange(100, 0);
    expect(result.change).toBe(100);
    expect(result.changePercent).toBe(0);
  });

  it('涨停板 (10%)', () => {
    const result = calculateChange(110, 100);
    expect(result.change).toBe(10);
    expect(result.changePercent).toBe(10);
  });

  it('跌停板 (-10%)', () => {
    const result = calculateChange(90, 100);
    expect(result.change).toBe(-10);
    expect(result.changePercent).toBe(-10);
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

// 未迁移：生产无 calculatePE 导出（backend/src/utils 仅有 scorePE 打分）
function calculatePE(price: number, eps: number): number {
  if (eps <= 0) return Infinity;
  return price / eps;
}

describe('calculatePE（未迁移）', () => {
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

// 未迁移：生产无 calculatePB 导出
function calculatePB(price: number, bvps: number): number {
  if (bvps <= 0) return Infinity;
  return price / bvps;
}

describe('calculatePB（未迁移）', () => {
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

  it('负价格返回0（旧实现只拦 ===0）', () => {
    expect(calculateDividendYield(5, -100)).toBe(0);
  });
});

describe('validateStockCode', () => {
  it('有效的6位数字代码', () => {
    const sh = validateStockCode('600519');
    expect(sh.valid).toBe(true);
    expect(sh.sanitized).toBe('600519');
    const sz = validateStockCode('000001');
    expect(sz.valid).toBe(true);
    expect(sz.sanitized).toBe('000001');
  });

  it('带前缀的有效代码（大小写不敏感、自动转大写）', () => {
    const sh = validateStockCode('sh600519');
    expect(sh.valid).toBe(true);
    expect(sh.sanitized).toBe('SH600519');
    const sz = validateStockCode('SZ000001');
    expect(sz.valid).toBe(true);
    expect(sz.sanitized).toBe('SZ000001');
    const padded = validateStockCode(' sh600519 ');
    expect(padded.valid).toBe(true);
    expect(padded.sanitized).toBe('SH600519');
  });

  it('无效代码', () => {
    expect(validateStockCode('12345').valid).toBe(false);
    expect(validateStockCode('abc').valid).toBe(false);
    expect(validateStockCode('').valid).toBe(false);
  });
});

// 未迁移：生产只有单日 isValidTradeDate，无日期区间校验导出
function validateDateRange(start: string, end: string): boolean {
  const s = new Date(start);
  const e = new Date(end);
  return !isNaN(s.getTime()) && !isNaN(e.getTime()) && s <= e;
}

describe('validateDateRange（未迁移）', () => {
  it('有效日期范围', () => {
    expect(validateDateRange('2026-01-01', '2026-12-31')).toBe(true);
  });

  it('开始大于结束', () => {
    expect(validateDateRange('2026-12-31', '2026-01-01')).toBe(false);
  });

  it('同一天有效', () => {
    expect(validateDateRange('2026-06-15', '2026-06-15')).toBe(true);
  });

  it('无效日期格式', () => {
    expect(validateDateRange('invalid', '2026-01-01')).toBe(false);
  });
});

describe('encodeHTML', () => {
  it('转义HTML标签', () => {
    expect(encodeHTML('<script>')).toBe('&lt;script&gt;');
  });

  it('转义双引号', () => {
    expect(encodeHTML('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('转义单引号', () => {
    expect(encodeHTML("it's")).toBe('it&#x27;s');
  });

  it('安全文本不变', () => {
    expect(encodeHTML('hello world')).toBe('hello world');
  });

  it('空字符串返回空', () => {
    expect(encodeHTML('')).toBe('');
  });

  it('转义 &（旧实现漏转义，会产生双重编码风险）', () => {
    expect(encodeHTML('a & b')).toBe('a &amp; b');
  });

  it('转义 /（旧实现漏转义）', () => {
    expect(encodeHTML('a/b/c')).toBe('a&#x2F;b&#x2F;c');
  });
});

describe('calculateMean', () => {
  it('正确计算均值', () => {
    expect(calculateMean([1, 2, 3, 4, 5])).toBe(3);
  });

  it('空数组返回0', () => {
    expect(calculateMean([])).toBe(0);
  });

  it('单元素数组', () => {
    expect(calculateMean([42])).toBe(42);
  });

  it('负数处理', () => {
    expect(calculateMean([-10, -5, 0, 5, 10])).toBe(0);
  });
});

describe('calculateStdDev', () => {
  it('正确计算样本标准差', () => {
    // 生产用样本方差 ÷(n-1)：2.138089935299395；旧自抄用总体方差 ÷n
    expect(calculateStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('空数组返回0', () => {
    expect(calculateStdDev([])).toBe(0);
  });

  it('单元素数组', () => {
    expect(calculateStdDev([42])).toBe(0);
  });

  it('相同值的标准差为0', () => {
    expect(calculateStdDev([5, 5, 5, 5])).toBe(0);
  });
});

// 未迁移：生产无 median 导出
function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

describe('median / min / max（未迁移）', () => {
  it('正确计算中位数（奇数个）', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it('正确计算中位数（偶数个）', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('正确计算最小最大值', () => {
    expect(Math.min(...[5, 3, 8, 1, 9])).toBe(1);
    expect(Math.max(...[5, 3, 8, 1, 9])).toBe(9);
  });

  it('空数组中位数返回0', () => {
    expect(median([])).toBe(0);
  });
});
