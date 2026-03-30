/**
 * 图表性能监控工具
 * 渲染时间、帧率、数据处理性能追踪
 */

export interface PerfMetric {
  name: string;
  value: number;
  unit: 'ms' | 'fps' | 'mb' | 'count';
  timestamp: number;
  tags?: Record<string, string>;
}

export interface RenderMetrics {
  chartId: string;
  renderTime: number;
  dataPoints: number;
  paintTime: number;
  layoutTime: number;
  fps: number;
}

export interface PerfReport {
  startTime: number;
  endTime: number;
  metrics: PerfMetric[];
  summary: {
    avgRenderTime: number;
    maxRenderTime: number;
    avgFps: number;
    totalRenders: number;
  };
}

/**
 * 性能监控器
 */
export class ChartPerfMonitor {
  private metrics: PerfMetric[] = [];
  private marks: Map<string, number> = new Map();
  private renderCount: number = 0;
  private startTime: number = Date.now();

  /**
   * 开始计时
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * 结束计时并记录
   */
  measure(name: string, startMark?: string): number {
    const end = performance.now();
    const start = startMark ? this.marks.get(startMark) : this.marks.get(name);
    const duration = start ? end - start : 0;

    this.addMetric({
      name,
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
    });

    this.marks.delete(startMark || name);
    return duration;
  }

  /**
   * 添加指标
   */
  addMetric(metric: PerfMetric): void {
    this.metrics.push(metric);
    // 保留最近1000条
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500);
    }
  }

  /**
   * 记录渲染指标
   */
  recordRender(render: RenderMetrics): void {
    this.renderCount++;
    this.addMetric({ name: 'renderTime', value: render.renderTime, unit: 'ms', timestamp: Date.now(), tags: { chart: render.chartId } });
    this.addMetric({ name: 'fps', value: render.fps, unit: 'fps', timestamp: Date.now(), tags: { chart: render.chartId } });
    this.addMetric({ name: 'dataPoints', value: render.dataPoints, unit: 'count', timestamp: Date.now(), tags: { chart: render.chartId } });
  }

  /**
   * 获取性能报告
   */
  getReport(): PerfReport {
    const renderMetrics = this.metrics.filter(m => m.name === 'renderTime');
    const fpsMetrics = this.metrics.filter(m => m.name === 'fps');

    return {
      startTime: this.startTime,
      endTime: Date.now(),
      metrics: [...this.metrics],
      summary: {
        avgRenderTime: renderMetrics.length > 0
          ? renderMetrics.reduce((s, m) => s + m.value, 0) / renderMetrics.length
          : 0,
        maxRenderTime: renderMetrics.length > 0
          ? Math.max(...renderMetrics.map(m => m.value))
          : 0,
        avgFps: fpsMetrics.length > 0
          ? fpsMetrics.reduce((s, m) => s + m.value, 0) / fpsMetrics.length
          : 0,
        totalRenders: this.renderCount,
      },
    };
  }

  /**
   * 获取指定指标的历史
   */
  getMetricHistory(name: string, limit: number = 100): PerfMetric[] {
    return this.metrics.filter(m => m.name === name).slice(-limit);
  }

  /**
   * 检查是否有性能问题
   */
  checkHealth(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    const report = this.getReport();

    if (report.summary.avgRenderTime > 16) {
      issues.push(`平均渲染时间过长: ${report.summary.avgRenderTime.toFixed(1)}ms (目标 < 16ms)`);
    }
    if (report.summary.avgFps < 30 && report.summary.avgFps > 0) {
      issues.push(`平均帧率过低: ${report.summary.avgFps.toFixed(1)} FPS (目标 > 30)`);
    }
    if (report.summary.maxRenderTime > 100) {
      issues.push(`最大渲染时间过长: ${report.summary.maxRenderTime.toFixed(1)}ms`);
    }

    return { healthy: issues.length === 0, issues };
  }

  /**
   * 重置监控
   */
  reset(): void {
    this.metrics = [];
    this.marks.clear();
    this.renderCount = 0;
    this.startTime = Date.now();
  }
}

/**
 * 测量函数执行时间
 */
export function measureExecution<T>(fn: () => T, monitor: ChartPerfMonitor, name: string): T {
  monitor.mark(name);
  const result = fn();
  monitor.measure(name);
  return result;
}

/**
 * 测量异步函数执行时间
 */
export async function measureAsyncExecution<T>(
  fn: () => Promise<T>,
  monitor: ChartPerfMonitor,
  name: string
): Promise<T> {
  monitor.mark(name);
  const result = await fn();
  monitor.measure(name);
  return result;
}

/**
 * 创建帧率监控
 */
export function createFpsMonitor(
  onFps: (fps: number) => void,
  sampleSize: number = 60
): { start: () => void; stop: () => void } {
  let frameCount = 0;
  let lastTime = performance.now();
  let rafId: number | null = null;

  const tick = () => {
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastTime;

    if (elapsed >= 1000) {
      const fps = Math.round((frameCount * 1000) / elapsed);
      onFps(fps);
      frameCount = 0;
      lastTime = now;
    }

    rafId = requestAnimationFrame(tick);
  };

  return {
    start: () => {
      frameCount = 0;
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    },
    stop: () => {
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}

/**
 * 数据处理性能基准
 */
export function benchmarkDataProcessing(
  data: any[],
  processor: (data: any[]) => any,
  iterations: number = 10
): { avgTime: number; minTime: number; maxTime: number; throughput: number } {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    processor(data);
    times.push(performance.now() - start);
  }

  const avgTime = times.reduce((s, t) => s + t, 0) / times.length;

  return {
    avgTime,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    throughput: data.length / (avgTime / 1000), // items per second
  };
}
