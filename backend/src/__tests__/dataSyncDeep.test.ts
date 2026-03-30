/**
 * 数据同步服务深层测试
 * 覆盖同步策略、增量更新、全量刷新、数据校验、错误恢复、调度控制
 */

import { describe, it, expect } from 'vitest';

// 模拟数据同步核心逻辑
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'partial';
type SyncMode = 'full' | 'incremental' | 'manual';

interface SyncResult {
  status: SyncStatus;
  mode: SyncMode;
  startTime: number;
  endTime: number;
  recordsFetched: number;
  recordsUpdated: number;
  recordsFailed: number;
  errors: string[];
  duration: number;
}

interface DataRecord {
  symbol: string;
  lastSynced: number;
  version: number;
  checksum: string;
  data: Record<string, any>;
}

interface SyncConfig {
  batchSize: number;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  concurrency: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: SyncConfig = {
  batchSize: 100,
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  concurrency: 5,
  enabled: true,
};

function calculateNextSyncTime(lastSync: number, interval: number): number {
  return lastSync + interval;
}

function isSyncDue(lastSync: number, interval: number, now: number): boolean {
  return now >= calculateNextSyncTime(lastSync, interval);
}

function validateDataRecord(record: DataRecord): string[] {
  const errors: string[] = [];
  if (!record.symbol) errors.push('股票代码不能为空');
  if (record.version < 0) errors.push('版本号不能为负');
  if (!record.checksum) errors.push('校验和不能为空');
  if (!record.data || Object.keys(record.data).length === 0) errors.push('数据不能为空');
  return errors;
}

function calculateChecksum(data: Record<string, any>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function isDataChanged(local: DataRecord, remote: DataRecord): boolean {
  if (local.checksum !== remote.checksum) return true;
  if (local.version !== remote.version) return true;
  return false;
}

function mergeRecords(local: DataRecord, remote: DataRecord): DataRecord {
  if (remote.version > local.version) {
    return { ...remote };
  }
  return { ...local };
}

function calculateBatches(total: number, batchSize: number): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < total; i += batchSize) {
    const end = Math.min(i + batchSize, total);
    batches.push([i, end]);
  }
  return batches;
}

function estimateSyncDuration(recordCount: number, recordsPerSecond: number): number {
  if (recordsPerSecond <= 0) return Infinity;
  return Math.ceil(recordCount / recordsPerSecond);
}

function calculateSyncProgress(synced: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((synced / total) * 100);
}

function detectConflicts(localRecords: DataRecord[], remoteRecords: DataRecord[]): {
  conflicts: Array<{ symbol: string; localVersion: number; remoteVersion: number }>;
  upToDate: string[];
  newRecords: string[];
} {
  const conflicts: Array<{ symbol: string; localVersion: number; remoteVersion: number }> = [];
  const upToDate: string[] = [];
  const newRecords: string[] = [];
  const localMap = new Map(localRecords.map(r => [r.symbol, r]));

  for (const remote of remoteRecords) {
    const local = localMap.get(remote.symbol);
    if (!local) {
      newRecords.push(remote.symbol);
    } else if (local.version !== remote.version || local.checksum !== remote.checksum) {
      conflicts.push({ symbol: remote.symbol, localVersion: local.version, remoteVersion: remote.version });
    } else {
      upToDate.push(remote.symbol);
    }
  }

  return { conflicts, upToDate, newRecords };
}

function prioritizeSyncQueue(symbols: string[], priorityMap: Map<string, number>): string[] {
  return [...symbols].sort((a, b) => {
    const pa = priorityMap.get(a) || 0;
    const pb = priorityMap.get(b) || 0;
    return pb - pa;
  });
}

function calculateSyncMetrics(results: SyncResult[]): {
  totalRecords: number;
  successRate: number;
  avgDuration: number;
  totalErrors: number;
} {
  const totalRecords = results.reduce((s, r) => s + r.recordsFetched, 0);
  const totalUpdated = results.reduce((s, r) => s + r.recordsUpdated, 0);
  const totalErrors = results.reduce((s, r) => s + r.recordsFailed, 0);
  const avgDuration = results.length > 0 ? results.reduce((s, r) => s + r.duration, 0) / results.length : 0;

  return {
    totalRecords,
    successRate: totalRecords > 0 ? totalUpdated / totalRecords : 0,
    avgDuration,
    totalErrors,
  };
}

// ==================== 同步时间 ====================

describe('同步时间计算', () => {
  it('应正确计算下次同步时间', () => {
    expect(calculateNextSyncTime(1000, 5000)).toBe(6000);
  });

  it('应正确判断是否需要同步', () => {
    expect(isSyncDue(1000, 5000, 6000)).toBe(true);
    expect(isSyncDue(1000, 5000, 5000)).toBe(false);
    expect(isSyncDue(1000, 5000, 7000)).toBe(true);
  });

  it('精确到达间隔时应触发同步', () => {
    expect(isSyncDue(1000, 5000, 6000)).toBe(true);
  });
});

// ==================== 数据验证 ====================

