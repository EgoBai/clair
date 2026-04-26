import { describe, it, expect, vi, beforeEach } from 'vitest';

// 事件总线引擎
type EventHandler = (...args: any[]) => void | Promise<void>;

interface EventSubscription {
  id: string;
  event: string;
  handler: EventHandler;
  once: boolean;
  priority: number;
  filter?: (...args: any[]) => boolean;
}

interface EventStats {
  event: string;
  emitCount: number;
  handlerCount: number;
  lastEmitted: number | null;
  avgHandlerTime: number;
}

class EventBusEngine {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private stats: Map<string, EventStats> = new Map();
  private history: { event: string; args: any[]; timestamp: number }[] = [];
  private maxHistory: number;
  private globalMiddleware: ((event: string, args: any[]) => any[])[] = [];

  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory;
  }

  on(event: string, handler: EventHandler, priority = 0, filter?: (...args: any[]) => boolean): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!this.subscriptions.has(event)) this.subscriptions.set(event, []);
    const subs = this.subscriptions.get(event)!;
    subs.push({ id, event, handler, once: false, priority, filter });
    subs.sort((a, b) => b.priority - a.priority);
    return id;
  }

  once(event: string, handler: EventHandler, priority = 0): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!this.subscriptions.has(event)) this.subscriptions.set(event, []);
    const subs = this.subscriptions.get(event)!;
    subs.push({ id, event, handler, once: true, priority });
    subs.sort((a, b) => b.priority - a.priority);
    return id;
  }

  off(id: string): boolean {
    for (const [event, subs] of this.subscriptions) {
      const idx = subs.findIndex(s => s.id === id);
      if (idx >= 0) { subs.splice(idx, 1); return true; }
    }
    return false;
  }

  offAll(event?: string): number {
    if (event) {
      const count = this.subscriptions.get(event)?.length || 0;
      this.subscriptions.delete(event);
      return count;
    }
    const count = Array.from(this.subscriptions.values()).reduce((s, subs) => s + subs.length, 0);
    this.subscriptions.clear();
    return count;
  }

  async emit(event: string, ...args: any[]): Promise<{ results: any[]; errors: Error[] }> {
    let processedArgs = args;
    for (const mw of this.globalMiddleware) {
      processedArgs = mw(event, processedArgs);
    }

    this.history.push({ event, args: processedArgs, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();

    if (!this.stats.has(event)) {
      this.stats.set(event, { event, emitCount: 0, handlerCount: 0, lastEmitted: null, avgHandlerTime: 0 });
    }
    const stat = this.stats.get(event)!;
    stat.emitCount++;
    stat.lastEmitted = Date.now();

    const subs = this.subscriptions.get(event) || [];
    const results: any[] = [];
    const errors: Error[] = [];
    const toRemove: string[] = [];

    for (const sub of subs) {
      if (sub.filter && !sub.filter(...processedArgs)) continue;
      try {
        const start = performance.now();
        const result = await sub.handler(...processedArgs);
        const duration = performance.now() - start;
        stat.avgHandlerTime = (stat.avgHandlerTime * stat.handlerCount + duration) / (stat.handlerCount + 1);
        stat.handlerCount++;
        results.push(result);
        if (sub.once) toRemove.push(sub.id);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    for (const id of toRemove) this.off(id);
    return { results, errors };
  }

  use(middleware: (event: string, args: any[]) => any[]): void {
    this.globalMiddleware.push(middleware);
  }

  getStats(event?: string): EventStats | Map<string, EventStats> {
    if (event) return this.stats.get(event) || { event, emitCount: 0, handlerCount: 0, lastEmitted: null, avgHandlerTime: 0 };
    return new Map(this.stats);
  }

  getHistory(count?: number): { event: string; args: any[]; timestamp: number }[] {
    return count ? this.history.slice(-count) : [...this.history];
  }

  getSubscriptions(event?: string): EventSubscription[] {
    if (event) return [...(this.subscriptions.get(event) || [])];
    return Array.from(this.subscriptions.values()).flat();
  }

  hasListeners(event: string): boolean {
    return (this.subscriptions.get(event)?.length || 0) > 0;
  }

  listenerCount(event: string): number {
    return this.subscriptions.get(event)?.length || 0;
  }

  waitFor(event: string, timeout = 5000): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(id);
        reject(new Error(`Timeout waiting for ${event}`));
      }, timeout);
      const id = this.once(event, (...args: any[]) => {
        clearTimeout(timer);
        resolve(args);
      });
    });
  }

  pipe(sourceEvent: string, targetBus: EventBusEngine, targetEvent?: string): string {
    return this.on(sourceEvent, (...args: any[]) => {
      targetBus.emit(targetEvent || sourceEvent, ...args);
    });
  }

  getEventNames(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  wildcardMatch(pattern: string, event: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(event);
  }

  onWildcard(pattern: string, handler: EventHandler): string {
    return this.on(`__wildcard_${pattern}`, handler);
  }

  async emitWildcard(event: string, ...args: any[]): Promise<void> {
    await this.emit(event, ...args);
    for (const key of this.subscriptions.keys()) {
      if (key.startsWith('__wildcard_')) {
        const pattern = key.slice(11);
        if (this.wildcardMatch(pattern, event)) {
          await this.emit(key, event, ...args);
        }
      }
    }
  }
}

