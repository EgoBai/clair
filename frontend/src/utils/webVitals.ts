/**
 * Web Vitals 性能监控工具
 * 监控 FCP / LCP / CLS / FID / TTFB / INP
 * 
 * 参考 Google Core Web Vitals 标准
 * 阈值：
 *   LCP: < 2.5s (Good) / < 4.0s (Needs Improvement)
 *   FID: < 100ms (Good) / < 300ms (Needs Improvement)
 *   CLS: < 0.1 (Good) / < 0.25 (Needs Improvement)
 *   FCP: < 1.8s (Good) / < 3.0s (Needs Improvement)
 *   TTFB: < 800ms (Good) / < 1800ms (Needs Improvement)
 *   INP: < 200ms (Good) / < 500ms (Needs Improvement)
 */

// ==================== 类型定义 ====================
interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: string;
  timestamp: number;
}

interface PerformanceBudget {
  lcp: number;
  fid: number;
  cls: number;
  fcp: number;
  ttfb: number;
  inp: number;
  totalJSSize: number;
  totalCSSSize: number;
  totalImageSize: number;
  totalFontSize: number;
}

type MetricCallback = (metric: WebVitalMetric) => void;

// ==================== 阈值配置 ====================
const THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  INP: { good: 200, poor: 500 },
};

// ==================== 性能评分 ====================
function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name];
  if (!threshold) return 'good';
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

// ==================== 生成唯一ID ====================
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ==================== 指标收集器 ====================
class WebVitalsCollector {
  private metrics: Map<string, WebVitalMetric> = new Map();
  private callbacks: MetricCallback[] = [];
  private reported: Set<string> = new Set();

  onMetric(callback: MetricCallback): void {
    this.callbacks.push(callback);
  }

  private reportMetric(metric: WebVitalMetric): void {
    // 去重（同一指标只报告变化值）
    const key = metric.name;
    const existing = this.metrics.get(key);

    if (existing && existing.value === metric.value) return;

    this.metrics.set(key, metric);

    for (const cb of this.callbacks) {
      try {
        cb(metric);
      } catch {
        // 忽略回调错误
      }
    }

    // 控制台输出（开发模式）
    if (import.meta.env.DEV) {
      const emoji = metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌';
      console.log(
        `${emoji} [Web Vital] ${metric.name}: ${metric.value.toFixed(2)}ms (${metric.rating})`
      );
    }
  }

  getMetrics(): WebVitalMetric[] {
    return Array.from(this.metrics.values());
  }

  getScore(): { total: number; breakdown: Record<string, { value: number; score: number; rating: string }> } {
    const breakdown: Record<string, { value: number; score: number; rating: string }> = {};
    let totalScore = 0;
    let count = 0;

    for (const [name, metric] of this.metrics) {
      const threshold = THRESHOLDS[name];
      if (!threshold) continue;

      // 0-100分
      let score: number;
      if (metric.rating === 'good') score = 100;
      else if (metric.rating === 'needs-improvement') {
        const ratio = (metric.value - threshold.good) / (threshold.poor - threshold.good);
        score = Math.round(100 - ratio * 50);
      } else {
        score = Math.max(0, Math.round(50 - (metric.value - threshold.poor) / threshold.poor * 50));
      }

      breakdown[name] = { value: metric.value, score, rating: metric.rating };
      totalScore += score;
      count++;
    }

    return { total: count > 0 ? Math.round(totalScore / count) : 0, breakdown };
  }
}

export const webVitalsCollector = new WebVitalsCollector();

// ==================== FCP (First Contentful Paint) ====================
function observeFCP(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      for (const entry of entries) {
        if (entry.name === 'first-contentful-paint') {
          webVitalsCollector.reportMetric({
            name: 'FCP',
            value: entry.startTime,
            rating: getRating('FCP', entry.startTime),
            delta: entry.startTime,
            id: generateId(),
            navigationType: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type || 'navigate',
            timestamp: Date.now(),
          });
          observer.disconnect();
        }
      }
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch {
    // FCP not supported
  }
}

// ==================== LCP (Largest Contentful Paint) ====================
function observeLCP(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  let lcpValue = 0;

  try {
    const observer = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry && lastEntry.startTime > lcpValue) {
        lcpValue = lastEntry.startTime;
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });

    // 页面隐藏时报告最终LCP
    const reportFinalLCP = () => {
      if (lcpValue > 0) {
        webVitalsCollector.reportMetric({
          name: 'LCP',
          value: lcpValue,
          rating: getRating('LCP', lcpValue),
          delta: lcpValue,
          id: generateId(),
          navigationType: 'navigate',
          timestamp: Date.now(),
        });
      }
      observer.disconnect();
    };

    document.addEventListener('visibilitychange', reportFinalLCP, { once: true });
    window.addEventListener('beforeunload', reportFinalLCP, { once: true });
  } catch {
    // LCP not supported
  }
}

