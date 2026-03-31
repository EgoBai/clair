/**
 * Trade Signal Notification Engine
 *
 * 交易信号检测、通知模板、优先级队列、去重
 */

export type SignalType = 'buy' | 'sell' | 'hold' | 'alert' | 'warning';
export type SignalSource = 'technical' | 'fundamental' | 'ai' | 'manual' | 'system';
export type NotificationChannel = 'push' | 'email' | 'sms' | 'inApp' | 'webhook';
export type NotificationPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface TradeSignal {
  id: string;
  symbol: string;
  type: SignalType;
  source: SignalSource;
  confidence: number; // 0-1
  price: number;
  targetPrice?: number;
  stopLoss?: number;
  message: string;
  timestamp: number;
  expiresAt: number;
  tags: string[];
}

export interface NotificationRule {
  id: string;
  name: string;
  signalTypes: SignalType[];
  sources: SignalSource[];
  minConfidence: number;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  cooldownMs: number;
  quietHours?: { start: number; end: number };
  symbols?: string[];
}

export interface Notification {
  id: string;
  signal: TradeSignal;
  rule: NotificationRule;
  channel: NotificationChannel;
  priority: NotificationPriority;
  createdAt: number;
  sentAt: number | null;
  read: boolean;
  dismissed: boolean;
}

export interface NotificationTemplate {
  title: string;
  body: string;
  action?: string;
  icon?: string;
}

/**
 * 信号去重
 */
export function deduplicateSignals(
  signals: TradeSignal[],
  windowMs: number = 300000 // 5 min
): TradeSignal[] {
  const seen = new Map<string, TradeSignal>();

  for (const sig of signals) {
    const key = `${sig.symbol}:${sig.type}:${sig.source}`;
    const existing = seen.get(key);

    if (!existing || sig.timestamp - existing.timestamp > windowMs) {
      seen.set(key, sig);
    } else if (sig.confidence > existing.confidence) {
      seen.set(key, sig);
    }
  }

  return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 匹配通知规则
 */
export function matchSignalToRules(
  signal: TradeSignal,
  rules: NotificationRule[],
  lastSentMap: Map<string, number> = new Map()
): NotificationRule[] {
  const matched: NotificationRule[] = [];

  for (const rule of rules) {
    // Type filter
    if (rule.signalTypes.length > 0 && !rule.signalTypes.includes(signal.type)) continue;

    // Source filter
    if (rule.sources.length > 0 && !rule.sources.includes(signal.source)) continue;

    // Confidence filter
    if (signal.confidence < rule.minConfidence) continue;

    // Symbol filter
    if (rule.symbols && rule.symbols.length > 0 && !rule.symbols.includes(signal.symbol)) continue;

    // Cooldown
    const lastSent = lastSentMap.get(`${rule.id}:${signal.symbol}`) || 0;
    if (Date.now() - lastSent < rule.cooldownMs) continue;

    // Quiet hours
    if (rule.quietHours) {
      const hour = new Date().getHours();
      if (hour >= rule.quietHours.start && hour < rule.quietHours.end) continue;
    }

    matched.push(rule);
  }

  return matched;
}

/**
 * 生成通知
 */
export function generateNotifications(
  signal: TradeSignal,
  rules: NotificationRule[],
  lastSentMap: Map<string, number> = new Map()
): Notification[] {
  const matchedRules = matchSignalToRules(signal, rules, lastSentMap);

  return matchedRules.map(rule => ({
    id: `notif-${signal.id}-${rule.id}-${Date.now()}`,
    signal,
    rule,
    channel: rule.channels[0] || 'inApp',
    priority: rule.priority,
    createdAt: Date.now(),
    sentAt: null,
    read: false,
    dismissed: false,
  }));
}

/**
 * 渲染通知模板
 */
export function renderNotificationTemplate(
  signal: TradeSignal,
  template?: Partial<NotificationTemplate>
): NotificationTemplate {
  const typeEmoji: Record<SignalType, string> = {
    buy: '🟢',
    sell: '🔴',
    hold: '⚪',
    alert: '🔔',
    warning: '⚠️',
  };

  const typeAction: Record<SignalType, string> = {
    buy: '建议买入',
    sell: '建议卖出',
    hold: '建议持有',
    alert: '关注提醒',
    warning: '风险警告',
  };

  const emoji = template?.icon || typeEmoji[signal.type];
  const action = template?.action || typeAction[signal.type];

  let priceStr = `当前价: ¥${signal.price}`;
  if (signal.targetPrice) priceStr += ` | 目标: ¥${signal.targetPrice}`;
  if (signal.stopLoss) priceStr += ` | 止损: ¥${signal.stopLoss}`;

  return {
    title: template?.title || `${emoji} ${signal.symbol} ${action}`,
    body: template?.body || `${signal.message}\n${priceStr}\n置信度: ${Math.round(signal.confidence * 100)}%`,
  };
}

/**
 * 信号优先级排序
 */
export function prioritizeSignals(signals: TradeSignal[]): TradeSignal[] {
  const priorityWeight: Record<SignalType, number> = {
    warning: 5,
    alert: 4,
    sell: 3,
    buy: 2,
    hold: 1,
  };

  return [...signals].sort((a, b) => {
    const priorityA = priorityWeight[a.type] * a.confidence;
    const priorityB = priorityWeight[b.type] * b.confidence;
    if (priorityA !== priorityB) return priorityB - priorityA;
    return b.timestamp - a.timestamp;
  });
}

/**
 * 过期信号过滤
 */
export function filterExpiredSignals(signals: TradeSignal[]): TradeSignal[] {
  const now = Date.now();
  return signals.filter(s => s.expiresAt > now);
}

/**
 * 通知统计
 */
export interface NotificationStats {
  total: number;
  sent: number;
  pending: number;
  byChannel: Record<NotificationChannel, number>;
  byPriority: Record<NotificationPriority, number>;
  avgResponseTime: number;
}

export function computeNotificationStats(notifications: Notification[]): NotificationStats {
  const byChannel: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let sent = 0;
  let responseTimeSum = 0;
  let responseTimeCount = 0;

  for (const n of notifications) {
    byChannel[n.channel] = (byChannel[n.channel] || 0) + 1;
    byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;

    if (n.sentAt) {
      sent++;
      responseTimeSum += n.sentAt - n.createdAt;
      responseTimeCount++;
    }
  }

  return {
    total: notifications.length,
    sent,
    pending: notifications.length - sent,
    byChannel: byChannel as Record<NotificationChannel, number>,
    byPriority: byPriority as Record<NotificationPriority, number>,
    avgResponseTime: responseTimeCount > 0 ? responseTimeSum / responseTimeCount : 0,
  };
}
