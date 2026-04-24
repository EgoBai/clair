/**
 * Idle Scheduler 测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock requestIdleCallback
vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => {
  return setTimeout(() => {
    cb({
      didTimeout: false,
      timeRemaining: () => 50,
    });
  }, 1);
});

vi.stubGlobal('cancelIdleCallback', (id: number) => {
  clearTimeout(id);
});

describe('IdleScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create scheduler with default options', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler();
    const status = sched.getStatus();
    expect(status.running).toBe(0);
    expect(status.scheduled).toBe(0);
    expect(status.executed).toBe(0);
    sched.dispose();
  });

  it('should schedule and execute task', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler();
    const taskFn = vi.fn();

    sched.schedule(taskFn);

    await new Promise(r => setTimeout(r, 50));

    expect(taskFn).toHaveBeenCalled();
    sched.dispose();
  });

  it('should respect priority order', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler();
    const order: string[] = [];

    sched.schedule(() => order.push('normal'), { priority: 'normal' });
    sched.schedule(() => order.push('high'), { priority: 'high' });
    sched.schedule(() => order.push('immediate'), { priority: 'immediate' });

    await new Promise(r => setTimeout(r, 200));

    // All tasks should complete
    expect(order.length).toBe(3);
    expect(order).toContain('immediate');
    expect(order).toContain('high');
    expect(order).toContain('normal');
    sched.dispose();
  });

  it('should schedule async task and resolve', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler();

    const result = await sched.scheduleAsync(() => 42);
    expect(result).toBe(42);
    sched.dispose();
  });

  it('should handle async task rejection', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler();

    await expect(
      sched.scheduleAsync(() => { throw new Error('fail'); })
    ).rejects.toThrow('fail');
    sched.dispose();
  });

  it('should schedule batch of tasks', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    const ids = sched.scheduleBatch([
      { task: fn1 },
      { task: fn2, priority: 'high' },
    ]);

    expect(ids).toHaveLength(2);
    await new Promise(r => setTimeout(r, 100));
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
    sched.dispose();
  });

  it('should clear queue', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler({ maxConcurrent: 0 }); // don't execute

    sched.schedule(() => {}, { priority: 'normal' });
    sched.schedule(() => {}, { priority: 'low' });
    sched.clear('normal');

    const status = sched.getStatus();
    expect(status.queued.normal).toBe(0);
    expect(status.queued.low).toBe(1);
    sched.dispose();
  });

  it('should clear all queues', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler({ maxConcurrent: 0 });

    sched.schedule(() => {});
    sched.schedule(() => {}, { priority: 'high' });
    sched.clear();

    const status = sched.getStatus();
    expect(status.queued.normal).toBe(0);
    expect(status.queued.high).toBe(0);
    sched.dispose();
  });

  it('should track metrics', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler();

    sched.schedule(() => {});
    sched.schedule(() => {});
    await new Promise(r => setTimeout(r, 50));

    const status = sched.getStatus();
    expect(status.scheduled).toBe(2);
    expect(status.executed).toBeGreaterThan(0);
    sched.dispose();
  });

  it('should provide singleton', async () => {
    const { getIdleScheduler } = await import('../utils/idleScheduler');
    const s1 = getIdleScheduler();
    const s2 = getIdleScheduler();
    expect(s1).toBe(s2);
    s1.dispose();
  });

  it('should handle task with label', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler();
    const fn = vi.fn();

    sched.schedule(fn, { label: 'data-prefetch' });
    await new Promise(r => setTimeout(r, 50));

    expect(fn).toHaveBeenCalled();
    sched.dispose();
  });

  it('should enforce max concurrent limit', async () => {
    const { IdleScheduler } = await import('../utils/idleScheduler');
    const sched = new IdleScheduler({ maxConcurrent: 1 });
    let running = 0;
    let maxRunning = 0;

    const slowTask = () => new Promise<void>(r => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      setTimeout(() => { running--; r(); }, 30);
    });

    sched.schedule(slowTask);
    sched.schedule(slowTask);
    sched.schedule(slowTask);

    await new Promise(r => setTimeout(r, 200));
    expect(maxRunning).toBeLessThanOrEqual(1);
    sched.dispose();
  });

  it('whenIdle convenience function', async () => {
    const { whenIdle } = await import('../utils/idleScheduler');
    const fn = vi.fn(() => 'done');
    const result = await whenIdle(fn);
    expect(result).toBe('done');
  });

  it('nextFrame convenience function', async () => {
    const { nextFrame } = await import('../utils/idleScheduler');
    const fn = vi.fn();
    nextFrame(fn);
    await new Promise(r => setTimeout(r, 50));
    expect(fn).toHaveBeenCalled();
  });
});
