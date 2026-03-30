/**
 * 部署编排器 - 统一管理蓝绿/灰度/滚动发布
 */

export type DeployStrategy = 'canary' | 'blue-green' | 'rolling' | 'recreate';
export type DeployStatus = 'pending' | 'in_progress' | 'monitoring' | 'promoting' | 'completed' | 'failed' | 'rolled_back';

export interface DeployConfig {
  strategy: DeployStrategy;
  image: string;
  environment: 'staging' | 'production';
  // 灰度配置
  canary?: {
    initialWeight: number;
    maxWeight: number;
    stepSize: number;
    stepInterval: number;  // 秒
    autoPromote: boolean;
  };
  // 蓝绿配置
  blueGreen?: {
    targetColor: 'blue' | 'green';
    switchMethod: 'cookie' | 'instant';
    drainTimeout: number;  // 秒
  };
  // 滚动配置
  rolling?: {
    batchSize: number;
    maxUnavailable: number;
    pauseBetweenBatches: number;
  };
  // 通用
  healthCheck: {
    enabled: boolean;
    url: string;
    interval: number;
    retries: number;
  };
  rollback: {
    enabled: boolean;
    automatic: boolean;
    errorThreshold: number;
    latencyThresholdMs: number;
  };
}

export interface DeployState {
  id: string;
  config: DeployConfig;
  status: DeployStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  currentWeight?: number;
  activeColor?: string;
  currentBatch?: number;
  events: DeployEvent[];
  metrics: DeployMetrics;
  rollbackInfo?: RollbackInfo;
}

export interface DeployEvent {
  timestamp: string;
  type: string;
  message: string;
  severity: 'info' | 'warn' | 'error';
  metadata?: Record<string, unknown>;
}

export interface DeployMetrics {
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  canaryErrorCount?: number;
  canaryErrorRate?: number;
  canaryAvgLatencyMs?: number;
  canaryP99LatencyMs?: number;
}

export interface RollbackInfo {
  reason: string;
  triggeredAt: string;
  previousVersion: string;
  newVersion: string;
}

class DeployOrchestrator {
  private deployments: Map<string, DeployState> = new Map();
  private versionHistory: Array<{ version: string; deployedAt: string }> = [];

  // 启动新部署
  startDeploy(config: DeployConfig): DeployState {
    const id = `${config.strategy}-${Date.now()}`;
    const state: DeployState = {
      id,
      config,
      status: 'pending',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
      metrics: {
        totalRequests: 0,
        errorCount: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        p99LatencyMs: 0,
      },
    };

    // 根据策略设置初始状态
    switch (config.strategy) {
      case 'canary':
        state.currentWeight = config.canary?.initialWeight ?? 10;
        break;
      case 'blue-green':
        state.activeColor = 'blue';
        break;
      case 'rolling':
        state.currentBatch = 0;
        break;
    }

    this.deployments.set(id, state);
    this.addEvent(state, 'info', 'deploy_started', `部署 ${id} 已启动`);
    return state;
  }

  // 获取部署状态
  getDeployState(id: string): DeployState | undefined {
    return this.deployments.get(id);
  }

  // 获取所有部署
  getAllDeployments(): DeployState[] {
    return Array.from(this.deployments.values());
  }

  // 获取最新活跃部署
  getActiveDeploy(): DeployState | undefined {
    for (const [, state] of this.deployments) {
      if (['in_progress', 'monitoring', 'promoting'].includes(state.status)) {
        return state;
      }
    }
    return undefined;
  }

  // 推进部署状态
  advanceDeploy(id: string): DeployState | undefined {
    const state = this.deployments.get(id);
    if (!state) return undefined;

    switch (state.config.strategy) {
      case 'canary':
        return this.advanceCanary(state);
      case 'blue-green':
        return this.advanceBlueGreen(state);
      case 'rolling':
        return this.advanceRolling(state);
      case 'recreate':
        return this.advanceRecreate(state);
    }
    return state;
  }

  private advanceCanary(state: DeployState): DeployState {
    const config = state.config.canary!;
    const currentWeight = state.currentWeight ?? config.initialWeight;

    if (state.status === 'pending') {
      state.status = 'in_progress';
      this.addEvent(state, 'info', 'canary_started', `Canary 已启动，权重 ${currentWeight}%`);
    } else if (state.status === 'in_progress') {
      state.status = 'monitoring';
      this.addEvent(state, 'info', 'monitoring', '进入监控阶段');
    } else if (state.status === 'monitoring') {
      // 检查指标是否正常
      if (this.checkMetrics(state)) {
        if (currentWeight >= config.maxWeight) {
          state.status = 'completed';
          state.completedAt = new Date().toISOString();
          this.addEvent(state, 'info', 'deploy_completed', 'Canary 全量发布完成');
          this.versionHistory.push({ version: state.config.image, deployedAt: new Date().toISOString() });
        } else if (config.autoPromote) {
          state.status = 'promoting';
          state.currentWeight = Math.min(currentWeight + config.stepSize, config.maxWeight);
          this.addEvent(state, 'info', 'promote', `流量提升至 ${state.currentWeight}%`);
          // 回到监控
          state.status = 'monitoring';
        } else {
          state.status = 'completed';
          state.completedAt = new Date().toISOString();
          this.addEvent(state, 'info', 'canary_staged', `灰度部署完成，当前权重 ${currentWeight}%`);
        }
      } else {
        this.rollback(state, '指标异常触发自动回滚');
      }
    }

    state.updatedAt = new Date().toISOString();
    return state;
  }

