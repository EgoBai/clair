/**
 * SSE Client Service
 * Server-Sent Events 客户端 - 实时数据推送
 */

export interface SSEConfig {
  url: string;
  withCredentials?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  headers?: Record<string, string>;
  onOpen?: (event: Event) => void;
  onError?: (event: Event) => void;
  onReconnect?: (attempt: number) => void;
}

export type SSEEventType = 'message' | 'error' | 'open' | 'stock_update' | 'market_data' | 'alert' | string;

export interface SSEMessage<T = unknown> {
  id?: string;
  event: SSEEventType;
  data: T;
  timestamp: number;
}

type SSEHandler<T = unknown> = (message: SSEMessage<T>) => void;

export class SSEClient {
  private eventSource: EventSource | null = null;
  private config: SSEConfig;
  private handlers: Map<string, Set<SSEHandler>> = new Map();
  private reconnectAttempt: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed: boolean = false;
  private state: 'connecting' | 'open' | 'closed' = 'closed';

  constructor(config: SSEConfig) {
    this.config = {
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  connect(): void {
    if (this.destroyed || this.eventSource?.readyState === EventSource.OPEN) return;

    this.state = 'connecting';

    try {
      // Note: EventSource doesn't support custom headers natively
      // For custom headers, would need fetch-based SSE implementation
      this.eventSource = new EventSource(this.config.url, {
        withCredentials: this.config.withCredentials,
      });

      this.eventSource.onopen = (event) => {
        this.reconnectAttempt = 0;
        this.state = 'open';
        this.config.onOpen?.(event);
      };

      this.eventSource.onerror = (event) => {
        this.config.onError?.(event);

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.state = 'closed';
          this.handleReconnect();
        }
      };

      this.eventSource.onmessage = (event) => {
        this.dispatch('message', {
          event: 'message',
          data: this.parseData(event.data),
          id: event.lastEventId || undefined,
          timestamp: Date.now(),
        });
      };
    } catch {
      this.handleReconnect();
    }
  }

  on<T = unknown>(event: SSEEventType, handler: SSEHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as SSEHandler);

    // Register with EventSource for named events
    if (this.eventSource && event !== 'message') {
      this.eventSource.addEventListener(event, ((e: MessageEvent) => {
        this.dispatch(event, {
          event,
          data: this.parseData(e.data),
          id: e.lastEventId || undefined,
          timestamp: Date.now(),
        });
      }) as EventListener);
    }

    return () => {
      this.handlers.get(event)?.delete(handler as SSEHandler);
    };
  }

  private dispatch(event: string, message: SSEMessage): void {
    this.handlers.get(event)?.forEach(h => h(message));
    this.handlers.get('*')?.forEach(h => h(message));
  }

  private parseData(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private handleReconnect(): void {
    if (!this.config.reconnect || this.destroyed) return;
    if (this.reconnectAttempt >= (this.config.maxReconnectAttempts ?? 10)) return;

    this.reconnectAttempt++;
    this.config.onReconnect?.(this.reconnectAttempt);

    this.reconnectTimer = setTimeout(() => {
      this.close();
      this.connect();
    }, this.config.reconnectInterval);
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.eventSource?.close();
    this.eventSource = null;
    this.state = 'closed';
  }

  destroy(): void {
    this.destroyed = true;
    this.close();
    this.handlers.clear();
  }

  getState(): string {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'open';
  }
}
