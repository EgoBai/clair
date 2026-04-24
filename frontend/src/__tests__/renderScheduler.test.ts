import { describe, it, expect, vi } from 'vitest';
import {
  FrameBudgetManager,
  RenderScheduler,
  WorkChunker,
  RepaintScheduler,
} from '../utils/renderScheduler';

describe('FrameBudgetManager', () => {
  it('creates with default config', () => {
    const mgr = new FrameBudgetManager();
    expect(mgr.getBudgetPerFrame()).toBeCloseTo(16.67, 0);
  });

  it('creates with custom FPS', () => {
    const mgr = new FrameBudgetManager({ targetFPS: 30 });
    expect(mgr.getBudgetPerFrame()).toBeCloseTo(33.33, 0);
  });

  it('records frame stats', () => {
    const mgr = new FrameBudgetManager();
    const stats = mgr.recordFrame({
      startTime: 1000,
      endTime: 1010,
      duration: 10,
      tasksExecuted: 5,
      budgetRemaining: 6.67,
      overBudget: false,
    });
    expect(stats.frameNumber).toBe(0);
    expect(stats.duration).toBe(10);
  });

  it('calculates average FPS', () => {
    const mgr = new FrameBudgetManager();
    const base = 1000000;
    for (let i = 0; i < 60; i++) {
      mgr.recordFrame({
        startTime: base + i * 16.67,
        endTime: base + i * 16.67 + 10,
        duration: 10,
        tasksExecuted: 1,
        budgetRemaining: 6.67,
        overBudget: false,
      });
    }
    expect(mgr.getAverageFPS()).toBeGreaterThan(0);
  });

  it('calculates percentile', () => {
    const mgr = new FrameBudgetManager();
    for (let i = 0; i < 100; i++) {
      mgr.recordFrame({
        startTime: i * 16,
        endTime: i * 16 + i % 20,
        duration: i % 20,
        tasksExecuted: 1,
        budgetRemaining: 10,
        overBudget: i % 20 > 16,
      });
    }
    expect(mgr.getFrameTimePercentile(0.5)).toBeGreaterThanOrEqual(0);
    expect(mgr.getFrameTimePercentile(0.95)).toBeGreaterThanOrEqual(0);
    expect(mgr.getFrameTimePercentile(0.99)).toBeGreaterThanOrEqual(0);
  });

  it('detects good performance', () => {
    const mgr = new FrameBudgetManager({ warningThreshold: 15 });
    for (let i = 0; i < 60; i++) {
      mgr.recordFrame({
        startTime: i * 16,
        endTime: i * 16 + 5,
        duration: 5,
        tasksExecuted: 1,
        budgetRemaining: 11,
        overBudget: false,
      });
    }
    expect(mgr.isPerformanceGood()).toBe(true);
  });

  it('generates report', () => {
    const mgr = new FrameBudgetManager();
    for (let i = 0; i < 30; i++) {
      mgr.recordFrame({
        startTime: i * 16,
        endTime: i * 16 + 10,
        duration: 10,
        tasksExecuted: 2,
        budgetRemaining: 6,
        overBudget: false,
      });
    }
    const report = mgr.getReport();
    expect(report.totalFrames).toBe(30);
    expect(report.droppedFrames).toBe(0);
    expect(report.avgFPS).toBeGreaterThan(0);
  });

  it('resets properly', () => {
    const mgr = new FrameBudgetManager();
    mgr.recordFrame({ startTime: 0, endTime: 10, duration: 10, tasksExecuted: 1, budgetRemaining: 6, overBudget: false });
    mgr.reset();
    expect(mgr.getReport().totalFrames).toBe(0);
  });
});

