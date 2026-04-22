/**
 * 异步任务调度引擎
 * Async Task Scheduler Engine
 *
 * 任务队列、优先级调度、并发控制、重试机制
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export interface Task<T = any> {
  id: string;
  name: string;
  priority: TaskPriority;
  fn: () => Promise<T>;
  status: TaskStatus;
  result?: T;
  error?: Error;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retries: number;
  maxRetries: number;
}

export interface SchedulerConfig {
  concurrency: number;
  defaultMaxRetries: number;
  retryDelay: number;
  taskTimeout: number;
  onComplete?: (task: Task) => void;
  onError?: (task: Task, error: Error) => void;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * 任务调度器
 */
export class TaskScheduler {
  private queue: Task[] = [];
  private running: Map<string, Task> = new Map();
  private completed: Task[] = [];
  private config: SchedulerConfig;
  private idCounter = 0;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = {
      concurrency: 4,
      defaultMaxRetries: 3,
      retryDelay: 1000,
      taskTimeout: 30_000,
      ...config,
    };
  }

  /**
   * 添加任务
   */
  addTask<T>(
    name: string,
    fn: () => Promise<T>,
    priority: TaskPriority = 'normal',
    maxRetries?: number
  ): string {
    const id = `task-${++this.idCounter}`;
    const task: Task<T> = {
      id,
      name,
      priority,
      fn,
      status: 'pending',
      createdAt: Date.now(),
      retries: 0,
      maxRetries: maxRetries ?? this.config.defaultMaxRetries,
    };
    this.queue.push(task);
    this.sortQueue();
    this.schedule();
    return id;
  }

  /**
   * 取消任务
   */
  cancelTask(id: string): boolean {
    const idx = this.queue.findIndex(t => t.id === id);
    if (idx >= 0) {
      this.queue[idx].status = 'cancelled';
      this.queue.splice(idx, 1);
      return true;
    }
    const running = this.running.get(id);
    if (running) {
      running.status = 'cancelled';
      return true;
    }
    return false;
  }

  /**
   * 获取任务状态
   */
  getTask(id: string): Task | undefined {
    return this.queue.find(t => t.id === id) ||
      this.running.get(id) ||
      this.completed.find(t => t.id === id);
  }

  /**
   * 获取队列状态
   */
  getStats(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    return {
      pending: this.queue.filter(t => t.status === 'pending').length,
      running: this.running.size,
      completed: this.completed.filter(t => t.status === 'completed').length,
      failed: this.completed.filter(t => t.status === 'failed').length,
      cancelled: this.completed.filter(t => t.status === 'cancelled').length,
    };
  }

  /**
   * 等待所有任务完成
   */
  async waitAll(): Promise<void> {
    while (this.queue.length > 0 || this.running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * 暂停调度（不影响正在运行的任务）
   */
  pause(): void {
    this.paused = true;
  }

  private paused = false;

  /**
   * 恢复调度
   */
  resume(): void {
    this.paused = false;
    this.schedule();
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      return a.createdAt - b.createdAt;
    });
  }

  private schedule(): void {
    if (this.paused) return;

    while (this.running.size < this.config.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      if (task.status === 'cancelled') continue;
      this.execute(task);
    }
  }

  private async execute(task: Task): Promise<void> {
    task.status = 'running';
    task.startedAt = Date.now();
    this.running.set(task.id, task);

    try {
      const result = await Promise.race([
        task.fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), this.config.taskTimeout)
        ),
      ]);

      task.result = result;
      task.status = 'completed';
      task.completedAt = Date.now();
      this.config.onComplete?.(task);
    } catch (error) {
      if ((task.status as TaskStatus) === 'cancelled') {
        task.completedAt = Date.now();
        this.completed.push(task);
        this.running.delete(task.id);
        this.schedule();
        return;
      }

      task.retries++;
      if (task.retries <= task.maxRetries) {
        // 重试
        setTimeout(() => {
          task.status = 'pending';
          this.queue.unshift(task); // 高优先级重试
          this.schedule();
        }, this.config.retryDelay * task.retries);
        this.running.delete(task.id);
        return;
      }

      task.error = error as Error;
      task.status = 'failed';
      task.completedAt = Date.now();
      this.config.onError?.(task, error as Error);
    }

    this.completed.push(task);
    this.running.delete(task.id);
    this.schedule();
  }
}

/**
 * 批量处理工具
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: { concurrency: number; retryCount?: number }
): Promise<Array<{ item: T; result?: R; error?: Error }>> {
  const results: Array<{ item: T; result?: R; error?: Error }> = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const exec = (async () => {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < (options.retryCount ?? 1); attempt++) {
        try {
          const result = await processor(item);
          results.push({ item, result });
          return;
        } catch (err) {
          lastError = err as Error;
        }
      }
      results.push({ item, error: lastError });
    })();

    executing.push(exec);
    if (executing.length >= options.concurrency) {
      await Promise.race(executing);
      const idx = executing.findIndex(e => e === undefined);
      executing.splice(idx >= 0 ? idx : 0, 1);
    }
  }

  await Promise.all(executing);
  return results;
}
