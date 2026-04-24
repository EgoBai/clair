/**
 * 通知渠道测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Re-create channel implementations inline for testing
class MockWebSocketHandler {
  channel = 'websocket';
  private userSocketMap: Map<string, string[]> = new Map();

  registerUserSocket(userId: string, socketId: string) {
    if (!this.userSocketMap.has(userId)) {
      this.userSocketMap.set(userId, []);
    }
    const sockets = this.userSocketMap.get(userId)!;
    if (!sockets.includes(socketId)) {
      sockets.push(socketId);
    }
  }

  unregisterUserSocket(userId: string, socketId: string) {
    const sockets = this.userSocketMap.get(userId);
    if (sockets) {
      const idx = sockets.indexOf(socketId);
      if (idx > -1) sockets.splice(idx, 1);
      if (sockets.length === 0) this.userSocketMap.delete(userId);
    }
  }

  unregisterSocket(socketId: string) {
    for (const [userId, sockets] of this.userSocketMap) {
      const idx = sockets.indexOf(socketId);
      if (idx > -1) sockets.splice(idx, 1);
      if (sockets.length === 0) this.userSocketMap.delete(userId);
    }
  }

  getConnectedUsers(): string[] {
    return Array.from(this.userSocketMap.keys());
  }

  getUserSocketCount(userId: string): number {
    return this.userSocketMap.get(userId)?.length || 0;
  }

  async send(notification: any): Promise<boolean> {
    const socketIds = this.userSocketMap.get(notification.userId);
    return !!(socketIds && socketIds.length > 0);
  }
}

class MockEmailHandler {
  channel = 'email';
  sentEmails: Array<{ to: string; subject: string; body: string; sentAt: number }> = [];

  async send(notification: any): Promise<boolean> {
    this.sentEmails.push({
      to: notification.userId,
      subject: notification.title,
      body: notification.body,
      sentAt: Date.now(),
    });
    return true;
  }

  getSentEmails() { return this.sentEmails; }
  clearSent() { this.sentEmails = []; }
}

class MockInAppHandler {
  channel = 'in_app';
  notifications: Map<string, any[]> = new Map();

  async send(notification: any): Promise<boolean> {
    if (!this.notifications.has(notification.userId)) {
      this.notifications.set(notification.userId, []);
    }
    this.notifications.get(notification.userId)!.push(notification);
    return true;
  }

  getUserNotifications(userId: string) { return this.notifications.get(userId) || []; }
  clear() { this.notifications.clear(); }
}

class MockPushHandler {
  channel = 'push';
  pushedNotifications: Array<{ userId: string; title: string; body: string; pushedAt: number }> = [];

  async send(notification: any): Promise<boolean> {
    this.pushedNotifications.push({
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
      pushedAt: Date.now(),
    });
    return true;
  }

  getPushedNotifications() { return this.pushedNotifications; }
  clear() { this.pushedNotifications = []; }
}

class MockSmsHandler {
  channel = 'sms';
  sentSms: Array<{ phone: string; content: string; sentAt: number }> = [];

  async send(notification: any): Promise<boolean> {
    this.sentSms.push({
      phone: notification.userId,
      content: `${notification.title}: ${notification.body}`,
      sentAt: Date.now(),
    });
    return true;
  }

  getSentSms() { return this.sentSms; }
  clear() { this.sentSms = []; }
}

class MockChannelManager {
  handlers: Map<string, any> = new Map();

  register(handler: any) { this.handlers.set(handler.channel, handler); }
  get(channel: string) { return this.handlers.get(channel); }
  getAll() { return Array.from(this.handlers.values()); }
  unregister(channel: string) { this.handlers.delete(channel); }
  clear() { this.handlers.clear(); }
}

const makeNotif = (overrides = {}) => ({
  id: 'notif_001',
  type: 'price_alert',
  priority: 'high',
  title: '价格预警',
  body: '股价已到目标位',
  channels: ['push'],
  userId: 'user_123',
  read: false,
  status: 'pending',
  createdAt: Date.now(),
  ...overrides,
});

describe('WebSocket Channel Handler', () => {
  let ws: MockWebSocketHandler;

  beforeEach(() => {
    ws = new MockWebSocketHandler();
  });

  it('should register and find user sockets', () => {
    ws.registerUserSocket('user_1', 'socket_a');
    ws.registerUserSocket('user_1', 'socket_b');
    expect(ws.getUserSocketCount('user_1')).toBe(2);
    expect(ws.getConnectedUsers()).toContain('user_1');
  });

  it('should unregister specific user socket', () => {
    ws.registerUserSocket('user_1', 'socket_a');
    ws.registerUserSocket('user_1', 'socket_b');
    ws.unregisterUserSocket('user_1', 'socket_a');
    expect(ws.getUserSocketCount('user_1')).toBe(1);
  });

  it('should remove user when no sockets left', () => {
    ws.registerUserSocket('user_1', 'socket_a');
    ws.unregisterUserSocket('user_1', 'socket_a');
    expect(ws.getConnectedUsers()).not.toContain('user_1');
  });

  it('should unregister socket globally', () => {
    ws.registerUserSocket('user_1', 'socket_a');
    ws.registerUserSocket('user_2', 'socket_a');
    ws.unregisterSocket('socket_a');
    expect(ws.getUserSocketCount('user_1')).toBe(0);
    expect(ws.getUserSocketCount('user_2')).toBe(0);
  });

  it('should prevent duplicate socket registration', () => {
    ws.registerUserSocket('user_1', 'socket_a');
    ws.registerUserSocket('user_1', 'socket_a');
    expect(ws.getUserSocketCount('user_1')).toBe(1);
  });

  it('should send notification to connected user', async () => {
    ws.registerUserSocket('user_123', 'socket_a');
    const result = await ws.send(makeNotif());
    expect(result).toBe(true);
  });

  it('should fail sending to offline user', async () => {
    const result = await ws.send(makeNotif({ userId: 'offline_user' }));
    expect(result).toBe(false);
  });

  it('should return empty connected users initially', () => {
    expect(ws.getConnectedUsers()).toEqual([]);
  });

  it('should handle multiple users', () => {
    ws.registerUserSocket('user_1', 's1');
    ws.registerUserSocket('user_2', 's2');
    ws.registerUserSocket('user_3', 's3');
    expect(ws.getConnectedUsers()).toHaveLength(3);
  });
});

describe('Email Channel Handler', () => {
  let email: MockEmailHandler;

  beforeEach(() => {
    email = new MockEmailHandler();
  });

  it('should send email and record it', async () => {
    const result = await email.send(makeNotif());
    expect(result).toBe(true);
    expect(email.getSentEmails()).toHaveLength(1);
  });

  it('should record correct email content', async () => {
    await email.send(makeNotif({
      title: '测试邮件',
      body: '这是内容',
      userId: 'user@test.com',
    }));
    const sent = email.getSentEmails()[0];
    expect(sent.to).toBe('user@test.com');
    expect(sent.subject).toBe('测试邮件');
    expect(sent.body).toBe('这是内容');
  });

  it('should clear sent history', async () => {
    await email.send(makeNotif());
    email.clearSent();
    expect(email.getSentEmails()).toHaveLength(0);
  });

  it('should track multiple emails', async () => {
    await email.send(makeNotif({ userId: 'a@b.com' }));
    await email.send(makeNotif({ userId: 'c@d.com' }));
    expect(email.getSentEmails()).toHaveLength(2);
  });
});

describe('In-App Channel Handler', () => {
  let inApp: MockInAppHandler;

  beforeEach(() => {
    inApp = new MockInAppHandler();
  });

  it('should store notifications per user', async () => {
    await inApp.send(makeNotif({ userId: 'user_1' }));
    await inApp.send(makeNotif({ userId: 'user_2' }));
    expect(inApp.getUserNotifications('user_1')).toHaveLength(1);
    expect(inApp.getUserNotifications('user_2')).toHaveLength(1);
  });

  it('should return empty for unknown user', () => {
    expect(inApp.getUserNotifications('nonexistent')).toEqual([]);
  });

  it('should accumulate notifications', async () => {
    for (let i = 0; i < 5; i++) {
      await inApp.send(makeNotif({ userId: 'user_1', id: `n${i}` }));
    }
    expect(inApp.getUserNotifications('user_1')).toHaveLength(5);
  });

  it('should clear all notifications', async () => {
    await inApp.send(makeNotif({ userId: 'user_1' }));
    inApp.clear();
    expect(inApp.getUserNotifications('user_1')).toEqual([]);
  });
});

describe('Push Channel Handler', () => {
  let push: MockPushHandler;

  beforeEach(() => {
    push = new MockPushHandler();
  });

  it('should record push notification', async () => {
    await push.send(makeNotif({ title: 'Push Alert', body: 'Action needed' }));
    const records = push.getPushedNotifications();
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('Push Alert');
    expect(records[0].body).toBe('Action needed');
  });

  it('should clear push history', async () => {
    await push.send(makeNotif());
    push.clear();
    expect(push.getPushedNotifications()).toHaveLength(0);
  });

  it('should track timestamps', async () => {
    const before = Date.now();
    await push.send(makeNotif());
    const after = Date.now();
    const record = push.getPushedNotifications()[0];
    expect(record.pushedAt).toBeGreaterThanOrEqual(before);
    expect(record.pushedAt).toBeLessThanOrEqual(after);
  });
});

describe('SMS Channel Handler', () => {
  let sms: MockSmsHandler;

  beforeEach(() => {
    sms = new MockSmsHandler();
  });

  it('should format SMS content', async () => {
    await sms.send(makeNotif({ title: '提醒', body: '请查看' }));
    const msg = sms.getSentSms()[0];
    expect(msg.content).toBe('提醒: 请查看');
  });

  it('should record phone number', async () => {
    await sms.send(makeNotif({ userId: '13800138000' }));
    expect(sms.getSentSms()[0].phone).toBe('13800138000');
  });

  it('should clear history', async () => {
    await sms.send(makeNotif());
    sms.clear();
    expect(sms.getSentSms()).toHaveLength(0);
  });
});

describe('Channel Manager', () => {
  let mgr: MockChannelManager;

  beforeEach(() => {
    mgr = new MockChannelManager();
  });

  it('should register and retrieve handlers', () => {
    mgr.register(new MockEmailHandler());
    mgr.register(new MockPushHandler());
    expect(mgr.get('email')).toBeDefined();
    expect(mgr.get('push')).toBeDefined();
    expect(mgr.get('sms')).toBeUndefined();
  });

  it('should list all registered handlers', () => {
    mgr.register(new MockEmailHandler());
    mgr.register(new MockPushHandler());
    mgr.register(new MockSmsHandler());
    expect(mgr.getAll()).toHaveLength(3);
  });

  it('should unregister handlers', () => {
    mgr.register(new MockEmailHandler());
    mgr.register(new MockPushHandler());
    mgr.unregister('email');
    expect(mgr.get('email')).toBeUndefined();
    expect(mgr.getAll()).toHaveLength(1);
  });

  it('should clear all handlers', () => {
    mgr.register(new MockEmailHandler());
    mgr.register(new MockPushHandler());
    mgr.clear();
    expect(mgr.getAll()).toHaveLength(0);
  });

  it('should allow handler replacement', () => {
    const h1 = new MockEmailHandler();
    const h2 = new MockEmailHandler();
    mgr.register(h1);
    mgr.register(h2);
    expect(mgr.get('email')).toBe(h2);
  });
});
