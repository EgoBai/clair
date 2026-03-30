/**
 * WebSocket 服务深层测试
 * 覆盖消息类型、订阅管理、心跳机制、推送逻辑、错误处理、消息队列
 */

import { describe, it, expect, beforeEach } from 'vitest';

// 模拟WebSocket核心逻辑
type WSMessageType = 'quote_update' | 'market_summary' | 'index_update' | 'heartbeat' | 'error' | 'subscribe' | 'unsubscribe' | 'ping';

interface WSMessage<T = any> {
  type: WSMessageType;
  data: T;
  timestamp: number;
}

interface QuoteUpdateData {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
}

interface Subscription {
  socketId: string;
  symbols: Set<string>;
  subscribedAt: number;
}

interface WSStats {
  totalConnections: number;
  activeSubscriptions: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  startTime: number;
}

class MockWSService {
  private subscriptions: Map<string, Subscription> = new Map();
  private messageQueue: Map<string, WSMessage[]> = new Map();
  private stats: WSStats = {
    totalConnections: 0,
    activeSubscriptions: 0,
    messagesSent: 0,
    messagesReceived: 0,
    errors: 0,
    startTime: Date.now(),
  };

  connect(socketId: string): void {
    this.subscriptions.set(socketId, {
      socketId,
      symbols: new Set(),
      subscribedAt: Date.now(),
    });
    this.messageQueue.set(socketId, []);
    this.stats.totalConnections++;
  }

  disconnect(socketId: string): void {
    const sub = this.subscriptions.get(socketId);
    if (sub) {
      this.stats.activeSubscriptions -= sub.symbols.size;
    }
    this.subscriptions.delete(socketId);
    this.messageQueue.delete(socketId);
  }

  subscribe(socketId: string, symbols: string[]): boolean {
    const sub = this.subscriptions.get(socketId);
    if (!sub) return false;
    for (const sym of symbols) {
      sub.symbols.add(sym);
      this.stats.activeSubscriptions++;
    }
    this.stats.messagesReceived++;
    return true;
  }

  unsubscribe(socketId: string, symbols: string[]): boolean {
    const sub = this.subscriptions.get(socketId);
    if (!sub) return false;
    for (const sym of symbols) {
      sub.symbols.delete(sym);
      this.stats.activeSubscriptions--;
    }
    this.stats.messagesReceived++;
    return true;
  }

  pushQuoteUpdate(data: QuoteUpdateData): string[] {
    const sentTo: string[] = [];
    for (const [socketId, sub] of this.subscriptions) {
      if (sub.symbols.has(data.symbol)) {
        const queue = this.messageQueue.get(socketId) || [];
        queue.push({ type: 'quote_update', data, timestamp: Date.now() });
        this.messageQueue.set(socketId, queue);
        sentTo.push(socketId);
        this.stats.messagesSent++;
      }
    }
    return sentTo;
  }

  pushToAll(type: WSMessageType, data: any): number {
    let count = 0;
    for (const [socketId] of this.subscriptions) {
      const queue = this.messageQueue.get(socketId) || [];
      queue.push({ type, data, timestamp: Date.now() });
      this.messageQueue.set(socketId, queue);
      count++;
      this.stats.messagesSent++;
    }
    return count;
  }

  getSubscriptions(socketId: string): string[] {
    const sub = this.subscriptions.get(socketId);
    return sub ? Array.from(sub.symbols) : [];
  }

  getMessageQueue(socketId: string): WSMessage[] {
    return this.messageQueue.get(socketId) || [];
  }

  clearMessageQueue(socketId: string): void {
    this.messageQueue.set(socketId, []);
  }

  getStats(): WSStats {
    return { ...this.stats };
  }

  getConnectedClients(): number {
    return this.subscriptions.size;
  }

  getSubscribersOf(symbol: string): string[] {
    const result: string[] = [];
    for (const [socketId, sub] of this.subscriptions) {
      if (sub.symbols.has(symbol)) result.push(socketId);
    }
    return result;
  }

  hasSubscription(socketId: string, symbol: string): boolean {
    const sub = this.subscriptions.get(socketId);
    return sub?.symbols.has(symbol) || false;
  }

  isHealthy(): boolean {
    return this.stats.errors < 100 && this.getConnectedClients() >= 0;
  }

  resetStats(): void {
    this.stats = {
      totalConnections: 0,
      activeSubscriptions: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      startTime: Date.now(),
    };
  }
}

function validateWSMessage(msg: any): string[] {
  const errors: string[] = [];
  if (!msg.type) errors.push('消息类型不能为空');
  if (msg.timestamp === undefined) errors.push('时间戳不能为空');
  const validTypes: WSMessageType[] = ['quote_update', 'market_summary', 'index_update', 'heartbeat', 'error', 'subscribe', 'unsubscribe', 'ping'];
  if (msg.type && !validTypes.includes(msg.type)) errors.push('无效的消息类型');
  return errors;
}

