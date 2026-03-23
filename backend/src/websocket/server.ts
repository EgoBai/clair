/**
 * WebSocket 服务
 * 实现实时行情推送、市场数据更新
 */

import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { dataSyncService } from '../data-sync/DataSyncService';

export type WSMessageType =
  | 'quote_update'
  | 'market_summary'
  | 'index_update'
  | 'heartbeat'
  | 'error'
  | 'subscribe'
  | 'unsubscribe'
  | 'ping';

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
}

interface ClientSubscription {
  socketId: string;
  symbols: Set<string>;
}

export class WebSocketService {
  private io: Server | null = null;
  private subscriptions: Map<string, ClientSubscription> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pushInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * 初始化WebSocket服务
   */
  initialize(httpServer: HTTPServer): void {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      pingInterval: 25000,
      pingTimeout: 20000,
    });

    this.io.on('connection', (socket: Socket) => {
      console.log(`[WS] 客户端连接: ${socket.id}`);

      this.subscriptions.set(socket.id, {
        socketId: socket.id,
        symbols: new Set(),
      });

      // 订阅股票行情
      socket.on('subscribe', (data: { symbols: string[] }) => {
        const sub = this.subscriptions.get(socket.id);
        if (sub && data.symbols) {
          data.symbols.forEach(s => sub.symbols.add(s));
          console.log(`[WS] ${socket.id} 订阅: ${data.symbols.join(', ')}`);
        }
      });

      // 取消订阅
      socket.on('unsubscribe', (data: { symbols: string[] }) => {
        const sub = this.subscriptions.get(socket.id);
        if (sub && data.symbols) {
          data.symbols.forEach(s => sub.symbols.delete(s));
          console.log(`[WS] ${socket.id} 取消订阅: ${data.symbols.join(', ')}`);
        }
      });

      // 心跳
      socket.on('ping', () => {
        socket.emit('message', {
          type: 'heartbeat',
          data: { status: 'pong' },
          timestamp: Date.now(),
        });
      });

      // 断开连接
      socket.on('disconnect', (reason) => {
        console.log(`[WS] 客户端断开: ${socket.id}, 原因: ${reason}`);
        this.subscriptions.delete(socket.id);
      });

      // 发送连接成功消息
      socket.emit('message', {
        type: 'heartbeat',
        data: { status: 'connected', clientId: socket.id },
        timestamp: Date.now(),
      });
    });

    // 心跳检测
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        data: { serverTime: new Date().toISOString() },
        timestamp: Date.now(),
      });
    }, 30000);

    console.log('[WS] WebSocket服务已初始化');
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(message: WSMessage): void {
    if (this.io) {
      this.io.emit('message', message);
    }
  }

  /**
   * 向订阅了特定股票的客户端推送行情更新
   */
  pushQuoteUpdate(symbol: string, data: QuoteUpdateData): void {
    if (!this.io) return;

    for (const [socketId, sub] of this.subscriptions) {
      if (sub.symbols.has(symbol)) {
        this.io.to(socketId).emit('message', {
          type: 'quote_update',
          data,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * 向指定客户端发送消息
   */
  sendToClient(socketId: string, message: WSMessage): void {
    if (this.io) {
      this.io.to(socketId).emit('message', message);
    }
  }

  /**
   * 获取在线客户端数量
   */
  getConnectedCount(): number {
    return this.subscriptions.size;
  }

  /**
   * 获取订阅统计
   */
  getSubscriptionStats(): { totalClients: number; totalSubscriptions: number; symbols: string[] } {
    const allSymbols = new Set<string>();
    for (const sub of this.subscriptions.values()) {
      sub.symbols.forEach(s => allSymbols.add(s));
    }

    return {
      totalClients: this.subscriptions.size,
      totalSubscriptions: allSymbols.size,
      symbols: Array.from(allSymbols),
    };
  }

  /**
   * 关闭WebSocket服务
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.pushInterval) {
      clearInterval(this.pushInterval);
    }
    if (this.io) {
      this.io.close();
    }
    console.log('[WS] WebSocket服务已关闭');
  }
}

// 单例导出
export const wsService = new WebSocketService();
