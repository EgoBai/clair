/**
 * 批量操作逻辑测试（影子测试迁移：全部改绑生产真源）
 *
 * 绑定生产模块：backend/src/services/batchOperations.ts（该模块 0 个 import，无 db/logger/xlsx/express 依赖）
 * - BatchConfig     :6   { maxBatchSize, maxWaitMs, processFn }
 * - BatchProcessor  :18  有状态队列：add 累积；达到 maxBatchSize 立即 flush，否则 maxWaitMs 后 flush；
 *                        processFn 抛错时整批 reject，不重试；结果按数组下标回填（:59-60）
 * - batchExecute    :90  并发上限执行；单项错误收集为 { item, result?, error? }；结果按输入序返回
 * - chunk           :121 按 size 切片；size<=0 / NaN / Infinity 抛 RangeError（:122-126）
 * - processInChunks :132 分片内 Promise.all 并发，分片间串行；仅片间等待 delayMs（:146-153）
 *
 * 与旧自抄件的契约差异（断言已逐条按生产订正）：
 * 1. 旧 BatchConfig{concurrency,chunkSize,retryCount,retryDelay,rateLimitPerSecond} 在生产不存在，
 *    生产只认 { maxBatchSize, maxWaitMs, processFn }；旧接口已删除。
 * 2. 旧 chunkArray 对 size<=0 步进为 0/NaN 会无限循环；生产 chunk 直接抛 RangeError。
 * 3. 旧 createRetryPolicy 的指数退避在生产不存在：processFn 抛错后整批 reject，不会自动重试。
 * 4. 旧 createRateLimiter 的 1 秒窗口限流在生产不存在：只有 maxWaitMs 定时器，
 *    且定时器仅在首个 add 时挂载，后续 add 不重置（:38-40）。
 * 5. 旧 createProgressTracker 的百分比进度不存在；生产可观测的是 getPendingCount()。
 * 6. 旧 processInChunks 的“并发”仅指分片内并发，分片之间严格串行（不是全局并发池）。
 *
 * 删除的自抄 helper（生产无同契约，改用 X）：
 * - chunkArray            → 生产 chunk（:121）
 * - calcChunksNeeded      → 生产无独立导出；改用 chunk(...).length 断言分块数（含余数/整除边界）
 * - estimateBatchDuration → 生产不做耗时估算；改用 processInChunks + 假定时器实测片间延迟次数
 * - calcRateLimitDelay    → 生产无限速；改用 BatchProcessor 的 maxWaitMs 定时器语义
 * - canProceedRateLimit   → 生产无窗口限流；改用 maxWaitMs 触发 / 定时器不重置断言
 * - createRateLimiter     → 生产无令牌桶；改用 BatchProcessor 定时器与 clear() 语义
 * - summarizeResults      → 生产无汇总器；改用 batchExecute 返回的 { item, result?, error? } 分类断言
 * - partitionBySuccess    → 同上，改用 batchExecute 结果按 error 存在性划分
 * - createRetryPolicy     → 生产不重试；改用 processFn 抛错传播 + 调用次数断言
 * - createProgressTracker → 生产无进度百分比；改用 BatchProcessor.getPendingCount()
 * - BatchItem / BatchResult / 旧 BatchConfig 接口 → 删除（无引用；生产类型见 BatchConfig 与 batchExecute 返回值）
 *
 * 确定性约束：异步等待全部用 await + 固定时间常量；定时相关用 vi.useFakeTimers()；
 * 不使用随机数，不读取系统墙钟或运行时当前时间，也不拿墙钟做断言。
 *
 * 健壮性观察（只记录，本文件不修改生产源码）：
 * - batchExecute 用 items.indexOf 恢复顺序（:114），O(n²)；重复元素时比较器恒为 0，严格顺序无保证。
 * - batchExecute 在 concurrency<=0 时 Math.min 得到 0 个 worker，静默返回 []（:110），会丢数据。
 * - BatchProcessor 的 processFn 若返回数组短于批次，缺位 Promise 解析为 undefined（:59-60）。
 * - chunk 的 size<=0 已由 :122-126 防护，handover 所记“无限循环”在当前源码已不存在（下方有用例锁定）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BatchProcessor,
  batchExecute,
  chunk,
  processInChunks,
  type BatchConfig,
} from '../services/batchOperations';

/** 固定时间常量：不使用墙钟，全部交给 vi.useFakeTimers()。 */
const MAX_WAIT_MS = 100;
const CHUNK_DELAY_MS = 250;
const LONG_WAIT_MS = 60_000;

