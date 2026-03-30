import { describe, it, expect } from 'vitest';

describe('Data Pipeline Engine', () => {
  // 数据清洗
  const removeDuplicates = <T>(data: T[], key: (item: T) => string): T[] => {
    const seen = new Set<string>();
    return data.filter(item => { const k = key(item); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  const fillMissing = (data: (number | null)[], method: 'zero' | 'mean' | 'prev' = 'mean'): number[] => {
    if (method === 'zero') return data.map(d => d ?? 0);
    if (method === 'prev') {
      const result: number[] = [];
      let last = 0;
      for (const d of data) { if (d !== null) { last = d; result.push(d); } else result.push(last); }
      return result;
    }
    const valid = data.filter((d): d is number => d !== null);
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    return data.map(d => d ?? mean);
  };

  const detectOutliers = (data: number[], threshold: number = 2): number[] => {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length);
    if (std === 0) return [];
    return data.filter(d => Math.abs(d - mean) > threshold * std);
  };

  const normalize = (data: number[]): number[] => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    return range === 0 ? data.map(() => 0.5) : data.map(d => (d - min) / range);
  };

  const zScore = (data: number[]): number[] => {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length);
    return std === 0 ? data.map(() => 0) : data.map(d => (d - mean) / std);
  };

  describe('数据清洗', () => {
    it('去重', () => {
      const data = [{ id: '1' }, { id: '2' }, { id: '1' }];
      expect(removeDuplicates(data, d => d.id).length).toBe(2);
    });
    it('无重复', () => {
      const data = [{ id: '1' }, { id: '2' }];
      expect(removeDuplicates(data, d => d.id).length).toBe(2);
    });
    it('全重复', () => {
      const data = [{ id: '1' }, { id: '1' }];
      expect(removeDuplicates(data, d => d.id).length).toBe(1);
    });
    it('空数组', () => expect(removeDuplicates([], (d: any) => d).length).toBe(0));
    it('数字去重', () => {
      const data = [{ v: 1 }, { v: 2 }, { v: 1 }, { v: 3 }, { v: 2 }];
      expect(removeDuplicates(data, d => String(d.v)).length).toBe(3);
    });
  });

  describe('缺失值填充', () => {
    it('零填充', () => {
      expect(fillMissing([1, null, 3], 'zero')).toEqual([1, 0, 3]);
    });
    it('均值填充', () => {
      const result = fillMissing([1, null, 3], 'mean');
      expect(result[1]).toBeCloseTo(2);
    });
    it('前值填充', () => {
      expect(fillMissing([1, null, null, 4], 'prev')).toEqual([1, 1, 1, 4]);
    });
    it('无缺失', () => {
      expect(fillMissing([1, 2, 3], 'zero')).toEqual([1, 2, 3]);
    });
    it('全缺失零填充', () => {
      expect(fillMissing([null, null], 'zero')).toEqual([0, 0]);
    });
    it('首值缺失前值填充', () => {
      expect(fillMissing([null, 2, 3], 'prev')).toEqual([0, 2, 3]);
    });
    it('单值缺失', () => {
      const r = fillMissing([10, null, 20, 30], 'mean');
      expect(r[1]).toBeCloseTo(20);
    });
  });

  describe('异常检测', () => {
    it('检测异常值', () => {
      const normal = Array(20).fill(5);
      expect(detectOutliers([...normal, 500]).length).toBe(1);
    });
    it('无异常', () => {
      expect(detectOutliers([1, 2, 3, 4, 5]).length).toBe(0);
    });
    it('双端异常', () => {
      const normal = Array(20).fill(5);
      expect(detectOutliers([...normal, 500, 600]).length).toBe(2);
    });
    it('阈值宽松', () => {
      expect(detectOutliers([1, 2, 3, 4, 5, 10], 3).length).toBe(0);
    });
    it('全相同', () => {
      expect(detectOutliers([5, 5, 5, 5]).length).toBe(0);
    });
  });

  describe('归一化', () => {
    it('范围0-1', () => {
      const r = normalize([0, 50, 100]);
      expect(r).toEqual([0, 0.5, 1]);
    });
    it('全相同', () => {
      const r = normalize([5, 5, 5]);
      expect(r.every(v => v === 0.5)).toBe(true);
    });
    it('负值', () => {
      const r = normalize([-10, 0, 10]);
      expect(r[0]).toBe(0);
      expect(r[2]).toBe(1);
    });
    it('单元素', () => {
      expect(normalize([42])).toEqual([0.5]);
    });
  });

  describe('Z-Score', () => {
    it('均值为零', () => {
      const r = zScore([1, 2, 3, 4, 5]);
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      expect(mean).toBeCloseTo(0);
    });
    it('全相同为零', () => {
      expect(zScore([5, 5, 5]).every(v => v === 0)).toBe(true);
    });
    it('对称分布', () => {
      const r = zScore([1, 2, 3, 4, 5]);
      expect(r[0]).toBeCloseTo(-r[4]);
    });
  });

  // 时间序列重采样
  const downsample = (data: number[], factor: number, method: 'mean' | 'max' | 'min' | 'sum' = 'mean'): number[] => {
    const result: number[] = [];
    for (let i = 0; i < data.length; i += factor) {
      const slice = data.slice(i, i + factor);
      switch (method) {
        case 'max': result.push(Math.max(...slice)); break;
        case 'min': result.push(Math.min(...slice)); break;
        case 'sum': result.push(slice.reduce((a, b) => a + b, 0)); break;
        default: result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
    }
    return result;
  };

  describe('重采样', () => {
    it('降采样均值', () => {
      expect(downsample([1, 2, 3, 4], 2)).toEqual([1.5, 3.5]);
    });
    it('降采样最大', () => {
      expect(downsample([1, 5, 3, 2], 2, 'max')).toEqual([5, 3]);
    });
    it('降采样最小', () => {
      expect(downsample([1, 5, 3, 2], 2, 'min')).toEqual([1, 2]);
    });
    it('降采样求和', () => {
      expect(downsample([1, 2, 3, 4], 2, 'sum')).toEqual([3, 7]);
    });
    it('因子为1不变化', () => {
      expect(downsample([1, 2, 3], 1)).toEqual([1, 2, 3]);
    });
    it('不整除', () => {
      expect(downsample([1, 2, 3, 4, 5], 2).length).toBe(3);
    });
  });

  // 滑动窗口
  const slidingWindow = <T>(data: T[], size: number, step: number = 1): T[][] => {
    const result: T[][] = [];
    for (let i = 0; i <= data.length - size; i += step) result.push(data.slice(i, i + size));
    return result;
  };

  describe('滑动窗口', () => {
    it('基本窗口', () => {
      expect(slidingWindow([1, 2, 3, 4, 5], 3).length).toBe(3);
    });
    it('步长2', () => {
      expect(slidingWindow([1, 2, 3, 4, 5, 6], 3, 2).length).toBe(2);
    });
    it('窗口等于数据', () => {
      expect(slidingWindow([1, 2, 3], 3).length).toBe(1);
    });
    it('窗口大于数据', () => {
      expect(slidingWindow([1, 2], 3).length).toBe(0);
    });
    it('步长等于窗口', () => {
      expect(slidingWindow([1, 2, 3, 4], 2, 2).length).toBe(2);
    });
    it('内容正确', () => {
      expect(slidingWindow([1, 2, 3, 4], 2)).toEqual([[1, 2], [2, 3], [3, 4]]);
    });
  });

  // 数据聚合
  const groupBy = <T>(data: T[], key: (item: T) => string): Record<string, T[]> => {
    const result: Record<string, T[]> = {};
    for (const item of data) {
      const k = key(item);
      (result[k] ??= []).push(item);
    }
    return result;
  };

  const pivot = <T>(data: T[], rowKey: (item: T) => string, colKey: (item: T) => string, valKey: (item: T) => number): Record<string, Record<string, number>> => {
    const result: Record<string, Record<string, number>> = {};
    for (const item of data) {
      const r = rowKey(item);
      const c = colKey(item);
      (result[r] ??= {})[c] = valKey(item);
    }
    return result;
  };

  describe('数据聚合', () => {
    it('分组', () => {
      const data = [{ cat: 'A', v: 1 }, { cat: 'B', v: 2 }, { cat: 'A', v: 3 }];
      const g = groupBy(data, d => d.cat);
      expect(g['A'].length).toBe(2);
      expect(g['B'].length).toBe(1);
    });
    it('空数据', () => {
      expect(Object.keys(groupBy([], (d: any) => d)).length).toBe(0);
    });
    it('透视表', () => {
      const data = [
        { r: 'a', c: 'x', v: 1 }, { r: 'a', c: 'y', v: 2 },
        { r: 'b', c: 'x', v: 3 }, { r: 'b', c: 'y', v: 4 },
      ];
      const p = pivot(data, d => d.r, d => d.c, d => d.v);
      expect(p['a']['x']).toBe(1);
      expect(p['b']['y']).toBe(4);
    });
    it('单组', () => {
      const g = groupBy([{ k: 'a', v: 1 }], d => d.k);
      expect(g['a'].length).toBe(1);
    });
  });

  // 数据校验
  const validateSchema = (data: Record<string, any>, schema: Record<string, { type: string; required?: boolean }>): string[] => {
    const errors: string[] = [];
    for (const [field, rule] of Object.entries(schema)) {
      if (rule.required && !(field in data)) { errors.push(`Missing: ${field}`); continue; }
      if (field in data && typeof data[field] !== rule.type) errors.push(`Type mismatch: ${field}`);
    }
    return errors;
  };

  describe('数据校验', () => {
    it('有效数据', () => {
      expect(validateSchema({ name: 'test', age: 10 }, { name: { type: 'string', required: true }, age: { type: 'number' } }).length).toBe(0);
    });
    it('缺失必填', () => {
      expect(validateSchema({}, { name: { type: 'string', required: true } })).toContain('Missing: name');
    });
    it('类型不匹配', () => {
      expect(validateSchema({ age: 'ten' }, { age: { type: 'number' } })).toContain('Type mismatch: age');
    });
    it('可选字段', () => {
      expect(validateSchema({}, { extra: { type: 'string' } }).length).toBe(0);
    });
    it('多余字段不报错', () => {
      expect(validateSchema({ a: 1, b: 2 }, { a: { type: 'number' } }).length).toBe(0);
    });
  });
});
