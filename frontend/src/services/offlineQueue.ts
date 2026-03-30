/**
 * Offline Queue Service
 * 离线队列服务 - 在离线时缓存操作，上线后批量执行
 */

export interface QueuedAction {
  id: string;
  type: 'api_call' | 'websocket_send' | 'notification';
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority: 'high' | 'medium' | 'low';
  expiresAt?: number;
}

export interface OfflineQueueConfig {
  maxQueueSize: number;
  defaultMaxRetries: number;
  defaultTTL: number; // ms
  storageKey: string;
  onFlush?: (actions: QueuedAction[]) => Promise<void>;
  onActionSuccess?: (action: QueuedAction) => void;
  onActionFailed?: (action: QueuedAction, error: Error) => void;
}

const DEFAULT_CONFIG: OfflineQueueConfig = {
  maxQueueSize: 500,
  defaultMaxRetries: 3,
  defaultTTL: 30 * 60 * 1000, // 30 minutes
  storageKey: 'offline_queue',
};

export class OfflineQueueService {
  private queue: QueuedAction[] = [];
  private config: OfflineQueueConfig;
  private isOnline: boolean = navigator.onLine;
  private flushInProgress: boolean = false;
  private listeners: Set<() => void> = new Set();

  constructor(config: Partial<OfflineQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
    this.setupNetworkListeners();
  }

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flush();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
        this.cleanExpired();
      }
    } catch {
      this.queue = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.queue));
    } catch {
      // Storage full, prune low priority
      this.queue = this.queue.filter(a => a.priority !== 'low');
      try {
        localStorage.setItem(this.config.storageKey, JSON.stringify(this.queue));
      } catch {
        // Give up silently
      }
    }
  }

  private cleanExpired(): void {
    const now = Date.now();
    this.queue = this.queue.filter(
      a => !a.expiresAt || a.expiresAt > now
    );
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  enqueue(
    type: QueuedAction['type'],
    payload: Record<string, unknown>,
    options: Partial<Pick<QueuedAction, 'priority' | 'maxRetries' | 'expiresAt'>> = {}
  ): string {
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove lowest priority oldest item
      const lowIdx = this.queue.findIndex(a => a.priority === 'low');
      if (lowIdx >= 0) {
        this.queue.splice(lowIdx, 1);
      } else {
        this.queue.shift();
      }
    }

    const action: QueuedAction = {
      id: this.generateId(),
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
      priority: options.priority ?? 'medium',
      expiresAt: options.expiresAt ?? Date.now() + this.config.defaultTTL,
    };

    this.queue.push(action);
    this.sortQueue();
    this.saveToStorage();
    this.notifyListeners();
    return action.id;
  }

  private sortQueue(): void {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    this.queue.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.timestamp - b.timestamp; // FIFO within same priority
    });
  }

  remove(id: string): boolean {
    const idx = this.queue.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  async flush(): Promise<{ succeeded: number; failed: number }> {
    if (!this.isOnline || this.flushInProgress || this.queue.length === 0) {
      return { succeeded: 0, failed: 0 };
    }

    this.flushInProgress = true;
    let succeeded = 0;
    let failed = 0;

    try {
      this.cleanExpired();
      const batch = [...this.queue];

      if (this.config.onFlush) {
        try {
          await this.config.onFlush(batch);
          succeeded = batch.length;
          this.queue = [];
        } catch {
          // Batch failed, try individual
          for (const action of batch) {
            try {
              await this.executeAction(action);
              succeeded++;
              this.remove(action.id);
              this.config.onActionSuccess?.(action);
            } catch (err) {
              action.retryCount++;
              if (action.retryCount >= action.maxRetries) {
                failed++;
                this.remove(action.id);
                this.config.onActionFailed?.(action, err as Error);
              }
            }
          }
        }
      } else {
        for (const action of batch) {
          try {
            await this.executeAction(action);
            succeeded++;
            this.remove(action.id);
            this.config.onActionSuccess?.(action);
          } catch (err) {
            action.retryCount++;
            if (action.retryCount >= action.maxRetries) {
              failed++;
              this.remove(action.id);
              this.config.onActionFailed?.(action, err as Error);
            }
          }
        }
      }

      this.saveToStorage();
      this.notifyListeners();
    } finally {
      this.flushInProgress = false;
    }

    return { succeeded, failed };
  }

  private async executeAction(action: QueuedAction): Promise<void> {
    switch (action.type) {
      case 'api_call': {
        const { url, method, body, headers } = action.payload as {
          url: string; method: string; body?: unknown; headers?: Record<string, string>;
        };
        const res = await fetch(url, {
          method: method || 'POST',
          headers: { 'Content-Type': 'application/json', ...(headers || {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        break;
      }
      case 'websocket_send': {
        // Delegate to WS handler
        break;
      }
      case 'notification': {
        // Delegate to notification handler
        break;
      }
    }
  }

  getQueue(): QueuedAction[] {
    return [...this.queue];
  }

  getSize(): number {
    return this.queue.length;
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }

  clear(): void {
    this.queue = [];
    this.saveToStorage();
    this.notifyListeners();
  }

  getByType(type: QueuedAction['type']): QueuedAction[] {
    return this.queue.filter(a => a.type === type);
  }

  getStats(): { total: number; byPriority: Record<string, number>; byType: Record<string, number> } {
    const byPriority: Record<string, number> = { high: 0, medium: 0, low: 0 };
    const byType: Record<string, number> = {};
    for (const a of this.queue) {
      byPriority[a.priority]++;
      byType[a.type] = (byType[a.type] || 0) + 1;
    }
    return { total: this.queue.length, byPriority, byType };
  }
}

export const offlineQueue = new OfflineQueueService();
