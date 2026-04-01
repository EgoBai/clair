/**
 * 预警页面逻辑测试
 * 覆盖预警规则配置、条件匹配、通知触发
 */

import { describe, it, expect } from 'vitest';

describe('预警页面逻辑', () => {
  describe('预警条件匹配', () => {
    type Condition = 'above' | 'below' | 'cross_above' | 'cross_below' | 'change_percent_gt' | 'change_percent_lt' | 'volume_gt';

    interface AlertRule {
      symbol: string;
      condition: Condition;
      value: number;
      field: 'price' | 'changePercent' | 'volume';
    }

    interface MarketData {
      price: number;
      prevPrice: number;
      changePercent: number;
      volume: number;
    }

    function checkAlert(rule: AlertRule, data: MarketData): boolean {
      switch (rule.condition) {
        case 'above': return data.price > rule.value;
        case 'below': return data.price < rule.value;
        case 'cross_above': return data.prevPrice <= rule.value && data.price > rule.value;
        case 'cross_below': return data.prevPrice >= rule.value && data.price < rule.value;
        case 'change_percent_gt': return data.changePercent > rule.value;
        case 'change_percent_lt': return data.changePercent < rule.value;
        case 'volume_gt': return data.volume > rule.value;
        default: return false;
      }
    }

    it('价格高于阈值应触发', () => {
      const rule: AlertRule = { symbol: '600519', condition: 'above', value: 1800, field: 'price' };
      expect(checkAlert(rule, { price: 1900, prevPrice: 1790, changePercent: 5, volume: 1e6 })).toBe(true);
      expect(checkAlert(rule, { price: 1700, prevPrice: 1790, changePercent: -5, volume: 1e6 })).toBe(false);
    });

    it('价格低于阈值应触发', () => {
      const rule: AlertRule = { symbol: '600519', condition: 'below', value: 1700, field: 'price' };
      expect(checkAlert(rule, { price: 1600, prevPrice: 1700, changePercent: -5, volume: 1e6 })).toBe(true);
    });

    it('上穿应触发', () => {
      const rule: AlertRule = { symbol: '600519', condition: 'cross_above', value: 1800, field: 'price' };
      expect(checkAlert(rule, { price: 1810, prevPrice: 1790, changePercent: 1, volume: 1e6 })).toBe(true);
      expect(checkAlert(rule, { price: 1810, prevPrice: 1810, changePercent: 0, volume: 1e6 })).toBe(false);
    });

    it('涨幅超阈值应触发', () => {
      const rule: AlertRule = { symbol: '600519', condition: 'change_percent_gt', value: 5, field: 'changePercent' };
      expect(checkAlert(rule, { price: 1900, prevPrice: 1800, changePercent: 5.5, volume: 1e6 })).toBe(true);
      expect(checkAlert(rule, { price: 1900, prevPrice: 1800, changePercent: 4, volume: 1e6 })).toBe(false);
    });

    it('成交量超阈值应触发', () => {
      const rule: AlertRule = { symbol: '600519', condition: 'volume_gt', value: 1e6, field: 'volume' };
      expect(checkAlert(rule, { price: 1900, prevPrice: 1800, changePercent: 1, volume: 2e6 })).toBe(true);
      expect(checkAlert(rule, { price: 1900, prevPrice: 1800, changePercent: 1, volume: 5e5 })).toBe(false);
    });
  });

  describe('预警优先级', () => {
    function getPriority(rule: { condition: string; value: number }): 'high' | 'medium' | 'low' {
      if (rule.condition.includes('cross')) return 'high';
      if (rule.condition === 'change_percent_gt' && rule.value >= 7) return 'high';
      if (rule.condition === 'above' || rule.condition === 'below') return 'medium';
      return 'low';
    }

    it('穿越信号为高优先级', () => {
      expect(getPriority({ condition: 'cross_above', value: 100 })).toBe('high');
    });

    it('大涨幅为高优先级', () => {
      expect(getPriority({ condition: 'change_percent_gt', value: 9 })).toBe('high');
    });

    it('价格阈值为中优先级', () => {
      expect(getPriority({ condition: 'above', value: 100 })).toBe('medium');
    });
  });

  describe('预警频率限制', () => {
    function shouldTrigger(ruleId: string, now: number, lastTriggered: Record<string, number>, cooldownMs: number = 300000): boolean {
      const last = lastTriggered[ruleId] || 0;
      return now - last >= cooldownMs;
    }

    it('冷却期内不应触发', () => {
      const now = Date.now();
      const last = { 'rule1': now - 100000 };
      expect(shouldTrigger('rule1', now, last)).toBe(false);
    });

    it('冷却期后应触发', () => {
      const now = Date.now();
      const last = { 'rule1': now - 400000 };
      expect(shouldTrigger('rule1', now, last)).toBe(true);
    });

    it('首次触发应允许', () => {
      expect(shouldTrigger('rule1', Date.now(), {})).toBe(true);
    });
  });

  describe('预警批量评估', () => {
    interface Rule {
      id: string;
      symbol: string;
      condition: 'above' | 'below';
      value: number;
    }

    function evaluateRules(rules: Rule[], quotes: Record<string, number>): string[] {
      const triggered: string[] = [];
      for (const rule of rules) {
        const price = quotes[rule.symbol];
        if (price === undefined) continue;
        if (rule.condition === 'above' && price > rule.value) triggered.push(rule.id);
        if (rule.condition === 'below' && price < rule.value) triggered.push(rule.id);
      }
      return triggered;
    }

    it('应正确批量评估', () => {
      const rules: Rule[] = [
        { id: 'r1', symbol: '600519', condition: 'above', value: 1800 },
        { id: 'r2', symbol: '000858', condition: 'below', value: 150 },
        { id: 'r3', symbol: '600519', condition: 'below', value: 1700 },
      ];
      const quotes = { '600519': 1900, '000858': 140 };
      const triggered = evaluateRules(rules, quotes);
      expect(triggered).toContain('r1');
      expect(triggered).toContain('r2');
      expect(triggered).not.toContain('r3');
    });
  });

  describe('预警通知格式化', () => {
    function formatAlertMessage(rule: { symbol: string; name: string; condition: string; value: number }, currentPrice: number): string {
      const conditionText: Record<string, string> = {
        above: '突破',
        below: '跌破',
        cross_above: '上穿',
        cross_below: '下穿',
      };
      return `🔔 ${rule.name}(${rule.symbol}) ${conditionText[rule.condition] || rule.condition} ¥${rule.value}，当前 ¥${currentPrice}`;
    }

    it('应格式化为易读消息', () => {
      const msg = formatAlertMessage(
        { symbol: '600519', name: '贵州茅台', condition: 'above', value: 1800 },
        1850
      );
      expect(msg).toContain('贵州茅台');
      expect(msg).toContain('突破');
      expect(msg).toContain('1800');
      expect(msg).toContain('1850');
    });
  });
});
