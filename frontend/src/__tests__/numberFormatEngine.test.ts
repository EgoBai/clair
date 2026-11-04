/**
 * 影子测试迁移（批次 12）
 *
 * 旧文件自带一份被测实现副本（formatNumber/formatPercent/formatFileSize/
 * formatDuration/lerp 等），断言的是副本而不是产品。现已 import 生产实现。
 *
 * 已绑定生产实现：
 * - ../utils/formatters.ts: formatNumber / formatPercent / formatChangePercent /
 *   formatFileSize / formatDuration
 * - ../utils/chartAnimation.ts: lerp
 *
 * 旧断言错在哪（旧副本与生产行为不一致）：
 *
 * | 旧断言 | 生产输出 | 依据 |
 * | --- | --- | --- |
 * | formatNumber(Infinity) === 'Infinity' | '∞' | formatters.ts:12 用 toLocaleString('zh-CN') |
 * | formatNumber(1234567, 2, '.') === '1.234.567.00' | 生产无第三个参数 | 生产签名只有 (num, decimals) |
 * | formatPercent(0.05, 2, true) === '+5.00%' | formatPercent(0.05) = '5.00%'；formatChangePercent(5) = '+5.00%' | 生产无 showSign，正号由 formatChangePercent（输入为百分数）提供 |
 * | formatFileSize(0) === '0 B' | '0.00 B' | formatters.ts:132 没有零值特判 |
 * | formatDuration(500) === '500ms'（英文） | '0秒' | formatters.ts:115 为中文口径，且先 floor 到秒 |
 * | formatDuration(3500) === '3.5s' | '3秒' | 同上，无亚秒/小数输出 |
 * | lerp(0, 10, 2) === 10（钳制） | 20（线性外推） | chartAnimation.ts:48 不钳制 t |
 *
 * 未迁移——生产无对应实现（保留本地 helper）：
 * - formatNumberWithSeparator：生产 formatNumber 不支持自定义分隔符
 * - abbreviateNumber：生产无 T/B/M/K 简写导出
 * - clamp：前端无导出（backend/src/utils/futureValueUtils.ts:255 有同名实现，
 *   前端测试不绑后端，故保留本地）
 * - mapRange / safeDivide / toPrecision / factorial / combination：生产无导出
 *
 * 发现的生产缺口（只报告不修）：
 * - formatDuration 丢失亚秒精度：500ms 显示 '0秒'
 * - formatFileSize 单位只到 TB，超过 1024TB 仍以 TB 显示
 * - formatPercent 与 formatChangePercent 输入口径不同（小数 vs 已乘 100 的百分数），
 *   且 formatPercent 不支持正号，易误用
 * - 仓库存在多套同名 formatter：styles/theme.ts:155/161（亿/万）、
 *   utils/performanceAnalytics.ts:514/523（μs/1 位小数）
 */
import { describe, it, expect } from 'vitest';
import {
  formatChangePercent,
  formatDuration,
  formatFileSize,
  formatNumber,
  formatPercent,
} from '../utils/formatters';
import { lerp } from '../utils/chartAnimation';

