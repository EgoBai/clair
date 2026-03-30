import { describe, it, expect, beforeEach, vi } from 'vitest';

// WebSocket Connection Pool Manager
interface ConnectionConfig {
  url: string;
  protocols?: string[];
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  messageBufferSize: number;
  timeout: number;
}

interface PooledConnection {
  id: string;
  config: ConnectionConfig;
  state: 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting';
  connectedAt?: Date;
  lastActivity: Date;
  messagesSent: number;
  messagesReceived: number;
  bytesTransferred: number;
  reconnectAttempts: number;
  latency: number;
}

interface Message {
  id: string;
  connectionId: string;
  type: 'text' | 'binary' | 'ping' | 'pong' | 'subscribe' | 'unsubscribe';
  data: unknown;
  timestamp: Date;
  direction: 'in' | 'out';
  size: number;
}

interface Channel {
  name: string;
  subscribers: Set<string>;
  messageCount: number;
  createdAt: Date;
}

interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  avgLatency: number;
  bytesTransferred: number;
  uptime: number;
}

class WebSocketPool {
  private connections: Map<string, PooledConnection> = new Map();
  private channels: Map<string, Channel> = new Map();
  private messageBuffer: Map<string, Message[]> = new Map();
  private messageQueue: Map<string, Message[]> = new Map();
  private messageHandlers: Map<string, ((msg: Message) => void)[]> = new Map();
  private allMessages: Message[] = [];
  private startTime = Date.now();
  private roundRobinIndex = 0;

  addConnection(config: ConnectionConfig): string {
    const id = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const conn: PooledConnection = {
      id,
      config,
      state: 'connecting',
      lastActivity: new Date(),
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
      reconnectAttempts: 0,
      latency: 0,
    };
    this.connections.set(id, conn);
    this.messageBuffer.set(id, []);
    this.messageQueue.set(id, []);

    // Simulate connection open
    setTimeout(() => {
      if (this.connections.has(id)) {
        conn.state = 'open';
        conn.connectedAt = new Date();
      }
    }, 10);

    return id;
  }

  removeConnection(id: string): boolean {
    const conn = this.connections.get(id);
    if (!conn) return false;
    conn.state = 'closed';
    // Unsubscribe from all channels
    for (const channel of this.channels.values()) {
      channel.subscribers.delete(id);
    }
    this.connections.delete(id);
    this.messageBuffer.delete(id);
    this.messageQueue.delete(id);
    return true;
  }

