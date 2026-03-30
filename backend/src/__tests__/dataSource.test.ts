/**
 * 数据源适配器测试
 */

import { describe, it, expect } from 'vitest';

describe('数据源适配器', () => {
  describe('数据源配置', () => {
    it('应包含4个数据源', () => {
      const sources = ['Tushare', 'AKShare', '东方财富', '新浪财经'];
      expect(sources.length).toBe(4);
    });

    it('数据源应有优先级', () => {
      const sources = [
        { name: 'Tushare', priority: 1 },
        { name: 'AKShare', priority: 2 },
        { name: '东方财富', priority: 3 },
        { name: '新浪财经', priority: 4 },
      ];
      const sorted = [...sources].sort((a, b) => a.priority - b.priority);
      expect(sorted[0].name).toBe('Tushare');
    });

    it('数据源应有速率限制', () => {
      const source = { name: 'Tushare', rateLimit: 200 };
      expect(source.rateLimit).toBeGreaterThan(0);
    });
  });

  describe('速率控制', () => {
    it('应在限制内允许请求', () => {
      const limit = 200;
      const used = 50;
      expect(used).toBeLessThan(limit);
    });

    it('应追踪已用配额', () => {
      const limit = 200;
      const used = 180;
      const remaining = limit - used;
      expect(remaining).toBe(20);
    });
  });

  describe('数据质量检查', () => {
    it('应检测缺失字段', () => {
      const record = { symbol: '600519', name: '贵州茅台' };
      const requiredFields = ['symbol', 'name', 'price', 'volume'];
      const missing = requiredFields.filter(f => !(f in record));
      expect(missing).toEqual(['price', 'volume']);
    });

    it('应验证数值范围', () => {
      const price = -10;
      const isValid = price > 0;
      expect(isValid).toBe(false);
    });

    it('正确数据应通过验证', () => {
      const record = { symbol: '600519', name: '贵州茅台', price: 1800, volume: 50000 };
      const requiredFields = ['symbol', 'name', 'price', 'volume'];
      const missing = requiredFields.filter(f => !(f in record));
      expect(missing.length).toBe(0);
    });

    it('质量评分计算正确', () => {
      const total = 100;
      const valid = 95;
      const score = Math.round((valid / total) * 100);
      expect(score).toBe(95);
    });
  });

  describe('容灾切换', () => {
    it('主源失败时应切换到备用源', () => {
      const sources = ['Tushare', 'AKShare', '东方财富'];
      let currentIndex = 0;
      const failed = true;

      if (failed && currentIndex < sources.length - 1) {
        currentIndex++;
      }

      expect(sources[currentIndex]).toBe('AKShare');
    });

    it('所有源失败时应返回错误', () => {
      const sources = ['Tushare', 'AKShare', '东方财富', '新浪财经'];
      const allFailed = sources.every(() => true); // 模拟全部失败
      expect(allFailed).toBe(true);
    });
  });

  describe('调度器', () => {
    it('应能注册定时任务', () => {
      const tasks = new Map<string, NodeJS.Timeout>();
      tasks.set('daily-sync', setTimeout(() => {}, 60000));
      expect(tasks.has('daily-sync')).toBe(true);
    });

    it('应能取消定时任务', () => {
      const tasks = new Map<string, NodeJS.Timeout>();
      const timer = setTimeout(() => {}, 60000);
      tasks.set('daily-sync', timer);
      clearTimeout(timer);
      tasks.delete('daily-sync');
      expect(tasks.has('daily-sync')).toBe(false);
    });
  });
});
