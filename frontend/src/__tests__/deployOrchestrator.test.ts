import { describe, it, expect } from 'vitest';
import { deployOrchestrator } from '../../../backend/src/services/deployOrchestrator';

describe('Deploy Orchestrator', () => {
  describe('灰度部署', () => {
    it('应能启动灰度部署', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'canary',
        image: 'v1.0.0',
        environment: 'production',
        canary: {
          initialWeight: 10,
          maxWeight: 100,
          stepSize: 25,
          stepInterval: 60,
          autoPromote: true,
        },
        healthCheck: { enabled: true, url: '/health', interval: 10, retries: 3 },
        rollback: { enabled: true, automatic: true, errorThreshold: 0.05, latencyThresholdMs: 2000 },
      });
      expect(state.status).toBe('pending');
      expect(state.currentWeight).toBe(10);
      expect(state.config.strategy).toBe('canary');
    });

    it('应能推进灰度状态', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'canary',
        image: 'v1.1.0',
        environment: 'staging',
        canary: { initialWeight: 10, maxWeight: 100, stepSize: 25, stepInterval: 60, autoPromote: false },
        healthCheck: { enabled: true, url: '/health', interval: 10, retries: 3 },
        rollback: { enabled: false, automatic: false, errorThreshold: 0.05, latencyThresholdMs: 2000 },
      });
      
      const advanced = deployOrchestrator.advanceDeploy(state.id);
      expect(advanced?.status).toBe('in_progress');
    });

    it('应能获取部署状态', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'canary',
        image: 'v2.0.0',
        environment: 'production',
        canary: { initialWeight: 5, maxWeight: 100, stepSize: 10, stepInterval: 30, autoPromote: true },
        healthCheck: { enabled: true, url: '/health', interval: 10, retries: 3 },
        rollback: { enabled: true, automatic: true, errorThreshold: 0.05, latencyThresholdMs: 2000 },
      });

      const fetched = deployOrchestrator.getDeployState(state.id);
      expect(fetched).toBeDefined();
      expect(fetched?.config.image).toBe('v2.0.0');
    });
  });

  describe('蓝绿部署', () => {
    it('应能启动蓝绿部署', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'blue-green',
        image: 'v2.0.0',
        environment: 'production',
        blueGreen: { targetColor: 'green', switchMethod: 'cookie', drainTimeout: 30 },
        healthCheck: { enabled: true, url: '/health', interval: 10, retries: 3 },
        rollback: { enabled: true, automatic: false, errorThreshold: 0.05, latencyThresholdMs: 2000 },
      });
      expect(state.config.strategy).toBe('blue-green');
      expect(state.activeColor).toBe('blue');
    });

    it('应能推进蓝绿部署', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'blue-green',
        image: 'v3.0.0',
        environment: 'staging',
        blueGreen: { targetColor: 'green', switchMethod: 'instant', drainTimeout: 60 },
        healthCheck: { enabled: false, url: '', interval: 0, retries: 0 },
        rollback: { enabled: false, automatic: false, errorThreshold: 1, latencyThresholdMs: 10000 },
      });

      deployOrchestrator.advanceDeploy(state.id);
      const advanced = deployOrchestrator.getDeployState(state.id);
      expect(advanced?.status).toBe('in_progress');
    });
  });

  describe('滚动部署', () => {
    it('应能启动滚动部署', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'rolling',
        image: 'v4.0.0',
        environment: 'production',
        rolling: { batchSize: 2, maxUnavailable: 1, pauseBetweenBatches: 30 },
        healthCheck: { enabled: true, url: '/health', interval: 10, retries: 3 },
        rollback: { enabled: true, automatic: true, errorThreshold: 0.05, latencyThresholdMs: 2000 },
      });
      expect(state.config.strategy).toBe('rolling');
      expect(state.currentBatch).toBe(0);
    });

    it('应能推进滚动部署批次', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'rolling',
        image: 'v5.0.0',
        environment: 'staging',
        rolling: { batchSize: 1, maxUnavailable: 1, pauseBetweenBatches: 10 },
        healthCheck: { enabled: false, url: '', interval: 0, retries: 0 },
        rollback: { enabled: false, automatic: false, errorThreshold: 1, latencyThresholdMs: 10000 },
      });

      deployOrchestrator.advanceDeploy(state.id);
      const advanced = deployOrchestrator.getDeployState(state.id);
      expect(advanced?.status).toBe('in_progress');
      expect(advanced?.currentBatch).toBe(1);
    });
  });

  describe('回滚', () => {
    it('应能手动回滚', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'canary',
        image: 'v_bad',
        environment: 'production',
        canary: { initialWeight: 10, maxWeight: 100, stepSize: 10, stepInterval: 60, autoPromote: false },
        healthCheck: { enabled: true, url: '/health', interval: 10, retries: 3 },
        rollback: { enabled: true, automatic: true, errorThreshold: 0.05, latencyThresholdMs: 2000 },
      });

      const rolled = deployOrchestrator.manualRollback(state.id, '测试回滚');
      expect(rolled?.status).toBe('rolled_back');
      expect(rolled?.rollbackInfo?.reason).toBe('测试回滚');
    });

    it('应能更新指标并触发自动回滚', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'canary',
        image: 'v_high_error',
        environment: 'production',
        canary: { initialWeight: 10, maxWeight: 100, stepSize: 10, stepInterval: 60, autoPromote: false },
        healthCheck: { enabled: true, url: '/health', interval: 10, retries: 3 },
        rollback: { enabled: true, automatic: true, errorThreshold: 0.05, latencyThresholdMs: 2000 },
      });

      deployOrchestrator.updateMetrics(state.id, {
        errorRate: 0.15,  // 超过5%阈值
        p99LatencyMs: 500,
      });

      const updated = deployOrchestrator.getDeployState(state.id);
      expect(updated?.status).toBe('rolled_back');
    });
  });

  describe('通用功能', () => {
    it('应能获取所有部署列表', () => {
      const all = deployOrchestrator.getAllDeployments();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });

    it('应能获取部署摘要', () => {
      const state = deployOrchestrator.startDeploy({
        strategy: 'recreate',
        image: 'v6.0.0',
        environment: 'staging',
        healthCheck: { enabled: false, url: '', interval: 0, retries: 0 },
        rollback: { enabled: false, automatic: false, errorThreshold: 1, latencyThresholdMs: 10000 },
      });

      const summary = deployOrchestrator.getDeploySummary(state.id);
      expect(summary).toContain('v6.0.0');
      expect(summary).toContain('recreate');
    });

    it('应返回版本历史', () => {
      const history = deployOrchestrator.getVersionHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
