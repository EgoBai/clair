import { describe, it, expect } from 'vitest';

describe('事件系统与消息队列', () => {

  // 事件发射器
  type EventHandler = (data: unknown) => void;
  const createEventEmitter = () => {
    const handlers = new Map<string, Set<EventHandler>>();
    return {
      on: (event: string, handler: EventHandler) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(handler);
      },
      off: (event: string, handler: EventHandler) => {
        handlers.get(event)?.delete(handler);
      },
      emit: (event: string, data?: unknown) => {
        handlers.get(event)?.forEach(h => h(data));
      },
      once: (event: string, handler: EventHandler) => {
        const wrapper = (data: unknown) => {
          handler(data);
          handlers.get(event)?.delete(wrapper);
        };
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(wrapper);
      },
      listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
      removeAll: (event?: string) => {
        if (event) handlers.delete(event);
        else handlers.clear();
      },
    };
  };

  describe('事件发射器', () => {
    it('注册和触发', () => {
      const emitter = createEventEmitter();
      let received = false;
      emitter.on('test', () => { received = true; });
      emitter.emit('test');
      expect(received).toBe(true);
    });
    it('传递数据', () => {
      const emitter = createEventEmitter();
      let data: unknown = null;
      emitter.on('price', (d) => { data = d; });
      emitter.emit('price', { symbol: '600519', price: 1800 });
      expect(data).toEqual({ symbol: '600519', price: 1800 });
    });
    it('取消监听', () => {
      const emitter = createEventEmitter();
      let count = 0;
      const handler = () => { count++; };
      emitter.on('test', handler);
      emitter.emit('test');
      emitter.off('test', handler);
      emitter.emit('test');
      expect(count).toBe(1);
    });
    it('once只触发一次', () => {
      const emitter = createEventEmitter();
      let count = 0;
      emitter.once('test', () => { count++; });
      emitter.emit('test');
      emitter.emit('test');
      expect(count).toBe(1);
    });
    it('监听器计数', () => {
      const emitter = createEventEmitter();
      emitter.on('test', () => {});
      emitter.on('test', () => {});
      expect(emitter.listenerCount('test')).toBe(2);
    });
    it('移除所有监听', () => {
      const emitter = createEventEmitter();
      emitter.on('a', () => {});
      emitter.on('b', () => {});
      emitter.removeAll();
      expect(emitter.listenerCount('a')).toBe(0);
      expect(emitter.listenerCount('b')).toBe(0);
    });
    it('移除特定事件', () => {
      const emitter = createEventEmitter();
      emitter.on('a', () => {});
      emitter.on('b', () => {});
      emitter.removeAll('a');
      expect(emitter.listenerCount('a')).toBe(0);
      expect(emitter.listenerCount('b')).toBe(1);
    });
    it('无监听器不报错', () => {
      const emitter = createEventEmitter();
      expect(() => emitter.emit('nonexistent')).not.toThrow();
    });
  });

  // 消息队列
  const createMessageQueue = <T>() => {
    const queue: { id: string; data: T; timestamp: number; priority: number }[] = [];
    return {
      enqueue: (data: T, priority: number = 0) => {
        const msg = { id: Math.random().toString(36).slice(2), data, timestamp: Date.now(), priority };
        queue.push(msg);
        queue.sort((a, b) => b.priority - a.priority);
        return msg.id;
      },
      dequeue: () => queue.shift() ?? null,
      peek: () => queue[0] ?? null,
      size: () => queue.length,
      isEmpty: () => queue.length === 0,
      clear: () => { queue.length = 0; },
      drain: () => {
        const items = queue.splice(0);
        return items;
      },
    };
  };

  describe('消息队列', () => {
    it('入队出队', () => {
      const q = createMessageQueue<string>();
      q.enqueue('msg1');
      q.enqueue('msg2');
      expect(q.dequeue()?.data).toBe('msg1');
      expect(q.dequeue()?.data).toBe('msg2');
    });
    it('优先级排序', () => {
      const q = createMessageQueue<string>();
      q.enqueue('low', 1);
      q.enqueue('high', 10);
      q.enqueue('mid', 5);
      expect(q.dequeue()?.data).toBe('high');
      expect(q.dequeue()?.data).toBe('mid');
      expect(q.dequeue()?.data).toBe('low');
    });
    it('peek不移除', () => {
      const q = createMessageQueue<number>();
      q.enqueue(42);
      expect(q.peek()?.data).toBe(42);
      expect(q.size()).toBe(1);
    });
    it('空队列dequeue返回null', () => {
      const q = createMessageQueue<unknown>();
      expect(q.dequeue()).toBeNull();
    });
    it('清空队列', () => {
      const q = createMessageQueue<unknown>();
      q.enqueue('a'); q.enqueue('b');
      q.clear();
      expect(q.isEmpty()).toBe(true);
    });
    it('drain取出所有', () => {
      const q = createMessageQueue<number>();
      q.enqueue(1); q.enqueue(2); q.enqueue(3);
      const items = q.drain();
      expect(items.length).toBe(3);
      expect(q.isEmpty()).toBe(true);
    });
  });

  // 事件去抖
  const createDebouncedEmitter = (handler: (data: unknown) => void, delay: number) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastData: unknown = null;
    return {
      emit: (data: unknown) => {
        lastData = data;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => handler(lastData), delay);
      },
      cancel: () => {
        if (timer) clearTimeout(timer);
        timer = null;
      },
      flush: () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          handler(lastData);
        }
      },
    };
  };

  describe('事件去抖', () => {
    it('多次触发只执行一次', async () => {
      let count = 0;
      const debounced = createDebouncedEmitter(() => { count++; }, 50);
      debounced.emit(1);
      debounced.emit(2);
      debounced.emit(3);
      expect(count).toBe(0);
      await new Promise(r => setTimeout(r, 60));
      expect(count).toBe(1);
    });
    it('取消执行', async () => {
      let count = 0;
      const debounced = createDebouncedEmitter(() => { count++; }, 50);
      debounced.emit(1);
      debounced.cancel();
      await new Promise(r => setTimeout(r, 60));
      expect(count).toBe(0);
    });
    it('flush立即执行', () => {
      let data: unknown = null;
      const debounced = createDebouncedEmitter((d) => { data = d; }, 1000);
      debounced.emit('test');
      debounced.flush();
      expect(data).toBe('test');
    });
  });

  // 重试机制
  const retry = async <T>(fn: () => T, maxAttempts: number = 3, delay: number = 0) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return { success: true, result: fn(), attempts: attempt };
      } catch (e) {
        if (attempt === maxAttempts) return { success: false, error: e, attempts: attempt };
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
      }
    }
    return { success: false, error: new Error('max attempts'), attempts: maxAttempts };
  };

  describe('重试机制', () => {
    it('首次成功', async () => {
      let calls = 0;
      const result = await retry(() => { calls++; return 42; });
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.attempts).toBe(1);
    });
    it('重试后成功', async () => {
      let calls = 0;
      const result = await retry(() => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return 'ok';
      }, 3);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });
    it('全部失败', async () => {
      const result = await retry(() => { throw new Error('always fail'); }, 3);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });
  });

  // 状态机
  const createStateMachine = (initial: string, transitions: Record<string, Record<string, string>>) => {
    let current = initial;
    const history: string[] = [initial];
    return {
      state: () => current,
      transition: (action: string) => {
        const possible = transitions[current];
        if (!possible || !possible[action]) return false;
        current = possible[action];
        history.push(current);
        return true;
      },
      canTransition: (action: string) => !!(transitions[current] && transitions[current][action]),
      history: () => [...history],
      reset: () => { current = initial; history.length = 0; history.push(initial); },
    };
  };

  describe('状态机', () => {
    const tradingStates = {
      idle: { submit: 'pending' },
      pending: { fill: 'filled', cancel: 'idle' },
      filled: { settle: 'done' },
      done: {},
    };

    it('初始状态', () => {
      const sm = createStateMachine('idle', tradingStates);
      expect(sm.state()).toBe('idle');
    });
    it('有效转换', () => {
      const sm = createStateMachine('idle', tradingStates);
      expect(sm.transition('submit')).toBe(true);
      expect(sm.state()).toBe('pending');
    });
    it('无效转换', () => {
      const sm = createStateMachine('idle', tradingStates);
      expect(sm.transition('fill')).toBe(false);
      expect(sm.state()).toBe('idle');
    });
    it('完整流程', () => {
      const sm = createStateMachine('idle', tradingStates);
      sm.transition('submit');
      sm.transition('fill');
      sm.transition('settle');
      expect(sm.state()).toBe('done');
      expect(sm.history()).toEqual(['idle', 'pending', 'filled', 'done']);
    });
    it('canTransition检查', () => {
      const sm = createStateMachine('idle', tradingStates);
      expect(sm.canTransition('submit')).toBe(true);
      expect(sm.canTransition('fill')).toBe(false);
    });
    it('重置', () => {
      const sm = createStateMachine('idle', tradingStates);
      sm.transition('submit');
      sm.reset();
      expect(sm.state()).toBe('idle');
    });
  });

  // 发布订阅
  const createPubSub = () => {
    const topics = new Map<string, Set<(data: unknown) => void>>();
    return {
      subscribe: (topic: string, handler: (data: unknown) => void) => {
        if (!topics.has(topic)) topics.set(topic, new Set());
        topics.get(topic)!.add(handler);
        return () => topics.get(topic)?.delete(handler);
      },
      publish: (topic: string, data?: unknown) => {
        topics.get(topic)?.forEach(h => h(data));
      },
      subscriberCount: (topic: string) => topics.get(topic)?.size ?? 0,
    };
  };

  describe('发布订阅', () => {
    it('订阅发布', () => {
      const ps = createPubSub();
      let received: unknown = null;
      ps.subscribe('quotes', (d) => { received = d; });
      ps.publish('quotes', { price: 100 });
      expect(received).toEqual({ price: 100 });
    });
    it('取消订阅', () => {
      const ps = createPubSub();
      let count = 0;
      const unsub = ps.subscribe('test', () => { count++; });
      ps.publish('test');
      unsub();
      ps.publish('test');
      expect(count).toBe(1);
    });
    it('多订阅者', () => {
      const ps = createPubSub();
      let a = 0, b = 0;
      ps.subscribe('test', () => { a++; });
      ps.subscribe('test', () => { b++; });
      ps.publish('test');
      expect(a).toBe(1);
      expect(b).toBe(1);
    });
    it('无订阅者不报错', () => {
      const ps = createPubSub();
      expect(() => ps.publish('empty')).not.toThrow();
    });
  });
});
