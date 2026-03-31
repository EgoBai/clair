import { describe, it, expect } from 'vitest';
import {
  checkCondition,
  processAlerts,
  generateAlertSummary,
  createAlertTemplates,
  validateAlert,
  type Alert,
  type AlertCondition,
  type PriceData,
  type AlertEvent,
} from '../utils/alertPushEngine';

function makeCondition(overrides: Partial<AlertCondition> = {}): AlertCondition {
  return {
    field: 'price',
    operator: 'gt',
    value: 100,
    ...overrides,
  };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'A001',
    ticker: '600519',
    type: 'price',
    condition: makeCondition(),
    status: 'active',
    createdAt: '2026-01-01',
    channels: ['websocket'],
    priority: 'medium',
    repeatable: false,
    cooldown: 0,
    ...overrides,
  };
}

function makePrice(overrides: Partial<PriceData> = {}): PriceData {
  return {
    ticker: '600519',
    price: 1800,
    prevClose: 1750,
    change: 50,
    changePercent: 2.86,
    volume: 5e7,
    high: 1820,
    low: 1740,
    limitUp: 1925,
    limitDown: 1575,
    ...overrides,
  };
}

describe('Alert Push Engine', () => {
  describe('checkCondition', () => {
    it('should check gt condition', () => {
      expect(checkCondition(makeCondition({ operator: 'gt', value: 100 }), 110)).toBe(true);
      expect(checkCondition(makeCondition({ operator: 'gt', value: 100 }), 90)).toBe(false);
    });

    it('should check lt condition', () => {
      expect(checkCondition(makeCondition({ operator: 'lt', value: 100 }), 90)).toBe(true);
      expect(checkCondition(makeCondition({ operator: 'lt', value: 100 }), 110)).toBe(false);
    });

    it('should check gte/lte', () => {
      expect(checkCondition(makeCondition({ operator: 'gte', value: 100 }), 100)).toBe(true);
      expect(checkCondition(makeCondition({ operator: 'lte', value: 100 }), 100)).toBe(true);
    });

    it('should check cross_above', () => {
      expect(checkCondition(makeCondition({ operator: 'cross_above', value: 100 }), 105, 95)).toBe(true);
      expect(checkCondition(makeCondition({ operator: 'cross_above', value: 100 }), 95, 105)).toBe(false);
      expect(checkCondition(makeCondition({ operator: 'cross_above', value: 100 }), 105)).toBe(false);
    });

    it('should check cross_below', () => {
      expect(checkCondition(makeCondition({ operator: 'cross_below', value: 100 }), 95, 105)).toBe(true);
      expect(checkCondition(makeCondition({ operator: 'cross_below', value: 100 }), 105, 95)).toBe(false);
    });
  });

  describe('processAlerts', () => {
    it('should trigger price alerts', () => {
      const alerts = [makeAlert({
        condition: { field: 'price', operator: 'gt', value: 1700 },
      })];
      const events = processAlerts(alerts, makePrice({ price: 1800 }));
      expect(events.length).toBe(1);
      expect(events[0].ticker).toBe('600519');
    });

    it('should not trigger when condition not met', () => {
      const alerts = [makeAlert({
        condition: { field: 'price', operator: 'gt', value: 2000 },
      })];
      const events = processAlerts(alerts, makePrice({ price: 1800 }));
      expect(events.length).toBe(0);
    });

    it('should skip non-active alerts', () => {
      const alerts = [makeAlert({ status: 'triggered' })];
      const events = processAlerts(alerts, makePrice());
      expect(events.length).toBe(0);
    });

    it('should skip expired alerts', () => {
      const alerts = [makeAlert({ expiresAt: '2025-01-01' })];
      const events = processAlerts(alerts, makePrice());
      expect(events.length).toBe(0);
    });

    it('should respect cooldown', () => {
      const justTriggered = new Date(Date.now() - 10000).toISOString();
      const alerts = [makeAlert({
        triggeredAt: justTriggered,
        cooldown: 60,
        condition: { field: 'price', operator: 'gt', value: 0 },
      })];
      const events = processAlerts(alerts, makePrice());
      expect(events.length).toBe(0);
    });

    it('should trigger change alerts', () => {
      const alerts = [makeAlert({
        type: 'change',
        condition: { field: 'changePercent', operator: 'gt', value: 2 },
      })];
      const events = processAlerts(alerts, makePrice({ changePercent: 5 }));
      expect(events.length).toBe(1);
    });
  });

  describe('generateAlertSummary', () => {
    it('should summarize recent events', () => {
      const now = new Date().toISOString();
      const events: AlertEvent[] = [
        { alertId: '1', ticker: 'A', type: 'price', message: 'test', timestamp: now, data: {}, delivered: [], failed: [] },
        { alertId: '2', ticker: 'B', type: 'change', message: 'test', timestamp: now, data: {}, delivered: [], failed: [] },
        { alertId: '3', ticker: 'A', type: 'volume', message: 'test', timestamp: now, data: {}, delivered: [], failed: [] },
      ];
      const summary = generateAlertSummary(events);

      expect(summary.total).toBe(3);
      expect(summary.byType['price']).toBe(1);
      expect(summary.byTicker['A']).toBe(2);
    });

    it('should filter old events', () => {
      const old = '2020-01-01T00:00:00Z';
      const events: AlertEvent[] = [
        { alertId: '1', ticker: 'A', type: 'price', message: 'old', timestamp: old, data: {}, delivered: [], failed: [] },
      ];
      const summary = generateAlertSummary(events, 3600000);
      expect(summary.total).toBe(0);
    });
  });

  describe('createAlertTemplates', () => {
    it('should create templates for a ticker', () => {
      const templates = createAlertTemplates('600519');
      expect(templates.length).toBeGreaterThan(0);
      templates.forEach(t => {
        expect(t.ticker).toBe('600519');
        expect(t.type).toBeDefined();
        expect(t.condition).toBeDefined();
      });
    });
  });

  describe('validateAlert', () => {
    it('should accept valid alert', () => {
      const result = validateAlert({
        ticker: '600519',
        type: 'price',
        condition: { field: 'price', operator: 'gt', value: 100 },
        channels: ['websocket'],
        cooldown: 60,
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject missing ticker', () => {
      const result = validateAlert({
        type: 'price',
        condition: { field: 'price', operator: 'gt', value: 100 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少股票代码');
    });

    it('should reject invalid operator', () => {
      const result = validateAlert({
        ticker: 'TEST',
        type: 'price',
        condition: { field: 'price', operator: 'invalid' as any, value: 100 },
      });
      expect(result.valid).toBe(false);
    });

    it('should reject negative cooldown', () => {
      const result = validateAlert({
        ticker: 'TEST',
        type: 'price',
        condition: { field: 'price', operator: 'gt', value: 100 },
        cooldown: -10,
      });
      expect(result.valid).toBe(false);
    });
  });
});
