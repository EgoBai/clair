/**
 * Performance Monitor
 * 前端性能监控 - Web Vitals + 自定义指标
 */

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'score';
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PerformanceReport {
  metrics: PerformanceMetric[];
  startTime: number;
  endTime: number;
  url: string;
  userAgent: string;
}

type MetricCallback = (metric: PerformanceMetric) => void;

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private timers: Map<string, number> = new Map();
  private observers: Set<MetricCallback> = new Set();
  private maxMetrics: number = 500;

  constructor() {
    this.setupWebVitals();
  }

  private setupWebVitals(): void {
    if (typeof window === 'undefined' || !window.PerformanceObserver) return;

    // LCP - Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { size?: number };
        this.record('LCP', lastEntry.startTime, 'ms');
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* not supported */ }

    // FID - First Input Delay
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0] as PerformanceEventTiming;
        this.record('FID', entry.processingStart - entry.startTime, 'ms');
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    } catch { /* not supported */ }

    // CLS - Cumulative Layout Shift
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        this.record('CLS', clsValue, 'score');
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch { /* not supported */ }
  }

  record(name: string, value: number, unit: PerformanceMetric['unit'] = 'ms', tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
    };

    if (this.metrics.length >= this.maxMetrics) {
      this.metrics.shift();
    }

    this.metrics.push(metric);
    this.observers.forEach(cb => cb(metric));
  }

  startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  endTimer(name: string, tags?: Record<string, string>): number {
    const start = this.timers.get(name);
    if (start === undefined) return -1;

    const duration = performance.now() - start;
    this.timers.delete(name);
    this.record(name, duration, 'ms', tags);
    return duration;
  }

  measureAsync<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
    const start = performance.now();
    return fn().then(
      result => {
        this.record(name, performance.now() - start, 'ms', { ...tags, status: 'success' });
        return result;
      },
      error => {
        this.record(name, performance.now() - start, 'ms', { ...tags, status: 'error' });
        throw error;
      }
    );
  }

  measureSync<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
    const start = performance.now();
    try {
      const result = fn();
      this.record(name, performance.now() - start, 'ms', { ...tags, status: 'success' });
      return result;
    } catch (error) {
      this.record(name, performance.now() - start, 'ms', { ...tags, status: 'error' });
      throw error;
    }
  }

  recordResourceTiming(url: string): void {
    if (typeof performance === 'undefined') return;

    const entries = performance.getEntriesByName(url, 'resource');
    for (const entry of entries) {
      this.record('resource:total', entry.duration, 'ms', { url });
      if ('transferSize' in entry) {
        this.record('resource:size', (entry as PerformanceResourceTiming).transferSize, 'bytes', { url });
      }
    }
  }

  subscribe(callback: MetricCallback): () => void {
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  getMetrics(name?: string): PerformanceMetric[] {
    if (name) return this.metrics.filter(m => m.name === name);
    return [...this.metrics];
  }

  getAverage(name: string): number {
    const filtered = this.metrics.filter(m => m.name === name);
    if (filtered.length === 0) return 0;
    return filtered.reduce((s, m) => s + m.value, 0) / filtered.length;
  }

  getP95(name: string): number {
    const values = this.metrics
      .filter(m => m.name === name)
      .map(m => m.value)
      .sort((a, b) => a - b);
    if (values.length === 0) return 0;
    const idx = Math.floor(values.length * 0.95);
    return values[Math.min(idx, values.length - 1)];
  }

  generateReport(): PerformanceReport {
    return {
      metrics: [...this.metrics],
      startTime: this.metrics[0]?.timestamp ?? Date.now(),
      endTime: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };
  }

  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }

  getMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
      };
    }
    return null;
  }
}

export const perfMonitor = new PerformanceMonitor();