/** 手写 deferred：让“正在处理中”的窗口可精确控制，不依赖 setTimeout/墙钟。 */
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 推进微任务队列固定次数（无定时器参与），替代任意 sleep。 */
async function flushMicrotasks(times: number = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('批量操作逻辑', () => {
  describe('chunk（生产：services/batchOperations.ts:121）', () => {
    it('按 size 切片并保留尾部余数', () => {
      const chunks = chunk([1, 2, 3, 4, 5], 2);
      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
      expect(chunks.map(c => c.length)).toEqual([2, 2, 1]);
    });

    it('恰好整除时不产生空尾片', () => {
      const chunks = chunk([1, 2, 3, 4], 2);
      expect(chunks).toHaveLength(2);
      expect(chunks).toEqual([[1, 2], [3, 4]]);
    });

    it('size 大于数组长度时返回单片', () => {
      const chunks = chunk([1, 2], 10);
      expect(chunks).toEqual([[1, 2]]);
    });

    it('空数组返回空分片列表', () => {
      expect(chunk([], 5)).toEqual([]);
      expect(chunk([], 5)).toHaveLength(0);
    });

    it('单元素数组返回单元素分片', () => {
      expect(chunk([7], 3)).toEqual([[7]]);
    });

    it('size=1 时每元素一片', () => {
      expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    });

    it('小数 size 向下取整（2.9 按 2 切）', () => {
      expect(chunk([1, 2, 3, 4, 5], 2.9)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('size<=0 抛 RangeError，而不是无限循环', () => {
      expect(() => chunk([1, 2], 0)).toThrow(RangeError);
      expect(() => chunk([1, 2], 0)).toThrow(/必须为正整数/);
    });

    it('负数 / NaN / Infinity 的 size 均抛 RangeError', () => {
      for (const size of [-1, -0.5, 0.5, NaN, Infinity, -Infinity]) {
        expect(() => chunk([1, 2], size)).toThrow(RangeError);
      }
    });

    it('不修改输入数组', () => {
      const input = [1, 2, 3, 4, 5];
      const chunks = chunk(input, 2);
      expect(input).toEqual([1, 2, 3, 4, 5]);
      expect(chunks[0]).not.toBe(input);
    });
  });

  describe('processInChunks（生产：services/batchOperations.ts:132）', () => {
    it('按分片顺序处理并保留结果顺序', async () => {
      const fn = vi.fn(async (n: number) => n * 2);
      const results = await processInChunks([1, 2, 3, 4, 5], fn, 2, 0);
      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('空数组返回空数组且不调用 fn', async () => {
      const fn = vi.fn(async (n: number) => n);
      const results = await processInChunks([], fn, 2, 0);
      expect(results).toEqual([]);
      expect(fn).not.toHaveBeenCalled();
    });

    it('单元素数组只处理一片且不等待 delayMs', async () => {
      const fn = vi.fn(async (n: number) => n + 1);
      await expect(processInChunks([7], fn, 3, LONG_WAIT_MS)).resolves.toEqual([8]);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('恰好整除时逐片处理全部元素', async () => {
      const fn = vi.fn(async (n: number) => n * 10);
      const results = await processInChunks([1, 2, 3, 4], fn, 2, 0);
      expect(results).toEqual([10, 20, 30, 40]);
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('chunkSize 大于数组长度时只处理一片', async () => {
      const fn = vi.fn(async (n: number) => n);
      await expect(processInChunks([1, 2, 3], fn, 10, LONG_WAIT_MS)).resolves.toEqual([1, 2, 3]);
      expect(fn).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('小数 chunkSize 向下取整后分片', async () => {
      const fn = vi.fn(async (n: number) => n);
      const results = await processInChunks([1, 2, 3, 4, 5], fn, 2.9, 0);
      expect(results).toEqual([1, 2, 3, 4, 5]);
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('片内并发启动、片间严格串行（前一片未完成不启动下一片）', async () => {
      const started: number[] = [];
      const gates = new Map<number, ReturnType<typeof deferred>>();
      const fn = vi.fn(async (n: number) => {
        started.push(n);
        const gate = deferred();
        gates.set(n, gate);
        await gate.promise;
        return n * 10;
      });

      const promise = processInChunks([1, 2, 3], fn, 2, 0);
      await flushMicrotasks();
      expect(started).toEqual([1, 2]);
      expect(fn).toHaveBeenCalledTimes(2);

      // 同片内 2 先完成，也不能提前启动下一片
      gates.get(2)!.resolve(undefined);
      await flushMicrotasks();
      expect(started).toEqual([1, 2]);

      gates.get(1)!.resolve(undefined);
      await flushMicrotasks();
      expect(started).toEqual([1, 2, 3]);

      gates.get(3)!.resolve(undefined);
      await expect(promise).resolves.toEqual([10, 20, 30]);
    });

    it('片间等待 delayMs，末片之后不再等待', async () => {
      const fn = vi.fn(async (n: number) => n * 2);
      const promise = processInChunks([1, 2, 3, 4, 5], fn, 2, CHUNK_DELAY_MS);
      await flushMicrotasks();

      expect(fn).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(CHUNK_DELAY_MS - 1);
      expect(fn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
      expect(fn).toHaveBeenCalledTimes(4);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(CHUNK_DELAY_MS);
      await flushMicrotasks();
      await expect(promise).resolves.toEqual([2, 4, 6, 8, 10]);
      expect(fn).toHaveBeenCalledTimes(5);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('delayMs=0 时不挂定时器', async () => {
      const fn = vi.fn(async (n: number) => n + 1);
      const results = await processInChunks([1, 2, 3, 4], fn, 2, 0);
      expect(results).toEqual([2, 3, 4, 5]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('fn 抛错时整体 reject，且不再启动后续分片', async () => {
      const boom = new Error('processInChunks fn failed');
      const started: number[] = [];
      const promise = processInChunks(
        [1, 2, 3, 4],
        async n => {
          started.push(n);
          if (n === 1) throw boom;
          return n;
        },
        2,
        0
      );

      await expect(promise).rejects.toBe(boom);
      expect(started).toEqual([1, 2]);
    });

    it('chunkSize<=0 时 reject RangeError 且不调用 fn', async () => {
      const fn = vi.fn(async (n: number) => n);
      await expect(processInChunks([1, 2], fn, 0, 0)).rejects.toBeInstanceOf(RangeError);
      await expect(processInChunks([1, 2], fn, -3, 0)).rejects.toBeInstanceOf(RangeError);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('BatchProcessor（生产：services/batchOperations.ts:18）', () => {
    it('未达 maxBatchSize 时不立即处理，达到 maxWaitMs 才 flush', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const config: BatchConfig = { maxBatchSize: 3, maxWaitMs: MAX_WAIT_MS, processFn };
      const processor = new BatchProcessor(config);

      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      expect(processFn).not.toHaveBeenCalled();
      expect(processor.getPendingCount()).toBe(2);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(MAX_WAIT_MS - 1);
      expect(processFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(2);
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processFn).toHaveBeenCalledWith([1, 2]);
      expect(processor.getPendingCount()).toBe(0);
    });

    it('maxBatchSize=1 时逐个成批（上一批结束后再 add 立即触发）', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 1, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processFn).toHaveBeenLastCalledWith([1]);

      // 第一批在途时 processing=true，第二次 add 不会同步重入；等上一批结束后再 add
      await expect(first).resolves.toBe(1);
      const second = processor.add<number>(2);
      expect(processFn).toHaveBeenCalledTimes(2);
      expect(processFn).toHaveBeenLastCalledWith([2]);

      await expect(second).resolves.toBe(2);
      expect(processor.getPendingCount()).toBe(0);
    });

    it('恰好 maxBatchSize 个元素合并为一次调用', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 4, maxWaitMs: LONG_WAIT_MS, processFn });

      const promises = [1, 2, 3, 4].map(n => processor.add<number>(n));
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processFn).toHaveBeenCalledWith([1, 2, 3, 4]);
      expect(vi.getTimerCount()).toBe(0);

      await expect(Promise.all(promises)).resolves.toEqual([1, 2, 3, 4]);
      expect(processor.getPendingCount()).toBe(0);
    });

    it('后续 add 不重置首个 add 挂载的定时器', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 5, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      await vi.advanceTimersByTimeAsync(60);
      const second = processor.add<number>(2);
      await vi.advanceTimersByTimeAsync(MAX_WAIT_MS - 61);
      expect(processFn).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(1);
      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(2);
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processFn).toHaveBeenCalledWith([1, 2]);
    });

    it('达到 maxBatchSize 立即 flush 并清除已有定时器', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 3, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      expect(vi.getTimerCount()).toBe(1);

      const third = processor.add<number>(3);
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processFn).toHaveBeenCalledWith([1, 2, 3]);
      expect(processor.getPendingCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
      expect(processFn).toHaveBeenCalledTimes(1);

      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(2);
      await expect(third).resolves.toBe(3);
    });

    it('processFn 结果按批次下标回填到对应 Promise', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items.map((item, i) => `${i}:${String(item)}`));
      const processor = new BatchProcessor({ maxBatchSize: 2, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<string>('a');
      const second = processor.add<string>('b');
      expect(processFn).toHaveBeenCalledWith(['a', 'b']);

      await expect(first).resolves.toBe('0:a');
      await expect(second).resolves.toBe('1:b');
    });

    it('processFn 抛错时整批 reject 且不重试', async () => {
      const boom = new Error('processFn failed');
      const processFn = vi.fn(async () => {
        throw boom;
      });
      const processor = new BatchProcessor({ maxBatchSize: 2, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      await expect(first).rejects.toBe(boom);
      await expect(second).rejects.toBe(boom);

      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processor.getPendingCount()).toBe(0);
    });

    it('失败后 processing 状态复位，后续批次可继续处理', async () => {
      const boom = new Error('first batch failed');
      const processFn = vi.fn(async (items: unknown[]) => {
        if (processFn.mock.calls.length === 1) throw boom;
        return items;
      });
      const processor = new BatchProcessor({ maxBatchSize: 2, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      await expect(first).rejects.toBe(boom);
      await expect(second).rejects.toBe(boom);

      const third = processor.add<number>(3);
      const fourth = processor.add<number>(4);
      await expect(third).resolves.toBe(3);
      await expect(fourth).resolves.toBe(4);
      expect(processFn).toHaveBeenCalledTimes(2);
      expect(processor.getPendingCount()).toBe(0);
    });

    it('空队列 flush 不调用 processFn', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 2, maxWaitMs: MAX_WAIT_MS, processFn });

      await processor.flush();
      expect(processFn).not.toHaveBeenCalled();
      expect(processor.getPendingCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('maxWaitMs=0 时 add 不同步处理，需等定时器轮次', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 5, maxWaitMs: 0, processFn });

      const first = processor.add<number>(1);
      expect(processFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(0);
      await expect(first).resolves.toBe(1);
      expect(processFn).toHaveBeenCalledTimes(1);
    });

    it('getPendingCount 随 add / flush 变化', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 5, maxWaitMs: MAX_WAIT_MS, processFn });

      expect(processor.getPendingCount()).toBe(0);
      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      expect(processor.getPendingCount()).toBe(2);

      await processor.flush();
      expect(processor.getPendingCount()).toBe(0);
      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(2);
      expect(processFn).toHaveBeenCalledTimes(1);
    });

    it('processing 期间再次 flush 不会重入', async () => {
      const gate = deferred();
      const processFn = vi.fn(async (items: unknown[]) => {
        if (processFn.mock.calls.length === 1) await gate.promise;
        return items;
      });
      const processor = new BatchProcessor({ maxBatchSize: 2, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      const third = processor.add<number>(3);
      expect(processor.getPendingCount()).toBe(1);

      await processor.flush();
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processor.getPendingCount()).toBe(1);

      gate.resolve();
      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(2);
      await expect(third).resolves.toBe(3);
      expect(processFn).toHaveBeenCalledTimes(2);
      expect(processor.getPendingCount()).toBe(0);
    });

    it('processing 期间新增的项在当前批次结束后自动处理', async () => {
      const gate = deferred();
      const processFn = vi.fn(async (items: unknown[]) => {
        if (processFn.mock.calls.length === 1) await gate.promise;
        return items;
      });
      const processor = new BatchProcessor({ maxBatchSize: 2, maxWaitMs: LONG_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      const third = processor.add<number>(3);
      const fourth = processor.add<number>(4);
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processor.getPendingCount()).toBe(2);

      gate.resolve();
      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(2);
      await flushMicrotasks();
      expect(processFn).toHaveBeenCalledTimes(2);
      expect(processFn).toHaveBeenLastCalledWith([3, 4]);

      await expect(third).resolves.toBe(3);
      await expect(fourth).resolves.toBe(4);
      expect(processor.getPendingCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('clear 拒绝全部 pending 并清除定时器', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 5, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      expect(vi.getTimerCount()).toBe(1);

      processor.clear();
      await expect(first).rejects.toThrow('Batch cleared');
      await expect(second).rejects.toThrow('Batch cleared');
      expect(processor.getPendingCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
      expect(processFn).not.toHaveBeenCalled();
    });

    it('clear 后仍可继续 add 并正常处理', async () => {
      const processFn = vi.fn(async (items: unknown[]) => items);
      const processor = new BatchProcessor({ maxBatchSize: 5, maxWaitMs: MAX_WAIT_MS, processFn });

      const dropped = processor.add<number>(1);
      processor.clear();
      await expect(dropped).rejects.toThrow('Batch cleared');

      const kept = processor.add<number>(2);
      await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
      await expect(kept).resolves.toBe(2);
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processFn).toHaveBeenCalledWith([2]);
    });

    it('clear 不影响已从队列取出的在途批次', async () => {
      const gate = deferred();
      const processFn = vi.fn(async (items: unknown[]) => {
        if (processFn.mock.calls.length === 1) await gate.promise;
        return items;
      });
      const processor = new BatchProcessor({ maxBatchSize: 2, maxWaitMs: MAX_WAIT_MS, processFn });

      const first = processor.add<number>(1);
      const second = processor.add<number>(2);
      const pending = processor.add<number>(3);
      expect(processor.getPendingCount()).toBe(1);

      processor.clear();
      await expect(pending).rejects.toThrow('Batch cleared');
      gate.resolve();

      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(2);
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processor.getPendingCount()).toBe(0);
    });
  });

  describe('batchExecute（生产：services/batchOperations.ts:90）', () => {
    it('按输入序返回并收集单项错误', async () => {
      const results = await batchExecute(
        [1, 2, 3],
        async n => {
          if (n === 2) throw new Error('boom');
          return n * 10;
        },
        2
      );

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ item: 1, result: 10 });
      expect(results[1].item).toBe(2);
      expect(results[1].error).toBeInstanceOf(Error);
      expect(results[2]).toEqual({ item: 3, result: 30 });
    });

    it('每个元素只执行一次', async () => {
      const seen: number[] = [];
      const results = await batchExecute(
        [5, 6, 7, 8],
        async n => {
          seen.push(n);
          return n;
        },
        3
      );

      expect(results.map(r => r.result)).toEqual([5, 6, 7, 8]);
      expect(seen.sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
    });

    it('空数组返回空数组', async () => {
      const results = await batchExecute([], async (n: number) => n);
      expect(results).toEqual([]);
    });

    it('并发数不超过 concurrency 且结果保持输入序', async () => {
      let active = 0;
      let maxActive = 0;
      const results = await batchExecute(
        [1, 2, 3, 4, 5],
        async (n: number) => {
          active++;
          maxActive = Math.max(maxActive, active);
          await Promise.resolve();
          active--;
          return n * 2;
        },
        2
      );

      expect(maxActive).toBe(2);
      expect(results.map(r => r.result)).toEqual([2, 4, 6, 8, 10]);
      expect(results.every(r => r.error === undefined)).toBe(true);
    });
  });
});
