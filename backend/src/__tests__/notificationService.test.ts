/**
 * 通知系统 - 核心服务测试
 * Round 124
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '../services/notification/service';
import { TemplateManager, DEFAULT_TEMPLATES } from '../services/notification/templates';
import {
  ChannelManager,
  WebSocketChannelHandler,
  EmailChannelHandler,
  InAppChannelHandler,
  PushChannelHandler,
  SmsChannelHandler,
} from '../services/notification/channels';
import { createNotificationSystem } from '../services/notification';
import type { NotificationPayload, NotificationType, NotificationChannel } from '../services/notification/types';

describe('通知系统 - 模板管理', () => {
  let tm: TemplateManager;

  beforeEach(() => {
    tm = new TemplateManager();
  });

  it('应加载默认模板', () => {
    const templates = tm.getAllTemplates();
    expect(templates.length).toBe(DEFAULT_TEMPLATES.length);
    expect(templates.some(t => t.id === 'price_alert_above')).toBe(true);
    expect(templates.some(t => t.id === 'limit_up')).toBe(true);
  });

  it('应按ID获取模板', () => {
    const t = tm.getTemplate('price_alert_above');
    expect(t).toBeDefined();
    expect(t!.type).toBe('price_alert');
    expect(t!.defaultPriority).toBe('high');
  });

  it('应按类型获取模板', () => {
    const t = tm.getTemplateByType('limit_up');
    expect(t).toBeDefined();
    expect(t!.id).toBe('limit_up');
  });

  it('应渲染模板变量', () => {
    const result = tm.renderTemplate('你好 {{name}}，价格 {{price}}', { name: '茅台', price: 1800 });
    expect(result).toBe('你好 茅台，价格 1800');
  });

  it('应处理缺失变量', () => {
    const result = tm.renderTemplate('{{name}} - {{missing}}', { name: 'test' });
    expect(result).toBe('test - ');
  });

  it('应渲染完整通知', () => {
    const result = tm.renderNotification('price_alert_above', {
      name: '贵州茅台',
      symbol: '600519',
      price: 1850,
      targetPrice: 1800,
      changePercent: 2.78,
    });
    expect(result).not.toBeNull();
    expect(result!.title).toContain('贵州茅台');
    expect(result!.title).toContain('600519');
    expect(result!.body).toContain('1850');
    expect(result!.actionUrl).toBe('/stock/600519');
  });

  it('应返回null当模板被禁用', () => {
    tm.toggleTemplate('price_alert_above', false);
    const result = tm.renderNotification('price_alert_above', { name: 'test' });
    expect(result).toBeNull();
  });

  it('应添加自定义模板', () => {
    tm.addTemplate({
      id: 'custom_test',
      type: 'system',
      titleTemplate: '测试: {{msg}}',
      bodyTemplate: '{{detail}}',
      defaultChannels: ['in_app'],
      defaultPriority: 'medium',
      enabled: true,
    });
    const t = tm.getTemplate('custom_test');
    expect(t).toBeDefined();
    expect(t!.titleTemplate).toBe('测试: {{msg}}');
  });

  it('应更新模板', () => {
    const ok = tm.updateTemplate('price_alert_above', { defaultPriority: 'urgent' });
    expect(ok).toBe(true);
    expect(tm.getTemplate('price_alert_above')!.defaultPriority).toBe('urgent');
  });

  it('应删除模板', () => {
    expect(tm.deleteTemplate('price_alert_above')).toBe(true);
    expect(tm.getTemplate('price_alert_above')).toBeUndefined();
  });

  it('应切换模板启用状态', () => {
    tm.toggleTemplate('limit_up', false);
    expect(tm.getTemplate('limit_up')!.enabled).toBe(false);
    tm.toggleTemplate('limit_up', true);
    expect(tm.getTemplate('limit_up')!.enabled).toBe(true);
  });

  it('应处理HTML转义字符', () => {
    const result = tm.renderTemplate('<b>{{html}}</b>', { html: '<script>alert(1)</script>' });
    expect(result).toBe('<b><script>alert(1)</script></b>');
  });

  it('应正确渲染所有预定义模板', () => {
    const data: Record<string, unknown> = {
      name: '测试股票',
      symbol: '000001',
      price: 10.5,
      targetPrice: 11,
      changePercent: 5.0,
      turnover: 1000000,
      volume: 500000,
      volumeRatio: 3.5,
      title: '重大新闻',
      summary: '公司发布利好消息',
      newsId: '12345',
      message: '系统维护通知',
      action: '买入',
      totalAmount: 10500,
      date: '2024-01-15',
      changeDescription: '大股东增持',
    };

    for (const template of tm.getAllTemplates()) {
      const result = tm.renderNotification(template.id, data);
      expect(result, `Template ${template.id} should render`).not.toBeNull();
      expect(result!.title.length, `Template ${template.id} title`).toBeGreaterThan(0);
      expect(result!.body.length, `Template ${template.id} body`).toBeGreaterThan(0);
    }
  });
});

describe('通知系统 - 核心服务', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  it('应创建基本通知', () => {
    const n = service.createNotification('user1', 'price_alert', '测试', '内容');
    expect(n).not.toBeNull();
    expect(n!.id).toMatch(/^notif_/);
    expect(n!.userId).toBe('user1');
    expect(n!.type).toBe('price_alert');
    expect(n!.read).toBe(false);
    expect(n!.status).toBe('pending');
  });

  it('应应用优先级', () => {
    const n = service.createNotification('user1', 'system', '紧急', '内容', { priority: 'urgent' });
    expect(n!.priority).toBe('urgent');
  });

  it('应应用过期时间', () => {
    const n = service.createNotification('user1', 'system', '测试', '内容', { expiresInSeconds: 3600 });
    expect(n!.expiresAt).toBeDefined();
    expect(n!.expiresAt! - Date.now()).toBeGreaterThan(3500000);
  });

  it('应获取用户通知列表', () => {
    service.createNotification('user1', 'system', '通知1', '内容1');
    service.createNotification('user1', 'system', '通知2', '内容2');
    service.createNotification('user2', 'system', '其他用户', '内容');

    const list = service.getUserNotifications('user1');
    expect(list.length).toBe(2);
    expect(list.every(n => n.userId === 'user1')).toBe(true);
  });

  it('应按时间倒序排列通知', async () => {
    service.createNotification('user1', 'system', 'A', 'a');
    await new Promise(r => setTimeout(r, 10));
    service.createNotification('user1', 'system', 'B', 'b');
    await new Promise(r => setTimeout(r, 10));
    service.createNotification('user1', 'system', 'C', 'c');

    const list = service.getUserNotifications('user1');
    expect(list[0].title).toBe('C');
    expect(list[2].title).toBe('A');
  });

  it('应过滤未读通知', () => {
    const n1 = service.createNotification('user1', 'system', 'N1', 'b1')!;
    service.createNotification('user1', 'system', 'N2', 'b2');
    service.markAsRead(n1.id);

    const unread = service.getUserNotifications('user1', { unreadOnly: true });
    expect(unread.length).toBe(1);
    expect(unread[0].title).toBe('N2');
  });

  it('应按类型过滤通知', () => {
    service.createNotification('user1', 'price_alert', '预警', '内容');
    service.createNotification('user1', 'system', '系统', '内容');

    const alerts = service.getUserNotifications('user1', { type: 'price_alert' });
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe('price_alert');
  });

  it('应按优先级过滤通知', () => {
    service.createNotification('user1', 'system', '低', '内容', { priority: 'low' });
    service.createNotification('user1', 'system', '高', '内容', { priority: 'high' });

    const high = service.getUserNotifications('user1', { priority: 'high' });
    expect(high.length).toBe(1);
    expect(high[0].priority).toBe('high');
  });

  it('应分页获取通知', () => {
    for (let i = 0; i < 10; i++) {
      service.createNotification('user1', 'system', `通知${i}`, '内容');
    }

    const page1 = service.getUserNotifications('user1', { limit: 3, offset: 0 });
    const page2 = service.getUserNotifications('user1', { limit: 3, offset: 3 });

    expect(page1.length).toBe(3);
    expect(page2.length).toBe(3);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it('应按优先级排序', () => {
    service.createNotification('user1', 'system', '低', '', { priority: 'low' });
    service.createNotification('user1', 'system', '紧急', '', { priority: 'urgent' });
    service.createNotification('user1', 'system', '中', '', { priority: 'medium' });
    service.createNotification('user1', 'system', '高', '', { priority: 'high' });

    const sorted = service.getUserNotifications('user1', { sortBy: 'priority' });
    expect(sorted[0].priority).toBe('urgent');
    expect(sorted[1].priority).toBe('high');
    expect(sorted[2].priority).toBe('medium');
    expect(sorted[3].priority).toBe('low');
  });

  it('应标记单条已读', () => {
    const n = service.createNotification('user1', 'system', '测试', '内容')!;
    expect(n.read).toBe(false);

    service.markAsRead(n.id);
    expect(n.read).toBe(true);
    expect(n.readAt).toBeDefined();
    expect(n.status).toBe('read');
  });

  it('标记不存在的通知应返回false', () => {
    expect(service.markAsRead('nonexistent')).toBe(false);
  });

  it('应批量标记已读', () => {
    service.createNotification('user1', 'system', 'N1', '');
    service.createNotification('user1', 'system', 'N2', '');
    service.createNotification('user2', 'system', 'N3', '');

    const count = service.markAllAsRead('user1');
    expect(count).toBe(2);

    const stats = service.getStats('user1');
    expect(stats.unread).toBe(0);
  });

  it('应删除通知', () => {
    const n = service.createNotification('user1', 'system', '测试', '')!;
    expect(service.deleteNotification(n.id)).toBe(true);
    expect(service.getNotification(n.id)).toBeUndefined();
  });

  it('删除不存在的通知应返回false', () => {
    expect(service.deleteNotification('nonexistent')).toBe(false);
  });

  it('应清空用户所有通知', () => {
    service.createNotification('user1', 'system', 'N1', '');
    service.createNotification('user1', 'system', 'N2', '');

    const count = service.clearUserNotifications('user1');
    expect(count).toBe(2);
    expect(service.getUserNotifications('user1').length).toBe(0);
  });

  it('应获取通知统计', () => {
    service.createNotification('user1', 'price_alert', 'A', '', { priority: 'high' });
    service.createNotification('user1', 'system', 'B', '', { priority: 'low' });
    service.createNotification('user1', 'system', 'C', '', { priority: 'high' });

    const stats = service.getStats('user1');
    expect(stats.total).toBe(3);
    expect(stats.unread).toBe(3);
    expect(stats.byType['price_alert']).toBe(1);
    expect(stats.byType['system']).toBe(2);
    expect(stats.byPriority['high']).toBe(2);
    expect(stats.byPriority['low']).toBe(1);
  });

  it('应获取未读数量', () => {
    service.createNotification('user1', 'system', 'A', '');
    service.createNotification('user1', 'system', 'B', '');
    const n = service.createNotification('user1', 'system', 'C', '')!;

    service.markAsRead(n.id);
    expect(service.getUnreadCount('user1')).toBe(2);
  });

  it('应获取单个通知', () => {
    const n = service.createNotification('user1', 'system', '测试', '')!;
    const found = service.getNotification(n.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(n.id);
  });

  it('应设置和获取用户偏好', () => {
    service.setUserPreferences({
      userId: 'user1',
      globalEnabled: true,
      pushEnabled: false,
      emailEnabled: true,
      smsEnabled: false,
      subscriptions: [],
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      dailyDigest: true,
      maxDailyNotifications: 50,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const prefs = service.getUserPreferences('user1');
    expect(prefs.pushEnabled).toBe(false);
    expect(prefs.emailEnabled).toBe(true);
    expect(prefs.quietHoursEnabled).toBe(true);
  });

  it('应返回默认偏好当用户未设置', () => {
    const prefs = service.getUserPreferences('newuser');
    expect(prefs.globalEnabled).toBe(true);
    expect(prefs.pushEnabled).toBe(true);
    expect(prefs.emailEnabled).toBe(false);
    expect(prefs.maxDailyNotifications).toBe(100);
  });

  it('禁用全局通知后不应创建通知', () => {
    service.setUserPreferences({
      userId: 'user1',
      globalEnabled: false,
      pushEnabled: true,
      emailEnabled: true,
      smsEnabled: true,
      subscriptions: [],
      quietHoursEnabled: false,
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
      dailyDigest: false,
      maxDailyNotifications: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const n = service.createNotification('user1', 'system', '不应创建', '');
    expect(n).toBeNull();
  });

  it('应批量创建通知', () => {
    const results = service.batchCreate({
      userIds: ['u1', 'u2', 'u3'],
      type: 'system',
      title: '批量通知',
      body: '内容',
    });
    expect(results.length).toBe(3);
    expect(results.every(n => n.title === '批量通知')).toBe(true);
  });

  it('应限制频率', () => {
    let created = 0;
    for (let i = 0; i < 50; i++) {
      const n = service.createNotification('user1', 'system', `N${i}`, '');
      if (n) created++;
    }
    expect(created).toBeLessThanOrEqual(30); // maxPerMinute
  });

  it('应创建带有自定义数据的通知', () => {
    const n = service.createNotification('user1', 'price_alert', '测试', '', {
      data: { symbol: '600519', price: 1850 },
      icon: '📈',
      actionUrl: '/stock/600519',
    });
    expect(n!.data).toEqual({ symbol: '600519', price: 1850 });
    expect(n!.icon).toBe('📈');
    expect(n!.actionUrl).toBe('/stock/600519');
  });

  it('应从模板创建通知', () => {
    const n = service.createFromTemplate('user1', 'limit_up', {
      name: '贵州茅台',
      symbol: '600519',
      price: 2000,
      turnover: 500000,
    });
    expect(n).not.toBeNull();
    expect(n!.title).toContain('贵州茅台');
    expect(n!.title).toContain('涨停');
    expect(n!.body).toContain('2000');
  });

  it('应限制每个用户最大通知数', () => {
    // 创建大量通知并验证清理
    for (let i = 0; i < 520; i++) {
      service.createNotification('user1', 'system', `N${i}`, '');
    }
    const stats = service.getStats('user1');
    expect(stats.total).toBeLessThanOrEqual(500);
  });

  it('clear应清空所有数据', () => {
    service.createNotification('user1', 'system', '测试', '');
    service.clear();
    expect(service.getUserNotifications('user1').length).toBe(0);
  });
});

describe('通知系统 - 渠道管理', () => {
  let cm: ChannelManager;

  beforeEach(() => {
    cm = new ChannelManager();
  });

  it('应注册渠道处理器', () => {
    const email = new EmailChannelHandler();
    cm.register(email);
    expect(cm.get('email')).toBeDefined();
  });

  it('应获取所有渠道', () => {
    cm.register(new EmailChannelHandler());
    cm.register(new InAppChannelHandler());
    expect(cm.getAll().length).toBe(2);
  });

  it('应移除渠道', () => {
    cm.register(new EmailChannelHandler());
    cm.unregister('email');
    expect(cm.get('email')).toBeUndefined();
  });

  it('应清空所有渠道', () => {
    cm.register(new EmailChannelHandler());
    cm.register(new InAppChannelHandler());
    cm.clear();
    expect(cm.getAll().length).toBe(0);
  });
});

describe('通知系统 - WebSocket渠道', () => {
  it('应注册和注销用户Socket', () => {
    const handler = new WebSocketChannelHandler();
    handler.registerUserSocket('user1', 'socket1');
    handler.registerUserSocket('user1', 'socket2');

    expect(handler.getUserSocketCount('user1')).toBe(2);
    expect(handler.getConnectedUsers()).toContain('user1');
  });

  it('应注销单个Socket', () => {
    const handler = new WebSocketChannelHandler();
    handler.registerUserSocket('user1', 'socket1');
    handler.registerUserSocket('user1', 'socket2');

    handler.unregisterUserSocket('user1', 'socket1');
    expect(handler.getUserSocketCount('user1')).toBe(1);
  });

  it('应清理无Socket的用户', () => {
    const handler = new WebSocketChannelHandler();
    handler.registerUserSocket('user1', 'socket1');
    handler.unregisterUserSocket('user1', 'socket1');

    expect(handler.getConnectedUsers()).not.toContain('user1');
  });

  it('应按SocketId注销', () => {
    const handler = new WebSocketChannelHandler();
    handler.registerUserSocket('user1', 'socket1');
    handler.registerUserSocket('user2', 'socket2');

    handler.unregisterSocket('socket1');
    expect(handler.getUserSocketCount('user1')).toBe(0);
    expect(handler.getUserSocketCount('user2')).toBe(1);
  });

  it('应返回false当无wsService', async () => {
    const handler = new WebSocketChannelHandler();
    handler.registerUserSocket('user1', 'socket1');

    const result = await handler.send({
      id: 'test',
      type: 'system',
      priority: 'medium',
      title: 'Test',
      body: 'Test body',
      channels: ['websocket'],
      userId: 'user1',
      read: false,
      status: 'pending',
      createdAt: Date.now(),
    });
    expect(result).toBe(false);
  });
});

describe('通知系统 - 邮件渠道', () => {
  it('应记录已发送邮件', async () => {
    const handler = new EmailChannelHandler();
    await handler.send({
      id: 'n1',
      type: 'system',
      priority: 'medium',
      title: '测试邮件',
      body: '邮件内容',
      channels: ['email'],
      userId: 'user1@example.com',
      read: false,
      status: 'pending',
      createdAt: Date.now(),
    });

    const emails = handler.getSentEmails();
    expect(emails.length).toBe(1);
    expect(emails[0].subject).toBe('测试邮件');
  });

  it('应清空已发送邮件记录', async () => {
    const handler = new EmailChannelHandler();
    await handler.send({
      id: 'n1',
      type: 'system',
      priority: 'medium',
      title: 'Test',
      body: 'Body',
      channels: ['email'],
      userId: 'user1',
      read: false,
      status: 'pending',
      createdAt: Date.now(),
    });

    handler.clearSent();
    expect(handler.getSentEmails().length).toBe(0);
  });
});

describe('通知系统 - 应用内渠道', () => {
  it('应存储应用内通知', async () => {
    const handler = new InAppChannelHandler();
    const n: NotificationPayload = {
      id: 'n1',
      type: 'system',
      priority: 'medium',
      title: 'Test',
      body: 'Body',
      channels: ['in_app'],
      userId: 'user1',
      read: false,
      status: 'pending',
      createdAt: Date.now(),
    };
    await handler.send(n);
    await handler.send({ ...n, id: 'n2' });

    expect(handler.getUserNotifications('user1').length).toBe(2);
  });
});

describe('通知系统 - 推送渠道', () => {
  it('应记录推送通知', async () => {
    const handler = new PushChannelHandler();
    await handler.send({
      id: 'n1',
      type: 'system',
      priority: 'medium',
      title: '推送测试',
      body: '推送内容',
      channels: ['push'],
      userId: 'user1',
      read: false,
      status: 'pending',
      createdAt: Date.now(),
    });

    expect(handler.getPushedNotifications().length).toBe(1);
  });
});

describe('通知系统 - 短信渠道', () => {
  it('应记录已发送短信', async () => {
    const handler = new SmsChannelHandler();
    await handler.send({
      id: 'n1',
      type: 'system',
      priority: 'medium',
      title: '验证码',
      body: '123456',
      channels: ['sms'],
      userId: '13800138000',
      read: false,
      status: 'pending',
      createdAt: Date.now(),
    });

    const sms = handler.getSentSms();
    expect(sms.length).toBe(1);
    expect(sms[0].content).toContain('验证码');
  });
});

describe('通知系统 - 完整系统集成', () => {
  it('应创建完整通知系统', () => {
    const system = createNotificationSystem();

    expect(system.service).toBeDefined();
    expect(system.templateManager).toBeDefined();
    expect(system.channelManager).toBeDefined();
    expect(system.wsHandler).toBeDefined();
    expect(system.emailHandler).toBeDefined();
    expect(system.inAppHandler).toBeDefined();
    expect(system.pushHandler).toBeDefined();
    expect(system.smsHandler).toBeDefined();
  });

  it('应通过集成系统创建通知', () => {
    const system = createNotificationSystem();
    const n = system.service.createNotification('user1', 'price_alert', '预警', '价格突破');
    expect(n).not.toBeNull();
    expect(n!.channels.length).toBeGreaterThan(0);
  });

  it('应支持完整工作流', () => {
    const system = createNotificationSystem();

    // 创建通知
    const n = system.service.createNotification('user1', 'limit_up', '涨停通知', '贵州茅台涨停', {
      priority: 'high',
      channels: ['in_app', 'push'],
      data: { symbol: '600519' },
    })!;

    // 获取统计
    const stats = system.service.getStats('user1');
    expect(stats.unread).toBe(1);

    // 标记已读
    system.service.markAsRead(n.id);
    expect(system.service.getUnreadCount('user1')).toBe(0);

    // 删除
    system.service.deleteNotification(n.id);
    expect(system.service.getNotification(n.id)).toBeUndefined();
  });

  it('应从模板创建并通过WS渠道发送', async () => {
    const system = createNotificationSystem();

    // 注册WS socket
    system.wsHandler.registerUserSocket('user1', 'socket1');

    // 从模板创建通知
    const n = system.service.createFromTemplate('user1', 'limit_up', {
      name: '贵州茅台',
      symbol: '600519',
      price: 2000,
      turnover: 500000,
    });

    expect(n).not.toBeNull();
    expect(n!.title).toContain('涨停');
  });
});
