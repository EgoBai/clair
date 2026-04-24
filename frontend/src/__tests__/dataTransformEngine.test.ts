import { describe, it, expect } from 'vitest';

// ===== 数据转换与映射引擎 =====
describe('Data Transform & Mapping Engine', () => {
  // 数据扁平化
  const flattenObject = (obj: Record<string, any>, prefix: string = ''): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(result, flattenObject(value, newKey));
      } else {
        result[newKey] = value;
      }
    }
    return result;
  };

  // 数据分组
  const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> => {
    return arr.reduce((acc, item) => {
      const groupKey = String(item[key]);
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  };

  // 数据透视
  const pivot = <T extends Record<string, any>>(data: T[], rowKey: keyof T, colKey: keyof T, valueKey: keyof T): Record<string, Record<string, any>> => {
    const result: Record<string, Record<string, any>> = {};
    for (const item of data) {
      const row = String(item[rowKey]);
      const col = String(item[colKey]);
      if (!result[row]) result[row] = {};
      result[row][col] = item[valueKey];
    }
    return result;
  };

  // 数组去重
  const uniqueBy = <T>(arr: T[], key: keyof T): T[] => {
    const seen = new Set();
    return arr.filter(item => {
      const val = item[key];
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  };

  // 深度合并
  const deepMerge = (target: any, source: any): any => {
    if (typeof target !== 'object' || typeof source !== 'object') return source;
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (key in target && typeof target[key] === 'object' && typeof source[key] === 'object') {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  };

  // 数据映射转换
  const mapValues = <T, U>(obj: Record<string, T>, fn: (val: T, key: string) => U): Record<string, U> => {
    const result: Record<string, U> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = fn(value, key);
    }
    return result;
  };

  // 嵌套取值
  const getNestedValue = (obj: any, path: string, defaultValue?: any): any => {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current == null) return defaultValue;
      current = current[key];
    }
    return current ?? defaultValue;
  };

  // 嵌套设值
  const setNestedValue = (obj: any, path: string, value: any): any => {
    const keys = path.split('.');
    const result = { ...obj };
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    return result;
  };

  // 对象差异
  const objectDiff = (a: Record<string, any>, b: Record<string, any>): Record<string, { old: any; new: any }> => {
    const diff: Record<string, { old: any; new: any }> = {};
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
        diff[key] = { old: a[key], new: b[key] };
      }
    }
    return diff;
  };

  // 数组排序稳定版
  const stableSort = <T>(arr: T[], compareFn: (a: T, b: T) => number): T[] => {
    return arr.map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const cmp = compareFn(a.item, b.item);
        return cmp !== 0 ? cmp : a.index - b.index;
      })
      .map(x => x.item);
  };

  describe('对象扁平化', () => {
    it('简单对象', () => {
      expect(flattenObject({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it('嵌套对象', () => {
      expect(flattenObject({ a: { b: 1 } })).toEqual({ 'a.b': 1 });
    });

    it('深层嵌套', () => {
      expect(flattenObject({ a: { b: { c: 1 } } })).toEqual({ 'a.b.c': 1 });
    });

    it('混合类型', () => {
      expect(flattenObject({ a: 1, b: { c: [1, 2], d: 'x' } })).toEqual({ a: 1, 'b.c': [1, 2], 'b.d': 'x' });
    });

    it('空对象', () => {
      expect(flattenObject({})).toEqual({});
    });

    it('数组保持不变', () => {
      expect(flattenObject({ a: [1, 2, 3] })).toEqual({ a: [1, 2, 3] });
    });

    it('null值保留', () => {
      expect(flattenObject({ a: null, b: { c: null } })).toEqual({ a: null, 'b.c': null });
    });

    it('布尔值', () => {
      expect(flattenObject({ a: true, b: { c: false } })).toEqual({ a: true, 'b.c': false });
    });

    it('自定义前缀', () => {
      expect(flattenObject({ a: 1 }, 'root')).toEqual({ 'root.a': 1 });
    });

    it('多层混合嵌套', () => {
      const result = flattenObject({ x: { y: { z: 1 } }, w: 2, v: { u: { t: 's' } } });
      expect(result).toEqual({ 'x.y.z': 1, w: 2, 'v.u.t': 's' });
    });
  });

  describe('数据分组', () => {
    it('按字符串分组', () => {
      const data = [{ type: 'A', val: 1 }, { type: 'B', val: 2 }, { type: 'A', val: 3 }];
      const result = groupBy(data, 'type');
      expect(result['A'].length).toBe(2);
      expect(result['B'].length).toBe(1);
    });

    it('按数字分组', () => {
      const data = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 1, name: 'c' }];
      const result = groupBy(data, 'id');
      expect(Object.keys(result).length).toBe(2);
    });

    it('空数组', () => {
      expect(groupBy([], 'key')).toEqual({});
    });

    it('单元素', () => {
      const result = groupBy([{ x: 1 }], 'x');
      expect(result['1'].length).toBe(1);
    });

    it('所有相同键', () => {
      const data = [{ k: 'same' }, { k: 'same' }, { k: 'same' }];
      const result = groupBy(data, 'k');
      expect(Object.keys(result).length).toBe(1);
      expect(result['same'].length).toBe(3);
    });
  });

  describe('数据透视', () => {
    it('基本透视', () => {
      const data = [
        { region: 'East', product: 'A', sales: 100 },
        { region: 'East', product: 'B', sales: 200 },
        { region: 'West', product: 'A', sales: 150 },
      ];
      const result = pivot(data, 'region', 'product', 'sales');
      expect(result['East']['A']).toBe(100);
      expect(result['West']['A']).toBe(150);
    });

    it('缺失值为undefined', () => {
      const data = [{ r: 'A', c: 'X', v: 1 }];
      const result = pivot(data, 'r', 'c', 'v');
      expect(result['A']['Y']).toBeUndefined();
    });
  });

  describe('数组去重', () => {
    it('按key去重', () => {
      const data = [{ id: 1, name: 'a' }, { id: 1, name: 'b' }, { id: 2, name: 'c' }];
      expect(uniqueBy(data, 'id').length).toBe(2);
    });

    it('全部唯一', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      expect(uniqueBy(data, 'id').length).toBe(3);
    });

    it('全部重复', () => {
      const data = [{ id: 1 }, { id: 1 }, { id: 1 }];
      expect(uniqueBy(data, 'id').length).toBe(1);
    });

    it('空数组', () => {
      expect(uniqueBy([], 'id')).toEqual([]);
    });
  });

  describe('深度合并', () => {
    it('简单合并', () => {
      expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it('覆盖同名键', () => {
      expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    it('嵌套合并', () => {
      const result = deepMerge({ a: { b: 1 } }, { a: { c: 2 } });
      expect(result).toEqual({ a: { b: 1, c: 2 } });
    });

    it('非对象返回source', () => {
      expect(deepMerge(1, { a: 1 })).toEqual({ a: 1 });
    });

    it('深层嵌套合并', () => {
      const result = deepMerge({ a: { b: { c: 1 } } }, { a: { b: { d: 2 } } });
      expect(result).toEqual({ a: { b: { c: 1, d: 2 } } });
    });
  });

  describe('值映射', () => {
    it('乘以2', () => {
      expect(mapValues({ a: 1, b: 2 }, v => v * 2)).toEqual({ a: 2, b: 4 });
    });

    it('转字符串', () => {
      expect(mapValues({ a: 1 }, v => String(v))).toEqual({ a: '1' });
    });

    it('使用key', () => {
      expect(mapValues({ a: 1 }, (v, k) => `${k}=${v}`)).toEqual({ a: 'a=1' });
    });

    it('空对象', () => {
      expect(mapValues({}, v => v)).toEqual({});
    });
  });

  describe('嵌套取值', () => {
    it('一级', () => {
      expect(getNestedValue({ a: 1 }, 'a')).toBe(1);
    });

    it('二级', () => {
      expect(getNestedValue({ a: { b: 2 } }, 'a.b')).toBe(2);
    });

    it('不存在返回默认值', () => {
      expect(getNestedValue({}, 'a.b', 'default')).toBe('default');
    });

    it('null路径', () => {
      expect(getNestedValue({ a: null }, 'a.b', 'fallback')).toBe('fallback');
    });

    it('undefined值', () => {
      expect(getNestedValue({ a: undefined }, 'a', 'fallback')).toBe('fallback');
    });
  });

  describe('嵌套设值', () => {
    it('设一级', () => {
      expect(setNestedValue({}, 'a', 1)).toEqual({ a: 1 });
    });

    it('设二级', () => {
      expect(setNestedValue({}, 'a.b', 2)).toEqual({ a: { b: 2 } });
    });

    it('不修改原对象', () => {
      const original = { a: 1 };
      setNestedValue(original, 'b', 2);
      expect(original).toEqual({ a: 1 });
    });
  });

  describe('对象差异', () => {
    it('相同返回空', () => {
      expect(objectDiff({ a: 1 }, { a: 1 })).toEqual({});
    });

    it('检测差异', () => {
      const diff = objectDiff({ a: 1 }, { a: 2 });
      expect(diff['a']).toEqual({ old: 1, new: 2 });
    });

    it('检测新增', () => {
      const diff = objectDiff({ a: 1 }, { a: 1, b: 2 });
      expect(diff['b']).toEqual({ old: undefined, new: 2 });
    });

    it('检测删除', () => {
      const diff = objectDiff({ a: 1, b: 2 }, { a: 1 });
      expect(diff['b']).toEqual({ old: 2, new: undefined });
    });
  });

  describe('稳定排序', () => {
    it('保持稳定', () => {
      const data = [
        { name: 'a', priority: 1 },
        { name: 'b', priority: 1 },
        { name: 'c', priority: 2 },
      ];
      const sorted = stableSort(data, (a, b) => a.priority - b.priority);
      expect(sorted[0].name).toBe('a');
      expect(sorted[1].name).toBe('b');
    });

    it('空数组', () => {
      expect(stableSort([], (a, b) => a - b)).toEqual([]);
    });

    it('单元素', () => {
      expect(stableSort([1], (a, b) => a - b)).toEqual([1]);
    });

    it('降序', () => {
      const sorted = stableSort([3, 1, 2], (a, b) => b - a);
      expect(sorted).toEqual([3, 2, 1]);
    });
  });
});
