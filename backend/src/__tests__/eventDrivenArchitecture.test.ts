import { describe, it, expect } from 'vitest';

describe('事件驱动架构与消息队列', () => {
  // 事件总线
  const createEventBus = () => {
    const handlers: Record<string, ((data: any) => void)[]> = {};
    const history: { event: string; data: any; timestamp: number }[] = [];
    return {
      on: (event: string, handler: (data: any) => void) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      off: (event: string, handler: (data: any) => void) => {
        if (handlers[event]) {
          handlers[event] = handlers[event].filter(h => h !== handler);
        }
      },
      emit: (event: string, data: any) => {
        history.push({ event, data, timestamp: Date.now() });
        (handlers[event] || []).forEach(h => h(data));
      },
      getHistory: () => history,
      listenerCount: (event: string) => (handlers[event] || []).length,
    };
  };

  describe('事件总线', () => {
    it('注册和触发', () => {
      const bus = createEventBus();
      let received = '';
      bus.on('test', (d) => { received = d; });
      bus.emit('test', 'hello');
      expect(received).toBe('hello');
    });
    it('多监听器', () => {
      const bus = createEventBus();
      let count = 0;
      bus.on('test', () => { count++; });
      bus.on('test', () => { count++; });
      bus.emit('test', null);
      expect(count).toBe(2);
    });
    it('取消监听', () => {
      const bus = createEventBus();
      let count = 0;
      const handler = () => { count++; };
      bus.on('test', handler);
      bus.off('test', handler);
      bus.emit('test', null);
      expect(count).toBe(0);
    });
    it('事件历史', () => {
      const bus = createEventBus();
      bus.emit('a', 1);
      bus.emit('b', 2);
      expect(bus.getHistory().length).toBe(2);
    });
    it('监听器计数', () => {
      const bus = createEventBus();
      bus.on('test', () => {});
      bus.on('test', () => {});
      expect(bus.listenerCount('test')).toBe(2);
    });
    it('无监听器事件不崩溃', () => {
      const bus = createEventBus();
      expect(() => bus.emit('unknown', null)).not.toThrow();
    });
  });

  // 消息队列
  const createQueue = <T>(maxSize: number) => {
    const queue: { item: T; enqueued: number }[] = [];
    return {
      enqueue: (item: T) => {
        if (queue.length >= maxSize) return false;
        queue.push({ item, enqueued: Date.now() });
        return true;
      },
      dequeue: () => queue.shift()?.item,
      peek: () => queue[0]?.item,
      size: () => queue.length,
      isFull: () => queue.length >= maxSize,
      isEmpty: () => queue.length === 0,
      drain: () => {
        const items = queue.map(q => q.item);
        queue.length = 0;
        return items;
      },
    };
  };

  describe('消息队列', () => {
    it('入队出队', () => {
      const q = createQueue<string>(10);
      q.enqueue('a');
      q.enqueue('b');
      expect(q.dequeue()).toBe('a');
      expect(q.dequeue()).toBe('b');
    });
    it('队列满', () => {
      const q = createQueue<number>(2);
      expect(q.enqueue(1)).toBe(true);
      expect(q.enqueue(2)).toBe(true);
      expect(q.enqueue(3)).toBe(false);
    });
    it('Peek不移除', () => {
      const q = createQueue<string>(10);
      q.enqueue('x');
      expect(q.peek()).toBe('x');
      expect(q.size()).toBe(1);
    });
    it('空队列出队undefined', () => {
      const q = createQueue<number>(5);
      expect(q.dequeue()).toBeUndefined();
    });
    it('清空队列', () => {
      const q = createQueue<number>(10);
      q.enqueue(1); q.enqueue(2); q.enqueue(3);
      const items = q.drain();
      expect(items).toEqual([1, 2, 3]);
      expect(q.isEmpty()).toBe(true);
    });
    it('判空判满', () => {
      const q = createQueue<number>(1);
      expect(q.isEmpty()).toBe(true);
      q.enqueue(1);
      expect(q.isFull()).toBe(true);
    });
  });

  // 重试机制
  const withRetrySync = <T>(fn: () => T, maxRetries: number) => {
    let lastError: Error | null = null;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return { result: fn(), attempts: i + 1, success: true };
      } catch (e) {
        lastError = e as Error;
      }
    }
    return { result: null as T | null, attempts: maxRetries + 1, success: false, error: lastError?.message };
  };

  describe('重试机制', () => {
    it('首次成功', () => {
      let calls = 0;
      const result = withRetrySync(() => { calls++; return 42; }, 3);
      expect(result.result).toBe(42);
      expect(result.attempts).toBe(1);
      expect(calls).toBe(1);
    });
    it('重试后成功', () => {
      let calls = 0;
      const result = withRetrySync(() => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return 'ok';
      }, 5);
      expect(result.result).toBe('ok');
      expect(result.attempts).toBe(3);
    });
    it('全部重试失败', () => {
      const result = withRetrySync(() => { throw new Error('always fail'); }, 2);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });
    it('零重试', () => {
      const result = withRetrySync(() => { throw new Error('x'); }, 0);
      expect(result.attempts).toBe(1);
    });
  });

  // 事件去重
  const deduplicateEvents = <T>(events: { id: string; data: T; timestamp: number }[], windowMs: number) => {
    const seen = new Map<string, number>();
    return events.filter(e => {
      const lastSeen = seen.get(e.id);
      if (lastSeen && e.timestamp - lastSeen < windowMs) return false;
      seen.set(e.id, e.timestamp);
      return true;
    });
  };

  describe('事件去重', () => {
    it('去重', () => {
      const events = [
        { id: 'a', data: 1, timestamp: 1000 },
        { id: 'a', data: 2, timestamp: 1100 },
        { id: 'b', data: 3, timestamp: 1200 },
      ];
      const result = deduplicateEvents(events, 500);
      expect(result.length).toBe(2);
    });
    it('窗口外不去重', () => {
      const events = [
        { id: 'a', data: 1, timestamp: 1000 },
        { id: 'a', data: 2, timestamp: 7000 },
      ];
      const result = deduplicateEvents(events, 5000);
      expect(result.length).toBe(2);
    });
    it('空事件', () => {
      expect(deduplicateEvents([], 1000)).toEqual([]);
    });
    it('全部唯一', () => {
      const events = [
        { id: 'a', data: 1, timestamp: 1000 },
        { id: 'b', data: 2, timestamp: 1000 },
        { id: 'c', data: 3, timestamp: 1000 },
      ];
      const result = deduplicateEvents(events, 500);
      expect(result.length).toBe(3);
    });
  });

  // 发布订阅模式
  const createPubSub = () => {
    const channels: Map<string, Set<(data: any) => void>> = new Map();
    return {
      subscribe: (channel: string, callback: (data: any) => void) => {
        if (!channels.has(channel)) channels.set(channel, new Set());
        channels.get(channel)!.add(callback);
        return () => channels.get(channel)?.delete(callback);
      },
      publish: (channel: string, data: any) => {
        channels.get(channel)?.forEach(cb => cb(data));
      },
      subscriberCount: (channel: string) => channels.get(channel)?.size || 0,
      clear: (channel: string) => channels.delete(channel),
    };
  };

  describe('发布订阅', () => {
    it('基本订阅发布', () => {
      const ps = createPubSub();
      let received: any = null;
      ps.subscribe('news', (d) => { received = d; });
      ps.publish('news', 'headline');
      expect(received).toBe('headline');
    });
    it('取消订阅', () => {
      const ps = createPubSub();
      let count = 0;
      const unsub = ps.subscribe('ch', () => { count++; });
      unsub();
      ps.publish('ch', null);
      expect(count).toBe(0);
    });
    it('多频道隔离', () => {
      const ps = createPubSub();
      let a = false, b = false;
      ps.subscribe('a', () => { a = true; });
      ps.subscribe('b', () => { b = true; });
      ps.publish('a', null);
      expect(a).toBe(true);
      expect(b).toBe(false);
    });
    it('订阅者计数', () => {
      const ps = createPubSub();
      ps.subscribe('x', () => {});
      ps.subscribe('x', () => {});
      expect(ps.subscriberCount('x')).toBe(2);
    });
    it('清空频道', () => {
      const ps = createPubSub();
      ps.subscribe('x', () => {});
      ps.clear('x');
      expect(ps.subscriberCount('x')).toBe(0);
    });
  });

  // 事件溯源
  const createEventStore = () => {
    const events: { type: string; payload: any; version: number }[] = [];
    return {
      append: (type: string, payload: any) => {
        const version = events.length + 1;
        events.push({ type, payload, version });
        return version;
      },
      getEvents: (fromVersion = 0) => events.filter(e => e.version > fromVersion),
      replay: <T>(initialState: T, reducer: (state: T, event: { type: string; payload: any }) => T) => {
        return events.reduce((state, event) => reducer(state, event), initialState);
      },
      count: () => events.length,
    };
  };

  describe('事件溯源', () => {
    it('追加事件', () => {
      const store = createEventStore();
      store.append('created', { name: 'order1' });
      store.append('updated', { status: 'filled' });
      expect(store.count()).toBe(2);
    });
    it('版本递增', () => {
      const store = createEventStore();
      const v1 = store.append('a', {});
      const v2 = store.append('b', {});
      expect(v2).toBe(v1 + 1);
    });
    it('从版本获取', () => {
      const store = createEventStore();
      store.append('a', {});
      store.append('b', {});
      store.append('c', {});
      const events = store.getEvents(1);
      expect(events.length).toBe(2);
    });
    it('重放状态', () => {
      const store = createEventStore();
      store.append('add', { value: 10 });
      store.append('add', { value: 20 });
      store.append('subtract', { value: 5 });
      const reducer = (state: number, event: { type: string; payload: any }) => {
        if (event.type === 'add') return state + event.payload.value;
        if (event.type === 'subtract') return state - event.payload.value;
        return state;
      };
      expect(store.replay(0, reducer)).toBe(25);
    });
  });
});
