import { describe, it, expect } from 'vitest';

// Data serialization and encoding tests
describe('Data Serialization & Encoding', () => {
  // CSV generation
  describe('CSV Generation', () => {
    interface Stock {
      code: string;
      name: string;
      price: number;
      change: number;
    }

    function toCSV(data: Stock[], headers?: (keyof Stock)[]): string {
      const cols = headers || (Object.keys(data[0]) as (keyof Stock)[]);
      const lines = [cols.join(',')];
      for (const row of data) {
        lines.push(cols.map(c => {
          const val = row[c];
          if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        }).join(','));
      }
      return lines.join('\n');
    }

    it('should generate CSV with headers', () => {
      const data: Stock[] = [{ code: '600519', name: '贵州茅台', price: 2000, change: 1.5 }];
      const csv = toCSV(data);
      expect(csv).toContain('code,name,price,change');
      expect(csv).toContain('600519,贵州茅台,2000,1.5');
    });

    it('should escape commas in values', () => {
      const data: Stock[] = [{ code: 'A', name: 'Test,Inc', price: 100, change: 0 }];
      const csv = toCSV(data);
      expect(csv).toContain('"Test,Inc"');
    });

    it('should escape quotes in values', () => {
      const data: Stock[] = [{ code: 'A', name: 'Say "Hello"', price: 100, change: 0 }];
      const csv = toCSV(data);
      expect(csv).toContain('"Say ""Hello"""');
    });

    it('should support custom headers', () => {
      const data: Stock[] = [{ code: '600519', name: '茅台', price: 2000, change: 1.5 }];
      const csv = toCSV(data, ['code', 'price']);
      expect(csv.split('\n')[0]).toBe('code,price');
      expect(csv.split('\n')[1]).toBe('600519,2000');
    });

    it('should handle multiple rows', () => {
      const data: Stock[] = [
        { code: 'A', name: 'A', price: 1, change: 0 },
        { code: 'B', name: 'B', price: 2, change: 0 },
        { code: 'C', name: 'C', price: 3, change: 0 },
      ];
      const csv = toCSV(data);
      expect(csv.split('\n')).toHaveLength(4); // header + 3 rows
    });
  });

  // JSON flattening
  describe('JSON Flattening', () => {
    function flatten(obj: Record<string, any>, prefix = ''): Record<string, any> {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(result, flatten(value, fullKey));
        } else {
          result[fullKey] = value;
        }
      }
      return result;
    }

    it('should flatten nested objects', () => {
      const result = flatten({ a: { b: { c: 1 } } });
      expect(result['a.b.c']).toBe(1);
    });

    it('should handle arrays as leaf values', () => {
      const result = flatten({ tags: ['a', 'b'] });
      expect(result['tags']).toEqual(['a', 'b']);
    });

    it('should handle flat objects', () => {
      const result = flatten({ x: 1, y: 2 });
      expect(result).toEqual({ x: 1, y: 2 });
    });

    it('should handle mixed nesting', () => {
      const result = flatten({
        stock: { code: '600519', price: { current: 2000, prev: 1990 } },
        volume: 10000,
      });
      expect(result['stock.code']).toBe('600519');
      expect(result['stock.price.current']).toBe(2000);
      expect(result['volume']).toBe(10000);
    });

    it('should handle empty objects', () => {
      expect(flatten({})).toEqual({});
    });
  });

  // Data compression (simple RLE)
  describe('Run-Length Encoding', () => {
    function rleEncode(data: number[]): [number, number][] {
      if (data.length === 0) return [];
      const result: [number, number][] = [];
      let current = data[0];
      let count = 1;
      for (let i = 1; i < data.length; i++) {
        if (data[i] === current) {
          count++;
        } else {
          result.push([current, count]);
          current = data[i];
          count = 1;
        }
      }
      result.push([current, count]);
      return result;
    }

    function rleDecode(encoded: [number, number][]): number[] {
      const result: number[] = [];
      for (const [value, count] of encoded) {
        for (let i = 0; i < count; i++) result.push(value);
      }
      return result;
    }

    it('should encode repeated values', () => {
      expect(rleEncode([1, 1, 1, 2, 2])).toEqual([[1, 3], [2, 2]]);
    });

    it('should encode no repeats', () => {
      expect(rleEncode([1, 2, 3])).toEqual([[1, 1], [2, 1], [3, 1]]);
    });

    it('should encode single value', () => {
      expect(rleEncode([5])).toEqual([[5, 1]]);
    });

    it('should encode empty', () => {
      expect(rleEncode([])).toEqual([]);
    });

    it('should decode back to original', () => {
      const data = [1, 1, 2, 3, 3, 3, 4];
      expect(rleDecode(rleEncode(data))).toEqual(data);
    });
  });

  // Base64-like encoding test
  describe('Hex Encoding', () => {
    function toHex(bytes: number[]): string {
      return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function fromHex(hex: string): number[] {
      const result: number[] = [];
      for (let i = 0; i < hex.length; i += 2) {
        result.push(parseInt(hex.slice(i, i + 2), 16));
      }
      return result;
    }

    it('should encode bytes to hex', () => {
      expect(toHex([0, 255, 128])).toBe('00ff80');
    });

    it('should decode hex to bytes', () => {
      expect(fromHex('00ff80')).toEqual([0, 255, 128]);
    });

    it('should roundtrip', () => {
      const data = [10, 20, 30, 40, 50];
      expect(fromHex(toHex(data))).toEqual(data);
    });

    it('should handle empty', () => {
      expect(toHex([])).toBe('');
      expect(fromHex('')).toEqual([]);
    });
  });

  // URL encoding/decoding
  describe('Query String', () => {
    function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
      return Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
    }

    it('should build query string', () => {
      const qs = buildQueryString({ page: 1, size: 20, q: '茅台' });
      expect(qs).toContain('page=1');
      expect(qs).toContain('size=20');
      expect(qs).toContain(encodeURIComponent('茅台'));
    });

    it('should skip undefined values', () => {
      const qs = buildQueryString({ a: 1, b: undefined, c: 3 });
      expect(qs).not.toContain('b=');
    });

    it('should handle boolean values', () => {
      const qs = buildQueryString({ active: true, deleted: false });
      expect(qs).toContain('active=true');
      expect(qs).toContain('deleted=false');
    });

    it('should handle empty params', () => {
      expect(buildQueryString({})).toBe('');
    });

    it('should encode special characters', () => {
      const qs = buildQueryString({ q: 'a&b=c' });
      expect(qs).toContain(encodeURIComponent('a&b=c'));
    });
  });
});
