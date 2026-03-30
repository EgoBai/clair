import { describe, it, expect } from 'vitest';

// 预警条件评估引擎
interface AlertCondition {
  field: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'crosses_above' | 'crosses_below';
  value: number;
  enabled: boolean;
}

interface AlertRule {
  id: string;
  symbol: string;
  conditions: AlertCondition[];
  logic: 'and' | 'or';
  triggered: boolean;
  lastTriggered?: number;
}

function evaluateCondition(current: number, previous: number, condition: AlertCondition): boolean {
  if (!condition.enabled) return false;
  switch (condition.operator) {
    case 'gt': return current > condition.value;
    case 'lt': return current < condition.value;
    case 'gte': return current >= condition.value;
    case 'lte': return current <= condition.value;
    case 'eq': return Math.abs(current - condition.value) < 0.001;
    case 'crosses_above': return previous <= condition.value && current > condition.value;
    case 'crosses_below': return previous >= condition.value && current < condition.value;
    default: return false;
  }
}

function evaluateRule(rule: AlertRule, currentData: Record<string, number>, previousData: Record<string, number>): { triggered: boolean; matchedConditions: string[] } {
  const results = rule.conditions.map(c => ({
    field: c.field,
    matched: evaluateCondition(currentData[c.field] ?? 0, previousData[c.field] ?? 0, c),
  }));

  const matched = results.filter(r => r.matched);
  const triggered = rule.logic === 'and'
    ? matched.length === rule.conditions.length
    : matched.length > 0;

  return { triggered, matchedConditions: matched.map(m => m.field) };
}

function batchEvaluateRules(rules: AlertRule[], marketData: Record<string, Record<string, number>>): AlertRule[] {
  return rules.map(rule => {
    const data = marketData[rule.symbol];
    if (!data) return { ...rule, triggered: false };
    const prevData = { ...data }; // simplified
    const result = evaluateRule(rule, data, prevData);
    return { ...rule, triggered: result.triggered };
  });
}

function generateAlertMessage(rule: AlertRule, matchedFields: string[]): string {
  const conditions = rule.conditions.filter(c => matchedFields.includes(c.field));
  const parts = conditions.map(c => `${c.field} ${c.operator} ${c.value}`);
  return `[${rule.symbol}] ${parts.join(` ${rule.logic.toUpperCase()} `)}`;
}

// 预警频率控制
class AlertThrottle {
  private lastAlert: Map<string, number> = new Map();
  private cooldownMs: number;

  constructor(cooldownMinutes: number = 5) {
    this.cooldownMs = cooldownMinutes * 60 * 1000;
  }

  shouldAlert(ruleId: string, now: number = Date.now()): boolean {
    const last = this.lastAlert.get(ruleId);
    if (!last) return true;
    return now - last >= this.cooldownMs;
  }

  recordAlert(ruleId: string, now: number = Date.now()): void {
    this.lastAlert.set(ruleId, now);
  }

  getRemainingCooldown(ruleId: string, now: number = Date.now()): number {
    const last = this.lastAlert.get(ruleId);
    if (!last) return 0;
    return Math.max(0, this.cooldownMs - (now - last));
  }
}

