/**
 * 影子测试迁移（批次 31b）
 *
 * 迁移前：本文件只 import vitest，URL/深拷贝/数组/对象/防抖节流 11 个工具全部自抄；迁移后：能在生产找到同契约实现的
 * 符号一律 import 真源，生产没有对应导出的 helper 保留本地并逐条注明「未迁移：生产无对应导出」。
 * 用例数：30 → 32（原有 describe/it 名称与断言全部保留并按生产口径订正，另新增 2 条防抖/节流契约用例，只增不减）。
 *
 * 已绑定生产实现：
 * - debounce → frontend/src/utils/debounceThrottle.ts:6（默认 leading=false / trailing=true :11；返回 T & { cancel, flush, pending }，
 *   cancel :111-123、flush :125-132、pending :134-136）
 * - throttle → frontend/src/utils/debounceThrottle.ts:141（委托 debounce，leading 默认 true、trailing 默认 true、maxWait=interval :146-150）
 *   （utils/index.ts:17 也再导出这两个符号；debounceThrottle-typed.ts 与 requestUtils-typed.ts 是 typed 副本，非真源）
 * - groupBy → frontend/src/utils/dataFlowEngine.ts:62 pipeline().groupBy(keyFn)（返回 Map<K, T[]> :62-70，保留插入顺序）
 * - unique → frontend/src/utils/dataFlowEngine.ts:52 pipeline().distinct(keyFn)（Set 去重，保留首次出现 :52-60；不传 keyFn 时按元素本身）
 * - chunk → backend/src/services/batchOperations.ts:121 chunk(arr, size)（i += size + slice :122-126，与旧实现同契约）
 * 跨包 import 先例：backend/src/__tests__/dataPipelineEngine.test.ts:55、frontend/src/__tests__/chartDataProcessingDeep.test.ts:51-58。
 *
 * 旧断言/口径订正（旧值 → 生产值 + 依据行号）：
 * - 分组返回结构：旧 groupBy 返回 Record<string, T[]>（grouped.A）→ 生产 groupBy 返回 Map<K, T[]>（dataFlowEngine.ts:62-70），
 *   断言改为 grouped.get('A') 并补 Map 实例与 size 校验。
 * - 去重/分块：旧本地 Set / for-slice 实现 → 生产 pipeline().distinct（dataFlowEngine.ts:52-60）与 batchOperations.chunk
 *   （batchOperations.ts:121-127），语义一致，仅改为调用生产导出。
 * - 防抖：旧实现只返回 { cancel }、只支持 trailing → 生产默认 trailing 并额外提供 flush/pending（debounceThrottle.ts:6-11、:125-136），
 *   旧 cancel 用例断言值与生产一致（cancel 清 timer :111-123）。
 * - 节流：旧实现手写当前时间戳、仅 leading → 生产 throttle 委托 debounce（leading+trailing，maxWait=interval，
 *   debounceThrottle.ts:141-150）；旧「三连调只执行一次」在同步调用下仍成立（leading 立即执行），但间隔结束会补发 trailing 调用，
 *   新增用例钉住该契约。
 * - 时间确定性：旧用例用真实 setTimeout + await 20ms（依赖真实时钟）→ 现改用 vi.useFakeTimers() + advanceTimersByTime，
 *   测试代码内不出现随机数 / 当前时间戳 / 无参 Date 构造。
 *
 * 未迁移（生产无对应导出，保留本地 helper，断言值与旧文件保持一致）：
 * - parseUrlParams / buildUrlParams：全仓 frontend/src、backend/src、shared 非测试源码均无同名或同契约 URL 查询串解析/构建导出。
 * - deepClone / deepEqual：全仓无递归深拷贝 / 深比较导出（rg deepClone|deepEqual 仅命中测试）。
 * - flatten：仅 frontend/src/components/Layout/ResponsiveMenu.tsx:20 flattenMenu（菜单树扁平化，契约不同），无泛型数组扁平化导出。
 * - omit / pick：仅 frontend/src/utils/hkConnectDemo.ts 内私有 pick（数组取前 N 项）与 frontend/src/services/reviewSnapshot.ts:473
 *   pickCurrentPrice（取当前价），契约不同且未导出。
 *
 * 新增用例（30 → 32）：
 * - 节流与防抖 › 节流在间隔结束补发 trailing 调用（debounceThrottle.ts:141-150）
 * - 节流与防抖 › 防抖 flush 立即执行且 pending 反映等待状态（debounceThrottle.ts:125-136）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle } from '../utils/debounceThrottle';
import { pipeline } from '../utils/dataFlowEngine';
import { chunk } from '../../../backend/src/services/batchOperations';

// 未迁移：生产无对应导出（全仓无 URL 查询串解析导出），保留旧实现供 URL 参数用例使用。
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

// 未迁移：生产无对应导出（全仓无 URL 查询串构建导出），保留旧实现供 URL 参数用例使用。
function buildUrlParams(base: string, params: Record<string, string | undefined>): string {
  const validParams = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][];
  if (validParams.length === 0) return base;
  const query = validParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${base}?${query}`;
}

// 未迁移：生产无对应导出（全仓无递归深拷贝导出），保留旧实现供深拷贝用例使用。
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T;
  const clone: any = {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepClone((obj as any)[key]);
  }
  return clone;
}

// 未迁移：生产无对应导出（全仓无深比较导出），保留旧实现供深比较用例使用。
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

// 未迁移：生产无对应导出（仅 flattenMenu 等不同契约实现），保留旧实现供扁平化用例使用。
function flatten(arr: any[]): any[] {
  return arr.reduce((flat, item) => {
    return flat.concat(Array.isArray(item) ? flatten(item) : item);
  }, []);
}

// 未迁移：生产无对应导出（仅私有 pickCurrentPrice 等不同契约实现），保留旧实现供对象工具用例使用。
function omit<T extends Record<string, any>>(obj: T, keys: string[]): Partial<T> {
  const result = { ...obj };
  keys.forEach(k => delete result[k]);
  return result;
}

// 未迁移：生产无对应导出（仅私有 pick 取数组前 N 项，契约不同），保留旧实现供对象工具用例使用。
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
      const grouped = pipeline(data).groupBy(item => String(item.type));
      expect(grouped).toBeInstanceOf(Map);
      expect(grouped.size).toBe(2);
      expect(grouped.get('A')).toHaveLength(2);
      expect(grouped.get('B')).toHaveLength(1);
    });

    it('去重（基本）', () => {
      expect(pipeline([1, 2, 2, 3, 3, 3]).distinct().toArray()).toEqual([1, 2, 3]);
    });

    it('去重（自定义key）', () => {
      const data = [{ id: 1, name: 'a' }, { id: 1, name: 'b' }, { id: 2, name: 'c' }];
      const result = pipeline(data).distinct(item => item.id).toArray();
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
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('节流限制频率', () => {
      let count = 0;
      const fn = throttle(() => count++, 100);
      fn(); fn(); fn();
      expect(count).toBe(1);
    });

    it('节流在间隔结束补发 trailing 调用', () => {
      let count = 0;
      const fn = throttle(() => count++, 100);
      fn(); fn();
      expect(count).toBe(1);
      vi.advanceTimersByTime(100);
      expect(count).toBe(2);
    });

    it('防抖只执行最后一次', () => {
      let last = '';
      const fn = debounce((v: string) => { last = v; }, 10);
      fn('a');
      fn('b');
      fn('c');
      vi.advanceTimersByTime(10);
      expect(last).toBe('c');
    });

    it('防抖cancel', () => {
      let called = false;
      const fn = debounce(() => { called = true; }, 10);
      fn();
      fn.cancel();
      vi.advanceTimersByTime(20);
      expect(called).toBe(false);
    });

    it('防抖 flush 立即执行且 pending 反映等待状态', () => {
      let last = '';
      const fn = debounce((v: string) => { last = v; }, 10);
      fn('a');
      expect(fn.pending()).toBe(true);
      fn.flush();
      expect(last).toBe('a');
      expect(fn.pending()).toBe(false);
    });
  });
});
