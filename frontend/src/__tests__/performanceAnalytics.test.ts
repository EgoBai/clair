import { describe, it, expect } from 'vitest';
import {
  calculatePerformanceScore,
  detectPerformanceIssues,
  generateOptimizationSuggestions,
  analyzeResources,
  benchmark,
  compareBenchmarks,
  analyzeRenderPerformance,
  calculatePerformanceTrend,
  formatFileSize,
  formatDuration,
  getGradeColor,
  type PerformanceMetrics,
  type ResourceMetric,
  type RenderProfile,
} from '../utils/performanceAnalytics';

// ==================== 测试数据 ====================

const goodMetrics: PerformanceMetrics = {
  fcp: 1200, lcp: 1800, fid: 50, cls: 0.05, ttfb: 200,
  tbt: 100, si: 1500,
  domContentLoaded: 800, domInteractive: 600, loadComplete: 2000,
  resourceLoadTime: 500, jsHeapUsed: 20 * 1024 * 1024,
  jsHeapTotal: 50 * 1024 * 1024, jsExecutionTime: 300,
  styleRecalcTime: 50, layoutTime: 30,
};

const poorMetrics: PerformanceMetrics = {
  fcp: 4000, lcp: 6000, fid: 400, cls: 0.35, ttfb: 1500,
  tbt: 800, si: 5000,
  domContentLoaded: 3000, domInteractive: 2500, loadComplete: 8000,
  resourceLoadTime: 3000, jsHeapUsed: 100 * 1024 * 1024,
  jsHeapTotal: 200 * 1024 * 1024, jsExecutionTime: 2000,
  styleRecalcTime: 500, layoutTime: 300,
};

const mockResources: ResourceMetric[] = [
  { name: 'main.js', type: 'script', size: 200 * 1024, duration: 150, transferSize: 80 * 1024, encodedBodySize: 80 * 1024, decodedBodySize: 200 * 1024, cached: false },
  { name: 'style.css', type: 'stylesheet', size: 50 * 1024, duration: 30, transferSize: 15 * 1024, encodedBodySize: 15 * 1024, decodedBodySize: 50 * 1024, cached: false },
  { name: 'hero.webp', type: 'image', size: 300 * 1024, duration: 200, transferSize: 300 * 1024, encodedBodySize: 300 * 1024, decodedBodySize: 300 * 1024, cached: true },
  { name: 'chunk2.js', type: 'script', size: 150 * 1024, duration: 100, transferSize: 60 * 1024, encodedBodySize: 60 * 1024, decodedBodySize: 150 * 1024, cached: false },
  { name: 'api/data', type: 'fetch', size: 10 * 1024, duration: 50, transferSize: 10 * 1024, encodedBodySize: 10 * 1024, decodedBodySize: 10 * 1024, cached: false },
];

// ==================== 性能评分测试 ====================

describe('calculatePerformanceScore', () => {
  it('应计算优秀的性能评分', () => {
    const score = calculatePerformanceScore(goodMetrics);
    expect(score.overall).toBeGreaterThan(80);
    expect(score.grade).toBe('A');
  });

  it('应计算差的性能评分', () => {
    const score = calculatePerformanceScore(poorMetrics);
    expect(score.overall).toBeLessThan(30);
    expect(['D', 'F']).toContain(score.grade);
  });

  it('各子分数应在0-100范围', () => {
    const score = calculatePerformanceScore(goodMetrics);
    expect(score.fcp).toBeGreaterThanOrEqual(0);
    expect(score.fcp).toBeLessThanOrEqual(100);
    expect(score.lcp).toBeGreaterThanOrEqual(0);
    expect(score.lcp).toBeLessThanOrEqual(100);
    expect(score.fid).toBeGreaterThanOrEqual(0);
    expect(score.fid).toBeLessThanOrEqual(100);
    expect(score.cls).toBeGreaterThanOrEqual(0);
    expect(score.cls).toBeLessThanOrEqual(100);
    expect(score.tbt).toBeGreaterThanOrEqual(0);
    expect(score.tbt).toBeLessThanOrEqual(100);
  });

  it('应正确分级', () => {
    const perfect: PerformanceMetrics = { ...goodMetrics, fcp: 500, lcp: 1000, fid: 10, cls: 0.01, tbt: 50 };
    const a = calculatePerformanceScore(perfect);
    expect(a.grade).toBe('A');

    const mid: PerformanceMetrics = { ...goodMetrics, fcp: 2000, lcp: 3000, fid: 150, cls: 0.15, tbt: 300 };
    const c = calculatePerformanceScore(mid);
    expect(['B', 'C']).toContain(c.grade);
  });
});

