/**
 * WebSocket Connection Pool
 * Manages multiple WS connections with priority-based channel routing,
 * smart reconnection with exponential backoff, message queuing, and health monitoring.
 */

export interface WSConnectionConfig {
  url: string;
  channels: string[];
  priority: number;
  maxRetries: number;
  heartbeatInterval: number;
}

export interface PooledConnection {
  id: string;
  url: string;
  socket: WebSocket | null;
  channels: Set<string>;
  priority: number;
  state: 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting';
  retryCount: number;
  lastHeartbeat: number;
  messageQueue: unknown[];
  latency: number;
}

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  queuedMessages: number;
  avgLatency: number;
  reconnectCount: number;
}

export class WebSocketConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private channelMap: Map<string, string> = new Map();
  private maxConnections: number;
  private baseReconnectDelay: number;
  private maxReconnectDelay: number;
  private reconnectCount = 0;

  constructor(maxConnections = 6, baseReconnectDelay = 1000, maxReconnectDelay = 30000) {
    this.maxConnections = maxConnections;
    this.baseReconnectDelay = baseReconnectDelay;
    this.maxReconnectDelay = maxReconnectDelay;
  }

  addConnection(config: WSConnectionConfig): string {
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const conn: PooledConnection = {
      id, url: config.url, socket: null,
      channels: new Set(config.channels), priority: config.priority,
      state: 'closed', retryCount: 0, lastHeartbeat: 0,
      messageQueue: [], latency: 0,
    };
    this.connections.set(id, conn);
    config.channels.forEach(ch => this.channelMap.set(ch, id));
    return id;
  }

  removeConnection(id: string): boolean {
    const conn = this.connections.get(id);
    if (!conn) return false;
    conn.channels.forEach(ch => this.channelMap.delete(ch));
    this.connections.delete(id);
    return true;
  }

  getReconnectDelay(retryCount: number): number {
    const exponential = this.baseReconnectDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * this.baseReconnectDelay * 0.5;
    return Math.min(exponential + jitter, this.maxReconnectDelay);
  }

  shouldReconnect(id: string): boolean {
    const conn = this.connections.get(id);
    return !!conn && conn.retryCount < 10;
  }

  markReconnecting(id: string): void {
    const conn = this.connections.get(id);
    if (conn) { conn.state = 'reconnecting'; conn.retryCount++; this.reconnectCount++; }
  }

  resetRetryCount(id: string): void {
    const conn = this.connections.get(id);
    if (conn) { conn.retryCount = 0; conn.state = 'open'; }
  }

  getConnectionByChannel(channel: string): PooledConnection | undefined {
    const connId = this.channelMap.get(channel);
    return connId ? this.connections.get(connId) : undefined;
  }

  getActiveConnections(): PooledConnection[] {
    return Array.from(this.connections.values()).filter(c => c.state === 'open');
  }

  getStats(): PoolStats {
    const conns = Array.from(this.connections.values());
    const active = conns.filter(c => c.state === 'open');
    const queued = conns.reduce((s, c) => s + c.messageQueue.length, 0);
    const latencies = active.map(c => c.latency).filter(l => l > 0);
    return {
      totalConnections: conns.length, activeConnections: active.length,
      queuedMessages: queued,
      avgLatency: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      reconnectCount: this.reconnectCount,
    };
  }

  prioritize(): PooledConnection[] {
    return Array.from(this.connections.values()).sort((a, b) => a.priority - b.priority);
  }

  enqueueMessage(id: string, msg: unknown): boolean {
    const conn = this.connections.get(id);
    if (!conn) return false;
    conn.messageQueue.push(msg);
    return true;
  }

  flushQueue(id: string): unknown[] {
    const conn = this.connections.get(id);
    if (!conn) return [];
    const msgs = [...conn.messageQueue];
    conn.messageQueue = [];
    return msgs;
  }

  setLatency(id: string, latency: number): void {
    const conn = this.connections.get(id);
    if (conn) conn.latency = latency;
  }

  updateHeartbeat(id: string): void {
    const conn = this.connections.get(id);
    if (conn) conn.lastHeartbeat = Date.now();
  }

  isHeartbeatStale(id: string, threshold: number): boolean {
    const conn = this.connections.get(id);
    if (!conn || !conn.lastHeartbeat) return true;
    return Date.now() - conn.lastHeartbeat > threshold;
  }

  getAllConnections(): PooledConnection[] {
    return Array.from(this.connections.values());
  }

  size(): number { return this.connections.size; }
}
