/**
 * WebSocket 增强服务
 * 
 * 特性:
 * - 指数退避重连 (Exponential Backoff)
 * - 心跳检测 + 超时断线
 * - 断线数据补全 (Gap Fill)
 * - 多数据源容灾切换
 * - 连接状态事件
 * 
 * 参考 Bloomberg 的实时数据架构
 */

import logger from '../utils/logger';
export type WSMessageType =
  | 'quote_update'
  | 'market_summary'
  | 'index_update'
  | 'heartbeat'
  | 'error'
  | 'gap_fill'      // 断线补全数据
  | 'source_switch'; // 数据源切换通知

export interface WSMessage<T = any> {
  type: WSMessageType;
  data: T;
  timestamp: number;
  seq?: number;     // 序列号，用于断线补全
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

export interface GapFillData {
  symbol: string;
  from: number;  // 起始序列号
  to: number;    // 结束序列号
  messages: WSMessage[];
}

export type WSMessageHandler = (message: WSMessage) => void;
export type ConnectionStateHandler = (state: ConnectionState) => void;

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export type DataSource = 'primary' | 'backup' | 'emergency';

// ==================== 配置 ====================

export interface EnhancedWSConfig {
  // 数据源列表 (按优先级)
  sources: Array<{ name: DataSource; url: string }>;
  // 重连配置
  initialRetryDelay: number;    // 初始重试延迟 (ms)
  maxRetryDelay: number;        // 最大重试延迟 (ms)
  retryMultiplier: number;      // 退避倍数
  maxRetryAttempts: number;     // 最大重试次数
  // 心跳配置
  heartbeatInterval: number;    // 心跳间隔 (ms)
  heartbeatTimeout: number;     // 心跳超时 (ms)
  // 断线补全
  enableGapFill: boolean;       // 是否启用断线补全
  gapFillBatchSize: number;     // 每次补全最大消息数
}

const DEFAULT_CONFIG: EnhancedWSConfig = {
  sources: [
    { name: 'primary', url: (import.meta.env.VITE_WS_URL as string) || 'ws://localhost:3001/ws' },
    { name: 'backup', url: (import.meta.env.VITE_WS_BACKUP_URL as string) || '' },
  ],
  initialRetryDelay: 1000,
  maxRetryDelay: 30000,
  retryMultiplier: 2,
  maxRetryAttempts: 15,
  heartbeatInterval: 15000,
  heartbeatTimeout: 10000,
  enableGapFill: true,
  gapFillBatchSize: 100,
};

// ==================== 增强 WebSocket 服务 ====================

class EnhancedWebSocketService {
  private config: EnhancedWSConfig;
  private ws: WebSocket | null = null;
  private currentSourceIndex: number = 0;

  // 状态
  private connectionState: ConnectionState = 'disconnected';
  private isManualClose: boolean = false;
  private retryCount: number = 0;
  private currentRetryDelay: number;
  private lastSeq: number = 0;
  private messageBuffer: WSMessage[] = [];

  // 订阅
  private subscribedSymbols: Set<string> = new Set();

  // 处理器
  private handlers: Map<WSMessageType | '*', Set<WSMessageHandler>> = new Map();
  private stateHandlers: Set<ConnectionStateHandler> = new Set();

  // 定时器
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<EnhancedWSConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentRetryDelay = this.config.initialRetryDelay;
  }

  // ==================== 公共 API ====================