describe('预警系统引擎', () => {
  describe('条件评估', () => {
    it('大于条件', () => {
      expect(evaluateCondition(11, 10, { field: 'price', operator: 'gt', value: 10, enabled: true })).toBe(true);
      expect(evaluateCondition(9, 10, { field: 'price', operator: 'gt', value: 10, enabled: true })).toBe(false);
    });

    it('小于条件', () => {
      expect(evaluateCondition(9, 10, { field: 'price', operator: 'lt', value: 10, enabled: true })).toBe(true);
      expect(evaluateCondition(11, 10, { field: 'price', operator: 'lt', value: 10, enabled: true })).toBe(false);
    });

    it('大于等于条件', () => {
      expect(evaluateCondition(10, 9, { field: 'price', operator: 'gte', value: 10, enabled: true })).toBe(true);
      expect(evaluateCondition(11, 9, { field: 'price', operator: 'gte', value: 10, enabled: true })).toBe(true);
    });

    it('等于条件(容差)', () => {
      expect(evaluateCondition(10.0005, 9, { field: 'price', operator: 'eq', value: 10, enabled: true })).toBe(true);
      expect(evaluateCondition(10.01, 9, { field: 'price', operator: 'eq', value: 10, enabled: true })).toBe(false);
    });

    it('向上穿越条件', () => {
      expect(evaluateCondition(11, 9, { field: 'price', operator: 'crosses_above', value: 10, enabled: true })).toBe(true);
      expect(evaluateCondition(11, 11, { field: 'price', operator: 'crosses_above', value: 10, enabled: true })).toBe(false);
    });

    it('向下穿越条件', () => {
      expect(evaluateCondition(9, 11, { field: 'price', operator: 'crosses_below', value: 10, enabled: true })).toBe(true);
      expect(evaluateCondition(9, 9, { field: 'price', operator: 'crosses_below', value: 10, enabled: true })).toBe(false);
    });

    it('禁用条件返回false', () => {
      expect(evaluateCondition(100, 50, { field: 'price', operator: 'gt', value: 10, enabled: false })).toBe(false);
    });
  });

  describe('规则评估', () => {
    it('AND逻辑全部满足', () => {
      const rule: AlertRule = {
        id: '1', symbol: '600519', logic: 'and', triggered: false,
        conditions: [
          { field: 'price', operator: 'gt', value: 100, enabled: true },
          { field: 'volume', operator: 'gt', value: 1000, enabled: true },
        ],
      };
      const result = evaluateRule(rule, { price: 150, volume: 2000 }, { price: 140, volume: 1500 });
      expect(result.triggered).toBe(true);
    });

    it('AND逻辑部分满足不触发', () => {
      const rule: AlertRule = {
        id: '1', symbol: '600519', logic: 'and', triggered: false,
        conditions: [
          { field: 'price', operator: 'gt', value: 100, enabled: true },
          { field: 'volume', operator: 'gt', value: 5000, enabled: true },
        ],
      };
      const result = evaluateRule(rule, { price: 150, volume: 2000 }, { price: 140, volume: 1500 });
      expect(result.triggered).toBe(false);
    });

    it('OR逻辑任一满足', () => {
      const rule: AlertRule = {
        id: '1', symbol: '600519', logic: 'or', triggered: false,
        conditions: [
          { field: 'price', operator: 'gt', value: 200, enabled: true },
          { field: 'volume', operator: 'gt', value: 1000, enabled: true },
        ],
      };
      const result = evaluateRule(rule, { price: 150, volume: 2000 }, { price: 140, volume: 1500 });
      expect(result.triggered).toBe(true);
    });

    it('OR逻辑全部不满足', () => {
      const rule: AlertRule = {
        id: '1', symbol: '600519', logic: 'or', triggered: false,
        conditions: [
          { field: 'price', operator: 'gt', value: 200, enabled: true },
          { field: 'volume', operator: 'gt', value: 5000, enabled: true },
        ],
      };
      const result = evaluateRule(rule, { price: 150, volume: 2000 }, { price: 140, volume: 1500 });
      expect(result.triggered).toBe(false);
    });

    it('返回匹配字段列表', () => {
      const rule: AlertRule = {
        id: '1', symbol: '600519', logic: 'or', triggered: false,
        conditions: [
          { field: 'price', operator: 'gt', value: 100, enabled: true },
          { field: 'volume', operator: 'gt', value: 5000, enabled: true },
        ],
      };
      const result = evaluateRule(rule, { price: 150, volume: 2000 }, { price: 140, volume: 1500 });
      expect(result.matchedConditions).toContain('price');
    });
  });

  describe('批量评估', () => {
    it('多规则批量触发', () => {
      const rules: AlertRule[] = [
        { id: '1', symbol: '600519', logic: 'and', triggered: false,
          conditions: [{ field: 'price', operator: 'gt', value: 100, enabled: true }] },
        { id: '2', symbol: '000858', logic: 'and', triggered: false,
          conditions: [{ field: 'price', operator: 'gt', value: 100, enabled: true }] },
      ];
      const data = { '600519': { price: 150 }, '000858': { price: 50 } };
      const results = batchEvaluateRules(rules, data);
      expect(results[0].triggered).toBe(true);
      expect(results[1].triggered).toBe(false);
    });

    it('缺失数据不触发', () => {
      const rules: AlertRule[] = [
        { id: '1', symbol: '999999', logic: 'and', triggered: false,
          conditions: [{ field: 'price', operator: 'gt', value: 1, enabled: true }] },
      ];
      const results = batchEvaluateRules(rules, {});
      expect(results[0].triggered).toBe(false);
    });
  });

  describe('预警消息生成', () => {
    it('生成正确消息', () => {
      const rule: AlertRule = {
        id: '1', symbol: '600519', logic: 'and', triggered: true,
        conditions: [{ field: 'price', operator: 'gt', value: 100, enabled: true }],
      };
      const msg = generateAlertMessage(rule, ['price']);
      expect(msg).toContain('600519');
      expect(msg).toContain('price');
      expect(msg).toContain('gt');
    });

    it('包含多个条件', () => {
      const rule: AlertRule = {
        id: '1', symbol: '000858', logic: 'or', triggered: true,
        conditions: [
          { field: 'price', operator: 'gt', value: 100, enabled: true },
          { field: 'volume', operator: 'gt', value: 1000, enabled: true },
        ],
      };
      const msg = generateAlertMessage(rule, ['price', 'volume']);
      expect(msg).toContain('OR');
    });
  });

  describe('频率控制', () => {
    it('首次允许', () => {
      const throttle = new AlertThrottle(5);
      expect(throttle.shouldAlert('rule1')).toBe(true);
    });

    it('冷却期内拒绝', () => {
      const throttle = new AlertThrottle(5);
      const now = Date.now();
      throttle.recordAlert('rule1', now);
      expect(throttle.shouldAlert('rule1', now + 60000)).toBe(false);
    });

    it('冷却期后允许', () => {
      const throttle = new AlertThrottle(1);
      const now = Date.now();
      throttle.recordAlert('rule1', now);
      expect(throttle.shouldAlert('rule1', now + 61000)).toBe(true);
    });

    it('不同规则独立', () => {
      const throttle = new AlertThrottle(5);
      throttle.recordAlert('rule1');
      expect(throttle.shouldAlert('rule2')).toBe(true);
    });

    it('剩余冷却时间', () => {
      const throttle = new AlertThrottle(5);
      const now = Date.now();
      throttle.recordAlert('rule1', now);
      const remaining = throttle.getRemainingCooldown('rule1', now + 120000);
      expect(remaining).toBe(180000); // 5min cooldown, 2min elapsed = 3min remaining
    });

    it('无记录返回0冷却', () => {
      const throttle = new AlertThrottle(5);
      expect(throttle.getRemainingCooldown('unknown')).toBe(0);
    });
  });
});
