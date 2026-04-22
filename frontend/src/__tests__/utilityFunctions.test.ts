import { describe, it, expect } from 'vitest';

// 事件去重
function deduplicateEvents<T extends { id: string; timestamp: number }>(events: T[]): T[] {
  const seen = new Map<string, T>();
  for (const event of events) {
    const existing = seen.get(event.id);
    if (!existing || event.timestamp > existing.timestamp) {
      seen.set(event.id, event);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.timestamp - a.timestamp);
}

// 批量去重
function deduplicateByField<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

describe('事件去重', () => {
  it('相同ID保留最新', () => {
    const events = [
      { id: '1', timestamp: 100, data: 'old' },
      { id: '1', timestamp: 200, data: 'new' }
    ];
    const result = deduplicateEvents(events as any);
    expect(result).toHaveLength(1);
    expect((result[0] as any).data).toBe('new');
  });

  it('不同ID都保留', () => {
    const events = [
      { id: '1', timestamp: 100 },
      { id: '2', timestamp: 200 }
    ];
    expect(deduplicateEvents(events as any)).toHaveLength(2);
  });

  it('空数组返回空', () => {
    expect(deduplicateEvents([])).toHaveLength(0);
  });

  it('结果按时间倒序', () => {
    const events = [
      { id: '1', timestamp: 300 },
      { id: '2', timestamp: 100 },
      { id: '3', timestamp: 200 }
    ];
    const result = deduplicateEvents(events as any);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].timestamp).toBeGreaterThanOrEqual(result[i].timestamp);
    }
  });

  it('按字段去重', () => {
    const items = [
      { code: '600519', name: '茅台' },
      { code: '600519', name: '茅台酒' },
      { code: '000001', name: '平安' }
    ];
    const result = deduplicateByField(items, i => i.code);
    expect(result).toHaveLength(2);
  });

  it('保留首次出现', () => {
    const items = [
      { code: 'A', val: 1 },
      { code: 'A', val: 2 },
      { code: 'A', val: 3 }
    ];
    const result = deduplicateByField(items, i => i.code);
    expect(result).toHaveLength(1);
    expect(result[0].val).toBe(1);
  });

  it('无重复保留全部', () => {
    const items = [{ code: 'A' }, { code: 'B' }, { code: 'C' }];
    expect(deduplicateByField(items, i => i.code)).toHaveLength(3);
  });
});

// 数据分组
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

describe('数据分组', () => {
  it('按字段分组', () => {
    const items = [
      { sector: 'tech', name: 'A' },
      { sector: 'finance', name: 'B' },
      { sector: 'tech', name: 'C' }
    ];
    const groups = groupBy(items, i => i.sector);
    expect(groups.get('tech')).toHaveLength(2);
    expect(groups.get('finance')).toHaveLength(1);
  });

  it('空数组返回空Map', () => {
    const groups = groupBy([], (i: any) => i.key);
    expect(groups.size).toBe(0);
  });

  it('全部同组', () => {
    const items = [{ type: 'A' }, { type: 'A' }, { type: 'A' }];
    const groups = groupBy(items, i => i.type);
    expect(groups.size).toBe(1);
    expect(groups.get('A')).toHaveLength(3);
  });

  it('全部不同组', () => {
    const items = [{ type: 'A' }, { type: 'B' }, { type: 'C' }];
    const groups = groupBy(items, i => i.type);
    expect(groups.size).toBe(3);
  });
});

// 数据聚合
function aggregate<T>(items: T[], valueFn: (item: T) => number): {
  sum: number;
  avg: number;
  min: number;
  max: number;
  count: number;
} {
  if (items.length === 0) return { sum: 0, avg: 0, min: 0, max: 0, count: 0 };
  
  const values = items.map(valueFn);
  const sum = values.reduce((a, b) => a + b, 0);
  
  return {
    sum,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length
  };
}

