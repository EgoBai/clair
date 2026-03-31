/**
 * WebSocket 连接管理器
 * WebSocket Connection Manager
 *
 * 自动重连、心跳检测、连接池管理、消息队列
 */

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface WSConfig {
  url: string;
  protocols?: string | string[];
  reconnect: boolean;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  heartbeatMessage: string;
  messageQueueMax: number;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onMessage?: (data: any) => void;
  onReconnect?: (attempt: number) => void;
  onError?: (error: Event) => void;
}

export interface WSStats {
  connectionState: ConnectionState;
  reconnectAttempts: number;
  messagesSent: number;
  messagesReceived: number;
  lastHeartbeat: number;
  queuedMessages: number;
  uptime: number;
}

const DEFAULT_CONFIG: Partial<WSConfig> = {
  reconnect: true,
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30_000,
  heartbeatMessage: '{"type":"ping"}',
  messageQueueMax: 100,
};

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WSConfig;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: string[] = [];
  private messagesSent = 0;
  private messagesReceived = 0;
  private lastHeartbeat = 0;
  private connectedAt = 0;
  private intentionalClose = false;

  constructor(config: WSConfig) {
    this.config = { ...DEFAULT_CONFIG as WSConfig, ...config };
  }

  /**
   * 建立连接
   */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    this.state = 'connecting';
    this.ws = new WebSocket(this.config.url, this.config.protocols);

    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectAttempts = 0;
      this.connectedAt = Date.now();
      this.startHeartbeat();
      this.flushQueue();
      this.config.onOpen?.();
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      this.config.onClose?.(event.code, event.reason);

      if (!this.intentionalClose && this.config.reconnect) {
        this.scheduleReconnect();
      } else {
        this.state = 'disconnected';
      }
    };

    this.ws.onmessage = (event) => {
      this.messagesReceived++;

      // 心跳响应不触发 onMessage
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          this.lastHeartbeat = Date.now();
          return;
        }
      } catch {}

      this.config.onMessage?.(event.data);
    };

    this.ws.onerror = (error) => {
      this.config.onError?.(error);
    };
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnect();
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  /**
   * 发送消息（离线时加入队列）
   */
  send(data: string | object): boolean {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      this.messagesSent++;
      return true;
    }

    // 入队等待
    if (this.messageQueue.length < this.config.messageQueueMax) {
      this.messageQueue.push(message);
    }
    return false;
  }

  /**
   * 获取状态
   */
  getStats(): WSStats {
    return {
      connectionState: this.state,
      reconnectAttempts: this.reconnectAttempts,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      lastHeartbeat: this.lastHeartbeat,
      queuedMessages: this.messageQueue.length,
      uptime: this.connectedAt > 0 ? Date.now() - this.connectedAt : 0,
    };
  }

  /**
   * 获取当前状态
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * 清空消息队列
   */
  clearQueue(): void {
    this.messageQueue = [];
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<WSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(this.config.heartbeatMessage);
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift()!;
      this.ws.send(msg);
      this.messagesSent++;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.state = 'disconnected';
      return;
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;
    this.config.onReconnect?.(this.reconnectAttempts);

    // 指数退避
    const delay = this.config.reconnectInterval * Math.min(Math.pow(2, this.reconnectAttempts - 1), 8);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/**
 * 连接池管理器
 */
export class ConnectionPool {
  private connections: Map<string, WebSocketManager> = new Map();

  add(id: string, config: WSConfig): WebSocketManager {
    if (this.connections.has(id)) {
      this.connections.get(id)!.disconnect();
    }
    const manager = new WebSocketManager(config);
    this.connections.set(id, manager);
    return manager;
  }

  get(id: string): WebSocketManager | undefined {
    return this.connections.get(id);
  }

  remove(id: string): void {
    const manager = this.connections.get(id);
    if (manager) {
      manager.disconnect();
      this.connections.delete(id);
    }
  }

  broadcast(data: string | object): void {
    for (const manager of this.connections.values()) {
      manager.send(data);
    }
  }

  disconnectAll(): void {
    for (const manager of this.connections.values()) {
      manager.disconnect();
    }
    this.connections.clear();
  }

  getStats(): Record<string, WSStats> {
    const stats: Record<string, WSStats> = {};
    for (const [id, manager] of this.connections) {
      stats[id] = manager.getStats();
    }
    return stats;
  }
}
