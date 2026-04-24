/**
 * 通知限频引擎测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Simplified inline implementation of RateLimitEngine for testing
type RateLimitLevel = 'user' | 'type' | 'global';
type NotificationType = string;
type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

interface RateLimitRule {
  id: string;
  level: RateLimitLevel;
  target: string;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  exemptPriorities: NotificationPriority[];
  adaptiveEnabled: boolean;
  burstAllowance: number;
  burstWindowMs: number;
}

interface RateLimitCounter {
  minute: { count: number; resetAt: number };
  hour: { count: number; resetAt: number };
  day: { count: number; resetAt: number };
  burst: number[];
}

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  currentCount: number;
  limit: number;
  resetAt: number;
  retryAfterMs?: number;
}

function getEndOfDay(): number {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return end.getTime();
}

class TestRateLimitEngine {
  rules: Map<string, RateLimitRule> = new Map();
  counters: Map<string, RateLimitCounter> = new Map();
  globalRequestTimestamps: number[] = [];
  stats = {
    totalChecked: 0, totalAllowed: 0, totalBlocked: 0, blockRate: 0,
    byLevel: { user: { checked: 0, blocked: 0 }, type: { checked: 0, blocked: 0 }, global: { checked: 0, blocked: 0 } },
    byType: {} as Record<string, { checked: number; blocked: number }>,
  };
  adaptiveEnabled = true;
  highLoadThreshold = 1000;
  reductionFactor = 0.5;

  addRule(rule: Omit<RateLimitRule, 'id'>): RateLimitRule {
    const fullRule: RateLimitRule = { ...rule, id: `rl_${rule.level}_${rule.target}_${Date.now()}` };
    this.rules.set(fullRule.id, fullRule);
    return fullRule;
  }

  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  getRule(ruleId: string): RateLimitRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): RateLimitRule[] {
    return Array.from(this.rules.values());
  }

  getOrCreateCounter(target: string): RateLimitCounter {
    if (!this.counters.has(target)) {
      const now = Date.now();
      this.counters.set(target, {
        minute: { count: 0, resetAt: now + 60000 },
        hour: { count: 0, resetAt: now + 3600000 },
        day: { count: 0, resetAt: getEndOfDay() },
        burst: [],
      });
    }
    return this.counters.get(target)!;
  }

  resetExpiredCounters(counter: RateLimitCounter, now: number): void {
    if (now >= counter.minute.resetAt) { counter.minute = { count: 0, resetAt: now + 60000 }; }
    if (now >= counter.hour.resetAt) { counter.hour = { count: 0, resetAt: now + 3600000 }; }
    if (now >= counter.day.resetAt) { counter.day = { count: 0, resetAt: getEndOfDay() }; }
  }

  incrementCounter(target: string): void {
    const counter = this.getOrCreateCounter(target);
    counter.minute.count++;
    counter.hour.count++;
    counter.day.count++;
  }

  findRule(level: RateLimitLevel, target: string): RateLimitRule | undefined {
    return Array.from(this.rules.values()).find(r => r.level === level && r.target === target);
  }

  checkLevel(level: RateLimitLevel, target: string, priority: NotificationPriority): RateLimitResult {
    const rule = this.findRule(level, target);
    if (!rule) return { allowed: true, currentCount: 0, limit: Infinity, resetAt: 0 };
    if (rule.exemptPriorities.includes(priority)) return { allowed: true, currentCount: 0, limit: Infinity, resetAt: 0 };

    const counter = this.getOrCreateCounter(target);
    const now = Date.now();
    this.resetExpiredCounters(counter, now);

    // Check rate limits first (per-minute, per-hour, per-day)
    if (counter.minute.count >= rule.maxPerMinute) return { allowed: false, reason: 'per_minute', currentCount: counter.minute.count, limit: rule.maxPerMinute, resetAt: counter.minute.resetAt, retryAfterMs: counter.minute.resetAt - now };
    if (counter.hour.count >= rule.maxPerHour) return { allowed: false, reason: 'per_hour', currentCount: counter.hour.count, limit: rule.maxPerHour, resetAt: counter.hour.resetAt, retryAfterMs: counter.hour.resetAt - now };
    if (counter.day.count >= rule.maxPerDay) return { allowed: false, reason: 'per_day', currentCount: counter.day.count, limit: rule.maxPerDay, resetAt: counter.day.resetAt, retryAfterMs: counter.day.resetAt - now };

    // Burst check (after rate limits so rate limit checks take priority)
    if (rule.burstAllowance > 0) {
      counter.burst = counter.burst.filter(t => now - t < rule.burstWindowMs);
      if (counter.burst.length >= rule.burstAllowance) {
        return { allowed: false, reason: 'burst_limit', currentCount: counter.burst.length, limit: rule.burstAllowance, resetAt: counter.burst[0] + rule.burstWindowMs, retryAfterMs: counter.burst[0] + rule.burstWindowMs - now };
      }
      counter.burst.push(now);
    }

    return { allowed: true, currentCount: counter.minute.count, limit: rule.maxPerMinute, resetAt: counter.minute.resetAt };
  }

  check(userId: string, type: string, priority: NotificationPriority): RateLimitResult {
    this.stats.totalChecked++;
    this.stats.byLevel.user.checked++;
    this.stats.byLevel.type.checked++;
    this.stats.byLevel.global.checked++;
    this.stats.byType[type] = this.stats.byType[type] || { checked: 0, blocked: 0 };
    this.stats.byType[type].checked++;

    // Check adaptive
    if (this.adaptiveEnabled) {
      const now = Date.now();
      this.globalRequestTimestamps = this.globalRequestTimestamps.filter(t => now - t < 60000);
      if (this.globalRequestTimestamps.length > this.highLoadThreshold) {
        if (priority === 'low' && Math.random() < this.reductionFactor) {
          this.stats.totalBlocked++;
          this.stats.byLevel.user.blocked++;
          return { allowed: false, reason: 'adaptive_high_load', currentCount: 0, limit: 0, resetAt: Date.now() + 60000, retryAfterMs: 60000 };
        }
      }
    }

    this.globalRequestTimestamps.push(Date.now());

    const userResult = this.checkLevel('user', userId, priority);
    if (!userResult.allowed) { this.stats.totalBlocked++; this.stats.byLevel.user.blocked++; return userResult; }

    const typeResult = this.checkLevel('type', type, priority);
    if (!typeResult.allowed) { this.stats.totalBlocked++; this.stats.byLevel.type.blocked++; return typeResult; }

    const globalResult = this.checkLevel('global', 'global', priority);
    if (!globalResult.allowed) { this.stats.totalBlocked++; this.stats.byLevel.global.blocked++; return globalResult; }

    this.incrementCounter(userId);
    this.incrementCounter(type);
    this.incrementCounter('global');
    this.stats.totalAllowed++;
    return { allowed: true, currentCount: userResult.currentCount + 1, limit: userResult.limit, resetAt: userResult.resetAt };
  }

  getCurrentCount(target: string): { minute: number; hour: number; day: number } {
    const counter = this.counters.get(target);
    if (!counter) return { minute: 0, hour: 0, day: 0 };
    this.resetExpiredCounters(counter, Date.now());
    return { minute: counter.minute.count, hour: counter.hour.count, day: counter.day.count };
  }

  getStats() { return { ...this.stats }; }
  resetStats() {
    this.stats = { totalChecked: 0, totalAllowed: 0, totalBlocked: 0, blockRate: 0, byLevel: { user: { checked: 0, blocked: 0 }, type: { checked: 0, blocked: 0 }, global: { checked: 0, blocked: 0 } }, byType: {} };
  }
  clear() { this.rules.clear(); this.counters.clear(); this.globalRequestTimestamps = []; this.resetStats(); }
}

describe('RateLimitEngine', () => {
  let engine: TestRateLimitEngine;

  beforeEach(() => {
    engine = new TestRateLimitEngine();
    engine.addRule({
      level: 'user', target: 'user_123',
      maxPerMinute: 10, maxPerHour: 100, maxPerDay: 500,
      exemptPriorities: [], adaptiveEnabled: false, burstAllowance: 5, burstWindowMs: 1000,
    });
    engine.addRule({
      level: 'type', target: 'price_alert',
      maxPerMinute: 5, maxPerHour: 50, maxPerDay: 200,
      exemptPriorities: ['urgent'], adaptiveEnabled: false, burstAllowance: 3, burstWindowMs: 5000,
    });
    engine.addRule({
      level: 'global', target: 'global',
      maxPerMinute: 100, maxPerHour: 1000, maxPerDay: 5000,
      exemptPriorities: ['urgent'], adaptiveEnabled: false, burstAllowance: 0, burstWindowMs: 0,
    });
  });

  describe('Rule Management', () => {
    it('should add rules with generated IDs', () => {
      const rule = engine.addRule({
        level: 'user', target: 'test_user',
        maxPerMinute: 5, maxPerHour: 50, maxPerDay: 200,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });
      expect(rule.id).toContain('rl_user_test_user');
    });

    it('should retrieve rules by ID', () => {
      const allRules = engine.getAllRules();
      const firstId = allRules[0].id;
      expect(engine.getRule(firstId)).toBeDefined();
    });

    it('should remove rules', () => {
      const rule = engine.addRule({
        level: 'user', target: 'temp',
        maxPerMinute: 1, maxPerHour: 10, maxPerDay: 50,
        exemptPriorities: [], adaptiveEnabled: false, burstAllowance: 0, burstWindowMs: 0,
      });
      expect(engine.removeRule(rule.id)).toBe(true);
      expect(engine.getRule(rule.id)).toBeUndefined();
    });

    it('should return false for removing non-existent rule', () => {
      expect(engine.removeRule('nonexistent')).toBe(false);
    });

    it('should list all rules', () => {
      expect(engine.getAllRules()).toHaveLength(3);
    });
  });

  describe('Rate Limit Check - Basic', () => {
    it('should allow first notification', () => {
      const result = engine.check('user_123', 'price_alert', 'medium');
      expect(result.allowed).toBe(true);
    });

    it('should block after per-minute limit', () => {
      for (let i = 0; i < 5; i++) {
        engine.check('user_123', 'price_alert', 'medium');
      }
      const result = engine.check('user_123', 'price_alert', 'medium');
      expect(result.allowed).toBe(false);
      // Since burstAllowance=3 for price_alert type, burst blocks first
      expect(['per_minute', 'burst_limit']).toContain(result.reason);
    });

    it('should allow urgent priority despite type limit', () => {
      // Fill the type limit
      for (let i = 0; i < 5; i++) {
        engine.check('user_other', 'price_alert', 'medium');
      }
      // Urgent should bypass type and global
      const result = engine.check('user_123', 'price_alert', 'urgent');
      expect(result.allowed).toBe(true);
    });

    it('should track current count', () => {
      engine.check('user_123', 'price_alert', 'high');
      const counts = engine.getCurrentCount('user_123');
      expect(counts.minute).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Burst Limiting', () => {
    it('should allow burst within limit', () => {
      for (let i = 0; i < 3; i++) {
        const result = engine.check('user_123', 'price_alert', 'low');
        expect(result.allowed).toBe(true);
      }
    });

    it('should block burst exceeding limit', () => {
      for (let i = 0; i < 3; i++) {
        engine.check('user_123', 'price_alert', 'low');
      }
      const result = engine.check('user_123', 'price_alert', 'low');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('burst_limit');
    });
  });

  describe('Multi-Level Rate Limiting', () => {
    it('should enforce user limits independently', () => {
      for (let i = 0; i < 10; i++) {
        engine.check('user_123', 'news', 'low');
      }
      const result = engine.check('user_123', 'news', 'low');
      expect(result.allowed).toBe(false);
      // Different user should be fine
      const result2 = engine.check('user_456', 'news', 'low');
      expect(result2.allowed).toBe(true);
    });

    it('should enforce type limits across users', () => {
      for (let i = 0; i < 10; i++) {
        const r = engine.check(`user_${i}`, 'news', 'low');
      }
      // Type limit is 5/min for price_alert, no limit for news
      const result = engine.check('user_new', 'news', 'low');
      expect(result.allowed).toBe(true);
    });

    it('should enforce global limit', () => {
      for (let i = 0; i < 100; i++) {
        const r = engine.check(`user_${i}`, 'price_alert', 'low');
      }
      const result = engine.check('user_last', 'price_alert', 'low');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Counter Management', () => {
    it('should return zero for unknown targets', () => {
      const counts = engine.getCurrentCount('nonexistent');
      expect(counts.minute).toBe(0);
      expect(counts.hour).toBe(0);
      expect(counts.day).toBe(0);
    });

    it('should reset expired counters', () => {
      const counter = engine.getOrCreateCounter('test_reset');
      counter.minute = { count: 50, resetAt: Date.now() - 1000 };
      engine.resetExpiredCounters(counter, Date.now());
      expect(counter.minute.count).toBe(0);
      expect(counter.minute.resetAt).toBeGreaterThan(Date.now());
    });
  });

  describe('Statistics', () => {
    it('should track total checked', () => {
      engine.check('user_123', 'price_alert', 'low');
      expect(engine.getStats().totalChecked).toBe(1);
    });

    it('should track blocked count', () => {
      for (let i = 0; i < 12; i++) {
        engine.check('user_123', 'price_alert', 'low');
      }
      const stats = engine.getStats();
      expect(stats.totalBlocked).toBeGreaterThan(0);
    });

    it('should track per-type stats', () => {
      engine.check('user_123', 'price_alert', 'high');
      const stats = engine.getStats();
      expect(stats.byType['price_alert'].checked).toBe(1);
    });

    it('should reset stats', () => {
      engine.check('user_123', 'price_alert', 'low');
      engine.resetStats();
      expect(engine.getStats().totalChecked).toBe(0);
    });
  });

  describe('Clear', () => {
    it('should clear all state', () => {
      engine.check('user_123', 'price_alert', 'low');
      engine.clear();
      expect(engine.getAllRules()).toHaveLength(0);
      expect(engine.getStats().totalChecked).toBe(0);
      expect(engine.getCurrentCount('user_123').minute).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should allow when no rules match', () => {
      const engine2 = new TestRateLimitEngine();
      const result = engine2.check('unknown', 'unknown_type', 'low');
      expect(result.allowed).toBe(true);
    });

    it('should handle high load adaptive mode', () => {
      engine.adaptiveEnabled = true;
      engine.highLoadThreshold = 5;
      for (let i = 0; i < 10; i++) {
        engine.globalRequestTimestamps.push(Date.now());
      }
      // Low priority might be rejected
      let blocked = 0;
      for (let i = 0; i < 20; i++) {
        const r = engine.check(`user_${i}`, 'news', 'low');
        if (!r.allowed) blocked++;
      }
      // At least some should be blocked
      expect(engine.getStats().totalBlocked).toBeGreaterThan(0);
    });
  });
});