// ==================== 问题检测测试 ====================

describe('detectPerformanceIssues', () => {
  it('优秀指标应无关键问题', () => {
    const issues = detectPerformanceIssues(goodMetrics);
    const critical = issues.filter(i => i.type === 'critical');
    expect(critical.length).toBe(0);
  });

  it('差指标应有关键问题', () => {
    const issues = detectPerformanceIssues(poorMetrics);
    const critical = issues.filter(i => i.type === 'critical');
    expect(critical.length).toBeGreaterThan(0);
  });

  it('应检测FCP问题', () => {
    const issues = detectPerformanceIssues({ ...goodMetrics, fcp: 5000 });
    expect(issues.some(i => i.message.includes('首次内容绘制'))).toBe(true);
  });

  it('应检测LCP问题', () => {
    const issues = detectPerformanceIssues({ ...goodMetrics, lcp: 5000 });
    expect(issues.some(i => i.message.includes('最大内容绘制'))).toBe(true);
  });

  it('应检测CLS问题', () => {
    const issues = detectPerformanceIssues({ ...goodMetrics, cls: 0.3 });
    expect(issues.some(i => i.message.includes('布局偏移'))).toBe(true);
  });

  it('应检测TBT问题', () => {
    const issues = detectPerformanceIssues({ ...goodMetrics, tbt: 700 });
    expect(issues.some(i => i.message.includes('阻塞时间'))).toBe(true);
  });

  it('应检测大资源', () => {
    const bigResource: ResourceMetric = {
      name: 'huge.js', type: 'script', size: 1024 * 1024,
      duration: 500, transferSize: 1024 * 1024, encodedBodySize: 1024 * 1024,
      decodedBodySize: 1024 * 1024, cached: false,
    };
    const issues = detectPerformanceIssues(goodMetrics, [bigResource]);
    expect(issues.some(i => i.category === 'network')).toBe(true);
  });

  it('问题应有正确的结构', () => {
    const issues = detectPerformanceIssues(poorMetrics, mockResources);
    issues.forEach(i => {
      expect(['critical', 'warning', 'info']).toContain(i.type);
      expect(['loading', 'rendering', 'memory', 'network', 'script']).toContain(i.category);
      expect(typeof i.message).toBe('string');
      expect(i.impact).toBeGreaterThanOrEqual(0);
      expect(i.impact).toBeLessThanOrEqual(100);
      expect(typeof i.suggestion).toBe('string');
    });
  });
});

// ==================== 优化建议测试 ====================

