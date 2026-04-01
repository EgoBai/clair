/**
 * 后端任务调度器测试
 * 覆盖定时任务、依赖管理、重试机制
 */

import { describe, it, expect } from 'vitest';

describe('任务调度器', () => {
  describe('Cron 表达式解析', () => {
    function parseCron(expr: string): { minutes: number[]; hours: number[]; error?: string } {
      const parts = expr.split(' ');
      if (parts.length < 2) return { minutes: [], hours: [], error: '无效cron表达式' };

      function parseField(field: string, max: number): number[] {
        if (field === '*') return Array.from({ length: max }, (_, i) => i);
        if (field.includes('/')) {
          const [, step] = field.split('/');
          const s = parseInt(step, 10);
          return Array.from({ length: Math.ceil(max / s) }, (_, i) => i * s);
        }
        if (field.includes(',')) return field.split(',').map(Number);
        const n = parseInt(field, 10);
        return isNaN(n) ? [] : [n];
      }

      return {
        minutes: parseField(parts[0], 60),
        hours: parseField(parts[1], 24),
      };
    }

    it('应解析通配符', () => {
      const result = parseCron('* *');
      expect(result.minutes).toHaveLength(60);
      expect(result.hours).toHaveLength(24);
    });

    it('应解析步长', () => {
      const result = parseCron('*/5 */2');
      expect(result.minutes).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
      expect(result.hours).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
    });

    it('应解析具体值', () => {
      const result = parseCron('30 9');
      expect(result.minutes).toEqual([30]);
      expect(result.hours).toEqual([9]);
    });
  });

  describe('任务优先级队列', () => {
    interface Task {
      id: string;
      priority: number;
      createdAt: number;
    }

    class PriorityQueue {
      private tasks: Task[] = [];

      enqueue(task: Task): void {
        this.tasks.push(task);
        this.tasks.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
      }

      dequeue(): Task | null {
        return this.tasks.shift() || null;
      }

      size(): number {
        return this.tasks.length;
      }
    }

    it('高优先级应先出队', () => {
      const pq = new PriorityQueue();
      pq.enqueue({ id: 'low', priority: 1, createdAt: 1 });
      pq.enqueue({ id: 'high', priority: 10, createdAt: 2 });
      pq.enqueue({ id: 'mid', priority: 5, createdAt: 3 });

      expect(pq.dequeue()?.id).toBe('high');
      expect(pq.dequeue()?.id).toBe('mid');
      expect(pq.dequeue()?.id).toBe('low');
    });

    it('同优先级按创建时间排序', () => {
      const pq = new PriorityQueue();
      pq.enqueue({ id: 'later', priority: 5, createdAt: 2 });
      pq.enqueue({ id: 'earlier', priority: 5, createdAt: 1 });
      expect(pq.dequeue()?.id).toBe('earlier');
    });
  });

  describe('任务重试机制', () => {
    function shouldRetry(attempt: number, maxRetries: number, error: string): boolean {
      if (attempt >= maxRetries) return false;
      const nonRetryable = ['validation_error', 'auth_error'];
      return !nonRetryable.includes(error);
    }

    function getRetryDelay(attempt: number, baseDelay: number = 1000): number {
      return Math.min(baseDelay * Math.pow(2, attempt), 30000);
    }

    it('未达最大重试次数应重试', () => {
      expect(shouldRetry(1, 3, 'timeout')).toBe(true);
    });

    it('达到最大重试次数应停止', () => {
      expect(shouldRetry(3, 3, 'timeout')).toBe(false);
    });

    it('不可重试错误应停止', () => {
      expect(shouldRetry(0, 3, 'auth_error')).toBe(false);
    });

    it('重试延迟应指数增长', () => {
      expect(getRetryDelay(0)).toBe(1000);
      expect(getRetryDelay(1)).toBe(2000);
      expect(getRetryDelay(2)).toBe(4000);
      expect(getRetryDelay(10)).toBe(30000); // capped
    });
  });

  describe('任务依赖管理', () => {
    interface TaskNode {
      id: string;
      deps: string[];
    }

    function topologicalSort(tasks: TaskNode[]): string[] {
      const inDegree = new Map<string, number>();
      const adj = new Map<string, string[]>();

      for (const t of tasks) {
        inDegree.set(t.id, t.deps.length);
        adj.set(t.id, []);
      }
      for (const t of tasks) {
        for (const dep of t.deps) {
          if (!adj.has(dep)) adj.set(dep, []);
          adj.get(dep)!.push(t.id);
        }
      }

      const queue: string[] = [];
      for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
      }

      const result: string[] = [];
      while (queue.length > 0) {
        const node = queue.shift()!;
        result.push(node);
        for (const next of adj.get(node) || []) {
          inDegree.set(next, inDegree.get(next)! - 1);
          if (inDegree.get(next) === 0) queue.push(next);
        }
      }

      return result.length === tasks.length ? result : [];
    }

    it('应正确拓扑排序', () => {
      const tasks: TaskNode[] = [
        { id: 'C', deps: ['A', 'B'] },
        { id: 'A', deps: [] },
        { id: 'B', deps: ['A'] },
      ];
      const order = topologicalSort(tasks);
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
    });

    it('循环依赖应返回空', () => {
      const tasks: TaskNode[] = [
        { id: 'A', deps: ['B'] },
        { id: 'B', deps: ['A'] },
      ];
      expect(topologicalSort(tasks)).toEqual([]);
    });
  });
});