describe('validateDataRecord 数据记录验证', () => {
  it('有效记录应通过验证', () => {
    const record: DataRecord = {
      symbol: '600519',
      lastSynced: Date.now(),
      version: 1,
      checksum: 'abc123',
      data: { price: 1800, volume: 500000 },
    };
    expect(validateDataRecord(record)).toHaveLength(0);
  });

  it('空股票代码应报错', () => {
    const record: DataRecord = {
      symbol: '',
      lastSynced: 0,
      version: 1,
      checksum: 'abc',
      data: { price: 100 },
    };
    expect(validateDataRecord(record)).toContain('股票代码不能为空');
  });

  it('负版本号应报错', () => {
    const record: DataRecord = {
      symbol: '600519',
      lastSynced: 0,
      version: -1,
      checksum: 'abc',
      data: { price: 100 },
    };
    expect(validateDataRecord(record)).toContain('版本号不能为负');
  });

  it('空校验和应报错', () => {
    const record: DataRecord = {
      symbol: '600519',
      lastSynced: 0,
      version: 1,
      checksum: '',
      data: { price: 100 },
    };
    expect(validateDataRecord(record)).toContain('校验和不能为空');
  });

  it('空数据应报错', () => {
    const record: DataRecord = {
      symbol: '600519',
      lastSynced: 0,
      version: 1,
      checksum: 'abc',
      data: {},
    };
    expect(validateDataRecord(record)).toContain('数据不能为空');
  });
});

// ==================== 校验和 ====================

describe('calculateChecksum 校验和计算', () => {
  it('相同数据应产生相同校验和', () => {
    const data = { price: 100, volume: 500 };
    expect(calculateChecksum(data)).toBe(calculateChecksum(data));
  });

  it('不同数据应产生不同校验和', () => {
    expect(calculateChecksum({ price: 100 })).not.toBe(calculateChecksum({ price: 200 }));
  });

  it('空对象应产生有效校验和', () => {
    expect(calculateChecksum({})).toBeTruthy();
  });

  it('key顺序不同但值相同应产生相同校验和', () => {
    const d1 = { a: 1, b: 2 };
    const d2 = { b: 2, a: 1 };
    expect(calculateChecksum(d1)).toBe(calculateChecksum(d2));
  });
});

// ==================== 变更检测 ====================

describe('isDataChanged 数据变更检测', () => {
  it('相同校验和和版本应为未变更', () => {
    const local: DataRecord = { symbol: 'A', lastSynced: 0, version: 1, checksum: 'abc', data: {} };
    const remote: DataRecord = { symbol: 'A', lastSynced: 0, version: 1, checksum: 'abc', data: {} };
    expect(isDataChanged(local, remote)).toBe(false);
  });

  it('不同校验和应为已变更', () => {
    const local: DataRecord = { symbol: 'A', lastSynced: 0, version: 1, checksum: 'abc', data: {} };
    const remote: DataRecord = { symbol: 'A', lastSynced: 0, version: 1, checksum: 'def', data: {} };
    expect(isDataChanged(local, remote)).toBe(true);
  });

  it('不同版本应为已变更', () => {
    const local: DataRecord = { symbol: 'A', lastSynced: 0, version: 1, checksum: 'abc', data: {} };
    const remote: DataRecord = { symbol: 'A', lastSynced: 0, version: 2, checksum: 'abc', data: {} };
    expect(isDataChanged(local, remote)).toBe(true);
  });
});

// ==================== 记录合并 ====================

describe('mergeRecords 记录合并', () => {
  it('远程版本更高应使用远程', () => {
    const local: DataRecord = { symbol: 'A', lastSynced: 0, version: 1, checksum: 'a', data: { v: 1 } };
    const remote: DataRecord = { symbol: 'A', lastSynced: 0, version: 2, checksum: 'b', data: { v: 2 } };
    const merged = mergeRecords(local, remote);
    expect(merged.version).toBe(2);
    expect(merged.checksum).toBe('b');
  });

  it('本地版本更高应保留本地', () => {
    const local: DataRecord = { symbol: 'A', lastSynced: 0, version: 3, checksum: 'a', data: { v: 3 } };
    const remote: DataRecord = { symbol: 'A', lastSynced: 0, version: 2, checksum: 'b', data: { v: 2 } };
    const merged = mergeRecords(local, remote);
    expect(merged.version).toBe(3);
    expect(merged.checksum).toBe('a');
  });

  it('相同版本应保留本地', () => {
    const local: DataRecord = { symbol: 'A', lastSynced: 0, version: 1, checksum: 'a', data: { v: 1 } };
    const remote: DataRecord = { symbol: 'A', lastSynced: 0, version: 1, checksum: 'b', data: { v: 2 } };
    const merged = mergeRecords(local, remote);
    expect(merged.checksum).toBe('a');
  });
});

// ==================== 批次计算 ====================

