import { describe, it, expect } from 'vitest';

// 数据序列化与压缩引擎
describe('数据序列化与压缩', () => {
  function compactJSON(data: Record<string, unknown>): string {
    return JSON.stringify(data);
  }

  function parseJSON<T>(str: string): T | null {
    try { return JSON.parse(str); } catch { return null; }
  }

  function flattenObject(obj: Record<string, unknown>, prefix: string = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
      } else {
        result[newKey] = value;
      }
    }
    return result;
  }

  function unflattenObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        if (!current[part] || typeof current[part] !== 'object') current[part] = {};
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]!] = value;
    }
    return result;
  }

  function encodeRLE(data: number[]): { value: number; count: number }[] {
    if (data.length === 0) return [];
    const result: { value: number; count: number }[] = [];
    let current = data[0]!, count = 1;
    for (let i = 1; i < data.length; i++) {
      if (data[i] === current) count++;
      else { result.push({ value: current, count }); current = data[i]!; count = 1; }
    }
    result.push({ value: current, count });
    return result;
  }

  function decodeRLE(encoded: { value: number; count: number }[]): number[] {
    const result: number[] = [];
    for (const { value, count } of encoded) {
      for (let i = 0; i < count; i++) result.push(value);
    }
    return result;
  }

  function deltaEncode(data: number[]): number[] {
    if (data.length === 0) return [];
    const result = [data[0]!];
    for (let i = 1; i < data.length; i++) result.push(data[i]! - data[i - 1]!);
    return result;
  }

  function deltaDecode(data: number[]): number[] {
    if (data.length === 0) return [];
    const result = [data[0]!];
    for (let i = 1; i < data.length; i++) result.push(result[i - 1]! + data[i]!);
    return result;
  }

  it('应序列化和反序列化', () => {
    const data = { a: 1, b: 'hello', c: [1, 2, 3] };
    expect(parseJSON(compactJSON(data))).toEqual(data);
  });

  it('无效JSON应返回null', () => {
    expect(parseJSON('{invalid}')).toBeNull();
  });

  it('应扁平化嵌套对象', () => {
    const obj = { a: { b: { c: 1 } }, d: 2 };
    expect(flattenObject(obj)).toEqual({ 'a.b.c': 1, d: 2 });
  });

  it('应反扁平化', () => {
    const flat = { 'a.b.c': 1, d: 2 };
    expect(unflattenObject(flat)).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });

  it('扁平化往返应一致', () => {
    const obj = { x: { y: 1 }, z: 'hello' };
    expect(unflattenObject(flattenObject(obj))).toEqual(obj);
  });

  it('应RLE编码', () => {
    const encoded = encodeRLE([1, 1, 1, 2, 2, 3]);
    expect(encoded).toEqual([{ value: 1, count: 3 }, { value: 2, count: 2 }, { value: 3, count: 1 }]);
  });

  it('RLE解码应还原', () => {
    const data = [1, 1, 2, 2, 2, 3];
    expect(decodeRLE(encodeRLE(data))).toEqual(data);
  });

  it('空数据RLE应返回空', () => {
    expect(encodeRLE([])).toHaveLength(0);
  });

  it('应差分编码', () => {
    expect(deltaEncode([10, 12, 15, 20])).toEqual([10, 2, 3, 5]);
  });

  it('差分解码应还原', () => {
    const data = [100, 105, 103, 110];
    expect(deltaDecode(deltaEncode(data))).toEqual(data);
  });

  it('空差分应返回空', () => {
    expect(deltaEncode([])).toHaveLength(0);
  });

  it('大量数据RLE应正确', () => {
    const data = Array.from({ length: 1000 }, (_, i) => Math.floor(i / 10));
    expect(decodeRLE(encodeRLE(data))).toEqual(data);
  });

  it('扁平化数组应保留', () => {
    const obj = { arr: [1, 2, 3], num: 42 };
    const flat = flattenObject(obj);
    expect(flat['arr']).toEqual([1, 2, 3]);
  });
});

