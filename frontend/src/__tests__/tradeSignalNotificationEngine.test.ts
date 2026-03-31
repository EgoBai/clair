import { describe, it, expect } from 'vitest';
import {
  deduplicateSignals,
  matchSignalToRules,
  generateNotifications,
  renderNotificationTemplate,
  prioritizeSignals,
  filterExpiredSignals,
  computeNotificationStats,
  TradeSignal,
  NotificationRule,
  Notification,
} from '../utils/tradeSignalNotificationEngine';

function makeSignal(overrides: Partial<TradeSignal> = {}): TradeSignal {
  return {
    id: 's1',
    symbol: '000001',
    type: 'buy',
    source: 'technical',
    confidence: 0.8,
    price: 100,
    message: 'Test signal',
    timestamp: Date.now(),
    expiresAt: Date.now() + 3600000,
    tags: [],
    ...overrides,
  };
}

function makeRule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: 'r1',
    name: 'Test Rule',
    signalTypes: ['buy', 'sell'],
    sources: ['technical'],
    minConfidence: 0.5,
    channels: ['push'],
    priority: 'normal',
    cooldownMs: 0,
    ...overrides,
  };
}

describe('deduplicateSignals', () => {
  it('removes duplicates by symbol+type+source', () => {
    const signals = [
      makeSignal({ id: '1', confidence: 0.5 }),
      makeSignal({ id: '2', confidence: 0.9 }),
    ];
    const result = deduplicateSignals(signals);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });

  it('keeps different types', () => {
    const signals = [
      makeSignal({ type: 'buy' }),
      makeSignal({ type: 'sell' }),
    ];
    expect(deduplicateSignals(signals)).toHaveLength(2);
  });

  it('keeps latest signal outside window', () => {
    const signals = [
      makeSignal({ id: '1', timestamp: 1000 }),
      makeSignal({ id: '2', timestamp: 700000 }), // > 5 min apart → replaces first
    ];
    const result = deduplicateSignals(signals);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});

describe('matchSignalToRules', () => {
  it('matches by type', () => {
    const signal = makeSignal({ type: 'buy' });
    const rules = [makeRule({ signalTypes: ['buy'] })];
    expect(matchSignalToRules(signal, rules)).toHaveLength(1);
  });

  it('rejects non-matching type', () => {
    const signal = makeSignal({ type: 'hold' });
    const rules = [makeRule({ signalTypes: ['buy'] })];
    expect(matchSignalToRules(signal, rules)).toHaveLength(0);
  });

  it('filters by confidence', () => {
    const signal = makeSignal({ confidence: 0.3 });
    const rules = [makeRule({ minConfidence: 0.5 })];
    expect(matchSignalToRules(signal, rules)).toHaveLength(0);
  });

  it('filters by source', () => {
    const signal = makeSignal({ source: 'ai' });
    const rules = [makeRule({ sources: ['technical'] })];
    expect(matchSignalToRules(signal, rules)).toHaveLength(0);
  });

  it('filters by symbol', () => {
    const signal = makeSignal({ symbol: '000001' });
    const rules = [makeRule({ symbols: ['000002'] })];
    expect(matchSignalToRules(signal, rules)).toHaveLength(0);
  });

  it('respects cooldown', () => {
    const signal = makeSignal();
    const rules = [makeRule({ cooldownMs: 60000 })];
    const lastSent = new Map([['r1:000001', Date.now() - 10000]]);
    expect(matchSignalToRules(signal, rules, lastSent)).toHaveLength(0);
  });

  it('matches after cooldown expires', () => {
    const signal = makeSignal();
    const rules = [makeRule({ cooldownMs: 60000 })];
    const lastSent = new Map([['r1:000001', Date.now() - 70000]]);
    expect(matchSignalToRules(signal, rules, lastSent)).toHaveLength(1);
  });
});

describe('generateNotifications', () => {
  it('creates notifications for matched rules', () => {
    const signal = makeSignal();
    const rules = [makeRule()];
    const notifs = generateNotifications(signal, rules);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].sentAt).toBeNull();
    expect(notifs[0].read).toBe(false);
  });
});

describe('renderNotificationTemplate', () => {
  it('renders buy signal', () => {
    const signal = makeSignal({ type: 'buy', price: 150, targetPrice: 180 });
    const template = renderNotificationTemplate(signal);
    expect(template.title).toContain('🟢');
    expect(template.body).toContain('150');
    expect(template.body).toContain('180');
  });

  it('renders warning signal', () => {
    const signal = makeSignal({ type: 'warning' });
    const template = renderNotificationTemplate(signal);
    expect(template.title).toContain('⚠️');
  });

  it('renders with stop loss', () => {
    const signal = makeSignal({ stopLoss: 90 });
    const template = renderNotificationTemplate(signal);
    expect(template.body).toContain('止损');
    expect(template.body).toContain('90');
  });
});

describe('prioritizeSignals', () => {
  it('orders by priority', () => {
    const signals = [
      makeSignal({ id: '1', type: 'hold', confidence: 1 }),
      makeSignal({ id: '2', type: 'warning', confidence: 0.8 }),
      makeSignal({ id: '3', type: 'buy', confidence: 0.9 }),
    ];
    const result = prioritizeSignals(signals);
    expect(result[0].type).toBe('warning');
  });
});

describe('filterExpiredSignals', () => {
  it('removes expired signals', () => {
    const signals = [
      makeSignal({ expiresAt: Date.now() - 1000 }),
      makeSignal({ expiresAt: Date.now() + 60000 }),
    ];
    expect(filterExpiredSignals(signals)).toHaveLength(1);
  });
});

describe('computeNotificationStats', () => {
  it('computes stats', () => {
    const notifs: Notification[] = [
      {
        id: '1', signal: makeSignal(), rule: makeRule(),
        channel: 'push', priority: 'normal',
        createdAt: 1000, sentAt: 1500, read: false, dismissed: false,
      },
      {
        id: '2', signal: makeSignal(), rule: makeRule(),
        channel: 'email', priority: 'high',
        createdAt: 2000, sentAt: null, read: false, dismissed: false,
      },
    ];
    const stats = computeNotificationStats(notifs);
    expect(stats.total).toBe(2);
    expect(stats.sent).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.byChannel['push']).toBe(1);
    expect(stats.byPriority['normal']).toBe(1);
    expect(stats.avgResponseTime).toBe(500);
  });

  it('handles empty', () => {
    const stats = computeNotificationStats([]);
    expect(stats.total).toBe(0);
    expect(stats.avgResponseTime).toBe(0);
  });
});
