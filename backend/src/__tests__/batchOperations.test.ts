import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchProcessor, batchExecute, chunk, processInChunks } from '../services/batchOperations';

describe('BatchProcessor', () => {
  let processor: BatchProcessor;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should batch items and process when full', async () => {
    const processFn = vi.fn().mockResolvedValue([1, 2, 3]);
    processor = new BatchProcessor({
      maxBatchSize: 3,
      maxWaitMs: 1000,
      processFn,
    });

    const p1 = processor.add('a');
    const p2 = processor.add('b');
    const p3 = processor.add('c');

    await vi.advanceTimersByTimeAsync(10);

    expect(processFn).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(await p1).toBe(1);
    expect(await p2).toBe(2);
    expect(await p3).toBe(3);
  });

  it('should process after maxWaitMs', async () => {
    const processFn = vi.fn().mockResolvedValue(['result']);
    processor = new BatchProcessor({
      maxBatchSize: 10,
      maxWaitMs: 500,
      processFn,
    });

    processor.add('item');
    expect(processFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(processFn).toHaveBeenCalled();
  });

  it('should reject on process error', async () => {
    const processFn = vi.fn().mockRejectedValue(new Error('process failed'));
    processor = new BatchProcessor({
      maxBatchSize: 2,
      maxWaitMs: 1000,
      processFn,
    });

    const p1 = processor.add('a').catch(e => e);
    const p2 = processor.add('b').catch(e => e);

    await vi.advanceTimersByTimeAsync(10);
    const err = await p1;
    expect(err).toBeInstanceOf(Error);
  });

  it('should report pending count', () => {
    processor = new BatchProcessor({
      maxBatchSize: 10,
      maxWaitMs: 1000,
      processFn: vi.fn().mockResolvedValue([]),
    });

    processor.add('a');
    processor.add('b');
    expect(processor.getPendingCount()).toBe(2);
  });

  it('should clear pending items', async () => {
    processor = new BatchProcessor({
      maxBatchSize: 10,
      maxWaitMs: 1000,
      processFn: vi.fn().mockResolvedValue([]),
    });

    const p = processor.add('item').catch(() => 'caught');
    processor.clear();
    expect(processor.getPendingCount()).toBe(0);
    expect(await p).toBe('caught');
  });
});

describe('batchExecute', () => {
  it('should execute all items', async () => {
    const fn = vi.fn().mockImplementation(async (x: number) => x * 2);
    const results = await batchExecute([1, 2, 3], fn, 2);
    expect(results).toHaveLength(3);
    expect(results[0].result).toBe(2);
    expect(results[1].result).toBe(4);
    expect(results[2].result).toBe(6);
  });

  it('should handle errors gracefully', async () => {
    const fn = vi.fn().mockImplementation(async (x: number) => {
      if (x === 2) throw new Error('fail');
      return x;
    });
    const results = await batchExecute([1, 2, 3], fn, 1);
    expect(results[1].error).toBeInstanceOf(Error);
    expect(results[0].result).toBe(1);
    expect(results[2].result).toBe(3);
  });

  it('should execute with concurrency control', async () => {
    const fn = async (x: number) => x;
    const results = await batchExecute([1, 2, 3, 4, 5], fn, 2);
    expect(results).toHaveLength(5);
    expect(results.map(r => r.result)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should preserve input order in results', async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = async (x: number) => x * 10;
    const results = await batchExecute(items, fn, 5);
    expect(results.map(r => r.result)).toEqual([10, 20, 30, 40, 50]);
  });
});

describe('chunk', () => {
  it('should split array into chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('should handle empty array', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('should handle size >= array length', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('should handle size 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});

describe('processInChunks', () => {
  it('should process all items', async () => {
    const fn = async (x: number) => x * 2;
    const results = await processInChunks([1, 2, 3, 4, 5], fn, 2, 0);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('should handle empty array', async () => {
    const fn = async (x: number) => x;
    const results = await processInChunks([], fn, 10, 0);
    expect(results).toEqual([]);
  });
});
