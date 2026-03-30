/**
 * WebSocket 实时推送引擎
 * 支持主题房间、消息批量推送、压缩、优先级排序、断线重连同步
 */

import {
  NotificationPayload,
  NotificationType,
  NotificationPriority,
} from './types';

/** 推送主题定义 */
export type PushTopic =
  | 'notifications'          // 通用通知
  | 'price_alerts'           // 价格预警
  | 'market_events'          // 市场事件（涨跌停/放量）
  | 'news'                   // 新闻
  | 'trade_execution'        // 交易执行
  | 'system'                 // 系统通知
  | 'watchlist_updates'      // 自选更新
  | 'reports';               // 报告

/** 推送消息封装 */
export interface PushMessage {
  id: string;
  topic: PushTopic;
  type: NotificationType;
  priority: NotificationPriority;
  payload: NotificationPayload;
  timestamp: number;
  seq: number;               // 序列号，用于断线重连同步
  batchId?: string;          // 批次ID
}

/** 客户端连接信息 */
export interface ClientConnection {
  socketId: string;
  userId: string;
  subscribedTopics: Set<PushTopic>;
  lastSeq: number;           // 客户端最后收到的序列号
  connectedAt: number;
  lastActivityAt: number;
  userAgent?: string;
}

/** 批量推送配置 */
export interface BatchConfig {
  enabled: boolean;
  maxBatchSize: number;      // 最大批量大小
  flushIntervalMs: number;   // 刷新间隔
  compressThreshold: number; // 压缩阈值（字节）
}

/** 推送统计 */
export interface PushStats {
  totalSent: number;
  totalFailed: number;
  totalBatched: number;
  avgLatencyMs: number;
  activeConnections: number;
  topicSubscriptions: Record<PushTopic, number>;
  messagesByType: Record<string, number>;
  messagesByPriority: Record<string, number>;
}

/** 主题路由映射 */
const TYPE_TOPIC_MAP: Record<NotificationType, PushTopic> = {
  price_alert: 'price_alerts',
  limit_up: 'market_events',
  limit_down: 'market_events',
  volume_surge: 'market_events',
  news: 'news',
  trade: 'trade_execution',
  system: 'system',
  watchlist_update: 'watchlist_updates',
  report: 'reports',
};

/** 默认批量配置 */
const DEFAULT_BATCH_CONFIG: BatchConfig = {
  enabled: true,
  maxBatchSize: 20,
  flushIntervalMs: 500,
  compressThreshold: 1024,
};

export class WSPushEngine {
  private clients: Map<string, ClientConnection> = new Map();
  private userClients: Map<string, Set<string>> = new Map();
  private topicSubscribers: Map<PushTopic, Set<string>> = new Map();
  private messageHistory: PushMessage[] = [];
  private seqCounter = 0;
  private maxHistorySize = 10000;

  // 批量推送
  private batchConfig: BatchConfig;
  private pendingBatch: Map<string, PushMessage[]> = new Map(); // socketId -> messages
  private batchTimer: ReturnType<typeof setInterval> | null = null;

  // 统计
  private stats: PushStats = {
    totalSent: 0,
    totalFailed: 0,
    totalBatched: 0,
    avgLatencyMs: 0,
    activeConnections: 0,
    topicSubscriptions: {} as Record<PushTopic, number>,
    messagesByType: {},
    messagesByPriority: {},
  };
  private latencySamples: number[] = [];

  // 发送回调
  private sendFn: (socketId: string, event: string, data: unknown) => void = () => {};

  constructor(batchConfig: Partial<BatchConfig> = {}) {
    this.batchConfig = { ...DEFAULT_BATCH_CONFIG, ...batchConfig };

    // 初始化主题
    const topics: PushTopic[] = [
      'notifications', 'price_alerts', 'market_events', 'news',
      'trade_execution', 'system', 'watchlist_updates', 'reports',
    ];
    topics.forEach(t => {
      this.topicSubscribers.set(t, new Set());
      this.stats.topicSubscriptions[t] = 0;
    });
  }

  /** 设置发送回调 */
  setSendFunction(fn: (socketId: string, event: string, data: unknown) => void): void {
    this.sendFn = fn;
  }

  /** 启动批量刷新定时器 */
  start(): void {
    if (this.batchConfig.enabled && !this.batchTimer) {
      this.batchTimer = setInterval(() => this.flushAllBatches(), this.batchConfig.flushIntervalMs);
    }
  }

