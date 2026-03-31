import { describe, it, expect, vi } from 'vitest';
import { NotificationEngine } from '../services/notificationEngine';

describe('NotificationEngine', () => {
  it('should create notification', async () => {
    const engine = new NotificationEngine();
    const n = await engine.create({
      title: 'Test',
      body: 'Body',
      channel: 'websocket',
      priority: 'normal',
      recipient: 'user1',
    });
    expect(n.id).toBeDefined();
    expect(n.status).toBe('pending');
    expect(n.title).toBe('Test');
  });

  it('should send notification', async () => {
    const engine = new NotificationEngine();
    engine.registerChannel('email', async () => true);
    const n = await engine.create({
      title: 'Hi',
      body: 'Body',
      channel: 'email',
      priority: 'normal',
      recipient: 'user1',
    });
    const success = await engine.send(n.id);
    expect(success).toBe(true);
    expect(n.status).toBe('sent');
    expect(n.sentAt).toBeDefined();
  });

  it('should handle send failure', async () => {
    const engine = new NotificationEngine();
    engine.registerChannel('email', async () => false);
    const n = await engine.create({
      title: 'Hi',
      body: 'Body',
      channel: 'email',
      priority: 'normal',
      recipient: 'user1',
    });
    const success = await engine.send(n.id);
    expect(success).toBe(false);
    expect(n.status).toBe('failed');
  });

  it('should return false for unknown notification', async () => {
    const engine = new NotificationEngine();
    expect(await engine.send('unknown')).toBe(false);
  });

  it('should register and use template', async () => {
    const engine = new NotificationEngine();
    engine.registerTemplate({
      id: 'welcome',
      name: '欢迎',
      titleTemplate: '欢迎，{{name}}！',
      bodyTemplate: '感谢注册{{app}}',
      channels: ['email'],
      defaultPriority: 'normal',
    });
    const n = await engine.createFromTemplate('welcome', { name: '小明', app: 'A股' }, 'user1');
    expect(n).not.toBeNull();
    expect(n!.title).toBe('欢迎，小明！');
    expect(n!.body).toBe('感谢注册A股');
  });

  it('should return null for unknown template', async () => {
    const engine = new NotificationEngine();
    const n = await engine.createFromTemplate('unknown', {}, 'user1');
    expect(n).toBeNull();
  });

  it('should mark as read', async () => {
    const engine = new NotificationEngine();
    const n = await engine.create({
      title: 'Hi',
      body: 'Body',
      channel: 'websocket',
      priority: 'normal',
      recipient: 'user1',
    });
    expect(engine.markAsRead(n.id)).toBe(true);
    expect(n.status).toBe('read');
    expect(n.readAt).toBeDefined();
  });

  it('should get user notifications', async () => {
    const engine = new NotificationEngine();
    await engine.create({ title: 'A', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    await engine.create({ title: 'B', body: '', channel: 'websocket', priority: 'normal', recipient: 'user2' });
    await engine.create({ title: 'C', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    const notifs = engine.getUserNotifications('user1');
    expect(notifs).toHaveLength(2);
  });

  it('should filter unread only', async () => {
    const engine = new NotificationEngine();
    const n1 = await engine.create({ title: 'A', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    await engine.create({ title: 'B', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    engine.markAsRead(n1.id);
    const unread = engine.getUserNotifications('user1', true);
    expect(unread).toHaveLength(1);
  });

  it('should mark all as read', async () => {
    const engine = new NotificationEngine();
    await engine.create({ title: 'A', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    await engine.create({ title: 'B', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    const count = engine.markAllAsRead('user1');
    expect(count).toBe(2);
  });

  it('should get stats', async () => {
    const engine = new NotificationEngine();
    const n1 = await engine.create({ title: 'A', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    await engine.create({ title: 'B', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    engine.markAsRead(n1.id);
    const stats = engine.getStats('user1');
    expect(stats.total).toBe(2);
    expect(stats.read).toBe(1);
  });

  it('should cleanup old notifications', async () => {
    const engine = new NotificationEngine();
    const n = await engine.create({ title: 'A', body: '', channel: 'websocket', priority: 'normal', recipient: 'user1' });
    engine.markAsRead(n.id);
    // Modify createdAt to be old
    n.createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const cleaned = engine.cleanup();
    expect(cleaned).toBe(1);
  });
});