describe('事件总线引擎', () => {
  let bus: EventBusEngine;

  beforeEach(() => {
    bus = new EventBusEngine();
  });

  describe('基本订阅', () => {
    it('应该订阅和触发事件', async () => {
      const handler = vi.fn();
      bus.on('test', handler);
      await bus.emit('test', 'data');
      expect(handler).toHaveBeenCalledWith('data');
    });

    it('应该支持多个处理器', async () => {
      const h1 = vi.fn(), h2 = vi.fn();
      bus.on('test', h1);
      bus.on('test', h2);
      await bus.emit('test');
      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    it('应该支持once订阅', async () => {
      const handler = vi.fn();
      bus.once('test', handler);
      await bus.emit('test');
      await bus.emit('test');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('应该取消订阅', async () => {
      const handler = vi.fn();
      const id = bus.on('test', handler);
      bus.off(id);
      await bus.emit('test');
      expect(handler).not.toHaveBeenCalled();
    });

    it('应该取消所有订阅', async () => {
      bus.on('test', vi.fn());
      bus.on('test', vi.fn());
      expect(bus.offAll('test')).toBe(2);
    });
  });

  describe('优先级', () => {
    it('应该按优先级执行', async () => {
      const order: number[] = [];
      bus.on('test', () => { order.push(1); }, 1);
      bus.on('test', () => { order.push(3); }, 3);
      bus.on('test', () => { order.push(2); }, 2);
      await bus.emit('test');
      expect(order).toEqual([3, 2, 1]);
    });
  });

  describe('过滤器', () => {
    it('应该支持过滤器', async () => {
      const handler = vi.fn();
      bus.on('test', handler, 0, (num: number) => num > 5);
      await bus.emit('test', 3);
      expect(handler).not.toHaveBeenCalled();
      await bus.emit('test', 10);
      expect(handler).toHaveBeenCalledWith(10);
    });
  });

  describe('中间件', () => {
    it('应该处理中间件', async () => {
      const handler = vi.fn();
      bus.use((event, args) => args.map(a => a * 2));
      bus.on('test', handler);
      await bus.emit('test', 5);
      expect(handler).toHaveBeenCalledWith(10);
    });
  });

  describe('统计', () => {
    it('应该跟踪事件统计', async () => {
      bus.on('test', () => {});
      await bus.emit('test');
      await bus.emit('test');
      const stats = bus.getStats('test') as EventStats;
      expect(stats.emitCount).toBe(2);
    });
  });

  describe('历史记录', () => {
    it('应该记录事件历史', async () => {
      await bus.emit('test', 'a');
      await bus.emit('test', 'b');
      const history = bus.getHistory();
      expect(history).toHaveLength(2);
    });

    it('应该限制历史长度', async () => {
      const smallBus = new EventBusEngine(3);
      for (let i = 0; i < 5; i++) await smallBus.emit('test', i);
      expect(smallBus.getHistory()).toHaveLength(3);
    });
  });

  describe('查询', () => {
    it('应该检查是否有监听器', () => {
      expect(bus.hasListeners('test')).toBe(false);
      bus.on('test', () => {});
      expect(bus.hasListeners('test')).toBe(true);
    });

    it('应该获取监听器数量', () => {
      bus.on('test', () => {});
      bus.on('test', () => {});
      expect(bus.listenerCount('test')).toBe(2);
    });

    it('应该获取所有事件名', () => {
      bus.on('a', () => {});
      bus.on('b', () => {});
      expect(bus.getEventNames()).toEqual(expect.arrayContaining(['a', 'b']));
    });
  });

  describe('等待事件', () => {
    it('应该等待事件触发', async () => {
      setTimeout(() => bus.emit('async', 'data'), 10);
      const args = await bus.waitFor('async');
      expect(args).toEqual(['data']);
    });

    it('应该超时', async () => {
      await expect(bus.waitFor('never', 50)).rejects.toThrow('Timeout');
    });
  });

  describe('管道', () => {
    it('应该将事件管道到另一个总线', async () => {
      const bus2 = new EventBusEngine();
      bus.pipe('source', bus2, 'target');
      const handler = vi.fn();
      bus2.on('target', handler);
      await bus.emit('source', 'data');
      expect(handler).toHaveBeenCalledWith('data');
    });
  });

  describe('通配符匹配', () => {
    it('应该匹配通配符', () => {
      expect(bus.wildcardMatch('stock.*', 'stock.price')).toBe(true);
      expect(bus.wildcardMatch('stock.*', 'bond.price')).toBe(false);
    });

    it('应该匹配单字符通配', () => {
      expect(bus.wildcardMatch('stock.?rice', 'stock.price')).toBe(true);
    });
  });
});
