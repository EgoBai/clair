import { describe, it, expect, beforeEach } from 'vitest';

// Advanced Notification Engine
interface NotificationChannel {
  id: string;
  type: 'email' | 'sms' | 'push' | 'webhook' | 'in_app' | 'slack' | 'wechat';
  config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
}

interface NotificationRule {
  id: string;
  name: string;
  event: string;
  conditions: { field: string; operator: string; value: unknown }[];
  channels: string[];
  template: string;
  throttle: { maxPerMinute: number; maxPerHour: number };
  enabled: boolean;
}

interface Notification {
  id: string;
  event: string;
  channel: string;
  recipient: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'throttled';
  timestamp: Date;
  retryCount: number;
  metadata: Record<string, unknown>;
}

interface NotificationStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  throttled: number;
  byChannel: Record<string, number>;
  byEvent: Record<string, number>;
  avgDeliveryTime: number;
}

class NotificationEngine {
  private channels: Map<string, NotificationChannel> = new Map();
  private rules: Map<string, NotificationRule> = new Map();
  private notifications: Notification[] = [];
  private templates: Map<string, string> = new Map();
  private rateCounters: Map<string, { minute: number[]; hour: number[] }> = new Map();
  private deliveryTimes: number[] = [];

  addChannel(channel: Omit<NotificationChannel, 'id'>): NotificationChannel {
    const id = `ch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const ch: NotificationChannel = { ...channel, id };
    this.channels.set(id, ch);
    return ch;
  }

  removeChannel(id: string): boolean {
    return this.channels.delete(id);
  }

  addRule(rule: Omit<NotificationRule, 'id'>): NotificationRule {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const r: NotificationRule = { ...rule, id };
    this.rules.set(id, r);
    return r;
  }

  addTemplate(name: string, template: string): void {
    this.templates.set(name, template);
  }

  private renderTemplate(templateName: string, data: Record<string, unknown>): string {
    const template = this.templates.get(templateName) ?? templateName;
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ''));
  }

  private checkThrottle(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    const now = Date.now();
    let counter = this.rateCounters.get(ruleId);
    if (!counter) {
      counter = { minute: [], hour: [] };
      this.rateCounters.set(ruleId, counter);
    }
    // Clean old entries
    counter.minute = counter.minute.filter(t => now - t < 60000);
    counter.hour = counter.hour.filter(t => now - t < 3600000);
    if (counter.minute.length >= rule.throttle.maxPerMinute) return false;
    if (counter.hour.length >= rule.throttle.maxPerHour) return false;
    counter.minute.push(now);
    counter.hour.push(now);
    return true;
  }

  async emit(event: string, data: Record<string, unknown>): Promise<Notification[]> {
    const results: Notification[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.event !== event) continue;

      // Check conditions
      const matches = rule.conditions.every(c => {
        const value = data[c.field];
        switch (c.operator) {
          case 'eq': return value === c.value;
          case 'gt': return (value as number) > (c.value as number);
          case 'lt': return (value as number) < (c.value as number);
          case 'contains': return String(value).includes(String(c.value));
          default: return true;
        }
      });
      if (!matches) continue;

      // Check throttle
      if (!this.checkThrottle(rule.id)) {
        for (const chId of rule.channels) {
          const notif: Notification = {
            id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            event, channel: chId,
            recipient: String(data.recipient ?? 'unknown'),
            subject: '', body: '',
            status: 'throttled',
            timestamp: new Date(),
            retryCount: 0, metadata: data,
          };
          this.notifications.push(notif);
          results.push(notif);
        }
        continue;
      }

      // Send to each channel
      for (const chId of rule.channels) {
        const channel = this.channels.get(chId);
        if (!channel || !channel.enabled) continue;

        const body = this.renderTemplate(rule.template, data);
        const start = Date.now();
        const notif: Notification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          event, channel: chId,
          recipient: String(data.recipient ?? 'unknown'),
          subject: String(data.subject ?? event),
          body, status: 'sent',
          timestamp: new Date(),
          retryCount: 0, metadata: data,
        };
        this.notifications.push(notif);
        this.deliveryTimes.push(Date.now() - start);
        results.push(notif);
      }
    }
    return results;
  }

  async retry(notificationId: string): Promise<boolean> {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (!notif || notif.status === 'delivered') return false;
    if (notif.retryCount >= 3) return false;
    notif.retryCount++;
    notif.status = 'sent';
    return true;
  }

  markDelivered(notificationId: string): boolean {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (!notif) return false;
    notif.status = 'delivered';
    return true;
  }

  markFailed(notificationId: string): boolean {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (!notif) return false;
    notif.status = 'failed';
    return true;
  }

  getStats(): NotificationStats {
    const byChannel: Record<string, number> = {};
    const byEvent: Record<string, number> = {};
    for (const n of this.notifications) {
      byChannel[n.channel] = (byChannel[n.channel] ?? 0) + 1;
      byEvent[n.event] = (byEvent[n.event] ?? 0) + 1;
    }
    return {
      total: this.notifications.length,
      sent: this.notifications.filter(n => n.status === 'sent').length,
      delivered: this.notifications.filter(n => n.status === 'delivered').length,
      failed: this.notifications.filter(n => n.status === 'failed').length,
      throttled: this.notifications.filter(n => n.status === 'throttled').length,
      byChannel,
      byEvent,
      avgDeliveryTime: this.deliveryTimes.length > 0
        ? this.deliveryTimes.reduce((a, b) => a + b, 0) / this.deliveryTimes.length
        : 0,
    };
  }

  getNotifications(filter?: { event?: string; status?: string; channel?: string }): Notification[] {
    let result = [...this.notifications];
    if (filter?.event) result = result.filter(n => n.event === filter.event);
    if (filter?.status) result = result.filter(n => n.status === filter.status);
    if (filter?.channel) result = result.filter(n => n.channel === filter.channel);
    return result;
  }

  getChannels(): NotificationChannel[] {
    return Array.from(this.channels.values());
  }

  getRules(): NotificationRule[] {
    return Array.from(this.rules.values());
  }
}

describe('Notification Engine', () => {
  let engine: NotificationEngine;

  beforeEach(() => {
    engine = new NotificationEngine();
  });

  it('should add channel', () => {
    const ch = engine.addChannel({ type: 'email', config: { smtp: 'localhost' }, enabled: true, priority: 1 });
    expect(ch.type).toBe('email');
    expect(engine.getChannels()).toHaveLength(1);
  });

  it('should remove channel', () => {
    const ch = engine.addChannel({ type: 'sms', config: {}, enabled: true, priority: 2 });
    expect(engine.removeChannel(ch.id)).toBe(true);
    expect(engine.getChannels()).toHaveLength(0);
  });

  it('should add rule', () => {
    const rule = engine.addRule({
      name: 'Price Alert', event: 'price_alert',
      conditions: [{ field: 'change', operator: 'gt', value: 5 }],
      channels: [], template: 'Price changed: {{change}}%',
      throttle: { maxPerMinute: 10, maxPerHour: 100 },
      enabled: true,
    });
    expect(rule.name).toBe('Price Alert');
  });

  it('should emit and create notifications', async () => {
    const ch = engine.addChannel({ type: 'push', config: {}, enabled: true, priority: 1 });
    engine.addRule({
      name: 'Alert', event: 'alert',
      conditions: [], channels: [ch.id],
      template: 'Alert: {{message}}', throttle: { maxPerMinute: 100, maxPerHour: 1000 },
      enabled: true,
    });
    const notifs = await engine.emit('alert', { message: 'Market open', recipient: 'user1' });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toBe('Alert: Market open');
  });

  it('should render templates', async () => {
    const ch = engine.addChannel({ type: 'in_app', config: {}, enabled: true, priority: 1 });
    engine.addTemplate('price_tpl', '{{symbol}} price is {{price}}');
    engine.addRule({
      name: 'Price', event: 'price',
      conditions: [], channels: [ch.id],
      template: 'price_tpl', throttle: { maxPerMinute: 100, maxPerHour: 1000 },
      enabled: true,
    });
    const notifs = await engine.emit('price', { symbol: 'AAPL', price: 150, recipient: 'u1' });
    expect(notifs[0].body).toBe('AAPL price is 150');
  });

  it('should check conditions', async () => {
    const ch = engine.addChannel({ type: 'webhook', config: {}, enabled: true, priority: 1 });
    engine.addRule({
      name: 'High Volume', event: 'volume',
      conditions: [{ field: 'volume', operator: 'gt', value: 1000000 }],
      channels: [ch.id], template: 'Volume: {{volume}}',
      throttle: { maxPerMinute: 100, maxPerHour: 1000 },
      enabled: true,
    });
    const notifs1 = await engine.emit('volume', { volume: 500000, recipient: 'u1' });
    expect(notifs1).toHaveLength(0);

    const notifs2 = await engine.emit('volume', { volume: 2000000, recipient: 'u1' });
    expect(notifs2).toHaveLength(1);
  });

  it('should throttle notifications', async () => {
    const ch = engine.addChannel({ type: 'email', config: {}, enabled: true, priority: 1 });
    engine.addRule({
      name: 'Limited', event: 'test',
      conditions: [], channels: [ch.id], template: 'Test',
      throttle: { maxPerMinute: 2, maxPerHour: 10 },
      enabled: true,
    });
    await engine.emit('test', { recipient: 'u1' });
    await engine.emit('test', { recipient: 'u1' });
    const notifs = await engine.emit('test', { recipient: 'u1' });
    expect(notifs[0].status).toBe('throttled');
  });

  it('should skip disabled rules', async () => {
    const ch = engine.addChannel({ type: 'slack', config: {}, enabled: true, priority: 1 });
    engine.addRule({
      name: 'Disabled', event: 'test',
      conditions: [], channels: [ch.id], template: 'Test',
      throttle: { maxPerMinute: 100, maxPerHour: 1000 },
      enabled: false,
    });
    const notifs = await engine.emit('test', { recipient: 'u1' });
    expect(notifs).toHaveLength(0);
  });

  it('should mark delivered', async () => {
    const ch = engine.addChannel({ type: 'wechat', config: {}, enabled: true, priority: 1 });
    engine.addRule({
      name: 'Test', event: 't',
      conditions: [], channels: [ch.id], template: 'T',
      throttle: { maxPerMinute: 100, maxPerHour: 1000 },
      enabled: true,
    });
    const notifs = await engine.emit('t', { recipient: 'u1' });
    expect(engine.markDelivered(notifs[0].id)).toBe(true);
    expect(engine.getStats().delivered).toBe(1);
  });

  it('should mark failed', async () => {
    const ch = engine.addChannel({ type: 'sms', config: {}, enabled: true, priority: 1 });
    engine.addRule({
      name: 'Test', event: 't',
      conditions: [], channels: [ch.id], template: 'T',
      throttle: { maxPerMinute: 100, maxPerHour: 1000 },
      enabled: true,
    });
    const notifs = await engine.emit('t', { recipient: 'u1' });
    engine.markFailed(notifs[0].id);
    expect(engine.getStats().failed).toBe(1);
  });

  it('should retry', async () => {
    const ch = engine.addChannel({ type: 'email', config: {}, enabled: true, priority: 1 });
    engine.addRule({
      name: 'Test', event: 't',
      conditions: [], channels: [ch.id], template: 'T',
      throttle: { maxPerMinute: 100, maxPerHour: 1000 },
      enabled: true,
    });
    const notifs = await engine.emit('t', { recipient: 'u1' });
    expect(await engine.retry(notifs[0].id)).toBe(true);
  });

  it('should get stats', async () => {
    const ch = engine.addChannel({ type: 'push', config: {}, enabled: true, priority: 1 });
    engine.addRule({
      name: 'T', event: 'e',
      conditions: [], channels: [ch.id], template: 'T',
      throttle: { maxPerMinute: 100, maxPerHour: 1000 },
      enabled: true,
    });
    await engine.emit('e', { recipient: 'u1' });
    const stats = engine.getStats();
    expect(stats.total).toBe(1);
    expect(stats.byChannel[ch.id]).toBe(1);
  });

  it('should filter notifications', async () => {
    const ch1 = engine.addChannel({ type: 'email', config: {}, enabled: true, priority: 1 });
    const ch2 = engine.addChannel({ type: 'push', config: {}, enabled: true, priority: 2 });
    engine.addRule({
      name: 'E1', event: 'ev1', conditions: [], channels: [ch1.id],
      template: 'T', throttle: { maxPerMinute: 100, maxPerHour: 1000 }, enabled: true,
    });
    engine.addRule({
      name: 'E2', event: 'ev2', conditions: [], channels: [ch2.id],
      template: 'T', throttle: { maxPerMinute: 100, maxPerHour: 1000 }, enabled: true,
    });
    await engine.emit('ev1', { recipient: 'u1' });
    await engine.emit('ev2', { recipient: 'u1' });
    expect(engine.getNotifications({ event: 'ev1' })).toHaveLength(1);
    expect(engine.getNotifications({ channel: ch2.id })).toHaveLength(1);
  });

  it('should handle all channel types', () => {
    const types: NotificationChannel['type'][] = ['email', 'sms', 'push', 'webhook', 'in_app', 'slack', 'wechat'];
    for (const type of types) {
      engine.addChannel({ type, config: {}, enabled: true, priority: 1 });
    }
    expect(engine.getChannels()).toHaveLength(types.length);
  });
});
