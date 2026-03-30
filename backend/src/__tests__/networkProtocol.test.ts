import { describe, it, expect } from 'vitest';

// 网络协议与通信引擎测试
describe('网络协议与通信引擎', () => {
  // WebSocket消息编解码
  interface WSMessage {
    type: string;
    payload: any;
    id?: string;
    timestamp: number;
  }

  function encodeMessage(msg: WSMessage): string {
    return JSON.stringify(msg);
  }

  function decodeMessage(raw: string): WSMessage | null {
    try {
      const msg = JSON.parse(raw);
      if (!msg.type || !msg.timestamp) return null;
      return msg;
    } catch { return null; }
  }

  // 消息队列
  function createMessageQueue<T>(maxSize: number = 100) {
    const queue: T[] = [];
    return {
      enqueue: (item: T) => {
        if (queue.length >= maxSize) queue.shift();
        queue.push(item);
      },
      dequeue: (): T | undefined => queue.shift(),
      peek: (): T | undefined => queue[0],
      size: () => queue.length,
      isEmpty: () => queue.length === 0,
      clear: () => queue.splice(0),
      drain: (): T[] => queue.splice(0),
    };
  }

  // 重连策略
  interface ReconnectConfig {
    baseDelay: number;
    maxDelay: number;
    multiplier: number;
    maxAttempts: number;
  }

  function calculateReconnectDelay(attempt: number, config: ReconnectConfig): number {
    if (attempt <= 0) return 0;
    const delay = config.baseDelay * Math.pow(config.multiplier, attempt - 1);
    return Math.min(delay, config.maxDelay);
  }

  function shouldReconnect(attempt: number, config: ReconnectConfig): boolean {
    return attempt < config.maxAttempts;
  }

  // 心跳管理
  function createHeartbeat(interval: number, timeout: number) {
    let lastPing = 0;
    let lastPong = 0;
    return {
      ping: () => { lastPing = Date.now(); },
      pong: () => { lastPong = Date.now(); },
      isAlive: () => lastPong > 0 && (Date.now() - lastPong) < timeout,
      needsPing: () => lastPing === 0 || (Date.now() - lastPing) >= interval,
      timeSinceLastPong: () => Date.now() - lastPong,
      reset: () => { lastPing = 0; lastPong = 0; },
    };
  }

  // 订阅管理
  function createSubscriptionManager() {
    const subs = new Map<string, Set<string>>();
    return {
      subscribe: (clientId: string, channel: string) => {
        if (!subs.has(channel)) subs.set(channel, new Set());
        subs.get(channel)!.add(clientId);
      },
      unsubscribe: (clientId: string, channel: string) => {
        subs.get(channel)?.delete(clientId);
      },
      unsubscribeAll: (clientId: string) => {
        for (const clients of subs.values()) clients.delete(clientId);
      },
      getSubscribers: (channel: string): string[] => {
        return Array.from(subs.get(channel) || []);
      },
      getChannels: (clientId: string): string[] => {
        const channels: string[] = [];
        for (const [channel, clients] of subs) {
          if (clients.has(clientId)) channels.push(channel);
        }
        return channels;
      },
      channelCount: () => subs.size,
      totalSubscriptions: () => {
        let total = 0;
        for (const clients of subs.values()) total += clients.size;
        return total;
      },
    };
  }

  // 请求去重
  function createRequestDeduplicator(ttl: number = 5000) {
    const pending = new Map<string, { promise: Promise<any>; timestamp: number }>();
    return {
      has: (key: string) => {
        const entry = pending.get(key);
        if (!entry) return false;
        if (Date.now() - entry.timestamp > ttl) { pending.delete(key); return false; }
        return true;
      },
      set: (key: string, promise: Promise<any>) => {
        pending.set(key, { promise, timestamp: Date.now() });
      },
      get: (key: string) => pending.get(key)?.promise,
      delete: (key: string) => pending.delete(key),
      cleanup: () => {
        const now = Date.now();
        for (const [key, entry] of pending) {
          if (now - entry.timestamp >= ttl) pending.delete(key);
        }
      },
      size: () => pending.size,
    };
  }

  // 消息压缩 (RLE)
  function rleCompress(data: string): string {
    if (!data) return '';
    let result = '';
    let i = 0;
    while (i < data.length) {
      let count = 1;
      while (i + count < data.length && data[i + count] === data[i]) count++;
      if (count > 2) result += `${count}${data[i]}`;
      else result += data.slice(i, i + count);
      i += count;
    }
    return result;
  }

  function rleDecompress(data: string): string {
    let result = '';
    let i = 0;
    while (i < data.length) {
      let numStr = '';
      while (i < data.length && /\d/.test(data[i])) numStr += data[i++];
      if (numStr && i < data.length) {
        result += data[i].repeat(parseInt(numStr));
        i++;
      } else if (i < data.length) {
        result += data[i++];
      }
    }
    return result;
  }

  describe('消息编解码', () => {
    it('编码解码往返', () => {
      const msg: WSMessage = { type: 'quote', payload: { price: 100 }, timestamp: Date.now() };
      const encoded = encodeMessage(msg);
      const decoded = decodeMessage(encoded);
      expect(decoded).toEqual(msg);
    });

    it('无效JSON返回null', () => {
      expect(decodeMessage('not json')).toBeNull();
    });

    it('缺少type返回null', () => {
      expect(decodeMessage(JSON.stringify({ timestamp: 1 }))).toBeNull();
    });

    it('缺少timestamp返回null', () => {
      expect(decodeMessage(JSON.stringify({ type: 'test' }))).toBeNull();
    });

    it('含id的消息编解码', () => {
      const msg: WSMessage = { type: 'req', payload: null, id: 'abc', timestamp: 123 };
      expect(decodeMessage(encodeMessage(msg))?.id).toBe('abc');
    });
  });

  describe('消息队列', () => {
    it('FIFO顺序', () => {
      const q = createMessageQueue<string>();
      q.enqueue('a');
      q.enqueue('b');
      expect(q.dequeue()).toBe('a');
      expect(q.dequeue()).toBe('b');
    });

    it('超限淘汰最旧的', () => {
      const q = createMessageQueue<number>(3);
      q.enqueue(1); q.enqueue(2); q.enqueue(3); q.enqueue(4);
      expect(q.size()).toBe(3);
      expect(q.peek()).toBe(2);
    });

    it('drain清空队列', () => {
      const q = createMessageQueue<number>();
      q.enqueue(1); q.enqueue(2);
      const items = q.drain();
      expect(items).toEqual([1, 2]);
      expect(q.isEmpty()).toBe(true);
    });

    it('空队列dequeue返回undefined', () => {
      expect(createMessageQueue().dequeue()).toBeUndefined();
    });
  });

  describe('重连策略', () => {
    const config: ReconnectConfig = { baseDelay: 1000, maxDelay: 30000, multiplier: 2, maxAttempts: 5 };

    it('首次重连延迟=baseDelay', () => {
      expect(calculateReconnectDelay(1, config)).toBe(1000);
    });

    it('指数增长', () => {
      expect(calculateReconnectDelay(2, config)).toBe(2000);
      expect(calculateReconnectDelay(3, config)).toBe(4000);
    });

    it('不超过maxDelay', () => {
      expect(calculateReconnectDelay(10, config)).toBe(30000);
    });

    it('attempt<=0返回0', () => {
      expect(calculateReconnectDelay(0, config)).toBe(0);
    });

    it('超过最大次数不重连', () => {
      expect(shouldReconnect(5, config)).toBe(false);
      expect(shouldReconnect(4, config)).toBe(true);
    });
  });

  describe('心跳管理', () => {
    it('初始状态不alive', () => {
      const hb = createHeartbeat(1000, 5000);
      expect(hb.isAlive()).toBe(false);
    });

    it('ping后pong标记alive', () => {
      const hb = createHeartbeat(1000, 5000);
      hb.ping();
      hb.pong();
      expect(hb.isAlive()).toBe(true);
    });

    it('reset清除状态', () => {
      const hb = createHeartbeat(1000, 5000);
      hb.ping();
      hb.pong();
      hb.reset();
      expect(hb.isAlive()).toBe(false);
    });
  });

  describe('订阅管理', () => {
    it('订阅获取订阅者', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('c1', 'ch1');
      sm.subscribe('c2', 'ch1');
      expect(sm.getSubscribers('ch1')).toHaveLength(2);
    });

    it('取消订阅', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('c1', 'ch1');
      sm.unsubscribe('c1', 'ch1');
      expect(sm.getSubscribers('ch1')).toHaveLength(0);
    });

    it('全部取消订阅', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('c1', 'ch1');
      sm.subscribe('c1', 'ch2');
      sm.unsubscribeAll('c1');
      expect(sm.getChannels('c1')).toHaveLength(0);
    });

    it('获取客户端所有频道', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('c1', 'ch1');
      sm.subscribe('c1', 'ch2');
      expect(sm.getChannels('c1')).toEqual(['ch1', 'ch2']);
    });

    it('总计数', () => {
      const sm = createSubscriptionManager();
      sm.subscribe('c1', 'ch1');
      sm.subscribe('c2', 'ch1');
      sm.subscribe('c1', 'ch2');
      expect(sm.totalSubscriptions()).toBe(3);
      expect(sm.channelCount()).toBe(2);
    });
  });

  describe('请求去重', () => {
    it('相同key返回已有promise', () => {
      const d = createRequestDeduplicator();
      const p = Promise.resolve(42);
      d.set('key', p);
      expect(d.has('key')).toBe(true);
      expect(d.get('key')).toBe(p);
    });

    it('过期后不has', async () => {
      const d = createRequestDeduplicator(10);
      d.set('key', Promise.resolve(1));
      await new Promise(r => setTimeout(r, 20));
      expect(d.has('key')).toBe(false);
    });

    it('cleanup清除过期', () => {
      const d = createRequestDeduplicator(0);
      d.set('a', Promise.resolve(1));
      d.set('b', Promise.resolve(2));
      d.cleanup();
      expect(d.size()).toBe(0);
    });
  });

  describe('RLE压缩', () => {
    it('压缩重复字符', () => {
      expect(rleCompress('aaabbb')).toBe('3a3b');
    });

    it('短重复不压缩', () => {
      expect(rleCompress('aab')).toBe('aab');
    });

    it('空串返回空', () => {
      expect(rleCompress('')).toBe('');
    });

    it('解压还原', () => {
      expect(rleDecompress('3a2b')).toBe('aaabb');
    });

    it('往返一致', () => {
      const data = 'aaabbcccccdd';
      expect(rleDecompress(rleCompress(data))).toBe(data);
    });

    it('无重复不变', () => {
      expect(rleCompress('abcdef')).toBe('abcdef');
    });
  });
});
