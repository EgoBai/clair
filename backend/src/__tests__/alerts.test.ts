import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 预警系统测试
 * 测试预警规则数据模型、消息生成、预警逻辑
 */

// ==================== 数据模型测试 ====================

interface AlertRule {
  id: number;
  userId: number;
  symbol: string;
  alertType: 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_surge';
  threshold: number;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  triggeredValue?: number;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

interface AlertHistoryEntry {
  id: number;
  alertId: number;
  symbol: string;
  alertType: string;
  threshold: number;
  actualValue: number;
  triggeredAt: string;
  message: string;
}

function createAlertRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 1,
    userId: 1,
    symbol: '600519.SH',
    alertType: 'price_above',
    threshold: 1800,
    isActive: true,
    isTriggered: false,
    message: '600519.SH 价格突破 1800元',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function generateAlertMessage(symbol: string, alertType: string, threshold: number): string {
  const typeMap: Record<string, string> = {
    price_above: '价格突破',
    price_below: '价格跌破',
    change_above: '涨幅超过',
    change_below: '跌幅超过',
    volume_surge: '成交量超过',
  };
  const unitMap: Record<string, string> = {
    price_above: '元',
    price_below: '元',
    change_above: '%',
    change_below: '%',
    volume_surge: '倍（均量）',
  };
  return `${symbol} ${typeMap[alertType]} ${threshold}${unitMap[alertType]}`;
}

function shouldTriggerAlert(alert: AlertRule, currentPrice: number, changePercent: number, volume: number): boolean {
  if (!alert.isActive || alert.isTriggered) return false;
  
  switch (alert.alertType) {
    case 'price_above':
      return currentPrice >= alert.threshold;
    case 'price_below':
      return currentPrice <= alert.threshold;
    case 'change_above':
      return changePercent >= alert.threshold;
    case 'change_below':
      return changePercent <= alert.threshold;
    case 'volume_surge':
      return volume >= alert.threshold;
    default:
      return false;
  }
}

describe('预警系统', () => {
  describe('预警规则数据模型', () => {
    it('应该创建有效的预警规则', () => {
      const rule = createAlertRule();
      expect(rule.id).toBe(1);
      expect(rule.symbol).toBe('600519.SH');
      expect(rule.alertType).toBe('price_above');
      expect(rule.threshold).toBe(1800);
      expect(rule.isActive).toBe(true);
      expect(rule.isTriggered).toBe(false);
    });

    it('应该支持5种预警类型', () => {
      const types = ['price_above', 'price_below', 'change_above', 'change_below', 'volume_surge'];
      types.forEach((type) => {
        const rule = createAlertRule({ alertType: type as any });
        expect(rule.alertType).toBe(type);
      });
    });

    it('应该包含时间戳字段', () => {
      const rule = createAlertRule();
      expect(rule.createdAt).toBeDefined();
      expect(rule.updatedAt).toBeDefined();
      expect(new Date(rule.createdAt).getTime()).not.toBeNaN();
    });
  });

  describe('预警消息生成', () => {
    it('应该为价格突破生成正确消息', () => {
      const msg = generateAlertMessage('600519.SH', 'price_above', 1800);
      expect(msg).toBe('600519.SH 价格突破 1800元');
    });

    it('应该为价格跌破生成正确消息', () => {
      const msg = generateAlertMessage('000001.SZ', 'price_below', 10);
      expect(msg).toBe('000001.SZ 价格跌破 10元');
    });

    it('应该为涨跌幅生成正确消息', () => {
      const msg1 = generateAlertMessage('600519.SH', 'change_above', 5);
      expect(msg1).toContain('涨幅超过');
      expect(msg1).toContain('5%');

      const msg2 = generateAlertMessage('600519.SH', 'change_below', -5);
      expect(msg2).toContain('跌幅超过');
    });

    it('应该为成交量异动生成正确消息', () => {
      const msg = generateAlertMessage('600519.SH', 'volume_surge', 3);
      expect(msg).toContain('成交量超过');
      expect(msg).toContain('3倍');
    });
  });

  describe('预警触发逻辑', () => {
    it('价格突破应该在价格>=阈值时触发', () => {
      const rule = createAlertRule({ alertType: 'price_above', threshold: 1800 });
      expect(shouldTriggerAlert(rule, 1850, 2, 10000)).toBe(true);
      expect(shouldTriggerAlert(rule, 1800, 2, 10000)).toBe(true);
      expect(shouldTriggerAlert(rule, 1750, 2, 10000)).toBe(false);
    });

    it('价格跌破应该在价格<=阈值时触发', () => {
      const rule = createAlertRule({ alertType: 'price_below', threshold: 1700 });
      expect(shouldTriggerAlert(rule, 1650, -2, 10000)).toBe(true);
      expect(shouldTriggerAlert(rule, 1700, -2, 10000)).toBe(true);
      expect(shouldTriggerAlert(rule, 1750, -2, 10000)).toBe(false);
    });

    it('涨幅预警应该在涨幅>=阈值时触发', () => {
      const rule = createAlertRule({ alertType: 'change_above', threshold: 5 });
      expect(shouldTriggerAlert(rule, 100, 6, 10000)).toBe(true);
      expect(shouldTriggerAlert(rule, 100, 5, 10000)).toBe(true);
      expect(shouldTriggerAlert(rule, 100, 4, 10000)).toBe(false);
    });

    it('跌幅预警应该在跌幅<=阈值时触发', () => {
      const rule = createAlertRule({ alertType: 'change_below', threshold: -5 });
      expect(shouldTriggerAlert(rule, 100, -6, 10000)).toBe(true);
      expect(shouldTriggerAlert(rule, 100, -5, 10000)).toBe(true);
      expect(shouldTriggerAlert(rule, 100, -4, 10000)).toBe(false);
    });

    it('已触发的预警不应该重复触发', () => {
      const rule = createAlertRule({ isTriggered: true, threshold: 1800 });
      expect(shouldTriggerAlert(rule, 1900, 5, 10000)).toBe(false);
    });

    it('未激活的预警不应该触发', () => {
      const rule = createAlertRule({ isActive: false, threshold: 1800 });
      expect(shouldTriggerAlert(rule, 1900, 5, 10000)).toBe(false);
    });

    it('成交量异动应该在成交量>=阈值时触发', () => {
      const rule = createAlertRule({ alertType: 'volume_surge', threshold: 50000 });
      expect(shouldTriggerAlert(rule, 100, 1, 60000)).toBe(true);
      expect(shouldTriggerAlert(rule, 100, 1, 40000)).toBe(false);
    });
  });

  describe('预警历史记录', () => {
    it('应该创建有效的预警历史条目', () => {
      const entry: AlertHistoryEntry = {
        id: 1,
        alertId: 1,
        symbol: '600519.SH',
        alertType: 'price_above',
        threshold: 1800,
        actualValue: 1850,
        triggeredAt: new Date().toISOString(),
        message: '600519.SH 价格突破 1800元',
      };
      expect(entry.alertId).toBe(1);
      expect(entry.actualValue).toBeGreaterThan(entry.threshold);
      expect(entry.triggeredAt).toBeDefined();
    });

    it('预警历史应该按时间倒序排列', () => {
      const now = Date.now();
      const entries: AlertHistoryEntry[] = [
        { id: 1, alertId: 1, symbol: 'A', alertType: 'price_above', threshold: 10, actualValue: 11, triggeredAt: new Date(now - 2000).toISOString(), message: '' },
        { id: 2, alertId: 2, symbol: 'B', alertType: 'price_below', threshold: 10, actualValue: 9, triggeredAt: new Date(now).toISOString(), message: '' },
        { id: 3, alertId: 3, symbol: 'C', alertType: 'change_above', threshold: 5, actualValue: 6, triggeredAt: new Date(now - 1000).toISOString(), message: '' },
      ];
      
      const sorted = [...entries].sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
      expect(sorted[0].symbol).toBe('B');
      expect(sorted[1].symbol).toBe('C');
      expect(sorted[2].symbol).toBe('A');
    });
  });
});
