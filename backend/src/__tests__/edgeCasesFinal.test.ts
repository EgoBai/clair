import { describe, it, expect } from 'vitest';

describe('边界情况与工具函数', () => {
  // 数值安全操作
  const safeDivide = (a: number, b: number) => {
    if (b === 0) return { result: 0, valid: false };
    if (!isFinite(a) || !isFinite(b)) return { result: 0, valid: false };
    return { result: a / b, valid: true };
  };

  const safePercent = (value: number, total: number) => {
    if (total === 0 || !isFinite(total)) return 0;
    return (value / total) * 100;
  };

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const roundTo = (value: number, decimals: number) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  };

  describe('安全除法', () => {
    it('正常除法', () => {
      expect(safeDivide(10, 2).result).toBe(5);
      expect(safeDivide(10, 2).valid).toBe(true);
    });
    it('除零', () => {
      expect(safeDivide(10, 0).valid).toBe(false);
      expect(safeDivide(10, 0).result).toBe(0);
    });
    it('Infinity', () => {
      expect(safeDivide(Infinity, 2).valid).toBe(false);
    });
    it('负数', () => {
      expect(safeDivide(-10, 2).result).toBe(-5);
    });
  });

  describe('安全百分比', () => {
    it('基本计算', () => {
      expect(safePercent(25, 100)).toBe(25);
    });
    it('零总量', () => {
      expect(safePercent(10, 0)).toBe(0);
    });
    it('小数', () => {
      expect(safePercent(1, 3)).toBeCloseTo(33.333, 1);
    });
  });

  describe('数值clamp', () => {
    it('范围内', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });
    it('低于最小值', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });
    it('高于最大值', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });
    it('边界值', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe('精度舍入', () => {
    it('2位小数', () => {
      expect(roundTo(3.14159, 2)).toBe(3.14);
    });
    it('0位小数', () => {
      expect(roundTo(3.7, 0)).toBe(4);
    });
    it('负数', () => {
      expect(roundTo(-3.14159, 2)).toBe(-3.14);
    });
  });

  // 深度合并
  const deepMerge = (target: any, source: any): any => {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  };

  describe('深度合并', () => {
    it('简单合并', () => {
      expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    });
    it('嵌套合并', () => {
      expect(deepMerge({ a: { x: 1 } }, { a: { y: 2 } })).toEqual({ a: { x: 1, y: 2 } });
    });
    it('覆盖', () => {
      expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });
    it('数组覆盖不合并', () => {
      expect(deepMerge({ a: [1] }, { a: [2] })).toEqual({ a: [2] });
    });
    it('空对象', () => {
      expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
    });
  });

  // 键值对排序
  const sortObjectEntries = (obj: Record<string, number>, order: 'asc' | 'desc' = 'asc') => {
    return Object.entries(obj)
      .sort(([, a], [, b]) => order === 'asc' ? a - b : b - a)
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
  };

  describe('对象排序', () => {
    it('升序', () => {
      const result = sortObjectEntries({ b: 2, a: 1, c: 3 }, 'asc');
      expect(Object.keys(result)).toEqual(['a', 'b', 'c']);
    });
    it('降序', () => {
      const result = sortObjectEntries({ b: 2, a: 1, c: 3 }, 'desc');
      expect(Object.keys(result)).toEqual(['c', 'b', 'a']);
    });
    it('空对象', () => {
      expect(sortObjectEntries({})).toEqual({});
    });
  });
});
