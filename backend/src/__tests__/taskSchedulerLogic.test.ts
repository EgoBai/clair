import { describe, it, expect } from 'vitest';

/**
 * 任务调度引擎逻辑测试
 * TaskScheduler 优先级/并发/重试/超时逻辑
 */

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

interface TaskDescriptor {
  id: string;
  name: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  retries: number;
  maxRetries: number;
  startedAt?: number;
  completedAt?: number;
}

function sortTasksByPriority(tasks: TaskDescriptor[]): TaskDescriptor[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority];
    const pb = PRIORITY_ORDER[b.priority];
    if (pa !== pb) return pa - pb;
    return a.createdAt - b.createdAt;
  });
}

function canExecuteMore(running: number, concurrency: number): boolean {
  return running < concurrency;
}

function shouldRetry(task: TaskDescriptor): boolean {
  return task.retries < task.maxRetries && task.status !== 'cancelled';
}

function calcRetryDelay(baseDelay: number, attempt: number): number {
  return baseDelay * (attempt + 1); // Linear backoff
}

function calcTaskDuration(task: TaskDescriptor): number | null {
  if (!task.startedAt || !task.completedAt) return null;
  return task.completedAt - task.startedAt;
}

function groupTasksByStatus(tasks: TaskDescriptor[]): Record<TaskStatus, TaskDescriptor[]> {
  const groups: Record<TaskStatus, TaskDescriptor[]> = {
    pending: [], running: [], completed: [], failed: [], cancelled: [],
  };
  for (const t of tasks) {
    groups[t.status].push(t);
  }
  return groups;
}

function calcStats(tasks: TaskDescriptor[]): {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number;
  avgDuration: number | null;
} {
  const groups = groupTasksByStatus(tasks);
  const completedTasks = groups.completed;
  const finishedTasks = [...groups.completed, ...groups.failed];

  const durations = finishedTasks
    .map(t => calcTaskDuration(t))
    .filter((d): d is number => d !== null);

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;

  return {
    total: tasks.length,
    pending: groups.pending.length,
    running: groups.running.length,
    completed: groups.completed.length,
    failed: groups.failed.length,
    cancelled: groups.cancelled.length,
    successRate: finishedTasks.length > 0 ? completedTasks.length / finishedTasks.length : 0,
    avgDuration,
  };
}

function getNextRunnableTask(
  tasks: TaskDescriptor[],
  runningCount: number,
  concurrency: number
): TaskDescriptor | null {
  if (runningCount >= concurrency) return null;
  const pending = tasks.filter(t => t.status === 'pending');
  if (pending.length === 0) return null;
  const sorted = sortTasksByPriority(pending);
  return sorted[0];
}

function validateConcurrency(concurrency: number): { valid: boolean; reason?: string } {
  if (!Number.isInteger(concurrency)) return { valid: false, reason: 'must be integer' };
  if (concurrency < 1) return { valid: false, reason: 'must be >= 1' };
  if (concurrency > 100) return { valid: false, reason: 'must be <= 100' };
  return { valid: true };
}

function validateMaxRetries(maxRetries: number): { valid: boolean; reason?: string } {
  if (!Number.isInteger(maxRetries)) return { valid: false, reason: 'must be integer' };
  if (maxRetries < 0) return { valid: false, reason: 'must be >= 0' };
  if (maxRetries > 10) return { valid: false, reason: 'must be <= 10' };
  return { valid: true };
}

function estimateCompletionTime(
  pendingCount: number,
  avgDuration: number,
  concurrency: number
): number {
  if (concurrency <= 0 || avgDuration <= 0) return Infinity;
  const batches = Math.ceil(pendingCount / concurrency);
  return batches * avgDuration;
}

function shouldTimeout(startedAt: number, timeout: number, now: number): boolean {
  return now - startedAt > timeout;
}

function buildTaskId(counter: number): string {
  return `task-${counter}`;
}

