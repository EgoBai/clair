/**
 * 构建产物分析器
 * 运行时分析 bundle 大小和依赖权重
 */

interface ChunkInfo {
  name: string;
  size: number;
  gzipSize?: number;
  modules: string[];
}

interface BuildAnalysis {
  totalSize: number;
  totalGzipSize: number;
  chunks: ChunkInfo[];
  topModules: { name: string; size: number }[];
  recommendations: string[];
}

// 预算阈值（字节）
export const BUDGETS = {
  maxInitialBundle: 300 * 1024,      // 300KB
  maxSingleChunk: 500 * 1024,        // 500KB
  maxTotalJS: 1500 * 1024,           // 1.5MB
  maxCSS: 200 * 1024,                // 200KB
  maxImage: 100 * 1024,              // 单张图 100KB
  maxFont: 100 * 1024,               // 单字体 100KB
};

/**
 * 检查资源是否超过预算
 */
export function checkBudget(
  resourceType: keyof typeof BUDGETS,
  size: number
): { passed: boolean; budget: number; actual: number; overage: number } {
  const budget = BUDGETS[resourceType];
  return {
    passed: size <= budget,
    budget,
    actual: size,
    overage: Math.max(0, size - budget),
  };
}

/**
 * 估算 gzip 后大小（约原始的 30%）
 */
export function estimateGzipSize(originalSize: number): number {
  return Math.round(originalSize * 0.3);
}

/**
 * 分析 performance entries 获取资源大小
 */
export function analyzeLoadedResources(): BuildAnalysis {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) {
    return {
      totalSize: 0,
      totalGzipSize: 0,
      chunks: [],
      topModules: [],
      recommendations: ['无法在当前环境分析资源'],
    };
  }

  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const chunks: ChunkInfo[] = [];
  const recommendations: string[] = [];
  let totalSize = 0;

  resources.forEach(resource => {
    const size = resource.transferSize || resource.encodedBodySize || 0;
    totalSize += size;

    const url = new URL(resource.name);
    const name = url.pathname.split('/').pop() || resource.name;

    if (name.endsWith('.js') || name.endsWith('.mjs')) {
      chunks.push({
        name,
        size,
        gzipSize: estimateGzipSize(resource.decodedBodySize || size),
        modules: [],
      });
    }
  });

  // 预算检查
  const totalJS = chunks.reduce((sum, c) => sum + c.size, 0);
  const jsBudget = checkBudget('maxTotalJS', totalJS);
  if (!jsBudget.passed) {
    recommendations.push(`JS 总大小 ${(totalJS / 1024).toFixed(1)}KB 超过预算 ${(BUDGETS.maxTotalJS / 1024).toFixed(0)}KB`);
  }

  chunks.forEach(chunk => {
    const chunkBudget = checkBudget('maxSingleChunk', chunk.size);
    if (!chunkBudget.passed) {
      recommendations.push(`Chunk ${chunk.name} (${(chunk.size / 1024).toFixed(1)}KB) 超过单 chunk 预算`);
    }
  });

  // 找出最大的 chunks
  const topModules = chunks
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .map(c => ({ name: c.name, size: c.size }));

  return {
    totalSize,
    totalGzipSize: estimateGzipSize(totalSize),
    chunks,
    topModules,
    recommendations,
  };
}

/**
 * 导出性能报告 JSON
 */
export function generatePerformanceReport(): string {
  const analysis = analyzeLoadedResources();
  return JSON.stringify(analysis, null, 2);
}

export default {
  BUDGETS,
  checkBudget,
  estimateGzipSize,
  analyzeLoadedResources,
  generatePerformanceReport,
};
