import { describe, it, expect } from 'vitest';

// 数据验证与清洗引擎测试
describe('数据验证引擎', () => {
  describe('股票代码格式验证', () => {
    const validateStockCode = (code: string): boolean => {
      if (!code || typeof code !== 'string') return false;
      const patterns = [
        /^(60|68|90|11|12|13)\d{4}$/,  // 上交所
        /^(00|03|30|15|16)\d{4}$/,      // 深交所
        /^(83|87|43)\d{4}$/,             // 北交所
        /^(51|56|58|15|16)\d{4}$/,       // ETF
        /^(HK|hk)\d{4,5}$/,             // 港股
      ];
      return patterns.some(p => p.test(code));
    };

    it.each([
      ['600000', true],
      ['000001', true],
      ['300001', true],
      ['688001', true],
      ['830001', true],
      ['510050', true],
      ['000', false],
      ['', false],
      ['ABCDEFG', false],
      ['999999', false],
      ['60000', false],
      ['6000000', false],
      [' 600000', false],
      ['600000 ', false],
    ])('验证股票代码 %s => %s', (code, expected) => {
      expect(validateStockCode(code)).toBe(expected);
    });
  });

  describe('价格数据验证', () => {
    const validatePriceData = (data: {
      open: number; high: number; low: number; close: number; volume: number;
    }): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];
      if (data.open < 0) errors.push('开盘价不能为负');
      if (data.close < 0) errors.push('收盘价不能为负');
      if (data.high < Math.max(data.open, data.close)) errors.push('最高价异常');
      if (data.low > Math.min(data.open, data.close)) errors.push('最低价异常');
      if (data.volume < 0) errors.push('成交量不能为负');
      if (data.high < data.low) errors.push('最高价低于最低价');
      return { valid: errors.length === 0, errors };
    };

    it('验证正常K线数据', () => {
      const result = validatePriceData({ open: 10, high: 12, low: 9, close: 11, volume: 1000 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('检测负价格', () => {
      const result = validatePriceData({ open: -1, high: 12, low: 9, close: 11, volume: 1000 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('开盘价不能为负');
    });

    it('检测最高价异常', () => {
      const result = validatePriceData({ open: 10, high: 8, low: 7, close: 11, volume: 1000 });
      expect(result.valid).toBe(false);
    });

    it('检测最低价异常', () => {
      const result = validatePriceData({ open: 10, high: 12, low: 11, close: 9, volume: 1000 });
      expect(result.valid).toBe(false);
    });

    it('检测负成交量', () => {
      const result = validatePriceData({ open: 10, high: 12, low: 9, close: 11, volume: -100 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('成交量不能为负');
    });

    it('十字星K线有效', () => {
      const result = validatePriceData({ open: 10, high: 10.5, low: 9.5, close: 10, volume: 500 });
      expect(result.valid).toBe(true);
    });
  });

  describe('时间序列数据验证', () => {
    const validateTimeSeries = (dates: string[]): { valid: boolean; gaps: number[] } => {
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]).getTime();
        const curr = new Date(dates[i]).getTime();
        const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diffDays > 4) gaps.push(i); // 超过4天可能是跳过周末+节假日
      }
      return { valid: gaps.length === 0 || gaps.every(g => g > 0), gaps };
    };

    it('连续日期序列有效', () => {
      const dates = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];
      const result = validateTimeSeries(dates);
      expect(result.gaps).toHaveLength(0);
    });

    it('空序列返回valid', () => {
      expect(validateTimeSeries([]).valid).toBe(true);
    });

    it('单日期有效', () => {
      expect(validateTimeSeries(['2024-01-01']).valid).toBe(true);
    });

    it('检测日期跳跃', () => {
      const dates = ['2024-01-02', '2024-01-03', '2024-01-15', '2024-01-16'];
      const result = validateTimeSeries(dates);
      expect(result.gaps.length).toBeGreaterThan(0);
    });
  });

  describe('数据清洗', () => {
    const cleanNumericData = (data: (number | null | undefined | string)[]): number[] => {
      return data
        .filter((v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v))
        .map(v => Math.round(v * 100) / 100);
    };

    it('过滤null和undefined', () => {
      expect(cleanNumericData([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    });

    it('过滤NaN', () => {
      expect(cleanNumericData([1, NaN, 2])).toEqual([1, 2]);
    });

    it('过滤Infinity', () => {
      expect(cleanNumericData([1, Infinity, -Infinity, 2])).toEqual([1, 2]);
    });

    it('保留两位小数', () => {
      expect(cleanNumericData([1.123456, 2.987654])).toEqual([1.12, 2.99]);
    });

    it('空数组返回空', () => {
      expect(cleanNumericData([])).toEqual([]);
    });

    it('全部无效返回空', () => {
      expect(cleanNumericData([null, undefined, NaN])).toEqual([]);
    });
  });

  describe('异常值检测', () => {
    const detectOutliers = (data: number[], threshold = 2): number[] => {
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length);
      return data.filter(v => Math.abs(v - mean) > threshold * std);
    };

    it('检测明显异常值', () => {
      const data = [1, 1.1, 0.9, 1.05, 0.95, 100];
      const outliers = detectOutliers(data);
      expect(outliers).toContain(100);
    });

    it('正常波动不标记异常', () => {
      const data = [10, 10.1, 9.9, 10.05, 9.95];
      expect(detectOutliers(data)).toHaveLength(0);
    });

    it('空数组返回空', () => {
      expect(detectOutliers([])).toEqual([]);
    });

    it('单元素不标记异常', () => {
      expect(detectOutliers([5])).toEqual([]);
    });

    it('3倍标准差阈值更严格', () => {
      const data = [1, 1, 1, 1, 3]; // 3 可能在2std外但不在3std外
      const outliers2 = detectOutliers(data, 2);
      const outliers3 = detectOutliers(data, 3);
      expect(outliers3.length).toBeLessThanOrEqual(outliers2.length);
    });
  });

  describe('数据对齐', () => {
    const alignSeries = (seriesA: [number, number][], seriesB: [number, number][]): {
      a: number[]; b: number[];
    } => {
      const mapA = new Map(seriesA);
      const mapB = new Map(seriesB);
      const commonKeys = [...mapA.keys()].filter(k => mapB.has(k)).sort((a, b) => a - b);
      return {
        a: commonKeys.map(k => mapA.get(k)!),
        b: commonKeys.map(k => mapB.get(k)!),
      };
    };

    it('对齐两个时间序列', () => {
      const a: [number, number][] = [[1, 10], [2, 20], [3, 30]];
      const b: [number, number][] = [[2, 200], [3, 300], [4, 400]];
      const result = alignSeries(a, b);
      expect(result.a).toEqual([20, 30]);
      expect(result.b).toEqual([200, 300]);
    });

    it('完全不重叠返回空', () => {
      const a: [number, number][] = [[1, 10]];
      const b: [number, number][] = [[2, 20]];
      expect(alignSeries(a, b).a).toEqual([]);
    });

    it('完全重叠保留所有', () => {
      const a: [number, number][] = [[1, 10], [2, 20]];
      const b: [number, number][] = [[1, 100], [2, 200]];
      const result = alignSeries(a, b);
      expect(result.a).toHaveLength(2);
    });
  });

  describe('数据采样', () => {
    const downsample = (data: number[], targetSize: number): number[] => {
      if (data.length <= targetSize) return [...data];
      const step = data.length / targetSize;
      const result: number[] = [];
      for (let i = 0; i < targetSize; i++) {
        const start = Math.floor(i * step);
        const end = Math.floor((i + 1) * step);
        const slice = data.slice(start, Math.min(end, data.length));
        result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      return result;
    };

    it('下采样保持数据趋势', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const sampled = downsample(data, 10);
      expect(sampled).toHaveLength(10);
      expect(sampled[0]).toBeLessThan(sampled[9]);
    });

    it('小数据集不下采样', () => {
      const data = [1, 2, 3];
      expect(downsample(data, 10)).toEqual([1, 2, 3]);
    });

    it('精确匹配大小', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      expect(downsample(data, 100)).toEqual(data);
    });
  });
});

describe('数据完整性校验', () => {
  describe('字段完整性检查', () => {
    const checkCompleteness = (record: Record<string, unknown>, required: string[]): string[] => {
      return required.filter(f => record[f] === undefined || record[f] === null || record[f] === '');
    };

    it('完整记录无缺失', () => {
      const record = { code: '600000', name: '浦发银行', price: 10.5 };
      expect(checkCompleteness(record, ['code', 'name', 'price'])).toEqual([]);
    });

    it('检测缺失字段', () => {
      const record = { code: '600000', name: '', price: null };
      const missing = checkCompleteness(record, ['code', 'name', 'price']);
      expect(missing).toContain('name');
      expect(missing).toContain('price');
    });

    it('0和false不算缺失', () => {
      const record = { count: 0, active: false };
      expect(checkCompleteness(record, ['count', 'active'])).toEqual([]);
    });
  });

  describe('重复数据检测', () => {
    const findDuplicates = <T>(data: T[], keyFn: (item: T) => string): T[][] => {
      const groups = new Map<string, T[]>();
      for (const item of data) {
        const key = keyFn(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }
      return [...groups.values()].filter(g => g.length > 1);
    };

    it('检测重复股票数据', () => {
      const data = [
        { code: '600000', date: '2024-01-01' },
        { code: '600000', date: '2024-01-01' },
        { code: '000001', date: '2024-01-01' },
      ];
      const dups = findDuplicates(data, d => `${d.code}-${d.date}`);
      expect(dups).toHaveLength(1);
      expect(dups[0]).toHaveLength(2);
    });

    it('无重复返回空', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      expect(findDuplicates(data, d => String(d.id))).toHaveLength(0);
    });
  });

  describe('数据范围校验', () => {
    const rangeCheck = (value: number, min: number, max: number, field: string): string | null => {
      if (value < min) return `${field}: ${value} < ${min}`;
      if (value > max) return `${field}: ${value} > ${max}`;
      return null;
    };

    it.each([
      [10, 0, 100, 'price', null],
      [-1, 0, 100, 'price', 'price: -1 < 0'],
      [101, 0, 100, 'price', 'price: 101 > 100'],
      [0, 0, 100, 'price', null],
      [100, 0, 100, 'price', null],
    ])('rangeCheck(%d, %d, %d, "%s") => %s', (value, min, max, field, expected) => {
      expect(rangeCheck(value, min, max, field)).toBe(expected);
    });
  });

  describe('数据类型强制转换', () => {
    const coerceToNumber = (value: unknown): number | null => {
      if (typeof value === 'number' && isFinite(value)) return value;
      if (typeof value === 'string') {
        const cleaned = value.replace(/[,%¥$]/g, '').trim();
        const num = Number(cleaned);
        if (isFinite(num)) return num;
      }
      return null;
    };

    it.each([
      [123, 123],
      ['456', 456],
      ['1,234.56', 1234.56],
      ['¥100', 100],
      ['$50.5', 50.5],
      ['abc', null],
      [null, null],
      [undefined, null],
      [NaN, null],
      [Infinity, null],
      ['', 0],
      ['  123  ', 123],
    ])('coerceToNumber(%o) => %s', (input, expected) => {
      expect(coerceToNumber(input)).toBe(expected);
    });
  });
});