  /**
   * 连接 WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isManualClose = false;
      this.setConnectionState('connecting');

      const source = this.config.sources[this.currentSourceIndex];
      if (!source?.url) {
        this.switchToNextSource();
        return;
      }

      try {
        this.ws = new WebSocket(source.url);
      } catch (error) {
        this.handleConnectionFailure(error);
        reject(error);
        return;
      }

      this.ws.onopen = () => {
        // removed: console.log
        this.retryCount = 0;
        this.currentRetryDelay = this.config.initialRetryDelay;
        this.setConnectionState('connected');

        // 重新订阅
        if (this.subscribedSymbols.size > 0) {
          this.sendSubscribe(Array.from(this.subscribedSymbols));
        }

        // 请求断线补全
        if (this.config.enableGapFill && this.lastSeq > 0) {
          this.requestGapFill(this.lastSeq);
        }

        this.startHeartbeat();
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          logger.error('[WS] 消息解析失败:', error);
        }
      };

      this.ws.onerror = (event) => {
        logger.error('[WS] 连接错误:', event);
      };

      this.ws.onclose = (_event) => {
        // removed: console.log
        this.stopHeartbeat();

        if (!this.isManualClose) {
          this.setConnectionState('reconnecting');
          this.scheduleReconnect();
        } else {
          this.setConnectionState('disconnected');
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
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    this.setConnectionState('disconnected');
  }

  /**
   * 订阅股票行情
   */
  subscribe(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedSymbols.add(s));
    if (this.connectionState === 'connected') {
      this.sendSubscribe(symbols);
    }
  }

  /**
   * 取消订阅
   */
  unsubscribe(symbols: string[]): void {
    symbols.forEach((s) => this.subscribedSymbols.delete(s));
    if (this.connectionState === 'connected') {
      this.send({ type: 'unsubscribe', symbols });
    }
  }

  /**
   * 注册消息处理器
   */
  on(type: WSMessageType | '*', handler: WSMessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /**
   * 注册连接状态变化处理器
   */
  onStateChange(handler: ConnectionStateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  /**
   * 获取连接状态
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * 获取是否已连接
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * 获取当前数据源
   */
  getCurrentSource(): DataSource {
    return this.config.sources[this.currentSourceIndex]?.name || 'primary';
  }

  /**
   * 获取已订阅的股票
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  // ==================== 私有方法 ====================

  private send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendSubscribe(symbols: string[]): void {
    this.send({
      type: 'subscribe',
      symbols,
      lastSeq: this.lastSeq,
    });
  }

  private handleMessage(message: WSMessage): void {
    // 更新序列号
    if (message.seq && message.seq > this.lastSeq) {
      this.lastSeq = message.seq;
    }

    // 心跳响应
    if (message.type === 'heartbeat') {
      this.resetHeartbeatTimeout();
      return;
    }

    // 断线补全
    if (message.type === 'gap_fill') {
      this.handleGapFill(message.data as GapFillData);
      return;
    }

    // 数据源切换
    if (message.type === 'source_switch') {
      // removed: console.log
      return;
    }

    // 缓存消息 (用于断线补全参考)
    if (this.config.enableGapFill) {
      this.messageBuffer.push(message);
      if (this.messageBuffer.length > this.config.gapFillBatchSize) {
        this.messageBuffer.shift();
      }
    }

    // 分发消息
    this.dispatchMessage(message);
  }

  private dispatchMessage(message: WSMessage): void {
    // 特定类型处理器
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

    // 通配符处理器
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          logger.error('[WS] 通配符处理器错误:', error);
        }
      });
    }
  }

  // ==================== 心跳管理 ====================

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.connectionState === 'connected') {
        this.send({
          type: 'ping',
          timestamp: Date.now(),
          seq: this.lastSeq,
        });
        this.resetHeartbeatTimeout();
      }
    }, this.config.heartbeatInterval);
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

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }
    this.heartbeatTimeoutTimer = setTimeout(() => {
      logger.warn('[WS] 心跳超时，断开重连');
      if (this.ws) {
        this.ws.close();
      }
    }, this.config.heartbeatTimeout);
  }

  // ==================== 重连策略 ====================

  private scheduleReconnect(): void {
    if (this.retryCount >= this.config.maxRetryAttempts) {
      // 切换数据源
      if (this.switchToNextSource()) {
        this.retryCount = 0;
        this.currentRetryDelay = this.config.initialRetryDelay;
      } else {
        logger.error('[WS] 所有数据源均不可用');
        this.setConnectionState('failed');
        return;
      }
    }

    // 指数退避: delay = initial * multiplier^retry, 但不超过 max
    const delay = Math.min(
      this.config.initialRetryDelay * Math.pow(this.config.retryMultiplier, this.retryCount),
      this.config.maxRetryDelay
    );

    // 添加抖动 (±20%)
    const jitter = delay * (0.8 + Math.random() * 0.4);

    this.retryCount++;
    // removed: console.log

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('[WS] 重连失败:', error);
      });
    }, jitter);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 切换到下一个数据源
   */
  private switchToNextSource(): boolean {
    const nextIndex = this.currentSourceIndex + 1;
    if (nextIndex >= this.config.sources.length) {
      return false;
    }

    // 跳过没有URL的数据源
    for (let i = nextIndex; i < this.config.sources.length; i++) {
      if (this.config.sources[i].url) {
        this.currentSourceIndex = i;
        // removed: console.log
        return true;
      }
    }

    return false;
  }

  private handleConnectionFailure(error: unknown): void {
    logger.error('[WS] 连接失败:', error);
    this.scheduleReconnect();
  }

  // ==================== 断线补全 ====================

  private requestGapFill(fromSeq: number): void {
    this.send({
      type: 'gap_fill_request',
      fromSeq,
      symbols: Array.from(this.subscribedSymbols),
    });
  }

  private handleGapFill(data: GapFillData): void {
    if (!data.messages || data.messages.length === 0) return;

    // removed: console.log

    // 按序列号排序并分发
    const sorted = [...data.messages].sort((a, b) => (a.seq || 0) - (b.seq || 0));
    for (const msg of sorted) {
      if (msg.seq && msg.seq > this.lastSeq) {
        this.lastSeq = msg.seq;
      }
      this.dispatchMessage(msg);
    }
  }

  // ==================== 状态管理 ====================

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;
    const _prev = this.connectionState;
    this.connectionState = state;
    // removed: console.log

    this.stateHandlers.forEach((handler) => {
      try {
        handler(state);
      } catch (error) {
        logger.error('[WS] 状态处理器错误:', error);
      }
    });
  }
}

// ==================== 单例 ====================

export const enhancedWsService = new EnhancedWebSocketService();

export default EnhancedWebSocketService;
