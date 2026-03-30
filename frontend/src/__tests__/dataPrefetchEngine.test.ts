import { describe, it, expect } from 'vitest';

// 数据预取引擎
interface PrefetchConfig {
  enabled: boolean;
  maxConcurrent: number;
  cacheExpiry: number; // ms
  priority: 'high' | 'medium' | 'low';
}

interface PrefetchTask {
  url: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
  data?: any;
}

function prioritizeTasks(tasks: PrefetchTask[]): PrefetchTask[] {
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) => order[a.priority] - order[b.priority]);
}

function filterExpiredTasks(tasks: PrefetchTask[], expiry: number, now: number): PrefetchTask[] {
  return tasks.filter(t => now - t.timestamp < expiry);
}

function calcPrefetchScore(url: string, visitCount: number, lastVisit: number, now: number): number {
  const recencyScore = Math.max(0, 1 - (now - lastVisit) / (24 * 60 * 60 * 1000));
  const freqScore = Math.min(visitCount / 10, 1);
  return recencyScore * 0.6 + freqScore * 0.4;
}

function shouldPrefetch(score: number, threshold: number = 0.3): boolean {
  return score >= threshold;
}

function limitConcurrency(tasks: PrefetchTask[], max: number): PrefetchTask[] {
  return tasks.slice(0, max);
}

function generatePrefetchKey(url: string, params?: Record<string, string>): string {
  if (!params) return url;
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${url}?${sorted.map(([k, v]) => `${k}=${v}`).join('&')}`;
}

function deduplicateTasks(tasks: PrefetchTask[]): PrefetchTask[] {
  const seen = new Set<string>();
  return tasks.filter(t => {
    if (seen.has(t.url)) return false;
    seen.add(t.url);
    return true;
  });
}

describe('数据预取引擎', () => {
  const now = Date.now();
  const tasks: PrefetchTask[] = [
    { url: '/api/stock/000001', priority: 'high', timestamp: now - 1000 },
    { url: '/api/stock/000002', priority: 'low', timestamp: now - 5000 },
    { url: '/api/market', priority: 'medium', timestamp: now - 2000 },
  ];

  describe('任务优先级排序', () => {
    it('high应排在最前', () => {
      const sorted = prioritizeTasks(tasks);
      expect(sorted[0].priority).toBe('high');
    });

    it('low应排在最后', () => {
      const sorted = prioritizeTasks(tasks);
      expect(sorted[sorted.length - 1].priority).toBe('low');
    });

    it('不应修改原数组', () => {
      const original = [...tasks];
      prioritizeTasks(tasks);
      expect(tasks[0].url).toBe(original[0].url);
    });
  });

  describe('过期任务过滤', () => {
    it('应保留未过期任务', () => {
      const filtered = filterExpiredTasks(tasks, 10000, now);
      expect(filtered.length).toBe(3);
    });

    it('应过滤过期任务', () => {
      const filtered = filterExpiredTasks(tasks, 3000, now);
      expect(filtered.length).toBe(2); // low任务已过期
    });

    it('过期时间为0应返回空', () => {
      expect(filterExpiredTasks(tasks, 0, now).length).toBe(0);
    });
  });

  describe('预取评分', () => {
    it('高频最近访问应得高分', () => {
      const score = calcPrefetchScore('/api/stock', 10, now - 1000, now);
      expect(score).toBeGreaterThan(0.5);
    });

    it('低频远古访问应得低分', () => {
      const score = calcPrefetchScore('/api/stock', 1, now - 86400000 * 7, now);
      expect(score).toBeLessThan(0.3);
    });
  });

  describe('预取决策', () => {
    it('高分应触发预取', () => { expect(shouldPrefetch(0.8)).toBe(true); });
    it('低分不应触发预取', () => { expect(shouldPrefetch(0.1)).toBe(false); });
    it('临界值应触发预取', () => { expect(shouldPrefetch(0.3)).toBe(true); });
  });

  describe('并发限制', () => {
    it('应限制返回数量', () => {
      expect(limitConcurrency(tasks, 2).length).toBe(2);
    });

    it('max大于任务数应返回全部', () => {
      expect(limitConcurrency(tasks, 10).length).toBe(3);
    });
  });

  describe('缓存键生成', () => {
    it('无参数应返回URL本身', () => {
      expect(generatePrefetchKey('/api/stock')).toBe('/api/stock');
    });

    it('参数应按字母排序', () => {
      const key = generatePrefetchKey('/api/stock', { z: '1', a: '2' });
      expect(key).toBe('/api/stock?a=2&z=1');
    });
  });

  describe('任务去重', () => {
    it('应去除重复URL', () => {
      const dupes: PrefetchTask[] = [
        { url: '/api/a', priority: 'high', timestamp: now },
        { url: '/api/a', priority: 'low', timestamp: now },
        { url: '/api/b', priority: 'medium', timestamp: now },
      ];
      expect(deduplicateTasks(dupes).length).toBe(2);
    });

    it('无重复应返回原数组', () => {
      expect(deduplicateTasks(tasks).length).toBe(3);
    });
  });
});
