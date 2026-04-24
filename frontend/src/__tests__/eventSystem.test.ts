import { describe, it, expect, beforeEach } from 'vitest';

// 事件系统引擎
type EventHandler = (...args: any[]) => void;
interface EventSubscription { id: string; event: string; handler: EventHandler; once: boolean; priority: number }

class EventBus {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private history: { event: string; args: any[]; timestamp: number }[] = [];
  private maxHistory: number;
  private idCounter = 0;

  constructor(maxHistory: number = 100) { this.maxHistory = maxHistory; }

  on(event: string, handler: EventHandler, priority: number = 0): string {
    const id = `sub_${++this.idCounter}`;
    const sub: EventSubscription = { id, event, handler, once: false, priority };
    if (!this.subscriptions.has(event)) this.subscriptions.set(event, []);
    const subs = this.subscriptions.get(event)!;
    subs.push(sub);
    subs.sort((a, b) => b.priority - a.priority);
    return id;
  }

  once(event: string, handler: EventHandler, priority: number = 0): string {
    const id = `sub_${++this.idCounter}`;
    const sub: EventSubscription = { id, event, handler, once: true, priority };
    if (!this.subscriptions.has(event)) this.subscriptions.set(event, []);
    const subs = this.subscriptions.get(event)!;
    subs.push(sub);
    subs.sort((a, b) => b.priority - a.priority);
    return id;
  }

  off(id: string): boolean {
    for (const [event, subs] of this.subscriptions) {
      const idx = subs.findIndex(s => s.id === id);
      if (idx !== -1) { subs.splice(idx, 1); if (subs.length === 0) this.subscriptions.delete(event); return true; }
    }
    return false;
  }

  offAll(event?: string): void {
    if (event) this.subscriptions.delete(event);
    else this.subscriptions.clear();
  }

