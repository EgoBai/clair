import { describe, it, expect } from 'vitest';

// WebSocket系统深度测试
describe('WebSocket系统', () => {
  describe('消息格式验证', () => {
    type WSMessage = {
      type: string;
      payload: unknown;
      timestamp: number;
      id?: string;
    };

    const validateWSMessage = (msg: unknown): msg is WSMessage => {
      if (typeof msg !== 'object' || msg === null) return false;
      const m = msg as Record<string, unknown>;
      return typeof m.type === 'string' && m.type.length > 0 &&
             'payload' in m &&
             typeof m.timestamp === 'number';
    };

    it('有效消息通过验证', () => {
      expect(validateWSMessage({
        type: 'stock_update',
        payload: { code: '600000', price: 10.5 },
        timestamp: Date.now(),
      })).toBe(true);
    });

    it('缺少type字段', () => {
      expect(validateWSMessage({ payload: {}, timestamp: Date.now() })).toBe(false);
    });

    it('缺少timestamp字段', () => {
      expect(validateWSMessage({ type: 'test', payload: {} })).toBe(false);
    });

    it('type为非字符串', () => {
      expect(validateWSMessage({ type: 123, payload: {}, timestamp: Date.now() })).toBe(false);
    });

    it('空type', () => {
      expect(validateWSMessage({ type: '', payload: {}, timestamp: Date.now() })).toBe(false);
    });

    it('null不是有效消息', () => {
      expect(validateWSMessage(null)).toBe(false);
    });

    it('字符串不是有效消息', () => {
      expect(validateWSMessage('hello')).toBe(false);
    });
  });

  describe('消息路由', () => {
    type Handler = (payload: unknown) => void;

    const createMessageRouter = () => {
      const handlers = new Map<string, Handler[]>();

      return {
        on(type: string, handler: Handler) {
          if (!handlers.has(type)) handlers.set(type, []);
          handlers.get(type)!.push(handler);
        },
        off(type: string, handler: Handler) {
          const h = handlers.get(type);
          if (h) {
            const idx = h.indexOf(handler);
            if (idx >= 0) h.splice(idx, 1);
          }
        },
        route(msg: { type: string; payload: unknown }) {
          const h = handlers.get(msg.type) || [];
          h.forEach(handler => handler(msg.payload));
        },
        hasHandler(type: string): boolean {
          return (handlers.get(type)?.length ?? 0) > 0;
        },
        handlerCount(type: string): number {
          return handlers.get(type)?.length ?? 0;
        },
      };
    };

    it('注册并路由消息', () => {
      const router = createMessageRouter();
      let received: unknown = null;
      router.on('test', (p) => { received = p; });
      router.route({ type: 'test', payload: { data: 42 } });
      expect(received).toEqual({ data: 42 });
    });

    it('多个handler都收到消息', () => {
      const router = createMessageRouter();
      let count = 0;
      router.on('test', () => { count++; });
      router.on('test', () => { count++; });
      router.route({ type: 'test', payload: null });
      expect(count).toBe(2);
    });

    it('未注册类型不报错', () => {
      const router = createMessageRouter();
      expect(() => router.route({ type: 'unknown', payload: null })).not.toThrow();
    });

    it('移除handler', () => {
      const router = createMessageRouter();
      let count = 0;
      const handler = () => { count++; };
      router.on('test', handler);
      router.off('test', handler);
      router.route({ type: 'test', payload: null });
      expect(count).toBe(0);
    });

    it('hasHandler检查', () => {
      const router = createMessageRouter();
      expect(router.hasHandler('test')).toBe(false);
      router.on('test', () => {});
      expect(router.hasHandler('test')).toBe(true);
    });

    it('handlerCount统计', () => {
      const router = createMessageRouter();
      router.on('test', () => {});
      router.on('test', () => {});
      expect(router.handlerCount('test')).toBe(2);
    });
  });

  describe('订阅管理', () => {
    const createSubscriptionManager = () => {
      const subs = new Map<string, Set<string>>(); // channel -> clients
      const clientSubs = new Map<string, Set<string>>(); // client -> channels

      return {
        subscribe(clientId: string, channel: string) {
          if (!subs.has(channel)) subs.set(channel, new Set());
          subs.get(channel)!.add(clientId);
          if (!clientSubs.has(clientId)) clientSubs.set(clientId, new Set());
          clientSubs.get(clientId)!.add(channel);
        },
        unsubscribe(clientId: string, channel: string) {
          subs.get(channel)?.delete(clientId);
          clientSubs.get(clientId)?.delete(channel);
        },
        unsubscribeAll(clientId: string) {
          const channels = clientSubs.get(clientId);
          if (channels) {
            channels.forEach(ch => subs.get(ch)?.delete(clientId));
            clientSubs.delete(clientId);
          }
        },
        getSubscribers(channel: string): string[] {
          return [...(subs.get(channel) || [])];
        },
        getChannels(clientId: string): string[] {
          return [...(clientSubs.get(clientId) || [])];
        },
        subscriberCount(channel: string): number {
          return subs.get(channel)?.size ?? 0;
        },
      };
    };

    it('订阅频道', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('client1', 'stock:600000');
      expect(sm.getSubscribers('stock:600000')).toContain('client1');
    });

    it('取消订阅', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('client1', 'stock:600000');
      sm.unsubscribe('client1', 'stock:600000');
      expect(sm.getSubscribers('stock:600000')).not.toContain('client1');
    });

    it('批量取消订阅', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('client1', 'ch1');
      sm.subscribe('client1', 'ch2');
      sm.unsubscribeAll('client1');
      expect(sm.getChannels('client1')).toHaveLength(0);
    });

    it('多客户端订阅同一频道', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('c1', 'ch');
      sm.subscribe('c2', 'ch');
      expect(sm.subscriberCount('ch')).toBe(2);
    });

    it('同一客户端多频道', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('c1', 'ch1');
      sm.subscribe('c1', 'ch2');
      sm.subscribe('c1', 'ch3');
      expect(sm.getChannels('c1')).toHaveLength(3);
    });

    it('重复订阅不增加计数', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('c1', 'ch');
      sm.subscribe('c1', 'ch');
      expect(sm.subscriberCount('ch')).toBe(1);
    });

    it('空频道返回空数组', () => {
      const sm = createSubscriptionManager();
      expect(sm.getSubscribers('empty')).toEqual([]);
    });
  });

  describe('消息队列', () => {
    const createMessageQueue = (maxSize: number) => {
      const queue: { id: string; data: unknown; priority: number }[] = [];

      return {
        enqueue(id: string, data: unknown, priority = 0) {
          queue.push({ id, data, priority });
          queue.sort((a, b) => b.priority - a.priority);
          if (queue.length > maxSize) queue.length = maxSize;
        },
        dequeue() {
          return queue.shift();
        },
        peek() {
          return queue[0];
        },
        size: () => queue.length,
        clear() { queue.length = 0; },
        drain() {
          const items = [...queue];
          queue.length = 0;
          return items;
        },
      };
    };

    it('入队和出队', () => {
      const q = createMessageQueue(10);
      q.enqueue('1', 'data1');
      q.enqueue('2', 'data2');
      const item = q.dequeue();
      expect(item?.id).toBe('1');
    });

    it('优先级排序', () => {
      const q = createMessageQueue(10);
      q.enqueue('low', 'd', 1);
      q.enqueue('high', 'd', 10);
      q.enqueue('mid', 'd', 5);
      expect(q.peek()?.id).toBe('high');
    });

    it('超出容量丢弃低优先级', () => {
      const q = createMessageQueue(2);
      q.enqueue('1', 'd', 1);
      q.enqueue('2', 'd', 5);
      q.enqueue('3', 'd', 3);
      expect(q.size()).toBe(2);
      // 优先级5和3应该保留
      const ids = q.drain().map(i => i.id);
      expect(ids).toContain('2');
    });

    it('drain清空队列', () => {
      const q = createMessageQueue(10);
      q.enqueue('1', 'd');
      q.enqueue('2', 'd');
      const items = q.drain();
      expect(items).toHaveLength(2);
      expect(q.size()).toBe(0);
    });

    it('clear清空', () => {
      const q = createMessageQueue(10);
      q.enqueue('1', 'd');
      q.clear();
      expect(q.size()).toBe(0);
    });
  });

  describe('心跳检测', () => {
    const createHeartbeatMonitor = (interval: number, timeout: number) => {
      let lastPing = 0;
      let lastPong = 0;

      return {
        ping() { lastPing = Date.now(); },
        pong() { lastPong = Date.now(); },
        isAlive(): boolean {
          return lastPong > 0 && (Date.now() - lastPong) < timeout;
        },
        shouldPing(): boolean {
          return Date.now() - lastPing >= interval;
        },
        timeSinceLastPong(): number {
          return lastPong > 0 ? Date.now() - lastPong : Infinity;
        },
      };
    };

    it('初始状态非存活', () => {
      const hm = createHeartbeatMonitor(1000, 5000);
      expect(hm.isAlive()).toBe(false);
    });

    it('收到pong后存活', () => {
      const hm = createHeartbeatMonitor(1000, 5000);
      hm.pong();
      expect(hm.isAlive()).toBe(true);
    });

    it('应该发送ping', () => {
      const hm = createHeartbeatMonitor(100, 5000);
      expect(hm.shouldPing()).toBe(true);
    });

    it('刚ping后不应再ping', () => {
      const hm = createHeartbeatMonitor(10000, 5000);
      hm.ping();
      expect(hm.shouldPing()).toBe(false);
    });
  });

  describe('消息压缩', () => {
    const compressMessage = (msg: string): { compressed: string; ratio: number } => {
      // 简单的run-length encoding
      let result = '';
      let i = 0;
      while (i < msg.length) {
        let count = 1;
        while (i + count < msg.length && msg[i + count] === msg[i]) count++;
        result += count > 1 ? `${count}${msg[i]}` : msg[i];
        i += count;
      }
      return { compressed: result, ratio: result.length / msg.length };
    };

    const decompressMessage = (compressed: string): string => {
      let result = '';
      let i = 0;
      while (i < compressed.length) {
        let numStr = '';
        while (i < compressed.length && /\d/.test(compressed[i])) {
          numStr += compressed[i++];
        }
        if (numStr) {
          const count = parseInt(numStr);
          result += compressed[i].repeat(count);
        } else {
          result += compressed[i];
        }
        i++;
      }
      return result;
    };

    it('压缩重复字符', () => {
      const result = compressMessage('aaabbb');
      expect(result.compressed).toBe('3a3b');
      expect(result.ratio).toBeLessThan(1);
    });

    it('无重复不变', () => {
      const result = compressMessage('abcde');
      expect(result.compressed).toBe('abcde');
      expect(result.ratio).toBe(1);
    });

    it('解压缩还原', () => {
      const original = 'aaabbbccc';
      const { compressed } = compressMessage(original);
      expect(decompressMessage(compressed)).toBe(original);
    });

    it('混合字符', () => {
      const original = 'aabcccdde';
      const { compressed } = compressMessage(original);
      expect(decompressMessage(compressed)).toBe(original);
    });

    it('空字符串', () => {
      expect(compressMessage('').compressed).toBe('');
      expect(decompressMessage('')).toBe('');
    });
  });

  describe('连接池管理', () => {
    const createConnectionPool = (maxSize: number) => {
      const idle: string[] = [];
      const active = new Set<string>();
      let idCounter = 0;

      return {
        acquire(): string {
          const conn = idle.pop() || `conn-${++idCounter}`;
          active.add(conn);
          return conn;
        },
        release(conn: string) {
          if (active.delete(conn)) {
            idle.push(conn);
          }
        },
        activeCount: () => active.size,
        idleCount: () => idle.length,
        totalCount: () => active.size + idle.length,
        canAcquire: () => active.size < maxSize,
      };
    };

    it('获取连接', () => {
      const pool = createConnectionPool(5);
      const conn = pool.acquire();
      expect(conn).toBeDefined();
      expect(pool.activeCount()).toBe(1);
    });

    it('释放连接变为idle', () => {
      const pool = createConnectionPool(5);
      const conn = pool.acquire();
      pool.release(conn);
      expect(pool.activeCount()).toBe(0);
      expect(pool.idleCount()).toBe(1);
    });

    it('复用idle连接', () => {
      const pool = createConnectionPool(5);
      const c1 = pool.acquire();
      pool.release(c1);
      const c2 = pool.acquire();
      expect(c2).toBe(c1);
    });

    it('超过maxSize不允许获取', () => {
      const pool = createConnectionPool(2);
      pool.acquire();
      pool.acquire();
      expect(pool.canAcquire()).toBe(false);
    });
  });
});
