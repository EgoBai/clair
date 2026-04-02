/**
 * PerformanceMonitor - 前端性能监控工具
 * 监控渲染耗时、内存使用、交互延迟等
 */

export interface PerfEntry {
  name: string;
  startTime: number;
  duration: number;
  type: 'render' | 'api' | 'computation' | 'interaction' | 'navigation';
}

export interface PerfStats {
  name: string;
  count: number;
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface PerfConfig {
  maxEntries: number;
  slowThreshold: number;    // 毫秒
  enableMemoryTracking: boolean;
}

const DEFAULT_CONFIG: PerfConfig = {
  maxEntries: 1000,
  slowThreshold: 100,
  enableMemoryTracking: true,
};

export class PerformanceMonitor {
  private entries: PerfEntry[] = [];
  private activeMarks: Map<string, number> = new Map();
  private config: PerfConfig;

  constructor(config: Partial<PerfConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  startMark(name: string): void {
    this.activeMarks.set(name, performance.now());
  }

  endMark(name: string, type: PerfEntry['type'] = 'computation'): PerfEntry | null {
    const start = this.activeMarks.get(name);
    if (start === undefined) return null;
    this.activeMarks.delete(name);

    const entry: PerfEntry = {
      name,
      startTime: start,
      duration: performance.now() - start,
      type,
    };
    this.addEntry(entry);
    return entry;
  }

  measure<T>(name: string, fn: () => T, type: PerfEntry['type'] = 'computation'): T {
    const start = performance.now();
    const result = fn();
    const entry: PerfEntry = { name, startTime: start, duration: performance.now() - start, type };
    this.addEntry(entry);
    return result;
  }

  async measureAsync<T>(name: string, fn: () => Promise<T>, type: PerfEntry['type'] = 'api'): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const entry: PerfEntry = { name, startTime: start, duration: performance.now() - start, type };
    this.addEntry(entry);
    return result;
  }

  private addEntry(entry: PerfEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }
  }

  getEntries(filter?: { name?: string; type?: PerfEntry['type'] }): PerfEntry[] {
    return this.entries.filter(e => {
      if (filter?.name && e.name !== filter.name) return false;
      if (filter?.type && e.type !== filter.type) return false;
      return true;
    });
  }

  getStats(name?: string): PerfStats[] {
    const groups = new Map<string, number[]>();
    const filtered = name ? this.entries.filter(e => e.name === name) : this.entries;

    for (const e of filtered) {
      if (!groups.has(e.name)) groups.set(e.name, []);
      groups.get(e.name)!.push(e.duration);
    }

    return Array.from(groups.entries()).map(([n, durations]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      const count = sorted.length;
      return {
        name: n,
        count,
        avgDuration: sorted.reduce((s, v) => s + v, 0) / count,
        maxDuration: sorted[count - 1],
        minDuration: sorted[0],
        p50: sorted[Math.floor(count * 0.5)],
        p95: sorted[Math.floor(count * 0.95)],
        p99: sorted[Math.floor(count * 0.99)],
      };
    }).sort((a, b) => b.avgDuration - a.avgDuration);
  }

  getSlowEntries(): PerfEntry[] {
    return this.entries.filter(e => e.duration > this.config.slowThreshold);
  }

  getMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
    if (!this.config.enableMemoryTracking) return null;
    const perf = performance as any;
    if (perf.memory) {
      return {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
      };
    }
    return null;
  }

  clear(): void {
    this.entries = [];
    this.activeMarks.clear();
  }

  getSummary(): {
    totalEntries: number;
    slowEntries: number;
    avgDuration: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    let totalDuration = 0;
    let slowCount = 0;

    for (const e of this.entries) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      totalDuration += e.duration;
      if (e.duration > this.config.slowThreshold) slowCount++;
    }

    return {
      totalEntries: this.entries.length,
      slowEntries: slowCount,
      avgDuration: this.entries.length > 0 ? totalDuration / this.entries.length : 0,
      byType,
    };
  }
}

export function createPerfMonitor(config?: Partial<PerfConfig>): PerformanceMonitor {
  return new PerformanceMonitor(config);
}
