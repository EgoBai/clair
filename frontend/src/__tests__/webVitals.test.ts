// @vitest-environment jsdom
/**
 * Web Vitals 性能监控测试
 * 导入真实模块 src/utils/webVitals.ts。
 * 通过桩 PerformanceObserver / performance 驱动真实 observe* 管线，
 * 从而真正执行模块内部的 getRating / getScore 逻辑。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  webVitalsCollector,
  getVitalsReport,
  initWebVitals,
} from '../utils/webVitals';

// ---- 桩：PerformanceObserver + performance.getEntriesByType ----
let observers: { type: string; cb: (list: any) => void }[] = [];

class StubPerformanceObserver {
  type = '';
  constructor(public cb: (list: any) => void) {}
  observe(opts: any) {
    this.type = opts?.type ?? '';
    observers.push(this);
  }
  disconnect() {}
}

let navResponseStart = 0;

beforeEach(() => {
  observers = [];
  navResponseStart = 0;
  vi.stubGlobal('PerformanceObserver', StubPerformanceObserver as any);
  vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) =>
    type === 'navigation'
      ? ([{ type: 'navigate', requestStart: 0, responseStart: navResponseStart }] as any)
      : []
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runInit(): void {
  observers = [];
  initWebVitals();
}

function driveFCP(startTime: number): void {
  runInit();
  observers
    .find((o) => o.type === 'paint')
    ?.cb({ getEntries: () => [{ name: 'first-contentful-paint', startTime }] });
}

function driveFID(fidValue: number): void {
  runInit();
  observers
    .find((o) => o.type === 'first-input')
    ?.cb({ getEntries: () => [{ processingStart: fidValue, startTime: 0 }] });
}

function driveTTFB(ttfb: number): void {
  navResponseStart = ttfb;
  runInit(); // observeTTFB 在 init 时同步上报
}

describe('Web Vitals 评级 (真实 getRating via observers)', () => {
  it('FCP 1.5s 应为 good', () => {
    driveFCP(1500);
    expect(webVitalsCollector.getScore().breakdown['FCP'].rating).toBe('good');
  });
  it('FCP 2.5s 应为 needs-improvement', () => {
    driveFCP(2500);
    expect(webVitalsCollector.getScore().breakdown['FCP'].rating).toBe('needs-improvement');
  });
  it('FCP 4.0s 应为 poor', () => {
    driveFCP(4000);
    expect(webVitalsCollector.getScore().breakdown['FCP'].rating).toBe('poor');
  });

  it('FID 50ms 应为 good', () => {
    driveFID(50);
    expect(webVitalsCollector.getScore().breakdown['FID'].rating).toBe('good');
  });
  it('FID 200ms 应为 needs-improvement', () => {
    driveFID(200);
    expect(webVitalsCollector.getScore().breakdown['FID'].rating).toBe('needs-improvement');
  });
  it('FID 400ms 应为 poor', () => {
    driveFID(400);
    expect(webVitalsCollector.getScore().breakdown['FID'].rating).toBe('poor');
  });

  it('TTFB 500ms 应为 good', () => {
    driveTTFB(500);
    expect(webVitalsCollector.getScore().breakdown['TTFB'].rating).toBe('good');
  });
  it('TTFB 1200ms 应为 needs-improvement', () => {
    driveTTFB(1200);
    expect(webVitalsCollector.getScore().breakdown['TTFB'].rating).toBe('needs-improvement');
  });
  it('TTFB 2500ms 应为 poor', () => {
    driveTTFB(2500);
    expect(webVitalsCollector.getScore().breakdown['TTFB'].rating).toBe('poor');
  });

  it('边界值: LCP/FCP 阈值边界分类正确', () => {
    // 直接用各个指标的边界值验证 getRating 边界行为
    driveFCP(1800); // good 边界
    expect(webVitalsCollector.getScore().breakdown['FCP'].rating).toBe('good');
    driveFCP(1801);
    expect(webVitalsCollector.getScore().breakdown['FCP'].rating).toBe('needs-improvement');
  });

  it('零值应为 good', () => {
    driveFCP(0);
    expect(webVitalsCollector.getScore().breakdown['FCP'].rating).toBe('good');
    driveFID(0);
    expect(webVitalsCollector.getScore().breakdown['FID'].rating).toBe('good');
  });
});

describe('性能评分计算 (真实 getScore)', () => {
  function reportWithRating(name: string, value: number, rating: 'good' | 'needs-improvement' | 'poor'): void {
    webVitalsCollector.reportMetric({
      name,
      value,
      rating,
      delta: value,
      id: `score-${name}-${value}-${Math.random()}`,
      navigationType: 'navigate',
      timestamp: Date.now(),
    });
  }

  it('全部 good 应得 100 分', () => {
    reportWithRating('LCP', 2000, 'good');
    reportWithRating('FID', 50, 'good');
    reportWithRating('CLS', 0.05, 'good');
    reportWithRating('FCP', 1500, 'good');
    reportWithRating('TTFB', 500, 'good');
    expect(webVitalsCollector.getScore().total).toBe(100);
  });

  it('poor 指标降低总分 (且处于 0-100)', () => {
    reportWithRating('LCP', 5000, 'poor');
    const score = webVitalsCollector.getScore();
    expect(score.total).toBeLessThan(100);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.breakdown['LCP'].rating).toBe('poor');
  });

  it('breakdown 包含 value/score/rating', () => {
    reportWithRating('FCP', 1500, 'good');
    const fcp = webVitalsCollector.getScore().breakdown['FCP'];
    expect(fcp.value).toBe(1500);
    expect(fcp.rating).toBe('good');
    expect(typeof fcp.score).toBe('number');
  });
});

describe('指标收集器', () => {
  it('onMetric 回调应在 reportMetric 时触发', () => {
    const cb = vi.fn();
    webVitalsCollector.onMetric(cb);
    webVitalsCollector.reportMetric({
      name: 'LCP', value: 1234.5, rating: 'good', delta: 1234.5,
      id: 'cb-test', navigationType: 'navigate', timestamp: Date.now(),
    });
    expect(cb).toHaveBeenCalled();
  });

  it('getMetrics 返回已上报指标', () => {
    webVitalsCollector.reportMetric({
      name: 'FCP', value: 123, rating: 'good', delta: 123,
      id: 'gm-test', navigationType: 'navigate', timestamp: Date.now(),
    });
    const metrics = webVitalsCollector.getMetrics();
    expect(metrics.some((m) => m.name === 'FCP' && m.value === 123)).toBe(true);
  });
});

describe('getVitalsReport', () => {
  it('返回 metrics/score/timestamp/url 结构', () => {
    webVitalsCollector.reportMetric({
      name: 'LCP', value: 2000, rating: 'good', delta: 2000,
      id: 'report-test', navigationType: 'navigate', timestamp: Date.now(),
    });
    const report = getVitalsReport();
    expect(Array.isArray(report.metrics)).toBe(true);
    expect(report.score).toHaveProperty('total');
    expect(typeof report.timestamp).toBe('number');
    expect(report.url).toBe(window.location.href);
  });
});
