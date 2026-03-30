/**
 * 订阅管理 & 限频引擎测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionManager } from '../services/notification/subscriptionManager';
import { RateLimitEngine } from '../services/notification/rateLimitEngine';

// ====== 订阅管理测试 ======
describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager();
  });

  describe('规则管理', () => {
    it('应创建订阅规则', () => {
      const rule = manager.createRule({
        userId: 'user_001',
        type: 'stock_price',
        name: '茅台价格预警',
        enabled: true,
        conditions: [{ field: 'price', operator: 'gt', value: 1800 }],
        channels: ['websocket', 'push'],
        priority: 'high',
        symbol: '600519',
        cooldownSeconds: 300,
        maxTriggersPerDay: 10,
        quietHoursEnabled: false,
        quietHoursStart: '23:00',
        quietHoursEnd: '07:00',
      });

      expect(rule.id).toBeDefined();
      expect(rule.triggerCount).toBe(0);
      expect(manager.getRule(rule.id)).toBeDefined();
    });

    it('应获取用户所有规则', () => {
      manager.createRule({
        userId: 'user_001', type: 'stock_price', name: 'R1',
        enabled: true, conditions: [], channels: ['websocket'],
        priority: 'medium', cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });
      manager.createRule({
        userId: 'user_001', type: 'news_keyword', name: 'R2',
        enabled: true, conditions: [], channels: ['in_app'],
        priority: 'low', keywords: ['AI'], cooldownSeconds: 0, maxTriggersPerDay: 50,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });
      manager.createRule({
        userId: 'user_002', type: 'stock_price', name: 'R3',
        enabled: true, conditions: [], channels: ['push'],
        priority: 'medium', cooldownSeconds: 0, maxTriggersPerDay: 10,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.getUserRules('user_001')).toHaveLength(2);
      expect(manager.getUserRules('user_002')).toHaveLength(1);
    });

    it('应更新规则', () => {
      const rule = manager.createRule({
        userId: 'user_001', type: 'stock_price', name: '原始名称',
        enabled: true, conditions: [], channels: ['websocket'],
        priority: 'medium', cooldownSeconds: 0, maxTriggersPerDay: 10,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.updateRule(rule.id, { name: '修改后名称' })).toBe(true);
      expect(manager.getRule(rule.id)!.name).toBe('修改后名称');
    });

    it('更新不存在的规则返回false', () => {
      expect(manager.updateRule('nonexistent', { name: 'x' })).toBe(false);
    });

    it('应删除规则', () => {
      const rule = manager.createRule({
        userId: 'user_001', type: 'stock_price', name: 'To Delete',
        enabled: true, conditions: [], channels: ['websocket'],
        priority: 'medium', cooldownSeconds: 0, maxTriggersPerDay: 10,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      manager.deleteRule(rule.id);
      expect(manager.getRule(rule.id)).toBeUndefined();
      expect(manager.getUserRules('user_001')).toHaveLength(0);
    });

    it('应启用/禁用规则', () => {
      const rule = manager.createRule({
        userId: 'user_001', type: 'stock_price', name: 'Toggle',
        enabled: true, conditions: [], channels: ['websocket'],
        priority: 'medium', cooldownSeconds: 0, maxTriggersPerDay: 10,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      manager.toggleRule(rule.id, false);
      expect(manager.getRule(rule.id)!.enabled).toBe(false);
    });

    it('批量启用/禁用', () => {
      manager.createRule({
        userId: 'user_001', type: 'stock_price', name: 'R1',
        enabled: true, conditions: [], channels: ['websocket'],
        priority: 'medium', cooldownSeconds: 0, maxTriggersPerDay: 10,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });
      manager.createRule({
        userId: 'user_001', type: 'news_keyword', name: 'R2',
        enabled: true, conditions: [], channels: ['in_app'],
        priority: 'low', cooldownSeconds: 0, maxTriggersPerDay: 10,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      const count = manager.toggleAllUserRules('user_001', false);
      expect(count).toBe(2);
      expect(manager.getActiveUserRules('user_001')).toHaveLength(0);
    });
  });

  describe('条件评估', () => {
    it('gt条件正确评估', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'GT',
        enabled: true,
        conditions: [{ field: 'price', operator: 'gt', value: 100 }],
        channels: ['websocket'], priority: 'high',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.evaluateRule(rule.id, { price: 150 })).toBe(true);
      expect(manager.evaluateRule(rule.id, { price: 50 })).toBe(false);
      expect(manager.evaluateRule(rule.id, { price: 100 })).toBe(false);
    });

    it('lt条件正确评估', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'LT',
        enabled: true,
        conditions: [{ field: 'changePercent', operator: 'lt', value: -5 }],
        channels: ['websocket'], priority: 'high',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.evaluateRule(rule.id, { changePercent: -7 })).toBe(true);
      expect(manager.evaluateRule(rule.id, { changePercent: -3 })).toBe(false);
    });

    it('eq条件正确评估', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'stock_limit', name: 'EQ',
        enabled: true,
        conditions: [{ field: 'isLimitUp', operator: 'eq', value: true }],
        channels: ['websocket'], priority: 'urgent',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.evaluateRule(rule.id, { isLimitUp: true })).toBe(true);
      expect(manager.evaluateRule(rule.id, { isLimitUp: false })).toBe(false);
    });

    it('in条件正确评估', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'IN',
        enabled: true,
        conditions: [{ field: 'sector', operator: 'in', value: ['科技', '医药', '消费'] }],
        channels: ['websocket'], priority: 'medium',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.evaluateRule(rule.id, { sector: '科技' })).toBe(true);
      expect(manager.evaluateRule(rule.id, { sector: '地产' })).toBe(false);
    });

    it('contains条件正确评估', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'news_keyword', name: 'CONTAINS',
        enabled: true,
        conditions: [{ field: 'title', operator: 'contains', value: 'AI' }],
        channels: ['in_app'], priority: 'low',
        keywords: ['AI'], cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.evaluateRule(rule.id, { title: 'AI大模型新突破' })).toBe(true);
      expect(manager.evaluateRule(rule.id, { title: '市场收跌' })).toBe(false);
    });

    it('多个条件AND关系', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'MULTI',
        enabled: true,
        conditions: [
          { field: 'price', operator: 'gt', value: 100 },
          { field: 'volume', operator: 'gt', value: 10000 },
        ],
        channels: ['websocket'], priority: 'high',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.evaluateRule(rule.id, { price: 150, volume: 20000 })).toBe(true);
      expect(manager.evaluateRule(rule.id, { price: 150, volume: 5000 })).toBe(false);
      expect(manager.evaluateRule(rule.id, { price: 50, volume: 20000 })).toBe(false);
    });

    it('无条件规则始终触发', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'market_open_close', name: 'ALWAYS',
        enabled: true, conditions: [],
        channels: ['push'], priority: 'medium',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.evaluateRule(rule.id, {})).toBe(true);
    });

    it('禁用规则不触发', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'DISABLED',
        enabled: false, conditions: [],
        channels: ['websocket'], priority: 'medium',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      expect(manager.evaluateRule(rule.id, {})).toBe(false);
    });
  });

  describe('触发控制', () => {
    it('冷却期内不触发', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'CD',
        enabled: true, conditions: [],
        channels: ['websocket'], priority: 'medium',
        cooldownSeconds: 300, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      const trigger1 = manager.triggerRule(rule.id, { price: 100 });
      expect(trigger1).not.toBeNull();

      const trigger2 = manager.triggerRule(rule.id, { price: 101 });
      expect(trigger2).toBeNull(); // 冷却中
    });

    it('触发计数增加', () => {
      const rule = manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'COUNT',
        enabled: true, conditions: [],
        channels: ['websocket'], priority: 'medium',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      manager.triggerRule(rule.id, {});
      manager.triggerRule(rule.id, {});

      expect(manager.getRule(rule.id)!.triggerCount).toBe(2);
    });

    it('批量评估所有用户规则', () => {
      manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'R1',
        enabled: true,
        conditions: [{ field: 'price', operator: 'gt', value: 100 }],
        channels: ['websocket'], priority: 'medium',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });
      manager.createRule({
        userId: 'u1', type: 'stock_volume', name: 'R2',
        enabled: true,
        conditions: [{ field: 'volume', operator: 'gt', value: 50000 }],
        channels: ['websocket'], priority: 'high',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      const triggers = manager.evaluateAllUserRules('u1', { price: 150, volume: 80000 });
      expect(triggers).toHaveLength(2);
    });
  });

  describe('统计', () => {
    it('应正确统计', () => {
      manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'R1',
        enabled: true, conditions: [],
        channels: ['websocket'], priority: 'medium',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });
      manager.createRule({
        userId: 'u1', type: 'news_keyword', name: 'R2',
        enabled: true, conditions: [],
        channels: ['in_app'], priority: 'low',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      const stats = manager.getStats('u1');
      expect(stats.totalRules).toBe(2);
      expect(stats.activeRules).toBe(2);
    });
  });

  describe('推荐', () => {
    it('应根据已有规则推荐新订阅', () => {
      manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'R1',
        enabled: true, conditions: [],
        channels: ['websocket'], priority: 'medium', symbol: '600519',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });

      const suggestions = manager.suggestSubscriptions('u1');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.type === 'stock_limit')).toBe(true);
    });
  });

  describe('清空', () => {
    it('clear应重置所有状态', () => {
      manager.createRule({
        userId: 'u1', type: 'stock_price', name: 'X',
        enabled: true, conditions: [],
        channels: ['websocket'], priority: 'medium',
        cooldownSeconds: 0, maxTriggersPerDay: 100,
        quietHoursEnabled: false, quietHoursStart: '', quietHoursEnd: '',
      });
      manager.clear();
      expect(manager.getUserRules('u1')).toHaveLength(0);
    });
  });
});

// ====== 限频引擎测试 ======
describe('RateLimitEngine', () => {
  let engine: RateLimitEngine;

  beforeEach(() => {
    engine = new RateLimitEngine({ enabled: false }); // 禁用自适应
  });

  describe('规则管理', () => {
    it('应添加和获取规则', () => {
      const rule = engine.addRule({
        level: 'user',
        target: 'user_001',
        maxPerMinute: 10,
        maxPerHour: 100,
        maxPerDay: 500,
        exemptPriorities: [],
        adaptiveEnabled: false,
        burstAllowance: 0,
        burstWindowMs: 0,
      });

      expect(rule.id).toBeDefined();
      expect(engine.getRule(rule.id)).toBeDefined();
    });

    it('应删除规则', () => {
      const rule = engine.addRule({
        level: 'user', target: 'user_001',
        maxPerMinute: 10, maxPerHour: 100, maxPerDay: 500,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      engine.removeRule(rule.id);
      expect(engine.getRule(rule.id)).toBeUndefined();
    });

    it('应返回所有规则', () => {
      engine.addRule({
        level: 'user', target: 'u1',
        maxPerMinute: 10, maxPerHour: 100, maxPerDay: 500,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });
      engine.addRule({
        level: 'global', target: 'global',
        maxPerMinute: 1000, maxPerHour: 10000, maxPerDay: 100000,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      expect(engine.getAllRules()).toHaveLength(2);
    });
  });

  describe('基本限频', () => {
    it('无规则时允许通过', () => {
      const result = engine.check('u1', 'price_alert', 'medium');
      expect(result.allowed).toBe(true);
    });

    it('分钟级限频生效', () => {
      engine.addRule({
        level: 'user', target: 'u1',
        maxPerMinute: 3, maxPerHour: 100, maxPerDay: 500,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(false); // 第4次被限
    });

    it('优先级豁免', () => {
      engine.addRule({
        level: 'user', target: 'u1',
        maxPerMinute: 1, maxPerHour: 1, maxPerDay: 1,
        exemptPriorities: ['urgent'],
        adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      engine.check('u1', 'price_alert', 'medium'); // 用掉1次
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(false);
      expect(engine.check('u1', 'price_alert', 'urgent').allowed).toBe(true); // 豁免
    });

    it('全局限频生效', () => {
      engine.addRule({
        level: 'global', target: 'global',
        maxPerMinute: 2, maxPerHour: 100, maxPerDay: 500,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u2', 'news', 'medium').allowed).toBe(true);
      expect(engine.check('u3', 'system', 'medium').allowed).toBe(false);
    });
  });

  describe('类型级限频', () => {
    it('特定类型限频', () => {
      engine.addRule({
        level: 'type', target: 'price_alert',
        maxPerMinute: 2, maxPerHour: 20, maxPerDay: 100,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(false);

      // 其他类型不受影响
      expect(engine.check('u1', 'news', 'medium').allowed).toBe(true);
    });
  });

  describe('突发限制', () => {
    it('突发窗口内限制', () => {
      engine.addRule({
        level: 'user', target: 'u1',
        maxPerMinute: 100, maxPerHour: 1000, maxPerDay: 10000,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 3, burstWindowMs: 1000,
      });

      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(true);
      expect(engine.check('u1', 'price_alert', 'medium').allowed).toBe(false); // 突发限制
    });
  });

  describe('计数查询', () => {
    it('应返回当前计数', () => {
      engine.addRule({
        level: 'user', target: 'u1',
        maxPerMinute: 10, maxPerHour: 100, maxPerDay: 500,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      engine.check('u1', 'price_alert', 'medium');
      engine.check('u1', 'price_alert', 'medium');

      const counts = engine.getCurrentCount('u1');
      expect(counts.minute).toBe(2);
      expect(counts.hour).toBe(2);
    });

    it('无计数时返回0', () => {
      const counts = engine.getCurrentCount('nobody');
      expect(counts.minute).toBe(0);
      expect(counts.hour).toBe(0);
      expect(counts.day).toBe(0);
    });
  });

  describe('统计', () => {
    it('应正确统计检查和阻止数', () => {
      engine.addRule({
        level: 'user', target: 'u1',
        maxPerMinute: 1, maxPerHour: 10, maxPerDay: 100,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      engine.check('u1', 'price_alert', 'medium'); // 允许
      engine.check('u1', 'price_alert', 'medium'); // 阻止

      const stats = engine.getStats();
      expect(stats.totalChecked).toBe(2);
      expect(stats.totalAllowed).toBe(1);
      expect(stats.totalBlocked).toBe(1);
      expect(stats.blockRate).toBe(0.5);
    });
  });

  describe('清空', () => {
    it('clear应重置所有状态', () => {
      engine.addRule({
        level: 'user', target: 'u1',
        maxPerMinute: 10, maxPerHour: 100, maxPerDay: 500,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });
      engine.clear();
      expect(engine.getAllRules()).toHaveLength(0);
      expect(engine.getStats().totalChecked).toBe(0);
    });
  });
});