  /** 停止 */
  stop(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  // ========== 连接管理 ==========

  /** 客户端连接 */
  addClient(socketId: string, userId: string, userAgent?: string): void {
    const conn: ClientConnection = {
      socketId,
      userId,
      subscribedTopics: new Set(['notifications']), // 默认订阅通用通知
      lastSeq: 0,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      userAgent,
    };
    this.clients.set(socketId, conn);

    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.userClients.get(userId)!.add(socketId);

    // 添加到默认主题
    this.topicSubscribers.get('notifications')!.add(socketId);
    this.stats.topicSubscriptions['notifications']++;

    this.updateStats();
  }

  /** 客户端断开 */
  removeClient(socketId: string): void {
    const conn = this.clients.get(socketId);
    if (!conn) return;

    // 从所有主题移除
    for (const topic of conn.subscribedTopics) {
      this.topicSubscribers.get(topic)?.delete(socketId);
      this.stats.topicSubscriptions[topic] = Math.max(0, this.stats.topicSubscriptions[topic] - 1);
    }

    // 从用户映射移除
    const userSockets = this.userClients.get(conn.userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) this.userClients.delete(conn.userId);
    }

    this.clients.delete(socketId);
    this.pendingBatch.delete(socketId);
    this.updateStats();
  }

  /** 订阅主题 */
  subscribeTopic(socketId: string, topic: PushTopic): boolean {
    const conn = this.clients.get(socketId);
    if (!conn) return false;

    if (!conn.subscribedTopics.has(topic)) {
      conn.subscribedTopics.add(topic);
      this.topicSubscribers.get(topic)?.add(socketId);
      this.stats.topicSubscriptions[topic]++;
      conn.lastActivityAt = Date.now();
    }
    return true;
  }

  /** 取消订阅主题 */
  unsubscribeTopic(socketId: string, topic: PushTopic): boolean {
    const conn = this.clients.get(socketId);
    if (!conn) return false;

    if (topic === 'notifications') return false; // 默认主题不可取消

    conn.subscribedTopics.delete(topic);
    this.topicSubscribers.get(topic)?.delete(socketId);
    this.stats.topicSubscriptions[topic] = Math.max(0, this.stats.topicSubscriptions[topic] - 1);
    conn.lastActivityAt = Date.now();
    return true;
  }

  // ========== 推送核心 ==========

  /** 推送通知 */
  push(notification: NotificationPayload): PushMessage {
    const topic = TYPE_TOPIC_MAP[notification.type] || 'notifications';
    const seq = ++this.seqCounter;

    const message: PushMessage = {
      id: `push_${seq}_${Date.now()}`,
      topic,
      type: notification.type,
      priority: notification.priority,
      payload: notification,
      timestamp: Date.now(),
      seq,
    };

    // 保存历史
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }

    // 发送到订阅者
    const subscribers = this.topicSubscribers.get(topic);
    if (subscribers) {
      for (const socketId of subscribers) {
        if (this.batchConfig.enabled) {
          this.addToBatch(socketId, message);
        } else {
          this.sendToSocket(socketId, message);
        }
      }
    }

    // 同时发送到通用通知订阅者（如果不同主题）
    if (topic !== 'notifications') {
      const generalSubs = this.topicSubscribers.get('notifications');
      if (generalSubs) {
        for (const socketId of generalSubs) {
          if (!subscribers?.has(socketId)) {
            if (this.batchConfig.enabled) {
              this.addToBatch(socketId, message);
            } else {
              this.sendToSocket(socketId, message);
            }
          }
        }
      }
    }

    // 更新统计
    this.stats.messagesByType[notification.type] = (this.stats.messagesByType[notification.type] || 0) + 1;
    this.stats.messagesByPriority[notification.priority] = (this.stats.messagesByPriority[notification.priority] || 0) + 1;

