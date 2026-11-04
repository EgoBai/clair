/**
 * 影子测试迁移（批次 12）
 *
 * 旧文件把 deduplicateEvents / groupBy / aggregate / chunk / unique /
 * intersection / difference / flatten / deepClone / deepEqual / debounce /
 * throttle / formatRelativeTime 全部在测试里手抄一份再断言副本：
 * - groupBy 按 keyFn 分组、aggregate 返回扁平 {sum,avg,min,max,count}，
 *   与产品 exportEngine 的「字段名 + aggregations 数组 + `${key}_${type}`」
 *   契约完全不同；
 * - formatRelativeTime 自造 30 天/月、365 天/年阈值，用当前时间戳取值，
 *   45 天断言 '1个月前'、400 天断言 '1年前'，而生产 >=30 天直接返回完整日期；
 * - debounce/throttle 副本用 Date.now 差值，且没有 leading/trailing/flush/cancel，
 *   断言「delay 0 时防抖尚未执行」，依赖真实事件循环。
 *
 * 已绑定生产实现：
 * - ../utils/exportEngine.ts:361 groupData（按字段名分组，缺失字段归 '未分组' :368）
 * - ../utils/exportEngine.ts:381 aggregateData（aggregations 数组，输出 `${key}_${type}`；
 *   count 为 filter(v !== 0) :400，avg 四舍五入 2 位 :395-397）
 * - ../utils/debounceThrottle.ts:6 debounce（trailing/cancel/flush/pending）
 * - ../utils/debounceThrottle.ts:141 throttle（= debounce + maxWait，默认 leading+trailing）
 * - ../utils/enhancedFormatters.ts:9 formatRelativeTime(date, locale, now)，
 *   :71 formatDate（>=30 天退化为完整日期）
 * 上述 debounce/throttle 由 ../utils/index.ts:19 显式再导出；formatRelativeTime 由
 * :174-181 以 formatRelativeTimeEnhanced 别名再导出；exportEngine 未被 utils/index.ts
 * 桶文件再导出，只能按文件路径 import。frontend/src/utils/bloombergExportEngine.ts:628/:645
 * 有同名 groupData/aggregateData，但 :7 import XLSX、:8 import file-saver（D43 CI 不装
 * 前端浏览器依赖），不可用。
 *
 * 旧断言错在哪（旧副本与生产行为不一致）：
 *
 * | 旧断言 / 旧实现 | 生产输出 | 依据 |
 * | --- | --- | --- |
 * | 45 天 → '1个月前' | formatRelativeTime 返回 '2025年12月1日'（完整日期） | enhancedFormatters.ts:64、:67 |
 * | 400 天 → '1年前' | 返回 '2024年12月11日'（完整日期） | enhancedFormatters.ts:67 |
 * | groupBy(items, keyFn) | groupData(data, '字段名')；缺失字段 → '未分组' | exportEngine.ts:361、:368 |
 * | aggregate → {sum,avg,min,max,count} | aggregateData(data, [{key,type}]) → {v_sum,v_avg,v_min,v_max,v_count} | exportEngine.ts:381、:392-406 |
 * | count = values.length | count 排除 0：filter(v => v !== 0).length | exportEngine.ts:400 |
 * | 节流 delay 0 立即执行、防抖 delay 0 尚未执行 | throttle 首次立即执行、间隔内尾随合并；debounce 需推进计时器 | debounceThrottle.ts:6-151 |
 * | 多处现取当前时间 | 固定 NOW + 显式 now 参数 | 铁律 2 |
 *
 * 未迁移——生产无同契约实现（保留本地 helper）：
 * - deduplicateEvents / deduplicateByField：生产 deduplicateNews
 *   （newsAggregationEngine.ts:48，按规范化标题、保留 importance 大者、倒序）与
 *   deduplicateSignals（tradeSignalNotificationEngine.ts:62，symbol:type:source +
 *   时间窗 + confidence）都不接受 keyField/timestampField，无通用去重导出。
 * - chunk/unique/intersection/difference/flatten：全仓无通用数组工具导出；
 *   renderScheduler.ts:253 chunkArray 是类方法并返回 Generator，
 *   dataFlowEngine 的 groupBy/aggregate 是 builder 方法。
 * - deepClone/deepEqual：无通用导出；cloneLayout:236 与 dashboardLayoutEngine
 *   仅服务于布局对象。
 *
 * 发现的生产缺口（只报告不修）：
 * - aggregateData 的 count 排除 0（exportEngine.ts:400）：全 0 数据集 count 为 0，
 *   与「元素个数」直觉不符；下方 count 用例已锁定该语义。
 * - 空数据 min/max 为 ±Infinity（exportEngine.ts:403/:406），未断言以避免固化。
 * - groupData 缺失字段静默归入 '未分组'（:368），无法区分「未分组」与真实值。
 * - formatRelativeTime 超过 30 天不再相对（enhancedFormatters.ts:67）。
 * - 两个同名 formatRelativeTime 并存（formatters.ts:266 阈值 5 分钟且无天/月/年），
 *   utils/index.ts:7 与 :174-181 同时导出，调用方易选错口径。
 * - exportEngine 未被 utils/index.ts 桶导出。
 *
 * 用例数：44 → 49（去重 7、分组 5、聚合 5、数组 9、深克隆 8、节流防抖 5、相对时间 10）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportTemplate } from '../utils/exportEngine';
import { aggregateData, groupData } from '../utils/exportEngine';
import { debounce, throttle } from '../utils/debounceThrottle';
import { formatRelativeTime } from '../utils/enhancedFormatters';

// ==================== 未迁移：生产无同契约实现，保留本地 helper ====================

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

const VALUE_AGGREGATIONS: NonNullable<ReportTemplate['aggregations']> = [
  { key: 'v', type: 'sum' },
  { key: 'v', type: 'avg' },
  { key: 'v', type: 'count' },
  { key: 'v', type: 'min' },
  { key: 'v', type: 'max' },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('事件去重（未迁移：生产 deduplicateNews/deduplicateSignals 契约不同）', () => {
  it('相同ID保留最新', () => {
    const events = [
      { id: '1', timestamp: 100, data: 'old' },
      { id: '1', timestamp: 200, data: 'new' }
    ];
    const result = deduplicateEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].data).toBe('new');
  });

  it('不同ID都保留', () => {
    const events = [
      { id: '1', timestamp: 100 },
      { id: '2', timestamp: 200 }
    ];
    expect(deduplicateEvents(events)).toHaveLength(2);
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
    const result = deduplicateEvents(events);
    expect(result.map(e => e.id)).toEqual(['1', '3', '2']);
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

describe('数据分组（绑定 exportEngine.groupData）', () => {
  it('按字段分组', () => {
    const items = [
      { sector: 'tech', name: 'A' },
      { sector: 'finance', name: 'B' },
      { sector: 'tech', name: 'C' }
    ];
    const groups = groupData(items, 'sector');
    expect(groups.get('tech')).toHaveLength(2);
    expect(groups.get('finance')).toHaveLength(1);
  });

  it('空数组返回空Map', () => {
    const groups = groupData([], 'sector');
    expect(groups.size).toBe(0);
  });

  it('全部同组', () => {
    const items = [{ type: 'A' }, { type: 'A' }, { type: 'A' }];
    const groups = groupData(items, 'type');
    expect(groups.size).toBe(1);
    expect(groups.get('A')).toHaveLength(3);
  });

  it('全部不同组', () => {
    const items = [{ type: 'A' }, { type: 'B' }, { type: 'C' }];
    const groups = groupData(items, 'type');
    expect(groups.size).toBe(3);
  });

  it('缺失字段归入未分组', () => {
    const items = [{ sector: 'tech' }, { name: '无板块' }];
    const groups = groupData(items, 'sector');
    expect(groups.size).toBe(2);
    expect(groups.get('未分组')).toHaveLength(1);
  });
});

describe('数据聚合（绑定 exportEngine.aggregateData）', () => {
  it('基本聚合', () => {
    const items = [{ v: 10 }, { v: 20 }, { v: 30 }];
    const agg = aggregateData(items, VALUE_AGGREGATIONS);
    expect(agg.v_sum).toBe(60);
    expect(agg.v_avg).toBe(20);
    expect(agg.v_min).toBe(10);
    expect(agg.v_max).toBe(30);
    expect(agg.v_count).toBe(3);
  });

  it('空数组聚合', () => {
    const agg = aggregateData([], VALUE_AGGREGATIONS);
    expect(agg.v_count).toBe(0);
    expect(agg.v_sum).toBe(0);
    expect(agg.v_avg).toBe(0);
  });

  it('单元素聚合', () => {
    const agg = aggregateData([{ v: 42 }], VALUE_AGGREGATIONS);
    expect(agg.v_avg).toBe(42);
    expect(agg.v_min).toBe(42);
    expect(agg.v_max).toBe(42);
    expect(agg.v_count).toBe(1);
  });

  it('负值聚合', () => {
    const items = [{ v: -10 }, { v: -20 }, { v: 30 }];
    const agg = aggregateData(items, VALUE_AGGREGATIONS);
    expect(agg.v_sum).toBe(0);
    expect(agg.v_avg).toBe(0);
    expect(agg.v_min).toBe(-20);
    expect(agg.v_max).toBe(30);
  });

  it('count排除0值', () => {
    const items = [{ v: 0 }, { v: 5 }, { v: 0 }];
    const agg = aggregateData(items, VALUE_AGGREGATIONS);
    expect(agg.v_count).toBe(1);
    expect(agg.v_sum).toBe(5);
    expect(agg.v_avg).toBe(1.67);
    expect(agg.v_min).toBe(0);
    expect(agg.v_max).toBe(5);
  });
});

describe('数组工具函数（未迁移：生产无通用导出）', () => {
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

describe('深克隆与深比较（未迁移：生产无通用导出）', () => {
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
    expect(clone[2]).not.toBe(arr[2]);
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

describe('节流防抖（绑定 debounceThrottle.ts）', () => {
  it('节流首次立即执行并传参', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(42);
  });

  it('节流间隔内合并为尾随调用', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled(1);
    vi.advanceTimersByTime(50);
    throttled(2);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it('防抖延迟执行且只执行最后一次', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(42);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(42);
  });

  it('防抖连续调用只保留最后一次参数', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(1);
    debounced(2);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it('防抖 cancel 取消待处理调用', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(42);
    debounced.cancel();
    expect(debounced.pending()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('相对时间格式化（绑定 enhancedFormatters.formatRelativeTime）', () => {
  const NOW = new Date('2026-01-15T12:00:00.000Z');
  const ago = (ms: number) => new Date(NOW.getTime() - ms);

  it('刚刚', () => {
    expect(formatRelativeTime(ago(10_000), 'zh-CN', NOW)).toBe('刚刚');
  });

  it('分钟前', () => {
    expect(formatRelativeTime(ago(5 * 60 * 1000), 'zh-CN', NOW)).toBe('5分钟前');
  });

  it('小时前', () => {
    expect(formatRelativeTime(ago(3 * 60 * 60 * 1000), 'zh-CN', NOW)).toBe('3小时前');
  });

  it('天前', () => {
    expect(formatRelativeTime(ago(5 * 24 * 60 * 60 * 1000), 'zh-CN', NOW)).toBe('5天前');
  });

  it('45天退化为完整日期（旧断言1个月前是错的）', () => {
    expect(formatRelativeTime(ago(45 * 24 * 60 * 60 * 1000), 'zh-CN', NOW)).toBe('2025年12月1日');
  });

  it('400天退化为完整日期（旧断言1年前是错的）', () => {
    expect(formatRelativeTime(ago(400 * 24 * 60 * 60 * 1000), 'zh-CN', NOW)).toBe('2024年12月11日');
  });

  it('精确边界：59秒仍是刚刚', () => {
    expect(formatRelativeTime(ago(59_000), 'zh-CN', NOW)).toBe('刚刚');
  });

  it('精确边界：60秒为1分钟前', () => {
    expect(formatRelativeTime(ago(60_000), 'zh-CN', NOW)).toBe('1分钟前');
  });

  it('未来时间', () => {
    const future = new Date(NOW.getTime() + 10_000);
    expect(formatRelativeTime(future, 'zh-CN', NOW)).toBe('未来');
  });

  it('英文文案', () => {
    expect(formatRelativeTime(ago(5 * 60 * 1000), 'en-US', NOW)).toBe('5 min ago');
  });
});
