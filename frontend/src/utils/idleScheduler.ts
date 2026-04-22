import logger from './logger';
/**
 * 空闲调度器
 * 使用 requestIdleCallback 调度非关键任务
 * 不阻塞主线程渲染
 */

// ==================== 类型定义 ====================

interface IdleTask {
  id: string;
  task: () => void | Promise<void>;
  priority: 'immediate' | 'high' | 'normal' | 'low';
  timeout?: number;
  label?: string;
}

interface SchedulerOptions {
  maxConcurrent?: number;
  defaultTimeout?: number;
}

// ==================== requestIdleCallback polyfill ====================

const ric = (cb: IdleRequestCallback, options?: IdleRequestOptions): number => {
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback(cb, options);
  }
  const start = performance.now();
  return window.setTimeout(() => {
    cb({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (performance.now() - start)),
    });
  }, 1);
};

const cic = (id: number) => {
  if (typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
};

const raf = (cb: FrameRequestCallback): number => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
};

const caf = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
};

// ==================== 空闲调度器 ====================

export class IdleScheduler {
  private queues: Map<string, IdleTask[]> = new Map();
  private running = 0;
  private maxConcurrent: number;
  private defaultTimeout: number;
  private scheduled = false;
  private frameHandle: number = 0;
  private metrics = { scheduled: 0, executed: 0, dropped: 0 };

  constructor(options: SchedulerOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.defaultTimeout = options.defaultTimeout ?? 2000;

    this.queues.set('immediate', []);
    this.queues.set('high', []);
    this.queues.set('normal', []);
    this.queues.set('low', []);
  }

  /** 调度任务 */
  schedule(task: () => void | Promise<void>, options: Partial<IdleTask> = {}): string {
    const id = options.id || `idle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const priority = options.priority || 'normal';

    const queue = this.queues.get(priority)!;
    queue.push({ id, task, priority, timeout: options.timeout, label: options.label });

    this.metrics.scheduled++;

    if (!this.scheduled) {
      this.processNext();
    }

    return id;
  }

  /** 批量调度 */
  scheduleBatch(tasks: Array<{ task: () => void | Promise<void>; priority?: IdleTask['priority'] }>): string[] {
    return tasks.map(t => this.schedule(t.task, { priority: t.priority }));
  }

  /** 调度并等待完成 */
  scheduleAsync<T>(task: () => T | Promise<T>, priority: IdleTask['priority'] = 'normal'): Promise<T> {
    return new Promise((resolve, reject) => {
      this.schedule(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }, { priority });
    });
  }

  private processNext(): void {
    if (this.running >= this.maxConcurrent) {
      this.scheduled = true;
      return;
    }

    const task = this.dequeue();
    if (!task) {
      this.scheduled = false;
      return;
    }

    this.scheduled = true;
    this.running++;

    const execute = async () => {
      try {
        await task.task();
        this.metrics.executed++;
      } catch (err) {
        logger.error(`[IdleScheduler] Task ${task.id} failed:`, err);
      } finally {
        this.running--;
        this.processNext();
      }
    };

    if (task.priority === 'immediate') {
      // 立即执行，但等下一帧
      this.frameHandle = raf(() => execute());
    } else {
      const timeout = task.priority === 'high' ? 1000 : this.defaultTimeout;
      ric(() => execute(), { timeout });
    }
  }

  private dequeue(): IdleTask | undefined {
    for (const priority of ['immediate', 'high', 'normal', 'low']) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) return queue.shift();
    }
    return undefined;
  }

  /** 清空指定优先级队列 */
  clear(priority?: string): void {
    if (priority) {
      this.queues.get(priority)?.splice(0);
    } else {
      this.queues.forEach(q => q.splice(0));
    }
  }

  /** 获取状态 */
  getStatus() {
    return {
      running: this.running,
      queued: Object.fromEntries([...this.queues].map(([k, v]) => [k, v.length])),
      ...this.metrics,
    };
  }

  /** 销毁 */
  dispose(): void {
    caf(this.frameHandle);
    this.clear();
  }
}

// ==================== 单例 ====================

let scheduler: IdleScheduler | null = null;

export function getIdleScheduler(options?: SchedulerOptions): IdleScheduler {
  if (!scheduler) {
    scheduler = new IdleScheduler(options);
  }
  return scheduler;
}

// ==================== 便捷方法 ====================

/** 空闲时执行（不阻塞渲染） */
export function whenIdle(fn: () => void | Promise<void>, timeout = 2000): Promise<void> {
  return getIdleScheduler().scheduleAsync(fn, 'normal');
}

/** 下一帧执行 */
export function nextFrame(fn: () => void): void {
  getIdleScheduler().schedule(fn, { priority: 'immediate' });
}

/** 延迟批量执行 */
export function deferredBatch(tasks: Array<() => void>): void {
  const sched = getIdleScheduler();
  tasks.forEach((task, i) => {
    sched.schedule(task, { priority: i < 3 ? 'high' : 'normal' });
  });
}
