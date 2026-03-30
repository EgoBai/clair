/**
 * 通知系统深度测试
 * 覆盖通知类型、模板渲染、优先级排序、批量发送、渠道分发
 */

import { describe, it, expect } from 'vitest';

type NotificationType = 'price_alert' | 'news' | 'system' | 'trade' | 'report';
type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
type NotificationChannel = 'push' | 'email' | 'sms' | 'websocket';

interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
  userId: string;
  read: boolean;
  createdAt: number;
  expiresAt?: number;
}

interface NotificationTemplate {
  type: NotificationType;
  titleTemplate: string;
  bodyTemplate: string;
  defaultChannels: NotificationChannel[];
  defaultPriority: NotificationPriority;
}

// 渲染模板
function renderTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return data[key] !== undefined ? String(data[key]) : `{{${key}}}`;
  });
}

// 创建通知
function createNotification(
  template: NotificationTemplate,
  userId: string,
  data: Record<string, any>,
  overrides?: Partial<Notification>
): Notification {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: template.type,
    priority: overrides?.priority || template.defaultPriority,
    title: renderTemplate(template.titleTemplate, data),
    body: renderTemplate(template.bodyTemplate, data),
    data,
    channels: overrides?.channels || template.defaultChannels,
    userId,
    read: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

// 优先级权重
function getPriorityWeight(priority: NotificationPriority): number {
  switch (priority) {
    case 'urgent': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
  }
}

// 按优先级排序
function sortByPriority(notifications: Notification[]): Notification[] {
  return [...notifications].sort((a, b) => getPriorityWeight(b.priority) - getPriorityWeight(a.priority) || b.createdAt - a.createdAt);
}

// 过滤有效通知
function filterActiveNotifications(notifications: Notification[]): Notification[] {
  const now = Date.now();
  return notifications.filter(n => !n.expiresAt || n.expiresAt > now);
}

// 按渠道分组
function groupByChannel(notifications: Notification[]): Map<NotificationChannel, Notification[]> {
  const groups = new Map<NotificationChannel, Notification[]>();
  for (const n of notifications) {
    for (const ch of n.channels) {
      const existing = groups.get(ch) || [];
      existing.push(n);
      groups.set(ch, existing);
    }
  }
  return groups;
}

// 统计未读
function countUnread(notifications: Notification[]): number {
  return notifications.filter(n => !n.read).length;
}

// 标记全部已读
function markAllRead(notifications: Notification[]): Notification[] {
  return notifications.map(n => ({ ...n, read: true }));
}

// 验证通知
function validateNotification(n: Partial<Notification>): string[] {
  const errors: string[] = [];
  if (!n.userId) errors.push('用户ID不能为空');
  if (!n.title) errors.push('标题不能为空');
  if (!n.body) errors.push('内容不能为空');
  if (!n.type) errors.push('类型不能为空');
  if (!n.channels?.length) errors.push('至少需要一个通知渠道');
  if (n.expiresAt && n.createdAt && n.expiresAt <= n.createdAt) errors.push('过期时间必须晚于创建时间');
  return errors;
}

// 渠道可行性检查
function canSendViaChannel(channel: NotificationChannel, config: { pushEnabled: boolean; emailVerified: boolean; smsVerified: boolean; wsConnected: boolean }): boolean {
  switch (channel) {
    case 'push': return config.pushEnabled;
    case 'email': return config.emailVerified;
    case 'sms': return config.smsVerified;
    case 'websocket': return config.wsConnected;
  }
}

// 批量通知去重
function deduplicateNotifications(notifications: Notification[], windowMs: number = 60000): Notification[] {
  const seen = new Map<string, Notification>();
  for (const n of notifications) {
    const key = `${n.userId}_${n.type}_${n.title}`;
    const existing = seen.get(key);
    if (!existing || n.createdAt > existing.createdAt) {
      if (!existing || n.createdAt - existing.createdAt > windowMs) {
        seen.set(key, n);
      }
    }
  }
  return Array.from(seen.values());
}

// 摘要生成
function generateDigest(notifications: Notification[]): { total: number; unread: number; byType: Map<NotificationType, number>; byPriority: Map<NotificationPriority, number> } {
  const byType = new Map<NotificationType, number>();
  const byPriority = new Map<NotificationPriority, number>();
  let unread = 0;

  for (const n of notifications) {
    if (!n.read) unread++;
    byType.set(n.type, (byType.get(n.type) || 0) + 1);
    byPriority.set(n.priority, (byPriority.get(n.priority) || 0) + 1);
  }

  return { total: notifications.length, unread, byType, byPriority };
}

// 模板数据
const priceAlertTemplate: NotificationTemplate = {
  type: 'price_alert',
  titleTemplate: '{{stockName}} 价格提醒',
  bodyTemplate: '{{stockName}}({{symbol}}) 当前价格 {{price}} 元，{{direction}} {{threshold}}%',
  defaultChannels: ['push', 'websocket'],
  defaultPriority: 'high',
};

// ==================== 模板渲染 ====================

describe('renderTemplate 模板渲染', () => {
  it('应替换所有变量', () => {
    expect(renderTemplate('{{name}} 价格 {{price}}', { name: '茅台', price: 1800 })).toBe('茅台 价格 1800');
  });

  it('缺失变量应保留占位符', () => {
    expect(renderTemplate('{{name}} {{missing}}', { name: 'A' })).toBe('A {{missing}}');
  });

  it('无变量模板应原样返回', () => {
    expect(renderTemplate('静态文本', {})).toBe('静态文本');
  });

  it('数值应自动转字符串', () => {
    expect(renderTemplate('{{val}}', { val: 123 })).toBe('123');
  });
});

// ==================== 创建通知 ====================

describe('createNotification 创建通知', () => {
  it('应根据模板生成通知', () => {
    const n = createNotification(priceAlertTemplate, 'user1', {
      stockName: '贵州茅台', symbol: '600519', price: 1800, direction: '上涨', threshold: 5,
    });
    expect(n.title).toBe('贵州茅台 价格提醒');
    expect(n.body).toContain('1800');
    expect(n.read).toBe(false);
  });

  it('应使用默认渠道', () => {
    const n = createNotification(priceAlertTemplate, 'user1', {});
    expect(n.channels).toEqual(['push', 'websocket']);
  });

  it('应支持覆写优先级', () => {
    const n = createNotification(priceAlertTemplate, 'user1', {}, { priority: 'urgent' });
    expect(n.priority).toBe('urgent');
  });

  it('应生成唯一ID', () => {
    const n1 = createNotification(priceAlertTemplate, 'user1', {});
    const n2 = createNotification(priceAlertTemplate, 'user1', {});
    expect(n1.id).not.toBe(n2.id);
  });
});

// ==================== 优先级排序 ====================

describe('sortByPriority 优先级排序', () => {
  const now = Date.now();
  const notifications: Notification[] = [
    { id: '1', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: now },
    { id: '2', type: 'system', priority: 'urgent', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: now },
    { id: '3', type: 'system', priority: 'medium', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: now },
    { id: '4', type: 'system', priority: 'high', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: now },
  ];

  it('应按优先级降序排列', () => {
    const sorted = sortByPriority(notifications);
    expect(sorted[0].priority).toBe('urgent');
    expect(sorted[1].priority).toBe('high');
    expect(sorted[2].priority).toBe('medium');
    expect(sorted[3].priority).toBe('low');
  });

  it('相同优先级应按时间降序', () => {
    const samePriority: Notification[] = [
      { ...notifications[0], createdAt: 1 },
      { ...notifications[0], id: 'x', createdAt: 3 },
      { ...notifications[0], id: 'y', createdAt: 2 },
    ];
    const sorted = sortByPriority(samePriority);
    expect(sorted[0].createdAt).toBe(3);
  });
});

// ==================== 过滤有效通知 ====================

describe('filterActiveNotifications 有效通知', () => {
  it('未过期通知应保留', () => {
    const notifications: Notification[] = [
      { id: '1', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 1000, expiresAt: Date.now() + 999999 },
    ];
    expect(filterActiveNotifications(notifications)).toHaveLength(1);
  });

  it('已过期通知应被过滤', () => {
    const notifications: Notification[] = [
      { id: '1', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 1000, expiresAt: 1000 },
    ];
    expect(filterActiveNotifications(notifications)).toHaveLength(0);
  });

  it('无过期时间的通知应保留', () => {
    const notifications: Notification[] = [
      { id: '1', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 1000 },
    ];
    expect(filterActiveNotifications(notifications)).toHaveLength(1);
  });
});

// ==================== 渠道分组 ====================

describe('groupByChannel 渠道分组', () => {
  it('应按渠道分组', () => {
    const notifications: Notification[] = [
      { id: '1', type: 'system', priority: 'low', title: '', body: '', channels: ['push', 'email'], userId: 'u1', read: false, createdAt: 0 },
      { id: '2', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 0 },
    ];
    const groups = groupByChannel(notifications);
    expect(groups.get('push')).toHaveLength(2);
    expect(groups.get('email')).toHaveLength(1);
  });
});

// ==================== 未读统计 ====================

describe('countUnread 未读统计', () => {
  it('应正确统计未读数', () => {
    const notifications: Notification[] = [
      { id: '1', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 0 },
      { id: '2', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: true, createdAt: 0 },
      { id: '3', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 0 },
    ];
    expect(countUnread(notifications)).toBe(2);
  });
});

// ==================== 全部已读 ====================

describe('markAllRead 全部已读', () => {
  it('应标记所有为已读', () => {
    const notifications: Notification[] = [
      { id: '1', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 0 },
      { id: '2', type: 'system', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 0 },
    ];
    const result = markAllRead(notifications);
    expect(result.every(n => n.read)).toBe(true);
  });
});

// ==================== 通知验证 ====================

describe('validateNotification 通知验证', () => {
  it('完整通知应通过', () => {
    const n: Notification = { id: '1', type: 'system', priority: 'low', title: '测试', body: '内容', channels: ['push'], userId: 'u1', read: false, createdAt: 0 };
    expect(validateNotification(n)).toHaveLength(0);
  });

  it('缺少userId应报错', () => {
    expect(validateNotification({ title: 't', body: 'b', type: 'system', channels: ['push'] })).toContain('用户ID不能为空');
  });

  it('缺少标题应报错', () => {
    expect(validateNotification({ userId: 'u1', body: 'b', type: 'system', channels: ['push'] })).toContain('标题不能为空');
  });

  it('缺少渠道应报错', () => {
    expect(validateNotification({ userId: 'u1', title: 't', body: 'b', type: 'system', channels: [] })).toContain('至少需要一个通知渠道');
  });
});

// ==================== 渠道可行性 ====================

describe('canSendViaChannel 渠道可行性', () => {
  it('push启用应可发送', () => {
    expect(canSendViaChannel('push', { pushEnabled: true, emailVerified: false, smsVerified: false, wsConnected: false })).toBe(true);
  });

  it('push禁用应不可发送', () => {
    expect(canSendViaChannel('push', { pushEnabled: false, emailVerified: false, smsVerified: false, wsConnected: false })).toBe(false);
  });

  it('email需验证', () => {
    expect(canSendViaChannel('email', { pushEnabled: false, emailVerified: true, smsVerified: false, wsConnected: false })).toBe(true);
  });

  it('sms需验证', () => {
    expect(canSendViaChannel('sms', { pushEnabled: false, emailVerified: false, smsVerified: true, wsConnected: false })).toBe(true);
  });

  it('websocket需连接', () => {
    expect(canSendViaChannel('websocket', { pushEnabled: false, emailVerified: false, smsVerified: false, wsConnected: true })).toBe(true);
  });
});

// ==================== 摘要生成 ====================

describe('generateDigest 通知摘要', () => {
  it('应正确统计总数', () => {
    const notifications: Notification[] = [
      { id: '1', type: 'price_alert', priority: 'high', title: '', body: '', channels: ['push'], userId: 'u1', read: false, createdAt: 0 },
      { id: '2', type: 'news', priority: 'low', title: '', body: '', channels: ['push'], userId: 'u1', read: true, createdAt: 0 },
    ];
    const digest = generateDigest(notifications);
    expect(digest.total).toBe(2);
    expect(digest.unread).toBe(1);
    expect(digest.byType.get('price_alert')).toBe(1);
  });
});
