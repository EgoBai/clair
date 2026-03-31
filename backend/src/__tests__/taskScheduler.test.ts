import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskScheduler, batchProcess } from '../services/taskScheduler';

describe('TaskScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add and execute tasks', async () => {
    vi.useFakeTimers();
    const result: number[] = [];
    const scheduler = new TaskScheduler({ concurrency: 2 });
    scheduler.addTask('t1', async () => { result.push(1); return 1; });
    scheduler.addTask('t2', async () => { result.push(2); return 2; });
    await vi.advanceTimersByTimeAsync(50);
    expect(result.sort()).toEqual([1, 2]);
  });

  it('should respect concurrency limit', async () => {
    vi.useFakeTimers();
    let running = 0;
    let maxRunning = 0;
    const scheduler = new TaskScheduler({ concurrency: 2 });

    const slowTask = () => new Promise<number>(resolve => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      setTimeout(() => { running--; resolve(1); }, 100);
    });

    scheduler.addTask('t1', slowTask);
    scheduler.addTask('t2', slowTask);
    scheduler.addTask('t3', slowTask);
    await vi.advanceTimersByTimeAsync(200);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('should execute tasks by priority when all added before running', async () => {
    const order: string[] = [];
    // Use concurrency=0 (pauses immediately) to control scheduling
    const scheduler = new TaskScheduler({ concurrency: 2 });
    scheduler.pause();
    scheduler.addTask('low', async () => { order.push('low'); return 0; }, 'low');
    scheduler.addTask('critical', async () => { order.push('critical'); return 0; }, 'critical');
    scheduler.addTask('normal', async () => { order.push('normal'); return 0; }, 'normal');

    // Now resume - tasks should run in priority order
    scheduler.resume();
    // Tasks run synchronously when fn is async and resolves immediately
    // Critical should be first
    await new Promise(r => setTimeout(r, 0));
    expect(order[0]).toBe('critical');
  });

  it('should track task status through lifecycle', async () => {
    vi.useFakeTimers();
    const scheduler = new TaskScheduler({ concurrency: 1 });
    const id = scheduler.addTask('t1', async () => 'done');
    // Immediately after add, it may already be running
    const task = scheduler.getTask(id);
    expect(task).toBeDefined();
    expect(['pending', 'running']).toContain(task!.status);

    await vi.advanceTimersByTimeAsync(50);
    const completed = scheduler.getTask(id);
    expect(completed!.status).toBe('completed');
    expect(completed!.result).toBe('done');
  });

  it('should cancel pending tasks', () => {
    const scheduler = new TaskScheduler({ concurrency: 1 });
    const never = () => new Promise(() => {});
    scheduler.addTask('blocker', never);
    const id2 = scheduler.addTask('t2', async () => 'x');

    expect(scheduler.cancelTask(id2)).toBe(true);
    // Task removed from queue
    expect(scheduler.getTask(id2)).toBeUndefined();
  });

  it('should retry failed tasks', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const scheduler = new TaskScheduler({ concurrency: 1, retryDelay: 10, defaultMaxRetries: 2 });
    scheduler.addTask('t1', async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'ok';
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(attempts).toBe(3);
  });

  it('should fail after max retries', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const scheduler = new TaskScheduler({ concurrency: 1, retryDelay: 10, defaultMaxRetries: 1, onError });
    scheduler.addTask('t1', async () => { throw new Error('always fail'); });
    await vi.advanceTimersByTimeAsync(200);
    expect(onError).toHaveBeenCalled();
  });

  it('should call onComplete callback', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const scheduler = new TaskScheduler({ concurrency: 2, onComplete });
    scheduler.addTask('t1', async () => 'ok');
    await vi.advanceTimersByTimeAsync(50);
    expect(onComplete).toHaveBeenCalled();
  });

  it('should track stats', async () => {
    vi.useFakeTimers();
    const scheduler = new TaskScheduler({ concurrency: 2 });
    scheduler.addTask('t1', async () => 1);
    scheduler.addTask('t2', async () => 2);
    await vi.advanceTimersByTimeAsync(50);
    const stats = scheduler.getStats();
    expect(stats.completed).toBe(2);
    expect(stats.running).toBe(0);
  });

  it('should pause and resume', async () => {
    vi.useFakeTimers();
    const result: number[] = [];
    const scheduler = new TaskScheduler({ concurrency: 2 });
    scheduler.pause();
    scheduler.addTask('t1', async () => { result.push(1); return 1; });
    scheduler.addTask('t2', async () => { result.push(2); return 2; });
    await vi.advanceTimersByTimeAsync(50);
    expect(result).toEqual([]); // paused, nothing runs

    scheduler.resume();
    await vi.advanceTimersByTimeAsync(50);
    expect(result.sort()).toEqual([1, 2]);
  });

  it('should clear queue', () => {
    const scheduler = new TaskScheduler({ concurrency: 1 });
    scheduler.pause();
    scheduler.addTask('t1', async () => 1);
    scheduler.addTask('t2', async () => 2);
    scheduler.clear();
    expect(scheduler.getStats().pending).toBe(0);
  });
});

describe('batchProcess', () => {
  it('should process all items', async () => {
    const results = await batchProcess(
      [1, 2, 3],
      async (n) => n * 2,
      { concurrency: 2 }
    );
    expect(results.map(r => r.result).sort()).toEqual([2, 4, 6]);
  });

  it('should handle errors', async () => {
    const results = await batchProcess(
      [1, 2, 3],
      async (n) => { if (n === 2) throw new Error('fail'); return n; },
      { concurrency: 2 }
    );
    const errors = results.filter(r => r.error);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toBe(2);
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    const results = await batchProcess(
      [1],
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'ok';
      },
      { concurrency: 1, retryCount: 3 }
    );
    expect(results[0].result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('should respect concurrency', async () => {
    let running = 0;
    let maxRunning = 0;
    const results = await batchProcess(
      [1, 2, 3, 4, 5],
      async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(r => setTimeout(r, 10));
        running--;
        return 1;
      },
      { concurrency: 2 }
    );
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(results).toHaveLength(5);
  });
});
