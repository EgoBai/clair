import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceMonitor } from '../services/performanceMonitor';

// Mock performance API
const mockPerformance = {
  now: vi.fn(() => Date.now()),
  getEntriesByName: vi.fn(() => []),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
};
Object.defineProperty(global, 'performance', { value: mockPerformance, writable: true });

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new PerformanceMonitor();
  });

  describe('record', () => {
    it('should record a metric', () => {
      monitor.record('test', 100, 'ms');
      const metrics = monitor.getMetrics('test');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(100);
    });

    it('should record with tags', () => {
      monitor.record('api_call', 200, 'ms', { endpoint: '/stocks' });
      const metrics = monitor.getMetrics('api_call');
      expect(metrics[0].tags).toEqual({ endpoint: '/stocks' });
    });

    it('should limit max metrics', () => {
      const m = new PerformanceMonitor();
      for (let i = 0; i < 600; i++) {
        m.record('test', i, 'count');
      }
      expect(m.getMetrics('test').length).toBeLessThanOrEqual(500);
    });
  });

  describe('timers', () => {
    it('should measure time with startTimer/endTimer', () => {
      mockPerformance.now.mockReturnValueOnce(0).mockReturnValueOnce(100);
      monitor.startTimer('operation');
      const duration = monitor.endTimer('operation');
      expect(duration).toBe(100);
      expect(monitor.getMetrics('operation')).toHaveLength(1);
    });

    it('should return -1 for unknown timer', () => {
      const duration = monitor.endTimer('nonexistent');
      expect(duration).toBe(-1);
    });

    it('should record tags on endTimer', () => {
      mockPerformance.now.mockReturnValueOnce(0).mockReturnValueOnce(50);
      monitor.startTimer('op');
      monitor.endTimer('op', { type: 'fetch' });
      expect(monitor.getMetrics('op')[0].tags).toEqual({ type: 'fetch' });
    });
  });

  describe('measureAsync', () => {
    it('should measure async function duration', async () => {
      mockPerformance.now.mockReturnValueOnce(0).mockReturnValueOnce(200);
      const result = await monitor.measureAsync('async_op', async () => {
        return 'done';
      });
      expect(result).toBe('done');
      const metrics = monitor.getMetrics('async_op');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].tags?.status).toBe('success');
    });

    it('should record error status on failure', async () => {
      mockPerformance.now.mockReturnValueOnce(0).mockReturnValueOnce(100);
      await expect(
        monitor.measureAsync('fail_op', async () => { throw new Error('fail'); })
      ).rejects.toThrow('fail');
      const metrics = monitor.getMetrics('fail_op');
      expect(metrics[0].tags?.status).toBe('error');
    });
  });

  describe('measureSync', () => {
    it('should measure sync function duration', () => {
      mockPerformance.now.mockReturnValueOnce(0).mockReturnValueOnce(50);
      const result = monitor.measureSync('sync_op', () => 42);
      expect(result).toBe(42);
      expect(monitor.getMetrics('sync_op')).toHaveLength(1);
    });

    it('should record error on sync failure', () => {
      mockPerformance.now.mockReturnValueOnce(0).mockReturnValueOnce(10);
      expect(() =>
        monitor.measureSync('fail', () => { throw new Error('boom'); })
      ).toThrow('boom');
      expect(monitor.getMetrics('fail')[0].tags?.status).toBe('error');
    });
  });

  describe('subscribe', () => {
    it('should notify observers on record', () => {
      const cb = vi.fn();
      monitor.subscribe(cb);
      monitor.record('test', 1, 'ms');
      expect(cb).toHaveBeenCalled();
    });

    it('should unsubscribe', () => {
      const cb = vi.fn();
      const unsub = monitor.subscribe(cb);
      unsub();
      monitor.record('test', 1, 'ms');
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('analytics', () => {
    it('should calculate average', () => {
      monitor.record('latency', 100, 'ms');
      monitor.record('latency', 200, 'ms');
      monitor.record('latency', 300, 'ms');
      expect(monitor.getAverage('latency')).toBe(200);
    });

    it('should return 0 for unknown metric average', () => {
      expect(monitor.getAverage('unknown')).toBe(0);
    });

    it('should calculate P95', () => {
      for (let i = 1; i <= 100; i++) {
        monitor.record('latency', i, 'ms');
      }
      const p95 = monitor.getP95('latency');
      expect(p95).toBeGreaterThanOrEqual(95);
    });

    it('should return 0 for unknown metric P95', () => {
      expect(monitor.getP95('unknown')).toBe(0);
    });
  });

  describe('report', () => {
    it('should generate a report', () => {
      monitor.record('test', 100, 'ms');
      const report = monitor.generateReport();
      expect(report.metrics).toHaveLength(1);
      expect(report.startTime).toBeDefined();
      expect(report.endTime).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear all metrics and timers', () => {
      monitor.record('test', 1, 'ms');
      monitor.startTimer('t1');
      monitor.clear();
      expect(monitor.getMetrics()).toHaveLength(0);
    });
  });

  describe('memory', () => {
    it('should return null without performance.memory', () => {
      expect(monitor.getMemoryUsage()).toBeNull();
    });
  });
});