function formatQuoteMessage(data: QuoteUpdateData): WSMessage<QuoteUpdateData> {
  return {
    type: 'quote_update',
    data,
    timestamp: Date.now(),
  };
}

function isMarketHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  if (hour >= 9 && hour < 11.5) return true;
  if (hour >= 13 && hour < 15) return true;
  return false;
}

function calculateHeartbeatInterval(clients: number): number {
  if (clients < 100) return 25000;
  if (clients < 1000) return 30000;
  return 45000;
}

// ==================== 连接管理 ====================

describe('WebSocket 连接管理', () => {
  let ws: MockWSService;

  beforeEach(() => {
    ws = new MockWSService();
  });

  it('connect应创建订阅', () => {
    ws.connect('client1');
    expect(ws.getConnectedClients()).toBe(1);
  });

  it('disconnect应清理订阅', () => {
    ws.connect('client1');
    ws.subscribe('client1', ['600519']);
    ws.disconnect('client1');
    expect(ws.getConnectedClients()).toBe(0);
    expect(ws.getSubscriptions('client1')).toHaveLength(0);
  });

  it('多个连接应独立管理', () => {
    ws.connect('c1');
    ws.connect('c2');
    ws.connect('c3');
    expect(ws.getConnectedClients()).toBe(3);
    ws.disconnect('c2');
    expect(ws.getConnectedClients()).toBe(2);
  });

  it('重复disconnect不应出错', () => {
    ws.connect('c1');
    ws.disconnect('c1');
    ws.disconnect('c1');
    expect(ws.getConnectedClients()).toBe(0);
  });
});

// ==================== 订阅管理 ====================

describe('WebSocket 订阅管理', () => {
  let ws: MockWSService;

  beforeEach(() => {
    ws = new MockWSService();
  });

  it('subscribe应添加订阅', () => {
    ws.connect('c1');
    ws.subscribe('c1', ['600519', '000858']);
    expect(ws.getSubscriptions('c1')).toEqual(['600519', '000858']);
  });

  it('对未连接客户端subscribe应返回false', () => {
    expect(ws.subscribe('nope', ['600519'])).toBe(false);
  });

  it('unsubscribe应移除订阅', () => {
    ws.connect('c1');
    ws.subscribe('c1', ['600519', '000858']);
    ws.unsubscribe('c1', ['600519']);
    expect(ws.getSubscriptions('c1')).toEqual(['000858']);
  });

  it('对未连接客户端unsubscribe应返回false', () => {
    expect(ws.unsubscribe('nope', ['600519'])).toBe(false);
  });

  it('hasSubscription应正确判断', () => {
    ws.connect('c1');
    ws.subscribe('c1', ['600519']);
    expect(ws.hasSubscription('c1', '600519')).toBe(true);
    expect(ws.hasSubscription('c1', '000858')).toBe(false);
    expect(ws.hasSubscription('c2', '600519')).toBe(false);
  });

  it('重复订阅同一只股票不应重复', () => {
    ws.connect('c1');
    ws.subscribe('c1', ['600519']);
    ws.subscribe('c1', ['600519']);
    expect(ws.getSubscriptions('c1')).toHaveLength(1);
  });

  it('unsubscribe不存在的订阅不应报错', () => {
    ws.connect('c1');
    ws.unsubscribe('c1', ['NOTEXIST']);
    expect(ws.getSubscriptions('c1')).toHaveLength(0);
  });

  it('disconnect后应清除所有订阅', () => {
    ws.connect('c1');
    ws.subscribe('c1', ['A', 'B', 'C']);
    ws.disconnect('c1');
    expect(ws.getSubscribersOf('A')).toHaveLength(0);
  });
});

// ==================== 消息推送 ====================

