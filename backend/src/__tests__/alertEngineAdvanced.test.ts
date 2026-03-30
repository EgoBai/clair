import { describe, it, expect } from 'vitest';

/**
 * 智能预警引擎测试
 */

interface Alert {
  id: string; code: string; type: 'price' | 'volume' | 'change' | 'indicator' | 'pattern';
  condition: 'gt' | 'lt' | 'cross_up' | 'cross_down' | 'equals';
  value: number; currentValue: number; triggered: boolean; triggerTime?: number;
  message: string; priority: 'high' | 'medium' | 'low';
}

interface AlertRule {
  id: string; name: string; type: string; params: Record<string, unknown>;
  cooldown: number; lastTriggered: number; enabled: boolean;
}

const checkAlert = (alert: Alert): Alert => {
  let triggered = false;
  switch (alert.condition) {
    case 'gt': triggered = alert.currentValue > alert.value; break;
    case 'lt': triggered = alert.currentValue < alert.value; break;
    case 'equals': triggered = Math.abs(alert.currentValue - alert.value) < 0.001; break;
    case 'cross_up': triggered = alert.currentValue >= alert.value; break;
    case 'cross_down': triggered = alert.currentValue <= alert.value; break;
  }
  return {
    ...alert,
    triggered,
    triggerTime: triggered ? Date.now() : undefined,
    message: triggered ? `${alert.code} 触发${alert.type}预警: ${alert.condition} ${alert.value}` : alert.message,
  };
};

const evaluateRules = (rules: AlertRule[], context: Record<string, number>): AlertRule[] => {
  const now = Date.now();
  return rules.map(rule => {
    if (!rule.enabled) return rule;
    if (now - rule.lastTriggered < rule.cooldown) return rule;
    const val = context[rule.params.field as string] ?? 0;
    const threshold = rule.params.threshold as number ?? 0;
    const op = rule.params.operator as string ?? 'gt';
    let triggered = false;
    if (op === 'gt' && val > threshold) triggered = true;
    if (op === 'lt' && val < threshold) triggered = true;
    if (op === 'eq' && Math.abs(val - threshold) < 0.01) triggered = true;
    return triggered ? { ...rule, lastTriggered: now } : rule;
  });
};

const deduplicateAlerts = (alerts: Alert[], windowMs: number = 60000): Alert[] => {
  const seen = new Map<string, Alert>();
  for (const alert of alerts) {
    const key = `${alert.code}_${alert.type}_${alert.condition}`;
    const existing = seen.get(key);
    if (!existing || (alert.triggerTime ?? 0) > (existing.triggerTime ?? 0)) {
      seen.set(key, alert);
    }
  }
  return Array.from(seen.values());
};

const prioritizeAlerts = (alerts: Alert[]): Alert[] => {
  const order = { high: 0, medium: 1, low: 2 };
  return [...alerts].sort((a, b) => order[a.priority] - order[b.priority]);
};

const batchAlerts = (alerts: Alert[], batchSize: number = 10): Alert[][] => {
  const batches: Alert[][] = [];
  for (let i = 0; i < alerts.length; i += batchSize) {
    batches.push(alerts.slice(i, i + batchSize));
  }
  return batches;
};

const calcAlertStats = (alerts: Alert[]): { total: number; triggered: number; byType: Record<string, number>; byPriority: Record<string, number> } => {
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let triggered = 0;
  for (const a of alerts) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    byPriority[a.priority] = (byPriority[a.priority] || 0) + 1;
    if (a.triggered) triggered++;
  }
  return { total: alerts.length, triggered, byType, byPriority };
};