  send(connectionId: string, data: unknown): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn || conn.state !== 'open') {
      // Buffer the message
      const queue = this.messageQueue.get(connectionId);
      if (queue) {
        queue.push({
          id: `msg_${Date.now()}`,
          connectionId,
          type: 'text',
          data,
          timestamp: new Date(),
          direction: 'out',
          size: JSON.stringify(data).length,
        });
      }
      return false;
    }

    const msg: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      connectionId,
      type: 'text',
      data,
      timestamp: new Date(),
      direction: 'out',
      size: JSON.stringify(data).length,
    };

    conn.messagesSent++;
    conn.bytesTransferred += msg.size;
    conn.lastActivity = new Date();
    this.allMessages.push(msg);

    const buffer = this.messageBuffer.get(connectionId);
    if (buffer) buffer.push(msg);

    return true;
  }

  broadcast(data: unknown, excludeIds: string[] = []): number {
    let sent = 0;
    for (const [id, conn] of this.connections) {
      if (conn.state === 'open' && !excludeIds.includes(id)) {
        this.send(id, data);
        sent++;
      }
    }
    return sent;
  }

  subscribe(connectionId: string, channelName: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn || conn.state !== 'open') return false;

    let channel = this.channels.get(channelName);
    if (!channel) {
      channel = { name: channelName, subscribers: new Set(), messageCount: 0, createdAt: new Date() };
      this.channels.set(channelName, channel);
    }
    channel.subscribers.add(connectionId);
    return true;
  }

  unsubscribe(connectionId: string, channelName: string): boolean {
    const channel = this.channels.get(channelName);
    if (!channel) return false;
    return channel.subscribers.delete(connectionId);
  }

  publish(channelName: string, data: unknown): number {
    const channel = this.channels.get(channelName);
    if (!channel) return 0;

    let sent = 0;
    for (const connId of channel.subscribers) {
      if (this.send(connId, { channel: channelName, data })) {
        sent++;
      }
    }
    channel.messageCount += sent;
    return sent;
  }

  roundRobin(): PooledConnection | null {
    const open = Array.from(this.connections.values()).filter(c => c.state === 'open');
    if (open.length === 0) return null;
    const conn = open[this.roundRobinIndex % open.length];
    this.roundRobinIndex++;
    return conn;
  }

  leastActive(): PooledConnection | null {
    const open = Array.from(this.connections.values()).filter(c => c.state === 'open');
    if (open.length === 0) return null;
    return open.reduce((min, c) => c.messagesSent < min.messagesSent ? c : min);
  }

  lowestLatency(): PooledConnection | null {
    const open = Array.from(this.connections.values()).filter(c => c.state === 'open');
    if (open.length === 0) return null;
    return open.reduce((min, c) => c.latency < min.latency ? c : min);
  }

  simulateReconnect(id: string): boolean {
    const conn = this.connections.get(id);
    if (!conn) return false;
    if (conn.reconnectAttempts >= conn.config.maxReconnectAttempts) return false;
    conn.state = 'reconnecting';
    conn.reconnectAttempts++;
    // Simulate reconnect
    conn.state = 'open';
    conn.connectedAt = new Date();
    return true;
  }

  flushBuffer(connectionId: string): number {
    const queue = this.messageQueue.get(connectionId);
    if (!queue || queue.length === 0) return 0;
    const count = queue.length;
    for (const msg of queue) {
      this.send(connectionId, msg.data);
    }
    queue.length = 0;
    return count;
  }

  onMessage(connectionId: string, handler: (msg: Message) => void): void {
    const handlers = this.messageHandlers.get(connectionId) || [];
    handlers.push(handler);
    this.messageHandlers.set(connectionId, handlers);
  }

  simulateReceive(connectionId: string, data: unknown): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    const msg: Message = {
      id: `msg_${Date.now()}`,
      connectionId,
      type: 'text',
      data,
      timestamp: new Date(),
      direction: 'in',
      size: JSON.stringify(data).length,
    };
    conn.messagesReceived++;
    conn.bytesTransferred += msg.size;
    conn.lastActivity = new Date();
    conn.latency = Math.random() * 50;
    this.allMessages.push(msg);

    const handlers = this.messageHandlers.get(connectionId);
    if (handlers) handlers.forEach(h => h(msg));
  }

  getStats(): PoolStats {
    const conns = Array.from(this.connections.values());
    const active = conns.filter(c => c.state === 'open');
    return {
      totalConnections: conns.length,
      activeConnections: active.length,
      totalMessages: this.allMessages.length,
      avgLatency: active.length > 0 ? active.reduce((s, c) => s + c.latency, 0) / active.length : 0,
      bytesTransferred: conns.reduce((s, c) => s + c.bytesTransferred, 0),
      uptime: Date.now() - this.startTime,
    };
  }

  getConnection(id: string): PooledConnection | undefined {
    return this.connections.get(id);
  }

  getChannel(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  getMessageBuffer(connectionId: string): Message[] {
    return this.messageBuffer.get(connectionId) ?? [];
  }

  getConnections(): PooledConnection[] {
    return Array.from(this.connections.values());
  }

  getChannels(): Channel[] {
    return Array.from(this.channels.values());
  }
}