// 批量处理引擎
describe('批量处理引擎', () => {
  function batch<T, R>(items: T[], fn: (item: T) => R, batchSize: number): R[][] {
    const batches: R[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize).map(fn));
    }
    return batches;
  }

  function parallelMap<T, R>(items: T[], fn: (item: T, index: number) => R): R[] {
    return items.map(fn);
  }

  function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
    const result: Record<string, T[]> = {};
    for (const item of arr) {
      const key = fn(item);
      if (!result[key]) result[key] = [];
      result[key]!.push(item);
    }
    return result;
  }

  function unique<T>(arr: T[]): T[] {
    return [...new Set(arr)];
  }

  function intersection<T>(a: T[], b: T[]): T[] {
    const setB = new Set(b);
    return a.filter(x => setB.has(x));
  }

  function difference<T>(a: T[], b: T[]): T[] {
    const setB = new Set(b);
    return a.filter(x => !setB.has(x));
  }

  function zip<T, U>(a: T[], b: U[]): [T, U][] {
    const len = Math.min(a.length, b.length);
    return Array.from({ length: len }, (_, i) => [a[i]!, b[i]!]);
  }

  it('应分批处理', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const result = batch(items, x => x * 2, 3);
    expect(result).toEqual([[2, 4, 6], [8, 10, 12], [14]]);
  });

  it('空数组分批应返回空', () => {
    expect(batch([], (x: number) => x, 5)).toHaveLength(0);
  });

  it('应并行映射', () => {
    expect(parallelMap([1, 2, 3], (x, i) => x + i)).toEqual([1, 3, 5]);
  });

  it('应分块', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('空数组分块应返回空', () => {
    expect(chunk([], 3)).toHaveLength(0);
  });

  it('分块大小为1应返回单元素数组', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('应按函数分组', () => {
    const items = ['apple', 'avocado', 'banana', 'blueberry'];
    const grouped = groupBy(items, s => s[0]!);
    expect(grouped['a']).toEqual(['apple', 'avocado']);
    expect(grouped['b']).toEqual(['banana', 'blueberry']);
  });

  it('应去重', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('空数组去重应返回空', () => {
    expect(unique([])).toHaveLength(0);
  });

  it('应计算交集', () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it('应计算差集', () => {
    expect(difference([1, 2, 3], [2, 3, 4])).toEqual([1]);
  });

  it('无交集应返回空', () => {
    expect(intersection([1, 2], [3, 4])).toHaveLength(0);
  });

  it('应zip两个数组', () => {
    expect(zip([1, 2, 3], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]);
  });

  it('空zip应返回空', () => {
    expect(zip([], [1, 2])).toHaveLength(0);
  });

  it('大量数据分批应正确', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const batches = batch(items, x => x, 100);
    expect(batches).toHaveLength(10);
    expect(batches[0]).toHaveLength(100);
  });

  it('大量数据分组应正确', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ cat: `cat${i % 10}`, val: i }));
    const grouped = groupBy(items, item => item.cat);
    expect(Object.keys(grouped)).toHaveLength(10);
    expect(grouped['cat0']).toHaveLength(100);
  });
});

