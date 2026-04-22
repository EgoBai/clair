/**
 * 增强版 WebSocket 通知推送 Hook
 * 支持：主题订阅、断线重连同步、离线队列、去重、优先级排序
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import logger from '../utils/logger';

/** 通知类型 */
export type NotificationType =
  | 'price_alert' | 'news' | 'system' | 'trade' | 'report'
  | 'watchlist_update' | 'limit_up' | 'limit_down' | 'volume_surge';

/** 推送主题 */
export type PushTopic =
  | 'notifications' | 'price_alerts' | 'market_events' | 'news'
  | 'trade_execution' | 'system' | 'watchlist_updates' | 'reports';

/** 通知优先级 */
export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

/** 推送消息 */
export interface PushMessage {
  id: string;
  topic: PushTopic;
  type: NotificationType;
  priority: NotificationPriority;
  payload: {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channels: string[];
    userId: string;
    read: boolean;
    status: string;
    createdAt: number;
    icon?: string;
    actionUrl?: string;
  };
  timestamp: number;
  seq: number;
  batchId?: string;
}

/** 连接状态 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/** Hook 配置 */
export interface WSNotificationConfig {
  url: string;
  userId: string;
  topics?: PushTopic[];
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  offlineBufferSize?: number;
  onNotification?: (message: PushMessage) => void;
  onBatch?: (messages: PushMessage[]) => void;
}

/** Hook 返回值 */
export interface WSNotificationReturn {
  status: ConnectionStatus;
  notifications: PushMessage[];
  unreadCount: number;
  stats: {
    received: number;
    missed: number;
    reconnected: number;
    avgLatencyMs: number;
  };
  connect: () => void;
  disconnect: () => void;
  subscribe: (topic: PushTopic) => void;
  unsubscribe: (topic: PushTopic) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
  getNotificationsByTopic: (topic: PushTopic) => PushMessage[];
  getNotificationsByType: (type: NotificationType) => PushMessage[];
}

/** 去重窗口 (ms) */
const DEDUP_WINDOW = 5000;

/**
 * WebSocket 通知推送 Hook
 */