describe('智能预警引擎', () => {
  describe('预警检查', () => {
    it('超过阈值应触发', () => {
      const alert: Alert = {
        id: '1', code: '000001', type: 'price', condition: 'gt',
        value: 10, currentValue: 12, triggered: false,
        message: '', priority: 'high'
      };
      expect(checkAlert(alert).triggered).toBe(true);
    });

    it('低于阈值应触发lt', () => {
      const alert: Alert = {
        id: '1', code: '000001', type: 'price', condition: 'lt',
        value: 10, currentValue: 8, triggered: false,
        message: '', priority: 'high'
      };
      expect(checkAlert(alert).triggered).toBe(true);
    });

    it('未达阈值不应触发', () => {
      const alert: Alert = {
        id: '1', code: '000001', type: 'price', condition: 'gt',
        value: 10, currentValue: 8, triggered: false,
        message: '', priority: 'medium'
      };
      expect(checkAlert(alert).triggered).toBe(false);
    });

    it('等于值应触发equals', () => {
      const alert: Alert = {
        id: '1', code: '000001', type: 'price', condition: 'equals',
        value: 10, currentValue: 10, triggered: false,
        message: '', priority: 'low'
      };
      expect(checkAlert(alert).triggered).toBe(true);
    });

    it('触发时应有消息', () => {
      const alert: Alert = {
        id: '1', code: '000001', type: 'volume', condition: 'gt',
        value: 1e8, currentValue: 2e8, triggered: false,
        message: '', priority: 'high'
      };
      const result = checkAlert(alert);
      expect(result.message).toContain('000001');
    });

    it('cross_up应检测向上穿越', () => {
      const alert: Alert = {
        id: '1', code: '000001', type: 'indicator', condition: 'cross_up',
        value: 50, currentValue: 55, triggered: false,
        message: '', priority: 'medium'
      };
      expect(checkAlert(alert).triggered).toBe(true);
    });

    it('cross_down应检测向下穿越', () => {
      const alert: Alert = {
        id: '1', code: '000001', type: 'indicator', condition: 'cross_down',
        value: 50, currentValue: 45, triggered: false,
        message: '', priority: 'medium'
      };
      expect(checkAlert(alert).triggered).toBe(true);
    });

    it('不修改原对象', () => {
      const alert: Alert = {
        id: '1', code: '000001', type: 'price', condition: 'gt',
        value: 10, currentValue: 15, triggered: false,
        message: '', priority: 'high'
      };
      checkAlert(alert);
      expect(alert.triggered).toBe(false);
    });
  });

  describe('规则评估', () => {
    it('应触发满足条件的规则', () => {
      const rules: AlertRule[] = [{
        id: 'r1', name: 'Price Alert', type: 'price',
        params: { field: 'price', threshold: 100, operator: 'gt' },
        cooldown: 0, lastTriggered: 0, enabled: true
      }];
      const ctx = { price: 150 };
      const result = evaluateRules(rules, ctx);
      expect(result[0].lastTriggered).toBeGreaterThan(0);
    });

    it('禁用规则不应触发', () => {
      const rules: AlertRule[] = [{
        id: 'r1', name: 'Disabled', type: 'price',
        params: { field: 'price', threshold: 100, operator: 'gt' },
        cooldown: 0, lastTriggered: 0, enabled: false
      }];
      const result = evaluateRules(rules, { price: 150 });
      expect(result[0].lastTriggered).toBe(0);
    });

    it('冷却期内不应触发', () => {
      const now = Date.now();
      const rules: AlertRule[] = [{
        id: 'r1', name: 'Cooldown', type: 'price',
        params: { field: 'price', threshold: 100, operator: 'gt' },
        cooldown: 60000, lastTriggered: now - 10000, enabled: true
      }];
      const result = evaluateRules(rules, { price: 150 });
      expect(result[0].lastTriggered).toBe(now - 10000);
    });

    it('条件不满足不应触发', () => {
      const rules: AlertRule[] = [{
        id: 'r1', name: 'No Trigger', type: 'price',
        params: { field: 'price', threshold: 100, operator: 'gt' },
        cooldown: 0, lastTriggered: 0, enabled: true
      }];
      const result = evaluateRules(rules, { price: 50 });
      expect(result[0].lastTriggered).toBe(0);
    });

    it('缺失字段应使用默认值', () => {
      const rules: AlertRule[] = [{
        id: 'r1', name: 'Missing', type: 'price',
        params: { field: 'nonexistent' },
        cooldown: 0, lastTriggered: 0, enabled: true
      }];
      const result = evaluateRules(rules, { price: 100 });
      expect(result[0].lastTriggered).toBe(0);
    });

    it('lt操作符应正确', () => {
      const rules: AlertRule[] = [{
        id: 'r1', name: 'LT', type: 'price',
        params: { field: 'price', threshold: 100, operator: 'lt' },
        cooldown: 0, lastTriggered: 0, enabled: true
      }];
      const result = evaluateRules(rules, { price: 50 });
      expect(result[0].lastTriggered).toBeGreaterThan(0);
    });
  });

  describe('预警去重', () => {
    it('应去除重复预警', () => {
      const alerts: Alert[] = [
        { id: '1', code: '000001', type: 'price', condition: 'gt', value: 10, currentValue: 12, triggered: true, triggerTime: 100, message: '', priority: 'high' },
        { id: '2', code: '000001', type: 'price', condition: 'gt', value: 10, currentValue: 12, triggered: true, triggerTime: 200, message: '', priority: 'high' },
      ];
      expect(deduplicateAlerts(alerts).length).toBe(1);
    });

    it('不同股票不应去重', () => {
      const alerts: Alert[] = [
        { id: '1', code: '000001', type: 'price', condition: 'gt', value: 10, currentValue: 12, triggered: true, triggerTime: 100, message: '', priority: 'high' },
        { id: '2', code: '000002', type: 'price', condition: 'gt', value: 10, currentValue: 12, triggered: true, triggerTime: 100, message: '', priority: 'high' },
      ];
      expect(deduplicateAlerts(alerts).length).toBe(2);
    });

    it('保留最新的重复预警', () => {
      const alerts: Alert[] = [
        { id: '1', code: '000001', type: 'price', condition: 'gt', value: 10, currentValue: 12, triggered: true, triggerTime: 100, message: 'old', priority: 'high' },
        { id: '2', code: '000001', type: 'price', condition: 'gt', value: 10, currentValue: 12, triggered: true, triggerTime: 200, message: 'new', priority: 'high' },
      ];
      const deduped = deduplicateAlerts(alerts);
      expect(deduped[0].message).toBe('new');
    });

    it('空列表返回空', () => {
      expect(deduplicateAlerts([])).toEqual([]);
    });

    it('不同类型不应去重', () => {
      const alerts: Alert[] = [
        { id: '1', code: '000001', type: 'price', condition: 'gt', value: 10, currentValue: 12, triggered: true, triggerTime: 100, message: '', priority: 'high' },
        { id: '2', code: '000001', type: 'volume', condition: 'gt', value: 1e8, currentValue: 2e8, triggered: true, triggerTime: 100, message: '', priority: 'high' },
      ];
      expect(deduplicateAlerts(alerts).length).toBe(2);
    });
  });

  describe('预警优先级', () => {
    it('应该按优先级排序', () => {
      const alerts: Alert[] = [
        { id: '1', code: 'A', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'low' },
        { id: '2', code: 'B', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'high' },
        { id: '3', code: 'C', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'medium' },
      ];
      const sorted = prioritizeAlerts(alerts);
      expect(sorted[0].priority).toBe('high');
      expect(sorted[2].priority).toBe('low');
    });

    it('空列表返回空', () => {
      expect(prioritizeAlerts([])).toEqual([]);
    });

    it('不修改原数组', () => {
      const alerts: Alert[] = [
        { id: '1', code: 'A', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'low' },
        { id: '2', code: 'B', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'high' },
      ];
      prioritizeAlerts(alerts);
      expect(alerts[0].priority).toBe('low');
    });
  });

  describe('预警分批', () => {
    it('应按批次大小分组', () => {
      const alerts: Alert[] = Array.from({ length: 25 }, (_, i) => ({
        id: `${i}`, code: 'A', type: 'price' as const, condition: 'gt' as const,
        value: 1, currentValue: 2, triggered: true, message: '', priority: 'medium' as const
      }));
      const batches = batchAlerts(alerts, 10);
      expect(batches.length).toBe(3);
      expect(batches[0].length).toBe(10);
      expect(batches[2].length).toBe(5);
    });

    it('空列表返回空批次', () => {
      expect(batchAlerts([])).toEqual([]);
    });

    it('不足一批返回一批', () => {
      const alerts: Alert[] = [{
        id: '1', code: 'A', type: 'price', condition: 'gt',
        value: 1, currentValue: 2, triggered: true, message: '', priority: 'medium'
      }];
      expect(batchAlerts(alerts, 10).length).toBe(1);
    });

    it('总数应不变', () => {
      const alerts: Alert[] = Array.from({ length: 15 }, (_, i) => ({
        id: `${i}`, code: 'A', type: 'price' as const, condition: 'gt' as const,
        value: 1, currentValue: 2, triggered: true, message: '', priority: 'medium' as const
      }));
      const batches = batchAlerts(alerts, 5);
      const total = batches.reduce((s, b) => s + b.length, 0);
      expect(total).toBe(15);
    });
  });

  describe('预警统计', () => {
    it('应正确统计触发数', () => {
      const alerts: Alert[] = [
        { id: '1', code: 'A', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'high' },
        { id: '2', code: 'B', type: 'volume', condition: 'gt', value: 1, currentValue: 0, triggered: false, message: '', priority: 'low' },
        { id: '3', code: 'C', type: 'price', condition: 'gt', value: 1, currentValue: 3, triggered: true, message: '', priority: 'medium' },
      ];
      const stats = calcAlertStats(alerts);
      expect(stats.total).toBe(3);
      expect(stats.triggered).toBe(2);
    });

    it('应按类型统计', () => {
      const alerts: Alert[] = [
        { id: '1', code: 'A', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'high' },
        { id: '2', code: 'B', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'high' },
        { id: '3', code: 'C', type: 'volume', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'high' },
      ];
      const stats = calcAlertStats(alerts);
      expect(stats.byType['price']).toBe(2);
      expect(stats.byType['volume']).toBe(1);
    });

    it('应按优先级统计', () => {
      const alerts: Alert[] = [
        { id: '1', code: 'A', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'high' },
        { id: '2', code: 'B', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'high' },
        { id: '3', code: 'C', type: 'price', condition: 'gt', value: 1, currentValue: 2, triggered: true, message: '', priority: 'low' },
      ];
      const stats = calcAlertStats(alerts);
      expect(stats.byPriority['high']).toBe(2);
      expect(stats.byPriority['low']).toBe(1);
    });

    it('空列表统计应为零', () => {
      const stats = calcAlertStats([]);
      expect(stats.total).toBe(0);
      expect(stats.triggered).toBe(0);
    });

    it('全未触发统计正确', () => {
      const alerts: Alert[] = [
        { id: '1', code: 'A', type: 'price', condition: 'gt', value: 10, currentValue: 5, triggered: false, message: '', priority: 'high' },
      ];
      const stats = calcAlertStats(alerts);
      expect(stats.triggered).toBe(0);
    });
  });
});
