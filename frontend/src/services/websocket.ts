/**
 * WebSocket 实时数据服务
 * 连接后端WebSocket服务获取实时行情推送
 */

export type WSMessageType =
  | 'quote_update'       // 行情更新
  | 'market_summary'     // 市场概况更新
  | 'index_update'       // 指数更新
  | 'heartbeat'          // 心跳
  | 'error';             // 错误

export interface WSMessage<T = any> {
  type: WSMessageType;
  data: T;
  timestamp: number;
}

export interface QuoteUpdateData {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  bidPrice1?: number;
  askPrice1?: number;
}

export type WSMessageHandler = (message: WSMessage) => void;

interface WebSocketConfig {
  url: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
}

const DEFAULT_CONFIG: WebSocketConfig = {
  url: (import.meta.env.VITE_WS_URL as string) || 'ws://localhost:3001/ws',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
};

class WebSocketService {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private handlers: Map<WSMessageType, Set<WSMessageHandler>> = new Map();
  private generalHandlers: Set<WSMessageHandler> = new Set();
  private reconnectAttempts: number = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualClose: boolean = false;
  private subscribedSymbols: Set<string> = new Set();
  private isConnected: boolean = false;

  constructor(config: Partial<WebSocketConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 连接WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isManualClose = false;

      try {
        this.ws = new WebSocket(this.config.url);
      } catch (error) {
        reject(error);
        return;
      }

      this.ws.onopen = () => {
        console.log('[WS] 连接成功');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();

        // 重新订阅之前的股票
        if (this.subscribedSymbols.size > 0) {
          this.sendSubscribe(Array.from(this.subscribedSymbols));
        }

        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.dispatchMessage(message);
        } catch (error) {
          console.error('[WS] 消息解析失败:', error);
        }
      };

      this.ws.onerror = (event) => {
        console.error('[WS] 连接错误:', event);
      };

      this.ws.onclose = () => {
        console.log('[WS] 连接关闭');
        this.isConnected = false;
        this.stopHeartbeat();

        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      };
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * 订阅股票行情
   */
  subscribe(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedSymbols.add(s));
    if (this.isConnected) {
      this.sendSubscribe(symbols);
    }
  }

  /**
   * 取消订阅
   */
  unsubscribe(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedSymbols.delete(s));
    if (this.isConnected) {
      this.send({
        type: 'unsubscribe',
        symbols,
      });
    }
  }

  /**
   * 注册消息处理器
   */
  on(type: WSMessageType, handler: WSMessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /**
   * 注册通用消息处理器
   */
  onMessage(handler: WSMessageHandler): () => void {
    this.generalHandlers.add(handler);
    return () => {
      this.generalHandlers.delete(handler);
    };
  }

  /**
   * 获取连接状态
   */
  getConnectionState(): boolean {
    return this.isConnected;
  }

  /**
   * 获取已订阅的股票
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  // === 私有方法 ===

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendSubscribe(symbols: string[]): void {
    this.send({
      type: 'subscribe',
      symbols,
    });
  }

  private dispatchMessage(message: WSMessage): void {
    // 分发到特定类型处理器
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('[WS] 处理器错误:', error);
        }
      });
    }

    // 分发到通用处理器
    this.generalHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error('[WS] 通用处理器错误:', error);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[WS] 达到最大重连次数');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.min(this.reconnectAttempts, 5);

    console.log(`[WS] ${delay}ms 后重连 (第${this.reconnectAttempts}次)`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WS] 重连失败:', error);
      });
    }, delay);
  }
}

// 单例导出
export const wsService = new WebSocketService();

export default WebSocketService;
