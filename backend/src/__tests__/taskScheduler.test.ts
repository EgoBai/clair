import { describe, it, expect } from 'vitest';

// Task Scheduler
interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  handler: string;
  enabled: boolean;
  lastRun?: number;
  nextRun: number;
  runCount: number;
  errorCount: number;
  priority: number;
}

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

function parseCron(cron: string): CronParts | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

function matchesCronField(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field.includes(',')) {
    return field.split(',').some(p => matchesCronField(p.trim(), value));
  }
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    const stepNum = parseInt(step);
    if (range === '*') return value % stepNum === 0;
    const [start] = range.split('-').map(Number);
    return value >= start && (value - start) % stepNum === 0;
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }
  return parseInt(field) === value;
}

function createTask(name: string, handler: string, cron: string, priority = 5): ScheduledTask {
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    cronExpression: cron,
    handler,
    enabled: true,
    nextRun: 0,
    runCount: 0,
    errorCount: 0,
    priority,
  };
}

function sortTasksByPriority(tasks: ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort((a, b) => a.priority - b.priority);
}

function getTaskStats(tasks: ScheduledTask[]): {
  total: number;
  enabled: number;
  disabled: number;
  totalRuns: number;
  totalErrors: number;
  errorRate: number;
} {
  const enabled = tasks.filter(t => t.enabled).length;
  const totalRuns = tasks.reduce((s, t) => s + t.runCount, 0);
  const totalErrors = tasks.reduce((s, t) => s + t.errorCount, 0);
  return {
    total: tasks.length,
    enabled,
    disabled: tasks.length - enabled,
    totalRuns,
    totalErrors,
    errorRate: totalRuns > 0 ? totalErrors / totalRuns : 0,
  };
}

function getNextEnabledTask(tasks: ScheduledTask[]): ScheduledTask | null {
  const enabled = tasks.filter(t => t.enabled);
  if (enabled.length === 0) return null;
  return sortTasksByPriority(enabled)[0];
}

describe('Task Scheduler', () => {
  describe('parseCron', () => {
    it('should parse valid cron expression', () => {
      const parts = parseCron('*/5 * * * *');
      expect(parts).not.toBeNull();
      expect(parts?.minute).toBe('*/5');
      expect(parts?.hour).toBe('*');
    });

    it('should reject invalid cron expressions', () => {
      expect(parseCron('* * *')).toBeNull();
      expect(parseCron('* * * * * *')).toBeNull();
      expect(parseCron('')).toBeNull();
    });

    it('should parse specific times', () => {
      const parts = parseCron('30 9 * * 1-5');
      expect(parts?.minute).toBe('30');
      expect(parts?.hour).toBe('9');
      expect(parts?.dayOfWeek).toBe('1-5');
    });
  });

  describe('matchesCronField', () => {
    it('should match wildcard', () => {
      expect(matchesCronField('*', 0)).toBe(true);
      expect(matchesCronField('*', 59)).toBe(true);
    });

    it('should match exact value', () => {
      expect(matchesCronField('5', 5)).toBe(true);
      expect(matchesCronField('5', 6)).toBe(false);
    });

    it('should match range', () => {
      expect(matchesCronField('1-5', 3)).toBe(true);
      expect(matchesCronField('1-5', 1)).toBe(true);
      expect(matchesCronField('1-5', 5)).toBe(true);
      expect(matchesCronField('1-5', 6)).toBe(false);
    });

    it('should match step values', () => {
      expect(matchesCronField('*/5', 0)).toBe(true);
      expect(matchesCronField('*/5', 5)).toBe(true);
      expect(matchesCronField('*/5', 10)).toBe(true);
      expect(matchesCronField('*/5', 3)).toBe(false);
    });

    it('should match comma-separated values', () => {
      expect(matchesCronField('1,3,5', 3)).toBe(true);
      expect(matchesCronField('1,3,5', 2)).toBe(false);
    });

    it('should match range with step', () => {
      expect(matchesCronField('0-10/2', 0)).toBe(true);
      expect(matchesCronField('0-10/2', 4)).toBe(true);
      expect(matchesCronField('0-10/2', 3)).toBe(false);
    });
  });

  describe('createTask', () => {
    it('should create task with correct fields', () => {
      const task = createTask('Sync Data', 'syncHandler', '*/5 * * * *', 3);
      expect(task.name).toBe('Sync Data');
      expect(task.handler).toBe('syncHandler');
      expect(task.cronExpression).toBe('*/5 * * * *');
      expect(task.priority).toBe(3);
      expect(task.enabled).toBe(true);
      expect(task.runCount).toBe(0);
    });

    it('should generate unique IDs', () => {
      const t1 = createTask('A', 'h', '* * * * *');
      const t2 = createTask('B', 'h', '* * * * *');
      expect(t1.id).not.toBe(t2.id);
    });

    it('should default priority to 5', () => {
      const task = createTask('X', 'h', '* * * * *');
      expect(task.priority).toBe(5);
    });
  });

  describe('sortTasksByPriority', () => {
    it('should sort by priority ascending', () => {
      const tasks = [
        createTask('Low', 'h', '* * * * *', 10),
        createTask('High', 'h', '* * * * *', 1),
        createTask('Mid', 'h', '* * * * *', 5),
      ];
      const sorted = sortTasksByPriority(tasks);
      expect(sorted[0].name).toBe('High');
      expect(sorted[2].name).toBe('Low');
    });

    it('should not mutate original array', () => {
      const tasks = [createTask('B', 'h', '* * * * *', 2), createTask('A', 'h', '* * * * *', 1)];
      const sorted = sortTasksByPriority(tasks);
      expect(tasks[0].name).toBe('B');
      expect(sorted[0].name).toBe('A');
    });
  });

  describe('getTaskStats', () => {
    it('should calculate stats correctly', () => {
      const tasks: ScheduledTask[] = [
        { ...createTask('A', 'h', '* * * * *'), enabled: true, runCount: 100, errorCount: 5 },
        { ...createTask('B', 'h', '* * * * *'), enabled: false, runCount: 50, errorCount: 10 },
        { ...createTask('C', 'h', '* * * * *'), enabled: true, runCount: 200, errorCount: 0 },
      ];
      const stats = getTaskStats(tasks);
      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(2);
      expect(stats.disabled).toBe(1);
      expect(stats.totalRuns).toBe(350);
      expect(stats.totalErrors).toBe(15);
      expect(stats.errorRate).toBeCloseTo(15 / 350);
    });

    it('should handle empty task list', () => {
      const stats = getTaskStats([]);
      expect(stats.total).toBe(0);
      expect(stats.errorRate).toBe(0);
    });

    it('should handle zero runs', () => {
      const stats = getTaskStats([{ ...createTask('A', 'h', '* * * * *'), runCount: 0, errorCount: 0 }]);
      expect(stats.errorRate).toBe(0);
    });
  });

  describe('getNextEnabledTask', () => {
    it('should return highest priority enabled task', () => {
      const tasks = [
        { ...createTask('Low', 'h', '* * * * *', 10), enabled: true },
        { ...createTask('High', 'h', '* * * * *', 1), enabled: true },
        { ...createTask('Disabled', 'h', '* * * * *', 0), enabled: false },
      ];
      const next = getNextEnabledTask(tasks);
      expect(next?.name).toBe('High');
    });

    it('should return null when no enabled tasks', () => {
      const tasks = [{ ...createTask('X', 'h', '* * * * *'), enabled: false }];
      expect(getNextEnabledTask(tasks)).toBeNull();
    });

    it('should return null for empty list', () => {
      expect(getNextEnabledTask([])).toBeNull();
    });
  });
});
