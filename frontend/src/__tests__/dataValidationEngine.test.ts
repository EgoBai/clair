import { describe, it, expect } from 'vitest';

// 数据校验与清洗引擎
describe('数据校验与清洗引擎', () => {
  describe('股票代码校验', () => {
    function validateStockCode(code: string): { valid: boolean; market: string; error: string } {
      if (!code || code.length !== 6) return { valid: false, market: '', error: '代码长度必须为6位' };
      if (!/^\d{6}$/.test(code)) return { valid: false, market: '', error: '代码必须全为数字' };
      if (code.startsWith('60')) return { valid: true, market: '上海主板', error: '' };
      if (code.startsWith('000') || code.startsWith('001')) return { valid: true, market: '深圳主板', error: '' };
      if (code.startsWith('002')) return { valid: true, market: '中小板', error: '' };
      if (code.startsWith('300') || code.startsWith('301')) return { valid: true, market: '创业板', error: '' };
      if (code.startsWith('688') || code.startsWith('689')) return { valid: true, market: '科创板', error: '' };
      if (code.startsWith('8') || code.startsWith('4')) return { valid: true, market: '北交所', error: '' };
      return { valid: true, market: '其他', error: '' };
    }

    it('上海主板代码60开头', () => {
      const result = validateStockCode('600036');
      expect(result.valid).toBe(true);
      expect(result.market).toBe('上海主板');
    });

    it('深圳主板代码000开头', () => {
      const result = validateStockCode('000001');
      expect(result.valid).toBe(true);
      expect(result.market).toBe('深圳主板');
    });

    it('创业板代码300开头', () => {
      const result = validateStockCode('300750');
      expect(result.valid).toBe(true);
      expect(result.market).toBe('创业板');
    });

    it('科创板代码688开头', () => {
      const result = validateStockCode('688981');
      expect(result.valid).toBe(true);
      expect(result.market).toBe('科创板');
    });

    it('空代码无效', () => {
      expect(validateStockCode('').valid).toBe(false);
    });

    it('短代码无效', () => {
      expect(validateStockCode('600').valid).toBe(false);
    });

    it('长代码无效', () => {
      expect(validateStockCode('6000360').valid).toBe(false);
    });

    it('含字母代码无效', () => {
      expect(validateStockCode('60003A').valid).toBe(false);
    });

    it('002开头为中小板', () => {
      expect(validateStockCode('002001').market).toBe('中小板');
    });

    it('301开头为创业板', () => {
      expect(validateStockCode('301001').market).toBe('创业板');
    });

    it('001开头为深圳主板', () => {
      expect(validateStockCode('001001').market).toBe('深圳主板');
    });
  });

  describe('价格数据校验', () => {
    interface PriceData { open: number; high: number; low: number; close: number; volume: number; }

    function validateOHLC(data: PriceData): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      if (data.high < data.low) errors.push('最高价低于最低价');
      if (data.high < data.open) errors.push('最高价低于开盘价');
      if (data.high < data.close) errors.push('最高价低于收盘价');
      if (data.low > data.open) errors.push('最低价高于开盘价');
      if (data.low > data.close) errors.push('最低价高于收盘价');
      if (data.volume < 0) errors.push('成交量为负');
      if (data.open <= 0 || data.high <= 0 || data.low <= 0 || data.close <= 0) errors.push('价格必须为正');
      return { valid: errors.length === 0, errors };
    }

    it('有效OHLC数据', () => {
      const data: PriceData = { open: 10, high: 11, low: 9, close: 10.5, volume: 1000 };
      expect(validateOHLC(data).valid).toBe(true);
    });

    it('最高价低于最低价', () => {
      const data: PriceData = { open: 10, high: 8, low: 9, close: 10, volume: 1000 };
      expect(validateOHLC(data).valid).toBe(false);
    });

    it('负成交量', () => {
      const data: PriceData = { open: 10, high: 11, low: 9, close: 10.5, volume: -100 };
      expect(validateOHLC(data).valid).toBe(false);
    });

    it('零价格', () => {
      const data: PriceData = { open: 0, high: 11, low: 9, close: 10.5, volume: 1000 };
      expect(validateOHLC(data).valid).toBe(false);
    });

    it('负价格', () => {
      const data: PriceData = { open: -10, high: 11, low: 9, close: 10.5, volume: 1000 };
      expect(validateOHLC(data).valid).toBe(false);
    });

    it('十字星数据有效', () => {
      const data: PriceData = { open: 10, high: 10.5, low: 9.5, close: 10.01, volume: 500 };
      expect(validateOHLC(data).valid).toBe(true);
    });

    it('最高价低于开盘价', () => {
      const data: PriceData = { open: 11, high: 10, low: 9, close: 10.5, volume: 1000 };
      expect(validateOHLC(data).valid).toBe(false);
    });

    it('最低价高于收盘价', () => {
      const data: PriceData = { open: 10, high: 12, low: 11, close: 10.5, volume: 1000 };
      expect(validateOHLC(data).valid).toBe(false);
    });

    it('收集多个错误', () => {
      const data: PriceData = { open: 0, high: 8, low: 9, close: 10, volume: -1 };
      const result = validateOHLC(data);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('零成交量有效', () => {
      const data: PriceData = { open: 10, high: 11, low: 9, close: 10.5, volume: 0 };
      expect(validateOHLC(data).valid).toBe(true);
    });
  });

  describe('时间序列数据清洗', () => {
    function cleanTimeSeries(data: (number | null | undefined)[]): number[] {
      const cleaned: number[] = [];
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== null && data[i] !== undefined && !isNaN(data[i] as number) && isFinite(data[i] as number)) {
          cleaned.push(data[i] as number);
        }
      }
      return cleaned;
    }

    function interpolateGaps(data: (number | null)[]): number[] {
      const result = [...data] as number[];
      for (let i = 0; i < result.length; i++) {
        if (result[i] === null) {
          let prev = i - 1;
          while (prev >= 0 && result[prev] === null) prev--;
          let next = i + 1;
          while (next < result.length && result[next] === null) next++;
          if (prev >= 0 && next < result.length) {
            result[i] = (result[prev] + result[next]) / 2;
          } else if (prev >= 0) {
            result[i] = result[prev];
          } else if (next < result.length) {
            result[i] = result[next];
          } else {
            result[i] = 0;
          }
        }
      }
      return result;
    }

    it('移除null值', () => {
      expect(cleanTimeSeries([1, null, 2, null, 3])).toEqual([1, 2, 3]);
    });

    it('移除undefined值', () => {
      expect(cleanTimeSeries([1, undefined, 2])).toEqual([1, 2]);
    });

    it('移除NaN', () => {
      expect(cleanTimeSeries([1, NaN, 2])).toEqual([1, 2]);
    });

    it('移除Infinity', () => {
      expect(cleanTimeSeries([1, Infinity, 2])).toEqual([1, 2]);
    });

    it('空数组', () => {
      expect(cleanTimeSeries([])).toEqual([]);
    });

    it('全为null返回空', () => {
      expect(cleanTimeSeries([null, null])).toEqual([]);
    });

    it('保留有效数据', () => {
      expect(cleanTimeSeries([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('插值填补中间空值', () => {
      expect(interpolateGaps([1, null, 3])).toEqual([1, 2, 3]);
    });

    it('插值填补头部空值', () => {
      expect(interpolateGaps([null, null, 3])).toEqual([3, 3, 3]);
    });

    it('插值填补尾部空值', () => {
      expect(interpolateGaps([1, null, null])).toEqual([1, 1, 1]);
    });

    it('无空值不变化', () => {
      expect(interpolateGaps([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('连续空值线性插值', () => {
      expect(interpolateGaps([10, null, null, 16])).toEqual([10, 13, 14.5, 16]);
    });
  });

  describe('数值范围校验', () => {
    function validateRange(value: number, min: number, max: number, name: string): { valid: boolean; error: string } {
      if (typeof value !== 'number' || isNaN(value)) return { valid: false, error: `${name}必须为数字` };
      if (value < min) return { valid: false, error: `${name}不能小于${min}` };
      if (value > max) return { valid: false, error: `${name}不能大于${max}` };
      return { valid: true, error: '' };
    }

    it('值在范围内', () => {
      expect(validateRange(50, 0, 100, '测试').valid).toBe(true);
    });

    it('值低于最小值', () => {
      expect(validateRange(-1, 0, 100, '测试').valid).toBe(false);
    });

    it('值高于最大值', () => {
      expect(validateRange(101, 0, 100, '测试').valid).toBe(false);
    });

    it('等于最小值有效', () => {
      expect(validateRange(0, 0, 100, '测试').valid).toBe(true);
    });

    it('等于最大值有效', () => {
      expect(validateRange(100, 0, 100, '测试').valid).toBe(true);
    });

    it('NaN无效', () => {
      expect(validateRange(NaN, 0, 100, '测试').valid).toBe(false);
    });

    it('错误信息包含字段名', () => {
      const result = validateRange(-1, 0, 100, '价格');
      expect(result.error).toContain('价格');
    });
  });

  describe('格式化与解析', () => {
    function parseChineseNumber(str: string): number {
      const units: Record<string, number> = { '万': 1e4, '亿': 1e8, '万亿': 1e12 };
      for (const [unit, multiplier] of Object.entries(units).reverse()) {
        if (str.endsWith(unit)) {
          return parseFloat(str.slice(0, -unit.length)) * multiplier;
        }
      }
      return parseFloat(str);
    }

    function formatLargeNumber(n: number): string {
      if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + '万亿';
      if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
      if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + '万';
      return n.toFixed(2);
    }

    it('解析"万"', () => {
      expect(parseChineseNumber('100万')).toBe(100 * 1e4);
    });

    it('解析"亿"', () => {
      expect(parseChineseNumber('10亿')).toBe(10 * 1e8);
    });

    it('解析"万亿"', () => {
      expect(parseChineseNumber('1.5万亿')).toBe(1.5 * 1e12);
    });

    it('纯数字解析', () => {
      expect(parseChineseNumber('12345')).toBe(12345);
    });

    it('格式化亿级', () => {
      expect(formatLargeNumber(15e8)).toBe('15.00亿');
    });

    it('格式化万亿级', () => {
      expect(formatLargeNumber(2e12)).toBe('2.00万亿');
    });

    it('格式化万级', () => {
      expect(formatLargeNumber(5e4)).toBe('5.00万');
    });

    it('小数保持原样', () => {
      expect(formatLargeNumber(100)).toBe('100.00');
    });

    it('负数格式化', () => {
      expect(formatLargeNumber(-15e8)).toBe('-15.00亿');
    });

    it('零格式化', () => {
      expect(formatLargeNumber(0)).toBe('0.00');
    });
  });

  describe('重复数据检测', () => {
    function findDuplicates<T>(arr: T[], keyFn: (item: T) => string): T[][] {
      const groups = new Map<string, T[]>();
      for (const item of arr) {
        const key = keyFn(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }
      return Array.from(groups.values()).filter(g => g.length > 1);
    }

    it('找到重复项', () => {
      const items = [{ code: '600036' }, { code: '600036' }, { code: '000001' }];
      const dups = findDuplicates(items, i => i.code);
      expect(dups).toHaveLength(1);
      expect(dups[0]).toHaveLength(2);
    });

    it('无重复项', () => {
      const items = [{ code: '600036' }, { code: '000001' }];
      expect(findDuplicates(items, i => i.code)).toHaveLength(0);
    });

    it('空数组', () => {
      expect(findDuplicates([], (i: unknown) => String(i))).toHaveLength(0);
    });

    it('多个重复组', () => {
      const items = [
        { code: 'A' }, { code: 'A' },
        { code: 'B' }, { code: 'B' }, { code: 'B' },
        { code: 'C' },
      ];
      const dups = findDuplicates(items, i => i.code);
      expect(dups).toHaveLength(2);
    });

    it('全部相同', () => {
      const items = [{ code: 'X' }, { code: 'X' }, { code: 'X' }];
      const dups = findDuplicates(items, i => i.code);
      expect(dups).toHaveLength(1);
      expect(dups[0]).toHaveLength(3);
    });
  });
});
