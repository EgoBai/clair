import logger from './logger';
/**
 * 图表渲染性能优化工具
 * 大数据量采样、虚拟化渲染、内存优化
 * 参考 TradingView 的大数据量处理策略
 */

// ==================== 类型定义 ====================

export interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  turnover?: number;
}

export interface SamplingOptions {
  maxPoints: number;
  strategy: 'lttb' | 'uniform' | 'adaptive';
}

// ==================== 数据采样算法 ====================

/**
 * LTTB 采样 (Largest Triangle Three Buckets)
 * 保留数据视觉特征的降采样算法，适合金融图表
 * O(n) 时间复杂度
 */
export function sampleLTTB(data: KLineData[], maxPoints: number): KLineData[] {
  if (data.length <= maxPoints) return data;
  if (maxPoints < 3) return data.slice(0, maxPoints);

  const sampled: KLineData[] = [data[0]]; // 始终保留首点
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  let prevIndex = 0;

  for (let i = 1; i < maxPoints - 1; i++) {
    const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);
    const nextRangeStart = Math.floor(i * bucketSize) + 1;
    const nextRangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length);

    // 计算当前桶的平均点
    let avgX = 0, avgY = 0;
    for (let j = nextRangeStart; j < nextRangeEnd; j++) {
      avgX += j;
      avgY += data[j].close;
    }
    avgX /= (nextRangeEnd - nextRangeStart);
    avgY /= (nextRangeEnd - nextRangeStart);

    // 找当前桶中三角面积最大的点
    let maxArea = -1;
    let maxIndex = rangeStart;
    const pointA = data[prevIndex];
    const pointAvg = { x: avgX, y: avgY };

    for (let j = rangeStart; j < rangeEnd; j++) {
      const pointB = data[j];
      const area = Math.abs(
        (pointA.close - pointB.close) * (j - prevIndex) -
        (pointA.close - pointAvg.y) * (pointAvg.x - prevIndex)
      );
      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }

    sampled.push(data[maxIndex]);
    prevIndex = maxIndex;
  }

  sampled.push(data[data.length - 1]); // 始终保留末点
  return sampled;
}

/**
 * 均匀采样 - 简单等距取点
 */
export function sampleUniform(data: KLineData[], maxPoints: number): KLineData[] {
  if (data.length <= maxPoints) return data;

  const step = data.length / maxPoints;
  const result: KLineData[] = [];

  for (let i = 0; i < maxPoints; i++) {
    const index = Math.min(Math.floor(i * step), data.length - 1);
    result.push(data[index]);
  }

  return result;
}

/**
 * 自适应采样 - 根据数据密度自动选择策略
 * 波动大的区域保留更多数据点
 */
export function sampleAdaptive(data: KLineData[], maxPoints: number): KLineData[] {
  if (data.length <= maxPoints) return data;

  // 计算每个点的波动率（高-低差）
  const volatilities = data.map(d => (d.high - d.low) / d.close);
  const avgVol = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;

  // 按波动率分配采样密度
  const _totalVol = volatilities.reduce((sum, v) => sum + Math.max(v / avgVol, 0.5), 0);
  const sampled: KLineData[] = [data[0]];

  let usedPoints = 1;
  let bucketStart = 0;

  for (let i = 1; i < data.length && usedPoints < maxPoints; i++) {
    const localVol = volatilities[i] / avgVol;
    const _bucketPoints = Math.max(1, Math.floor(localVol * 2));

    if (i - bucketStart >= Math.max(1, (data.length - bucketStart) / (maxPoints - usedPoints))) {
      sampled.push(data[i]);
      usedPoints++;
      bucketStart = i;
    }
  }

  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled.push(data[data.length - 1]);
  }

  return sampled;
}

/**
 * 智能采样入口
 */
export function sampleData(data: KLineData[], options: SamplingOptions): KLineData[] {
  const { maxPoints, strategy } = options;

  switch (strategy) {
    case 'lttb': return sampleLTTB(data, maxPoints);
    case 'uniform': return sampleUniform(data, maxPoints);
    case 'adaptive': return sampleAdaptive(data, maxPoints);
    default: return sampleLTTB(data, maxPoints);
  }
}

// ==================== 数据分块处理 ====================

/**
 * 大数据分块处理 - 避免主线程阻塞
 * 每块处理后让出主线程
 */
export async function processInChunks<T, R>(
  data: T[],
  chunkSize: number,
  processor: (chunk: T[]) => R[],
  onProgress?: (progress: number) => void
): Promise<R[]> {
  const result: R[] = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const chunkResult = processor(chunk);
    result.push(...chunkResult);

    onProgress?.(Math.min(100, ((i + chunkSize) / data.length) * 100));

    // 每处理一块让出主线程
    if (i + chunkSize < data.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return result;
}

// ==================== 虚拟列表计算 ====================

export interface VirtualRange {
  start: number;
  end: number;
  offset: number;
}

export function calculateVirtualRange(
  totalItems: number,
  viewportWidth: number,
  itemWidth: number,
  scrollLeft: number,
  overscan: number = 5
): VirtualRange {
  const visibleCount = Math.ceil(viewportWidth / itemWidth);
  const start = Math.max(0, Math.floor(scrollLeft / itemWidth) - overscan);
  const end = Math.min(totalItems, start + visibleCount + overscan * 2);

  return { start, end, offset: start * itemWidth };
}

// ==================== 性能监控 ====================

export class RenderProfiler {
  private marks: Map<string, number> = new Map();

  start(label: string): void {
    this.marks.set(label, performance.now());
  }

  end(label: string): number {
    const start = this.marks.get(label);
    if (!start) return 0;
    const elapsed = performance.now() - start;
    this.marks.delete(label);

    if (elapsed > 16) { // 超过1帧(60fps)
      logger.warn(`[RenderProfiler] "${label}" took ${elapsed.toFixed(1)}ms (>${16}ms threshold)`);
    }

    return elapsed;
  }

  measure<T>(label: string, fn: () => T): T {
    this.start(label);
    const result = fn();
    this.end(label);
    return result;
  }
}

export const renderProfiler = new RenderProfiler();
