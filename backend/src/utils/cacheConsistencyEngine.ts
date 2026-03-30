/**
 * 缓存一致性引擎
 * 保证多级缓存间数据一致性
 * 支持：读修复、写穿透、最终一致性、冲突解决
 * Round 99: 缓存一致性
 */

// 一致性级别
export type ConsistencyLevel = 'strong' | 'eventual' | 'weak';

// 写策略
export type WriteStrategy = 'write-through' | 'write-behind' | 'write-around';

// 冲突解决策略
export type ConflictResolution = 'last-write-wins' | 'first-write-wins' | 'merge' | 'reject';

// 缓存版本记录
interface VersionedValue<T = any> {
  value: T;
  version: number;
  timestamp: number;
  source: string;
  checksum: string;
}

// 写入记录
interface WriteRecord {
  key: string;
  timestamp: number;
  version: number;
  source: string;
  committed: boolean;
}

// 一致性事件
export interface ConsistencyEvent {
  type: 'read-repair' | 'write-conflict' | 'version-mismatch' | 'stale-detected' | 'resolved';
  key: string;
  timestamp: number;
  details: Record<string, any>;
}

export class CacheConsistencyEngine {
  // 版本存储（模拟多级缓存版本追踪）
  private versions = new Map<string, VersionedValue>();
  // 写入日志
  private writeLog: WriteRecord[] = [];
  private writeLogLimit = 1000;
  // 写后缓冲（write-behind用）
  private writeBuffer = new Map<string, { value: any; timestamp: number }>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  // 配置
  private consistencyLevel: ConsistencyLevel;
  private writeStrategy: WriteStrategy;
  private conflictResolution: ConflictResolution;
  // 事件监听
  private eventListeners: Array<(event: ConsistencyEvent) => void> = [];
  // 统计
  private stats = {
    reads: 0,
    writes: 0,
    readRepairs: 0,
    writeConflicts: 0,
    versionMismatches: 0,
    staleReads: 0,
  };

  constructor(
    consistencyLevel: ConsistencyLevel = 'eventual',
    writeStrategy: WriteStrategy = 'write-through',
    conflictResolution: ConflictResolution = 'last-write-wins'
  ) {
    this.consistencyLevel = consistencyLevel;
    this.writeStrategy = writeStrategy;
    this.conflictResolution = conflictResolution;
  }

  // ========== 读操作 ==========

  /**
   * 读取并校验一致性
   */
  read<T>(key: string, source = 'L1'): { value: T | null; consistent: boolean; repaired: boolean } {
    this.stats.reads++;
    const versioned = this.versions.get(key);

    if (!versioned) {
      return { value: null, consistent: true, repaired: false };
    }

    // 强一致性：直接返回
    if (this.consistencyLevel === 'strong') {
      return { value: versioned.value as T, consistent: true, repaired: false };
    }

    // 最终一致性：检查是否需要读修复
    const checksum = this.computeChecksum(versioned.value);
    const isConsistent = checksum === versioned.checksum;

    if (!isConsistent) {
      this.stats.staleReads++;
      this.emitEvent({
        type: 'stale-detected',
        key,
        timestamp: Date.now(),
        details: { source, expected: versioned.checksum, actual: checksum },
      });

      // 读修复
      versioned.checksum = checksum;
      this.stats.readRepairs++;
      this.emitEvent({
        type: 'read-repair',
        key,
        timestamp: Date.now(),
        details: { source },
      });

      return { value: versioned.value as T, consistent: false, repaired: true };
    }

    return { value: versioned.value as T, consistent: true, repaired: false };
  }

  // ========== 写操作 ==========

  /**
   * 写入，按策略分发
   */
  write<T>(key: string, value: T, source = 'direct'): {
    success: boolean;
    version: number;
    conflict: boolean;
  } {
    this.stats.writes++;
    const existing = this.versions.get(key);
    const now = Date.now();

    // 冲突检测
    if (existing && this.consistencyLevel === 'strong') {
      this.stats.writeConflicts++;
      this.emitEvent({
        type: 'write-conflict',
        key,
        timestamp: now,
        details: { existingVersion: existing.version, source },
      });

      const resolved = this.resolveConflict(existing, { value, timestamp: now, source });
      if (resolved === null) {
        return { success: false, version: existing.version, conflict: true };
      }
      // merge策略可能返回合并后的值
      value = resolved as T;
    }

    const newVersion = (existing?.version ?? 0) + 1;
    const checksum = this.computeChecksum(value);

    const versioned: VersionedValue<T> = {
      value,
      version: newVersion,
      timestamp: now,
      source,
      checksum,
    };

    // 按写策略处理
    switch (this.writeStrategy) {
      case 'write-through':
        this.versions.set(key, versioned);
        break;
      case 'write-behind':
        this.writeBuffer.set(key, { value, timestamp: now });
        this.versions.set(key, versioned);
        this.ensureFlushTimer();
        break;
      case 'write-around':
        this.versions.set(key, versioned);
        // 不写入下级缓存，下次读取时加载
        break;
    }

    // 写入日志
    this.writeLog.push({
      key,
      timestamp: now,
      version: newVersion,
      source,
      committed: true,
    });
    if (this.writeLog.length > this.writeLogLimit) {
      this.writeLog = this.writeLog.slice(-Math.floor(this.writeLogLimit / 2));
    }

    return { success: true, version: newVersion, conflict: false };
  }

