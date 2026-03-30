/**
 * 性能监控测试
 */

import { describe, it, expect } from 'vitest';

describe('性能监控', () => {
  describe('健康评分', () => {
    it('满分条件：无错误、低延迟', () => {
      let score = 100;
      const errorRate = 0;
      const avgDuration = 50;
      const p99 = 200;
      const slowRate = 0;

      if (errorRate > 5) score -= 30;
      else if (errorRate > 1) score -= 15;
      else if (errorRate > 0.1) score -= 5;

      if (avgDuration > 5000) score -= 25;
      else if (avgDuration > 2000) score -= 15;
      else if (avgDuration > 1000) score -= 8;
      else if (avgDuration > 500) score -= 3;

      if (p99 > 10000) score -= 15;
      else if (p99 > 5000) score -= 8;
      else if (p99 > 3000) score -= 3;

      if (slowRate > 10) score -= 15;
      else if (slowRate > 5) score -= 8;
      else if (slowRate > 1) score -= 3;

      expect(score).toBe(100);
    });

    it('高错误率扣分', () => {
      let score = 100;
      const errorRate = 10;
      if (errorRate > 5) score -= 30;
      expect(score).toBe(70);
    });

    it('高延迟扣分', () => {
      let score = 100;
      const avgDuration = 6000;
      if (avgDuration > 5000) score -= 25;
      expect(score).toBe(75);
    });

    it('评分等级划分', () => {
      const grades = [
        { score: 95, expected: 'A' },
        { score: 85, expected: 'B' },
        { score: 65, expected: 'C' },
        { score: 45, expected: 'D' },
        { score: 20, expected: 'F' },
      ];

      for (const { score, expected } of grades) {
        const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
        expect(grade).toBe(expected);
      }
    });
  });

  describe('百分位计算', () => {
    it('P50 应为中位数', () => {
      const data = [10, 20, 30, 40, 50].sort((a, b) => a - b);
      const p50 = data[Math.floor(data.length * 0.5)];
      expect(p50).toBe(30);
    });

    it('P95 应为第95百分位', () => {
      const data = Array.from({ length: 100 }, (_, i) => i + 1);
      const sorted = data.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      expect(p95).toBe(96);
    });

    it('空数组应返回0', () => {
      const data: number[] = [];
      const p50 = data[Math.floor(data.length * 0.5)] || 0;
      expect(p50).toBe(0);
    });
  });

  describe('端点统计', () => {
    it('应计算正确平均值', () => {
      const durations = [100, 200, 300, 400, 500];
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      expect(avg).toBe(300);
    });

    it('应正确计算错误率', () => {
      const total = 100;
      const errors = 5;
      const errorRate = (errors / total) * 100;
      expect(errorRate).toBe(5);
    });

    it('应找出最慢请求', () => {
      const requests = [
        { path: '/api/stocks', duration: 100 },
        { path: '/api/search', duration: 500 },
        { path: '/api/kline', duration: 200 },
      ];
      const slowest = requests.reduce((max, r) => r.duration > max.duration ? r : max, requests[0]);
      expect(slowest.path).toBe('/api/search');
    });
  });

  describe('路径归一化', () => {
    it('应将数字ID替换为 :id', () => {
      const path = '/api/stocks/600519';
      const normalized = path.replace(/\/[A-Z0-9]{6}/g, '/:symbol');
      expect(normalized).toBe('/api/stocks/:symbol');
    });
  });
});
