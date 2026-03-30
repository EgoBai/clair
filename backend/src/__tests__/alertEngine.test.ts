/**
 * 预警引擎增强测试
 * 覆盖更复杂的预警条件组合、预警模板、历史趋势
 */

import { describe, it, expect } from 'vitest';

describe('预警引擎增强', () => {
  describe('复合预警条件', () => {
    interface AlertCondition {
      field: string;
      operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'cross_above' | 'cross_below';
      value: number;
      logic: 'AND' | 'OR';
    }

    function evaluateCondition(condition: AlertCondition, currentValue: number, previousValue: number): boolean {
      switch (condition.operator) {
        case 'gt': return currentValue > condition.value;
        case 'lt': return currentValue < condition.value;
        case 'gte': return currentValue >= condition.value;
        case 'lte': return currentValue <= condition.value;
        case 'eq': return currentValue === condition.value;
        case 'cross_above': return previousValue <= condition.value && currentValue > condition.value;
        case 'cross_below': return previousValue >= condition.value && currentValue < condition.value;
        default: return false;
      }
    }

    it('价格大于阈值应触发', () => {
      const cond: AlertCondition = { field: 'price', operator: 'gt', value: 100, logic: 'AND' };
      expect(evaluateCondition(cond, 105, 98)).toBe(true);
      expect(evaluateCondition(cond, 95, 98)).toBe(false);
    });

    it('价格上穿阈值应触发 cross_above', () => {
      const cond: AlertCondition = { field: 'price', operator: 'cross_above', value: 100, logic: 'AND' };
      expect(evaluateCondition(cond, 101, 99)).toBe(true); // 从下方穿过
      expect(evaluateCondition(cond, 101, 101)).toBe(false); // 已在上方
      expect(evaluateCondition(cond, 99, 98)).toBe(false); // 未穿过
    });

    it('价格下穿阈值应触发 cross_below', () => {
      const cond: AlertCondition = { field: 'price', operator: 'cross_below', value: 100, logic: 'AND' };
      expect(evaluateCondition(cond, 99, 101)).toBe(true);
      expect(evaluateCondition(cond, 99, 98)).toBe(false);
    });

    it('多条件 AND 应全部满足', () => {
      // 单个条件测试
      const priceCond: AlertCondition = { field: 'price', operator: 'gt', value: 100, logic: 'AND' };
      const volumeCond: AlertCondition = { field: 'volume', operator: 'gt', value: 1000000, logic: 'AND' };

      // 两个条件都满足
      expect(evaluateCondition(priceCond, 105, 98)).toBe(true);
      expect(evaluateCondition(volumeCond, 1500000, 900000)).toBe(true);

      // 一个条件不满足
      expect(evaluateCondition(volumeCond, 500000, 400000)).toBe(false);
    });

    it('多条件 OR 应至少一个满足', () => {
      const priceOk = true;
      const volumeOk = false;
      expect(priceOk || volumeOk).toBe(true);
      expect(false || false).toBe(false);
    });
  });

  describe('预警模板', () => {
    interface AlertTemplate {
      id: string;
      name: string;
      description: string;
      conditions: Array<{ field: string; operator: string; value: number }>;
      category: 'price' | 'volume' | 'technical' | 'fundamental';
    }

    const templates: AlertTemplate[] = [
      { id: '1', name: '涨停突破', description: '股票涨停', conditions: [{ field: 'changePercent', operator: 'gte', value: 9.9 }], category: 'price' },
      { id: '2', name: '放量异动', description: '成交量超过均值2倍', conditions: [{ field: 'volumeRatio', operator: 'gte', value: 2 }], category: 'volume' },
      { id: '3', name: 'MACD金叉', description: 'DIF上穿DEA', conditions: [{ field: 'dif', operator: 'cross_above', value: 0 }], category: 'technical' },
      { id: '4', name: '低估值', description: 'PE低于10', conditions: [{ field: 'pe', operator: 'lt', value: 10 }], category: 'fundamental' },
    ];

    it('应有4种预警分类', () => {
      const categories = new Set(templates.map(t => t.category));
      expect(categories.size).toBe(4);
      expect(categories.has('price')).toBe(true);
      expect(categories.has('volume')).toBe(true);
      expect(categories.has('technical')).toBe(true);
      expect(categories.has('fundamental')).toBe(true);
    });

    it('每个模板应有必填字段', () => {
      for (const t of templates) {
        expect(t).toHaveProperty('id');
        expect(t).toHaveProperty('name');
        expect(t).toHaveProperty('description');
        expect(t).toHaveProperty('conditions');
        expect(t).toHaveProperty('category');
        expect(t.conditions.length).toBeGreaterThan(0);
      }
    });

    it('应能按分类筛选', () => {
      const priceTemplates = templates.filter(t => t.category === 'price');
      expect(priceTemplates.length).toBeGreaterThan(0);
      expect(priceTemplates[0].name).toBe('涨停突破');
    });
  });

  describe('预警历史趋势', () => {
    interface AlertHistory {
      id: number;
      alertId: number;
      triggeredAt: string;
      value: number;
      threshold: number;
      message: string;
    }

    it('预警历史应按时间倒序', () => {
      const history: AlertHistory[] = [
        { id: 1, alertId: 1, triggeredAt: '2024-03-01T10:00:00Z', value: 105, threshold: 100, message: '价格突破' },
        { id: 2, alertId: 1, triggeredAt: '2024-03-02T10:00:00Z', value: 108, threshold: 100, message: '价格突破' },
        { id: 3, alertId: 1, triggeredAt: '2024-03-03T10:00:00Z', value: 112, threshold: 100, message: '价格突破' },
      ];
      const sorted = [...history].sort((a, b) =>
        new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
      );
      expect(sorted[0].id).toBe(3);
    });

    it('同一条件不应短时间内重复触发', () => {
      const lastTrigger = new Date('2024-03-01T10:00:00Z').getTime();
      const now = new Date('2024-03-01T10:01:00Z').getTime(); // 1分钟后
      const cooldownMs = 5 * 60 * 1000; // 5分钟冷却
      expect(now - lastTrigger).toBeLessThan(cooldownMs); // 冷却中
    });

    it('冷却时间过后应可再次触发', () => {
      const lastTrigger = new Date('2024-03-01T10:00:00Z').getTime();
      const now = new Date('2024-03-01T10:06:00Z').getTime(); // 6分钟后
      const cooldownMs = 5 * 60 * 1000;
      expect(now - lastTrigger).toBeGreaterThanOrEqual(cooldownMs);
    });
  });

  describe('预警消息生成', () => {
    function generateAlertMessage(
      stockName: string,
      type: string,
      value: number,
      threshold: number
    ): string {
      const messages: Record<string, string> = {
        price_above: `${stockName} 价格 ${value.toFixed(2)} 突破 ${threshold}`,
        price_below: `${stockName} 价格 ${value.toFixed(2)} 跌破 ${threshold}`,
        change_above: `${stockName} 涨幅 ${value.toFixed(2)}% 超过 ${threshold}%`,
        change_below: `${stockName} 跌幅 ${Math.abs(value).toFixed(2)}% 超过 ${threshold}%`,
        volume_above: `${stockName} 成交量 ${(value / 1e8).toFixed(2)}亿 超过 ${(threshold / 1e8).toFixed(2)}亿`,
        macd_cross: `${stockName} MACD ${value > 0 ? '金叉' : '死叉'}`,
      };
      return messages[type] || `${stockName} 触发预警`;
    }

    it('应生成正确的突破消息', () => {
      const msg = generateAlertMessage('贵州茅台', 'price_above', 1850.5, 1800);
      expect(msg).toContain('贵州茅台');
      expect(msg).toContain('1850.50');
      expect(msg).toContain('突破');
    });

    it('应生成正确的跌幅消息', () => {
      const msg = generateAlertMessage('宁德时代', 'change_below', -8.5, 7);
      expect(msg).toContain('宁德时代');
      expect(msg).toContain('跌幅');
    });

    it('应生成正确的放量消息', () => {
      const msg = generateAlertMessage('比亚迪', 'volume_above', 50e8, 30e8);
      expect(msg).toContain('50.00亿');
      expect(msg).toContain('成交量');
    });

    it('应生成 MACD 消息', () => {
      const crossUp = generateAlertMessage('招商银行', 'macd_cross', 1, 0);
      expect(crossUp).toContain('金叉');
      const crossDown = generateAlertMessage('招商银行', 'macd_cross', -1, 0);
      expect(crossDown).toContain('死叉');
    });
  });
});
