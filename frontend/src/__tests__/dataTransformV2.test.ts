import { describe, it, expect } from 'vitest';

/**
 * 数据转换 v2 测试
 */

function parseNumber(str: string): number | null {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str.replace(/[,，\s]/g, '');
  const multiplier: Record<string, number> = { '万': 1e4, '亿': 1e8, 'T': 1e12, 'B': 1e9, 'M': 1e6, 'K': 1e3 };
  const last = cleaned[cleaned.length - 1];
  if (multiplier[last]) {
    const num = parseFloat(cleaned.slice(0, -1));
    return isNaN(num) ? null : num * multiplier[last];
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function sortBy<T>(arr: T[], key: keyof T, dir: 'asc' | 'desc' = 'asc'): T[] {
  return [...arr].sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val as Record<string, unknown>, path));
    } else {
      result[path] = val;
    }
  }
  return result;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function unique<T>(arr: T[], key?: keyof T): T[] {
  if (!key) return [...new Set(arr)];
  const seen = new Set<unknown>();
  return arr.filter(item => {
    const val = item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

function partition<T>(arr: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [], fail: T[] = [];
  for (const item of arr) (predicate(item) ? pass : fail).push(item);
  return [pass, fail];
}

function zip<T, U>(a: T[], b: U[]): [T, U][] {
  const len = Math.min(a.length, b.length);
  return Array.from({ length: len }, (_, i) => [a[i], b[i]]);
}

describe('数据转换 v2', () => {
  describe('数字解析', () => {
    it('中文万', () => {
      expect(parseNumber('1.5万')).toBe(15000);
    });

    it('中文亿', () => {
      expect(parseNumber('2亿')).toBe(200000000);
    });

    it('英文K', () => {
      expect(parseNumber('5K')).toBe(5000);
    });

    it('英文M', () => {
      expect(parseNumber('3M')).toBe(3000000);
    });

    it('普通数字', () => {
      expect(parseNumber('1234.56')).toBe(1234.56);
    });

    it('带逗号', () => {
      expect(parseNumber('1,234,567')).toBe(1234567);
    });

    it('空字符串', () => {
      expect(parseNumber('')).toBeNull();
    });

    it('非数字', () => {
      expect(parseNumber('abc')).toBeNull();
    });
  });

  describe('深拷贝', () => {
    it('独立副本', () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = deepClone(obj);
      clone.b.c = 3;
      expect(obj.b.c).toBe(2);
    });

    it('数组深拷贝', () => {
      const arr = [1, [2, 3]];
      const clone = deepClone(arr);
      (clone[1] as number[]).push(4);
      expect((arr[1] as number[]).length).toBe(2);
    });
  });

  describe('分组', () => {
    it('按字段分组', () => {
      const data = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }];
      const grouped = groupBy(data, 'type');
      expect(Object.keys(grouped).length).toBe(2);
      expect(grouped['a'].length).toBe(2);
    });

    it('空数组', () => {
      expect(Object.keys(groupBy([], 'x' as never)).length).toBe(0);
    });
  });

  describe('排序', () => {
    it('升序', () => {
      expect(sortBy([{ v: 3 }, { v: 1 }, { v: 2 }], 'v')[0].v).toBe(1);
    });

    it('降序', () => {
      expect(sortBy([{ v: 3 }, { v: 1 }, { v: 2 }], 'v', 'desc')[0].v).toBe(3);
    });

    it('不修改原数组', () => {
      const arr = [{ v: 3 }, { v: 1 }];
      sortBy(arr, 'v');
      expect(arr[0].v).toBe(3);
    });
  });

  describe('pick/omit', () => {
    it('pick', () => {
      expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('omit', () => {
      expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('扁平化', () => {
    it('嵌套对象', () => {
      const flat = flattenObject({ a: { b: { c: 1 } }, d: 2 });
      expect(flat['a.b.c']).toBe(1);
      expect(flat['d']).toBe(2);
    });

    it('数组不展开', () => {
      const flat = flattenObject({ a: [1, 2] });
      expect(Array.isArray(flat['a'])).toBe(true);
    });
  });

  describe('chunk', () => {
    it('基本分块', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('正好分完', () => {
      expect(chunk([1, 2, 3, 4], 2).length).toBe(2);
    });

    it('空数组', () => {
      expect(chunk([], 3)).toEqual([]);
    });
  });

  describe('去重', () => {
    it('按key去重', () => {
      const data = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }, { id: 2, v: 'c' }];
      expect(unique(data, 'id').length).toBe(2);
    });

    it('简单去重', () => {
      expect(unique([1, 2, 1, 3, 2]).length).toBe(3);
    });
  });

  describe('partition', () => {
    it('正负分离', () => {
      const [pos, neg] = partition([1, -2, 3, -4, 5], n => n > 0);
      expect(pos).toEqual([1, 3, 5]);
      expect(neg).toEqual([-2, -4]);
    });
  });

  describe('zip', () => {
    it('等长数组', () => {
      expect(zip([1, 2], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]);
    });

    it('不等长截断', () => {
      expect(zip([1, 2, 3], ['a']).length).toBe(1);
    });

    it('空数组', () => {
      expect(zip([], [1, 2])).toEqual([]);
    });
  });
});
