/**
 * PerformanceMonitor - 前端性能监控工具 (TradingView/Bloomberg级)
 * 
 * 功能:
 * - Core Web Vitals 实时采集 (PerformanceObserver)
 * - 渲染性能追踪 (LCP, FCP, CLS, FID, INP, TTFB)
 * - Long Task 检测 + 自动上报
 * - Performance Budget 告警
 * - Session 级聚合 + Beacon 上报
 * - 交易级延迟追踪 (chart render, order flow, data grid)
 */

// ==================== 类型定义 ====================

export interface PerfEntry {
  name: string;
  startTime: number;
  duration: number;
  type: 'render' | 'api' | 'computation' | 'interaction' | 'navigation' | 'chart' | 'data-grid' | 'order-flow';
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
  slowThreshold: number;
  enableMemoryTracking: boolean;
  enableLongTaskDetection: boolean;
  longTaskThreshold: number;
  enableBeaconReporting: boolean;
  beaconEndpoint: string;
  beaconInterval: number;
  tradingBudgets: TradingBudgets;
}

export interface TradingBudgets {
  chartRenderMs: number;
  dataGridRenderMs: number;
  orderFlowLatencyMs: number;
  tickUpdateMs: number;
  websocketReconnectMs: number;
}

export interface LongTaskEvent {
  startTime: number;
  duration: number;
  attribution?: string;
}

export interface PerformanceSnapshot {
  timestamp: number;
  sessionId: string;
  url: string;
  entries: PerfEntry[];
  longTasks: LongTaskEvent[];
  memory: { usedJSHeapSize: number; totalJSHeapSize: number } | null;
  vitals: Record<string, { value: number; rating: string }>;
  budgetViolations: BudgetAlert[];
}

export interface BudgetAlert {
  metric: string;
  budget: number;
  actual: number;
  severity: 'warning' | 'critical';
  timestamp: number;
}

// ==================== 常量 ====================

const SESSION_ID = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const DEFAULT_TRADING_BUDGETS: TradingBudgets = {
  chartRenderMs: 50,
  dataGridRenderMs: 33,
  orderFlowLatencyMs: 16,
  tickUpdateMs: 8,
  websocketReconnectMs: 500,
};

const DEFAULT_CONFIG: PerfConfig = {
  maxEntries: 2000,
  slowThreshold: 100,
  enableMemoryTracking: true,
  enableLongTaskDetection: true,
  longTaskThreshold: 50,
  enableBeaconReporting: false,
  beaconEndpoint: '/api/v1/perf/beacon',
  beaconInterval: 30000,
  tradingBudgets: DEFAULT_TRADING_BUDGETS,
};

// ==================== 核心类 ====================

export class PerformanceMonitor {
  private entries: PerfEntry[] = [];
  private longTasks: LongTaskEvent[] = [];
  private activeMarks: Map<string, number> = new Map();
  private budgetAlerts: BudgetAlert[] = [];
  private config: PerfConfig;
  private observers: PerformanceObserver[] = [];
  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private vitalsCache: Record<string, { value: number; rating: string }> = {};

  constructor(config: Partial<PerfConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initObservers();
  }

  // ==================== PerformanceObserver 初始化 ====================

  private initObservers(): void {
    if (typeof PerformanceObserver === 'undefined') return;

    // Long Task 检测
    if (this.config.enableLongTaskDetection) {
      this.observeLongTasks();
    }

    // Largest Contentful Paint
    this.observeLCP();

    // First Contentful Paint
    this.observeFCP();

    // Cumulative Layout Shift
    this.observeCLS();

    // First Input Delay
    this.observeFID();

    // Navigation Timing
    this.observeNavigation();

    // Resource Timing
    this.observeResources();
  }

  private observeLongTasks(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const lt: LongTaskEvent = {
            startTime: entry.startTime,
            duration: entry.duration,
          };
          this.longTasks.push(lt);

          if (entry.duration > this.config.longTaskThreshold * 2) {
            this.budgetAlerts.push({
              metric: 'LongTask',
              budget: this.config.longTaskThreshold,
              actual: entry.duration,
              severity: 'critical',
              timestamp: Date.now(),
            });
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      this.observers.push(observer);
    } catch {
      // longtask not supported
    }
  }