describe('任务调度引擎逻辑', () => {
  const mockTasks: TaskDescriptor[] = [
    { id: 'task-1', name: 'fetch data', priority: 'high', status: 'pending', createdAt: 100, retries: 0, maxRetries: 3 },
    { id: 'task-2', name: 'process', priority: 'normal', status: 'running', createdAt: 200, retries: 0, maxRetries: 3, startedAt: 250 },
    { id: 'task-3', name: 'report', priority: 'low', status: 'completed', createdAt: 50, retries: 0, maxRetries: 3, startedAt: 60, completedAt: 150 },
    { id: 'task-4', name: 'backup', priority: 'critical', status: 'pending', createdAt: 150, retries: 0, maxRetries: 2 },
    { id: 'task-5', name: 'cleanup', priority: 'normal', status: 'failed', createdAt: 80, retries: 3, maxRetries: 3, startedAt: 90, completedAt: 200 },
  ];

  describe('sortTasksByPriority', () => {
    it('should sort by priority then createdAt', () => {
      const pending = mockTasks.filter(t => t.status === 'pending');
      const sorted = sortTasksByPriority(pending);
      expect(sorted[0].priority).toBe('critical'); // task-4
      expect(sorted[1].priority).toBe('high'); // task-1
    });

    it('should handle same priority by createdAt', () => {
      const tasks: TaskDescriptor[] = [
        { id: 'a', name: '', priority: 'normal', status: 'pending', createdAt: 200, retries: 0, maxRetries: 0 },
        { id: 'b', name: '', priority: 'normal', status: 'pending', createdAt: 100, retries: 0, maxRetries: 0 },
      ];
      const sorted = sortTasksByPriority(tasks);
      expect(sorted[0].id).toBe('b');
    });

    it('should not mutate original', () => {
      const original = [...mockTasks];
      sortTasksByPriority(mockTasks);
      expect(mockTasks.map(t => t.id)).toEqual(original.map(t => t.id));
    });
  });

  describe('canExecuteMore', () => {
    it('should return true below concurrency', () => {
      expect(canExecuteMore(2, 4)).toBe(true);
    });

    it('should return false at concurrency', () => {
      expect(canExecuteMore(4, 4)).toBe(false);
    });

    it('should return false above concurrency', () => {
      expect(canExecuteMore(5, 4)).toBe(false);
    });
  });

  describe('shouldRetry', () => {
    it('should allow retry when under max', () => {
      expect(shouldRetry(mockTasks[0])).toBe(true); // retries=0, max=3
    });

    it('should deny retry at max', () => {
      expect(shouldRetry(mockTasks[4])).toBe(false); // retries=3, max=3
    });

    it('should deny retry for cancelled', () => {
      const task: TaskDescriptor = { ...mockTasks[0], status: 'cancelled' };
      expect(shouldRetry(task)).toBe(false);
    });
  });

  describe('calcRetryDelay', () => {
    it('should use linear backoff', () => {
      expect(calcRetryDelay(1000, 0)).toBe(1000);
      expect(calcRetryDelay(1000, 1)).toBe(2000);
      expect(calcRetryDelay(1000, 2)).toBe(3000);
    });
  });

  describe('calcTaskDuration', () => {
    it('should calculate duration', () => {
      expect(calcTaskDuration(mockTasks[2])).toBe(90); // 150 - 60
    });

    it('should return null if incomplete', () => {
      expect(calcTaskDuration(mockTasks[0])).toBeNull();
    });
  });

  describe('groupTasksByStatus', () => {
    it('should group all statuses', () => {
      const groups = groupTasksByStatus(mockTasks);
      expect(groups.pending).toHaveLength(2);
      expect(groups.running).toHaveLength(1);
      expect(groups.completed).toHaveLength(1);
      expect(groups.failed).toHaveLength(1);
    });
  });

  describe('calcStats', () => {
    it('should calculate correct stats', () => {
      const stats = calcStats(mockTasks);
      expect(stats.total).toBe(5);
      expect(stats.successRate).toBe(0.5); // 1 completed / 2 finished
    });

    it('should calculate average duration', () => {
      const stats = calcStats(mockTasks);
      expect(stats.avgDuration).toBeGreaterThan(0);
    });
  });

  describe('getNextRunnableTask', () => {
    it('should return highest priority pending', () => {
      const next = getNextRunnableTask(mockTasks, 1, 4);
      expect(next?.priority).toBe('critical');
    });

    it('should return null at concurrency', () => {
      expect(getNextRunnableTask(mockTasks, 4, 4)).toBeNull();
    });

    it('should return null with no pending', () => {
      const tasks = mockTasks.filter(t => t.status !== 'pending');
      expect(getNextRunnableTask(tasks, 0, 4)).toBeNull();
    });
  });

  describe('validateConcurrency', () => {
    it('should accept valid values', () => {
      expect(validateConcurrency(1).valid).toBe(true);
      expect(validateConcurrency(4).valid).toBe(true);
      expect(validateConcurrency(100).valid).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(validateConcurrency(0).valid).toBe(false);
      expect(validateConcurrency(-1).valid).toBe(false);
      expect(validateConcurrency(101).valid).toBe(false);
      expect(validateConcurrency(1.5).valid).toBe(false);
    });
  });

  describe('validateMaxRetries', () => {
    it('should accept valid values', () => {
      expect(validateMaxRetries(0).valid).toBe(true);
      expect(validateMaxRetries(3).valid).toBe(true);
      expect(validateMaxRetries(10).valid).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(validateMaxRetries(-1).valid).toBe(false);
      expect(validateMaxRetries(11).valid).toBe(false);
    });
  });

  describe('estimateCompletionTime', () => {
    it('should estimate based on batch count', () => {
      expect(estimateCompletionTime(10, 100, 2)).toBe(500); // 5 batches * 100ms
    });

    it('should handle exact batch fit', () => {
      expect(estimateCompletionTime(8, 100, 4)).toBe(200);
    });

    it('should return Infinity for invalid inputs', () => {
      expect(estimateCompletionTime(10, 100, 0)).toBe(Infinity);
      expect(estimateCompletionTime(10, 0, 2)).toBe(Infinity);
    });
  });

  describe('shouldTimeout', () => {
    it('should return true when exceeded', () => {
      expect(shouldTimeout(100, 1000, 2000)).toBe(true);
    });

    it('should return false when within', () => {
      expect(shouldTimeout(100, 1000, 500)).toBe(false);
    });
  });

  describe('buildTaskId', () => {
    it('should format counter into id', () => {
      expect(buildTaskId(1)).toBe('task-1');
      expect(buildTaskId(42)).toBe('task-42');
    });
  });
});
