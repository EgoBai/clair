import { describe, it, expect } from 'vitest';

// ===== 数值格式化与解析引擎 =====
describe('Number Format & Parse Engine', () => {
  // 数字格式化
  const formatNumber = (num: number, decimals: number = 2, separator: string = ','): string => {
    if (!isFinite(num)) return String(num);
    const parts = Math.abs(num).toFixed(decimals).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return (num < 0 ? '-' : '') + intPart + (parts[1] ? '.' + parts[1] : '');
  };

  // 大数字简写
  const abbreviateNumber = (num: number, precision: number = 1): string => {
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(precision) + 'T';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(precision) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(precision) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(precision) + 'K';
    return sign + abs.toFixed(precision);
  };

  // 百分比格式化
  const formatPercent = (num: number, decimals: number = 2, showSign: boolean = false): string => {
    const val = (num * 100).toFixed(decimals) + '%';
    if (showSign && num > 0) return '+' + val;
    return val;
  };

  // 文件大小格式化
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + units[i];
  };

  // 持续时间格式化
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h + 'h ' + m + 'm';
  };

  // 数字范围钳制
  const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val));

  // 线性插值
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp(t, 0, 1);

  // 映射范围
  const mapRange = (val: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
    return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
  };

  // 数字安全除法
  const safeDivide = (a: number, b: number, fallback: number = 0): number => {
    return b !== 0 && isFinite(b) ? a / b : fallback;
  };

  // 数字精度控制
  const toPrecision = (num: number, precision: number): number => {
    if (num === 0) return 0;
    const factor = Math.pow(10, precision - Math.floor(Math.log10(Math.abs(num))) - 1);
    return Math.round(num * factor) / factor;
  };

  // 范围内随机整数
  const randomInt = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  // 数字阶乘
  const factorial = (n: number): number => {
    if (n < 0 || !Number.isInteger(n)) return NaN;
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  };

  // 组合数 C(n,k)
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
      expect(formatNumber(Infinity)).toBe('Infinity');
    });

    it('NaN', () => {
      expect(formatNumber(NaN)).toBe('NaN');
    });

    it('自定义分隔符', () => {
      expect(formatNumber(1234567, 2, '.')).toBe('1.234.567.00');
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
      expect(formatPercent(0.05, 2, true)).toBe('+5.00%');
    });

    it('负数不带正号', () => {
      expect(formatPercent(-0.03, 2, true)).toBe('-3.00%');
    });

    it('零', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });

    it('整数百分比', () => {
      expect(formatPercent(1, 0)).toBe('100%');
    });
  });

  describe('文件大小格式化', () => {
    it('零字节', () => {
      expect(formatFileSize(0)).toBe('0 B');
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
    it('毫秒', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('秒', () => {
      expect(formatDuration(3500)).toBe('3.5s');
    });

    it('分钟', () => {
      expect(formatDuration(90000)).toBe('1m 30s');
    });

    it('小时', () => {
      expect(formatDuration(3661000)).toBe('1h 1m');
    });

    it('零', () => {
      expect(formatDuration(0)).toBe('0ms');
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

    it('超出范围被钳制', () => {
      expect(lerp(0, 10, 2)).toBe(10);
      expect(lerp(0, 10, -1)).toBe(0);
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