// ==================== CLS (Cumulative Layout Shift) ====================
function observeCLS(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  let clsValue = 0;
  let sessionValue = 0;
  let sessionEntries: PerformanceEntry[] = [];

  try {
    const observer = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const layoutShiftEntry = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value: number;
        };
        if (!layoutShiftEntry.hadRecentInput) {
          const firstSessionEntry = sessionEntries[0];
          const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

          if (
            sessionValue &&
            firstSessionEntry &&
            lastSessionEntry &&
            entry.startTime - lastSessionEntry.startTime < 1000 &&
            entry.startTime - firstSessionEntry.startTime < 5000
          ) {
            sessionValue += layoutShiftEntry.value;
            sessionEntries.push(entry);
          } else {
            sessionValue = layoutShiftEntry.value;
            sessionEntries = [entry];
          }

          if (sessionValue > clsValue) {
            clsValue = sessionValue;
          }
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });

    const reportFinalCLS = () => {
      webVitalsCollector.reportMetric({
        name: 'CLS',
        value: clsValue,
        rating: getRating('CLS', clsValue),
        delta: clsValue,
        id: generateId(),
        navigationType: 'navigate',
        timestamp: Date.now(),
      });
      observer.disconnect();
    };

    document.addEventListener('visibilitychange', reportFinalCLS, { once: true });
  } catch {
    // CLS not supported
  }
}

// ==================== FID (First Input Delay) ====================
function observeFID(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      for (const entry of entries) {
        const fidEntry = entry as PerformanceEventTiming;
        const fid = fidEntry.processingStart - fidEntry.startTime;
        webVitalsCollector.reportMetric({
          name: 'FID',
          value: fid,
          rating: getRating('FID', fid),
          delta: fid,
          id: generateId(),
          navigationType: 'navigate',
          timestamp: Date.now(),
        });
        observer.disconnect();
      }
    });
    observer.observe({ type: 'first-input', buffered: true });
  } catch {
    // FID not supported
  }
}

// ==================== TTFB (Time to First Byte) ====================
function observeTTFB(): void {
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navEntry) {
    const ttfb = navEntry.responseStart - navEntry.requestStart;
    webVitalsCollector.reportMetric({
      name: 'TTFB',
      value: ttfb,
      rating: getRating('TTFB', ttfb),
      delta: ttfb,
      id: generateId(),
      navigationType: navEntry.type,
      timestamp: Date.now(),
    });
  }
}

// ==================== INP (Interaction to Next Paint) ====================
function observeINP(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  const interactions: Map<number, number> = new Map();

  try {
    const observer = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const eventEntry = entry as PerformanceEventTiming;
        const duration = eventEntry.duration;
        const interactionId = eventEntry.interactionId;

        if (interactionId) {
          const existing = interactions.get(interactionId) || 0;
          interactions.set(interactionId, Math.max(existing, duration));
        }
      }

      // 取P98
      if (interactions.size >= 50) {
        const values = Array.from(interactions.values()).sort((a, b) => a - b);
        const p98Index = Math.floor(values.length * 0.98);
        const inp = values[p98Index] || 0;

        webVitalsCollector.reportMetric({
          name: 'INP',
          value: inp,
          rating: getRating('INP', inp),
          delta: inp,
          id: generateId(),
          navigationType: 'navigate',
          timestamp: Date.now(),
        });
      }
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {
    // INP not supported
  }
}

// ==================== 资源大小监控 ====================
function monitorResourceSizes(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  const sizes: Record<string, number> = {
    script: 0,
    stylesheet: 0,
    image: 0,
    font: 0,
    other: 0,
  };

  try {
    const observer = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const resourceEntry = entry as PerformanceResourceTiming;
        const size = resourceEntry.transferSize || 0;
        const type = resourceEntry.initiatorType;

        if (type === 'script') sizes.script += size;
        else if (type === 'link' || type === 'css') sizes.stylesheet += size;
        else if (type === 'img') sizes.image += size;
        else if (type === 'font') sizes.font += size;
        else sizes.other += size;
      }
    });
    observer.observe({ type: 'resource', buffered: true });

    // 页面加载完成后报告
    window.addEventListener('load', () => {
      setTimeout(() => {
        const totalKB = Object.values(sizes).reduce((a, b) => a + b, 0) / 1024;
        if (import.meta.env.DEV) {
          console.log(`📊 资源大小总计: ${totalKB.toFixed(1)} KB`, {
            JS: `${(sizes.script / 1024).toFixed(1)} KB`,
            CSS: `${(sizes.stylesheet / 1024).toFixed(1)} KB`,
            Images: `${(sizes.image / 1024).toFixed(1)} KB`,
            Fonts: `${(sizes.font / 1024).toFixed(1)} KB`,
          });
        }
      }, 1000);
    });
  } catch {
    // Not supported
  }
}

// ==================== 初始化 ====================
export function initWebVitals(): void {
  observeFCP();
  observeLCP();
  observeCLS();
  observeFID();
  observeTTFB();
  observeINP();
  monitorResourceSizes();

  if (import.meta.env.DEV) {
    console.log('🔍 Web Vitals 监控已启动');
  }
}

// ==================== 导出报告工具 ====================
export function getVitalsReport(): {
  metrics: WebVitalMetric[];
  score: ReturnType<WebVitalsCollector['getScore']>;
  timestamp: number;
  url: string;
} {
  return {
    metrics: webVitalsCollector.getMetrics(),
    score: webVitalsCollector.getScore(),
    timestamp: Date.now(),
    url: window.location.href,
  };
}

// 自动初始化
if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') {
    initWebVitals();
  } else {
    window.addEventListener('load', initWebVitals);
  }
}
