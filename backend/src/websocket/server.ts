/**
 * WebSocket 服务 - Bloomberg/TradingView 级别
 *
 * 特性:
 * - 消息压缩 (permessage-deflate)
 * - 消息序列号 (seq) 支持断线补全
 * - 基于 Symbol 的房间系统 (高效推送)
 * - 断线重连同步 (Gap Fill)
 * - 批量推送 + 优先级排序
 * - 延迟监控
 */

import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { dataSyncService } from '../data-sync/DataSyncService';
import { createLogger } from '../utils/logger';
import zlib from 'zlib';

const log = createLogger('WS');

export type WSMessageType =
  | 'quote_update'
  | 'market_summary'
  | 'index_update'
  | 'heartbeat'
  | 'error'
  | 'subscribe'
  | 'unsubscribe'
  | 'ping'
  | 'gap_fill'
  | 'quote_batch';

export interface WSMessage<T = any> {
  type: WSMessageType;
  data: T;
  timestamp: number;
  seq?: number;
  compressed?: boolean;
  batchId?: string;
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

export interface GapFillRequest {
  fromSeq: number;
  symbols: string[];
}

interface ClientSubscription {
  socketId: string;
  symbols: Set<string>;
  lastSeq: number;
  connectedAt: number;
  lastActivityAt: number;
}

/** 推送统计 */
export interface WSPushStats {
  totalSent: number;
  totalFailed: number;
  totalBatched: number;
  totalCompressed: number;
  avgLatencyMs: number;
  activeConnections: number;
  totalSubscriptions: number;
}

export class WebSocketService {
  private io: Server | null = null;
  private subscriptions: Map<string, ClientSubscription> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pushInterval: ReturnType<typeof setInterval> | null = null;

  // 消息序列号 (全局递增)
  private seqCounter: number = 0;

  // 消息历史 (用于断线补全)
  private messageHistory: WSMessage[] = [];
  private maxHistorySize: number = 5000;

  // 批量推送
  private pendingBatch: Map<string, WSMessage[]> = new Map();
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxBatchSize: number = 20;
  private readonly batchFlushInterval: number = 200; // 200ms
  private readonly compressThreshold: number = 512; // 512 bytes

