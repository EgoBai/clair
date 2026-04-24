/**
 * 多通道通知协调器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

type NotificationType = string;
type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
type NotificationChannel = 'push' | 'email' | 'sms' | 'websocket' | 'in_app';
type ChannelStatus = 'idle' | 'sending' | 'sent' | 'failed' | 'retrying';

interface NotificationPayload {
  id: string; type: string; priority: string; title: string; body: string;
  data?: Record<string, unknown>; channels: string[]; userId: string;
  read: boolean; status: string; createdAt: number; expiresAt?: number;
}

interface SendTask {
  id: string; notification: NotificationPayload; channel: string; status: string;
  attempts: number; maxAttempts: number; lastAttemptAt?: number; completedAt?: number; error?: string;
}

type ChannelSender = (notification: NotificationPayload) => Promise<boolean>;

const DEFAULT_CONFIG = {
  maxRetries: 3, retryDelayMs: 1000, timeoutMs: 5000,
  fallbackOrder: ['websocket', 'push', 'in_app', 'email', 'sms'] as string[],
  parallelSending: true,
};

class TestCoordinator {
  config: typeof DEFAULT_CONFIG;
  senders: Map<string, ChannelSender> = new Map();
  tasks: Map<string, SendTask> = new Map();
  latencySamples: number[] = [];
  stats = { totalSent: 0, totalFailed: 0, byChannel: {} as Record<string, { sent: number; failed: number; retries: number }>, avgLatencyMs: 0 };

  constructor(config: Partial<typeof DEFAULT_CONFIG> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  registerChannel(channel: string, sender: ChannelSender) {
    this.senders.set(channel, sender);
  }

  recordStats(channel: string, success: boolean, latencyMs: number) {
    if (success) this.stats.totalSent++; else this.stats.totalFailed++;
    if (!this.stats.byChannel[channel]) this.stats.byChannel[channel] = { sent: 0, failed: 0, retries: 0 };
    if (success) this.stats.byChannel[channel].sent++; else this.stats.byChannel[channel].failed++;
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > 100) this.latencySamples.shift();
    this.stats.avgLatencyMs = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
  }

  async tryFallback(notification: NotificationPayload, failedChannel: string): Promise<SendTask | null> {
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
            notification, channel, status: 'sent', attempts: 1, maxAttempts: 1, completedAt: Date.now(),
          };
          this.recordStats(channel, true, 0);
          return task;
        }
      } catch { continue; }
    }
    return null;
  }

  async sendToChannel(notification: NotificationPayload, channel: string): Promise<SendTask> {
    const task: SendTask = {
      id: `task_${channel}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      notification, channel, status: 'sending', attempts: 0,
      maxAttempts: this.config.maxRetries,
    };
    this.tasks.set(task.id, task);
    const sender = this.senders.get(channel);
    if (!sender) {
      task.status = 'failed'; task.error = `No sender registered for channel: ${channel}`;
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
          task.status = 'sent'; task.completedAt = Date.now();
          this.recordStats(channel, true, Date.now() - startTime);
          return task;
        }
      } catch (error) {
        task.error = error instanceof Error ? error.message : String(error);
      }
      if (attempt < task.maxAttempts - 1) {
        await new Promise(r => setTimeout(r, this.config.retryDelayMs));
      }
    }
    const fallbackResult = await this.tryFallback(notification, channel);
    if (fallbackResult) {
      task.status = 'sent'; task.completedAt = Date.now(); task.error = `Fallback to ${fallbackResult.channel}`;
      this.recordStats(channel, false, Date.now() - startTime);
      return task;
    }
    task.status = 'failed';
    this.recordStats(channel, false, Date.now() - startTime);
    return task;
  }

  async send(notification: NotificationPayload, channels?: string[]): Promise<SendTask[]> {
    const targetChannels = channels !== undefined && channels.length > 0 ? channels : notification.channels && notification.channels.length > 0 ? notification.channels : ['in_app'];
    if (this.config.parallelSending) {
      const results = await Promise.allSettled(targetChannels.map(ch => this.sendToChannel(notification, ch)));
      const tasks: SendTask[] = [];
      for (const r of results) { if (r.status === 'fulfilled') tasks.push(r.value); }
      return tasks;
    } else {
      const tasks: SendTask[] = [];
      for (const channel of targetChannels) {
        tasks.push(await this.sendToChannel(notification, channel));
      }
      return tasks;
    }
  }

  async sendBatch(notifications: NotificationPayload[], channels?: string[]): Promise<SendTask[]> {
    const allTasks: SendTask[] = [];
    for (const notification of notifications) {
      const tasks = await this.send(notification, channels);
      allTasks.push(...tasks);
    }
    return allTasks;
  }

  getTask(taskId: string): SendTask | undefined { return this.tasks.get(taskId); }
  getAllTasks(): SendTask[] { return Array.from(this.tasks.values()); }
  getTasksByStatus(status: string): SendTask[] { return this.getAllTasks().filter(t => t.status === status); }
  getStats() { return { ...this.stats }; }
  getRegisteredChannels(): string[] { return Array.from(this.senders.keys()); }

  clear() {
    this.tasks.clear();
    this.stats = { totalSent: 0, totalFailed: 0, byChannel: {}, avgLatencyMs: 0 };
    this.latencySamples = [];
  }
}

const makeNotif = (overrides: any = {}): NotificationPayload => ({
  id: 'n_001', type: 'price_alert', priority: 'high', title: '预警', body: '股价波动',
  channels: ['push', 'in_app'], userId: 'user_1', read: false, status: 'pending',
  createdAt: Date.now(), ...overrides,
});

describe('NotificationCoordinator', () => {
  let coord: TestCoordinator;

  beforeEach(() => {
    coord = new TestCoordinator();
  });

  describe('Channel Registration', () => {
    it('should register senders', () => {
      coord.registerChannel('push', async () => true);
      expect(coord.getRegisteredChannels()).toContain('push');
    });

    it('should list all registered channels', () => {
      coord.registerChannel('email', async () => true);
      coord.registerChannel('sms', async () => true);
      expect(coord.getRegisteredChannels()).toHaveLength(2);
    });
  });

  describe('send - Success', () => {
    beforeEach(() => {
      coord.registerChannel('push', async () => true);
      coord.registerChannel('in_app', async () => true);
    });

    it('should send to all specified channels', async () => {
      const tasks = await coord.send(makeNotif(), ['push', 'in_app']);
      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.status === 'sent')).toBe(true);
    });

    it('should use notification channels by default', async () => {
      const notif = makeNotif({ channels: ['push'] });
      const tasks = await coord.send(notif);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].channel).toBe('push');
    });

    it('should default to in_app when no channels specified', async () => {
      const notif = makeNotif({ channels: [] });
      const tasks = await coord.send(notif);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].channel).toBe('in_app');
    });
  });

  describe('send - Failure', () => {
    it('should fail when no sender registered', async () => {
      const tasks = await coord.send(makeNotif(), ['sms']);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].error).toContain('No sender registered');
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      coord.registerChannel('push', async () => {
        attempts++;
        if (attempts < 3) throw new Error('Transient error');
        return true;
      });
      const tasks = await coord.send(makeNotif({ channels: ['push'] }));
      expect(tasks[0].status).toBe('sent');
      expect(tasks[0].attempts).toBeGreaterThan(1);
    });

    it('should fail after exhausting retries', async () => {
      coord.registerChannel('push', async () => { throw new Error('Persistent error'); });
      const tasks = await coord.send(makeNotif({ channels: ['push'] }));
      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].attempts).toBe(3);
    });
  });

  describe('Fallback', () => {
    beforeEach(() => {
      coord.registerChannel('push', async () => { throw new Error('Failed'); });
      coord.registerChannel('email', async () => true);
    });

    it('should fallback to another channel', async () => {
      const notif = makeNotif({ channels: ['push'] });
      const tasks = await coord.send(notif);
      expect(tasks[0].status).toBe('sent');
      expect(tasks[0].error).toContain('Fallback');
    });
  });

  describe('Parallel vs Sequential', () => {
    it('should parallel send when configured', async () => {
      const pCoord = new TestCoordinator({ parallelSending: true });
      pCoord.registerChannel('push', async () => true);
      pCoord.registerChannel('in_app', async () => true);
      const start = Date.now();
      await pCoord.send(makeNotif(), ['push', 'in_app']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(200);
    });

    it('should sequential send when configured', async () => {
      const sCoord = new TestCoordinator({ parallelSending: false, retryDelayMs: 50, maxRetries: 1 });
      sCoord.registerChannel('push', async () => { await new Promise(r => setTimeout(r, 100)); return true; });
      sCoord.registerChannel('in_app', async () => { await new Promise(r => setTimeout(r, 100)); return true; });
      const start = Date.now();
      await sCoord.send(makeNotif(), ['push', 'in_app']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  describe('sendBatch', () => {
    it('should send multiple notifications', async () => {
      coord.registerChannel('in_app', async () => true);
      const notifs = [makeNotif({ id: 'n1', channels: ['in_app'] }), makeNotif({ id: 'n2', channels: ['in_app'] }), makeNotif({ id: 'n3', channels: ['in_app'] })];
      const allTasks = await coord.sendBatch(notifs);
      expect(allTasks).toHaveLength(3);
      expect(allTasks.every(t => t.status === 'sent')).toBe(true);
    });
  });

  describe('Task Management', () => {
    beforeEach(() => {
      coord.registerChannel('in_app', async () => true);
    });

    it('should get task by ID', async () => {
      const tasks = await coord.send(makeNotif({ channels: ['in_app'] }));
      const task = coord.getTask(tasks[0].id);
      expect(task).toBeDefined();
      expect(task!.status).toBe('sent');
    });

    it('should get all tasks', async () => {
      await coord.send(makeNotif({ id: 'n1', channels: ['in_app'] }));
      await coord.send(makeNotif({ id: 'n2', channels: ['in_app'] }));
      expect(coord.getAllTasks()).toHaveLength(2);
    });

    it('should get tasks by status', async () => {
      await coord.send(makeNotif({ channels: ['in_app'] }));
      expect(coord.getTasksByStatus('sent')).toHaveLength(1);
      expect(coord.getTasksByStatus('failed')).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      coord.registerChannel('in_app', async () => true);
    });

    it('should track total sent', async () => {
      await coord.send(makeNotif());
      expect(coord.getStats().totalSent).toBe(1);
    });

    it('should track per-channel stats', async () => {
      coord.registerChannel('push', async () => true);
      await coord.send(makeNotif(), ['in_app', 'push']);
      const stats = coord.getStats();
      expect(stats.byChannel['in_app'].sent).toBe(1);
      expect(stats.byChannel['push'].sent).toBe(1);
    });

    it('should track failed sends', async () => {
      await coord.send(makeNotif(), ['sms']);
      const stats = coord.getStats();
      expect(stats.totalFailed).toBe(1);
      expect(stats.byChannel['sms'].failed).toBe(1);
    });

    it('should calculate average latency', async () => {
      await coord.send(makeNotif());
      const stats = coord.getStats();
      expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Clear', () => {
    it('should reset all state', async () => {
      coord.registerChannel('in_app', async () => true);
      await coord.send(makeNotif());
      coord.clear();
      expect(coord.getAllTasks()).toHaveLength(0);
      expect(coord.getStats().totalSent).toBe(0);
    });
  });
});
