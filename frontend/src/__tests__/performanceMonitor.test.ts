import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMonitor, createPerfMonitor } from '../utils/performanceMonitor';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = createPerfMonitor({ maxEntries: 100, slowThreshold: 10 });
  });

  describe('startMark / endMark', () => {
    it('should track mark duration', () => {
      monitor.startMark('test');
      const result = monitor.endMark('test');
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.name).toBe('test');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return null for unknown mark', () => {
      expect(monitor.endMark('nonexistent')).toBeNull();
    });
  });

  describe('measure', () => {
    it('should measure sync function', () => {
      let sum = 0;
      const result = monitor.measure('calc', () => {
        for (let i = 0; i < 100; i++) sum += i;
        return sum;
      });
      expect(result).toBe(4950);
      const entries = monitor.getEntries({ name: 'calc' });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('computation');
    });
  });

  describe('measureAsync', () => {
    it('should measure async function', async () => {
      const result = await monitor.measureAsync('fetch', async () => {
        return 42;
      });
      expect(result).toBe(42);
      const entries = monitor.getEntries({ name: 'fetch' });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('api');
    });
  });

  describe('getEntries', () => {
    it('should filter by name', () => {
      monitor.measure('a', () => 1);
      monitor.measure('b', () => 2);
      expect(monitor.getEntries({ name: 'a' })).toHaveLength(1);
      expect(monitor.getEntries({ name: 'b' })).toHaveLength(1);
    });

    it('should filter by type', () => {
      monitor.measure('x', () => 1, 'render');
      monitor.measure('y', () => 2, 'api');
      expect(monitor.getEntries({ type: 'render' })).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should compute statistics', () => {
      for (let i = 0; i < 10; i++) {
        monitor.measure('bench', () => { /* noop */ });
      }
      const stats = monitor.getStats('bench');
      expect(stats).toHaveLength(1);
      expect(stats[0].count).toBe(10);
      expect(stats[0].avgDuration).toBeGreaterThanOrEqual(0);
      expect(stats[0].p50).toBeDefined();
      expect(stats[0].p95).toBeDefined();
    });
  });

  describe('getSlowEntries', () => {
    it('should return slow entries', () => {
      monitor.measure('fast', () => 1);
      // Hard to guarantee slow execution in tests, just check API
      const slow = monitor.getSlowEntries();
      expect(Array.isArray(slow)).toBe(true);
    });
  });

  describe('getMemoryUsage', () => {
    it('should return null or memory info', () => {
      const memory = monitor.getMemoryUsage();
      // In Node/test env, may be null
      expect(memory === null || typeof memory.usedJSHeapSize === 'number').toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      monitor.measure('x', () => 1);
      monitor.clear();
      expect(monitor.getEntries()).toHaveLength(0);
    });
  });

  describe('getSummary', () => {
    it('should return summary', () => {
      monitor.measure('a', () => 1, 'render');
      monitor.measure('b', () => 2, 'api');
      const summary = monitor.getSummary();
      expect(summary.totalEntries).toBe(2);
      expect(summary.byType['render']).toBe(1);
      expect(summary.byType['api']).toBe(1);
    });
  });

  describe('maxEntries limit', () => {
    it('should limit entries', () => {
      for (let i = 0; i < 150; i++) {
        monitor.measure(`entry-${i}`, () => 1);
      }
      expect(monitor.getEntries().length).toBeLessThanOrEqual(100);
    });
  });
});