describe('WebSocket 消息推送', () => {
  let ws: MockWSService;

  beforeEach(() => {
    ws = new MockWSService();
  });

  it('pushQuoteUpdate应只推送给订阅者', () => {
    ws.connect('c1');
    ws.connect('c2');
    ws.subscribe('c1', ['600519']);
    ws.subscribe('c2', ['000858']);
    const sentTo = ws.pushQuoteUpdate({ symbol: '600519', name: '茅台', currentPrice: 1800, change: 50, changePercent: 2.8, volume: 100000, turnover: 180000000 });
    expect(sentTo).toEqual(['c1']);
  });

  it('无人订阅时不推送给任何人', () => {
    ws.connect('c1');
    const sentTo = ws.pushQuoteUpdate({ symbol: '600519', name: '', currentPrice: 0, change: 0, changePercent: 0, volume: 0, turnover: 0 });
    expect(sentTo).toHaveLength(0);
  });

  it('pushToAll应推送给所有连接', () => {
    ws.connect('c1');
    ws.connect('c2');
    ws.connect('c3');
    const count = ws.pushToAll('heartbeat', { ping: true });
    expect(count).toBe(3);
  });

  it('pushToAll在无连接时应返回0', () => {
    expect(ws.pushToAll('heartbeat', {})).toBe(0);
  });

  it('消息应进入接收队列', () => {
    ws.connect('c1');
    ws.subscribe('c1', ['600519']);
    ws.pushQuoteUpdate({ symbol: '600519', name: '', currentPrice: 100, change: 0, changePercent: 0, volume: 0, turnover: 0 });
    const queue = ws.getMessageQueue('c1');
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('quote_update');
  });

  it('clearMessageQueue应清空队列', () => {
    ws.connect('c1');
    ws.subscribe('c1', ['600519']);
    ws.pushQuoteUpdate({ symbol: '600519', name: '', currentPrice: 100, change: 0, changePercent: 0, volume: 0, turnover: 0 });
    ws.clearMessageQueue('c1');
    expect(ws.getMessageQueue('c1')).toHaveLength(0);
  });

  it('getSubscribersOf应返回所有订阅者', () => {
    ws.connect('c1');
    ws.connect('c2');
    ws.connect('c3');
    ws.subscribe('c1', ['600519']);
    ws.subscribe('c2', ['600519']);
    ws.subscribe('c3', ['000858']);
    const subs = ws.getSubscribersOf('600519');
    expect(subs).toHaveLength(2);
    expect(subs).toContain('c1');
    expect(subs).toContain('c2');
  });
});

// ==================== 消息验证 ====================

describe('validateWSMessage 消息验证', () => {
  it('有效消息应通过验证', () => {
    expect(validateWSMessage({ type: 'quote_update', timestamp: Date.now(), data: {} })).toHaveLength(0);
  });

  it('空消息类型应报错', () => {
    expect(validateWSMessage({ timestamp: Date.now() })).toContain('消息类型不能为空');
  });

  it('无效消息类型应报错', () => {
    expect(validateWSMessage({ type: 'invalid', timestamp: 0 })).toContain('无效的消息类型');
  });

  it('缺少时间戳应报错', () => {
    expect(validateWSMessage({ type: 'ping' })).toContain('时间戳不能为空');
  });

  it('所有合法类型应通过验证', () => {
    const types = ['quote_update', 'market_summary', 'index_update', 'heartbeat', 'error', 'subscribe', 'unsubscribe', 'ping'];
    for (const type of types) {
      expect(validateWSMessage({ type, timestamp: 0 })).toHaveLength(0);
    }
  });
});

// ==================== 行情消息格式化 ====================

describe('formatQuoteMessage 行情消息', () => {
  it('应生成正确格式', () => {
    const data: QuoteUpdateData = { symbol: '600519', name: '贵州茅台', currentPrice: 1800, change: 50, changePercent: 2.8, volume: 100000, turnover: 180000000 };
    const msg = formatQuoteMessage(data);
    expect(msg.type).toBe('quote_update');
    expect(msg.data).toEqual(data);
    expect(msg.timestamp).toBeGreaterThan(0);
  });
});

// ==================== 服务统计 ====================

describe('WebSocket 服务统计', () => {
  let ws: MockWSService;

  beforeEach(() => {
    ws = new MockWSService();
  });

  it('getStats应返回正确统计', () => {
    ws.connect('c1');
    ws.connect('c2');
    ws.subscribe('c1', ['600519']);
    ws.pushQuoteUpdate({ symbol: '600519', name: '', currentPrice: 100, change: 0, changePercent: 0, volume: 0, turnover: 0 });
    const stats = ws.getStats();
    expect(stats.totalConnections).toBe(2);
    expect(stats.messagesSent).toBe(1);
    expect(stats.messagesReceived).toBe(1);
  });

  it('isHealthy应返回健康状态', () => {
    expect(ws.isHealthy()).toBe(true);
  });

  it('resetStats应重置统计', () => {
    ws.connect('c1');
    ws.resetStats();
    const stats = ws.getStats();
    expect(stats.totalConnections).toBe(0);
    expect(stats.messagesSent).toBe(0);
  });
});

// ==================== 交易时间判断 ====================

describe('isMarketHours 交易时间', () => {
  it('应返回布尔值', () => {
    expect(typeof isMarketHours()).toBe('boolean');
  });
});

// ==================== 心跳间隔 ====================

describe('calculateHeartbeatInterval 心跳间隔', () => {
  it('少量客户端应更频繁心跳', () => {
    expect(calculateHeartbeatInterval(50)).toBe(25000);
  });

  it('中等客户端应适中间隔', () => {
    expect(calculateHeartbeatInterval(500)).toBe(30000);
  });

  it('大量客户端应更长间隔', () => {
    expect(calculateHeartbeatInterval(5000)).toBe(45000);
  });

  it('零客户端应使用最短间隔', () => {
    expect(calculateHeartbeatInterval(0)).toBe(25000);
  });
});
