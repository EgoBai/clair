import { describe, it, expect } from 'vitest';

/**
 * 订阅管理逻辑测试
 */

type NotificationType = 'price_alert' | 'news' | 'earnings' | 'technical' | 'volume';
type NotificationChannel = 'push' | 'email' | 'sms' | 'websocket';

interface Subscription {
  userId: string;
  type: NotificationType;
  channels: NotificationChannel[];
  symbol?: string;
  active: boolean;
  createdAt: number;
}

interface SubscriptionFilter {
  types?: NotificationType[];
  channels?: NotificationChannel[];
  symbol?: string;
  active?: boolean;
}

function filterSubscriptions(subs: Subscription[], filter: SubscriptionFilter): Subscription[] {
  return subs.filter(s => {
    if (filter.types && !filter.types.includes(s.type)) return false;
    if (filter.channels && !s.channels.some(c => filter.channels!.includes(c))) return false;
    if (filter.symbol && s.symbol !== filter.symbol) return false;
    if (filter.active !== undefined && s.active !== filter.active) return false;
    return true;
  });
}

function subscribe(userId: string, type: NotificationType, channels: NotificationChannel[], symbol?: string): Subscription {
  return { userId, type, channels, symbol, active: true, createdAt: Date.now() };
}

function unsubscribe(subs: Subscription[], userId: string, type: NotificationType, symbol?: string): Subscription[] {
  return subs.map(s => {
    if (s.userId === userId && s.type === type && (!symbol || s.symbol === symbol)) {
      return { ...s, active: false };
    }
    return s;
  });
}

function getActiveChannels(subs: Subscription[], userId: string, type: NotificationType): NotificationChannel[] {
  const active = subs.filter(s => s.userId === userId && s.type === type && s.active);
  const channels = new Set<NotificationChannel>();
  active.forEach(s => s.channels.forEach(c => channels.add(c)));
  return Array.from(channels);
}

function deduplicateChannels(channels: NotificationChannel[]): NotificationChannel[] {
  return Array.from(new Set(channels));
}

function calculateSubscriptionStats(subs: Subscription[]): {
  total: number;
  active: number;
  byType: Record<string, number>;
  byChannel: Record<string, number>;
  avgChannelsPerSub: number;
} {
  const active = subs.filter(s => s.active);
  const byType: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  let totalChannels = 0;
  active.forEach(s => {
    byType[s.type] = (byType[s.type] || 0) + 1;
    s.channels.forEach(c => { byChannel[c] = (byChannel[c] || 0) + 1; });
    totalChannels += s.channels.length;
  });
  return {
    total: subs.length,
    active: active.length,
    byType,
    byChannel,
    avgChannelsPerSub: active.length > 0 ? parseFloat((totalChannels / active.length).toFixed(2)) : 0,
  };
}

describe('订阅管理逻辑', () => {
  describe('filterSubscriptions', () => {
    it('should filter by type', () => {
      const subs = [
        subscribe('u1', 'price_alert', ['push']),
        subscribe('u1', 'news', ['email']),
      ];
      expect(filterSubscriptions(subs, { types: ['price_alert'] })).toHaveLength(1);
    });

    it('should filter by active status', () => {
      const subs = [
        { ...subscribe('u1', 'price_alert', ['push']), active: false },
        subscribe('u1', 'news', ['email']),
      ];
      expect(filterSubscriptions(subs, { active: true })).toHaveLength(1);
    });

    it('should filter by symbol', () => {
      const subs = [
        subscribe('u1', 'price_alert', ['push'], '600519'),
        subscribe('u1', 'price_alert', ['push'], '000858'),
      ];
      expect(filterSubscriptions(subs, { symbol: '600519' })).toHaveLength(1);
    });
  });

  describe('unsubscribe', () => {
    it('should deactivate matching subscriptions', () => {
      const subs = [subscribe('u1', 'price_alert', ['push'])];
      const result = unsubscribe(subs, 'u1', 'price_alert');
      expect(result[0].active).toBe(false);
    });

    it('should not affect other users', () => {
      const subs = [subscribe('u1', 'price_alert', ['push']), subscribe('u2', 'price_alert', ['push'])];
      const result = unsubscribe(subs, 'u1', 'price_alert');
      expect(result[1].active).toBe(true);
    });
  });

  describe('getActiveChannels', () => {
    it('should return union of channels', () => {
      const subs = [
        subscribe('u1', 'price_alert', ['push', 'email']),
        subscribe('u1', 'price_alert', ['sms']),
      ];
      const channels = getActiveChannels(subs, 'u1', 'price_alert');
      expect(channels).toHaveLength(3);
    });
  });

  describe('deduplicateChannels', () => {
    it('should remove duplicates', () => {
      expect(deduplicateChannels(['push', 'email', 'push'])).toHaveLength(2);
    });
  });

  describe('calculateSubscriptionStats', () => {
    it('should count by type and channel', () => {
      const subs = [
        subscribe('u1', 'price_alert', ['push', 'email']),
        subscribe('u2', 'news', ['push']),
      ];
      const stats = calculateSubscriptionStats(subs);
      expect(stats.active).toBe(2);
      expect(stats.byType['price_alert']).toBe(1);
      expect(stats.byChannel['push']).toBe(2);
    });

    it('should exclude inactive', () => {
      const subs = [
        subscribe('u1', 'price_alert', ['push']),
        { ...subscribe('u2', 'news', ['email']), active: false },
      ];
      const stats = calculateSubscriptionStats(subs);
      expect(stats.active).toBe(1);
    });
  });
});
