/**
 * 缓存失效路由器
 * 基于事件驱动的智能失效策略
 * 支持：时间窗口、数据依赖图、版本向量、延迟失效
 * Round 98: 缓存失效策略增强
 */

// 失效原因
export type InvalidationReason =
  | 'ttl-expired'
  | 'manual'
  | 'dependency-changed'
  | 'threshold-exceeded'
  | 'version-conflict'
  | 'data-stale'
  | 'memory-pressure';

// 失效事件
export interface InvalidationEvent {
  key: string;
  reason: InvalidationReason;
  timestamp: number;
  source: string;
  metadata?: Record<string, any>;
}

// 依赖图节点
interface DependencyNode {
  key: string;
  dependsOn: Set<string>; // 此key依赖哪些key
  dependedBy: Set<string>; // 哪些key依赖此key
  version: number;
  lastUpdated: number;
}

// 延迟失效任务
interface DelayedInvalidation {
  key: string;
  reason: InvalidationReason;
  scheduledAt: number;
  delayMs: number;
}

export class CacheInvalidationRouter {
  // 依赖图
  private dependencyGraph = new Map<string, DependencyNode>();
  // 失效历史
  private history: InvalidationEvent[] = [];
  private historyLimit = 500;
  // 延迟失效队列
  private delayedQueue: DelayedInvalidation[] = [];
  private delayedTimer: ReturnType<typeof setInterval> | null = null;
  // 统计
  private stats = {
    totalInvalidations: 0,
    cascadeInvalidations: 0,
    delayedInvalidations: 0,
    byReason: new Map<InvalidationReason, number>(),
  };
  // 事件监听器
  private listeners = new Map<string, Set<(event: InvalidationEvent) => void>>();

  // ========== 依赖图管理 ==========

  /**
   * 注册依赖关系：key依赖于dependencies
   */
  addDependency(key: string, dependencies: string[]): void {
    if (!this.dependencyGraph.has(key)) {
      this.dependencyGraph.set(key, {
        key,
        dependsOn: new Set(),
        dependedBy: new Set(),
        version: 0,
        lastUpdated: Date.now(),
      });
    }
    const node = this.dependencyGraph.get(key)!;

    for (const dep of dependencies) {
      node.dependsOn.add(dep);

      if (!this.dependencyGraph.has(dep)) {
        this.dependencyGraph.set(dep, {
          key: dep,
          dependsOn: new Set(),
          dependedBy: new Set(),
          version: 0,
          lastUpdated: Date.now(),
        });
      }
      this.dependencyGraph.get(dep)!.dependedBy.add(key);
    }
  }

  /**
   * 移除依赖
   */
  removeDependency(key: string, dependency: string): void {
    const node = this.dependencyGraph.get(key);
    const depNode = this.dependencyGraph.get(dependency);
    if (node) node.dependsOn.delete(dependency);
    if (depNode) depNode.dependedBy.delete(key);
  }

  /**
   * 获取依赖链
   */
  getDependencyChain(key: string, direction: 'up' | 'down' = 'down'): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const traverse = (currentKey: string) => {
      if (visited.has(currentKey)) return;
      visited.add(currentKey);
      result.push(currentKey);

      const node = this.dependencyGraph.get(currentKey);
      if (!node) return;

      const next = direction === 'down' ? node.dependedBy : node.dependsOn;
      for (const k of next) {
        traverse(k);
      }
    };

