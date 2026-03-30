import { describe, it, expect, beforeEach } from 'vitest';

// 合规监控引擎
interface TradeOrder { symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; timestamp: number; accountId: string }
interface ComplianceRule { id: string; type: 'position_limit' | 'concentration' | 'wash_sale' | 'insider' | 'frequency'; threshold: number; enabled: boolean }
interface ComplianceViolation { ruleId: string; severity: 'low' | 'medium' | 'high' | 'critical'; message: string; order: TradeOrder }

class ComplianceEngine {
  private rules: ComplianceRule[] = [];
  private violations: ComplianceViolation[] = [];
  private tradeHistory: TradeOrder[] = [];

  addRule(rule: ComplianceRule): void { this.rules.push(rule); }
  getRules(): ComplianceRule[] { return [...this.rules]; }
  getViolations(): ComplianceViolation[] { return [...this.violations]; }

  checkOrder(order: TradeOrder): ComplianceViolation[] {
    const orderViolations: ComplianceViolation[] = [];
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      switch (rule.type) {
        case 'position_limit':
          if (order.quantity > rule.threshold) {
            orderViolations.push({ ruleId: rule.id, severity: 'high', message: `持仓量 ${order.quantity} 超过限制 ${rule.threshold}`, order });
          }
          break;
        case 'frequency': {
          const recentTrades = this.tradeHistory.filter(t => t.accountId === order.accountId && order.timestamp - t.timestamp < 60000);
          if (recentTrades.length >= rule.threshold) {
            orderViolations.push({ ruleId: rule.id, severity: 'medium', message: `频繁交易: ${recentTrades.length}次/分钟`, order });
          }
          break;
        }
        case 'concentration': {
          const totalValue = this.tradeHistory.reduce((s, t) => s + t.price * t.quantity, 0) + order.price * order.quantity;
          const symbolValue = this.tradeHistory.filter(t => t.symbol === order.symbol).reduce((s, t) => s + t.price * t.quantity, 0) + order.price * order.quantity;
          const concentration = totalValue > 0 ? symbolValue / totalValue : 0;
          if (concentration > rule.threshold / 100) {
            orderViolations.push({ ruleId: rule.id, severity: 'high', message: `集中度 ${(concentration * 100).toFixed(1)}% 超过 ${rule.threshold}%`, order });
          }
          break;
        }
        case 'wash_sale': {
          const opposite = this.tradeHistory.find(t => t.symbol === order.symbol && t.side !== order.side && Math.abs(t.timestamp - order.timestamp) < 86400000 * 30);
          if (opposite) {
            orderViolations.push({ ruleId: rule.id, severity: 'critical', message: `疑似洗售交易: ${order.symbol}`, order });
          }
          break;
        }
      }
    }
    this.violations.push(...orderViolations);
    this.tradeHistory.push(order);
    return orderViolations;
  }

  static validateOrderFields(order: Partial<TradeOrder>): string[] {
    const errors: string[] = [];
    if (!order.symbol) errors.push('股票代码不能为空');
    if (!order.side || !['buy', 'sell'].includes(order.side)) errors.push('交易方向无效');
    if (!order.quantity || order.quantity <= 0) errors.push('数量必须为正');
    if (!order.price || order.price <= 0) errors.push('价格必须为正');
    if (!order.accountId) errors.push('账户ID不能为空');
    return errors;
  }

  static detectSuspiciousPatterns(orders: TradeOrder[]): { pattern: string; orders: TradeOrder[] }[] {
    const patterns: { pattern: string; orders: TradeOrder[] }[] = [];
    // Detect rapid buy-sell
    for (let i = 0; i < orders.length - 1; i++) {
      if (orders[i].side === 'buy' && orders[i + 1].side === 'sell' && orders[i].symbol === orders[i + 1].symbol) {
        if (orders[i + 1].timestamp - orders[i].timestamp < 60000) {
          patterns.push({ pattern: 'rapid_flip', orders: [orders[i], orders[i + 1]] });
        }
      }
    }
    // Detect round-trip trading
    for (let i = 0; i < orders.length - 1; i++) {
      for (let j = i + 1; j < orders.length; j++) {
        if (orders[i].symbol === orders[j].symbol && orders[i].side !== orders[j].side && orders[i].quantity === orders[j].quantity) {
          patterns.push({ pattern: 'round_trip', orders: [orders[i], orders[j]] });
        }
      }
    }
    return patterns;
  }

  generateReport(): { totalOrders: number; totalViolations: number; violationsByRule: Record<string, number>; violationsBySeverity: Record<string, number> } {
    const violationsByRule: Record<string, number> = {};
    const violationsBySeverity: Record<string, number> = {};
    for (const v of this.violations) {
      violationsByRule[v.ruleId] = (violationsByRule[v.ruleId] || 0) + 1;
      violationsBySeverity[v.severity] = (violationsBySeverity[v.severity] || 0) + 1;
    }
    return { totalOrders: this.tradeHistory.length, totalViolations: this.violations.length, violationsByRule, violationsBySeverity };
  }
}

