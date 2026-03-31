/**
 * Render Scheduler & Frame Budget Engine
 *
 * 管理渲染调度、帧预算分配、任务优先级队列
 * 确保60fps流畅渲染
 */

// ==================== 帧预算管理 ====================

export interface FrameBudgetConfig {
  targetFPS: number;
  maxFrameTime: number; // ms
  warningThreshold: number; // ms
}

export interface FrameStats {
  frameNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  tasksExecuted: number;
  budgetRemaining: number;
  overBudget: boolean;
}

export class FrameBudgetManager {
  private config: FrameBudgetConfig;
  private frameCount = 0;
  private frameHistory: FrameStats[] = [];
  private maxHistory = 120; // 2 seconds at 60fps

  constructor(config: Partial<FrameBudgetConfig> = {}) {
    this.config = {
      targetFPS: config.targetFPS ?? 60,
      maxFrameTime: config.maxFrameTime ?? (1000 / (config.targetFPS ?? 60)),
      warningThreshold: config.warningThreshold ?? (1000 / (config.targetFPS ?? 60)) * 0.8,
    };
  }

  getBudgetPerFrame(): number {
    return this.config.maxFrameTime;
  }

  recordFrame(stats: Omit<FrameStats, 'frameNumber'>): FrameStats {
    const frame: FrameStats = {
      frameNumber: this.frameCount++,
      ...stats,
    };

    this.frameHistory.push(frame);
    if (this.frameHistory.length > this.maxHistory) {
      this.frameHistory.shift();
    }

    return frame;
  }

  getAverageFPS(windowFrames: number = 60): number {
    const recent = this.frameHistory.slice(-windowFrames);
    if (recent.length < 2) return this.config.targetFPS;

    const totalTime = recent[recent.length - 1].endTime - recent[0].startTime;
    if (totalTime === 0) return this.config.targetFPS;

    return (recent.length / totalTime) * 1000;
  }

  getFrameTimePercentile(percentile: number): number {
    if (this.frameHistory.length === 0) return 0;
    const sorted = [...this.frameHistory].map(f => f.duration).sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * percentile);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  isPerformanceGood(): boolean {
    return this.getFrameTimePercentile(0.95) < this.config.warningThreshold;
  }

  getReport(): {
    avgFPS: number;
    p50: number;
    p95: number;
    p99: number;
    droppedFrames: number;
    totalFrames: number;
  } {
    const dropped = this.frameHistory.filter(f => f.overBudget).length;
    return {
      avgFPS: this.getAverageFPS(),
      p50: this.getFrameTimePercentile(0.5),
      p95: this.getFrameTimePercentile(0.95),
      p99: this.getFrameTimePercentile(0.99),
      droppedFrames: dropped,
      totalFrames: this.frameHistory.length,
    };
  }

  reset(): void {
    this.frameCount = 0;
    this.frameHistory = [];
  }
}

// ==================== 任务调度器 ====================

export type TaskPriority = 'immediate' | 'high' | 'normal' | 'low' | 'idle';

export interface ScheduledTask {
  id: string;
  priority: TaskPriority;
  callback: () => void | Promise<void>;
  deadline: number; // ms from now
  createdAt: number;
  runs: number;
  maxRuns: number;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  immediate: 0,
  high: 1,
  normal: 2,
  low: 3,
  idle: 4,
};

export class RenderScheduler {
  private tasks: ScheduledTask[] = [];
  private running = false;
  private frameBudget: number;
  private frameStart = 0;
  private taskIdCounter = 0;

  constructor(frameBudget: number = 16) {
    this.frameBudget = frameBudget;
  }

  schedule(
    callback: () => void | Promise<void>,
    options: Partial<Pick<ScheduledTask, 'priority' | 'deadline' | 'maxRuns'>> = {}
  ): string {
    const id = `task-${this.taskIdCounter++}`;
    const task: ScheduledTask = {
      id,
      priority: options.priority ?? 'normal',
      callback,
      deadline: options.deadline ?? Infinity,
      createdAt: Date.now(),
      runs: 0,
      maxRuns: options.maxRuns ?? 1,
    };
    this.tasks.push(task);
    this.sortTasks();
    return id;
  }

