/**
 * 前端性能分析引擎
 * 提供页面加载性能、渲染性能、资源加载分析、性能评分和优化建议
 */

// ==================== 类型定义 ====================

export interface PerformanceMetrics {
  // 核心Web Vitals
  fcp: number;  // First Contentful Paint (ms)
  lcp: number;  // Largest Contentful Paint (ms)
  fid: number;  // First Input Delay (ms)
  cls: number;  // Cumulative Layout Shift
  ttfb: number; // Time to First Byte (ms)
  tbt: number;  // Total Blocking Time (ms)
  si: number;   // Speed Index (ms)

  // 自定义指标
  domContentLoaded: number;
  domInteractive: number;
  loadComplete: number;
  resourceLoadTime: number;
  jsHeapUsed: number;
  jsHeapTotal: number;
  jsExecutionTime: number;
  styleRecalcTime: number;
  layoutTime: number;
}

export interface ResourceMetric {
  name: string;
  type: 'script' | 'stylesheet' | 'image' | 'font' | 'fetch' | 'other';
  size: number; // bytes
  duration: number; // ms
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  cached: boolean;
}

export interface PerformanceScore {
  overall: number; // 0-100
  fcp: number;
  lcp: number;
  fid: number;
  cls: number;
  tbt: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface PerformanceIssue {
  type: 'critical' | 'warning' | 'info';
  category: 'loading' | 'rendering' | 'memory' | 'network' | 'script';
  message: string;
  impact: number; // 0-100
  suggestion: string;
}

export interface OptimizationSuggestion {
  priority: 'high' | 'medium' | 'low';
  category: string;
  description: string;
  estimatedImprovement: string;
  resources?: string[];
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

export interface RenderProfile {
  componentName: string;
  renderCount: number;
  totalRenderTime: number;
  avgRenderTime: number;
  maxRenderTime: number;
  wastedRenders: number;
}

// ==================== 性能评分 ====================

/**
 * 计算Core Web Vitals评分
 */
export function calculatePerformanceScore(metrics: PerformanceMetrics): PerformanceScore {
  const fcpScore = scoreMetric(metrics.fcp, [1800, 3000]);
  const lcpScore = scoreMetric(metrics.lcp, [2500, 4000]);
  const fidScore = scoreMetric(metrics.fid, [100, 300]);
  const clsScore = scoreMetric(metrics.cls * 1000, [100, 250]); // *1000 for easier comparison
  const tbtScore = scoreMetric(metrics.tbt, [200, 600]);

  const overall = Math.round(
    fcpScore * 0.15 + lcpScore * 0.25 + fidScore * 0.25 + clsScore * 0.25 + tbtScore * 0.10,
  );

  let grade: PerformanceScore['grade'];
  if (overall >= 90) grade = 'A';
  else if (overall >= 75) grade = 'B';
  else if (overall >= 50) grade = 'C';
  else if (overall >= 25) grade = 'D';
  else grade = 'F';

  return {
    overall,
    fcp: fcpScore,
    lcp: lcpScore,
    fid: fidScore,
    cls: clsScore,
    tbt: tbtScore,
    grade,
  };
}

function scoreMetric(value: number, thresholds: [number, number]): number {
  if (value <= thresholds[0]) return 100;
  if (value >= thresholds[1]) return 0;
  const ratio = (value - thresholds[0]) / (thresholds[1] - thresholds[0]);
  return Math.round(100 * (1 - ratio));
}

// ==================== 问题检测 ====================

/**
 * 检测性能问题
 */
export function detectPerformanceIssues(
  metrics: PerformanceMetrics,
  resources: ResourceMetric[] = [],
): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];

  // FCP检测
  if (metrics.fcp > 3000) {
    issues.push({
      type: 'critical',
      category: 'loading',
      message: `首次内容绘制过慢 (${metrics.fcp}ms)`,
      impact: 80,
      suggestion: '优化关键渲染路径，减少渲染阻塞资源',
    });
  } else if (metrics.fcp > 1800) {
    issues.push({
      type: 'warning',
      category: 'loading',
      message: `首次内容绘制偏慢 (${metrics.fcp}ms)`,
      impact: 40,
      suggestion: '考虑内联关键CSS，预加载关键资源',
    });
  }

  // LCP检测
  if (metrics.lcp > 4000) {
    issues.push({
      type: 'critical',
      category: 'loading',
      message: `最大内容绘制过慢 (${metrics.lcp}ms)`,
      impact: 90,
      suggestion: '优化最大元素加载，使用CDN，压缩图片',
    });
  } else if (metrics.lcp > 2500) {
    issues.push({
      type: 'warning',
      category: 'loading',
      message: `最大内容绘制偏慢 (${metrics.lcp}ms)`,
      impact: 50,
      suggestion: '预加载关键资源，优化服务器响应时间',
    });
  }

