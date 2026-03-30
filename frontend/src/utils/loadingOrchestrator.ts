/**
 * 加载状态编排器
 * 
 * 职责：
 * - 统一管理多个并行/串行加载任务
 * - 进度追踪
 * - 超时处理
 * - 首屏加载 <3秒优化
 * 
 * 参考：Linear App 首屏加载策略
 */

export type LoadingPhase = 'idle' | 'loading' | 'success' | 'error' | 'timeout';

export interface LoadingTask {
  id: string;
  label: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  timeout: number; // ms
  status: LoadingPhase;
  startTime?: number;
  endTime?: number;
  error?: string;
}

export interface LoadingState {
  phase: LoadingPhase;
  tasks: LoadingTask[];
  progress: number; // 0-100
  elapsed: number; // ms
  isStale: boolean; // 超过预期时间
}

// ==================== 加载编排器 ====================

export class LoadingOrchestrator {
  private tasks: Map<string, LoadingTask> = new Map();
  private listeners: Set<(state: LoadingState) => void> = new Set();
  private startTime: number = 0;
  private timeoutChecker: ReturnType<typeof setInterval> | null = null;

  /**
   * 注册加载任务
   */
  register(id: string, label: string, priority: LoadingTask['priority'] = 'normal', timeout = 10000): void {
    this.tasks.set(id, {
      id,
      label,
      priority,
      timeout,
      status: 'idle',
    });
  }

  /**
   * 开始任务
   */
  start(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'loading';
    task.startTime = Date.now();

    if (this.startTime === 0) {
      this.startTime = Date.now();
      this.startTimeoutChecker();
    }

    this.notify();
  }

  /**
   * 完成任务
   */
  complete(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'success';
    task.endTime = Date.now();
    this.notify();
    this.checkAllDone();
  }

  /**
   * 任务失败
   */
  fail(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'error';
    task.endTime = Date.now();
    task.error = error;
    this.notify();
    this.checkAllDone();
  }

  /**
   * 获取当前状态
   */
  getState(): LoadingState {
    const tasks = Array.from(this.tasks.values());
    const done = tasks.filter(t => t.status === 'success' || t.status === 'error').length;
    const total = tasks.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 100;
    const elapsed = this.startTime > 0 ? Date.now() - this.startTime : 0;

    // 检查是否有关键任务超时
    const criticalTasks = tasks.filter(t => t.priority === 'critical' && t.status === 'loading');
    const isStale = criticalTasks.some(t => t.startTime && Date.now() - t.startTime > t.timeout);

    let phase: LoadingPhase = 'idle';
    if (tasks.some(t => t.status === 'loading')) phase = 'loading';
    else if (tasks.some(t => t.status === 'error')) phase = 'error';
    else if (tasks.some(t => t.status === 'timeout')) phase = 'timeout';
    else if (done === total && total > 0) phase = 'success';

    return { phase, tasks, progress, elapsed, isStale };
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: (state: LoadingState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 重置所有任务
   */
  reset(): void {
    this.tasks.forEach(t => {
      t.status = 'idle';
      t.startTime = undefined;
      t.endTime = undefined;
      t.error = undefined;
    });
    this.startTime = 0;
    this.stopTimeoutChecker();
    this.notify();
  }

  /**
   * 获取关键路径任务（priority=critical）
   */
  getCriticalTasks(): LoadingTask[] {
    return Array.from(this.tasks.values()).filter(t => t.priority === 'critical');
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
  }

  private checkAllDone(): void {
    const tasks = Array.from(this.tasks.values());
    const allDone = tasks.every(t => t.status === 'success' || t.status === 'error' || t.status === 'timeout');
    if (allDone) {
      this.stopTimeoutChecker();
    }
  }

  private startTimeoutChecker(): void {
    this.timeoutChecker = setInterval(() => {
      const now = Date.now();
      let changed = false;
      this.tasks.forEach(t => {
        if (t.status === 'loading' && t.startTime && now - t.startTime > t.timeout) {
          t.status = 'timeout';
          t.endTime = now;
          changed = true;
        }
      });
      if (changed) this.notify();
    }, 1000);
  }

  private stopTimeoutChecker(): void {
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }
  }
}

// ==================== 首屏加载计时器 ====================

export class FirstPaintTimer {
  private marks: Map<string, number> = new Map();
  private startMark: number = 0;

  start(): void {
    this.startMark = performance.now();
    this.marks.set('start', this.startMark);
  }

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  getDuration(from = 'start', to?: string): number {
    const fromTime = this.marks.get(from) || 0;
    const toTime = to ? this.marks.get(to) : performance.now();
    return (toTime || 0) - fromTime;
  }

  /**
   * 获取首屏加载报告
   */
  getReport(): Record<string, number> {
    const report: Record<string, number> = {};
    this.marks.forEach((time, name) => {
      report[name] = Math.round(time - this.startMark);
    });
    return report;
  }

  /**
   * 是否达到 <3秒首屏目标
   */
  meetsTarget(targetMs = 3000): boolean {
    return this.getDuration() < targetMs;
  }

  reset(): void {
    this.marks.clear();
    this.startMark = 0;
  }
}

// ==================== 交互反馈统一管理 ====================

export type FeedbackType = 'success' | 'error' | 'warning' | 'info';

export interface FeedbackMessage {
  id: string;
  type: FeedbackType;
  message: string;
  duration: number;
  timestamp: number;
}

export class FeedbackManager {
  private messages: FeedbackMessage[] = [];
  private listeners: Set<(messages: FeedbackMessage[]) => void> = new Set();
  private maxMessages = 5;

  /**
   * 显示消息
   */
  show(type: FeedbackType, message: string, duration = 3000): string {
    const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const msg: FeedbackMessage = { id, type, message, duration, timestamp: Date.now() };

    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
    this.notify();

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  success(message: string, duration?: number): string { return this.show('success', message, duration); }
  error(message: string, duration?: number): string { return this.show('error', message, duration ?? 5000); }
  warning(message: string, duration?: number): string { return this.show('warning', message, duration); }
  info(message: string, duration?: number): string { return this.show('info', message, duration); }

  /**
   * 关闭消息
   */
  dismiss(id: string): void {
    this.messages = this.messages.filter(m => m.id !== id);
    this.notify();
  }

  /**
   * 全部关闭
   */
  dismissAll(): void {
    this.messages = [];
    this.notify();
  }

  /**
   * 获取当前消息
   */
  getMessages(): FeedbackMessage[] {
    return [...this.messages];
  }

  subscribe(listener: (messages: FeedbackMessage[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(fn => fn(this.messages));
  }
}

// ==================== 导出 ====================

export const defaultOrchestrator = new LoadingOrchestrator();
export const defaultFeedback = new FeedbackManager();
