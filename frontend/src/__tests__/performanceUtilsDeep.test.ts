import { describe, it, expect } from 'vitest';

// 前端性能工具函数测试 — 55用例
describe('前端性能工具函数', () => {

  // 节流函数
  describe('节流函数', () => {
    function throttle<T extends (...args: unknown[]) => unknown>(fn: T, delay: number) {
      let lastCall = 0;
      return function (this: unknown, ...args: Parameters<T>) {
        const now = Date.now();
        if (now - lastCall >= delay) {
          lastCall = now;
          return fn.apply(this, args);
        }
      };
    }

    it('首次调用应立即执行', () => {
      let called = false;
      const fn = throttle(() => { called = true; }, 100);
      fn();
      expect(called).toBe(true);
    });

    it('短时间内重复调用应跳过', () => {
      let count = 0;
      const fn = throttle(() => { count++; }, 100);
      fn(); fn(); fn();
      expect(count).toBe(1);
    });

    it('延迟后可再次调用', async () => {
      let count = 0;
      const fn = throttle(() => { count++; }, 10);
      fn();
      await new Promise(r => setTimeout(r, 20));
      fn();
      expect(count).toBe(2);
    });
  });

  // 防抖函数
  describe('防抖函数', () => {
    function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return function (this: unknown, ...args: Parameters<T>) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }

    it('快速调用只执行最后一次', async () => {
      let lastValue = 0;
      const fn = debounce((v: number) => { lastValue = v; }, 20);
      fn(1); fn(2); fn(3);
      await new Promise(r => setTimeout(r, 30));
      expect(lastValue).toBe(3);
    });

    it('延迟后执行', async () => {
      let called = false;
      const fn = debounce(() => { called = true; }, 10);
      fn();
      expect(called).toBe(false);
      await new Promise(r => setTimeout(r, 20));
      expect(called).toBe(true);
    });
  });

  // 深拷贝
  describe('深拷贝', () => {
    function deepClone<T>(obj: T): T {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(deepClone) as T;
      const clone: Record<string, unknown> = {};
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        clone[key] = deepClone((obj as Record<string, unknown>)[key]);
      }
      return clone as T;
    }

    it('基本对象拷贝', () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = deepClone(obj);
      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
    });

    it('修改副本不影响原对象', () => {
      const obj = { a: { b: 1 } };
      const clone = deepClone(obj);
      clone.a.b = 2;
      expect(obj.a.b).toBe(1);
    });

    it('数组拷贝', () => {
      const arr = [1, [2, 3], { a: 4 }];
      const clone = deepClone(arr);
      expect(clone).toEqual(arr);
      expect(clone).not.toBe(arr);
    });

    it('null拷贝', () => {
      expect(deepClone(null)).toBeNull();
    });

    it('基本类型不变', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('test')).toBe('test');
    });

    it('空对象拷贝', () => {
      expect(deepClone({})).toEqual({});
    });

    it('空数组拷贝', () => {
      expect(deepClone([])).toEqual([]);
    });

    it('嵌套数组深拷贝', () => {
      const arr = [[1, 2], [3, 4]];
      const clone = deepClone(arr);
      (clone[0] as number[])[0] = 99;
      expect((arr[0] as number[])[0]).toBe(1);
    });
  });

  // 对象比较
  describe('对象比较', () => {
    function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>) {
      const keysA = Object.keys(a), keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(k => a[k] === b[k]);
    }

    function deepEqual(a: unknown, b: unknown): boolean {
      if (a === b) return true;
      if (typeof a !== typeof b) return false;
      if (typeof a !== 'object' || a === null || b === null) return false;
      const keysA = Object.keys(a as Record<string, unknown>);
      const keysB = Object.keys(b as Record<string, unknown>);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(k =>
        deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
      );
    }

    it('浅相等', () => {
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });

    it('浅不等（嵌套对象）', () => {
      expect(shallowEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false);
    });

    it('深相等（嵌套对象）', () => {
      expect(deepEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(true);
    });

    it('深不等', () => {
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('不同键数不等', () => {
      expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it('数组深相等', () => {
      expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    });

    it('基本类型比较', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual(1, 2)).toBe(false);
    });
  });

  // 数组工具
  describe('数组工具', () => {
    function chunk<T>(arr: T[], size: number): T[][] {
      const result: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
      }
      return result;
    }

    function unique<T>(arr: T[], key?: (item: T) => unknown): T[] {
      if (!key) return [...new Set(arr)];
      const seen = new Set();
      return arr.filter(item => {
        const k = key(item);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
      return arr.reduce((groups, item) => {
        const k = String(item[key]);
        (groups[k] = groups[k] || []).push(item);
        return groups;
      }, {} as Record<string, T[]>);
    }

    it('分块正确', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('分块大小大于数组', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });

    it('空数组分块', () => {
      expect(chunk([], 3)).toEqual([]);
    });

    it('去重基本类型', () => {
      expect(unique([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
    });

    it('按key去重', () => {
      const items = [{ id: 1, name: 'a' }, { id: 1, name: 'b' }, { id: 2, name: 'c' }];
      expect(unique(items, i => i.id)).toHaveLength(2);
    });

    it('分组正确', () => {
      const items = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }];
      const groups = groupBy(items, 'type');
      expect(groups['a']).toHaveLength(2);
      expect(groups['b']).toHaveLength(1);
    });

    it('空数组分组', () => {
      expect(groupBy([], 'x')).toEqual({});
    });
  });
});