  // CLS检测
  if (metrics.cls > 0.25) {
    issues.push({
      type: 'critical',
      category: 'rendering',
      message: `布局偏移严重 (CLS: ${metrics.cls.toFixed(3)})`,
      impact: 85,
      suggestion: '为图片和嵌入内容设置尺寸，避免动态注入内容',
    });
  } else if (metrics.cls > 0.1) {
    issues.push({
      type: 'warning',
      category: 'rendering',
      message: `布局偏移偏高 (CLS: ${metrics.cls.toFixed(3)})`,
      impact: 45,
      suggestion: '预留图片空间，使用CSS contain属性',
    });
  }

  // FID/TBT检测
  if (metrics.tbt > 600) {
    issues.push({
      type: 'critical',
      category: 'script',
      message: `总阻塞时间过长 (${metrics.tbt}ms)`,
      impact: 75,
      suggestion: '拆分长任务，使用Web Workers，延迟非关键JS',
    });
  } else if (metrics.tbt > 200) {
    issues.push({
      type: 'warning',
      category: 'script',
      message: `总阻塞时间偏长 (${metrics.tbt}ms)`,
      impact: 35,
      suggestion: '减少主线程工作，代码分割',
    });
  }

  // 内存检测
  if (metrics.jsHeapUsed > 50 * 1024 * 1024) {
    issues.push({
      type: 'warning',
      category: 'memory',
      message: `JS堆内存使用偏高 (${(metrics.jsHeapUsed / 1024 / 1024).toFixed(1)}MB)`,
      impact: 30,
      suggestion: '检查内存泄漏，及时清理事件监听器和定时器',
    });
  }

  // 资源检测
  const largeResources = resources.filter(r => r.size > 500 * 1024);
  if (largeResources.length > 0) {
    issues.push({
      type: 'warning',
      category: 'network',
      message: `${largeResources.length}个资源超过500KB`,
      impact: 25,
      suggestion: '压缩大资源，使用代码分割，懒加载非关键资源',
    });
  }

  const uncached = resources.filter(r => !r.cached && r.type !== 'fetch');
  if (uncached.length > resources.length * 0.5) {
    issues.push({
      type: 'info',
      category: 'network',
      message: `${uncached.length}个资源未缓存`,
      impact: 15,
      suggestion: '配置适当的缓存策略(Cache-Control, ETag)',
    });
  }

  return issues;
}

// ==================== 优化建议 ====================

/**
 * 生成优化建议
 */
export function generateOptimizationSuggestions(
  metrics: PerformanceMetrics,
  issues: PerformanceIssue[],
  resources: ResourceMetric[] = [],
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // 基于问题生成建议
  const criticalIssues = issues.filter(i => i.type === 'critical');
  const _warningIssues = issues.filter(i => i.type === 'warning');

  if (criticalIssues.length > 0) {
    suggestions.push({
      priority: 'high',
      category: '关键性能',
      description: `解决${criticalIssues.length}个关键性能问题`,
      estimatedImprovement: '整体评分可提升20-40分',
      resources: criticalIssues.map(i => i.suggestion),
    });
  }

  // 加载优化
  if (metrics.fcp > 1800 || metrics.lcp > 2500) {
    const scriptResources = resources.filter(r => r.type === 'script');
    const totalJSSize = scriptResources.reduce((sum, r) => sum + r.size, 0);

    if (totalJSSize > 500 * 1024) {
      suggestions.push({
        priority: 'high',
        category: 'JavaScript优化',
        description: `JS总大小${(totalJSSize / 1024).toFixed(0)}KB，建议代码分割`,
        estimatedImprovement: 'FCP可减少300-800ms',
        resources: scriptResources.slice(0, 5).map(r => r.name),
      });
    }
  }

  // 图片优化
  const images = resources.filter(r => r.type === 'image');
  const unoptimizedImages = images.filter(r => r.size > 100 * 1024 && !r.name.includes('.webp'));
  if (unoptimizedImages.length > 0) {
    suggestions.push({
      priority: 'medium',
      category: '图片优化',
      description: `${unoptimizedImages.length}张图片可转为WebP格式`,
      estimatedImprovement: '图片大小可减少25-35%',
      resources: unoptimizedImages.slice(0, 5).map(r => r.name),
    });
  }

  // CSS优化
  const stylesheets = resources.filter(r => r.type === 'stylesheet');
  if (stylesheets.length > 3) {
    suggestions.push({
      priority: 'medium',
      category: 'CSS优化',
      description: `${stylesheets.length}个样式表可合并`,
      estimatedImprovement: '减少HTTP请求数',
      resources: stylesheets.map(r => r.name),
    });
  }

  // 缓存优化
  const noCache = resources.filter(r => !r.cached);
  if (noCache.length > 0) {
    suggestions.push({
      priority: 'low',
      category: '缓存策略',
      description: `${noCache.length}个资源未配置缓存`,
      estimatedImprovement: '重复访问加载速度提升50%+',
    });
  }

  // CLS优化
  if (metrics.cls > 0.1) {
    suggestions.push({
      priority: 'medium',
      category: '布局稳定性',
      description: '减少布局偏移，设置明确尺寸',
      estimatedImprovement: `CLS可降至${(metrics.cls * 0.3).toFixed(3)}以下`,
    });
  }

  return suggestions.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

// ==================== 资源分析 ====================

/**
 * 分析资源加载
 */
export function analyzeResources(resources: ResourceMetric[]): {
  totalSize: number;
  totalDuration: number;
  byType: Record<string, { count: number; size: number; duration: number }>;
  largest: ResourceMetric[];
  slowest: ResourceMetric[];
  cacheHitRate: number;
} {
  const byType: Record<string, { count: number; size: number; duration: number }> = {};

  for (const r of resources) {
    if (!byType[r.type]) {
      byType[r.type] = { count: 0, size: 0, duration: 0 };
    }
    byType[r.type].count++;
    byType[r.type].size += r.size;
    byType[r.type].duration += r.duration;
  }

  const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
  const totalDuration = resources.reduce((sum, r) => sum + r.duration, 0);
  const cachedCount = resources.filter(r => r.cached).length;

  return {
    totalSize,
    totalDuration,
    byType,
    largest: [...resources].sort((a, b) => b.size - a.size).slice(0, 10),
    slowest: [...resources].sort((a, b) => b.duration - a.duration).slice(0, 10),
    cacheHitRate: resources.length > 0 ? Math.round((cachedCount / resources.length) * 10000) / 10000 : 0,
  };
}

// ==================== 基准测试 ====================

/**
 * 运行函数基准测试
 */
export function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 1000,
  warmup: number = 10,
): BenchmarkResult {
  // 预热
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  return {
    name,
    iterations,
    totalTime: Math.round(totalTime * 100) / 100,
    avgTime: Math.round(avgTime * 1000) / 1000,
    minTime: Math.round(minTime * 1000) / 1000,
    maxTime: Math.round(maxTime * 1000) / 1000,
    opsPerSecond: Math.round(1000 / avgTime),
  };
}

