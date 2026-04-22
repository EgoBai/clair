/**
 * 数据流处理引擎
 * 支持数据管道、变换、过滤、聚合、窗口计算
 */

export type TransformFn<T, R> = (item: T, index: number) => R;
export type FilterFn<T> = (item: T, index: number) => boolean;
export type ReduceFn<T, R> = (acc: R, item: T, index: number) => R;

export interface WindowConfig {
  size: number;
  slide: number;
}

export interface Pipeline<T> {
  map: <R>(fn: TransformFn<T, R>) => Pipeline<R>;
  filter: (fn: FilterFn<T>) => Pipeline<T>;
  reduce: <R>(fn: ReduceFn<T, R>, initial: R) => R;
  take: (count: number) => Pipeline<T>;
  skip: (count: number) => Pipeline<T>;
  distinct: (keyFn?: (item: T) => unknown) => Pipeline<T>;
  sort: (compareFn?: (a: T, b: T) => number) => Pipeline<T>;
  groupBy: <K>(keyFn: (item: T) => K) => Map<K, T[]>;
  window: (config: WindowConfig) => Pipeline<T[]>;
  batch: (size: number) => Pipeline<T[]>;
  toArray: () => T[];
  first: () => T | undefined;
  last: () => T | undefined;
  count: () => number;
  sum: (fn: (item: T) => number) => number;
  avg: (fn: (item: T) => number) => number;
  min: (fn: (item: T) => number) => T | undefined;
  max: (fn: (item: T) => number) => T | undefined;
}

/**
 * 创建数据管道
 */
export function pipeline<T>(data: T[]): Pipeline<T> {
  const current: unknown[] = [...data];

  const create = <U>(items: unknown[]): Pipeline<U> => {
    return pipeline(items as U[]);
  };

  return {
    map: <R>(fn: TransformFn<T, R>) => create<R>(current.map((item, i) => fn(item as T, i))),
    filter: (fn: FilterFn<T>) => create<T>(current.filter((item, i) => fn(item as T, i))),
    reduce: <R>(fn: ReduceFn<T, R>, initial: R): R => current.reduce((acc, item, i) => fn(acc as R, item as T, i), initial as unknown) as R,
    take: (count) => create<T>(current.slice(0, count)),
    skip: (count) => create<T>(current.slice(count)),
    distinct: (keyFn) => {
      const seen = new Set();
      return create<T>(current.filter((item) => {
        const key = keyFn ? keyFn(item as T) : item;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    },
    sort: (compareFn) => create<T>([...current].sort(compareFn as (a: unknown, b: unknown) => number)),
    groupBy: <K>(keyFn: (item: T) => K) => {
      const map = new Map<K, T[]>();
      for (const item of current as T[]) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
      }
      return map;
    },
    window: (config) => {
      const windows: T[][] = [];
      for (let i = 0; i <= (current as T[]).length - config.size; i += config.slide) {
        windows.push((current as T[]).slice(i, i + config.size));
      }
      return create<T[]>(windows);
    },
    batch: (size) => {
      const batches: T[][] = [];
      for (let i = 0; i < current.length; i += size) {
        batches.push((current as T[]).slice(i, i + size));
      }
      return create<T[]>(batches);
    },
    toArray: () => [...current] as T[],
    first: () => current[0] as T | undefined,
    last: () => current[current.length - 1] as T | undefined,
    count: () => current.length,
    sum: (fn) => (current as T[]).reduce((sum, item) => sum + fn(item), 0),
    avg: (fn) => {
      if (current.length === 0) return 0;
      return (current as T[]).reduce((sum, item) => sum + fn(item), 0) / current.length;
    },
    min: (fn) => {
      if (current.length === 0) return undefined;
      return (current as T[]).reduce((min, item) => fn(item) < fn(min) ? item : min);
    },
    max: (fn) => {
      if (current.length === 0) return undefined;
      return (current as T[]).reduce((max, item) => fn(item) > fn(max) ? item : max);
    },
  };
}

/**
 * 去抖流
 */
export function createDebouncedStream<T>(
  interval: number,
  onFlush: (items: T[]) => void,
): { push: (item: T) => void; flush: () => void; size: number } {
  let buffer: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (buffer.length > 0) {
      onFlush([...buffer]);
      buffer = [];
    }
    if (timer) { clearTimeout(timer); timer = null; }
  }

  return {
    push(item: T) {
      buffer.push(item);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, interval);
    },
    flush,
    get size() { return buffer.length; },
  };
}

/**
 * 滑动窗口聚合
 */
export function slidingWindowAggregate<T>(
  data: T[],
  windowSize: number,
  slide: number,
  aggregate: (window: T[]) => number,
): number[] {
  const results: number[] = [];
  for (let i = 0; i <= data.length - windowSize; i += slide) {
    results.push(aggregate(data.slice(i, i + windowSize)));
  }
  return results;
}

/**
 * 数据采样
 */
export function sampleData<T>(
  data: T[],
  rate: number,
  method: 'uniform' | 'random' | 'first' | 'last' = 'uniform',
): T[] {
  if (rate >= 1) return data;

  const count = Math.max(1, Math.floor(data.length * rate));

  switch (method) {
    case 'first': return data.slice(0, count);
    case 'last': return data.slice(-count);
    case 'random': {
      const shuffled = [...data].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    }
    case 'uniform':
    default: {
      const step = data.length / count;
      return Array.from({ length: count }, (_, i) => data[Math.floor(i * step)]);
    }
  }
}

/**
 * 数据分箱
 */
export function binData(
  data: number[],
  binCount: number,
): Array<{ min: number; max: number; count: number; items: number[] }> {
  if (data.length === 0) return [];

  const min = Math.min(...data);
  const max = Math.max(...data);
  const binWidth = (max - min) / binCount || 1;

  const bins = Array.from({ length: binCount }, (_, i) => ({
    min: min + i * binWidth,
    max: min + (i + 1) * binWidth,
    count: 0,
    items: [] as number[],
  }));

  for (const val of data) {
    const idx = Math.min(binCount - 1, Math.floor((val - min) / binWidth));
    bins[idx].count++;
    bins[idx].items.push(val);
  }

  return bins;
}

/**
 * Z-Score标准化
 */
export function zScoreNormalize(data: number[]): number[] {
  if (data.length === 0) return [];
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const std = Math.sqrt(data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length);
  if (std === 0) return data.map(() => 0);
  return data.map(v => Math.round(((v - mean) / std) * 10000) / 10000);
}

/**
 * Min-Max标准化
 */
export function minMaxNormalize(data: number[]): number[] {
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  if (range === 0) return data.map(() => 0);
  return data.map(v => Math.round(((v - min) / range) * 10000) / 10000);
}