    traverse(key);
    return result.slice(1); // 排除自身
  }

  // ========== 失效操作 ==========

  /**
   * 失效单个key，级联失效依赖方
   */
  invalidate(key: string, reason: InvalidationReason = 'manual', source = 'direct'): string[] {
    const invalidated: string[] = [];
    const event: InvalidationEvent = {
      key,
      reason,
      timestamp: Date.now(),
      source,
    };

    // 失效自身
    invalidated.push(key);
    this.recordEvent(event);

    // 版本冲突时更新版本
    const node = this.dependencyGraph.get(key);
    if (node) {
      node.version++;
      node.lastUpdated = Date.now();
    }

    // 级联失效所有依赖此key的缓存
    const cascade = this.getDependencyChain(key, 'down');
    for (const depKey of cascade) {
      invalidated.push(depKey);
      const depNode = this.dependencyGraph.get(depKey);
      if (depNode) {
        depNode.version++;
        depNode.lastUpdated = Date.now();
      }
      const cascadeEvent: InvalidationEvent = {
        key: depKey,
        reason: 'dependency-changed',
        timestamp: Date.now(),
        source: `cascade:${key}`,
      };
      this.recordEvent(cascadeEvent);
      this.emit(cascadeEvent);
      this.stats.cascadeInvalidations++;
    }

    this.stats.totalInvalidations += invalidated.length;
    this.stats.byReason.set(reason, (this.stats.byReason.get(reason) || 0) + 1);

    // 触发监听器
    this.emit(event);

    return invalidated;
  }

  /**
   * 批量失效
   */
  invalidateBatch(keys: string[], reason: InvalidationReason = 'manual'): string[] {
    const allInvalidated = new Set<string>();
    for (const key of keys) {
      for (const k of this.invalidate(key, reason)) {
        allInvalidated.add(k);
      }
    }
    return Array.from(allInvalidated);
  }

  /**
   * 按pattern匹配失效
   */
  invalidatePattern(pattern: string, reason: InvalidationReason = 'manual'): string[] {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const matched: string[] = [];

    for (const key of this.dependencyGraph.keys()) {
      if (regex.test(key)) {
        matched.push(key);
      }
    }

    return this.invalidateBatch(matched, reason);
  }

  // ========== 延迟失效 ==========

  /**
   * 延迟失效 - 用于写后延迟失效策略
   */
  scheduleDelayedInvalidation(
    key: string,
    delayMs: number,
    reason: InvalidationReason = 'data-stale'
  ): void {
    this.delayedQueue.push({
      key,
      reason,
      scheduledAt: Date.now(),
      delayMs,
    });

    if (!this.delayedTimer) {
      this.delayedTimer = setInterval(() => this.processDelayedQueue(), 100);
    }
  }

  private processDelayedQueue(): void {
    const now = Date.now();
    const ready: DelayedInvalidation[] = [];
    const pending: DelayedInvalidation[] = [];

    for (const item of this.delayedQueue) {
      if (now - item.scheduledAt >= item.delayMs) {
        ready.push(item);
      } else {
        pending.push(item);
      }
    }

    this.delayedQueue = pending;

    for (const item of ready) {
      this.invalidate(item.key, item.reason, 'delayed');
      this.stats.delayedInvalidations++;
    }

    if (this.delayedQueue.length === 0 && this.delayedTimer) {
      clearInterval(this.delayedTimer);
      this.delayedTimer = null;
    }
  }

  // ========== 版本控制 ==========

  /**
   * 获取key的当前版本
   */
  getVersion(key: string): number {
    return this.dependencyGraph.get(key)?.version ?? 0;
  }

  /**
   * 检查版本是否一致
   */
  checkVersion(key: string, expectedVersion: number): boolean {
    return this.getVersion(key) === expectedVersion;
  }

  /**
   * 强制更新版本（不触发失效）
   */
  bumpVersion(key: string): number {
    if (!this.dependencyGraph.has(key)) {
      this.dependencyGraph.set(key, {
        key,
        dependsOn: new Set(),
        dependedBy: new Set(),
        version: 0,
        lastUpdated: Date.now(),
      });
    }
    const node = this.dependencyGraph.get(key)!;
    node.version++;
    node.lastUpdated = Date.now();
    return node.version;
  }

  // ========== 事件系统 ==========

  on(event: string, handler: (event: InvalidationEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (event: InvalidationEvent) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: InvalidationEvent): void {
    const handlers = this.listeners.get(event.reason);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(event); } catch { /* skip */ }
      }
    }
    // wildcard listeners
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      for (const handler of wildcard) {
        try { handler(event); } catch { /* skip */ }
      }
    }
  }

  // ========== 查询 ==========

  getStats(): {
    totalInvalidations: number;
    cascadeInvalidations: number;
    delayedInvalidations: number;
    byReason: Record<string, number>;
    dependencyCount: number;
    historySize: number;
  } {
    const byReason: Record<string, number> = {};
    this.stats.byReason.forEach((v, k) => { byReason[k] = v; });
    return {
      totalInvalidations: this.stats.totalInvalidations,
      cascadeInvalidations: this.stats.cascadeInvalidations,
      delayedInvalidations: this.stats.delayedInvalidations,
      byReason,
      dependencyCount: this.dependencyGraph.size,
      historySize: this.history.length,
    };
  }

  getHistory(limit = 50): InvalidationEvent[] {
    return this.history.slice(-limit);
  }

  getDependencyGraph(): Array<{ key: string; dependsOn: string[]; dependedBy: string[]; version: number }> {
    return Array.from(this.dependencyGraph.values()).map(n => ({
      key: n.key,
      dependsOn: Array.from(n.dependsOn),
      dependedBy: Array.from(n.dependedBy),
      version: n.version,
    }));
  }

  // ========== 清理 ==========

  clear(): void {
    this.dependencyGraph.clear();
    this.history = [];
    this.delayedQueue = [];
    this.stats.totalInvalidations = 0;
    this.stats.cascadeInvalidations = 0;
    this.stats.delayedInvalidations = 0;
    this.stats.byReason.clear();
    if (this.delayedTimer) {
      clearInterval(this.delayedTimer);
      this.delayedTimer = null;
    }
  }

  // ========== 内部 ==========

  private recordEvent(event: InvalidationEvent): void {
    this.history.push(event);
    if (this.history.length > this.historyLimit) {
      this.history = this.history.slice(-Math.floor(this.historyLimit / 2));
    }
  }
}

export const cacheInvalidationRouter = new CacheInvalidationRouter();
export default CacheInvalidationRouter;