/**
 * 对比两个函数性能
 */
export function compareBenchmarks(
  name1: string,
  fn1: () => void,
  name2: string,
  fn2: () => void,
  iterations: number = 1000,
): { faster: string; slower: string; ratio: number; results: BenchmarkResult[] } {
  const result1 = benchmark(name1, fn1, iterations);
  const result2 = benchmark(name2, fn2, iterations);

  const faster = result1.avgTime < result2.avgTime ? name1 : name2;
  const slower = result1.avgTime < result2.avgTime ? name2 : name1;
  const minTime = Math.min(result1.avgTime, result2.avgTime);
  const maxTime = Math.max(result1.avgTime, result2.avgTime);
  const ratio = minTime > 0 ? Math.round((maxTime / minTime) * 100) / 100 : Infinity;

  return { faster, slower, ratio, results: [result1, result2] };
}

// ==================== 渲染性能分析 ====================

/**
 * 分析组件渲染性能
 */
export function analyzeRenderPerformance(
  profiles: RenderProfile[],
): {
  totalRenders: number;
  totalTime: number;
  slowestComponents: RenderProfile[];
  wastedRenderComponents: RenderProfile[];
  efficiency: number;
} {
  const totalRenders = profiles.reduce((sum, p) => sum + p.renderCount, 0);
  const totalTime = profiles.reduce((sum, p) => sum + p.totalRenderTime, 0);
  const totalWasted = profiles.reduce((sum, p) => sum + p.wastedRenders, 0);

  return {
    totalRenders,
    totalTime: Math.round(totalTime * 100) / 100,
    slowestComponents: [...profiles].sort((a, b) => b.avgRenderTime - a.avgRenderTime).slice(0, 5),
    wastedRenderComponents: [...profiles].filter(p => p.wastedRenders > 0).sort((a, b) => b.wastedRenders - a.wastedRenders),
    efficiency: totalRenders > 0 ? Math.round(((totalRenders - totalWasted) / totalRenders) * 10000) / 10000 : 1,
  };
}

// ==================== 性能趋势 ====================

/**
 * 计算性能趋势
 */
export function calculatePerformanceTrend(
  historical: Array<{ timestamp: number; score: number }>,
  windowSize: number = 5,
): {
  current: number;
  average: number;
  trend: 'improving' | 'stable' | 'degrading';
  change: number;
} {
  if (historical.length === 0) {
    return { current: 0, average: 0, trend: 'stable', change: 0 };
  }

  const sorted = [...historical].sort((a, b) => b.timestamp - a.timestamp);
  const current = sorted[0].score;
  const window = sorted.slice(0, Math.min(windowSize, sorted.length));
  const average = Math.round(window.reduce((sum, h) => sum + h.score, 0) / window.length);

  let trend: 'improving' | 'stable' | 'degrading';
  let change = 0;

  if (sorted.length >= 2) {
    change = Math.round((current - sorted[1].score) * 100) / 100;
    if (change > 5) trend = 'improving';
    else if (change < -5) trend = 'degrading';
    else trend = 'stable';
  } else {
    trend = 'stable';
  }

  return { current, average, trend, change };
}

// ==================== 工具函数 ====================

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 获取性能等级颜色
 */
export function getGradeColor(grade: PerformanceScore['grade']): string {
  switch (grade) {
    case 'A': return '#0cce6b';
    case 'B': return '#ffa400';
    case 'C': return '#ff4e42';
    case 'D': return '#ff0000';
    case 'F': return '#8b0000';
  }
}
