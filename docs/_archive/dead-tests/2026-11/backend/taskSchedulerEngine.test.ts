import { describe, it, expect, beforeEach } from 'vitest';

// 任务调度器引擎
interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  handler: () => Promise<any>;
  enabled: boolean;
  lastRun: number | null;
  nextRun: number | null;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  status: 'idle' | 'running' | 'failed' | 'completed';
}

function parseCronField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  const result: number[] = [];

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const stepNum = parseInt(step);
      const rangeStart = range === '*' ? min : parseInt(range);
      for (let i = rangeStart; i <= max; i += stepNum) {
        result.push(i);
      }
    } else if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
    } else {
      result.push(parseInt(part));
    }
  }

  return [...new Set(result)].sort((a, b) => a - b);
}

function parseCronExpression(expr: string): { minutes: number[]; hours: number[]; days: number[]; months: number[]; weekdays: number[] } {
  const parts = expr.split(' ');
  if (parts.length !== 5) throw new Error('Invalid cron expression');

  return {
    minutes: parseCronField(parts[0], 0, 59),
    hours: parseCronField(parts[1], 0, 23),
    days: parseCronField(parts[2], 1, 31),
    months: parseCronField(parts[3], 1, 12),
    weekdays: parseCronField(parts[4], 0, 6),
  };
}

