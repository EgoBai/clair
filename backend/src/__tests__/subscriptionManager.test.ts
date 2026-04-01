import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionManager } from '../services/notification/subscriptionManager';

function makeRule(overrides = {}) {
  return {
    userId: 'user1',
    type: 'stock_price' as const,
    name: 'Test Rule',
    enabled: true,
    conditions: [],
    channels: ['push' as const],
    priority: 'medium' as const,
    cooldownSeconds: 0,
    maxTriggersPerDay: 100,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    ...overrides,
  };
}

describe('subscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager();
  });

  describe('createRule', () => {
    it('should create a rule with auto-generated id', () => {
      const rule = manager.createRule(makeRule());
      expect(rule.id).toBeDefined();
      expect(rule.id).toMatch(/^rule_/);
      expect(rule.triggerCount).toBe(0);
      expect(rule.createdAt).toBeGreaterThan(0);
    });

    it('should store rule', () => {
      const rule = manager.createRule(makeRule({ name: 'My Rule' }));
      const fetched = manager.getRule(rule.id);
      expect(fetched?.name).toBe('My Rule');
    });
  });

  describe('getUserRules', () => {
    it('should return rules for a user', () => {
      manager.createRule(makeRule({ userId: 'user1' }));
      manager.createRule(makeRule({ userId: 'user1' }));
      manager.createRule(makeRule({ userId: 'user2' }));

      expect(manager.getUserRules('user1')).toHaveLength(2);
      expect(manager.getUserRules('user2')).toHaveLength(1);
    });

    it('should return empty for unknown user', () => {
      expect(manager.getUserRules('nobody')).toEqual([]);
    });
  });

  describe('getActiveUserRules', () => {
    it('should only return enabled rules', () => {
      manager.createRule(makeRule({ enabled: true }));
      manager.createRule(makeRule({ enabled: false }));

      expect(manager.getActiveUserRules('user1')).toHaveLength(1);
    });
  });

  describe('updateRule', () => {
    it('should update rule fields', () => {
      const rule = manager.createRule(makeRule());
      const result = manager.updateRule(rule.id, { name: 'Updated' });
      expect(result).toBe(true);
      expect(manager.getRule(rule.id)?.name).toBe('Updated');
    });

    it('should return false for nonexistent rule', () => {
      expect(manager.updateRule('nonexistent', { name: 'x' })).toBe(false);
    });
  });

  describe('deleteRule', () => {
    it('should delete a rule', () => {
      const rule = manager.createRule(makeRule());
      expect(manager.deleteRule(rule.id)).toBe(true);
      expect(manager.getRule(rule.id)).toBeUndefined();
    });

    it('should remove from user rules', () => {
      const rule = manager.createRule(makeRule());
      manager.deleteRule(rule.id);
      expect(manager.getUserRules(rule.userId)).toHaveLength(0);
    });

    it('should return false for nonexistent rule', () => {
      expect(manager.deleteRule('fake')).toBe(false);
    });
  });

  describe('toggleRule', () => {
    it('should toggle rule enabled state', () => {
      const rule = manager.createRule(makeRule({ enabled: true }));
      manager.toggleRule(rule.id, false);
      expect(manager.getRule(rule.id)?.enabled).toBe(false);
    });
  });

  describe('toggleAllUserRules', () => {
    it('should toggle all user rules', () => {
      manager.createRule(makeRule({ enabled: true }));
      manager.createRule(makeRule({ enabled: true }));

      const count = manager.toggleAllUserRules('user1', false);
      expect(count).toBe(2);
      expect(manager.getActiveUserRules('user1')).toHaveLength(0);
    });
  });

  describe('evaluateRule', () => {
    it('should return true for rules with no conditions', () => {
      const rule = manager.createRule(makeRule({ conditions: [] }));
      expect(manager.evaluateRule(rule.id, {})).toBe(true);
    });

    it('should return false for disabled rules', () => {
      const rule = manager.createRule(makeRule({ enabled: false }));
      expect(manager.evaluateRule(rule.id, {})).toBe(false);
    });

    it('should return false for nonexistent rule', () => {
      expect(manager.evaluateRule('fake', {})).toBe(false);
    });

    it('should evaluate gt condition', () => {
      const rule = manager.createRule(makeRule({
        conditions: [{ field: 'price', operator: 'gt', value: 10 }],
      }));
      expect(manager.evaluateRule(rule.id, { price: 15 })).toBe(true);
      expect(manager.evaluateRule(rule.id, { price: 5 })).toBe(false);
    });

    it('should evaluate lt condition', () => {
      const rule = manager.createRule(makeRule({
        conditions: [{ field: 'price', operator: 'lt', value: 10 }],
      }));
      expect(manager.evaluateRule(rule.id, { price: 5 })).toBe(true);
      expect(manager.evaluateRule(rule.id, { price: 15 })).toBe(false);
    });

    it('should evaluate eq condition', () => {
      const rule = manager.createRule(makeRule({
        conditions: [{ field: 'status', operator: 'eq', value: 'open' }],
      }));
      expect(manager.evaluateRule(rule.id, { status: 'open' })).toBe(true);
      expect(manager.evaluateRule(rule.id, { status: 'closed' })).toBe(false);
    });

    it('should evaluate contains condition for strings', () => {
      const rule = manager.createRule(makeRule({
        conditions: [{ field: 'title', operator: 'contains', value: '涨停' }],
      }));
      expect(manager.evaluateRule(rule.id, { title: '股票涨停了' })).toBe(true);
      expect(manager.evaluateRule(rule.id, { title: '普通新闻' })).toBe(false);
    });

    it('should evaluate in condition', () => {
      const rule = manager.createRule(makeRule({
        conditions: [{ field: 'type', operator: 'in', value: ['limit_up', 'limit_down'] }],
      }));
      expect(manager.evaluateRule(rule.id, { type: 'limit_up' })).toBe(true);
      expect(manager.evaluateRule(rule.id, { type: 'news' })).toBe(false);
    });

    it('should require all conditions to pass (AND logic)', () => {
      const rule = manager.createRule(makeRule({
        conditions: [
          { field: 'price', operator: 'gt', value: 10 },
          { field: 'volume', operator: 'gt', value: 1000 },
        ],
      }));
      expect(manager.evaluateRule(rule.id, { price: 15, volume: 2000 })).toBe(true);
      expect(manager.evaluateRule(rule.id, { price: 15, volume: 500 })).toBe(false);
    });
  });

  describe('triggerRule', () => {
    it('should create trigger record', () => {
      const rule = manager.createRule(makeRule());
      const trigger = manager.triggerRule(rule.id, { price: 100 });

      expect(trigger).not.toBeNull();
      expect(trigger?.ruleId).toBe(rule.id);
      expect(trigger?.data).toEqual({ price: 100 });
    });

    it('should increment trigger count', () => {
      const rule = manager.createRule(makeRule());
      manager.triggerRule(rule.id, {});
      manager.triggerRule(rule.id, {});

      expect(manager.getRule(rule.id)?.triggerCount).toBe(2);
    });

    it('should return null if evaluation fails', () => {
      const rule = manager.createRule(makeRule({
        conditions: [{ field: 'price', operator: 'gt', value: 100 }],
      }));
      expect(manager.triggerRule(rule.id, { price: 50 })).toBeNull();
    });
  });

  describe('cooldown', () => {
    it('should block triggers during cooldown', () => {
      const rule = manager.createRule(makeRule({ cooldownSeconds: 60 }));
      manager.triggerRule(rule.id, {});

      // Second trigger should fail due to cooldown
      expect(manager.triggerRule(rule.id, {})).toBeNull();
    });
  });

  describe('evaluateAllUserRules', () => {
    it('should evaluate all active rules for user', () => {
      manager.createRule(makeRule({ conditions: [{ field: 'price', operator: 'gt', value: 10 }] }));
      manager.createRule(makeRule({ conditions: [{ field: 'price', operator: 'gt', value: 20 }] }));

      const triggers = manager.evaluateAllUserRules('user1', { price: 15 });
      expect(triggers).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should return subscription stats', () => {
      const rule = manager.createRule(makeRule());
      manager.triggerRule(rule.id, {});

      const stats = manager.getStats();
      expect(stats.totalRules).toBe(1);
      expect(stats.activeRules).toBe(1);
      expect(stats.totalTriggers).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      manager.createRule(makeRule());
      manager.clear();
      expect(manager.getUserRules('user1')).toHaveLength(0);
    });
  });
});