  private observeLCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          const value = lastEntry.startTime;
          this.vitalsCache['LCP'] = { value, rating: this.rateVital('LCP', value) };
        }
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(observer);
    } catch {
      // not supported
    }
  }

  private observeFCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.vitalsCache['FCP'] = { value: entry.startTime, rating: this.rateVital('FCP', entry.startTime) };
          }
        }
      });
      observer.observe({ entryTypes: ['paint'] });
      this.observers.push(observer);
    } catch {
      // not supported
    }
  }

  private observeCLS(): void {
    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!shift.hadRecentInput) {
            clsValue += shift.value ?? 0;
          }
        }
        this.vitalsCache['CLS'] = { value: clsValue, rating: this.rateVital('CLS', clsValue) };
      });
      observer.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(observer);
    } catch {
      // not supported
    }
  }

  private observeFID(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fidEntry = entry as PerformanceEntry & { processingStart?: number };
          const fid = (fidEntry.processingStart ?? 0) - entry.startTime;
          this.vitalsCache['FID'] = { value: fid, rating: this.rateVital('FID', fid) };
        }
      });
      observer.observe({ entryTypes: ['first-input'] });
      this.observers.push(observer);
    } catch {
      // not supported
    }
  }

  private observeNavigation(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const nav = entry as PerformanceNavigationTiming;
          const ttfb = nav.responseStart - nav.requestStart;
          this.vitalsCache['TTFB'] = { value: ttfb, rating: this.rateVital('TTFB', ttfb) };

          this.addEntry({
            name: 'navigation',
            startTime: nav.startTime,
            duration: nav.loadEventEnd - nav.startTime,
            type: 'navigation',
          });
        }
      });
      observer.observe({ entryTypes: ['navigation'] });
      this.observers.push(observer);
    } catch {
      // not supported
    }
  }

  private observeResources(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const res = entry as PerformanceResourceTiming;
          if (res.duration > this.config.slowThreshold) {
            this.addEntry({
              name: `resource:${entry.name.split('/').pop() || entry.name}`,
              startTime: entry.startTime,
              duration: res.duration,
              type: 'api',
            });
          }
        }
      });
      observer.observe({ entryTypes: ['resource'] });
      this.observers.push(observer);
    } catch {
      // not supported
    }
  }

  // ==================== 评级 ====================

  private rateVital(name: string, value: number): string {
    const thresholds: Record<string, [number, number]> = {
      FCP: [1800, 3000], LCP: [2500, 4000], CLS: [0.1, 0.25],
      FID: [100, 300], TTFB: [800, 1800], INP: [200, 500],
    };
    const t = thresholds[name];
    if (!t) return 'good';
    if (value <= t[0]) return 'good';
    if (value <= t[1]) return 'needs-improvement';
    return 'poor';
  }

  // ==================== 手动计时 API ====================

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
    this.checkTradingBudget(entry);
    this.addEntry(entry);
    return entry;
  }

  measure<T>(name: string, fn: () => T, type: PerfEntry['type'] = 'computation'): T {
    const start = performance.now();
    const result = fn();
    const entry: PerfEntry = { name, startTime: start, duration: performance.now() - start, type };
    this.checkTradingBudget(entry);
    this.addEntry(entry);
    return result;
  }

  async measureAsync<T>(name: string, fn: () => Promise<T>, type: PerfEntry['type'] = 'api'): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const entry: PerfEntry = { name, startTime: start, duration: performance.now() - start, type };
    this.checkTradingBudget(entry);
    this.addEntry(entry);
    return result;
  }

  // ==================== Trading Budget 检查 ====================

  private checkTradingBudget(entry: PerfEntry): void {
    const budgets = this.config.tradingBudgets;
    let budget = 0;

    switch (entry.type) {
      case 'chart': budget = budgets.chartRenderMs; break;
      case 'data-grid': budget = budgets.dataGridRenderMs; break;
      case 'order-flow': budget = budgets.orderFlowLatencyMs; break;
      default: return;
    }

    if (entry.duration > budget) {
      this.budgetAlerts.push({
        metric: `${entry.type}:${entry.name}`,
        budget,
        actual: entry.duration,
        severity: entry.duration > budget * 2 ? 'critical' : 'warning',
        timestamp: Date.now(),
      });
    }
  }

  // ==================== 数据管理 ====================

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

  getLongTasks(): LongTaskEvent[] {
    return [...this.longTasks];
  }

  getBudgetAlerts(): BudgetAlert[] {
    return [...this.budgetAlerts];
  }

  getVitals(): Record<string, { value: number; rating: string }> {
    return { ...this.vitalsCache };
  }

  getMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
    if (!this.config.enableMemoryTracking) return null;

    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    };

    if (perf.memory) {
      return {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
      };
    }
    return null;
  }

  // ==================== 快照 + Beacon ====================

  getSnapshot(): PerformanceSnapshot {
    return {
      timestamp: Date.now(),
      sessionId: SESSION_ID,
      url: typeof location !== 'undefined' ? location.href : '',
      entries: this.entries.slice(-100),
      longTasks: this.longTasks.slice(-50),
      memory: this.getMemoryUsage(),
      vitals: this.vitalsCache,
      budgetViolations: this.budgetAlerts.slice(-20),
    };
  }

  startBeaconReporting(): void {
    if (!this.config.enableBeaconReporting) return;
    if (this.beaconTimer) return;

    this.beaconTimer = setInterval(() => {
      this.sendBeacon();
    }, this.config.beaconInterval);
  }

  stopBeaconReporting(): void {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
  }

  private sendBeacon(): void {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;

    const snapshot = this.getSnapshot();
    const payload = JSON.stringify(snapshot);

    try {
      navigator.sendBeacon(this.config.beaconEndpoint, payload);
    } catch {
      // beacon failed
    }
  }

  // ==================== 清理 ====================

  clear(): void {
    this.entries = [];
    this.activeMarks.clear();
    this.longTasks = [];
    this.budgetAlerts = [];
  }

  destroy(): void {
    this.stopBeaconReporting();
    this.observers.forEach(o => {
      try { o.disconnect(); } catch { /* ignore */ }
    });
    this.observers = [];
    this.clear();
  }

  // ==================== 摘要 ====================

  getSummary(): {
    totalEntries: number;
    slowEntries: number;
    longTaskCount: number;
    budgetViolationCount: number;
    avgDuration: number;
    byType: Record<string, number>;
    vitalsScore: number;
  } {
    const byType: Record<string, number> = {};
    let totalDuration = 0;
    let slowCount = 0;

    for (const e of this.entries) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      totalDuration += e.duration;
      if (e.duration > this.config.slowThreshold) slowCount++;
    }

    // Vitals score (weighted)
    const weights: Record<string, number> = { LCP: 25, FID: 25, CLS: 25, FCP: 15, TTFB: 10 };
    let vitalsScore = 100;
    let totalWeight = 0;
    let weightedScore = 0;
    for (const [name, data] of Object.entries(this.vitalsCache)) {
      const w = weights[name] || 10;
      totalWeight += w;
      if (data.rating === 'good') weightedScore += w;
      else if (data.rating === 'needs-improvement') weightedScore += w * 0.5;
    }
    if (totalWeight > 0) vitalsScore = Math.round((weightedScore / totalWeight) * 100);

    return {
      totalEntries: this.entries.length,
      slowEntries: slowCount,
      longTaskCount: this.longTasks.length,
      budgetViolationCount: this.budgetAlerts.length,
      avgDuration: this.entries.length > 0 ? totalDuration / this.entries.length : 0,
      byType,
      vitalsScore,
    };
  }
}

// ==================== 工厂 + 单例 ====================

let _instance: PerformanceMonitor | null = null;

export function createPerfMonitor(config?: Partial<PerfConfig>): PerformanceMonitor {
  return new PerformanceMonitor(config);
}

export function getPerfMonitor(config?: Partial<PerfConfig>): PerformanceMonitor {
  if (!_instance) {
    _instance = new PerformanceMonitor(config);
  }
  return _instance;
}

export function destroyPerfMonitor(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
