import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheMonitorDashboard } from '../utils/cacheMonitorDashboard.js';

describe('CacheMonitorDashboard', () => {
  let dashboard: CacheMonitorDashboard;

  beforeEach(() => {
    dashboard = new CacheMonitorDashboard();
  });

  afterEach(() => {
    dashboard.stop();
    dashboard.clear();
  });

  describe('快照采集', () => {
    it('采集快照并存储', () => {
      const snapshot = dashboard.collectSnapshot();
      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('hitRate');
      expect(snapshot).toHaveProperty('avgLatency');
      expect(snapshot).toHaveProperty('memoryUsage');
    });

    it('多次采集存储多个快照', () => {
      dashboard.collectSnapshot();
      dashboard.collectSnapshot();
      dashboard.collectSnapshot();
      expect(dashboard.getSnapshots().length).toBe(3);
    });

    it('快照数量限制', () => {
      for (let i = 0; i < 70; i++) {
        dashboard.collectSnapshot();
      }
      expect(dashboard.getSnapshots().length).toBeLessThanOrEqual(60);
    });
  });

  describe('仪表盘指标', () => {
    it('返回完整仪表盘数据', () => {
      const metrics = dashboard.getDashboardMetrics();

      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('multiLevel');
      expect(metrics).toHaveProperty('queryCache');
      expect(metrics).toHaveProperty('hotKeys');
      expect(metrics).toHaveProperty('health');
      expect(metrics).toHaveProperty('trend');
    });

    it('多级缓存指标结构正确', () => {
      const metrics = dashboard.getDashboardMetrics();

      expect(metrics.multiLevel.l1).toHaveProperty('hitRate');
      expect(metrics.multiLevel.l1).toHaveProperty('entryCount');
      expect(metrics.multiLevel.l1).toHaveProperty('totalSize');
      expect(metrics.multiLevel.l1).toHaveProperty('evictions');
      expect(metrics.multiLevel.l1).toHaveProperty('avgLatency');

      expect(metrics.multiLevel.l2).toHaveProperty('hitRate');
      expect(metrics.multiLevel.overall).toHaveProperty('hitRate');
      expect(metrics.multiLevel.overall).toHaveProperty('penetrationRate');
    });

    it('查询缓存指标', () => {
      const metrics = dashboard.getDashboardMetrics();

      expect(metrics.queryCache).toHaveProperty('hitRate');
      expect(metrics.queryCache).toHaveProperty('totalQueries');
      expect(metrics.queryCache).toHaveProperty('slowQueries');
      expect(metrics.queryCache).toHaveProperty('avgQueryTime');
      expect(metrics.queryCache).toHaveProperty('cacheSize');
    });

    it('热点key列表', () => {
      const metrics = dashboard.getDashboardMetrics();
      expect(Array.isArray(metrics.hotKeys)).toBe(true);
      metrics.hotKeys.forEach(key => {
        expect(key).toHaveProperty('key');
        expect(key).toHaveProperty('hits');
        expect(key).toHaveProperty('level');
      });
    });

    it('健康评估结构', () => {
      const metrics = dashboard.getDashboardMetrics();

      expect(['healthy', 'degraded', 'critical']).toContain(metrics.health.status);
      expect(typeof metrics.health.score).toBe('number');
      expect(metrics.health.score).toBeGreaterThanOrEqual(0);
      expect(metrics.health.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(metrics.health.issues)).toBe(true);
      expect(Array.isArray(metrics.health.recommendations)).toBe(true);
    });

    it('趋势数据', () => {
      dashboard.collectSnapshot();
      dashboard.collectSnapshot();
      const metrics = dashboard.getDashboardMetrics();

      expect(Array.isArray(metrics.trend.hitRateTrend)).toBe(true);
      expect(Array.isArray(metrics.trend.latencyTrend)).toBe(true);
      expect(Array.isArray(metrics.trend.memoryTrend)).toBe(true);
    });
  });

  describe('报告生成', () => {
    it('生成文本报告', () => {
      const report = dashboard.generateReport();
      expect(typeof report).toBe('string');
      expect(report).toContain('缓存监控报告');
      expect(report).toContain('L1');
      expect(report).toContain('L2');
      expect(report).toContain('健康评分');
    });

    it('报告包含健康状态', () => {
      const report = dashboard.generateReport();
      expect(report).toMatch(/healthy|degraded|critical/);
    });
  });

  describe('阈值配置', () => {
    it('获取默认阈值', () => {
      const thresholds = dashboard.getThresholds();
      expect(thresholds).toHaveProperty('minHitRate');
      expect(thresholds).toHaveProperty('maxLatency');
      expect(thresholds).toHaveProperty('maxMemory');
      expect(thresholds).toHaveProperty('maxPenetrationRate');
    });

    it('修改阈值', () => {
      dashboard.setThresholds({ minHitRate: 0.8 });
      expect(dashboard.getThresholds().minHitRate).toBe(0.8);
    });
  });

  describe('生命周期', () => {
    it('start/stop控制定时器', () => {
      expect(() => dashboard.start(100)).not.toThrow();
      expect(() => dashboard.stop()).not.toThrow();
    });

    it('重复start不报错', () => {
      dashboard.start(100);
      expect(() => dashboard.start(100)).not.toThrow();
      dashboard.stop();
    });

    it('clear清除快照', () => {
      dashboard.collectSnapshot();
      dashboard.collectSnapshot();
      dashboard.clear();
      expect(dashboard.getSnapshots().length).toBe(0);
    });
  });

  describe('uptime', () => {
    it('uptime随时间增长', async () => {
      const m1 = dashboard.getDashboardMetrics();
      await new Promise(r => setTimeout(r, 10));
      const m2 = dashboard.getDashboardMetrics();
      expect(m2.uptime).toBeGreaterThanOrEqual(m1.uptime);
    });
  });
});
