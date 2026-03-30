/**
 * 部署回滚管理器
 * 支持自动/手动回滚、版本快照、健康检查驱动回滚
 */

export interface RollbackSnapshot {
  version: string;
  config: Record<string, unknown>;
  database?: {
    migrationVersion: string;
    backupPath?: string;
  };
  timestamp: string;
  environment: string;
}

export interface RollbackPolicy {
  // 自动回滚条件
  autoRollback: boolean;
  errorRateThreshold: number;      // 错误率阈值 (0-1)
  latencyThresholdMs: number;      // 延迟阈值
  healthCheckFailures: number;     // 连续健康检查失败次数
  monitorWindowSeconds: number;    // 监控窗口
  // 回滚行为
  rollbackStrategy: 'immediate' | 'gradual';
  drainTimeout: number;            // 优雅关闭超时
  notifyOnRollback: boolean;
  preserveLogs: boolean;
}

export interface RollbackExecution {
  id: string;
  fromVersion: string;
  toVersion: string;
  reason: string;
  trigger: 'automatic' | 'manual' | 'health_check' | 'metrics';
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  steps: RollbackStep[];
}

export interface RollbackStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

class RollbackManager {
  private snapshots: Map<string, RollbackSnapshot> = new Map();
  private rollbacks: Map<string, RollbackExecution> = new Map();
  private policy: RollbackPolicy;
  private consecutiveFailures = 0;

  constructor(policy?: Partial<RollbackPolicy>) {
    this.policy = {
      autoRollback: true,
      errorRateThreshold: 0.05,
      latencyThresholdMs: 2000,
      healthCheckFailures: 3,
      monitorWindowSeconds: 300,
      rollbackStrategy: 'immediate',
      drainTimeout: 30,
      notifyOnRollback: true,
      preserveLogs: true,
      ...policy,
    };
  }

  // 保存版本快照
  saveSnapshot(version: string, config: Record<string, unknown>, environment: string): RollbackSnapshot {
    const snapshot: RollbackSnapshot = {
      version,
      config,
      timestamp: new Date().toISOString(),
      environment,
    };
    this.snapshots.set(version, snapshot);
    return snapshot;
  }

  // 获取快照
  getSnapshot(version: string): RollbackSnapshot | undefined {
    return this.snapshots.get(version);
  }

  // 获取所有快照
  getAllSnapshots(): RollbackSnapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // 执行回滚
  executeRollback(fromVersion: string, toVersion: string, reason: string, trigger: RollbackExecution['trigger'] = 'manual'): RollbackExecution {
    const id = `rollback-${Date.now()}`;
    const execution: RollbackExecution = {
      id,
      fromVersion,
      toVersion,
      reason,
      trigger,
      startedAt: new Date().toISOString(),
      status: 'pending',
      steps: [
        { name: 'validate_target', status: 'pending' },
        { name: 'drain_connections', status: 'pending' },
        { name: 'switch_traffic', status: 'pending' },
        { name: 'health_check', status: 'pending' },
        { name: 'cleanup', status: 'pending' },
      ],
    };

    this.rollbacks.set(id, execution);
    return execution;
  }

  // 推进回滚步骤
  advanceRollback(id: string): RollbackExecution | undefined {
    const execution = this.rollbacks.get(id);
    if (!execution) return undefined;

    if (execution.status === 'pending') {
      execution.status = 'in_progress';
      execution.steps[0].status = 'running';
      execution.steps[0].startedAt = new Date().toISOString();
    } else if (execution.status === 'in_progress') {
      const currentIdx = execution.steps.findIndex(s => s.status === 'running');
      if (currentIdx >= 0) {
        // 完成当前步骤
        execution.steps[currentIdx].status = 'completed';
        execution.steps[currentIdx].completedAt = new Date().toISOString();

        // 推进到下一步
        if (currentIdx + 1 < execution.steps.length) {
          execution.steps[currentIdx + 1].status = 'running';
          execution.steps[currentIdx + 1].startedAt = new Date().toISOString();
        } else {
          execution.status = 'completed';
          execution.completedAt = new Date().toISOString();
        }
      }
    }

    return execution;
  }

  // 获取回滚执行状态
  getRollbackExecution(id: string): RollbackExecution | undefined {
    return this.rollbacks.get(id);
  }

  // 获取所有回滚记录
  getAllRollbacks(): RollbackExecution[] {
    return Array.from(this.rollbacks.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  // 检查是否应自动回滚
  shouldAutoRollback(metrics: { errorRate: number; p99LatencyMs: number; healthCheckPassed: boolean }): boolean {
    if (!this.policy.autoRollback) return false;

    if (!metrics.healthCheckPassed) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.policy.healthCheckFailures) {
        return true;
      }
    } else {
      this.consecutiveFailures = 0;
    }

    if (metrics.errorRate > this.policy.errorRateThreshold) return true;
    if (metrics.p99LatencyMs > this.policy.latencyThresholdMs) return true;

    return false;
  }

  // 记录健康检查结果
  recordHealthCheck(passed: boolean): void {
    if (passed) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }
  }

  // 重置健康检查计数
  resetHealthCheckCount(): void {
    this.consecutiveFailures = 0;
  }

  // 更新策略
  updatePolicy(updates: Partial<RollbackPolicy>): void {
    Object.assign(this.policy, updates);
  }

  // 获取当前策略
  getPolicy(): RollbackPolicy {
    return { ...this.policy };
  }

  // 获取连续失败次数
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  // 清理旧快照
  cleanup(keepLast: number = 10): number {
    const sorted = this.getAllSnapshots();
    if (sorted.length <= keepLast) return 0;

    const toRemove = sorted.slice(keepLast);
    for (const snapshot of toRemove) {
      this.snapshots.delete(snapshot.version);
    }
    return toRemove.length;
  }

  // 导出回滚报告
  generateReport(id: string): string {
    const execution = this.rollbacks.get(id);
    if (!execution) return '回滚记录不存在';

    const duration = execution.completedAt
      ? Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)
      : '进行中';

    return [
      `=== 回滚报告 ===`,
      `ID: ${execution.id}`,
      `触发方式: ${execution.trigger}`,
      `原因: ${execution.reason}`,
      `版本: ${execution.fromVersion} → ${execution.toVersion}`,
      `状态: ${execution.status}`,
      `耗时: ${duration}${typeof duration === 'number' ? 's' : ''}`,
      `步骤:`,
      ...execution.steps.map(s => `  - ${s.name}: ${s.status}`),
    ].join('\n');
  }
}

export const rollbackManager = new RollbackManager();