function getNextRunTime(cronExpr: string, fromTime: Date): Date {
  const cron = parseCronExpression(cronExpr);
  const next = new Date(fromTime.getTime());
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1); // 至少下一分钟

  // 最多搜索未来365天
  for (let i = 0; i < 365 * 24 * 60; i++) {
    if (
      cron.minutes.includes(next.getMinutes()) &&
      cron.hours.includes(next.getHours()) &&
      cron.days.includes(next.getDate()) &&
      cron.months.includes(next.getMonth() + 1) &&
      cron.weekdays.includes(next.getDay())
    ) {
      return new Date(next);
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  throw new Error('Cannot find next run time within 365 days');
}

function validateCronExpression(expr: string): { valid: boolean; error?: string } {
  try {
    const parts = expr.split(' ');
    if (parts.length !== 5) return { valid: false, error: 'Must have 5 fields' };

    const validators = [
      { field: 'minute', range: [0, 59] },
      { field: 'hour', range: [0, 23] },
      { field: 'day', range: [1, 31] },
      { field: 'month', range: [1, 12] },
      { field: 'weekday', range: [0, 6] },
    ];

    for (let i = 0; i < 5; i++) {
      const field = parts[i];
      if (field === '*') continue;

      for (const part of field.split(',')) {
        if (part.includes('/')) {
          const [range, step] = part.split('/');
          const stepNum = parseInt(step);
          if (isNaN(stepNum) || stepNum <= 0) return { valid: false, error: `Invalid step in ${validators[i].field}` };
        } else if (part.includes('-')) {
          const [start, end] = part.split('-').map(Number);
          if (isNaN(start) || isNaN(end) || start > end) return { valid: false, error: `Invalid range in ${validators[i].field}` };
          if (start < validators[i].range[0] || end > validators[i].range[1]) {
            return { valid: false, error: `${validators[i].field} out of range [${validators[i].range}]` };
          }
        } else {
          const num = parseInt(part);
          if (isNaN(num) || num < validators[i].range[0] || num > validators[i].range[1]) {
            return { valid: false, error: `${validators[i].field} ${num} out of range` };
          }
        }
      }
    }

    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

class TaskQueue {
  private queue: { priority: number; task: ScheduledTask }[] = [];
  private running: Map<string, ScheduledTask> = new Map();
  private maxConcurrent: number;

  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(task: ScheduledTask, priority = 0): void {
    this.queue.push({ priority, task });
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  dequeue(): ScheduledTask | null {
    if (this.running.size >= this.maxConcurrent) return null;
    const item = this.queue.shift();
    if (!item) return null;
    this.running.set(item.task.id, item.task);
    return item.task;
  }

  complete(taskId: string): void {
    this.running.delete(taskId);
  }

  fail(taskId: string): ScheduledTask | null {
    const task = this.running.get(taskId);
    this.running.delete(taskId);
    if (task && task.retryCount < task.maxRetries) {
      task.retryCount++;
      this.enqueue(task, task.retryCount); // 重试提高优先级
      return task;
    }
    return null;
  }

  getQueueSize(): number { return this.queue.length; }
  getRunningCount(): number { return this.running.size; }
  isRunning(taskId: string): boolean { return this.running.has(taskId); }

  clear(): void {
    this.queue = [];
    this.running.clear();
  }
}

describe('任务调度器引擎', () => {
  describe('parseCronField', () => {
    it('*应该返回全部范围', () => {
      const result = parseCronField('*', 0, 59);
      expect(result).toHaveLength(60);
      expect(result[0]).toBe(0);
      expect(result[59]).toBe(59);
    });

    it('单个数字', () => {
      expect(parseCronField('5', 0, 59)).toEqual([5]);
    });

    it('逗号分隔', () => {
      expect(parseCronField('1,5,10', 0, 59)).toEqual([1, 5, 10]);
    });

    it('范围', () => {
      expect(parseCronField('1-5', 0, 59)).toEqual([1, 2, 3, 4, 5]);
    });

    it('步长', () => {
      const result = parseCronField('*/15', 0, 59);
      expect(result).toEqual([0, 15, 30, 45]);
    });

    it('步长从指定值开始', () => {
      const result = parseCronField('5/10', 0, 59);
      expect(result).toContain(5);
      expect(result).toContain(15);
      expect(result).toContain(25);
    });

    it('去重', () => {
      expect(parseCronField('1,1,2', 0, 59)).toEqual([1, 2]);
    });
  });

  describe('parseCronExpression', () => {
    it('应该解析5字段表达式', () => {
      const result = parseCronExpression('0 9 * * 1-5');
      expect(result.minutes).toEqual([0]);
      expect(result.hours).toEqual([9]);
      expect(result.weekdays).toEqual([1, 2, 3, 4, 5]);
    });

    it('应该解析通配符', () => {
      const result = parseCronExpression('* * * * *');
      expect(result.minutes).toHaveLength(60);
      expect(result.hours).toHaveLength(24);
    });

    it('无效表达式应该抛错', () => {
      expect(() => parseCronExpression('* * *')).toThrow();
    });

    it('应该解析复杂表达式', () => {
      const result = parseCronExpression('0,30 9-17 */2 * 1-5');
      expect(result.minutes).toEqual([0, 30]);
      expect(result.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });
  });

  describe('validateCronExpression', () => {
    it('有效表达式应该通过', () => {
      expect(validateCronExpression('0 9 * * 1-5').valid).toBe(true);
      expect(validateCronExpression('* * * * *').valid).toBe(true);
      expect(validateCronExpression('*/5 */2 1-15 1,6 0,6').valid).toBe(true);
    });

    it('字段数不对应该失败', () => {
      expect(validateCronExpression('* * *').valid).toBe(false);
    });

    it('超出范围应该失败', () => {
      expect(validateCronExpression('60 * * * *').valid).toBe(false); // 分钟最大59
      expect(validateCronExpression('* 24 * * *').valid).toBe(false); // 小时最大23
      expect(validateCronExpression('* * 0 * *').valid).toBe(false);  // 日最小1
      expect(validateCronExpression('* * * 13 *').valid).toBe(false); // 月最大12
      expect(validateCronExpression('* * * * 7').valid).toBe(false);  // 星期最大6
    });

    it('无效范围应该失败', () => {
      expect(validateCronExpression('5-3 * * * *').valid).toBe(false);
    });

    it('无效步长应该失败', () => {
      expect(validateCronExpression('*/0 * * * *').valid).toBe(false);
    });
  });

  describe('getNextRunTime', () => {
    it('每分钟任务应该在下一分钟', () => {
      const from = new Date('2024-01-15T10:30:00');
      const next = getNextRunTime('* * * * *', from);
      expect(next.getMinutes()).toBe(31);
      expect(next.getHours()).toBe(10);
    });

    it('每天9点任务应该在当天或次日9点', () => {
      const from = new Date('2024-01-15T08:00:00');
      const next = getNextRunTime('0 9 * * *', from);
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it('工作日任务不应该在周末', () => {
      // 2024-01-13是周六
      const from = new Date('2024-01-13T08:00:00');
      const next = getNextRunTime('0 9 * * 1-5', from);
      expect(next.getDay()).not.toBe(0);
      expect(next.getDay()).not.toBe(6);
    });

    it('特定时间应该正确', () => {
      const from = new Date('2024-01-15T10:00:00');
      const next = getNextRunTime('30 14 * * *', from);
      expect(next.getHours()).toBe(14);
      expect(next.getMinutes()).toBe(30);
    });
  });

  describe('TaskQueue', () => {
    let queue: TaskQueue;

    const makeTask = (id: string): ScheduledTask => ({
      id, name: `Task ${id}`, cronExpression: '* * * * *',
      handler: async () => {}, enabled: true,
      lastRun: null, nextRun: null, retryCount: 0,
      maxRetries: 3, timeout: 5000, status: 'idle',
    });

    beforeEach(() => {
      queue = new TaskQueue(3);
    });

    it('应该按优先级出队', () => {
      queue.enqueue(makeTask('low'), 1);
      queue.enqueue(makeTask('high'), 10);
      const task = queue.dequeue();
      expect(task!.id).toBe('high');
    });

    it('应该限制并发数', () => {
      queue.enqueue(makeTask('1'));
      queue.enqueue(makeTask('2'));
      queue.enqueue(makeTask('3'));
      queue.enqueue(makeTask('4'));
      queue.dequeue();
      queue.dequeue();
      queue.dequeue();
      expect(queue.dequeue()).toBeNull(); // 第4个不出队，已满
      expect(queue.getRunningCount()).toBe(3);
    });

    it('完成任务应该释放槽位', () => {
      queue.enqueue(makeTask('1'));
      queue.enqueue(makeTask('2'));
      queue.dequeue();
      queue.complete('1');
      expect(queue.getRunningCount()).toBe(0);
      expect(queue.dequeue()).not.toBeNull();
    });

    it('失败任务应该重试', () => {
      const task = makeTask('1');
      task.maxRetries = 2;
      queue.enqueue(task);
      queue.dequeue();
      queue.fail('1');
      expect(queue.getQueueSize()).toBe(1); // 重新入队
    });

    it('超过重试次数应该不再入队', () => {
      const task = makeTask('1');
      task.maxRetries = 0;
      task.retryCount = 0;
      queue.enqueue(task);
      queue.dequeue();
      queue.fail('1');
      expect(queue.getQueueSize()).toBe(0);
    });

    it('clear应该清空所有', () => {
      queue.enqueue(makeTask('1'));
      queue.enqueue(makeTask('2'));
      queue.clear();
      expect(queue.getQueueSize()).toBe(0);
      expect(queue.getRunningCount()).toBe(0);
    });

    it('isRunning应该正确反映状态', () => {
      queue.enqueue(makeTask('1'));
      queue.dequeue();
      expect(queue.isRunning('1')).toBe(true);
      queue.complete('1');
      expect(queue.isRunning('1')).toBe(false);
    });

    it('空队列出队应该返回null', () => {
      expect(queue.dequeue()).toBeNull();
    });

    it('应该处理大量任务', () => {
      for (let i = 0; i < 100; i++) {
        queue.enqueue(makeTask(`task-${i}`), Math.floor(Math.random() * 10));
      }
      expect(queue.getQueueSize()).toBe(100);
    });
  });
});
