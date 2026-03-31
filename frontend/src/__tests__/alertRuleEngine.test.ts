import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluateRule,
  evaluateRules,
  createPriceAlertTemplate,
  createVolumeAlertTemplate,
  createIndicatorAlertTemplate,
  calculateAlertStats,
  type AlertRule,
} from '../utils/alertRuleEngine';

describe('alertRuleEngine', () => {
  describe('evaluateCondition', () => {
    it('should evaluate gt', () => {
      expect(evaluateCondition(11, undefined, 'gt', 10)).toBe(true);
      expect(evaluateCondition(9, undefined, 'gt', 10)).toBe(false);
    });

    it('should evaluate lt', () => {
      expect(evaluateCondition(9, undefined, 'lt', 10)).toBe(true);
      expect(evaluateCondition(11, undefined, 'lt', 10)).toBe(false);
    });

    it('should evaluate cross_above', () => {
      expect(evaluateCondition(11, 9, 'cross_above', 10)).toBe(true);
      expect(evaluateCondition(11, 11, 'cross_above', 10)).toBe(false);
    });

    it('should evaluate cross_below', () => {
      expect(evaluateCondition(9, 11, 'cross_below', 10)).toBe(true);
      expect(evaluateCondition(9, 9, 'cross_below', 10)).toBe(false);
    });

    it('should evaluate change_pct', () => {
      expect(evaluateCondition(11, 10, 'change_pct', 5)).toBe(true);
      expect(evaluateCondition(10.2, 10, 'change_pct', 5)).toBe(false);
    });

    it('should evaluate eq', () => {
      expect(evaluateCondition(10, undefined, 'eq', 10)).toBe(true);
      expect(evaluateCondition(10.1, undefined, 'eq', 10)).toBe(false);
    });
  });

  describe('evaluateRule', () => {
    it('should trigger when condition met', () => {
      const rule: AlertRule = {
        id: 'r1', name: 'test', stockCode: '001', field: 'price',
        operator: 'gt', threshold: 10, level: 'warning',
        cooldownMinutes: 0, enabled: true, notificationChannels: ['push'], description: '',
      };
      const result = evaluateRule(rule, { price: 11 });
      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
    });

    it('should not trigger when disabled', () => {
      const rule: AlertRule = {
        id: 'r1', name: 'test', stockCode: '001', field: 'price',
        operator: 'gt', threshold: 10, level: 'warning',
        cooldownMinutes: 0, enabled: false, notificationChannels: ['push'], description: '',
      };
      const result = evaluateRule(rule, { price: 11 });
      expect(result).toBeNull();
    });

    it('should not trigger when condition not met', () => {
      const rule: AlertRule = {
        id: 'r1', name: 'test', stockCode: '001', field: 'price',
        operator: 'gt', threshold: 10, level: 'warning',
        cooldownMinutes: 0, enabled: true, notificationChannels: ['push'], description: '',
      };
      const result = evaluateRule(rule, { price: 9 });
      expect(result).toBeNull();
    });
  });

  describe('evaluateRules', () => {
    it('should evaluate multiple rules', () => {
      const rules: AlertRule[] = [
        { id: 'r1', name: 'A', stockCode: '001', field: 'price', operator: 'gt', threshold: 10, level: 'warning', cooldownMinutes: 0, enabled: true, notificationChannels: ['push'], description: '' },
        { id: 'r2', name: 'B', stockCode: '001', field: 'volume', operator: 'gt', threshold: 1000, level: 'info', cooldownMinutes: 0, enabled: true, notificationChannels: ['push'], description: '' },
      ];
      const data = new Map([['001', { price: 11, volume: 2000 }]]);
      const triggers = evaluateRules(rules, data);
      expect(triggers.length).toBe(2);
    });

    it('should respect cooldown', () => {
      const rules: AlertRule[] = [
        { id: 'r1', name: 'A', stockCode: '001', field: 'price', operator: 'gt', threshold: 10, level: 'warning', cooldownMinutes: 60, enabled: true, notificationChannels: ['push'], description: '' },
      ];
      const data = new Map([['001', { price: 11 }]]);
      const lastTimes = new Map([['r1', Date.now()]]);
      const triggers = evaluateRules(rules, data, undefined, lastTimes);
      expect(triggers.length).toBe(0);
    });

    it('should sort by severity', () => {
      const rules: AlertRule[] = [
        { id: 'r1', name: 'A', stockCode: '001', field: 'price', operator: 'gt', threshold: 10, level: 'info', cooldownMinutes: 0, enabled: true, notificationChannels: ['push'], description: '' },
        { id: 'r2', name: 'B', stockCode: '001', field: 'volume', operator: 'gt', threshold: 100, level: 'critical', cooldownMinutes: 0, enabled: true, notificationChannels: ['push'], description: '' },
      ];
      const data = new Map([['001', { price: 11, volume: 2000 }]]);
      const triggers = evaluateRules(rules, data);
      expect(triggers[0].level).toBe('critical');
    });
  });

  describe('templates', () => {
    it('should create price alert template', () => {
      const rule = createPriceAlertTemplate('001', 10, 'up', 5);
      expect(rule.operator).toBe('gte');
      expect(rule.threshold).toBeCloseTo(10.5);
    });

    it('should create volume alert template', () => {
      const rule = createVolumeAlertTemplate('001', 1000, 3);
      expect(rule.threshold).toBe(3000);
      expect(rule.level).toBe('critical');
    });

    it('should create indicator alert template', () => {
      const rule = createIndicatorAlertTemplate('001', 'rsi', 'gt', 80);
      expect(rule.field).toBe('rsi');
    });
  });

  describe('calculateAlertStats', () => {
    it('should calculate stats', () => {
      const rules: AlertRule[] = [
        { id: 'r1', name: 'A', stockCode: '001', field: 'price', operator: 'gt', threshold: 10, level: 'warning', cooldownMinutes: 0, enabled: true, notificationChannels: ['push'], description: '' },
      ];
      const triggers = [
        { ruleId: 'r1', ruleName: 'A', stockCode: '001', triggeredAt: new Date().toISOString(), currentValue: 11, threshold: 10, level: 'warning' as const, message: '', acknowledged: false },
      ];
      const stats = calculateAlertStats(rules, triggers);
      expect(stats.totalRules).toBe(1);
      expect(stats.activeRules).toBe(1);
    });
  });
});
