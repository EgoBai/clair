import { describe, it, expect } from 'vitest';

// DOM交互与工具函数测试 - 剪贴板、URL处理、DOM操作、事件

function parseUrlParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const search = url.split('?')[1] || '';
  if (!search) return params;
  search.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
  });
  return params;
}

function buildUrlParams(base: string, params: Record<string, string | undefined>): string {
  const validParams = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][];
  if (validParams.length === 0) return base;
  const query = validParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${base}?${query}`;
}

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T & { cancel: () => void };
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return debounced;
}

function throttle<T extends (...args: any[]) => any>(fn: T, limit: number): T {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T;
  const clone: any = {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepClone((obj as any)[key]);
  }
  return clone;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item: any, i: number) => deepEqual(item, b[i]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => deepEqual(a[key], b[key]));
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((groups, item) => {
    const group = String(item[key]);
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

function unique<T>(arr: T[], keyFn?: (item: T) => any): T[] {
  if (!keyFn) return [...new Set(arr)];
  const seen = new Set();
  return arr.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function flatten(arr: any[]): any[] {
  return arr.reduce((flat, item) => {
    return flat.concat(Array.isArray(item) ? flatten(item) : item);
  }, []);
}

function omit<T extends Record<string, any>>(obj: T, keys: string[]): Partial<T> {
  const result = { ...obj };
  keys.forEach(k => delete result[k]);
  return result;
}

function pick<T extends Record<string, any>>(obj: T, keys: string[]): Partial<T> {
  const result: any = {};
  keys.forEach(k => { if (k in obj) result[k] = obj[k]; });
  return result;
}

describe('DOM交互与工具函数测试', () => {
  describe('URL参数处理', () => {
    it('解析URL参数', () => {
      const params = parseUrlParams('https://example.com?code=600519&name=茅台');
      expect(params.code).toBe('600519');
      expect(params.name).toBe('茅台');
    });

    it('无参数', () => {
      expect(parseUrlParams('https://example.com')).toEqual({});
    });

    it('编码参数', () => {
      const params = parseUrlParams('https://x.com?q=%E8%8C%85%E5%8F%B0');
      expect(params.q).toBe('茅台');
    });

    it('空值参数', () => {
      const params = parseUrlParams('https://x.com?empty=');
      expect(params.empty).toBe('');
    });

    it('构建URL参数', () => {
      const url = buildUrlParams('/api/stocks', { code: '600519', page: '1' });
      expect(url).toBe('/api/stocks?code=600519&page=1');
    });

    it('无参数构建', () => {
      expect(buildUrlParams('/api', {})).toBe('/api');
    });

    it('过滤undefined', () => {
      const url = buildUrlParams('/api', { a: '1', b: undefined, c: '3' });
      expect(url).toContain('a=1');
      expect(url).toContain('c=3');
      expect(url).not.toContain('b=');
    });

    it('编码特殊字符', () => {
      const url = buildUrlParams('/api', { q: 'A&B C' });
      expect(url).toContain('A%26B%20C');
    });
  });

  describe('深拷贝与深比较', () => {
    it('基本深拷贝', () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = deepClone(obj);
      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
      clone.b.c = 999;
      expect(obj.b.c).toBe(2);
    });

    it('数组深拷贝', () => {
      const arr = [1, [2, 3], { a: 4 }];
      const clone = deepClone(arr);
      expect(clone).toEqual(arr);
      expect(clone[1]).not.toBe(arr[1]);
    });

    it('null处理', () => {
      expect(deepClone(null)).toBe(null);
    });

    it('基本类型', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('str')).toBe('str');
    });

    it('深比较相等', () => {
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    });

    it('深比较不等', () => {
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('null比较', () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, 0)).toBe(false);
    });
  });

  describe('数组工具', () => {
    it('分组', () => {
      const data = [
        { type: 'A', value: 1 },
        { type: 'B', value: 2 },
        { type: 'A', value: 3 },
      ];
      const grouped = groupBy(data, 'type');
      expect(grouped.A).toHaveLength(2);
      expect(grouped.B).toHaveLength(1);
    });

    it('去重（基本）', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });

    it('去重（自定义key）', () => {
      const data = [{ id: 1, name: 'a' }, { id: 1, name: 'b' }, { id: 2, name: 'c' }];
      const result = unique(data, item => item.id);
      expect(result).toHaveLength(2);
    });

    it('分块', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('分块空数组', () => {
      expect(chunk([], 3)).toEqual([]);
    });

    it('扁平化', () => {
      expect(flatten([1, [2, [3, 4]], 5])).toEqual([1, 2, 3, 4, 5]);
    });

    it('扁平化混合', () => {
      expect(flatten([1, [2], 3, [[4, 5]]])).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('对象工具', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };

    it('omit排除字段', () => {
      const result = omit(obj, ['b', 'd']);
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('pick选择字段', () => {
      const result = pick(obj, ['a', 'c']);
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('omit不存在的字段', () => {
      const result = omit(obj, ['x', 'y']);
      expect(result).toEqual(obj);
    });

    it('pick不存在的字段', () => {
      const result = pick(obj, ['a', 'x']);
      expect(result).toEqual({ a: 1 });
    });

    it('空操作', () => {
      expect(omit(obj, [])).toEqual(obj);
      expect(pick(obj, [])).toEqual({});
    });
  });

  describe('节流与防抖', () => {
    it('节流限制频率', () => {
      let count = 0;
      const fn = throttle(() => count++, 100);
      fn(); fn(); fn();
      expect(count).toBe(1);
    });

    it('防抖只执行最后一次', async () => {
      let last = '';
      const fn = debounce((v: string) => { last = v; }, 10);
      fn('a');
      fn('b');
      fn('c');
      await new Promise(r => setTimeout(r, 20));
      expect(last).toBe('c');
    });

    it('防抖cancel', async () => {
      let called = false;
      const fn = debounce(() => { called = true; }, 10);
      fn();
      fn.cancel();
      await new Promise(r => setTimeout(r, 20));
      expect(called).toBe(false);
    });
  });
});
