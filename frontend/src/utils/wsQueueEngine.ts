/**
 * WebSocket消息队列引擎
 * 消息队列管理、重试策略、优先级、背压控制
 */

export type MessagePriority = 'high' | 'normal' | 'low';
export type MessageStatus = 'pending' | 'sent' | 'failed' | 'retrying';

export interface QueuedMessage {
  id: string;
  type: string;
  payload: unknown;
  priority: MessagePriority;
  status: MessageStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  sentAt?: number;
  error?: string;
}

export interface QueueConfig {
  maxSize: number;
  maxRetries: number;
  retryDelay: number; // ms
  retryBackoff: number; // multiplier
  batchSize: number;
  flushInterval: number; // ms
  priorityOrder: MessagePriority[];
}

const DEFAULT_CONFIG: QueueConfig = {
  maxSize: 1000,
  maxRetries: 3,
  retryDelay: 1000,
  retryBackoff: 2,
  batchSize: 10,
  flushInterval: 100,
  priorityOrder: ['high', 'normal', 'low'],
};

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private config: QueueConfig;
  private idCounter = 0;
  private stats = { enqueued: 0, sent: 0, failed: 0, retries: 0, dropped: 0 };

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  enqueue(type: string, payload: unknown, priority: MessagePriority = 'normal'): string {
    const id = `msg-${++this.idCounter}-${Date.now()}`;
    const message: QueuedMessage = {
      id, type, payload, priority,
      status: 'pending',
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      createdAt: Date.now(),
    };

    this.queue.push(message);
    this.stats.enqueued++;

    // 背压控制
    if (this.queue.length > this.config.maxSize) {
      const removed = this.dequeueLowest();
      if (removed) this.stats.dropped++;
    }

    return id;
  }

  dequeue(count: number = 1): QueuedMessage[] {
    const sorted = this.getSorted();
    const batch = sorted.slice(0, count);
    const ids = new Set(batch.map(m => m.id));
    this.queue = this.queue.filter(m => !ids.has(m.id));
    return batch;
  }

  markSent(id: string): boolean {
    return this.updateStatus(id, 'sent');
  }

  markFailed(id: string, error: string): boolean {
    const msg = this.queue.find(m => m.id === id);
    if (!msg) return false;

    msg.retryCount++;
    if (msg.retryCount < msg.maxRetries) {
      msg.status = 'retrying';
      msg.error = error;
      this.stats.retries++;
      // 重新入队
      const delay = this.config.retryDelay * Math.pow(this.config.retryBackoff, msg.retryCount - 1);
      setTimeout(() => {
        if (msg.status === 'retrying') {
          msg.status = 'pending';
        }
      }, delay);
    } else {
      msg.status = 'failed';
      msg.error = error;
      this.stats.failed++;
    }
    return true;
  }

  peek(): QueuedMessage | undefined {
    return this.getSorted()[0];
  }

  get size(): number {
    return this.queue.length;
  }

  get pendingCount(): number {
    return this.queue.filter(m => m.status === 'pending').length;
  }

  get retryingCount(): number {
    return this.queue.filter(m => m.status === 'retrying').length;
  }

  getStats() {
    return { ...this.stats, pending: this.pendingCount, retrying: this.retryingCount, total: this.queue.length };
  }

  clear(): void {
    this.queue = [];
  }

  remove(id: string): boolean {
    const idx = this.queue.findIndex(m => m.id === id);
    if (idx >= 0) { this.queue.splice(idx, 1); return true; }
    return false;
  }

  getByPriority(priority: MessagePriority): QueuedMessage[] {
    return this.queue.filter(m => m.priority === priority);
  }

  private getSorted(): QueuedMessage[] {
    const order = this.config.priorityOrder;
    return [...this.queue]
      .filter(m => m.status === 'pending')
      .sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority) || a.createdAt - b.createdAt);
  }

  private dequeueLowest(): QueuedMessage | undefined {
    const order = this.config.priorityOrder;
    const lowest = order[order.length - 1];
    const candidates = this.queue.filter(m => m.priority === lowest);
    if (candidates.length > 0) {
      const oldest = candidates.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
      this.remove(oldest.id);
      return oldest;
    }
    return undefined;
  }

  private updateStatus(id: string, status: MessageStatus): boolean {
    const msg = this.queue.find(m => m.id === id);
    if (!msg) return false;
    msg.status = status;
    if (status === 'sent') { msg.sentAt = Date.now(); this.stats.sent++; }
    return true;
  }
}

// 连接状态管理
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ConnectionStateInfo {
  state: ConnectionState;
  lastConnected?: number;
  reconnectAttempts: number;
  latency: number;
  error?: string;
}

export function createConnectionStateMachine(): {
  state: ConnectionStateInfo;
  transition: (to: ConnectionState, error?: string) => void;
  canSend: () => boolean;
  shouldReconnect: () => boolean;
} {
  const info: ConnectionStateInfo = { state: 'disconnected', reconnectAttempts: 0, latency: 0 };

  return {
    state: info,
    transition(to: ConnectionState, error?: string) {
      info.state = to;
      if (to === 'connected') { info.lastConnected = Date.now(); info.reconnectAttempts = 0; info.error = undefined; }
      if (to === 'reconnecting') info.reconnectAttempts++;
      if (to === 'error') info.error = error;
    },
    canSend() { return info.state === 'connected'; },
    shouldReconnect() { return info.state !== 'connected' && info.reconnectAttempts < 10; },
  };
}