  // 统计
  private stats: WSPushStats = {
    totalSent: 0,
    totalFailed: 0,
    totalBatched: 0,
    totalCompressed: 0,
    avgLatencyMs: 0,
    activeConnections: 0,
    totalSubscriptions: 0,
  };
  private latencySamples: number[] = [];

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
      // 启用 permessage-deflate 压缩 (Bloomberg 级别数据压缩)
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3, // 平衡速度与压缩率
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        threshold: this.compressThreshold,
      },
      // 连接池配置
      maxHttpBufferSize: 1e6, // 1MB
      httpCompression: true,
    });

    this.io.on('connection', (socket: Socket) => {
      log.info('客户端连接', { socketId: socket.id });

      const sub: ClientSubscription = {
        socketId: socket.id,
        symbols: new Set(),
        lastSeq: 0,
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
      };
      this.subscriptions.set(socket.id, sub);

      // 订阅股票行情 (加入 Symbol 房间)
      socket.on('subscribe', (data: { symbols: string[]; lastSeq?: number }) => {
        const clientSub = this.subscriptions.get(socket.id);
        if (clientSub && data.symbols) {
          data.symbols.forEach(s => {
            clientSub.symbols.add(s);
            socket.join(`quote:${s}`); // 加入 Symbol 房间
          });
          clientSub.lastActivityAt = Date.now();
          log.debug('订阅', { socketId: socket.id, symbols: data.symbols });

          // 断线补全: 客户端告知上次收到的 seq
          if (data.lastSeq && data.lastSeq > 0) {
            this.sendGapFill(socket, clientSub, data.lastSeq);
          }
        }
      });

      // 取消订阅 (离开 Symbol 房间)
      socket.on('unsubscribe', (data: { symbols: string[] }) => {
        const clientSub = this.subscriptions.get(socket.id);
        if (clientSub && data.symbols) {
          data.symbols.forEach(s => {
            clientSub.symbols.delete(s);
            socket.leave(`quote:${s}`);
          });
          clientSub.lastActivityAt = Date.now();
          log.debug('取消订阅', { socketId: socket.id, symbols: data.symbols });
        }
      });

      // 心跳
      socket.on('ping', (data?: { timestamp?: number; seq?: number }) => {
        const latency = data?.timestamp ? Date.now() - data.timestamp : 0;
        socket.emit('message', {
          type: 'heartbeat',
          data: {
            status: 'pong',
            serverTime: Date.now(),
            latency,
          },
          timestamp: Date.now(),
        });

        // 延迟采样
        if (latency > 0 && latency < 10000) {
          this.latencySamples.push(latency);
          if (this.latencySamples.length > 100) this.latencySamples.shift();
          this.stats.avgLatencyMs =
            this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
        }
      });

      // 断线补全请求
      socket.on('gap_fill_request', (data: GapFillRequest) => {
        const clientSub = this.subscriptions.get(socket.id);
        if (clientSub) {
          this.sendGapFill(socket, clientSub, data.fromSeq);
        }
      });

      // 断开连接
      socket.on('disconnect', (reason) => {
        log.info('客户端断开', { socketId: socket.id, reason });
        this.subscriptions.delete(socket.id);
        this.pendingBatch.delete(socket.id);
        this.updateStats();
      });

      // 发送连接成功消息
      const connectMsg: WSMessage = {
        type: 'heartbeat',
        data: {
          status: 'connected',
          clientId: socket.id,
          serverTime: Date.now(),
        },
        timestamp: Date.now(),
        seq: ++this.seqCounter,
      };
      socket.emit('message', connectMsg);
      this.addToHistory(connectMsg);
      this.updateStats();
    });

    // 心跳检测 (30秒间隔，与 Bloomberg 一致)
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        data: { serverTime: Date.now() },
        timestamp: Date.now(),
        seq: ++this.seqCounter,
      });
    }, 30000);

    // 批量推送定时器
    this.batchTimer = setInterval(() => {
      this.flushAllBatches();
    }, this.batchFlushInterval);

    log.info('WebSocket服务已初始化 (压缩+序列号+房间+批量)');
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(message: WSMessage): void {
    if (this.io) {
      message.seq = ++this.seqCounter;
      message.timestamp = Date.now();
      this.addToHistory(message);
      this.io.emit('message', message);
      this.stats.totalSent += this.subscriptions.size;
    }
  }

  /**
   * 向订阅了特定股票的客户端推送行情更新
   * 使用 Symbol 房间系统 (高效推送，避免遍历)
   */
  pushQuoteUpdate(symbol: string, data: QuoteUpdateData): void {
    if (!this.io) return;

    const message: WSMessage<QuoteUpdateData> = {
      type: 'quote_update',
      data,
      timestamp: Date.now(),
      seq: ++this.seqCounter,
    };

    // 使用房间系统广播 (Bloomberg/TradingView 标准做法)
    this.io.to(`quote:${symbol}`).emit('message', message);
    this.addToHistory(message);
    this.stats.totalSent++;
  }

  /**
   * 批量推送行情更新 (减少网络往返)
   */
  pushQuoteBatch(updates: Array<{ symbol: string; data: QuoteUpdateData }>): void {
    if (!this.io || updates.length === 0) return;

    const message: WSMessage = {
      type: 'quote_batch',
      data: updates,
      timestamp: Date.now(),
      seq: ++this.seqCounter,
    };

    // 按 Symbol 分组推送到各房间
    for (const update of updates) {
      this.io.to(`quote:${update.symbol}`).emit('message', {
        ...message,
        data: update.data,
        type: 'quote_update',
      });
    }

    this.addToHistory(message);
    this.stats.totalBatched += updates.length;
    this.stats.totalSent += updates.length;
  }

  /**
   * 向指定客户端发送消息 (带压缩)
   */
  sendToClient(socketId: string, message: WSMessage): void {
    if (this.io) {
      message.seq = ++this.seqCounter;
      message.timestamp = Date.now();

      // 检查是否需要压缩
      const dataStr = JSON.stringify(message);
      if (dataStr.length > this.compressThreshold) {
        try {
          const compressed = zlib.gzipSync(Buffer.from(dataStr)).toString('base64');
          this.io.to(socketId).emit('message', {
            type: message.type,
            data: compressed,
            compressed: true,
            timestamp: message.timestamp,
            seq: message.seq,
          });
          this.stats.totalCompressed++;
        } catch {
          this.io.to(socketId).emit('message', message);
        }
      } else {
        this.io.to(socketId).emit('message', message);
      }

      this.addToHistory(message);
      this.stats.totalSent++;
    }
  }

  /**
   * 断线补全: 发送客户端错过的消息
   */
  private sendGapFill(socket: Socket, sub: ClientSubscription, fromSeq: number): void {
    const missed = this.messageHistory.filter(m => {
      if (!m.seq || m.seq <= fromSeq) return false;
      // 只补全客户端订阅的 Symbol 相关消息
      if (m.type === 'quote_update' && m.data?.symbol) {
        return sub.symbols.has(m.data.symbol);
      }
      return m.type === 'heartbeat' || m.type === 'market_summary' || m.type === 'index_update';
    });

    if (missed.length === 0) return;

    log.info('断线补全', { socketId: socket.id, count: missed.length, fromSeq });

    // 分批补全
    const batchSize = 50;
    for (let i = 0; i < missed.length; i += batchSize) {
      const batch = missed.slice(i, i + batchSize);
      socket.emit('message', {
        type: 'gap_fill',
        data: {
          messages: batch,
          from: batch[0]?.seq,
          to: batch[batch.length - 1]?.seq,
        },
        timestamp: Date.now(),
        seq: ++this.seqCounter,
      });
    }

    sub.lastSeq = missed[missed.length - 1]?.seq || sub.lastSeq;
  }

  /**
   * 添加消息到历史 (用于断线补全)
   */
  private addToHistory(message: WSMessage): void {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * 批量推送管理
   */
  private addToBatch(socketId: string, message: WSMessage): void {
    if (!this.pendingBatch.has(socketId)) {
      this.pendingBatch.set(socketId, []);
    }
    const batch = this.pendingBatch.get(socketId)!;
    batch.push(message);

    if (batch.length >= this.maxBatchSize) {
      this.flushBatch(socketId);
    }
  }

  private flushBatch(socketId: string): void {
    const batch = this.pendingBatch.get(socketId);
    if (!batch || batch.length === 0) return;

    this.pendingBatch.delete(socketId);

    if (this.io) {
      this.io.to(socketId).emit('message', {
        type: 'quote_batch',
        data: batch,
        count: batch.length,
        timestamp: Date.now(),
      });
      this.stats.totalBatched += batch.length;
      this.stats.totalSent += batch.length;
    }
  }

  private flushAllBatches(): void {
    for (const socketId of this.pendingBatch.keys()) {
      this.flushBatch(socketId);
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
   * 获取推送统计
   */
  getPushStats(): WSPushStats {
    this.updateStats();
    return { ...this.stats };
  }

  private updateStats(): void {
    this.stats.activeConnections = this.subscriptions.size;
    let total = 0;
    for (const sub of this.subscriptions.values()) {
      total += sub.symbols.size;
    }
    this.stats.totalSubscriptions = total;
  }

  /**
   * 获取当前消息序列号
   */
  getCurrentSeq(): number {
    return this.seqCounter;
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
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    if (this.io) {
      this.io.close();
    }
    log.info('WebSocket服务已关闭');
  }
}

// 单例导出
export const wsService = new WebSocketService();