describe('generateOptimizationSuggestions', () => {
  it('应生成优化建议', () => {
    const issues = detectPerformanceIssues(poorMetrics, mockResources);
    const suggestions = generateOptimizationSuggestions(poorMetrics, issues, mockResources);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('建议应按优先级排序', () => {
    const issues = detectPerformanceIssues(poorMetrics, mockResources);
    const suggestions = generateOptimizationSuggestions(poorMetrics, issues, mockResources);
    const order = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < suggestions.length; i++) {
      expect(order[suggestions[i - 1].priority]).toBeLessThanOrEqual(order[suggestions[i].priority]);
    }
  });

  it('JS过大应生成代码分割建议', () => {
    const bigJS: ResourceMetric[] = [
      { name: 'big.js', type: 'script', size: 600 * 1024, duration: 300, transferSize: 600 * 1024, encodedBodySize: 600 * 1024, decodedBodySize: 600 * 1024, cached: false },
    ];
    const issues = detectPerformanceIssues({ ...goodMetrics, fcp: 2000 }, bigJS);
    const suggestions = generateOptimizationSuggestions({ ...goodMetrics, fcp: 2000 }, issues, bigJS);
    expect(suggestions.some(s => s.category === 'JavaScript优化')).toBe(true);
  });

  it('建议应有正确的结构', () => {
    const issues = detectPerformanceIssues(poorMetrics, mockResources);
    const suggestions = generateOptimizationSuggestions(poorMetrics, issues, mockResources);
    suggestions.forEach(s => {
      expect(['high', 'medium', 'low']).toContain(s.priority);
      expect(typeof s.category).toBe('string');
      expect(typeof s.description).toBe('string');
      expect(typeof s.estimatedImprovement).toBe('string');
    });
  });
});

// ==================== 资源分析测试 ====================

describe('analyzeResources', () => {
  it('应正确分析资源', () => {
    const analysis = analyzeResources(mockResources);
    expect(analysis.totalSize).toBeGreaterThan(0);
    expect(analysis.totalDuration).toBeGreaterThan(0);
    expect(analysis.largest.length).toBeLessThanOrEqual(10);
    expect(analysis.slowest.length).toBeLessThanOrEqual(10);
  });

  it('应按类型分组', () => {
    const analysis = analyzeResources(mockResources);
    expect(analysis.byType['script'].count).toBe(2);
    expect(analysis.byType['image'].count).toBe(1);
  });

  it('最大资源应排序', () => {
    const analysis = analyzeResources(mockResources);
    for (let i = 1; i < analysis.largest.length; i++) {
      expect(analysis.largest[i - 1].size).toBeGreaterThanOrEqual(analysis.largest[i].size);
    }
  });

  it('最慢资源应排序', () => {
    const analysis = analyzeResources(mockResources);
    for (let i = 1; i < analysis.slowest.length; i++) {
      expect(analysis.slowest[i - 1].duration).toBeGreaterThanOrEqual(analysis.slowest[i].duration);
    }
  });

  it('应计算缓存命中率', () => {
    const analysis = analyzeResources(mockResources);
    expect(analysis.cacheHitRate).toBeGreaterThan(0);
    expect(analysis.cacheHitRate).toBeLessThanOrEqual(1);
  });

  it('空资源应返回零值', () => {
    const analysis = analyzeResources([]);
    expect(analysis.totalSize).toBe(0);
    expect(analysis.cacheHitRate).toBe(0);
  });
});

// ==================== 基准测试测试 ====================

describe('benchmark', () => {
  it('应运行基准测试', () => {
    let count = 0;
    const result = benchmark('test', () => { count++; for (let i = 0; i < 10; i++) Math.sqrt(i); }, 100);
    expect(result.name).toBe('test');
    expect(result.iterations).toBe(100);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
    expect(result.avgTime).toBeGreaterThanOrEqual(0);
    expect(result.opsPerSecond).toBeGreaterThan(0);
  });

  it('min应<=avg<=max', () => {
    const result = benchmark('test', () => Math.random(), 200);
    expect(result.minTime).toBeLessThanOrEqual(result.avgTime + 0.001);
    expect(result.avgTime).toBeLessThanOrEqual(result.maxTime + 0.001);
  });
});

describe('compareBenchmarks', () => {
  it('应比较两个函数', () => {
    const result = compareBenchmarks(
      'fast', () => 1 + 1,
      'slow', () => { let x = ''; for (let i = 0; i < 10000; i++) x += String(i); },
      200,
    );
    expect(result.results.length).toBe(2);
    expect(result.ratio).toBeGreaterThanOrEqual(1);
    expect(typeof result.faster).toBe('string');
    expect(typeof result.slower).toBe('string');
  });
});

// ==================== 渲染性能测试 ====================

describe('analyzeRenderPerformance', () => {
  it('应分析渲染性能', () => {
    const profiles: RenderProfile[] = [
      { componentName: 'App', renderCount: 10, totalRenderTime: 50, avgRenderTime: 5, maxRenderTime: 15, wastedRenders: 2 },
      { componentName: 'Chart', renderCount: 20, totalRenderTime: 200, avgRenderTime: 10, maxRenderTime: 30, wastedRenders: 5 },
      { componentName: 'Table', renderCount: 5, totalRenderTime: 25, avgRenderTime: 5, maxRenderTime: 8, wastedRenders: 0 },
    ];

    const analysis = analyzeRenderPerformance(profiles);
    expect(analysis.totalRenders).toBe(35);
    expect(analysis.totalTime).toBe(275);
    expect(analysis.efficiency).toBeLessThan(1);
    expect(analysis.slowestComponents[0].componentName).toBe('Chart');
    expect(analysis.wastedRenderComponents.length).toBe(2);
  });

  it('空数据应返回默认值', () => {
    const analysis = analyzeRenderPerformance([]);
    expect(analysis.totalRenders).toBe(0);
    expect(analysis.efficiency).toBe(1);
  });
});

// ==================== 性能趋势测试 ====================

describe('calculatePerformanceTrend', () => {
  it('应检测改善趋势', () => {
    const history = [
      { timestamp: 3, score: 90 },
      { timestamp: 2, score: 80 },
      { timestamp: 1, score: 70 },
    ];
    const trend = calculatePerformanceTrend(history);
    expect(trend.trend).toBe('improving');
    expect(trend.change).toBeGreaterThan(0);
  });

  it('应检测下降趋势', () => {
    const history = [
      { timestamp: 3, score: 50 },
      { timestamp: 2, score: 70 },
      { timestamp: 1, score: 80 },
    ];
    const trend = calculatePerformanceTrend(history);
    expect(trend.trend).toBe('degrading');
    expect(trend.change).toBeLessThan(0);
  });

  it('应检测稳定趋势', () => {
    const history = [
      { timestamp: 3, score: 75 },
      { timestamp: 2, score: 73 },
      { timestamp: 1, score: 74 },
    ];
    const trend = calculatePerformanceTrend(history);
    expect(trend.trend).toBe('stable');
  });

  it('空数据应返回默认值', () => {
    const trend = calculatePerformanceTrend([]);
    expect(trend.current).toBe(0);
    expect(trend.trend).toBe('stable');
  });

  it('单个数据应返回稳定', () => {
    const trend = calculatePerformanceTrend([{ timestamp: 1, score: 80 }]);
    expect(trend.current).toBe(80);
    expect(trend.trend).toBe('stable');
  });
});

// ==================== 工具函数测试 ====================

describe('formatFileSize', () => {
  it('应格式化字节', () => {
    expect(formatFileSize(500)).toBe('500B');
  });

  it('应格式化KB', () => {
    expect(formatFileSize(2048)).toBe('2.0KB');
  });

  it('应格式化MB', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0MB');
  });
});

describe('formatDuration', () => {
  it('应格式化微秒', () => {
    expect(formatDuration(0.5)).toContain('μs');
  });

  it('应格式化毫秒', () => {
    expect(formatDuration(150)).toContain('ms');
  });

  it('应格式化秒', () => {
    expect(formatDuration(2000)).toContain('s');
  });
});

describe('getGradeColor', () => {
  it('A级应为绿色', () => {
    expect(getGradeColor('A')).toBe('#0cce6b');
  });

  it('各等级应有颜色', () => {
    expect(getGradeColor('B')).toBeTruthy();
    expect(getGradeColor('C')).toBeTruthy();
    expect(getGradeColor('D')).toBeTruthy();
    expect(getGradeColor('F')).toBeTruthy();
  });
});
