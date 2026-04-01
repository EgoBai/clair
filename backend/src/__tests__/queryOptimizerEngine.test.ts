/**
 * 后端数据库查询优化器测试
 * 覆盖查询计划、索引建议、慢查询分析
 */

import { describe, it, expect } from 'vitest';

describe('数据库查询优化器', () => {
  describe('查询计划分析', () => {
    interface QueryPlan {
      table: string;
      scanType: 'index' | 'full' | 'range';
      estimatedRows: number;
      filters: string[];
      sortNeeded: boolean;
    }

    function analyzePlan(plan: QueryPlan): { score: number; issues: string[] } {
      const issues: string[] = [];
      let score = 100;

      if (plan.scanType === 'full') {
        issues.push(`全表扫描: ${plan.table}`);
        score -= 50;
      }

      if (plan.estimatedRows > 100000 && plan.scanType !== 'index') {
        issues.push('大量行扫描未使用索引');
        score -= 30;
      }

      if (plan.sortNeeded && plan.estimatedRows > 10000) {
        issues.push('大结果集需要排序');
        score -= 20;
      }

      return { score: Math.max(0, score), issues };
    }

    it('索引扫描应得高分', () => {
      const plan: QueryPlan = { table: 'stocks', scanType: 'index', estimatedRows: 1, filters: ['symbol'], sortNeeded: false };
      expect(analyzePlan(plan).score).toBe(100);
    });

    it('全表扫描应扣分', () => {
      const plan: QueryPlan = { table: 'stocks', scanType: 'full', estimatedRows: 5000, filters: [], sortNeeded: false };
      const result = analyzePlan(plan);
      expect(result.score).toBe(50);
      expect(result.issues).toContain('全表扫描: stocks');
    });
  });

  describe('索引建议', () => {
    interface QueryStats {
      table: string;
      whereColumns: string[];
      joinColumns: string[];
      orderColumns: string[];
      frequency: number;
      avgExecutionMs: number;
    }

    function suggestIndexes(stats: QueryStats[]): { table: string; columns: string[]; reason: string }[] {
      const suggestions: { table: string; columns: string[]; reason: string }[] = [];

      for (const stat of stats) {
        if (stat.avgExecutionMs > 100 && stat.whereColumns.length > 0) {
          suggestions.push({
            table: stat.table,
            columns: stat.whereColumns,
            reason: `慢查询 (${stat.avgExecutionMs}ms), 频率 ${stat.frequency}/天`,
          });
        }
        if (stat.orderColumns.length > 0 && stat.avgExecutionMs > 50) {
          suggestions.push({
            table: stat.table,
            columns: stat.orderColumns,
            reason: '排序字段缺少索引',
          });
        }
      }

      return suggestions;
    }

    it('慢查询应建议索引', () => {
      const stats: QueryStats[] = [{
        table: 'daily_quotes', whereColumns: ['stock_id', 'trade_date'],
        joinColumns: [], orderColumns: [], frequency: 1000, avgExecutionMs: 500,
      }];
      const suggestions = suggestIndexes(stats);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].table).toBe('daily_quotes');
    });

    it('快查询不应建议索引', () => {
      const stats: QueryStats[] = [{
        table: 'stocks', whereColumns: ['symbol'],
        joinColumns: [], orderColumns: [], frequency: 5000, avgExecutionMs: 5,
      }];
      expect(suggestIndexes(stats)).toHaveLength(0);
    });
  });

  describe('慢查询分析', () => {
    interface SlowQuery {
      sql: string;
      duration: number;
      rowsExamined: number;
      rowsReturned: number;
    }

    function analyzeSlowQuery(query: SlowQuery): { category: string; suggestion: string } {
      const selectivity = query.rowsReturned / (query.rowsExamined || 1);

      if (selectivity < 0.01) {
        return { category: 'low_selectivity', suggestion: '添加更精确的索引或WHERE条件' };
      }
      if (query.rowsExamined > 100000) {
        return { category: 'large_scan', suggestion: '考虑分页或分区' };
      }
      if (query.duration > 1000) {
        return { category: 'slow_execution', suggestion: '检查锁竞争和IO' };
      }
      return { category: 'normal', suggestion: '无特殊优化建议' };
    }

    it('低选择性应建议精确索引', () => {
      const query: SlowQuery = { sql: 'SELECT * FROM quotes WHERE date > ?', duration: 200, rowsExamined: 1000000, rowsReturned: 100 };
      expect(analyzeSlowQuery(query).category).toBe('low_selectivity');
    });

    it('大扫描应建议分页', () => {
      const query: SlowQuery = { sql: 'SELECT * FROM stocks', duration: 300, rowsExamined: 500000, rowsReturned: 500000 };
      expect(analyzeSlowQuery(query).category).toBe('large_scan');
    });
  });

  describe('查询性能基准', () => {
    function benchmarkQuery(runs: number, execFn: () => void): { avgMs: number; minMs: number; maxMs: number; p95Ms: number } {
      const durations: number[] = [];
      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        execFn();
        durations.push(performance.now() - start);
      }
      durations.sort((a, b) => a - b);
      return {
        avgMs: Math.round(durations.reduce((s, d) => s + d, 0) / runs * 1000) / 1000,
        minMs: Math.round(durations[0] * 1000) / 1000,
        maxMs: Math.round(durations[durations.length - 1] * 1000) / 1000,
        p95Ms: Math.round(durations[Math.floor(runs * 0.95)] * 1000) / 1000,
      };
    }

    it('应正确计算性能指标', () => {
      const result = benchmarkQuery(10, () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
      });
      expect(result.avgMs).toBeGreaterThanOrEqual(0);
      expect(result.minMs).toBeLessThanOrEqual(result.maxMs);
    });
  });
});
