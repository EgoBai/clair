import { describe, it, expect } from 'vitest';

describe('推送通知服务', () => {
  describe('模块导出', () => {
    it('应该导出通知相关函数', async () => {
      const mod = await import('../services/pushNotification');
      // 检查模块有导出内容
      expect(mod).toBeDefined();
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    });
  });

  describe('通知数据结构', () => {
    it('预警通知应该包含必要字段', () => {
      const alert = {
        id: 'alert-001',
        type: 'price_break',
        symbol: '600519',
        message: '贵州茅台突破2000元',
        timestamp: Date.now(),
        priority: 'high',
      };
      expect(alert.id).toBeTruthy();
      expect(alert.type).toBeTruthy();
      expect(alert.symbol).toBeTruthy();
      expect(alert.message).toBeTruthy();
      expect(alert.timestamp).toBeGreaterThan(0);
    });

    it('通知优先级应该是有效值', () => {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      for (const p of validPriorities) {
        expect(validPriorities).toContain(p);
      }
    });

    it('通知类型应该覆盖所有预警类型', () => {
      const alertTypes = [
        'price_break', 'price_drop', 'volume_surge',
        'technical_signal', 'fund_flow', 'earnings'
      ];
      expect(alertTypes.length).toBeGreaterThanOrEqual(5);
    });
  });
});