// ===== 数值格式化与解析引擎 =====
describe('Number Format & Parse Engine', () => {
  // 未迁移——生产无对应实现：自定义分隔符
  const formatNumberWithSeparator = (num: number, decimals: number = 2, separator: string = ','): string => {
    if (!isFinite(num)) return String(num);
    const parts = Math.abs(num).toFixed(decimals).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return (num < 0 ? '-' : '') + intPart + (parts[1] ? '.' + parts[1] : '');
  };

  // 未迁移——生产无对应实现：大数字简写
  const abbreviateNumber = (num: number, precision: number = 1): string => {
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(precision) + 'T';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(precision) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(precision) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(precision) + 'K';
    return sign + abs.toFixed(precision);
  };

  // 未迁移——生产无对应实现：范围映射
  const mapRange = (val: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
    return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
  };

  // 未迁移——前端无导出，使用本地实现
  const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val));

  // 未迁移——生产无对应实现：安全除法
  const safeDivide = (a: number, b: number, fallback: number = 0): number => {
    return b !== 0 && isFinite(b) ? a / b : fallback;
  };

  // 未迁移——生产无对应实现：精度控制
  const toPrecision = (num: number, precision: number): number => {
    if (num === 0) return 0;
    const factor = Math.pow(10, precision - Math.floor(Math.log10(Math.abs(num))) - 1);
    return Math.round(num * factor) / factor;
  };

  // 未迁移——生产无对应实现：阶乘
  const factorial = (n: number): number => {
    if (n < 0 || !Number.isInteger(n)) return NaN;
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  };

  // 未迁移——生产无对应实现：组合数
  const combination = (n: number, k: number): number => {
    if (k > n || k < 0) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 0; i < k; i++) {
      result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
  };

  describe('数字格式化', () => {
    it('整数千分位', () => {
      expect(formatNumber(1234567)).toBe('1,234,567.00');
    });

    it('小数', () => {
      expect(formatNumber(1234.5, 1)).toBe('1,234.5');
    });

    it('零', () => {
      expect(formatNumber(0)).toBe('0.00');
    });

    it('负数', () => {
      expect(formatNumber(-1234)).toBe('-1,234.00');
    });

    it('Infinity', () => {
      // P2 统一口径：±Infinity 不再是 toLocaleString 的 '∞'，一律返回 '—'
      expect(formatNumber(Infinity)).toBe('—');
      expect(formatNumber(-Infinity)).toBe('—');
    });

    it('NaN', () => {
      expect(formatNumber(NaN)).toBe('—');
    });

    it('自定义分隔符', () => {
      // 未迁移——生产 formatNumber 无 separator 参数，此用例只覆盖本地 helper
      expect(formatNumberWithSeparator(1234567, 2, '.')).toBe('1.234.567.00');
    });

    it('小数位为零', () => {
      expect(formatNumber(1234.56, 0)).toBe('1,235');
    });

    it('很小的数', () => {
      expect(formatNumber(0.001, 4)).toBe('0.0010');
    });
  });

  describe('大数字简写', () => {
    it('万亿', () => {
      expect(abbreviateNumber(1.5e12)).toBe('1.5T');
    });

    it('十亿', () => {
      expect(abbreviateNumber(2.3e9)).toBe('2.3B');
    });

    it('百万', () => {
      expect(abbreviateNumber(5e6)).toBe('5.0M');
    });

    it('千', () => {
      expect(abbreviateNumber(1500)).toBe('1.5K');
    });

    it('小于千', () => {
      expect(abbreviateNumber(500)).toBe('500.0');
    });

    it('负数', () => {
      expect(abbreviateNumber(-2.5e9)).toBe('-2.5B');
    });

    it('零', () => {
      expect(abbreviateNumber(0)).toBe('0.0');
    });

    it('精度控制', () => {
      expect(abbreviateNumber(1234567, 0)).toBe('1M');
    });
  });

  describe('百分比格式化', () => {
    it('基本', () => {
      expect(formatPercent(0.1234)).toBe('12.34%');
    });

    it('带正号', () => {
      // 生产 formatPercent 无 showSign；正号由 formatChangePercent 提供（输入为百分数）
      expect(formatPercent(0.05)).toBe('5.00%');
      expect(formatChangePercent(5)).toBe('+5.00%');
    });

    it('负数不带正号', () => {
      expect(formatPercent(-0.03)).toBe('-3.00%');
      expect(formatChangePercent(-3)).toBe('-3.00%');
    });

    it('零', () => {
      expect(formatPercent(0)).toBe('0.00%');
      expect(formatChangePercent(0)).toBe('+0.00%');
    });

    it('整数百分比', () => {
      expect(formatPercent(1, 0)).toBe('100%');
    });
  });

  describe('文件大小格式化', () => {
    it('零字节', () => {
      // 生产没有零值特判：0 / 1024^0 后 toFixed(2)
      expect(formatFileSize(0)).toBe('0.00 B');
    });

    it('字节', () => {
      expect(formatFileSize(500)).toBe('500.00 B');
    });

    it('KB', () => {
      expect(formatFileSize(1024)).toBe('1.00 KB');
    });

    it('MB', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
    });

    it('GB', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    });

    it('TB', () => {
      expect(formatFileSize(1024 ** 4)).toBe('1.00 TB');
    });

    it('混合', () => {
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.50 MB');
    });
  });

  describe('持续时间格式化', () => {
    it('不足一秒', () => {
      // 生产先 floor 到秒，亚秒精度丢失（生产缺口，只报告不修）
      expect(formatDuration(500)).toBe('0秒');
    });

    it('秒', () => {
      expect(formatDuration(3500)).toBe('3秒');
    });

    it('分钟', () => {
      expect(formatDuration(90000)).toBe('1分钟30秒');
    });

    it('小时', () => {
      expect(formatDuration(3661000)).toBe('1小时1分钟');
    });

    it('零', () => {
      expect(formatDuration(0)).toBe('0秒');
    });

    it('天', () => {
      expect(formatDuration(86400000)).toBe('1天0小时');
    });
  });

  describe('数值钳制', () => {
    it('在范围内', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('低于最小值', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('超过最大值', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('等于边界', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe('线性插值', () => {
    it('中点', () => {
      expect(lerp(0, 10, 0.5)).toBe(5);
    });

    it('起点', () => {
      expect(lerp(0, 10, 0)).toBe(0);
    });

    it('终点', () => {
      expect(lerp(0, 10, 1)).toBe(10);
    });

    it('超出范围外推', () => {
      // 生产 chartAnimation.lerp 不钳制 t（旧副本钳制，旧断言错误）
      expect(lerp(0, 10, 2)).toBe(20);
      expect(lerp(0, 10, -1)).toBe(-10);
    });
  });

  describe('范围映射', () => {
    it('基本映射', () => {
      expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    });

    it('边界映射', () => {
      expect(mapRange(0, 0, 10, 20, 40)).toBe(20);
      expect(mapRange(10, 0, 10, 20, 40)).toBe(40);
    });

    it('反转范围', () => {
      expect(mapRange(5, 0, 10, 100, 0)).toBe(50);
    });
  });

  describe('安全除法', () => {
    it('正常除法', () => {
      expect(safeDivide(10, 2)).toBe(5);
    });

    it('除以零返回默认值', () => {
      expect(safeDivide(10, 0)).toBe(0);
    });

    it('自定义默认值', () => {
      expect(safeDivide(10, 0, -1)).toBe(-1);
    });

    it('除以Infinity', () => {
      expect(safeDivide(10, Infinity)).toBe(0);
    });
  });

  describe('精度控制', () => {
    it('保留有效数字', () => {
      expect(toPrecision(12345, 3)).toBe(12300);
    });

    it('小数', () => {
      expect(toPrecision(0.0012345, 3)).toBe(0.00123);
    });

    it('零', () => {
      expect(toPrecision(0, 3)).toBe(0);
    });

    it('负数', () => {
      expect(toPrecision(-12345, 3)).toBe(-12300);
    });
  });

  describe('阶乘', () => {
    it('0! = 1', () => {
      expect(factorial(0)).toBe(1);
    });

    it('1! = 1', () => {
      expect(factorial(1)).toBe(1);
    });

    it('5! = 120', () => {
      expect(factorial(5)).toBe(120);
    });

    it('10! = 3628800', () => {
      expect(factorial(10)).toBe(3628800);
    });

    it('负数返回NaN', () => {
      expect(factorial(-1)).toBeNaN();
    });

    it('小数返回NaN', () => {
      expect(factorial(1.5)).toBeNaN();
    });
  });

  describe('组合数', () => {
    it('C(5,2) = 10', () => {
      expect(combination(5, 2)).toBe(10);
    });

    it('C(n,0) = 1', () => {
      expect(combination(5, 0)).toBe(1);
    });

    it('C(n,n) = 1', () => {
      expect(combination(5, 5)).toBe(1);
    });

    it('k > n 返回0', () => {
      expect(combination(3, 5)).toBe(0);
    });

    it('C(10,3) = 120', () => {
      expect(combination(10, 3)).toBe(120);
    });

    it('负k返回0', () => {
      expect(combination(5, -1)).toBe(0);
    });
  });
});
