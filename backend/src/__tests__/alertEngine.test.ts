/**
 * 告警引擎测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { alertEngine } from '../services/alertEngine';
import type { AlertRule, AlertSeverity } from '../services/alertEngine';

describe('AlertEngine', () => {
  beforeEach(() => {
    alertEngine.clearHistory();
    // Remove all rules by getting stats
    const stats = alertEngine.getStats();
    // Reset is handled via direct operations
  });

  describe('addRule', () => {
    it('should add alert rules', () => {
      const rule: AlertRule = {
        id: 'cpu-high',
        name: 'CPU 使用率过高',
        description: 'CPU超过80%',
        severity: 'warning',
        condition: async () => false,
        channels: ['console'],
        cooldownMs: 60000,
        enabled: true,
      };

      alertEngine.addRule(rule);
      const stats = alertEngine.getStats();
      expect(stats.totalRules).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkAll', () => {
    it('should trigger alerts when condition is true', async () => {
      const rule: AlertRule = {
        id: 'test-alert-1',
        name: '测试告警',
        description: '测试用',
        severity: 'warning',
        condition: async () => true,
        channels: ['console'],
        cooldownMs: 0,
        enabled: true,
      };

      alertEngine.addRule(rule);
      const newAlerts = await alertEngine.checkAll();

      expect(newAlerts.length).toBeGreaterThanOrEqual(1);
      const testAlert = newAlerts.find((a) => a.ruleId === 'test-alert-1');
      expect(testAlert).toBeDefined();
      expect(testAlert!.severity).toBe('warning');
      expect(testAlert!.resolved).toBe(false);
    });

    it('should not trigger when condition is false', async () => {
      const rule: AlertRule = {
        id: 'test-alert-2',
        name: '不触发告警',
        description: '不会触发',
        severity: 'info',
        condition: async () => false,
        channels: ['console'],
        cooldownMs: 0,
        enabled: true,
      };

      alertEngine.addRule(rule);
      const newAlerts = await alertEngine.checkAll();
      expect(newAlerts.find((a) => a.ruleId === 'test-alert-2')).toBeUndefined();
    });

    it('should skip disabled rules', async () => {
      const rule: AlertRule = {
        id: 'disabled-rule',
        name: '禁用规则',
        description: '被禁用',
        severity: 'critical',
        condition: async () => true,
        channels: ['console'],
        cooldownMs: 0,
        enabled: false,
      };

      alertEngine.addRule(rule);
      const newAlerts = await alertEngine.checkAll();
      expect(newAlerts.find((a) => a.ruleId === 'disabled-rule')).toBeUndefined();
    });

    it('should respect cooldown', async () => {
      const rule: AlertRule = {
        id: 'cooldown-rule',
        name: '冷却规则',
        description: '有冷却',
        severity: 'warning',
        condition: async () => true,
        channels: ['console'],
        cooldownMs: 999999, // long cooldown
        enabled: true,
      };

      alertEngine.addRule(rule);
      await alertEngine.checkAll(); // first check
      const secondCheck = await alertEngine.checkAll();
      expect(secondCheck.find((a) => a.ruleId === 'cooldown-rule')).toBeUndefined();
    });
  });

  describe('resolveAlert', () => {
    it('should resolve active alerts', async () => {
      const rule: AlertRule = {
        id: 'resolve-test',
        name: '可解决告警',
        description: '测试解决',
        severity: 'info',
        condition: async () => true,
        channels: ['console'],
        cooldownMs: 0,
        enabled: true,
      };

      alertEngine.addRule(rule);
      const alerts = await alertEngine.checkAll();
      const alert = alerts.find((a) => a.ruleId === 'resolve-test');
      if (alert) {
        const resolved = alertEngine.resolveAlert(alert.id);
        expect(resolved).toBe(true);
        expect(alertEngine.getActiveAlerts().find((a) => a.id === alert.id)).toBeUndefined();
      }
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const stats = alertEngine.getStats();
      expect(stats).toHaveProperty('totalRules');
      expect(stats).toHaveProperty('activeRules');
      expect(stats).toHaveProperty('totalAlerts');
      expect(stats).toHaveProperty('activeAlerts');
      expect(stats).toHaveProperty('lastCheck');
    });
  });

  describe('getAllAlerts', () => {
    it('should return alert history', async () => {
      const alerts = alertEngine.getAllAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });
  });

  describe('severities', () => {
    it('should support all severity levels', async () => {
      const severities: AlertSeverity[] = ['info', 'warning', 'critical'];

      for (const sev of severities) {
        const rule: AlertRule = {
          id: `sev-${sev}`,
          name: `${sev} 告警`,
          description: '测试',
          severity: sev,
          condition: async () => true,
          channels: ['console'],
          cooldownMs: 0,
          enabled: true,
        };
        alertEngine.addRule(rule);
      }

      const alerts = await alertEngine.checkAll();
      const sevAlerts = alerts.filter((a) => a.ruleId.startsWith('sev-'));
      expect(sevAlerts.length).toBeGreaterThanOrEqual(3);
    });
  });
});