  private advanceBlueGreen(state: DeployState): DeployState {
    if (state.status === 'pending') {
      state.status = 'in_progress';
      this.addEvent(state, 'info', 'bg_target_start', `启动 ${state.config.blueGreen?.targetColor} 环境`);
    } else if (state.status === 'in_progress') {
      state.status = 'monitoring';
      this.addEvent(state, 'info', 'bg_health_check', '健康检查中');
    } else if (state.status === 'monitoring') {
      if (this.checkMetrics(state)) {
        const oldColor = state.activeColor!;
        state.activeColor = state.config.blueGreen?.targetColor ?? 'green';
        state.status = 'completed';
        state.completedAt = new Date().toISOString();
        this.addEvent(state, 'info', 'bg_switched', `流量已从 ${oldColor} 切换到 ${state.activeColor}`);
        this.versionHistory.push({ version: state.config.image, deployedAt: new Date().toISOString() });
      } else {
        this.rollback(state, '健康检查失败');
      }
    }

    state.updatedAt = new Date().toISOString();
    return state;
  }

  private advanceRolling(state: DeployState): DeployState {
    const config = state.config.rolling!;
    const currentBatch = state.currentBatch ?? 0;
    const totalBatches = Math.ceil(4 / config.batchSize);  // 假设4个实例

    if (state.status === 'pending') {
      state.status = 'in_progress';
      state.currentBatch = 1;
      this.addEvent(state, 'info', 'rolling_start', `滚动部署开始，批次 ${1}/${totalBatches}`);
    } else if (state.status === 'in_progress') {
      if (currentBatch < totalBatches) {
        state.currentBatch = currentBatch + 1;
        this.addEvent(state, 'info', 'rolling_batch', `批次 ${state.currentBatch}/${totalBatches}`);
      } else {
        state.status = 'completed';
        state.completedAt = new Date().toISOString();
        this.addEvent(state, 'info', 'rolling_complete', '滚动部署完成');
        this.versionHistory.push({ version: state.config.image, deployedAt: new Date().toISOString() });
      }
    }

    state.updatedAt = new Date().toISOString();
    return state;
  }

  private advanceRecreate(state: DeployState): DeployState {
    if (state.status === 'pending') {
      state.status = 'in_progress';
      this.addEvent(state, 'info', 'recreate_start', 'Recreate 部署开始');
    } else if (state.status === 'in_progress') {
      state.status = 'completed';
      state.completedAt = new Date().toISOString();
      this.addEvent(state, 'info', 'recreate_complete', 'Recreate 部署完成');
      this.versionHistory.push({ version: state.config.image, deployedAt: new Date().toISOString() });
    }

    state.updatedAt = new Date().toISOString();
    return state;
  }

  // 回滚
  rollback(state: DeployState, reason: string): void {
    const previousVersion = this.versionHistory.length > 0
      ? this.versionHistory[this.versionHistory.length - 1].version
      : 'unknown';

    state.status = 'rolled_back';
    state.completedAt = new Date().toISOString();
    state.rollbackInfo = {
      reason,
      triggeredAt: new Date().toISOString(),
      previousVersion,
      newVersion: state.config.image,
    };

    this.addEvent(state, 'error', 'rollback', `回滚: ${reason}`);
  }

  // 手动回滚
  manualRollback(id: string, reason: string): DeployState | undefined {
    const state = this.deployments.get(id);
    if (!state) return undefined;
    this.rollback(state, reason || '手动回滚');
    state.updatedAt = new Date().toISOString();
    return state;
  }

  // 检查指标
  private checkMetrics(state: DeployState): boolean {
    const { rollback } = state.config;
    if (!rollback.enabled) return true;

    if (state.metrics.errorRate > rollback.errorThreshold) return false;
    if (state.metrics.p99LatencyMs > rollback.latencyThresholdMs) return false;
    return true;
  }

  // 更新指标
  updateMetrics(id: string, metrics: Partial<DeployMetrics>): void {
    const state = this.deployments.get(id);
    if (!state) return;
    Object.assign(state.metrics, metrics);
    state.updatedAt = new Date().toISOString();

    // 自动回滚检查
    if (state.config.rollback.automatic && !this.checkMetrics(state)) {
      this.rollback(state, `自动回滚: 错误率=${state.metrics.errorRate}, P99=${state.metrics.p99LatencyMs}ms`);
    }
  }

  private addEvent(state: DeployState, severity: DeployEvent['severity'], type: string, message: string, metadata?: Record<string, unknown>): void {
    state.events.push({
      timestamp: new Date().toISOString(),
      type,
      message,
      severity,
      metadata,
    });
  }

  // 版本历史
  getVersionHistory(): Array<{ version: string; deployedAt: string }> {
    return [...this.versionHistory];
  }

  // 获取部署摘要
  getDeploySummary(id: string): string {
    const state = this.deployments.get(id);
    if (!state) return '部署不存在';

    const duration = state.completedAt
      ? Math.round((new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()) / 1000)
      : Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000);

    return [
      `部署 ID: ${state.id}`,
      `策略: ${state.config.strategy}`,
      `状态: ${state.status}`,
      `镜像: ${state.config.image}`,
      `耗时: ${duration}s`,
      `事件数: ${state.events.length}`,
      state.currentWeight ? `当前权重: ${state.currentWeight}%` : '',
      state.activeColor ? `活跃环境: ${state.activeColor}` : '',
      state.rollbackInfo ? `回滚原因: ${state.rollbackInfo.reason}` : '',
    ].filter(Boolean).join('\n');
  }
}

export const deployOrchestrator = new DeployOrchestrator();
