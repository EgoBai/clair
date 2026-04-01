import { describe, it, expect } from 'vitest';

/**
 * 任务调度器逻辑测试
 */

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface Task {
  id: string;
  name: string;
  priority: number;
  status: TaskStatus;
  scheduledAt: number;
  startedAt?: number;
  completedAt?: number;
  retries: number;
  maxRetries: number;
  result?: any;
  error?: string;
}

class TaskScheduler {
  private tasks: Task[] = [];
  private running = 0;

  addTask(name: string, priority = 0, maxRetries = 3): Task {
    const task: Task = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name, priority, status: 'pending', scheduledAt: Date.now(), retries: 0, maxRetries,
    };
    this.tasks.push(task);
    return task;
  }

  getNext(): Task | null {
    const pending = this.tasks.filter(t => t.status === 'pending');
    if (pending.length === 0) return null;
    pending.sort((a, b) => b.priority - a.priority || a.scheduledAt - b.scheduledAt);
    return pending[0];
  }

  startTask(taskId: string): boolean {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'pending') return false;
    task.status = 'running';
    task.startedAt = Date.now();
    this.running++;
    return true;
  }

  completeTask(taskId: string, result?: any): boolean {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'running') return false;
    task.status = 'completed';
    task.completedAt = Date.now();
    task.result = result;
    this.running--;
    return true;
  }

  failTask(taskId: string, error: string): boolean {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'running') return false;
    task.retries++;
    this.running--;
    if (task.retries < task.maxRetries) {
      task.status = 'pending';
      task.scheduledAt = Date.now() + task.retries * 1000;
    } else {
      task.status = 'failed';
      task.error = error;
    }
    return true;
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task || task.status === 'completed' || task.status === 'failed') return false;
    if (task.status === 'running') this.running--;
    task.status = 'cancelled';
    return true;
  }

  getStats(): { total: number; pending: number; running: number; completed: number; failed: number; cancelled: number; successRate: number } {
    const counts = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    this.tasks.forEach(t => { if (t.status in counts) counts[t.status as keyof typeof counts]++; });
    const resolved = counts.completed + counts.failed;
    return { total: this.tasks.length, ...counts, successRate: resolved > 0 ? counts.completed / resolved : 0 };
  }

  getQueue(): Task[] {
    return this.tasks.filter(t => t.status === 'pending').sort((a, b) => b.priority - a.priority);
  }
}

describe('任务调度器逻辑', () => {
  describe('TaskScheduler', () => {
    it('should add and retrieve tasks', () => {
      const scheduler = new TaskScheduler();
      const task = scheduler.addTask('test', 5);
      expect(task.name).toBe('test');
      expect(task.priority).toBe(5);
      expect(task.status).toBe('pending');
    });

    it('should return highest priority next', () => {
      const scheduler = new TaskScheduler();
      scheduler.addTask('low', 1);
      scheduler.addTask('high', 10);
      const next = scheduler.getNext();
      expect(next?.name).toBe('high');
    });

    it('should complete task lifecycle', () => {
      const scheduler = new TaskScheduler();
      const task = scheduler.addTask('test');
      expect(scheduler.startTask(task.id)).toBe(true);
      expect(task.status).toBe('running');
      expect(scheduler.completeTask(task.id, 'done')).toBe(true);
      expect(task.status).toBe('completed');
      expect(task.result).toBe('done');
    });

    it('should retry failed tasks', () => {
      const scheduler = new TaskScheduler();
      const task = scheduler.addTask('test', 0, 3);
      scheduler.startTask(task.id);
      scheduler.failTask(task.id, 'error');
      expect(task.status).toBe('pending');
      expect(task.retries).toBe(1);
    });

    it('should fail after max retries', () => {
      const scheduler = new TaskScheduler();
      const task = scheduler.addTask('test', 0, 2);
      scheduler.startTask(task.id);
      scheduler.failTask(task.id, 'e1');
      scheduler.startTask(task.id);
      scheduler.failTask(task.id, 'e2');
      expect(task.status).toBe('failed');
    });

    it('should cancel pending tasks', () => {
      const scheduler = new TaskScheduler();
      const task = scheduler.addTask('test');
      expect(scheduler.cancelTask(task.id)).toBe(true);
      expect(task.status).toBe('cancelled');
    });

    it('should track stats', () => {
      const scheduler = new TaskScheduler();
      scheduler.addTask('a');
      scheduler.addTask('b');
      const t = scheduler.addTask('c');
      scheduler.startTask(t.id);
      scheduler.completeTask(t.id);
      const stats = scheduler.getStats();
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(2);
    });

    it('should return null when queue empty', () => {
      const scheduler = new TaskScheduler();
      expect(scheduler.getNext()).toBeNull();
    });

    it('queue should sort by priority', () => {
      const scheduler = new TaskScheduler();
      scheduler.addTask('low', 1);
      scheduler.addTask('mid', 5);
      scheduler.addTask('high', 10);
      const queue = scheduler.getQueue();
      expect(queue[0].priority).toBe(10);
    });
  });
});