  emit(event: string, ...args: any[]): number {
    this.history.push({ event, args, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();
    const subs = this.subscriptions.get(event);
    if (!subs || subs.length === 0) return 0;
    let count = 0;
    const toRemove: string[] = [];
    for (const sub of [...subs]) {
      try { sub.handler(...args); count++; } catch { /* handler error */ }
      if (sub.once) toRemove.push(sub.id);
    }
    toRemove.forEach(id => this.off(id));
    return count;
  }

  getListeners(event: string): EventSubscription[] {
    return [...(this.subscriptions.get(event) || [])];
  }

  getHistory(event?: string): { event: string; args: any[]; timestamp: number }[] {
    if (event) return this.history.filter(h => h.event === event);
    return [...this.history];
  }

  hasListeners(event: string): boolean {
    return (this.subscriptions.get(event)?.length || 0) > 0;
  }

  listenerCount(event: string): number {
    return this.subscriptions.get(event)?.length || 0;
  }

  eventNames(): string[] {
    return [...this.subscriptions.keys()];
  }

  pipe(source: string, target: string, transform?: (args: any[]) => any[]): string {
    return this.on(source, (...args) => {
      this.emit(target, ...(transform ? transform(args) : args));
    });
  }
}

describe('事件系统引擎', () => {
  let bus: EventBus;

  beforeEach(() => { bus = new EventBus(); });

  describe('订阅', () => {
    it('应该注册事件', () => {
      const id = bus.on('test', () => {});
      expect(id).toBeTruthy();
      expect(bus.hasListeners('test')).toBe(true);
    });
    it('应该返回唯一ID', () => {
      const id1 = bus.on('test', () => {});
      const id2 = bus.on('test', () => {});
      expect(id1).not.toBe(id2);
    });
    it('应该支持多个监听器', () => {
      bus.on('test', () => {});
      bus.on('test', () => {});
      expect(bus.listenerCount('test')).toBe(2);
    });
    it('应该按优先级排序', () => {
      bus.on('test', () => {}, 1);
      bus.on('test', () => {}, 10);
      const listeners = bus.getListeners('test');
      expect(listeners[0].priority).toBe(10);
    });
  });

  describe('一次性订阅', () => {
    it('应该自动取消', () => {
      let count = 0;
      bus.once('test', () => count++);
      bus.emit('test');
      bus.emit('test');
      expect(count).toBe(1);
    });
    it('多个once独立计数', () => {
      let count = 0;
      bus.once('test', () => count++);
      bus.once('test', () => count++);
      bus.emit('test');
      expect(count).toBe(2);
      bus.emit('test');
      expect(count).toBe(2);
    });
  });

  describe('取消订阅', () => {
    it('应该取消指定监听器', () => {
      const id = bus.on('test', () => {});
      expect(bus.off(id)).toBe(true);
      expect(bus.hasListeners('test')).toBe(false);
    });
    it('取消不存在的ID返回false', () => {
      expect(bus.off('nonexistent')).toBe(false);
    });
    it('应该取消所有事件', () => {
      bus.on('a', () => {});
      bus.on('b', () => {});
      bus.offAll();
      expect(bus.eventNames()).toHaveLength(0);
    });
    it('应该取消指定事件', () => {
      bus.on('a', () => {});
      bus.on('b', () => {});
      bus.offAll('a');
      expect(bus.hasListeners('a')).toBe(false);
      expect(bus.hasListeners('b')).toBe(true);
    });
  });

  describe('触发', () => {
    it('应该调用监听器', () => {
      let called = false;
      bus.on('test', () => called = true);
      bus.emit('test');
      expect(called).toBe(true);
    });
    it('应该传递参数', () => {
      let received: any[] = [];
      bus.on('test', (...args) => received = args);
      bus.emit('test', 1, 'hello');
      expect(received).toEqual([1, 'hello']);
    });
    it('应该返回触发的监听器数', () => {
      bus.on('test', () => {});
      bus.on('test', () => {});
      expect(bus.emit('test')).toBe(2);
    });
    it('无监听器返回0', () => {
      expect(bus.emit('nonexistent')).toBe(0);
    });
    it('多个监听器全部调用', () => {
      let count = 0;
      bus.on('test', () => count++);
      bus.on('test', () => count++);
      bus.on('test', () => count++);
      bus.emit('test');
      expect(count).toBe(3);
    });
    it('handler错误不应中断其他', () => {
      let second = false;
      bus.on('test', () => { throw new Error('oops'); });
      bus.on('test', () => second = true);
      bus.emit('test');
      expect(second).toBe(true);
    });
  });

  describe('历史记录', () => {
    it('应该记录事件', () => {
      bus.emit('test', 42);
      const history = bus.getHistory('test');
      expect(history).toHaveLength(1);
      expect(history[0].args).toEqual([42]);
    });
    it('应该按事件过滤', () => {
      bus.emit('a', 1);
      bus.emit('b', 2);
      expect(bus.getHistory('a')).toHaveLength(1);
    });
    it('应该限制历史大小', () => {
      const smallBus = new EventBus(3);
      for (let i = 0; i < 5; i++) smallBus.emit('test', i);
      expect(smallBus.getHistory()).toHaveLength(3);
    });
    it('返回历史副本', () => {
      bus.emit('test');
      const history = bus.getHistory();
      history.push({ event: 'fake', args: [], timestamp: 0 });
      expect(bus.getHistory()).toHaveLength(1);
    });
  });

  describe('查询', () => {
    it('hasListeners有监听器时返回true', () => {
      bus.on('test', () => {});
      expect(bus.hasListeners('test')).toBe(true);
    });
    it('hasListeners无监听器时返回false', () => {
      expect(bus.hasListeners('test')).toBe(false);
    });
    it('listenerCount返回正确数量', () => {
      bus.on('test', () => {});
      bus.on('test', () => {});
      expect(bus.listenerCount('test')).toBe(2);
    });
    it('eventNames返回所有事件', () => {
      bus.on('a', () => {});
      bus.on('b', () => {});
      expect(bus.eventNames().sort()).toEqual(['a', 'b']);
    });
  });

  describe('管道', () => {
    it('应该转发事件', () => {
      let received = false;
      bus.on('target', () => received = true);
      bus.pipe('source', 'target');
      bus.emit('source');
      expect(received).toBe(true);
    });
    it('应该转换参数', () => {
      let received: any[] = [];
      bus.on('target', (...args) => received = args);
      bus.pipe('source', 'target', (args) => args.map(a => a * 2));
      bus.emit('source', 5);
      expect(received).toEqual([10]);
    });
  });
});