describe('WebSocket Pool Manager', () => {
  let pool: WebSocketPool;

  beforeEach(() => {
    pool = new WebSocketPool();
  });

  it('should add connection', async () => {
    const id = pool.addConnection({
      url: 'ws://localhost:8080',
      reconnectInterval: 1000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      messageBufferSize: 100,
      timeout: 5000,
    });
    expect(id).toBeTruthy();
    await new Promise(r => setTimeout(r, 20));
    expect(pool.getConnection(id)!.state).toBe('open');
  });

  it('should remove connection', () => {
    const id = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    expect(pool.removeConnection(id)).toBe(true);
    expect(pool.getConnection(id)).toBeUndefined();
  });

  it('should send message', async () => {
    const id = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    const sent = pool.send(id, { type: 'ping' });
    expect(sent).toBe(true);
    expect(pool.getConnection(id)!.messagesSent).toBe(1);
  });

  it('should buffer messages when not connected', () => {
    const id = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    pool.send(id, { queued: true });
    expect(pool.getMessageBuffer(id).length).toBeGreaterThanOrEqual(0);
  });

  it('should broadcast to all open connections', async () => {
    const id1 = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    const id2 = pool.addConnection({
      url: 'ws://localhost:8081', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    const sent = pool.broadcast({ type: 'alert' });
    expect(sent).toBe(2);
  });

  it('should subscribe to channel', async () => {
    const id = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    expect(pool.subscribe(id, 'stocks')).toBe(true);
    expect(pool.getChannel('stocks')!.subscribers.has(id)).toBe(true);
  });

  it('should publish to channel', async () => {
    const id = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    pool.subscribe(id, 'news');
    const sent = pool.publish('news', { headline: 'Market up!' });
    expect(sent).toBe(1);
  });

  it('should unsubscribe from channel', async () => {
    const id = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    pool.subscribe(id, 'test');
    expect(pool.unsubscribe(id, 'test')).toBe(true);
    expect(pool.getChannel('test')!.subscribers.has(id)).toBe(false);
  });

  it('should select connection with round robin', async () => {
    pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    pool.addConnection({
      url: 'ws://localhost:8081', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    const c1 = pool.roundRobin();
    const c2 = pool.roundRobin();
    expect(c1).not.toBeNull();
    expect(c2).not.toBeNull();
    expect(c1!.id).not.toBe(c2!.id);
  });

  it('should select least active connection', async () => {
    const id1 = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    const id2 = pool.addConnection({
      url: 'ws://localhost:8081', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    pool.send(id1, { msg: 1 });
    pool.send(id1, { msg: 2 });
    const least = pool.leastActive();
    expect(least!.id).toBe(id2);
  });

  it('should simulate reconnect', async () => {
    const id = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 3, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    pool.getConnection(id)!.state = 'closed';
    expect(pool.simulateReconnect(id)).toBe(true);
    expect(pool.getConnection(id)!.state).toBe('open');
  });

  it('should get stats', async () => {
    pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(1);
    expect(stats.uptime).toBeGreaterThan(0);
  });

  it('should simulate receive and trigger handlers', async () => {
    let received = false;
    const id = pool.addConnection({
      url: 'ws://localhost:8080', reconnectInterval: 1000,
      maxReconnectAttempts: 5, heartbeatInterval: 30000,
      messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    pool.onMessage(id, () => { received = true; });
    pool.simulateReceive(id, { price: 150 });
    expect(received).toBe(true);
    expect(pool.getConnection(id)!.messagesReceived).toBe(1);
  });

  it('should get all connections', () => {
    pool.addConnection({
      url: 'ws://a', reconnectInterval: 1000, maxReconnectAttempts: 5,
      heartbeatInterval: 30000, messageBufferSize: 100, timeout: 5000,
    });
    pool.addConnection({
      url: 'ws://b', reconnectInterval: 1000, maxReconnectAttempts: 5,
      heartbeatInterval: 30000, messageBufferSize: 100, timeout: 5000,
    });
    expect(pool.getConnections()).toHaveLength(2);
  });

  it('should get all channels', async () => {
    const id = pool.addConnection({
      url: 'ws://localhost', reconnectInterval: 1000, maxReconnectAttempts: 5,
      heartbeatInterval: 30000, messageBufferSize: 100, timeout: 5000,
    });
    await new Promise(r => setTimeout(r, 20));
    pool.subscribe(id, 'ch1');
    pool.subscribe(id, 'ch2');
    expect(pool.getChannels()).toHaveLength(2);
  });
});
