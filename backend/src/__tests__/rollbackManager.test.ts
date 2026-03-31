import { describe, it, expect, beforeEach } from 'vitest';
import { rollbackManager, RollbackPolicy } from '../services/rollbackManager';

describe('RollbackManager', () => {
  beforeEach(() => {
    rollbackManager.resetHealthCheckCount();
  });

  describe('saveSnapshot / getSnapshot', () => {
    it('应该保存版本快照', () => {
      const snapshot = rollbackManager.saveSnapshot('v1.0', { replicas: 3 }, 'production');
      expect(snapshot.version).toBe('v1.0');
      expect(snapshot.config.replicas).toBe(3);
      expect(snapshot.environment).toBe('production');
    });

    it('应该获取已保存的快照', () => {
      rollbackManager.saveSnapshot('v2.0', { replicas: 5 }, 'staging');
      const found = rollbackManager.getSnapshot('v2.0');
      expect(found?.version).toBe('v2.0');
    });

    it('不存在的版本应返回 undefined', () => {
      expect(rollbackManager.getSnapshot('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllSnapshots', () => {
    it('应该返回所有快照数组', () => {
      rollbackManager.saveSnapshot('va', {}, 'production');
      rollbackManager.saveSnapshot('vb', {}, 'staging');
      const all = rollbackManager.getAllSnapshots();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('应该按时间倒序排列', () => {
      const all = rollbackManager.getAllSnapshots();
      for (let i = 1; i < all.length; i++) {
        expect(new Date(all[i-1].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(all[i].timestamp).getTime());
      }
    });
  });

  describe('executeRollback', () => {
    it('应该创建回滚执行记录', () => {
      const execution = rollbackManager.executeRollback('v2.0', 'v1.0', '测试回滚');
      expect(execution.id).toBeDefined();
      expect(execution.fromVersion).toBe('v2.0');
      expect(execution.toVersion).toBe('v1.0');
      expect(execution.status).toBe('pending');
      expect(execution.trigger).toBe('manual');
    });

    it('应该包含回滚步骤', () => {
      const execution = rollbackManager.executeRollback('v2.0', 'v1.0', '测试');
      expect(execution.steps.length).toBe(5);
      expect(execution.steps.map(s => s.name)).toContain('validate_target');
      expect(execution.steps.map(s => s.name)).toContain('health_check');
    });

    it('应该支持不同的触发方式', () => {
      const auto = rollbackManager.executeRollback('v2.0', 'v1.0', '自动', 'automatic');
      expect(auto.trigger).toBe('automatic');
    });
  });

  describe('advanceRollback', () => {
    it('pending 应该变为 in_progress', () => {
      const execution = rollbackManager.executeRollback('v2.0', 'v1.0', '测试');
      const advanced = rollbackManager.advanceRollback(execution.id);
      expect(advanced?.status).toBe('in_progress');
      expect(advanced?.steps[0].status).toBe('running');
    });

    it('应该逐步骤推进', () => {
      const execution = rollbackManager.executeRollback('v2.0', 'v1.0', '测试');
      rollbackManager.advanceRollback(execution.id); // -> in_progress, step 0 running

      // 推进所有步骤
      for (let i = 0; i < 5; i++) {
        rollbackManager.advanceRollback(execution.id);
      }

      const final = rollbackManager.getRollbackExecution(execution.id);
      expect(final?.status).toBe('completed');
    });

    it('不存在的 ID 应返回 undefined', () => {
      expect(rollbackManager.advanceRollback('nonexistent')).toBeUndefined();
    });
  });

  describe('getRollbackExecution', () => {
    it('应该返回已存在的回滚记录', () => {
      const created = rollbackManager.executeRollback('v2.0', 'v1.0', '测试');
      const found = rollbackManager.getRollbackExecution(created.id);
      expect(found?.id).toBe(created.id);
    });

    it('不存在的 ID 应返回 undefined', () => {
      expect(rollbackManager.getRollbackExecution('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllRollbacks', () => {
    it('应该返回回滚记录数组', () => {
      rollbackManager.executeRollback('v3.0', 'v2.0', '测试A');
      rollbackManager.executeRollback('v4.0', 'v3.0', '测试B');
      const all = rollbackManager.getAllRollbacks();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('shouldAutoRollback', () => {
    it('错误率超阈值应触发回滚', () => {
      const result = rollbackManager.shouldAutoRollback({
        errorRate: 0.1,
        p99LatencyMs: 500,
        healthCheckPassed: true,
      });
      expect(result).toBe(true);
    });

    it('延迟超阈值应触发回滚', () => {
      const result = rollbackManager.shouldAutoRollback({
        errorRate: 0.01,
        p99LatencyMs: 5000,
        healthCheckPassed: true,
      });
      expect(result).toBe(true);
    });

    it('连续健康检查失败应触发回滚', () => {
      rollbackManager.recordHealthCheck(false);
      rollbackManager.recordHealthCheck(false);
      const result = rollbackManager.shouldAutoRollback({
        errorRate: 0.01,
        p99LatencyMs: 500,
        healthCheckPassed: false,
      });
      expect(result).toBe(true);
    });

    it('正常指标不应触发回滚', () => {
      rollbackManager.resetHealthCheckCount();
      const result = rollbackManager.shouldAutoRollback({
        errorRate: 0.01,
        p99LatencyMs: 500,
        healthCheckPassed: true,
      });
      expect(result).toBe(false);
    });
  });

  describe('recordHealthCheck / resetHealthCheckCount', () => {
    it('成功的健康检查应重置失败计数', () => {
      rollbackManager.recordHealthCheck(false);
      rollbackManager.recordHealthCheck(false);
      rollbackManager.recordHealthCheck(true);
      expect(rollbackManager.getConsecutiveFailures()).toBe(0);
    });

    it('失败的健康检查应增加计数', () => {
      rollbackManager.recordHealthCheck(false);
      expect(rollbackManager.getConsecutiveFailures()).toBe(1);
      rollbackManager.recordHealthCheck(false);
      expect(rollbackManager.getConsecutiveFailures()).toBe(2);
    });

    it('reset 应清零', () => {
      rollbackManager.recordHealthCheck(false);
      rollbackManager.recordHealthCheck(false);
      rollbackManager.resetHealthCheckCount();
      expect(rollbackManager.getConsecutiveFailures()).toBe(0);
    });
  });

  describe('updatePolicy / getPolicy', () => {
    it('应该更新策略', () => {
      rollbackManager.updatePolicy({ errorRateThreshold: 0.1 });
      const policy = rollbackManager.getPolicy();
      expect(policy.errorRateThreshold).toBe(0.1);
    });

    it('应该返回策略副本', () => {
      const p1 = rollbackManager.getPolicy();
      const p2 = rollbackManager.getPolicy();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });
  });

  describe('cleanup', () => {
    it('应该清理旧快照', () => {
      for (let i = 0; i < 15; i++) {
        rollbackManager.saveSnapshot(`cleanup-v${i}`, {}, 'test');
      }
      const removed = rollbackManager.cleanup(10);
      expect(removed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateReport', () => {
    it('应该生成回滚报告', () => {
      const execution = rollbackManager.executeRollback('v2.0', 'v1.0', '测试报告');
      const report = rollbackManager.generateReport(execution.id);
      expect(report).toContain('v2.0');
      expect(report).toContain('v1.0');
      expect(report).toContain('manual');
      expect(report).toContain('测试报告');
    });

    it('不存在的 ID 应返回提示', () => {
      const report = rollbackManager.generateReport('nonexistent');
      expect(report).toContain('不存在');
    });
  });
});