// 缓存策略引擎
describe('缓存策略引擎', () => {
  class LRUCache<K, V> {
    private capacity: number;
    private map = new Map<K, V>();
    constructor(capacity: number) { this.capacity = capacity; }
    get(key: K): V | undefined {
      if (!this.map.has(key)) return undefined;
      const value = this.map.get(key)!;
      this.map.delete(key);
      this.map.set(key, value);
      return value;
    }
    set(key: K, value: V): void {
      if (this.map.has(key)) this.map.delete(key);
      else if (this.map.size >= this.capacity) {
        const first = this.map.keys().next().value!;
        this.map.delete(first);
      }
      this.map.set(key, value);
    }
    has(key: K): boolean { return this.map.has(key); }
    size(): number { return this.map.size; }
    clear(): void { this.map.clear(); }
    keys(): K[] { return [...this.map.keys()]; }
  }

  class FIFOCache<K, V> {
    private capacity: number;
    private map = new Map<K, V>();
    constructor(capacity: number) { this.capacity = capacity; }
    set(key: K, value: V): void {
      if (!this.map.has(key) && this.map.size >= this.capacity) {
        const first = this.map.keys().next().value!;
        this.map.delete(first);
      }
      this.map.set(key, value);
    }
    get(key: K): V | undefined { return this.map.get(key); }
    size(): number { return this.map.size; }
  }

  it('LRU应淘汰最久未用', () => {
    const cache = new LRUCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });

  it('LRU get应刷新使用时间', () => {
    const cache = new LRUCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('LRU应返回值', () => {
    const cache = new LRUCache<string, number>(10);
    cache.set('x', 42);
    expect(cache.get('x')).toBe(42);
  });

  it('LRU不存在应返回undefined', () => {
    const cache = new LRUCache<string, number>(10);
    expect(cache.get('y')).toBeUndefined();
  });

  it('LRU应限制容量', () => {
    const cache = new LRUCache<number, number>(3);
    for (let i = 0; i < 10; i++) cache.set(i, i);
    expect(cache.size()).toBe(3);
  });

  it('LRU clear应清空', () => {
    const cache = new LRUCache<string, number>(10);
    cache.set('a', 1);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('LRU keys应返回所有key', () => {
    const cache = new LRUCache<string, number>(10);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.keys()).toEqual(['a', 'b']);
  });

  it('FIFO应淘汰最早的', () => {
    const cache = new FIFOCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('FIFO覆盖不应增加大小', () => {
    const cache = new FIFOCache<string, number>(2);
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.size()).toBe(1);
    expect(cache.get('a')).toBe(2);
  });

  it('LRU大量操作应正确', () => {
    const cache = new LRUCache<number, number>(100);
    for (let i = 0; i < 1000; i++) cache.set(i, i);
    expect(cache.size()).toBe(100);
    for (let i = 900; i < 1000; i++) {
      expect(cache.get(i)).toBe(i);
    }
  });

  it('容量为1的LRU应正常工作', () => {
    const cache = new LRUCache<string, number>(1);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe(2);
  });
});

// 日志与监控引擎
describe('日志与监控引擎', () => {
  interface LogEntry { level: 'debug' | 'info' | 'warn' | 'error'; message: string; timestamp: number; context?: Record<string, unknown> }

  function filterByLevel(logs: LogEntry[], minLevel: string): LogEntry[] {
    const levels = ['debug', 'info', 'warn', 'error'];
    const minIdx = levels.indexOf(minLevel);
    return logs.filter(l => levels.indexOf(l.level) >= minIdx);
  }

  function countByLevel(logs: LogEntry[]): Record<string, number> {
    const counts: Record<string, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const l of logs) counts[l.level]++;
    return counts;
  }

  function searchLogs(logs: LogEntry[], query: string): LogEntry[] {
    const q = query.toLowerCase();
    return logs.filter(l => l.message.toLowerCase().includes(q));
  }

  function errorRate(logs: LogEntry[]): number {
    if (logs.length === 0) return 0;
    return logs.filter(l => l.level === 'error').length / logs.length;
  }

  function recentLogs(logs: LogEntry[], since: number): LogEntry[] {
    return logs.filter(l => l.timestamp >= since);
  }

  function mergeLogs(logSets: LogEntry[][]): LogEntry[] {
    return logSets.flat().sort((a, b) => a.timestamp - b.timestamp);
  }

  it('应按级别过滤', () => {
    const logs: LogEntry[] = [
      { level: 'debug', message: 'd', timestamp: 1 },
      { level: 'info', message: 'i', timestamp: 2 },
      { level: 'error', message: 'e', timestamp: 3 },
    ];
    expect(filterByLevel(logs, 'warn')).toHaveLength(1);
    expect(filterByLevel(logs, 'debug')).toHaveLength(3);
  });

  it('应统计各级别数量', () => {
    const logs: LogEntry[] = [
      { level: 'info', message: '', timestamp: 1 },
      { level: 'error', message: '', timestamp: 2 },
      { level: 'error', message: '', timestamp: 3 },
    ];
    const counts = countByLevel(logs);
    expect(counts['error']).toBe(2);
    expect(counts['info']).toBe(1);
  });

  it('应搜索日志', () => {
    const logs: LogEntry[] = [
      { level: 'info', message: 'User login', timestamp: 1 },
      { level: 'error', message: 'Database connection failed', timestamp: 2 },
    ];
    expect(searchLogs(logs, 'database')).toHaveLength(1);
  });

  it('应计算错误率', () => {
    const logs: LogEntry[] = [
      { level: 'info', message: '', timestamp: 1 },
      { level: 'error', message: '', timestamp: 2 },
      { level: 'error', message: '', timestamp: 3 },
      { level: 'info', message: '', timestamp: 4 },
    ];
    expect(errorRate(logs)).toBe(0.5);
  });

  it('空日志错误率应为0', () => {
    expect(errorRate([])).toBe(0);
  });

  it('应过滤最近日志', () => {
    const logs: LogEntry[] = [
      { level: 'info', message: '', timestamp: 1 },
      { level: 'info', message: '', timestamp: 5 },
      { level: 'info', message: '', timestamp: 10 },
    ];
    expect(recentLogs(logs, 5)).toHaveLength(2);
  });

  it('应合并排序日志', () => {
    const set1: LogEntry[] = [{ level: 'info', message: 'a', timestamp: 3 }];
    const set2: LogEntry[] = [{ level: 'info', message: 'b', timestamp: 1 }];
    const merged = mergeLogs([set1, set2]);
    expect(merged[0]!.timestamp).toBe(1);
  });

  it('大量日志处理应正确', () => {
    const logs: LogEntry[] = Array.from({ length: 1000 }, (_, i) => ({
      level: (['debug', 'info', 'warn', 'error'] as const)[i % 4],
      message: `msg ${i}`,
      timestamp: i,
    }));
    expect(countByLevel(logs)['error']).toBe(250);
    expect(filterByLevel(logs, 'error')).toHaveLength(250);
  });
});