    return message;
  }

  /** 向指定用户推送 */
  pushToUser(userId: string, notification: NotificationPayload): number {
    const socketIds = this.userClients.get(userId);
    if (!socketIds || socketIds.size === 0) return 0;

    const topic = TYPE_TOPIC_MAP[notification.type] || 'notifications';
    const seq = ++this.seqCounter;

    const message: PushMessage = {
      id: `push_${seq}_${Date.now()}`,
      topic,
      type: notification.type,
      priority: notification.priority,
      payload: notification,
      timestamp: Date.now(),
      seq,
    };

    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }

    let sent = 0;
    for (const socketId of socketIds) {
      if (this.batchConfig.enabled) {
        this.addToBatch(socketId, message);
      } else {
        this.sendToSocket(socketId, message);
      }
      sent++;
    }

    this.stats.messagesByType[notification.type] = (this.stats.messagesByType[notification.type] || 0) + 1;
    this.stats.messagesByPriority[notification.priority] = (this.stats.messagesByPriority[notification.priority] || 0) + 1;

    return sent;
  }

  /** 断线重连同步 — 获取指定序列号之后的消息 */
  getMissedMessages(socketId: string, lastSeq: number): PushMessage[] {
    const conn = this.clients.get(socketId);
    if (!conn) return [];

    // 获取该客户端订阅主题相关的消息（包括notifications订阅者应收到的所有消息）
    const missed = this.messageHistory.filter(
      m => m.seq > lastSeq && (
        conn.subscribedTopics.has(m.topic) ||
        (conn.subscribedTopics.has('notifications'))
      )
    );

    conn.lastSeq = missed.length > 0 ? missed[missed.length - 1].seq : lastSeq;
    conn.lastActivityAt = Date.now();

    return missed;
  }

  /** 广播系统消息 */
  broadcast(type: NotificationType, title: string, body: string): void {
    const notification: NotificationPayload = {
      id: `broadcast_${Date.now()}`,
      type,
      priority: 'low',
      title,
      body,
      channels: ['websocket'],
      userId: '*',
      read: false,
      status: 'sent',
      createdAt: Date.now(),
    };
    this.push(notification);
  }

  // ========== 批量管理 ==========

  private addToBatch(socketId: string, message: PushMessage): void {
    if (!this.pendingBatch.has(socketId)) {
      this.pendingBatch.set(socketId, []);
    }
    const batch = this.pendingBatch.get(socketId)!;
    const batchId = `batch_${Date.now()}`;
    message.batchId = batchId;
    batch.push(message);

    // 达到最大批量大小立即刷新
    if (batch.length >= this.batchConfig.maxBatchSize) {
      this.flushBatch(socketId);
    }
  }

  private flushBatch(socketId: string): void {
    const batch = this.pendingBatch.get(socketId);
    if (!batch || batch.length === 0) return;

    this.pendingBatch.delete(socketId);

    // 按优先级排序
    const priorityOrder: Record<NotificationPriority, number> = {
      urgent: 0, high: 1, medium: 2, low: 3,
    };
    batch.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const batchData = {
      type: 'notification_batch',
      messages: batch,
      count: batch.length,
      timestamp: Date.now(),
    };

    const dataStr = JSON.stringify(batchData);
    const shouldCompress = dataStr.length > this.batchConfig.compressThreshold;

    this.sendFn(socketId, 'message', {
      type: 'notification_batch',
      data: shouldCompress ? this.compress(dataStr) : batchData,
      compressed: shouldCompress,
      timestamp: Date.now(),
    });

    this.stats.totalBatched += batch.length;
    this.stats.totalSent += batch.length;

    // 更新客户端序列号
    const conn = this.clients.get(socketId);
    if (conn) {
      conn.lastSeq = Math.max(conn.lastSeq, ...batch.map(m => m.seq));
    }
  }

  private flushAllBatches(): void {
    for (const socketId of this.pendingBatch.keys()) {
      this.flushBatch(socketId);
    }
  }

  /** 压缩（简单Base64编码模拟） */
  private compress(data: string): string {
    return Buffer.from(data).toString('base64');
  }

  /** 解压 */
  static decompress(data: string): string {
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  // ========== 直接发送 ==========

  private sendToSocket(socketId: string, message: PushMessage): void {
    try {
      this.sendFn(socketId, 'message', {
        type: 'notification',
        data: message,
        timestamp: Date.now(),
      });
      this.stats.totalSent++;

      // 延迟采样
      const latency = Date.now() - message.timestamp;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 100) this.latencySamples.shift();
      this.stats.avgLatencyMs = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

      // 更新客户端序列号
      const conn = this.clients.get(socketId);
      if (conn) conn.lastSeq = message.seq;
    } catch {
      this.stats.totalFailed++;
    }
  }

  // ========== 查询 ==========

  /** 获取连接信息 */
  getConnection(socketId: string): ClientConnection | undefined {
    return this.clients.get(socketId);
  }

  /** 获取用户的所有连接 */
  getUserConnections(userId: string): ClientConnection[] {
    const socketIds = this.userClients.get(userId);
    if (!socketIds) return [];
    return Array.from(socketIds)
      .map(id => this.clients.get(id))
      .filter((c): c is ClientConnection => !!c);
  }

  /** 获取主题订阅者数量 */
  getTopicSubscriberCount(topic: PushTopic): number {
    return this.topicSubscribers.get(topic)?.size || 0;
  }

  /** 获取统计 */
  getStats(): PushStats {
    this.updateStats();
    return { ...this.stats };
  }

  /** 获取在线用户数 */
  getOnlineUserCount(): number {
    return this.userClients.size;
  }

  /** 获取连接数 */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /** 重置 */
  clear(): void {
    this.stop();
    this.clients.clear();
    this.userClients.clear();
    this.topicSubscribers.forEach(s => s.clear());
    this.messageHistory = [];
    this.pendingBatch.clear();
    this.seqCounter = 0;
    this.latencySamples = [];
    this.stats = {
      totalSent: 0,
      totalFailed: 0,
      totalBatched: 0,
      avgLatencyMs: 0,
      activeConnections: 0,
      topicSubscriptions: {} as Record<PushTopic, number>,
      messagesByType: {},
      messagesByPriority: {},
    };
    const topics: PushTopic[] = [
      'notifications', 'price_alerts', 'market_events', 'news',
      'trade_execution', 'system', 'watchlist_updates', 'reports',
    ];
    topics.forEach(t => {
      this.topicSubscribers.set(t, new Set());
      this.stats.topicSubscriptions[t] = 0;
    });
  }

  private updateStats(): void {
    this.stats.activeConnections = this.clients.size;
  }
}

export const wsPushEngine = new WSPushEngine();
