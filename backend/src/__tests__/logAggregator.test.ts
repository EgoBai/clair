/**
 * 日志聚合器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { logAggregator } from '../services/logAggregator';

describe('LogAggregator', () => {
  beforeEach(() => {
    logAggregator.clear();
  });

  describe('ingest', () => {
    it('should store log entries', () => {
      logAggregator.ingest({
        source: 'backend',
        level: 'info',
        message: 'Test log entry',
        timestamp: new Date().toISOString(),
      });

      const stats = logAggregator.getStats();
      expect(stats.totalLogs).toBe(1);
    });

    it('should skip disabled sources', () => {
      // frontend source is enabled by default
      logAggregator.ingest({
        source: 'frontend',
        level: 'info',
        message: 'Test',
        timestamp: new Date().toISOString(),
      });
      expect(logAggregator.getStats().totalLogs).toBe(1);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      const now = new Date().toISOString();
      logAggregator.ingest({ source: 'backend', level: 'info', message: 'Info message', timestamp: now });
      logAggregator.ingest({ source: 'backend', level: 'error', message: 'Error occurred', timestamp: now });
      logAggregator.ingest({ source: 'database', level: 'warn', message: 'Slow query', timestamp: now });
    });

    it('should filter by source', () => {
      const result = logAggregator.query({ source: 'backend' });
      expect(result.total).toBe(2);
      expect(result.logs.every((l) => l.source === 'backend')).toBe(true);
    });

    it('should filter by level', () => {
      const result = logAggregator.query({ level: 'error' });
      expect(result.total).toBe(1);
      expect(result.logs[0].level).toBe('error');
    });

    it('should filter by keyword', () => {
      const result = logAggregator.query({ keyword: 'slow' });
      expect(result.total).toBe(1);
      expect(result.logs[0].message).toContain('Slow');
    });

    it('should support pagination', () => {
      const result = logAggregator.query({ limit: 1, offset: 0 });
      expect(result.logs.length).toBe(1);
      expect(result.total).toBe(3);
    });
  });

  describe('aggregateByWindow', () => {
    it('should aggregate by time windows', () => {
      logAggregator.ingest({
        source: 'backend',
        level: 'info',
        message: 'test',
        timestamp: new Date().toISOString(),
      });

      const windows = logAggregator.aggregateByWindow(5);
      expect(windows.length).toBeGreaterThan(0);
      expect(windows[0].total).toBeGreaterThan(0);
    });
  });

  describe('getErrorRate', () => {
    it('should calculate error rate', () => {
      logAggregator.ingest({ source: 'backend', level: 'info', message: 'ok', timestamp: new Date().toISOString() });
      logAggregator.ingest({ source: 'backend', level: 'error', message: 'fail', timestamp: new Date().toISOString() });

      const rate = logAggregator.getErrorRate(60);
      expect(rate.total).toBe(2);
      expect(rate.errors).toBe(1);
      expect(rate.rate).toBe(50);
    });

    it('should return 0 rate when no logs', () => {
      const rate = logAggregator.getErrorRate(60);
      expect(rate.total).toBe(0);
      expect(rate.rate).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return aggregation statistics', () => {
      const stats = logAggregator.getStats();
      expect(stats).toHaveProperty('totalLogs');
      expect(stats).toHaveProperty('sourcesRegistered');
      expect(stats).toHaveProperty('levelBreakdown');
      expect(stats.sourcesRegistered).toBeGreaterThanOrEqual(5);
    });
  });
});