  /**
   * 批量写入
   */
  writeBatch<T>(entries: Array<{ key: string; value: T; source?: string }>): {
    success: number;
    failed: number;
    conflicts: number;
  } {
    let success = 0;
    let failed = 0;
    let conflicts = 0;

    for (const entry of entries) {
      const result = this.write(entry.key, entry.value, entry.source);
      if (result.success) success++;
      else if (result.conflict) { conflicts++; failed++; }
      else failed++;
    }

    return { success, failed, conflicts };
  }

  // ========== 冲突解决 ==========

  private resolveConflict(
    existing: VersionedValue,
    incoming: { value: any; timestamp: number; source: string }
  ): any | null {
    switch (this.conflictResolution) {
      case 'last-write-wins':
        return incoming.timestamp >= existing.timestamp ? incoming.value : null;
      case 'first-write-wins':
        return null; // 先写的赢，新写入被拒绝
      case 'reject':
        this.emitEvent({
          type: 'version-mismatch',
          key: '',
          timestamp: Date.now(),
          details: { existingVersion: existing.version },
        });
        this.stats.versionMismatches++;
        return null;
      case 'merge':
        // 简单合并策略：对对象类型做浅合并
        if (
          typeof existing.value === 'object' &&
          typeof incoming.value === 'object' &&
          !Array.isArray(existing.value) &&
          !Array.isArray(incoming.value)
        ) {
          return { ...existing.value, ...incoming.value };
        }
        return incoming.timestamp >= existing.timestamp ? incoming.value : null;
      default:
        return incoming.value;
    }
  }

  // ========== 版本管理 ==========

  getVersion(key: string): number {
    return this.versions.get(key)?.version ?? 0;
  }

  checkVersion(key: string, expectedVersion: number): boolean {
    const actual = this.getVersion(key);
    if (actual !== expectedVersion) {
      this.stats.versionMismatches++;
      this.emitEvent({
        type: 'version-mismatch',
        key,
        timestamp: Date.now(),
        details: { expected: expectedVersion, actual },
      });
      return false;
    }
    return true;
  }

  /**
   * 获取所有key的版本摘要
   */
  getVersionSummary(): Array<{ key: string; version: number; age: number }> {
    const now = Date.now();
    return Array.from(this.versions.entries()).map(([key, v]) => ({
      key,
      version: v.version,
      age: now - v.timestamp,
    }));
  }

  // ========== 写后缓冲 ==========

  private ensureFlushTimer(): void {
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flushBuffer(), 1000);
    }
  }

  flushBuffer(): void {
    if (this.writeBuffer.size === 0) return;
    // 缓冲区的值已经在write时写入versions了
    // 这里用于通知下级缓存刷新
    const keys = Array.from(this.writeBuffer.keys());
    this.writeBuffer.clear();

    if (this.writeBuffer.size === 0 && this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ========== 事件 ==========

  onEvent(listener: (event: ConsistencyEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emitEvent(event: ConsistencyEvent): void {
    for (const listener of this.eventListeners) {
      try { listener(event); } catch { /* skip */ }
    }
  }

  // ========== 统计 ==========

  getStats(): typeof this.stats & {
    pendingWrites: number;
    writeLogSize: number;
  } {
    return {
      ...this.stats,
      pendingWrites: this.writeBuffer.size,
      writeLogSize: this.writeLog.length,
    };
  }

  getWriteLog(limit = 50): WriteRecord[] {
    return this.writeLog.slice(-limit);
  }

  // ========== 配置 ==========

  setConsistencyLevel(level: ConsistencyLevel): void {
    this.consistencyLevel = level;
  }

  setWriteStrategy(strategy: WriteStrategy): void {
    this.writeStrategy = strategy;
  }

  setConflictResolution(resolution: ConflictResolution): void {
    this.conflictResolution = resolution;
  }

  getConfig(): {
    consistencyLevel: ConsistencyLevel;
    writeStrategy: WriteStrategy;
    conflictResolution: ConflictResolution;
  } {
    return {
      consistencyLevel: this.consistencyLevel,
      writeStrategy: this.writeStrategy,
      conflictResolution: this.conflictResolution,
    };
  }

  // ========== 清理 ==========

  clear(): void {
    this.versions.clear();
    this.writeLog = [];
    this.writeBuffer.clear();
    this.stats = {
      reads: 0,
      writes: 0,
      readRepairs: 0,
      writeConflicts: 0,
      versionMismatches: 0,
      staleReads: 0,
    };
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ========== 内部 ==========

  private computeChecksum(value: any): string {
    try {
      const str = JSON.stringify(value);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      return hash.toString(36);
    } catch {
      return 'unknown';
    }
  }
}

export const cacheConsistencyEngine = new CacheConsistencyEngine();
export default CacheConsistencyEngine;
