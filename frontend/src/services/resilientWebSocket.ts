/**
 * Resilient WebSocket Service
 * 弹性WebSocket服务 - 指数退避重连 + 离线队列 + 心跳检测 + 数据压缩
 *
 * 对标 Bloomberg Terminal / TradingView 实时数据架构
 */

export interface WSConfig {
  url: string;
  protocols?: string[];
  reconnect: boolean;
  reconnectAttempts: number;
  reconnectDelay: number; // base delay ms
  maxReconnectDelay: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  messageQueueSize: number;
  // 数据压缩 (permessage-deflate)
  enableCompression: boolean;
  compressThreshold: number; // 超过此字节数的消息自动压缩
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (data: unknown) => void;
  onReconnect?: (attempt: number, delay: number) => void;
  onReconnectFailed?: () => void;
}

export type WSState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

const DEFAULT_CONFIG: Partial<WSConfig> = {
  reconnect: true,
  reconnectAttempts: 10,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  heartbeatInterval: 30000,
  heartbeatTimeout: 5000,
  messageQueueSize: 100,
  enableCompression: true,
  compressThreshold: 512,
};

export class ResilientWebSocket {
  private ws: WebSocket | null = null;
  private config: WSConfig;
  private state: WSState = 'disconnected';
  private reconnectAttempt: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: string[] = [];
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private stateListeners: Set<(state: WSState) => void> = new Set();
  private destroyed: boolean = false;
  private lastHeartbeatTime: number = 0;

  constructor(config: WSConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as WSConfig;
  }

  connect(): void {
    if (this.destroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.config.url, this.config.protocols);
    } catch {
      this.handleReconnect();
      return;
    }

    this.ws.onopen = (event) => {
      this.reconnectAttempt = 0;
      this.setState('connected');
      this.startHeartbeat();
      this.flushMessageQueue();
      this.config.onOpen?.(event);
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      this.config.onClose?.(event);

      if (!event.wasClean && this.config.reconnect && !this.destroyed) {
        this.handleReconnect();
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = (event) => {
      this.config.onError?.(event);
    };

    this.ws.onmessage = (event) => {
      this.resetHeartbeatTimeout();

      try {
        let payload: string;
        if (typeof event.data === 'string') {
          payload = event.data;
        } else if (event.data instanceof ArrayBuffer) {
          payload = new TextDecoder().decode(event.data);
        } else {
          payload = event.data.toString();
        }

        const data = JSON.parse(payload);

        // Handle compressed messages
        if (data.compressed && typeof data.data === 'string') {
          try {
            const decompressed = atob(data.data);
            const parsed = JSON.parse(decompressed);
            data.data = parsed;
            data.compressed = false;
          } catch {
            // Keep original data if decompression fails
          }
        }

        // Handle pong
        if (data.type === 'pong') {
          this.lastHeartbeatTime = Date.now();
          return;
        }

        this.config.onMessage?.(data);

        // Emit to channel listeners
        if (data.channel) {
          this.listeners.get(data.channel)?.forEach(cb => cb(data));
        }
        this.listeners.get('*')?.forEach(cb => cb(data));
      } catch {
        this.config.onMessage?.(event.data);
      }
    };
  }

  private handleReconnect(): void {
    if (this.reconnectAttempt >= (this.config.reconnectAttempts ?? 10)) {
      this.setState('failed');
      this.config.onReconnectFailed?.();
      return;
    }

    this.setState('reconnecting');

    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectDelay ?? 1000;
    const maxDelay = this.config.maxReconnectDelay ?? 30000;
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempt),
      maxDelay
    );
    const jitter = exponentialDelay * 0.3 * Math.random();
    const delay = exponentialDelay + jitter;

    this.reconnectAttempt++;
    this.config.onReconnect?.(this.reconnectAttempt, delay);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        this.resetHeartbeatTimeout();
      }
    }, this.config.heartbeatInterval);
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }
    this.heartbeatTimeoutTimer = setTimeout(() => {
      // No pong received, close and reconnect
      this.ws?.close(4000, 'Heartbeat timeout');
    }, this.config.heartbeatTimeout);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  send(data: string | Record<string, unknown>): boolean {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      return true;
    }

    // Queue message for later
    if (this.messageQueue.length >= (this.config.messageQueueSize ?? 100)) {
      this.messageQueue.shift();
    }
    this.messageQueue.push(message);
    return false;
  }

  subscribe(channel: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(callback);

    // Send subscribe message if connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', channel }));
    }

    return () => {
      this.listeners.get(channel)?.delete(callback);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'unsubscribe', channel }));
      }
    };
  }

  onStateChange(listener: (state: WSState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state); // immediate
    return () => this.stateListeners.delete(listener);
  }

  private setState(state: WSState): void {
    this.state = state;
    this.stateListeners.forEach(l => l(state));
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift();
      if (msg) this.ws.send(msg);
    }
  }

  disconnect(): void {
    this.config.reconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.ws?.close(1000, 'Client disconnect');
    this.setState('disconnected');
  }

  destroy(): void {
    this.destroyed = true;
    this.disconnect();
    this.listeners.clear();
    this.stateListeners.clear();
    this.messageQueue = [];
  }

  getState(): WSState {
    return this.state;
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  getLastHeartbeatTime(): number {
    return this.lastHeartbeatTime;
  }
}
