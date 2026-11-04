/**
 * 影子测试迁移（批次 12）
 *
 * 旧文件在测试内手抄了 DataCache / PrefetchManager / debounce / throttle /
 * deepClone / deepEqual 一整层实现，断言对象是副本而非产品；LRU 淘汰用
 * lastAccess 时间戳 + 真实 sleep(5ms) 制造先后，TTL 用 sleep(60ms) 等待，
 * 慢且依赖真实时钟；ttl=0 被 `ttl || defaultTTL` 吞掉；FIFO 是副本自造的
 * 分支；debounce / throttle 副本没有任何用例（死代码）。现已 import 生产实现。
 *
 * 已绑定生产实现：
 * - ../utils/cacheEngine.ts:55 LRUCache（LRU 缓存）
 * - ../utils/cacheEngine.ts:184 LFUCache（LFU 缓存）
 * - ../utils/cacheEngine.ts:379 createCache（缓存工厂）
 * - ../utils/cacheEngine.ts:492 cleanExpiredStorage（localStorage 过期清理）
 * - ../utils/debounceThrottle.ts:6 debounce
 * - ../utils/debounceThrottle.ts:141 throttle
 * 以上由 ../utils/index.ts:19（debounce/throttle）与 :22（cacheEngine）显式再导出；
 * debounceThrottle-typed.ts 与 requestUtils-typed.ts 不是生产真源。
 *
 * 测试环境说明：本仓库 jsdom 环境下的全局 localStorage 是 Node 的占位对象
 * （探针实测无 setItem/getItem/key/clear），故 cleanExpiredStorage 用例注入
 * Map 实现的 MemoryStorage 桩，被测函数仍是 cacheEngine 的生产实现。
 *
 * 旧断言错在哪（旧副本与生产行为不一致）：
 *
 * | 旧断言 / 旧实现 | 生产输出 | 依据 |
 * | --- | --- | --- |
 * | LRU 用 lastAccess 时间戳，靠 sleep(5ms) 决定先后 | 生产用 Map 插入顺序：get 命中即 delete+set 移到尾部 | cacheEngine.ts:79-81 |
 * | `ttl || defaultTTL`，ttl=0 会被替换成默认 TTL | ttl=0 表示永不过期 | cacheEngine.ts:16、:163-166 |
 * | 过期判断用当前时间 > expiresAt（恰好到期即过期） | 用 now - createdAt > ttl（恰好到期仍有效，+1ms 才过期） | cacheEngine.ts:165 |
 * | 独立 FIFO 策略分支，按 Map 首键淘汰 | createCache('fifo') 落入 default 返回 LRUCache，无独立 FIFO 类 | cacheEngine.ts:379-388 |
 * | 内存缓存 DataCache.clearExpired() 返回清除数 | 生产无 Cache.clearExpired，改绑 localStorage 的 cleanExpiredStorage，返回被清理 key 数 | cacheEngine.ts:492-512 |
 * | debounce 副本只有 cancel，无 leading/trailing/flush/pending；throttle 用 Date.now 差值且无 trailing | 生产 debounce 支持 leading/trailing/maxWait + cancel/flush/pending；throttle = debounce + maxWait | debounceThrottle.ts:6-139、:141-151 |
 * | deepClone 夹具用无参 Date 构造（现取时间） | 固定时间戳夹具，断言 getTime() | 铁律 2（禁用无参构造） |
 *
 * 未迁移——生产无同契约实现（保留本地 helper）：
 * - PrefetchManager：生产 ../utils/dataPrefetch.ts:39 DataPrefetchManager 的
 *   enqueue(key, loader, priority=0) 返回 void 并异步自动加载，没有 URL 正则规则、
 *   同步 dequeue、布尔入队结果与可观察队列，契约不同；useHoverPrefetch /
 *   useViewportPrefetch / useIdlePrefetch（:179/:207/:240）是 React Hook。
 * - deepClone / deepEqual：全仓无通用深拷贝/深比较导出，故保留本地 helper。
 *
 * 发现的生产缺口（只报告不修）：
 * - createCache('fifo') 静默降级为 LRU，但 CacheStrategy 声明了 'fifo'
 *   （cacheEngine.ts:8、:379-388），按 FIFO 配置的调用方实际拿到 LRU 语义。
 * - TTLCache.has 直接 cache.has，不做过期检查（cacheEngine.ts:356）；仅靠
 *   setTimeout 删除，定时器未触发时可能读到过期条目。本文件未锁定该行为。
 * - LRU/LFU 的过期判断用 `>`，与旧副本 `>` 相同；但旧副本把 ttl=0 当成
 *   「用默认 TTL」，两套口径同时存在时容易误判。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LFUCache,
  LRUCache,
  cacheToStorage,
  cleanExpiredStorage,
  createCache,
  readFromStorage,
} from '../utils/cacheEngine';
import { debounce, throttle } from '../utils/debounceThrottle';

// ==================== 未迁移：生产无同契约实现，保留本地 helper ====================

interface PrefetchRule {
  pattern: RegExp;
  priority: number;
  ttl: number;
  prefetchOnHover: boolean;
  prefetchOnVisible: boolean;
}

class PrefetchManager {
  private rules: PrefetchRule[] = [];
  private prefetchQueue: { url: string; priority: number }[] = [];
  private prefetched: Set<string> = new Set();
  private maxConcurrent: number;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  addRule(rule: PrefetchRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  shouldPrefetch(url: string): PrefetchRule | null {
    for (const rule of this.rules) {
      if (rule.pattern.test(url)) return rule;
    }
    return null;
  }

  enqueue(url: string): boolean {
    if (this.prefetched.has(url)) return false;
    const rule = this.shouldPrefetch(url);
    if (!rule) return false;
    this.prefetchQueue.push({ url, priority: rule.priority });
    this.prefetchQueue.sort((a, b) => b.priority - a.priority);
    return true;
  }

  dequeue(): string | null {
    const item = this.prefetchQueue.shift();
    if (!item) return null;
    this.prefetched.add(item.url);
    return item.url;
  }

  isPrefetched(url: string): boolean {
    return this.prefetched.has(url);
  }

  getQueueSize(): number {
    return this.prefetchQueue.length;
  }

  clear(): void {
    this.prefetchQueue = [];
    this.prefetched.clear();
  }
}

// 本环境全局 localStorage 是 Node 占位对象（无 setItem/getItem/key/clear），
// 用确定性 Map 版 Storage 桩注入，清理起始状态后断言生产 cleanExpiredStorage。
class MemoryStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function clearLocalStorage(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key !== null) localStorage.removeItem(key);
  }
}

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as T;
  if (obj instanceof Map) {
    return new Map(Array.from(obj.entries()).map(([k, v]) => [deepClone(k), deepClone(v)])) as T;
  }
  if (obj instanceof Set) return new Set(Array.from(obj).map(v => deepClone(v))) as T;

  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return result as T;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== (b as unknown[]).length) return false;
      return a.every((item, i) => deepEqual(item, (b as unknown[])[i]));
    }
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ));
  }

  return false;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('数据预取和缓存引擎', () => {
  describe('LRUCache - LRU 策略', () => {
    let cache: LRUCache<number>;

    beforeEach(() => {
      cache = new LRUCache<number>({ maxSize: 3, defaultTTL: 100000 });
    });

    it('应该存储和获取数据', () => {
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
      expect(cache.has('a')).toBe(true);
      expect(cache.getStats().hits).toBe(1);
    });

    it('不存在的key返回undefined', () => {
      expect(cache.get('x')).toBeUndefined();
      expect(cache.has('x')).toBe(false);
      expect(cache.getStats().misses).toBe(1);
    });

    it('LRU淘汰最久未访问的', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // a 移到 Map 尾部
      cache.set('d', 4); // 淘汰 Map 首键 b
      expect(cache.has('b')).toBe(false);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.keys()).toEqual(['c', 'a', 'd']);
      expect(cache.getStats().evictions).toBe(1);
    });

    it('过期数据应该返回undefined（恰好到期仍有效）', () => {
      vi.useFakeTimers();
      const t0 = new Date('2026-01-05T09:30:00.000Z');
      vi.setSystemTime(t0);
      const ttlCache = new LRUCache<number>({ maxSize: 3, defaultTTL: 100000 });
      ttlCache.set('a', 1, 50);

      vi.setSystemTime(new Date(t0.getTime() + 50));
      expect(ttlCache.get('a')).toBe(1); // 50 - 0 === ttl，生产用 > 判定未过期

      vi.setSystemTime(new Date(t0.getTime() + 51));
      expect(ttlCache.get('a')).toBeUndefined();
      expect(ttlCache.has('a')).toBe(false);
      expect(ttlCache.getStats().evictions).toBe(0); // 过期走 delete，不算 eviction
    });

    it('ttl=0 表示永不过期', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-05T09:30:00.000Z'));
      cache.set('forever', 7, 0);
      vi.setSystemTime(new Date('2027-01-05T09:30:00.000Z'));
      expect(cache.get('forever')).toBe(7);
    });

    it('应该清除过期的localStorage缓存', () => {
      vi.useFakeTimers();
      const t0 = new Date('2026-01-05T09:30:00.000Z');
      vi.setSystemTime(t0);
      vi.stubGlobal('localStorage', new MemoryStorage());
      clearLocalStorage();

      expect(cacheToStorage('a', 1, 50)).toBe(true);
      expect(cacheToStorage('b', 2, 200)).toBe(true);

      vi.setSystemTime(new Date(t0.getTime() + 60));
      expect(cleanExpiredStorage()).toBe(1);
      expect(localStorage.getItem('a')).toBeNull();
      expect(localStorage.getItem('b')).not.toBeNull();
      expect(readFromStorage('b')).toBe(2);
    });
  });

  describe('LFUCache - LFU 策略', () => {
    it('应该淘汰访问次数最少的', () => {
      const cache = new LFUCache<number>({ maxSize: 3, defaultTTL: 100000 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a');
      cache.get('a');
      cache.get('a');
      cache.get('b');
      cache.set('d', 4);
      expect(cache.has('c')).toBe(false);
      expect(cache.has('a')).toBe(true);
      expect(cache.get('b')).toBe(2);
      expect(cache.getStats().evictions).toBe(1);
    });
  });

  describe('FIFO 策略（createCache 工厂）', () => {
    it('fifo配置按插入顺序淘汰最早条目', () => {
      const cache = createCache<number>('fifo', { maxSize: 3, defaultTTL: 100000 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // 生产无独立 FIFO 类，'fifo' 实际由 LRUCache 处理
      expect(cache.has('a')).toBe(false);
      expect(cache.has('d')).toBe(true);
      expect(cache.getStats().evictions).toBe(1);
    });
  });

  describe('PrefetchManager（未迁移：生产 DataPrefetchManager 契约不同）', () => {
    let pm: PrefetchManager;

    beforeEach(() => {
      pm = new PrefetchManager();
      pm.addRule({ pattern: /\/api\/stock/, priority: 10, ttl: 30000, prefetchOnHover: true, prefetchOnVisible: false });
      pm.addRule({ pattern: /\/api\/market/, priority: 5, ttl: 60000, prefetchOnHover: false, prefetchOnVisible: true });
    });

    it('应该匹配规则', () => {
      expect(pm.shouldPrefetch('/api/stock/600000')).not.toBeNull();
      expect(pm.shouldPrefetch('/api/market/stats')).not.toBeNull();
      expect(pm.shouldPrefetch('/api/user/profile')).toBeNull();
    });

    it('应该按优先级入队', () => {
      pm.enqueue('/api/market/stats');
      pm.enqueue('/api/stock/600000');
      const first = pm.dequeue();
      expect(first).toBe('/api/stock/600000');
    });

    it('已预取的URL不应该重复入队', () => {
      pm.enqueue('/api/stock/600000');
      pm.dequeue();
      expect(pm.enqueue('/api/stock/600000')).toBe(false);
    });

    it('不匹配规则的URL不应该入队', () => {
      expect(pm.enqueue('/other/url')).toBe(false);
    });

    it('应该检查预取状态', () => {
      pm.enqueue('/api/stock/600000');
      pm.dequeue();
      expect(pm.isPrefetched('/api/stock/600000')).toBe(true);
      expect(pm.isPrefetched('/other')).toBe(false);
    });

    it('clear应该清空所有', () => {
      pm.enqueue('/api/stock/600000');
      pm.clear();
      expect(pm.getQueueSize()).toBe(0);
      expect(pm.isPrefetched('/api/stock/600000')).toBe(false);
    });
  });

  describe('deepClone（未迁移：生产无通用导出）', () => {
    it('应该深拷贝对象', () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = deepClone(obj);
      clone.b.c = 3;
      expect(obj.b.c).toBe(2);
      expect(clone.b.c).toBe(3);
    });

    it('应该深拷贝数组', () => {
      const arr = [[1, 2], [3, 4]];
      const clone = deepClone(arr);
      clone[0][0] = 99;
      expect(arr[0][0]).toBe(1);
      expect(clone[0][0]).toBe(99);
    });

    it('应该拷贝Date', () => {
      const date = new Date('2026-01-05T09:30:00.000Z');
      const clone = deepClone(date);
      expect(clone.getTime()).toBe(date.getTime());
      expect(clone).not.toBe(date);
    });

    it('应该拷贝Map', () => {
      const map = new Map([['a', { v: 1 }]]);
      const clone = deepClone(map);
      expect(clone.get('a')).toEqual({ v: 1 });
      expect(clone.get('a')).not.toBe(map.get('a'));
    });

    it('null应该返回null', () => {
      expect(deepClone(null)).toBeNull();
    });

    it('基本类型应该原样返回', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('str')).toBe('str');
      expect(deepClone(true)).toBe(true);
    });
  });

  describe('deepEqual（未迁移：生产无通用导出）', () => {
    it('相同对象应该相等', () => {
      expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    });

    it('不同对象应该不相等', () => {
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('相同数组应该相等', () => {
      expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    });

    it('不同长度数组应该不相等', () => {
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('null vs null应该相等', () => {
      expect(deepEqual(null, null)).toBe(true);
    });

    it('null vs object应该不相等', () => {
      expect(deepEqual(null, {})).toBe(false);
    });

    it('基本类型应该用===', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual(1, '1')).toBe(false);
    });
  });

  describe('debounce / throttle（绑定 debounceThrottle.ts）', () => {
    it('debounce延迟后只执行最后一次调用', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-05T09:30:00.000Z'));
      const spy = vi.fn();
      const debounced = debounce(spy, 100);

      debounced('a');
      debounced('b');
      expect(spy).not.toHaveBeenCalled();
      expect(debounced.pending()).toBe(true);

      vi.advanceTimersByTime(99);
      expect(spy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenLastCalledWith('b');
      expect(debounced.pending()).toBe(false);
    });

    it('debounce flush会立即执行待处理调用', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-05T09:30:00.000Z'));
      const spy = vi.fn();
      const debounced = debounce(spy, 100);

      debounced('x');
      expect(debounced.pending()).toBe(true);
      debounced.flush();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenLastCalledWith('x');
      expect(debounced.pending()).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('debounce cancel会取消待处理调用', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-05T09:30:00.000Z'));
      const spy = vi.fn();
      const debounced = debounce(spy, 100);

      debounced('x');
      debounced.cancel();
      expect(debounced.pending()).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(spy).not.toHaveBeenCalled();
    });

    it('throttle首次立即执行并在间隔内合并为尾随调用', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-05T09:30:00.000Z'));
      const spy = vi.fn();
      const throttled = throttle(spy, 100);

      throttled(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenLastCalledWith(1);

      vi.advanceTimersByTime(50);
      throttled(2);
      expect(spy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith(2);
    });
  });
});