describe('数据聚合', () => {
  it('基本聚合', () => {
    const items = [{ v: 10 }, { v: 20 }, { v: 30 }];
    const agg = aggregate(items, i => i.v);
    expect(agg.sum).toBe(60);
    expect(agg.avg).toBe(20);
    expect(agg.min).toBe(10);
    expect(agg.max).toBe(30);
    expect(agg.count).toBe(3);
  });

  it('空数组聚合', () => {
    const agg = aggregate([], (i: any) => i.v);
    expect(agg.count).toBe(0);
    expect(agg.sum).toBe(0);
  });

  it('单元素聚合', () => {
    const agg = aggregate([{ v: 42 }], i => i.v);
    expect(agg.avg).toBe(42);
    expect(agg.min).toBe(42);
    expect(agg.max).toBe(42);
  });

  it('负值聚合', () => {
    const items = [{ v: -10 }, { v: -20 }, { v: 30 }];
    const agg = aggregate(items, i => i.v);
    expect(agg.sum).toBe(0);
    expect(agg.min).toBe(-20);
    expect(agg.max).toBe(30);
  });
});

// 数组工具
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter(item => setB.has(item));
}

function diff<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter(item => !setB.has(item));
}

function flatten<T>(arr: (T | T[])[]): T[] {
  return arr.flat() as T[];
}

describe('数组工具函数', () => {
  it('分块', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('分块大小大于数组', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('空数组分块', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('去重', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('字符串去重', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('交集', () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it('无交集', () => {
    expect(intersection([1, 2], [3, 4])).toEqual([]);
  });

  it('差集', () => {
    expect(diff([1, 2, 3], [2, 3, 4])).toEqual([1]);
  });

  it('扁平化', () => {
    expect(flatten([1, [2, 3], [4, 5]])).toEqual([1, 2, 3, 4, 5]);
  });
});

// 深度克隆与比较
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone) as T;
  
  const clone: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return clone as T;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  
  return aKeys.every(key =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  );
}

describe('深克隆与深比较', () => {
  it('克隆基本类型', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(null)).toBe(null);
  });

  it('克隆对象', () => {
    const obj = { a: 1, b: { c: 2 } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.b).not.toBe(obj.b);
  });

  it('克隆数组', () => {
    const arr = [1, [2, 3], { a: 4 }];
    const clone = deepClone(arr);
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
  });

  it('基本相等', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
  });

  it('对象相等', () => {
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('数组相等', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('嵌套对象比较', () => {
    const a = { x: { y: { z: 1 } } };
    const b = { x: { y: { z: 1 } } };
    expect(deepEqual(a, b)).toBe(true);
  });

  it('null处理', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({}, null)).toBe(false);
  });
});

// 节流防抖逻辑
function throttle<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return fn(...args);
    }
    return undefined;
  }) as T;
}

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
    return undefined;
  }) as T;
}

describe('节流防抖', () => {
  it('节流函数定义', () => {
    const fn = throttle(() => { , 100);
    expect(typeof fn).toBe('function');
  });

  it('防抖函数定义', () => {
    const fn = debounce(() => { , 100);
    expect(typeof fn).toBe('function');
  });

  it('节流参数传递', () => {
    let result = 0;
    const fn = throttle((x: number) => { result = x; }, 0);
    fn(42);
    expect(result).toBe(42);
  });

  it('防抖参数传递', () => {
    let result = 0;
    const fn = debounce((x: number) => { result = x; }, 0);
    fn(42);
    expect(result).toBe(0); // 还没执行
  });
});

// 相对时间
function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  if (months < 12) return `${months}个月前`;
  return `${years}年前`;
}

describe('相对时间格式化', () => {
  it('刚刚', () => {
    expect(formatRelativeTime(Date.now() - 10000, Date.now())).toBe('刚刚');
  });

  it('分钟前', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60 * 1000, Date.now())).toBe('5分钟前');
  });

  it('小时前', () => {
    expect(formatRelativeTime(Date.now() - 3 * 60 * 60 * 1000, Date.now())).toBe('3小时前');
  });

  it('天前', () => {
    expect(formatRelativeTime(Date.now() - 5 * 24 * 60 * 60 * 1000, Date.now())).toBe('5天前');
  });

  it('月前', () => {
    expect(formatRelativeTime(Date.now() - 45 * 24 * 60 * 60 * 1000, Date.now())).toBe('1个月前');
  });

  it('年前', () => {
    expect(formatRelativeTime(Date.now() - 400 * 24 * 60 * 60 * 1000, Date.now())).toBe('1年前');
  });

  it('精确边界：60秒', () => {
    expect(formatRelativeTime(Date.now() - 59000, Date.now())).toBe('刚刚');
  });

  it('精确边界：1分钟', () => {
    expect(formatRelativeTime(Date.now() - 60000, Date.now())).toBe('1分钟前');
  });
});
