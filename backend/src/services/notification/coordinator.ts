/**
 * 多通道通知协调器
 * 协调多个通知渠道的发送，支持降级、重试、状态追踪
 */

import { NotificationPayload, NotificationChannel } from './types';

/** 渠道状态 */
export type ChannelStatus = 'idle' | 'sending' | 'sent' | 'failed' | 'retrying';

/** 发送任务 */
export interface SendTask {
  id: string;
  notification: NotificationPayload;
  channel: NotificationChannel;
  status: ChannelStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: number;
  completedAt?: number;
  error?: string;
}

/** 协调器配置 */
export interface CoordinatorConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  fallbackOrder: NotificationChannel[];
  parallelSending: boolean;
}

/** 渠道处理器 */
export type ChannelSender = (notification: NotificationPayload) => Promise<boolean>;

/** 协调器统计 */
export interface CoordinatorStats {
  totalSent: number;
  totalFailed: number;
  byChannel: Record<string, { sent: number; failed: number; retries: number }>;
  avgLatencyMs: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 5000,
  fallbackOrder: ['websocket', 'push', 'in_app', 'email', 'sms'],
  parallelSending: true,
};

export class NotificationCoordinator {
  private config: CoordinatorConfig;
  private senders: Map<NotificationChannel, ChannelSender> = new Map();
  private tasks: Map<string, SendTask> = new Map();
  private stats: CoordinatorStats = {
    totalSent: 0,
    totalFailed: 0,
    byChannel: {},
    avgLatencyMs: 0,
  };
  private latencySamples: number[] = [];

  constructor(config: Partial<CoordinatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 注册渠道发送器 */
  registerChannel(channel: NotificationChannel, sender: ChannelSender): void {
    this.senders.set(channel, sender);
  }

  /** 发送通知到指定渠道 */
  async send(notification: NotificationPayload, channels?: NotificationChannel[]): Promise<SendTask[]> {
    const targetChannels = channels || notification.channels || ['in_app'];
    const tasks: SendTask[] = [];

    if (this.config.parallelSending) {
      const results = await Promise.allSettled(
        targetChannels.map(ch => this.sendToChannel(notification, ch))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          tasks.push(result.value);
        }
      }
    } else {
      for (const channel of targetChannels) {
        const task = await this.sendToChannel(notification, channel);
        tasks.push(task);
      }
    }

    return tasks;
  }

  /** 发送到单个渠道 */
  private async sendToChannel(
    notification: NotificationPayload,
    channel: NotificationChannel
  ): Promise<SendTask> {
    const task: SendTask = {
      id: `task_${channel}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      notification,
      channel,
      status: 'sending',
      attempts: 0,
      maxAttempts: this.config.maxRetries,
    };

    this.tasks.set(task.id, task);

    const sender = this.senders.get(channel);
    if (!sender) {
      task.status = 'failed';
      task.error = `No sender registered for channel: ${channel}`;
      this.recordStats(channel, false, 0);
      return task;
    }

    const startTime = Date.now();

    for (let attempt = 0; attempt < task.maxAttempts; attempt++) {
      task.attempts = attempt + 1;
      task.lastAttemptAt = Date.now();
      task.status = attempt > 0 ? 'retrying' : 'sending';

      try {
        const success = await Promise.race([
          sender(notification),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.config.timeoutMs)
          ),
        ]);

        if (success) {
          task.status = 'sent';
          task.completedAt = Date.now();
          this.recordStats(channel, true, Date.now() - startTime);
          return task;
        }
      } catch (error) {
        task.error = error instanceof Error ? error.message : String(error);
      }

      // 重试前等待
      if (attempt < task.maxAttempts - 1) {
        await new Promise(r => setTimeout(r, this.config.retryDelayMs));
      }
    }

    // 所有重试失败，尝试降级
    const fallbackResult = await this.tryFallback(notification, channel);
    if (fallbackResult) {
      task.status = 'sent';
      task.completedAt = Date.now();
      task.error = `Fallback to ${fallbackResult.channel}`;
      this.recordStats(channel, false, Date.now() - startTime);
      return task;
    }

    task.status = 'failed';
    this.recordStats(channel, false, Date.now() - startTime);
    return task;
  }

  /** 降级策略 */
  private async tryFallback(
    notification: NotificationPayload,
    failedChannel: NotificationChannel
  ): Promise<SendTask | null> {
    const fallbackChannels = this.config.fallbackOrder.filter(
      ch => ch !== failedChannel && !notification.channels.includes(ch)
    );

    for (const channel of fallbackChannels) {
      const sender = this.senders.get(channel);
      if (!sender) continue;

      try {
        const success = await sender(notification);
        if (success) {
          const task: SendTask = {
            id: `fallback_${channel}_${Date.now()}`,
            notification,
            channel,
            status: 'sent',
            attempts: 1,
            maxAttempts: 1,
            completedAt: Date.now(),
          };
          this.recordStats(channel, true, 0);
          return task;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /** 批量发送 */
  async sendBatch(
    notifications: NotificationPayload[],
    channels?: NotificationChannel[]
  ): Promise<SendTask[]> {
    const allTasks: SendTask[] = [];
    for (const notification of notifications) {
      const tasks = await this.send(notification, channels);
      allTasks.push(...tasks);
    }
    return allTasks;
  }

  // ========== 查询 ==========

  /** 获取任务 */
  getTask(taskId: string): SendTask | undefined {
    return this.tasks.get(taskId);
  }

  /** 获取所有任务 */
  getAllTasks(): SendTask[] {
    return Array.from(this.tasks.values());
  }

  /** 按状态获取任务 */
  getTasksByStatus(status: ChannelStatus): SendTask[] {
    return this.getAllTasks().filter(t => t.status === status);
  }

  /** 获取统计 */
  getStats(): CoordinatorStats {
    return { ...this.stats };
  }

  /** 获取已注册渠道 */
  getRegisteredChannels(): NotificationChannel[] {
    return Array.from(this.senders.keys());
  }

  /** 清空 */
  clear(): void {
    this.tasks.clear();
    this.stats = { totalSent: 0, totalFailed: 0, byChannel: {}, avgLatencyMs: 0 };
    this.latencySamples = [];
  }

  private recordStats(channel: NotificationChannel, success: boolean, latencyMs: number): void {
    if (success) {
      this.stats.totalSent++;
    } else {
      this.stats.totalFailed++;
    }

    if (!this.stats.byChannel[channel]) {
      this.stats.byChannel[channel] = { sent: 0, failed: 0, retries: 0 };
    }

    if (success) {
      this.stats.byChannel[channel].sent++;
    } else {
      this.stats.byChannel[channel].failed++;
    }

    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > 100) this.latencySamples.shift();
    this.stats.avgLatencyMs = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
  }
}

export const notificationCoordinator = new NotificationCoordinator();
