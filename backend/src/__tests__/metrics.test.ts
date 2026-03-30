/**
 * Prometheus 指标中间件测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { metricsCollector } from '../middleware/metrics';

describe('MetricsCollector', () => {
  beforeEach(() => {
    metricsCollector.reset();
  });

  describe('record', () => {
    it('should record request entries', () => {
      metricsCollector.record({
        method: 'GET',
        path: '/api/stock',
        statusCode: 200,
        duration: 50,
        timestamp: Date.now(),
      });

      const summary = metricsCollector.getSummary();
      expect(summary.totalRequests).toBe(1);
    });

    it('should handle multiple entries', () => {
      for (let i = 0; i < 10; i++) {
        metricsCollector.record({
          method: 'GET',
          path: '/api/stock',
          statusCode: 200,
          duration: 10 + i * 5,
          timestamp: Date.now(),
        });
      }

      const summary = metricsCollector.getSummary();
      expect(summary.totalRequests).toBe(10);
    });
  });

  describe('toPrometheusFormat', () => {
    it('should generate Prometheus metrics', () => {
      metricsCollector.record({
        method: 'GET',
        path: '/api/stock',
        statusCode: 200,
        duration: 50,
        timestamp: Date.now(),
      });

      const output = metricsCollector.toPrometheusFormat();
      expect(output).toContain('http_requests_total');
      expect(output).toContain('http_request_duration_ms');
      expect(output).toContain('process_memory_bytes');
      expect(output).toContain('process_uptime_seconds');
    });

    it('should include correct labels', () => {
      metricsCollector.record({
        method: 'POST',
        path: '/api/watchlist',
        statusCode: 201,
        duration: 30,
        timestamp: Date.now(),
      });

      const output = metricsCollector.toPrometheusFormat();
      expect(output).toContain('method="POST"');
      expect(output).toContain('status="201"');
    });
  });

  describe('getSummary', () => {
    it('should return latency percentiles', () => {
      const durations = [10, 20, 30, 40, 50, 100, 200, 500, 1000, 2000];
      for (const d of durations) {
        metricsCollector.record({
          method: 'GET',
          path: '/api/test',
          statusCode: 200,
          duration: d,
          timestamp: Date.now(),
        });
      }

      const summary = metricsCollector.getSummary() as any;
      expect(summary.latency.p50).toBeGreaterThan(0);
      expect(summary.latency.p95).toBeGreaterThan(0);
      expect(summary.latency.p99).toBeGreaterThan(0);
      expect(summary.latency.avg).toBeGreaterThan(0);
    });

    it('should categorize status codes', () => {
      metricsCollector.record({ method: 'GET', path: '/a', statusCode: 200, duration: 10, timestamp: Date.now() });
      metricsCollector.record({ method: 'GET', path: '/b', statusCode: 404, duration: 5, timestamp: Date.now() });
      metricsCollector.record({ method: 'GET', path: '/c', statusCode: 500, duration: 100, timestamp: Date.now() });

      const summary = metricsCollector.getSummary() as any;
      expect(summary.statusCodes['2xx']).toBe(1);
      expect(summary.statusCodes['4xx']).toBe(1);
      expect(summary.statusCodes['5xx']).toBe(1);
    });

    it('should include memory info', () => {
      const summary = metricsCollector.getSummary() as any;
      expect(summary.memory.rss).toBeGreaterThan(0);
      expect(summary.memory.heapUsed).toBeGreaterThan(0);
      expect(summary.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      metricsCollector.record({
        method: 'GET', path: '/test', statusCode: 200, duration: 10, timestamp: Date.now(),
      });
      expect(metricsCollector.getSummary().totalRequests).toBe(1);
      metricsCollector.reset();
      expect(metricsCollector.getSummary().totalRequests).toBe(0);
    });
  });
});