describe('合规监控引擎', () => {
  let engine: ComplianceEngine;

  beforeEach(() => {
    engine = new ComplianceEngine();
    engine.addRule({ id: 'pos_limit', type: 'position_limit', threshold: 10000, enabled: true });
    engine.addRule({ id: 'freq_limit', type: 'frequency', threshold: 5, enabled: true });
    engine.addRule({ id: 'wash_sale', type: 'wash_sale', threshold: 0, enabled: true });
  });

  describe('规则管理', () => {
    it('应该添加规则', () => {
      expect(engine.getRules()).toHaveLength(3);
    });
    it('应该返回规则副本', () => {
      const rules = engine.getRules();
      rules.push({ id: 'x', type: 'position_limit', threshold: 1, enabled: true });
      expect(engine.getRules()).toHaveLength(3);
    });
  });

  describe('订单检查', () => {
    it('正常订单应无违规', () => {
      const order: TradeOrder = { symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: Date.now(), accountId: 'A1' };
      expect(engine.checkOrder(order)).toHaveLength(0);
    });
    it('超限持仓应触发违规', () => {
      const order: TradeOrder = { symbol: '600519', side: 'buy', quantity: 20000, price: 1800, timestamp: Date.now(), accountId: 'A1' };
      const violations = engine.checkOrder(order);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('high');
    });
    it('禁用规则不触发', () => {
      engine.addRule({ id: 'disabled', type: 'position_limit', threshold: 1, enabled: false });
      const order: TradeOrder = { symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: Date.now(), accountId: 'A1' };
      const violations = engine.checkOrder(order);
      expect(violations.find(v => v.ruleId === 'disabled')).toBeUndefined();
    });
    it('频繁交易应触发', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        engine.checkOrder({ symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: now + i * 1000, accountId: 'A1' });
      }
      const violations = engine.checkOrder({ symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: now + 5000, accountId: 'A1' });
      expect(violations.some(v => v.ruleId === 'freq_limit')).toBe(true);
    });
    it('不同账户频率独立', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        engine.checkOrder({ symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: now + i * 1000, accountId: 'A1' });
      }
      const violations = engine.checkOrder({ symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: now + 5000, accountId: 'A2' });
      expect(violations.find(v => v.ruleId === 'freq_limit')).toBeUndefined();
    });
  });

  describe('订单字段验证', () => {
    it('完整订单应无错误', () => {
      const order: TradeOrder = { symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: Date.now(), accountId: 'A1' };
      expect(ComplianceEngine.validateOrderFields(order)).toHaveLength(0);
    });
    it('缺少代码应报错', () => {
      expect(ComplianceEngine.validateOrderFields({ side: 'buy', quantity: 100, price: 1800, accountId: 'A1' }).length).toBeGreaterThan(0);
    });
    it('无效方向应报错', () => {
      expect(ComplianceEngine.validateOrderFields({ symbol: '600519', side: 'invalid' as any, quantity: 100, price: 1800, accountId: 'A1' }).length).toBeGreaterThan(0);
    });
    it('零数量应报错', () => {
      expect(ComplianceEngine.validateOrderFields({ symbol: '600519', side: 'buy', quantity: 0, price: 1800, accountId: 'A1' }).length).toBeGreaterThan(0);
    });
    it('负价格应报错', () => {
      expect(ComplianceEngine.validateOrderFields({ symbol: '600519', side: 'buy', quantity: 100, price: -1, accountId: 'A1' }).length).toBeGreaterThan(0);
    });
  });

  describe('可疑模式检测', () => {
    it('应该检测快速翻转', () => {
      const orders: TradeOrder[] = [
        { symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: 1000, accountId: 'A1' },
        { symbol: '600519', side: 'sell', quantity: 100, price: 1810, timestamp: 2000, accountId: 'A1' },
      ];
      const patterns = ComplianceEngine.detectSuspiciousPatterns(orders);
      expect(patterns.some(p => p.pattern === 'rapid_flip')).toBe(true);
    });
    it('应该检测往返交易', () => {
      const orders: TradeOrder[] = [
        { symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: 1000, accountId: 'A1' },
        { symbol: '000858', side: 'buy', quantity: 200, price: 150, timestamp: 2000, accountId: 'A1' },
        { symbol: '600519', side: 'sell', quantity: 100, price: 1810, timestamp: 3000, accountId: 'A1' },
      ];
      const patterns = ComplianceEngine.detectSuspiciousPatterns(orders);
      expect(patterns.some(p => p.pattern === 'round_trip')).toBe(true);
    });
    it('正常交易不应检测到模式', () => {
      const orders: TradeOrder[] = [
        { symbol: '600519', side: 'buy', quantity: 100, price: 1800, timestamp: 1000, accountId: 'A1' },
        { symbol: '600519', side: 'buy', quantity: 200, price: 1810, timestamp: 86400000 * 2, accountId: 'A1' },
      ];
      expect(ComplianceEngine.detectSuspiciousPatterns(orders)).toHaveLength(0);
    });
    it('应该处理空订单列表', () => {
      expect(ComplianceEngine.detectSuspiciousPatterns([])).toHaveLength(0);
    });
  });

  describe('报告生成', () => {
    it('应该生成统计报告', () => {
      engine.checkOrder({ symbol: '600519', side: 'buy', quantity: 20000, price: 1800, timestamp: Date.now(), accountId: 'A1' });
      const report = engine.generateReport();
      expect(report.totalOrders).toBe(1);
      expect(report.totalViolations).toBeGreaterThan(0);
    });
    it('应该按规则统计', () => {
      engine.checkOrder({ symbol: '600519', side: 'buy', quantity: 20000, price: 1800, timestamp: Date.now(), accountId: 'A1' });
      const report = engine.generateReport();
      expect(report.violationsByRule['pos_limit']).toBe(1);
    });
    it('应该按严重程度统计', () => {
      engine.checkOrder({ symbol: '600519', side: 'buy', quantity: 20000, price: 1800, timestamp: Date.now(), accountId: 'A1' });
      const report = engine.generateReport();
      expect(report.violationsBySeverity['high']).toBe(1);
    });
    it('空引擎报告应为零', () => {
      const report = engine.generateReport();
      expect(report.totalOrders).toBe(0);
      expect(report.totalViolations).toBe(0);
    });
  });
});
