/**
 * React 渲染优化工具测试
 */

import { describe, it, expect, vi } from 'vitest';

// ---- 纯函数工具测试 ----

// 虚拟列表计算
interface VirtualListOptions {
  itemHeight: number;
  overscan?: number;
  containerHeight: number;
}

function calculateVisibleRange(
  scrollTop: number,
  totalItems: number,
  options: VirtualListOptions
): { start: number; end: number; offsetY: number } {
  const { itemHeight, overscan = 3, containerHeight } = options;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(totalItems, start + visibleCount + overscan * 2);
  return { start, end, offsetY: start * itemHeight };
}

describe('calculateVisibleRange', () => {
  const options: VirtualListOptions = {
    itemHeight: 40,
    containerHeight: 400,
    overscan: 3,
  };

  it('初始滚动位置正确计算', () => {
    const result = calculateVisibleRange(0, 100, options);
    expect(result.start).toBe(0);
    expect(result.end).toBeGreaterThanOrEqual(10);
    expect(result.offsetY).toBe(0);
  });

  it('滚动后正确计算可视区域', () => {
    const result = calculateVisibleRange(400, 100, options);
    // scrollTop=400, itemHeight=40, start = max(0, 10 - 3) = 7
    expect(result.start).toBe(7);
    expect(result.offsetY).toBe(280); // 7 * 40
  });

  it('end不超过总数量', () => {
    const result = calculateVisibleRange(0, 5, options);
    expect(result.end).toBeLessThanOrEqual(5);
  });

  it('start不小于0', () => {
    const result = calculateVisibleRange(0, 100, options);
    expect(result.start).toBeGreaterThanOrEqual(0);
  });

  it('自定义overscan', () => {
    const result = calculateVisibleRange(0, 100, { ...options, overscan: 0 });
    expect(result.start).toBe(0);
  });

  it('大数据量性能测试', () => {
    const start = Date.now();
    for (let i = 0; i < 10000; i++) {
      calculateVisibleRange(i * 40, 100000, options);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('offsetY等于start乘以itemHeight', () => {
    const result = calculateVisibleRange(800, 100, options);
    expect(result.offsetY).toBe(result.start * options.itemHeight);
  });
});

// ---- 稳定化引用工具测试 ----
function stableEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

describe('stableEqual (引用稳定性)', () => {
  it('相同内容的对象视为相等', () => {
    expect(stableEqual({ a: 1 }, { a: 1 })).toBe(true);
  });

  it('不同内容的对象视为不等', () => {
    expect(stableEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('相同内容的数组视为相等', () => {
    expect(stableEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('嵌套对象正确比较', () => {
    expect(stableEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
  });

  it('null和undefined不同', () => {
    expect(stableEqual(null, undefined)).toBe(false);
  });

  it('空对象和空对象相等', () => {
    expect(stableEqual({}, {})).toBe(true);
  });
});

// ---- 防抖工具测试 ----
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

describe('debounce', () => {
  it('延迟执行', async () => {
    let count = 0;
    const fn = debounce(() => { count++; }, 50);
    fn();
    expect(count).toBe(0);
    await new Promise(r => setTimeout(r, 100));
    expect(count).toBe(1);
  });

  it('多次调用只执行最后一次', async () => {
    let lastValue = 0;
    const fn = debounce((v: number) => { lastValue = v; }, 50);
    fn(1);
    fn(2);
    fn(3);
    await new Promise(r => setTimeout(r, 100));
    expect(lastValue).toBe(3);
  });

  it('重新触发计时器', async () => {
    let count = 0;
    const fn = debounce(() => { count++; }, 100);
    fn();
    await new Promise(r => setTimeout(r, 50));
    fn(); // 重新触发
    await new Promise(r => setTimeout(r, 50));
    expect(count).toBe(0); // 还没到时间
    await new Promise(r => setTimeout(r, 80));
    expect(count).toBe(1);
  });
});

// ---- 节流工具测试 ----
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastCall = now;
      fn(...args);
    }
  };
}

describe('throttle', () => {
  it('立即执行第一次调用', () => {
    let count = 0;
    const fn = throttle(() => { count++; }, 100);
    fn();
    expect(count).toBe(1);
  });

  it('间隔内调用被忽略', () => {
    let count = 0;
    const fn = throttle(() => { count++; }, 100);
    fn();
    fn();
    fn();
    expect(count).toBe(1);
  });

  it('间隔后允许再次调用 async', async () => {
    let count = 0;
    const fn = throttle(() => { count++; }, 50);
    fn();
    expect(count).toBe(1);
    await new Promise(r => setTimeout(r, 80));
    fn();
    expect(count).toBe(2);
  });
});

// ---- 深拷贝工具测试 ----
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

describe('deepClone', () => {
  it('简单对象深拷贝', () => {
    const original = { a: 1, b: 'hello' };
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('嵌套对象深拷贝', () => {
    const original = { a: { b: { c: 1 } } };
    const cloned = deepClone(original);
    expect(cloned.a.b.c).toBe(1);
    expect(cloned.a).not.toBe(original.a);
  });

  it('数组深拷贝', () => {
    const original = [1, [2, 3], { a: 4 }];
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned[1]).not.toBe(original[1]);
  });

  it('修改拷贝不影响原对象', () => {
    const original = { a: 1 };
    const cloned = deepClone(original);
    cloned.a = 2;
    expect(original.a).toBe(1);
  });

  it('null正确拷贝', () => {
    expect(deepClone(null)).toBe(null);
  });
});

// ---- 分组工具测试 ----
function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

describe('groupBy', () => {
  it('按属性分组', () => {
    const items = [
      { type: 'A', value: 1 },
      { type: 'B', value: 2 },
      { type: 'A', value: 3 },
    ];
    const result = groupBy(items, item => item.type);
    expect(result['A'].length).toBe(2);
    expect(result['B'].length).toBe(1);
  });

  it('空数组返回空对象', () => {
    const result = groupBy([], () => 'key');
    expect(result).toEqual({});
  });

  it('每个元素只在一个分组中', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = groupBy(items, () => 'all');
    expect(result['all'].length).toBe(2);
  });
});

// ---- 排序工具测试 ----
function sortBy<T>(items: T[], keyFn: (item: T) => number, desc = false): T[] {
  return [...items].sort((a, b) => {
    const va = keyFn(a);
    const vb = keyFn(b);
    return desc ? vb - va : va - vb;
  });
}

describe('sortBy', () => {
  it('升序排序', () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const result = sortBy(items, i => i.v);
    expect(result.map(i => i.v)).toEqual([1, 2, 3]);
  });

  it('降序排序', () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const result = sortBy(items, i => i.v, true);
    expect(result.map(i => i.v)).toEqual([3, 2, 1]);
  });

  it('不修改原数组', () => {
    const items = [{ v: 2 }, { v: 1 }];
    sortBy(items, i => i.v);
    expect(items[0].v).toBe(2);
  });

  it('空数组返回空数组', () => {
    expect(sortBy([], () => 0)).toEqual([]);
  });

  it('单元素数组不变', () => {
    const items = [{ v: 1 }];
    expect(sortBy(items, i => i.v)).toEqual([{ v: 1 }]);
  });
});

// ---- 分块工具测试 ----
function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

describe('chunk', () => {
  it('正确分块', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('空数组返回空数组', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('size大于数组长度返回一个块', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('size等于数组长度返回一个块', () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('size=1每个元素独立', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('性能: 10000元素分块 < 100ms', () => {
    const items = Array.from({ length: 10000 }, (_, i) => i);
    const start = Date.now();
    chunk(items, 100);
    expect(Date.now() - start).toBeLessThan(100);
  });
});

// ---- 去重工具测试 ----
function uniqueBy<T>(items: T[], keyFn: (item: T) => any): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = JSON.stringify(keyFn(item));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

describe('uniqueBy', () => {
  it('按属性去重', () => {
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 1, name: 'C' },
    ];
    const result = uniqueBy(items, i => i.id);
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('A');
  });

  it('无重复项保持原样', () => {
    const items = [{ id: 1 }, { id: 2 }];
    expect(uniqueBy(items, i => i.id).length).toBe(2);
  });

  it('空数组返回空数组', () => {
    expect(uniqueBy([], () => 0)).toEqual([]);
  });

  it('全部重复只保留第一个', () => {
    const items = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }, { id: 1, v: 'c' }];
    const result = uniqueBy(items, i => i.id);
    expect(result.length).toBe(1);
    expect(result[0].v).toBe('a');
  });
});

// ---- 安全访问工具测试 ----
function safeGet<T>(obj: any, path: string, defaultValue?: T): T | undefined {
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    result = result?.[key];
    if (result === undefined) return defaultValue;
  }
  return result as T;
}

describe('safeGet', () => {
  it('获取嵌套属性', () => {
    expect(safeGet({ a: { b: 1 } }, 'a.b')).toBe(1);
  });

  it('不存在的路径返回默认值', () => {
    expect(safeGet({}, 'a.b', 42)).toBe(42);
  });

  it('中间层为null返回默认值', () => {
    expect(safeGet({ a: null }, 'a.b', 'default')).toBe('default');
  });

  it('顶层属性', () => {
    expect(safeGet({ x: 10 }, 'x')).toBe(10);
  });

  it('undefined对象返回默认值', () => {
    expect(safeGet(undefined, 'a.b', 0)).toBe(0);
  });

  it('值为0时不返回默认值', () => {
    expect(safeGet({ a: 0 }, 'a', 99)).toBe(0);
  });

  it('值为空字符串时不返回默认值', () => {
    expect(safeGet({ a: '' }, 'a', 'default')).toBe('');
  });

  it('深度嵌套路径', () => {
    const obj = { a: { b: { c: { d: 'deep' } } } };
    expect(safeGet(obj, 'a.b.c.d')).toBe('deep');
  });
});
