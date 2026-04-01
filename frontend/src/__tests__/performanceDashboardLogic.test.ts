/**
 * 性能仪表盘页面逻辑测试
 * 覆盖性能指标计算、Web Vitals、加载分析
 */

import { describe, it, expect } from 'vitest';

describe('性能仪表盘逻辑', () => {
  describe('Web Vitals 评分', () => {
    function scoreWebVital(metric: string, value: number): { score: 'good' | 'needs-improvement' | 'poor'; percentile: number } {
      const thresholds: Record<string, { good: number; poor: number }> = {
        LCP: { good: 2500, poor: 4000 },
        FID: { good: 100, poor: 300 },
        CLS: { good: 0.1, poor: 0.25 },
        FCP: { good: 1800, poor: 3000 },
        TTFB: { good: 800, poor: 1800 },
      };
      const t = thresholds[metric] || { good: 1000, poor: 3000 };
      let score: 'good' | 'needs-improvement' | 'poor' = 'needs-improvement';
      if (value <= t.good) score = 'good';
      else if (value >= t.poor) score = 'poor';
      const percentile = Math.max(0, Math.min(100, Math.round(100 - (value / t.poor) * 100)));
      return { score, percentile };
    }

    it('LCP < 2500ms 应为good', () => {
      expect(scoreWebVital('LCP', 2000).score).toBe('good');
    });

    it('LCP > 4000ms 应为poor', () => {
      expect(scoreWebVital('LCP', 5000).score).toBe('poor');
    });

    it('CLS < 0.1 应为good', () => {
      expect(scoreWebVital('CLS', 0.05).score).toBe('good');
    });

    it('FID > 300ms 应为poor', () => {
      expect(scoreWebVital('FID', 400).score).toBe('poor');
    });
  });

  describe('页面加载瀑布图数据', () => {
    interface TimingEntry {
      name: string;
      start: number;
      duration: number;
    }

    function buildWaterfall(entries: { name: string; start: number; end: number }[]): TimingEntry[] {
      return entries.map(e => ({
        name: e.name,
        start: e.start,
        duration: e.end - e.start,
      })).sort((a, b) => a.start - b.start);
    }

    it('应正确计算持续时间', () => {
      const waterfall = buildWaterfall([
        { name: 'DNS', start: 0, end: 50 },
        { name: 'TCP', start: 50, end: 100 },
        { name: 'Response', start: 100, end: 300 },
      ]);
      expect(waterfall[0].duration).toBe(50);
      expect(waterfall[2].duration).toBe(200);
    });
  });

  describe('资源加载分析', () => {
    interface ResourceEntry {
      type: 'script' | 'style' | 'image' | 'font' | 'other';
      size: number;
      duration: number;
      cached: boolean;
    }

    function analyzeResources(resources: ResourceEntry[]): {
      totalSize: number;
      cachedRatio: number;
      byType: Record<string, { count: number; size: number }>;
      slowest: ResourceEntry | null;
    } {
      const totalSize = resources.reduce((s, r) => s + r.size, 0);
      const cachedCount = resources.filter(r => r.cached).length;
      const cachedRatio = resources.length > 0 ? Math.round((cachedCount / resources.length) * 100) : 0;
      const byType: Record<string, { count: number; size: number }> = {};
      for (const r of resources) {
        if (!byType[r.type]) byType[r.type] = { count: 0, size: 0 };
        byType[r.type].count++;
        byType[r.type].size += r.size;
      }
      const sorted = [...resources].sort((a, b) => b.duration - a.duration);
      return { totalSize, cachedRatio, byType, slowest: sorted[0] || null };
    }

    it('应正确分析资源', () => {
      const resources: ResourceEntry[] = [
        { type: 'script', size: 100000, duration: 200, cached: false },
        { type: 'style', size: 50000, duration: 100, cached: true },
        { type: 'image', size: 200000, duration: 300, cached: false },
      ];
      const result = analyzeResources(resources);
      expect(result.totalSize).toBe(350000);
      expect(result.cachedRatio).toBe(33);
      expect(result.byType['script'].count).toBe(1);
      expect(result.slowest?.type).toBe('image');
    });
  });

  describe('Bundle 分析', () => {
    interface ChunkInfo {
      name: string;
      size: number;
      modules: string[];
      isEntry: boolean;
    }

    function analyzeBundle(chunks: ChunkInfo[]): {
      totalSize: number;
      entrySize: number;
      lazySize: number;
      largestChunk: string;
    } {
      const totalSize = chunks.reduce((s, c) => s + c.size, 0);
      const entrySize = chunks.filter(c => c.isEntry).reduce((s, c) => s + c.size, 0);
      const sorted = [...chunks].sort((a, b) => b.size - a.size);
      return {
        totalSize,
        entrySize,
        lazySize: totalSize - entrySize,
        largestChunk: sorted[0]?.name || '',
      };
    }

    it('应正确分析bundle', () => {
      const chunks: ChunkInfo[] = [
        { name: 'main', size: 300000, modules: ['app'], isEntry: true },
        { name: 'vendor', size: 500000, modules: ['react', 'antd'], isEntry: false },
        { name: 'charts', size: 200000, modules: ['echarts'], isEntry: false },
      ];
      const result = analyzeBundle(chunks);
      expect(result.totalSize).toBe(1000000);
      expect(result.entrySize).toBe(300000);
      expect(result.lazySize).toBe(700000);
      expect(result.largestChunk).toBe('vendor');
    });
  });
});
