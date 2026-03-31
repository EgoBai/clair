import { describe, it, expect, beforeEach } from 'vitest';
import { deployOrchestrator, DeployConfig } from '../services/deployOrchestrator';

describe('DeployOrchestrator', () => {
  beforeEach(() => {
    // Reset by creating a fresh orchestrator
    // The singleton is shared, so we test its cumulative behavior
  });

  const canaryConfig: DeployConfig = {
    strategy: 'canary',
    image: 'app:v1.0',
    environment: 'production',
    canary: {
      initialWeight: 10,
      maxWeight: 100,
      stepSize: 20,
      stepInterval: 60,
      autoPromote: true,
    },
    healthCheck: {
      enabled: true,
      url: '/health',
      interval: 10,
      retries: 3,
    },
    rollback: {
      enabled: true,
      automatic: true,
      errorThreshold: 0.05,
      latencyThresholdMs: 2000,
    },
  };

  const blueGreenConfig: DeployConfig = {
    strategy: 'blue-green',
    image: 'app:v2.0',
    environment: 'staging',
    blueGreen: {
      targetColor: 'green',
      switchMethod: 'instant',
      drainTimeout: 30,
    },
    healthCheck: {
      enabled: true,
      url: '/health',
      interval: 5,
      retries: 2,
    },
    rollback: {
      enabled: true,
      automatic: false,
      errorThreshold: 0.1,
      latencyThresholdMs: 5000,
    },
  };

  const rollingConfig: DeployConfig = {
    strategy: 'rolling',
    image: 'app:v3.0',
    environment: 'production',
    rolling: {
      batchSize: 2,
      maxUnavailable: 1,
      pauseBetweenBatches: 10,
    },
    healthCheck: {
      enabled: true,
      url: '/health',
      interval: 5,
      retries: 3,
    },
    rollback: {
      enabled: false,
      automatic: false,
      errorThreshold: 0.05,
      latencyThresholdMs: 2000,
    },
  };

  const recreateConfig: DeployConfig = {
    strategy: 'recreate',
    image: 'app:v4.0',
    environment: 'staging',
    healthCheck: {
      enabled: false,
      url: '',
      interval: 0,
      retries: 0,
    },
    rollback: {
      enabled: false,
      automatic: false,
      errorThreshold: 0,
      latencyThresholdMs: 0,
    },
  };

  describe('startDeploy', () => {
    it('应该创建新的部署', () => {
      const state = deployOrchestrator.startDeploy(canaryConfig);
      expect(state.id).toBeDefined();
      expect(state.status).toBe('pending');
      expect(state.config.strategy).toBe('canary');
      expect(state.currentWeight).toBe(10);
    });

    it('blue-green 应该设置初始颜色', () => {
      const state = deployOrchestrator.startDeploy(blueGreenConfig);
      expect(state.activeColor).toBe('blue');
    });

    it('rolling 应该初始化 batch 为 0', () => {
      const state = deployOrchestrator.startDeploy(rollingConfig);
      expect(state.currentBatch).toBe(0);
    });

    it('应该记录部署事件', () => {
      const state = deployOrchestrator.startDeploy(canaryConfig);
      expect(state.events.length).toBeGreaterThan(0);
      expect(state.events[0].severity).toBe('info');
    });
  });

  describe('getDeployState', () => {
    it('应该返回已存在的部署', () => {
      const created = deployOrchestrator.startDeploy(canaryConfig);
      const found = deployOrchestrator.getDeployState(created.id);
      expect(found?.id).toBe(created.id);
    });

    it('不存在的 ID 应该返回 undefined', () => {
      const found = deployOrchestrator.getDeployState('nonexistent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('getAllDeployments', () => {
    it('应该返回所有部署列表', () => {
      const all = deployOrchestrator.getAllDeployments();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe('getActiveDeploy', () => {
    it('应该找到活跃部署', () => {
      const state = deployOrchestrator.startDeploy(canaryConfig);
      deployOrchestrator.advanceDeploy(state.id); // pending -> in_progress
      const active = deployOrchestrator.getActiveDeploy();
      expect(active).toBeDefined();
      expect(['in_progress', 'monitoring', 'promoting']).toContain(active?.status);
    });
  });

  describe('advanceDeploy - canary', () => {
    it('pending 应该变为 in_progress', () => {
      const state = deployOrchestrator.startDeploy({ ...canaryConfig });
      const advanced = deployOrchestrator.advanceDeploy(state.id);
      expect(advanced?.status).toBe('in_progress');
    });

    it('in_progress 应该变为 monitoring', () => {
      const state = deployOrchestrator.startDeploy({ ...canaryConfig });
      deployOrchestrator.advanceDeploy(state.id);
      const advanced = deployOrchestrator.advanceDeploy(state.id);
      expect(advanced?.status).toBe('monitoring');
    });

    it('monitoring + 指标正常 + autoPromote + 未达最大权重 应该提升权重', () => {
      const config: DeployConfig = {
        ...canaryConfig,
        canary: { initialWeight: 10, maxWeight: 100, stepSize: 20, stepInterval: 60, autoPromote: true },
      };
      const state = deployOrchestrator.startDeploy(config);
      deployOrchestrator.advanceDeploy(state.id); // -> in_progress
      deployOrchestrator.advanceDeploy(state.id); // -> monitoring
      const advanced = deployOrchestrator.advanceDeploy(state.id);
      // monitoring -> promoting -> monitoring (auto promote cycle)
      expect(advanced?.currentWeight).toBeGreaterThan(10);
    });

    it('monitoring + 达到最大权重 应该完成', () => {
      const config: DeployConfig = {
        ...canaryConfig,
        canary: { initialWeight: 90, maxWeight: 100, stepSize: 20, stepInterval: 60, autoPromote: true },
      };
      const state = deployOrchestrator.startDeploy(config);
      deployOrchestrator.advanceDeploy(state.id); // -> in_progress
      deployOrchestrator.advanceDeploy(state.id); // -> monitoring
      deployOrchestrator.advanceDeploy(state.id); // monitoring -> promoting -> monitoring (weight=100)
      const advanced = deployOrchestrator.advanceDeploy(state.id); // monitoring, weight>=max -> completed
      expect(advanced?.status).toBe('completed');
    });
  });

  describe('advanceDeploy - blue-green', () => {
    it('pending -> in_progress -> monitoring -> completed', () => {
      const state = deployOrchestrator.startDeploy({ ...blueGreenConfig });
      deployOrchestrator.advanceDeploy(state.id);
      expect(state.status).toBe('in_progress');
      deployOrchestrator.advanceDeploy(state.id);
      expect(state.status).toBe('monitoring');
      deployOrchestrator.advanceDeploy(state.id);
      expect(state.status).toBe('completed');
      expect(state.activeColor).toBe('green');
    });
  });

  describe('advanceDeploy - rolling', () => {
    it('应该逐批次推进', () => {
      const state = deployOrchestrator.startDeploy({ ...rollingConfig });
      deployOrchestrator.advanceDeploy(state.id);
      expect(state.status).toBe('in_progress');
      expect(state.currentBatch).toBe(1);

      deployOrchestrator.advanceDeploy(state.id);
      expect(state.currentBatch).toBe(2);

      // batch 2 >= totalBatches 2, should complete
      deployOrchestrator.advanceDeploy(state.id);
      expect(state.status).toBe('completed');
    });
  });

  describe('advanceDeploy - recreate', () => {
    it('应该快速完成两步部署', () => {
      const state = deployOrchestrator.startDeploy({ ...recreateConfig });
      deployOrchestrator.advanceDeploy(state.id);
      expect(state.status).toBe('in_progress');
      deployOrchestrator.advanceDeploy(state.id);
      expect(state.status).toBe('completed');
    });
  });

  describe('manualRollback', () => {
    it('应该回滚指定部署', () => {
      const state = deployOrchestrator.startDeploy(canaryConfig);
      const rolledBack = deployOrchestrator.manualRollback(state.id, '手动回滚测试');
      expect(rolledBack?.status).toBe('rolled_back');
      expect(rolledBack?.rollbackInfo?.reason).toBe('手动回滚测试');
    });

    it('不存在的 ID 应该返回 undefined', () => {
      const result = deployOrchestrator.manualRollback('nonexistent', 'test');
      expect(result).toBeUndefined();
    });
  });

  describe('updateMetrics', () => {
    it('应该更新部署指标', () => {
      const state = deployOrchestrator.startDeploy({
        ...canaryConfig,
        rollback: { ...canaryConfig.rollback, automatic: false },
      });
      deployOrchestrator.updateMetrics(state.id, {
        errorRate: 0.02,
        p99LatencyMs: 500,
        totalRequests: 1000,
      });

      const updated = deployOrchestrator.getDeployState(state.id);
      expect(updated?.metrics.errorRate).toBe(0.02);
      expect(updated?.metrics.p99LatencyMs).toBe(500);
      expect(updated?.metrics.totalRequests).toBe(1000);
    });

    it('automatic rollback 当错误率超阈值', () => {
      const state = deployOrchestrator.startDeploy({
        ...canaryConfig,
        rollback: { ...canaryConfig.rollback, automatic: true, errorThreshold: 0.05 },
      });
      deployOrchestrator.updateMetrics(state.id, { errorRate: 0.1 });
      const updated = deployOrchestrator.getDeployState(state.id);
      expect(updated?.status).toBe('rolled_back');
    });

    it('不存在的 ID 应该安全处理', () => {
      expect(() => {
        deployOrchestrator.updateMetrics('nonexistent', { errorRate: 0 });
      }).not.toThrow();
    });
  });

  describe('getVersionHistory', () => {
    it('应该返回版本历史数组', () => {
      const history = deployOrchestrator.getVersionHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('getDeploySummary', () => {
    it('应该返回部署摘要字符串', () => {
      const state = deployOrchestrator.startDeploy(canaryConfig);
      const summary = deployOrchestrator.getDeploySummary(state.id);
      expect(summary).toContain(state.id);
      expect(summary).toContain('canary');
      expect(summary).toContain('pending');
    });

    it('不存在的 ID 应该返回提示', () => {
      const summary = deployOrchestrator.getDeploySummary('nonexistent');
      expect(summary).toContain('不存在');
    });
  });
});