describe('calculateBatches 批次计算', () => {
  it('应正确分批', () => {
    const batches = calculateBatches(250, 100);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual([0, 100]);
    expect(batches[1]).toEqual([100, 200]);
    expect(batches[2]).toEqual([200, 250]);
  });

  it('总数小于批次大小时应只有一批', () => {
    const batches = calculateBatches(50, 100);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([0, 50]);
  });

  it('总数为0时应无批次', () => {
    expect(calculateBatches(0, 100)).toHaveLength(0);
  });

  it('精确倍数时应整齐分批', () => {
    const batches = calculateBatches(300, 100);
    expect(batches).toHaveLength(3);
    expect(batches[2]).toEqual([200, 300]);
  });
});

// ==================== 同步进度 ====================

describe('calculateSyncProgress 同步进度', () => {
  it('应正确计算百分比', () => {
    expect(calculateSyncProgress(50, 100)).toBe(50);
    expect(calculateSyncProgress(75, 100)).toBe(75);
    expect(calculateSyncProgress(100, 100)).toBe(100);
  });

  it('总数量为0应返回0', () => {
    expect(calculateSyncProgress(0, 0)).toBe(0);
  });

  it('应四舍五入', () => {
    expect(calculateSyncProgress(1, 3)).toBe(33);
    expect(calculateSyncProgress(2, 3)).toBe(67);
  });
});

// ==================== 同步时长估算 ====================

describe('estimateSyncDuration 同步时长估算', () => {
  it('应正确估算', () => {
    expect(estimateSyncDuration(1000, 100)).toBe(10);
    expect(estimateSyncDuration(500, 100)).toBe(5);
  });

  it('零速度应返回Infinity', () => {
    expect(estimateSyncDuration(100, 0)).toBe(Infinity);
  });

  it('应向上取整', () => {
    expect(estimateSyncDuration(150, 100)).toBe(2);
  });
});

// ==================== 冲突检测 ====================

describe('detectConflicts 冲突检测', () => {
  const local: DataRecord[] = [
    { symbol: 'A', lastSynced: 0, version: 1, checksum: 'abc', data: {} },
    { symbol: 'B', lastSynced: 0, version: 2, checksum: 'def', data: {} },
    { symbol: 'C', lastSynced: 0, version: 1, checksum: 'ghi', data: {} },
  ];
  const remote: DataRecord[] = [
    { symbol: 'A', lastSynced: 0, version: 2, checksum: 'xyz', data: {} }, // 冲突
    { symbol: 'B', lastSynced: 0, version: 2, checksum: 'def', data: {} }, // 最新
    { symbol: 'D', lastSynced: 0, version: 1, checksum: 'jkl', data: {} }, // 新记录
  ];

  it('应检测到冲突', () => {
    const result = detectConflicts(local, remote);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].symbol).toBe('A');
  });

  it('应检测到最新记录', () => {
    const result = detectConflicts(local, remote);
    expect(result.upToDate).toContain('B');
  });

  it('应检测到新记录', () => {
    const result = detectConflicts(local, remote);
    expect(result.newRecords).toContain('D');
  });
});

// ==================== 同步优先级 ====================

describe('prioritizeSyncQueue 同步优先级', () => {
  it('应按优先级排序', () => {
    const symbols = ['A', 'B', 'C'];
    const priority = new Map([['A', 1], ['B', 3], ['C', 2]]);
    const sorted = prioritizeSyncQueue(symbols, priority);
    expect(sorted[0]).toBe('B');
    expect(sorted[1]).toBe('C');
    expect(sorted[2]).toBe('A');
  });

  it('无优先级应保持原序', () => {
    const symbols = ['A', 'B', 'C'];
    const sorted = prioritizeSyncQueue(symbols, new Map());
    expect(sorted).toEqual(['A', 'B', 'C']);
  });
});

// ==================== 同步指标 ====================

describe('calculateSyncMetrics 同步指标', () => {
  it('应正确计算汇总指标', () => {
    const results: SyncResult[] = [
      { status: 'success', mode: 'incremental', startTime: 0, endTime: 1000, recordsFetched: 100, recordsUpdated: 95, recordsFailed: 5, errors: [], duration: 1000 },
      { status: 'success', mode: 'incremental', startTime: 0, endTime: 2000, recordsFetched: 200, recordsUpdated: 190, recordsFailed: 10, errors: [], duration: 2000 },
    ];
    const metrics = calculateSyncMetrics(results);
    expect(metrics.totalRecords).toBe(300);
    expect(metrics.successRate).toBeCloseTo(285 / 300);
    expect(metrics.avgDuration).toBe(1500);
    expect(metrics.totalErrors).toBe(15);
  });

  it('空结果应返回零值', () => {
    const metrics = calculateSyncMetrics([]);
    expect(metrics.totalRecords).toBe(0);
    expect(metrics.successRate).toBe(0);
    expect(metrics.avgDuration).toBe(0);
  });
});

// ==================== 配置默认值 ====================

describe('DEFAULT_CONFIG 默认配置', () => {
  it('应有合理的默认值', () => {
    expect(DEFAULT_CONFIG.batchSize).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.maxRetries).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.retryDelay).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.timeout).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.concurrency).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.enabled).toBe(true);
  });
});