export function useWSNotification(config: WSNotificationConfig): WSNotificationReturn {
  const {
    url,
    userId,
    topics = ['notifications'],
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    offlineBufferSize = 200,
    onNotification,
    onBatch,
  } = config;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [notifications, setNotifications] = useState<PushMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeqRef = useRef(0);
  const offlineQueueRef = useRef<PushMessage[]>([]);
  const dedupSetRef = useRef<Set<string>>(new Set());
  const subscribedTopicsRef = useRef<Set<PushTopic>>(new Set(topics));
  const statsRef = useRef({ received: 0, missed: 0, reconnected: 0, totalLatency: 0 });
  const readIdsRef = useRef<Set<string>>(new Set());

  // 初始化订阅主题
  useEffect(() => {
    subscribedTopicsRef.current = new Set(topics);
  }, [topics.join(',')]);

  /** 去重检查 */
  const isDuplicate = useCallback((msg: PushMessage): boolean => {
    const key = `${msg.id}_${msg.seq}`;
    if (dedupSetRef.current.has(key)) return true;
    dedupSetRef.current.add(key);

    // 定期清理去重集合
    setTimeout(() => dedupSetRef.current.delete(key), DEDUP_WINDOW);
    return false;
  }, []);

  /** 处理单条消息 */
  const handleMessage = useCallback((msg: PushMessage) => {
    if (isDuplicate(msg)) return;

    statsRef.current.received++;
    statsRef.current.totalLatency += Date.now() - msg.timestamp;
    lastSeqRef.current = Math.max(lastSeqRef.current, msg.seq);

    setNotifications(prev => {
      const next = [msg, ...prev];
      return next.length > offlineBufferSize ? next.slice(0, offlineBufferSize) : next;
    });

    onNotification?.(msg);
  }, [isDuplicate, offlineBufferSize, onNotification]);

  /** 处理批量消息 */
  const handleBatch = useCallback((messages: PushMessage[]) => {
    const unique = messages.filter(m => !isDuplicate(m));
    if (unique.length === 0) return;

    const lastMsg = unique[unique.length - 1];
    statsRef.current.received += unique.length;
    lastSeqRef.current = Math.max(lastSeqRef.current, lastMsg.seq);

    setNotifications(prev => {
      const next = [...unique, ...prev];
      return next.length > offlineBufferSize ? next.slice(0, offlineBufferSize) : next;
    });

    onBatch?.(unique);
  }, [isDuplicate, offlineBufferSize, onBatch]);

  /** 连接 */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus(reconnectCountRef.current > 0 ? 'reconnecting' : 'connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        reconnectCountRef.current = 0;

        // 订阅主题
        for (const topic of subscribedTopicsRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe_topic', topic, userId }));
        }

        // 请求错过的消息
        if (lastSeqRef.current > 0) {
          ws.send(JSON.stringify({
            type: 'sync_missed',
            lastSeq: lastSeqRef.current,
            userId,
          }));
          statsRef.current.reconnected++;
        }

        // 发送离线队列
        while (offlineQueueRef.current.length > 0) {
          const msg = offlineQueueRef.current.shift()!;
          handleMessage(msg);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'notification') {
            handleMessage(data.data as PushMessage);
          } else if (data.type === 'notification_batch') {
            let batchData = data.data;
            if (data.compressed && typeof batchData === 'string') {
              batchData = JSON.parse(atob(batchData));
            }
            handleBatch(batchData.messages as PushMessage[]);
          } else if (data.type === 'sync_response') {
            const missed = data.messages as PushMessage[];
            statsRef.current.missed += missed.length;
            handleBatch(missed);
          }
        } catch (e) {
          logger.error('[WS Notification] 消息解析失败:', e);
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;

        if (autoReconnect && reconnectCountRef.current < maxReconnectAttempts) {
          reconnectCountRef.current++;
          const delay = reconnectInterval * Math.min(reconnectCountRef.current, 5);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      logger.error('[WS Notification] 连接失败:', e);
      setStatus('disconnected');
    }
  }, [url, userId, autoReconnect, reconnectInterval, maxReconnectAttempts, handleMessage, handleBatch]);

  /** 断开 */
  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectCountRef.current = maxReconnectAttempts; // 阻止重连
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, [maxReconnectAttempts]);

  /** 订阅主题 */
  const subscribe = useCallback((topic: PushTopic) => {
    subscribedTopicsRef.current.add(topic);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe_topic', topic, userId }));
    }
  }, [userId]);

  /** 取消订阅主题 */
  const unsubscribe = useCallback((topic: PushTopic) => {
    if (topic === 'notifications') return; // 默认不可取消
    subscribedTopicsRef.current.delete(topic);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe_topic', topic, userId }));
    }
  }, [userId]);

  /** 标记已读 */
  const markRead = useCallback((id: string) => {
    readIdsRef.current.add(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, payload: { ...n.payload, read: true } } : n)
    );
  }, []);

  /** 全部标记已读 */
  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      prev.forEach(n => readIdsRef.current.add(n.id));
      return prev.map(n => ({ ...n, payload: { ...n.payload, read: true } }));
    });
  }, []);

  /** 清空通知 */
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    readIdsRef.current.clear();
  }, []);

  /** 按主题筛选 */
  const getNotificationsByTopic = useCallback((topic: PushTopic) => {
    return notifications.filter(n => n.topic === topic);
  }, [notifications]);

  /** 按类型筛选 */
  const getNotificationsByType = useCallback((type: NotificationType) => {
    return notifications.filter(n => n.type === type);
  }, [notifications]);

  /** 未读数 */
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.payload.read).length;
  }, [notifications]);

  /** 统计 */
  const stats = useMemo(() => {
    const s = statsRef.current;
    return {
      received: s.received,
      missed: s.missed,
      reconnected: s.reconnected,
      avgLatencyMs: s.received > 0 ? s.totalLatency / s.received : 0,
    };
  }, [notifications.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动连接
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status,
    notifications,
    unreadCount,
    stats,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    markRead,
    markAllRead,
    clearNotifications,
    getNotificationsByTopic,
    getNotificationsByType,
  };
}

/**
 * 离线消息缓冲队列
 * 网络断开时缓存消息，重连后按优先级排序投递
 */
export class OfflineMessageQueue {
  private queue: PushMessage[] = [];
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  enqueue(message: PushMessage): void {
    this.queue.push(message);
    if (this.queue.length > this.maxSize) {
      // 超出容量，丢弃最低优先级的旧消息
      this.queue.sort((a, b) => {
        const po = { urgent: 0, high: 1, medium: 2, low: 3 };
        return po[a.priority] - po[b.priority] || b.timestamp - a.timestamp;
      });
      this.queue = this.queue.slice(0, this.maxSize);
    }
  }

  dequeue(): PushMessage[] {
    // 按优先级排序返回
    const po = { urgent: 0, high: 1, medium: 2, low: 3 };
    this.queue.sort((a, b) => po[a.priority] - po[b.priority] || a.timestamp - b.timestamp);
    const result = [...this.queue];
    this.queue = [];
    return result;
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}

/**
 * 消息去重器
 * 检测短时间内重复的消息
 */
export class MessageDeduplicator {
  private seen: Map<string, number> = new Map();
  private windowMs: number;

  constructor(windowMs = 5000) {
    this.windowMs = windowMs;
  }

  isDuplicate(message: PushMessage): boolean {
    const key = `${message.id}_${message.seq}`;
    const now = Date.now();

    // 清理过期条目
    for (const [k, ts] of this.seen) {
      if (now - ts > this.windowMs) this.seen.delete(k);
    }

    if (this.seen.has(key)) return true;
    this.seen.set(key, now);
    return false;
  }

  clear(): void {
    this.seen.clear();
  }

  size(): number {
    return this.seen.size;
  }
}
