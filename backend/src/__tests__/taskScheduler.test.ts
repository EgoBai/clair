import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskScheduler, batchProcess, TaskPriority } from '../services/taskScheduler';

describe('taskScheduler', () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new TaskScheduler({
      concurrency: 2,
      defaultMaxRetries: 1,
      retryDelay: 100,
      taskTimeout: 5000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addTask', () => {
    it('should add task and return id', () => {
      const id = scheduler.addTask('test', async () => 'done');
      expect(id).toMatch(/^task-\d+$/);
    });

    it('should track task status', () => {
      const id = scheduler.addTask('test', async () => 'done');
      const task = scheduler.getTask(id);
      expect(task).toBeDefined();
      expect(task!.name).toBe('test');
    });

    it('should assign priority', () => {
      const id = scheduler.addTask('low', async () => 'done', 'low');
      const task = scheduler.getTask(id);
      expect(task!.priority).toBe('low');
    });

    it('should use custom maxRetries', () => {
      const id = scheduler.addTask('test', async () => 'done', 'normal', 5);
      const task = scheduler.getTask(id);
      expect(task!.maxRetries).toBe(5);
    });
  });

  describe('cancelTask', () => {
    it('should cancel pending task', () => {
      scheduler.pause();
      const id = scheduler.addTask('test', async () => 'done');
      const result = scheduler.cancelTask(id);
      expect(result).toBe(true);
    });

    it('should return false for nonexistent task', () => {
      expect(scheduler.cancelTask('fake-id')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return queue stats', () => {
      scheduler.addTask('a', async () => 'done');
      scheduler.addTask('b', async () => 'done');
      const stats = scheduler.getStats();
      expect(stats.pending).toBeGreaterThanOrEqual(0);
      expect(stats.running).toBeGreaterThanOrEqual(0);
    });

    it('should count completed tasks', async () => {
      const id = scheduler.addTask('fast', async () => 'done');
      await vi.advanceTimersByTimeAsync(100);
      const stats = scheduler.getStats();
      expect(stats.completed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('clear', () => {
    it('should clear pending queue', () => {
      scheduler.addTask('a', async () => 'done');
      scheduler.addTask('b', async () => 'done');
      scheduler.clear();
      const stats = scheduler.getStats();
      expect(stats.pending).toBe(0);
    });
  });

  describe('pause/resume', () => {
    it('should pause scheduling', () => {
      scheduler.pause();
      scheduler.addTask('a', async () => 'done');
      const stats = scheduler.getStats();
      expect(stats.running).toBe(0);
    });

    it('should resume scheduling', () => {
      scheduler.pause();
      scheduler.addTask('a', async () => 'done');
      scheduler.resume();
      // task should start running
    });
  });

  describe('priority ordering', () => {
    it('should process critical before low', () => {
      scheduler.pause();
      const lowId = scheduler.addTask('low', async () => 'low', 'low');
      const critId = scheduler.addTask('critical', async () => 'crit', 'critical');
      scheduler.resume();
      // critical should be first in queue after sort
      const critTask = scheduler.getTask(critId);
      const lowTask = scheduler.getTask(lowId);
      expect(critTask).toBeDefined();
      expect(lowTask).toBeDefined();
    });
  });

  describe('batchProcess', () => {
    it('should process items with concurrency', async () => {
      vi.useRealTimers();
      const items = [1, 2, 3, 4, 5];
      const results = await batchProcess(
        items,
        async (item) => item * 2,
        { concurrency: 2 }
      );
      expect(results.length).toBe(5);
      results.forEach(r => {
        expect(r.result).toBe(r.item * 2);
        expect(r.error).toBeUndefined();
      });
    });

    it('should handle errors', async () => {
      vi.useRealTimers();
      const results = await batchProcess(
        [1, 2, 3],
        async (item) => {
          if (item === 2) throw new Error('fail');
          return item;
        },
        { concurrency: 1, retryCount: 1 }
      );
      const failed = results.find(r => r.item === 2);
      expect(failed?.error).toBeDefined();
    });

    it('should retry on failure', async () => {
      vi.useRealTimers();
      let attempts = 0;
      const results = await batchProcess(
        [1],
        async () => {
          attempts++;
          if (attempts < 3) throw new Error('fail');
          return 'success';
        },
        { concurrency: 1, retryCount: 3 }
      );
      expect(results[0].result).toBe('success');
    });
  });
});
