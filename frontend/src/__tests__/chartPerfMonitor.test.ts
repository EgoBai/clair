import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChartPerfMonitor,
  measureExecution,
  benchmarkDataProcessing,
} from '../utils/chartPerfMonitor';

describe('图表性能监控工具', () => {
  let monitor: ChartPerfMonitor;

  beforeEach(() => {
    monitor = new ChartPerfMonitor();
  });

  describe('ChartPerfMonitor', () => {
    it('初始状态报告应为空', () => {
      const report = monitor.getReport();
      expect(report.summary.totalRenders).toBe(0);
      expect(report.summary.avgRenderTime).toBe(0);
    });

    it('mark和measure应记录耗时', () => {
      monitor.mark('test');
      const duration = monitor.measure('test');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('addMetric应添加指标', () => {
      monitor.addMetric({
        name: 'test', value: 10, unit: 'ms', timestamp: Date.now(),
      });
      const history = monitor.getMetricHistory('test');
      expect(history.length).toBe(1);
      expect(history[0].value).toBe(10);
    });

    it('recordRender应增加渲染计数', () => {
      monitor.recordRender({
        chartId: 'chart1', renderTime: 10, dataPoints: 100,
        paintTime: 5, layoutTime: 3, fps: 60,
      });
      const report = monitor.getReport();
      expect(report.summary.totalRenders).toBe(1);
    });

    it('checkHealth应检测性能问题', () => {
      monitor.recordRender({
        chartId: 'chart1', renderTime: 100, dataPoints: 1000,
        paintTime: 50, layoutTime: 30, fps: 10,
      });
      const health = monitor.checkHealth();
      expect(health.healthy).toBe(false);
      expect(health.issues.length).toBeGreaterThan(0);
    });

    it('健康指标应通过检测', () => {
      monitor.recordRender({
        chartId: 'chart1', renderTime: 8, dataPoints: 100,
        paintTime: 3, layoutTime: 2, fps: 60,
      });
      const health = monitor.checkHealth();
      expect(health.healthy).toBe(true);
    });

    it('reset应清除所有数据', () => {
      monitor.recordRender({
        chartId: 'chart1', renderTime: 10, dataPoints: 100,
        paintTime: 5, layoutTime: 3, fps: 60,
      });
      monitor.reset();
      const report = monitor.getReport();
      expect(report.summary.totalRenders).toBe(0);
    });

    it('getMetricHistory应限制返回数量', () => {
      for (let i = 0; i < 150; i++) {
        monitor.addMetric({
          name: 'test', value: i, unit: 'ms', timestamp: Date.now(),
        });
      }
      const history = monitor.getMetricHistory('test', 50);
      expect(history.length).toBe(50);
    });

    it('报告应包含平均渲染时间', () => {
      monitor.recordRender({
        chartId: 'c1', renderTime: 10, dataPoints: 50,
        paintTime: 5, layoutTime: 2, fps: 60,
      });
      monitor.recordRender({
        chartId: 'c1', renderTime: 20, dataPoints: 50,
        paintTime: 10, layoutTime: 5, fps: 55,
      });
      const report = monitor.getReport();
      expect(report.summary.avgRenderTime).toBe(15);
      expect(report.summary.maxRenderTime).toBe(20);
    });
  });

  describe('measureExecution', () => {
    it('应返回函数结果', () => {
      const result = measureExecution(() => 42, monitor, 'test');
      expect(result).toBe(42);
    });

    it('应记录执行时间', () => {
      measureExecution(() => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      }, monitor, 'compute');
      const history = monitor.getMetricHistory('compute');
      expect(history.length).toBe(1);
    });
  });

  describe('benchmarkDataProcessing', () => {
    it('应返回基准结果', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const result = benchmarkDataProcessing(
        data,
        (d) => d.map((x: number) => x * 2),
        5
      );
      expect(result.avgTime).toBeGreaterThan(0);
      expect(result.minTime).toBeLessThanOrEqual(result.avgTime);
      expect(result.maxTime).toBeGreaterThanOrEqual(result.avgTime);
      expect(result.throughput).toBeGreaterThan(0);
    });

    it('throughput应计算每秒处理量', () => {
      const data = [1, 2, 3];
      const result = benchmarkDataProcessing(
        data,
        (d) => d,
        3
      );
      expect(result.throughput).toBeGreaterThan(0);
    });
  });
});
