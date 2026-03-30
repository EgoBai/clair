import { describe, it, expect } from 'vitest';
import { rollbackManager } from '../../../backend/src/services/rollbackManager';

describe('Rollback Manager', () => {
  describe('版本快照', () => {
    it('应能保存版本快照', () => {
      const snapshot = rollbackManager.saveSnapshot('v1.0.0', { replicas: 3, memory: '512M' }, 'production');
      expect(snapshot.version).toBe('v1.0.0');
      expect(snapshot.environment).toBe('production');
    });

    it('应能获取快照', () => {
      rollbackManager.saveSnapshot('v1.1.0', { replicas: 2 }, 'staging');
      const snapshot = rollbackManager.getSnapshot('v1.1.0');
      expect(snapshot).toBeDefined();
      expect(snapshot?.config.replicas).toBe(2);
    });

    it('不存在的快照返回undefined', () => {
      expect(rollbackManager.getSnapshot('v999.0.0')).toBeUndefined();
    });

    it('应能获取所有快照', () => {
      const all = rollbackManager.getAllSnapshots();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('回滚执行', () => {
    it('应能执行回滚', () => {
      const execution = rollbackManager.executeRollback('v2.0.0', 'v1.0.0', '测试回滚', 'manual');
      expect(execution.fromVersion).toBe('v2.0.0');
      expect(execution.toVersion).toBe('v1.0.0');
      expect(execution.status).toBe('pending');
      expect(execution.steps.length).toBe(5);
    });

    it('应能推进回滚步骤', () => {
      const execution = rollbackManager.executeRollback('v3.0.0', 'v2.0.0', '步骤测试', 'automatic');
      
      let advanced = rollbackManager.advanceRollback(execution.id);
      expect(advanced?.status).toBe('in_progress');
      expect(advanced?.steps[0].status).toBe('running');

      // 推进所有步骤
      for (let i = 0; i < 5; i++) {
        advanced = rollbackManager.advanceRollback(execution.id);
      }
      expect(advanced?.status).toBe('completed');
      expect(advanced?.steps[4].status).toBe('completed');
    });

    it('应能获取回滚记录', () => {
      const execution = rollbackManager.executeRollback('v4.0.0', 'v3.0.0', '获取测试', 'health_check');
      const fetched = rollbackManager.getRollbackExecution(execution.id);
      expect(fetched).toBeDefined();
      expect(fetched?.reason).toBe('获取测试');
    });

    it('应能获取所有回滚记录', () => {
      const all = rollbackManager.getAllRollbacks();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe('自动回滚策略', () => {
    it('应检测高错误率需要回滚', () => {
      rollbackManager.updatePolicy({ autoRollback: true, errorRateThreshold: 0.05 });
      rollbackManager.resetHealthCheckCount();
      const shouldRollback = rollbackManager.shouldAutoRollback({
        errorRate: 0.1,
        p99LatencyMs: 500,
        healthCheckPassed: true,
      });
      expect(shouldRollback).toBe(true);
      rollbackManager.resetHealthCheckCount();
    });

    it('应检测高延迟需要回滚', () => {
      rollbackManager.updatePolicy({ autoRollback: true, latencyThresholdMs: 2000 });
      rollbackManager.resetHealthCheckCount();
      const shouldRollback = rollbackManager.shouldAutoRollback({
        errorRate: 0.01,
        p99LatencyMs: 5000,
        healthCheckPassed: true,
      });
      expect(shouldRollback).toBe(true);
      rollbackManager.resetHealthCheckCount();
    });

    it('正常指标不应触发回滚', () => {
      rollbackManager.updatePolicy({ autoRollback: true, errorRateThreshold: 0.05, latencyThresholdMs: 2000 });
      rollbackManager.resetHealthCheckCount();
      const shouldRollback = rollbackManager.shouldAutoRollback({
        errorRate: 0.01,
        p99LatencyMs: 500,
        healthCheckPassed: true,
      });
      expect(shouldRollback).toBe(false);
    });

    it('连续健康检查失败应触发回滚', () => {
      rollbackManager.updatePolicy({ autoRollback: true, healthCheckFailures: 2 });
      rollbackManager.resetHealthCheckCount();

      // 两次失败
      rollbackManager.recordHealthCheck(false);
      rollbackManager.recordHealthCheck(false);
      // 第三次在shouldAutoRollback里传入 healthCheckPassed:false，累计为3 >= threshold=2
      const shouldRollback = rollbackManager.shouldAutoRollback({
        errorRate: 0.01,
        p99LatencyMs: 500,
        healthCheckPassed: false,
      });
      expect(shouldRollback).toBe(true);
      // 重置以免影响其他测试
      rollbackManager.resetHealthCheckCount();
    });

    it('禁用自动回滚时不应触发', () => {
      rollbackManager.updatePolicy({ autoRollback: false });
      rollbackManager.resetHealthCheckCount();
      const shouldRollback = rollbackManager.shouldAutoRollback({
        errorRate: 0.99,
        p99LatencyMs: 99999,
        healthCheckPassed: false,
      });
      expect(shouldRollback).toBe(false);
      rollbackManager.resetHealthCheckCount();
    });
  });

  describe('策略管理', () => {
    it('应能更新策略', () => {
      rollbackManager.updatePolicy({ errorRateThreshold: 0.1, drainTimeout: 60 });
      const policy = rollbackManager.getPolicy();
      expect(policy.errorRateThreshold).toBe(0.1);
      expect(policy.drainTimeout).toBe(60);
    });

    it('应能获取策略', () => {
      const policy = rollbackManager.getPolicy();
      expect(policy).toHaveProperty('autoRollback');
      expect(policy).toHaveProperty('errorRateThreshold');
      expect(policy).toHaveProperty('latencyThresholdMs');
    });
  });

  describe('清理与报告', () => {
    it('应能清理旧快照', () => {
      const removed = rollbackManager.cleanup(1);
      expect(typeof removed).toBe('number');
    });

    it('应能生成回滚报告', () => {
      const execution = rollbackManager.executeRollback('v_report', 'v_prev', '报告测试', 'manual');
      const report = rollbackManager.generateReport(execution.id);
      expect(report).toContain('v_report');
      expect(report).toContain('v_prev');
      expect(report).toContain('manual');
    });

    it('不存在的回滚记录返回错误', () => {
      const report = rollbackManager.generateReport('nonexistent');
      expect(report).toContain('不存在');
    });
  });
});