  cancel(taskId: string): boolean {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      this.tasks.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * 执行一帧的任务，返回剩余预算
   */
  executeFrame(budget?: number): { executed: number; remaining: number; skipped: number } {
    const frameBudget = budget ?? this.frameBudget;
    const start = performance.now();
    let executed = 0;
    let skipped = 0;
    const now = Date.now();

    while (this.tasks.length > 0) {
      const elapsed = performance.now() - start;
      if (elapsed >= frameBudget) break;

      const task = this.tasks[0];

      // Check deadline
      if (task.deadline !== Infinity && now > task.createdAt + task.deadline) {
        this.tasks.shift();
        skipped++;
        continue;
      }

      // Execute
      this.tasks.shift();
      try {
        task.callback();
      } catch {
        // Skip failed tasks
      }
      task.runs++;
      executed++;

      // Re-queue if recurring
      if (task.runs < task.maxRuns) {
        this.tasks.push(task);
        this.sortTasks();
      }
    }

    return {
      executed,
      remaining: Math.max(0, frameBudget - (performance.now() - start)),
      skipped,
    };
  }

  getQueueLength(): number {
    return this.tasks.length;
  }

  getQueueByPriority(): Record<TaskPriority, number> {
    const counts: Record<string, number> = { immediate: 0, high: 0, normal: 0, low: 0, idle: 0 };
    for (const t of this.tasks) {
      counts[t.priority]++;
    }
    return counts as Record<TaskPriority, number>;
  }

  clear(): void {
    this.tasks = [];
  }

  private sortTasks(): void {
    this.tasks.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }
}

// ==================== Work Chunking ====================

export interface ChunkConfig {
  chunkSize: number;
  yieldInterval: number; // ms between chunks
}

export class WorkChunker {
  private config: ChunkConfig;

  constructor(config: Partial<ChunkConfig> = {}) {
    this.config = {
      chunkSize: config.chunkSize ?? 100,
      yieldInterval: config.yieldInterval ?? 16,
    };
  }

  /**
   * 将大数组处理分解为多个chunk
   */
  *chunkArray<T>(items: T[]): Generator<{ chunk: T[]; index: number; total: number }> {
    const total = Math.ceil(items.length / this.config.chunkSize);
    for (let i = 0; i < items.length; i += this.config.chunkSize) {
      const chunkIndex = Math.floor(i / this.config.chunkSize);
      yield {
        chunk: items.slice(i, i + this.config.chunkSize),
        index: chunkIndex,
        total,
      };
    }
  }

  /**
   * 异步分块处理
   */
  async processChunked<T, R>(
    items: T[],
    processor: (item: T, index: number) => R,
    onProgress?: (processed: number, total: number) => void
  ): Promise<R[]> {
    const results: R[] = [];

    for (const { chunk, index } of this.chunkArray(items)) {
      const chunkStart = index * this.config.chunkSize;
      for (let i = 0; i < chunk.length; i++) {
        results.push(processor(chunk[i], chunkStart + i));
      }

      onProgress?.(Math.min((index + 1) * this.config.chunkSize, items.length), items.length);

      // Yield to event loop
      if (index < items.length / this.config.chunkSize - 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return results;
  }
}

// ==================== 重绘管理 ====================

export class RepaintScheduler {
  private dirtyRegions = new Set<string>();
  private scheduled = false;
  private callbacks: Map<string, () => void> = new Map();

  markDirty(regionId: string): void {
    this.dirtyRegions.add(regionId);
    if (!this.scheduled) {
      this.scheduled = true;
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(this.flush.bind(this));
      } else {
        setTimeout(this.flush.bind(this), 0);
      }
    }
  }

  onRepaint(regionId: string, callback: () => void): void {
    this.callbacks.set(regionId, callback);
  }

  removeRepaint(regionId: string): void {
    this.callbacks.delete(regionId);
    this.dirtyRegions.delete(regionId);
  }

  private flush(): void {
    const regions = [...this.dirtyRegions];
    this.dirtyRegions.clear();
    this.scheduled = false;

    for (const id of regions) {
      const cb = this.callbacks.get(id);
      if (cb) {
        try { cb(); } catch { /* skip */ }
      }
    }
  }

  getDirtyRegions(): string[] {
    return [...this.dirtyRegions];
  }
}
