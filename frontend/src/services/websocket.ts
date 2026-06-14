/**
 * WebSocket 实时数据服务 (Socket.IO)
 * 连接后端Socket.IO服务获取实时行情推送
 */

import { io, Socket } from 'socket.io-client';
import logger from '../utils/logger';

export type WSMessageType =
  | 'quote_update'
  | 'market_summary'
  | 'index_update'
  | 'heartbeat'
  | 'error';

export interface WSMessage<T = any> {
  type: WSMessageType;
  data: T;
  timestamp: number;
  seq?: number;
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
  url: import.meta.env.VITE_WS_URL || 'http://127.0.0.1:3001',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
};

class WebSocketService {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private handlers: Map<WSMessageType, Set<WSMessageHandler>> = new Map();
  private generalHandlers: Set<WSMessageHandler> = new Set();
  private subscribedSymbols: Set<string> = new Set();
  private isConnected: boolean = false;

  constructor(config: Partial<WebSocketConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      const url = this.config.url;
      this.socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.config.maxReconnectAttempts,
        reconnectionDelay: this.config.reconnectInterval,
        reconnectionDelayMax: 30000,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        // 重新订阅之前的股票
        if (this.subscribedSymbols.size > 0) {
          this.sendSubscribe(Array.from(this.subscribedSymbols));
        }
        resolve();
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
      });

      this.socket.on('connect_error', (error) => {
        logger.error('[WS] 连接错误:', error.message);
        if (!this.isConnected) {
          reject(error);
        }
      });

      // 监听后端通过 'message' 事件推送的数据
      this.socket.on('message', (message: WSMessage) => {
        this.dispatchMessage(message);
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  subscribe(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedSymbols.add(s));
    if (this.isConnected && this.socket) {
      this.sendSubscribe(symbols);
    }
  }

  unsubscribe(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedSymbols.delete(s));
    if (this.isConnected && this.socket) {
      this.socket.emit('unsubscribe', { symbols });
    }
  }

  on(type: WSMessageType, handler: WSMessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  onMessage(handler: WSMessageHandler): () => void {
    this.generalHandlers.add(handler);
    return () => {
      this.generalHandlers.delete(handler);
    };
  }

  getConnectionState(): boolean {
    return this.isConnected;
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  // === 私有方法 ===

  private sendSubscribe(symbols: string[]): void {
    if (this.socket) {
      this.socket.emit('subscribe', { symbols });
    }
  }

  private dispatchMessage(message: WSMessage): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          logger.error('[WS] 处理器错误:', error);
        }
      });
    }

    this.generalHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        logger.error('[WS] 通用处理器错误:', error);
      }
    });
  }
}

export const wsService = new WebSocketService();

export default WebSocketService;
