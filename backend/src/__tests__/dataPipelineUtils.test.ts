import { describe, it, expect } from 'vitest';

// ===== 数据导入导出管道测试 =====
describe('Data Import/Export Pipeline', () => {
  // CSV 解析
  const parseCSV = (csv: string): string[][] => {
    const lines = csv.trim().split('\n');
    return lines.map(line => {
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
        current += char;
      }
      fields.push(current.trim());
      return fields;
    });
  };

  const toCSV = (data: Record<string, any>[], headers?: string[]): string => {
    if (data.length === 0) return '';
    const cols = headers || Object.keys(data[0]);
    const rows = data.map(row => cols.map(c => {
      const val = String(row[c] ?? '');
      return val.includes(',') ? `"${val}"` : val;
    }).join(','));
    return [cols.join(','), ...rows].join('\n');
  };

  // JSON 扁平化
  const flatten = (obj: any, prefix: string = ''): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(result, flatten(obj[key], fullKey));
      } else {
        result[fullKey] = obj[key];
      }
    }
    return result;
  };

  // 数据分组
  const groupBy = <T>(data: T[], key: (item: T) => string): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const item of data) {
      const k = key(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return map;
  };

  describe('CSV', () => {
    it('应解析简单CSV', () => {
      const result = parseCSV('a,b,c\n1,2,3');
      expect(result.length).toBe(2);
      expect(result[0]).toEqual(['a', 'b', 'c']);
      expect(result[1]).toEqual(['1', '2', '3']);
    });

    it('应处理引号', () => {
      const result = parseCSV('name,desc\n"hello,world","test"');
      expect(result[1]).toEqual(['hello,world', 'test']);
    });

    it('应转义逗号', () => {
      const csv = toCSV([{ name: 'a,b', value: 1 }]);
      expect(csv).toContain('"a,b"');
    });

    it('空数据应返回空', () => {
      expect(toCSV([])).toBe('');
    });

    it('应支持自定义表头', () => {
      const csv = toCSV([{ a: 1, b: 2 }], ['a']);
      expect(csv).toBe('a\n1');
    });

    it('null值应转为空字符串', () => {
      const csv = toCSV([{ a: null, b: undefined }]);
      expect(csv.split('\n')[1]).toBe(',');
    });
  });

  describe('JSON扁平化', () => {
    it('应扁平化嵌套对象', () => {
      expect(flatten({ a: { b: 1 } })).toEqual({ 'a.b': 1 });
    });

    it('应处理多层嵌套', () => {
      expect(flatten({ a: { b: { c: 2 } } })).toEqual({ 'a.b.c': 2 });
    });

    it('应保留数组', () => {
      expect(flatten({ a: [1, 2] })).toEqual({ a: [1, 2] });
    });

    it('应处理混合', () => {
      const r = flatten({ name: 'x', detail: { price: 10 } });
      expect(r).toEqual({ name: 'x', 'detail.price': 10 });
    });

    it('空对象应返回空', () => {
      expect(flatten({})).toEqual({});
    });
  });

  describe('数据分组', () => {
    it('应按key分组', () => {
      const data = [
        { sector: 'A', name: 'x' },
        { sector: 'A', name: 'y' },
        { sector: 'B', name: 'z' },
      ];
      const grouped = groupBy(data, d => d.sector);
      expect(grouped.get('A')!.length).toBe(2);
      expect(grouped.get('B')!.length).toBe(1);
    });

    it('空数据应返回空map', () => {
      expect(groupBy([], d => (d as any).key).size).toBe(0);
    });

    it('所有同组', () => {
      const data = [{ k: 'x' }, { k: 'x' }];
      const grouped = groupBy(data, d => d.k);
      expect(grouped.size).toBe(1);
      expect(grouped.get('x')!.length).toBe(2);
    });

    it('所有不同组', () => {
      const data = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
      const grouped = groupBy(data, d => d.k);
      expect(grouped.size).toBe(3);
    });
  });

  // 数据排序与去重
  describe('排序去重', () => {
    const uniqueBy = <T>(data: T[], key: (item: T) => any): T[] => {
      const seen = new Set();
      return data.filter(item => {
        const k = key(item);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    it('去重应保留首次', () => {
      const data = [{ id: 1, name: 'a' }, { id: 1, name: 'b' }];
      const result = uniqueBy(data, d => d.id);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('a');
    });

    it('无重复应保持不变', () => {
      const data = [{ id: 1 }, { id: 2 }];
      expect(uniqueBy(data, d => d.id).length).toBe(2);
    });

    it('空数组应返回空', () => {
      expect(uniqueBy([], d => (d as any).id)).toEqual([]);
    });
  });

  // 数值格式化
  describe('金额/量格式化', () => {
    const formatAmount = (v: number): string => {
      const abs = Math.abs(v);
      const sign = v < 0 ? '-' : '';
      if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + '亿';
      if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + '万';
      return v.toFixed(2);
    };

    it('亿级', () => {
      expect(formatAmount(123456789)).toContain('亿');
    });

    it('万级', () => {
      expect(formatAmount(123456)).toContain('万');
    });

    it('小值', () => {
      expect(formatAmount(100)).toBe('100.00');
    });

    it('零', () => {
      expect(formatAmount(0)).toBe('0.00');
    });

    it('负值', () => {
      const r = formatAmount(-123456);
      expect(r).toContain('万');
      expect(r).toContain('-');
    });
  });
});