describe('RenderScheduler', () => {
  it('schedules and executes tasks', () => {
    const scheduler = new RenderScheduler(100);
    let called = false;
    scheduler.schedule(() => { called = true; }, { priority: 'immediate' });
    const result = scheduler.executeFrame();
    expect(called).toBe(true);
    expect(result.executed).toBe(1);
  });

  it('respects priority order', () => {
    const scheduler = new RenderScheduler(100);
    const order: string[] = [];
    scheduler.schedule(() => order.push('low'), { priority: 'low' });
    scheduler.schedule(() => order.push('high'), { priority: 'high' });
    scheduler.schedule(() => order.push('normal'), { priority: 'normal' });
    scheduler.executeFrame();
    expect(order).toEqual(['high', 'normal', 'low']);
  });

  it('cancels tasks', () => {
    const scheduler = new RenderScheduler(100);
    const id = scheduler.schedule(() => {}, { priority: 'normal' });
    expect(scheduler.getQueueLength()).toBe(1);
    expect(scheduler.cancel(id)).toBe(true);
    expect(scheduler.getQueueLength()).toBe(0);
  });

  it('returns false for unknown cancel', () => {
    const scheduler = new RenderScheduler();
    expect(scheduler.cancel('nonexistent')).toBe(false);
  });

  it('tracks queue by priority', () => {
    const scheduler = new RenderScheduler();
    scheduler.schedule(() => {}, { priority: 'immediate' });
    scheduler.schedule(() => {}, { priority: 'high' });
    scheduler.schedule(() => {}, { priority: 'normal' });
    scheduler.schedule(() => {}, { priority: 'normal' });
    const counts = scheduler.getQueueByPriority();
    expect(counts.immediate).toBe(1);
    expect(counts.high).toBe(1);
    expect(counts.normal).toBe(2);
  });

  it('skips expired tasks', async () => {
    const scheduler = new RenderScheduler(100);
    let called = false;
    scheduler.schedule(() => { called = true; }, { deadline: 1 }); // 1ms deadline
    await new Promise(resolve => setTimeout(resolve, 10)); // wait for deadline
    const result = scheduler.executeFrame();
    expect(called).toBe(false);
    expect(result.skipped).toBe(1);
  });

  it('handles recurring tasks', () => {
    const scheduler = new RenderScheduler(100);
    let count = 0;
    scheduler.schedule(() => { count++; }, { maxRuns: 3 });
    scheduler.executeFrame();
    scheduler.executeFrame();
    scheduler.executeFrame();
    expect(count).toBe(3);
  });

  it('handles errors gracefully', () => {
    const scheduler = new RenderScheduler(100);
    scheduler.schedule(() => { throw new Error('fail'); });
    scheduler.schedule(() => {}); // should still execute
    const result = scheduler.executeFrame();
    expect(result.executed).toBe(2);
  });

  it('clears all tasks', () => {
    const scheduler = new RenderScheduler();
    scheduler.schedule(() => {});
    scheduler.schedule(() => {});
    scheduler.clear();
    expect(scheduler.getQueueLength()).toBe(0);
  });
});

describe('WorkChunker', () => {
  it('chunks array into pieces', () => {
    const chunker = new WorkChunker({ chunkSize: 3 });
    const chunks = [...chunker.chunkArray([1, 2, 3, 4, 5, 6, 7])];
    expect(chunks).toHaveLength(3);
    expect(chunks[0].chunk).toEqual([1, 2, 3]);
    expect(chunks[1].chunk).toEqual([4, 5, 6]);
    expect(chunks[2].chunk).toEqual([7]);
  });

  it('tracks chunk index and total', () => {
    const chunker = new WorkChunker({ chunkSize: 2 });
    const chunks = [...chunker.chunkArray([1, 2, 3, 4, 5])];
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].total).toBe(3);
    expect(chunks[2].index).toBe(2);
  });

  it('handles empty array', () => {
    const chunker = new WorkChunker();
    const chunks = [...chunker.chunkArray([])];
    expect(chunks).toHaveLength(0);
  });

  it('processes chunked async', async () => {
    const chunker = new WorkChunker({ chunkSize: 2 });
    const progress: number[] = [];
    const result = await chunker.processChunked(
      [1, 2, 3, 4, 5],
      (item) => item * 2,
      (done, total) => progress.push(done / total)
    );
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(progress.length).toBeGreaterThan(0);
  });
});

describe('RepaintScheduler', () => {
  it('tracks dirty regions', () => {
    const scheduler = new RepaintScheduler();
    scheduler.markDirty('chart-1');
    scheduler.markDirty('chart-2');
    expect(scheduler.getDirtyRegions()).toContain('chart-1');
    expect(scheduler.getDirtyRegions()).toContain('chart-2');
  });

  it('registers repaint callbacks', () => {
    const scheduler = new RepaintScheduler();
    let called = false;
    scheduler.onRepaint('region-1', () => { called = true; });
    scheduler.markDirty('region-1');
    expect(scheduler.getDirtyRegions()).toContain('region-1');
  });

  it('removes repaint handlers', () => {
    const scheduler = new RepaintScheduler();
    scheduler.onRepaint('r1', () => {});
    scheduler.markDirty('r1');
    scheduler.removeRepaint('r1');
    expect(scheduler.getDirtyRegions()).not.toContain('r1');
  });
});
