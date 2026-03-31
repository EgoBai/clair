/**
 * 事件总线系统
 * Event Bus System
 *
 * 发布/订阅模式、命名空间、中间件、事件回放
 */

export type EventHandler<T = any> = (data: T) => void | Promise<void>;

export interface Subscription {
  unsubscribe: () => void;
}

export interface EventRecord<T = any> {
  event: string;
  data: T;
  timestamp: number;
}

/**
 * 事件总线
 */
export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private history: EventRecord[] = [];
  private maxHistory: number;
  private middleware: Array<(event: string, data: any) => any> = [];
  private onceHandlers: Map<string, Set<EventHandler>> = new Map();

  constructor(maxHistory: number = 100) {
    this.maxHistory = maxHistory;
  }

  /**
   * 订阅事件
   */
  on<T = any>(event: string, handler: EventHandler<T>): Subscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return {
      unsubscribe: () => this.handlers.get(event)?.delete(handler),
    };
  }

  /**
   * 一次性订阅
   */
  once<T = any>(event: string, handler: EventHandler<T>): Subscription {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);

    return {
      unsubscribe: () => this.onceHandlers.get(event)?.delete(handler),
    };
  }

  /**
   * 发布事件
   */
  emit<T = any>(event: string, data?: T): void {
    let processedData = data;

    // 中间件处理
    for (const mw of this.middleware) {
      processedData = mw(event, processedData);
    }

    // 记录历史
    this.history.push({ event, data: processedData, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // 通知普通订阅者
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(processedData);
      }
    }

    // 通知一次性订阅者
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        handler(processedData);
      }
      onceHandlers.clear();
    }

    // 通配符订阅者 *
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler({ event, data: processedData });
      }
    }
  }

  /**
   * 取消订阅
   */
  off(event: string, handler?: EventHandler): void {
    if (handler) {
      this.handlers.get(event)?.delete(handler);
      this.onceHandlers.get(event)?.delete(handler);
    } else {
      this.handlers.delete(event);
      this.onceHandlers.delete(event);
    }
  }

  /**
   * 添加中间件
   */
  use(middleware: (event: string, data: any) => any): void {
    this.middleware.push(middleware);
  }

  /**
   * 获取事件历史
   */
  getHistory(event?: string): EventRecord[] {
    if (!event) return [...this.history];
    return this.history.filter(r => r.event === event);
  }

  /**
   * 回放历史事件
   */
  replay(event: string, handler: EventHandler): void {
    const records = this.getHistory(event);
    for (const record of records) {
      handler(record.data);
    }
  }

  /**
   * 等待某个事件
   */
  waitFor<T = any>(event: string, timeout?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const sub = this.on<T>(event, (data) => {
        sub.unsubscribe();
        if (timer) clearTimeout(timer);
        resolve(data);
      });

      const timer = timeout ? setTimeout(() => {
        sub.unsubscribe();
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout) : null;
    });
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalEvents: number; uniqueEvents: number; subscriberCount: number } {
    let subscriberCount = 0;
    for (const handlers of this.handlers.values()) {
      subscriberCount += handlers.size;
    }
    for (const handlers of this.onceHandlers.values()) {
      subscriberCount += handlers.size;
    }

    const events = new Set(this.history.map(r => r.event));
    return {
      totalEvents: this.history.length,
      uniqueEvents: events.size,
      subscriberCount,
    };
  }

  /**
   * 清空
   */
  clear(): void {
    this.handlers.clear();
    this.onceHandlers.clear();
    this.history = [];
    this.middleware = [];
  }
}

/**
 * 命名空间事件总线
 */
export class NamespacedEventBus {
  private buses: Map<string, EventBus> = new Map();
  private defaultMaxHistory: number;

  constructor(maxHistory: number = 100) {
    this.defaultMaxHistory = maxHistory;
  }

  getNamespace(ns: string): EventBus {
    if (!this.buses.has(ns)) {
      this.buses.set(ns, new EventBus(this.defaultMaxHistory));
    }
    return this.buses.get(ns)!;
  }

  removeNamespace(ns: string): void {
    this.buses.get(ns)?.clear();
    this.buses.delete(ns);
  }

  getNamespaces(): string[] {
    return Array.from(this.buses.keys());
  }
}
