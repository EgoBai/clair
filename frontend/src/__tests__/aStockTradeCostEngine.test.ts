import { describe, it, expect } from 'vitest';
import {
  calculateTradeCost,
  calculateRoundTripCost,
  calculateBatchTradeCost,
  compareBrokerCosts,
  calculateOptimalTradeAmount,
  DEFAULT_BROKERS,
  STAMP_DUTY_RATE,
  TRANSFER_FEE_RATE,
  HANDLING_FEE_RATE,
  REGULATORY_FEE_RATE,
} from '../utils/aStockTradeCostEngine';

/**
 * A股交易成本计算引擎测试
 */

describe('AStockTradeCostEngine', () => {
  describe('费率常量', () => {
    it('印花税率应为千分之一', () => {
      expect(STAMP_DUTY_RATE).toBe(0.001);
    });

    it('过户费率应为万分之0.1', () => {
      expect(TRANSFER_FEE_RATE).toBe(0.00001);
    });

    it('经手费率应为万分之0.487', () => {
      expect(HANDLING_FEE_RATE).toBe(0.0000487);
    });

    it('证管费率应为万分之0.02', () => {
      expect(REGULATORY_FEE_RATE).toBe(0.000002);
    });
  });

  describe('DEFAULT_BROKERS', () => {
    it('应包含标准费率', () => {
      expect(DEFAULT_BROKERS).toHaveProperty('standard');
      expect(DEFAULT_BROKERS.standard.commissionRate).toBe(2.5);
      expect(DEFAULT_BROKERS.standard.minCommission).toBe(5);
    });

    it('应包含低佣券商', () => {
      expect(DEFAULT_BROKERS).toHaveProperty('lowCost');
      expect(DEFAULT_BROKERS.lowCost.commissionRate).toBe(1.5);
    });

    it('应包含免五券商', () => {
      expect(DEFAULT_BROKERS).toHaveProperty('wuMian');
      expect(DEFAULT_BROKERS.wuMian.isWuMian).toBe(true);
      expect(DEFAULT_BROKERS.wuMian.minCommission).toBe(0);
    });

    it('应包含VIP费率', () => {
      expect(DEFAULT_BROKERS).toHaveProperty('vip');
      expect(DEFAULT_BROKERS.vip.commissionRate).toBe(0.8);
    });
  });

  describe('calculateTradeCost', () => {
    it('应该计算买入成本', () => {
      const cost = calculateTradeCost(10, 1000, 'buy', 'sh');
      expect(cost.tradeAmount).toBe(10000);
      expect(cost.commission).toBeGreaterThanOrEqual(0);
      expect(cost.stampDuty).toBe(0); // 买入无印花税
      expect(cost.totalCost).toBeGreaterThan(0);
    });

    it('应该计算卖出成本（含印花税）', () => {
      const cost = calculateTradeCost(10, 1000, 'sell', 'sh');
      expect(cost.tradeAmount).toBe(10000);
      expect(cost.stampDuty).toBe(10); // 千分之一
      expect(cost.totalCost).toBeGreaterThan(0);
    });

    it('沪市应收取过户费', () => {
      const shCost = calculateTradeCost(10, 10000, 'buy', 'sh');
      expect(shCost.transferFee).toBeGreaterThan(0);
    });

    it('深市也应收取过户费（2022年改革后统一）', () => {
      const szCost = calculateTradeCost(10, 10000, 'buy', 'sz');
      expect(szCost.transferFee).toBeGreaterThan(0);
    });

    it('北交所应收取过户费', () => {
      const bjCost = calculateTradeCost(10, 10000, 'buy', 'bj');
      expect(bjCost.transferFee).toBeGreaterThan(0);
    });

    it('标准费率小金额应有最低佣金', () => {
      const cost = calculateTradeCost(1, 100, 'buy', 'sh', DEFAULT_BROKERS.standard);
      expect(cost.commission).toBe(5); // 最低5元
    });

    it('免五券商小金额不应有最低佣金', () => {
      const cost = calculateTradeCost(1, 100, 'buy', 'sh', DEFAULT_BROKERS.wuMian);
      expect(cost.commission).toBeLessThan(5);
    });

    it('成本比例应合理', () => {
      const cost = calculateTradeCost(10, 10000, 'buy', 'sh');
      expect(cost.costRatio).toBeGreaterThan(0);
      expect(cost.costRatio).toBeLessThan(20); // 应在20个万分点以内
    });

    it('盈亏平衡涨幅应等于成本比例', () => {
      const cost = calculateTradeCost(10, 1000, 'buy', 'sh');
      expect(cost.breakevenMove).toBe(cost.costRatio);
    });

    it('零金额应返回零成本（免五券商）', () => {
      const cost = calculateTradeCost(0, 0, 'buy', 'sh', DEFAULT_BROKERS.wuMian);
      expect(cost.totalCost).toBe(0);
      expect(cost.costRatio).toBe(0);
    });

    it('零金额标准费率应有最低佣金', () => {
      const cost = calculateTradeCost(0, 0, 'buy', 'sh', DEFAULT_BROKERS.standard);
      expect(cost.commission).toBe(5);
    });

    it('成本应精确到分', () => {
      const cost = calculateTradeCost(12.345, 100, 'buy', 'sh');
      expect(cost.commission).toBe(5); // 最低佣金
      expect(Number.isFinite(cost.totalCost)).toBe(true);
    });
  });

  describe('calculateRoundTripCost', () => {
    it('应该计算完整的买卖成本', () => {
      const rt = calculateRoundTripCost(10, 1000, 'sh');
      expect(rt.buyCost.totalCost).toBeGreaterThan(0);
      expect(rt.sellCost.totalCost).toBeGreaterThan(0);
      expect(rt.totalCost).toBe(rt.buyCost.totalCost + rt.sellCost.totalCost);
    });

    it('卖出成本应高于买入成本（印花税）', () => {
      const rt = calculateRoundTripCost(10, 10000, 'sh');
      expect(rt.sellCost.totalCost).toBeGreaterThan(rt.buyCost.totalCost);
    });

    it('盈亏平衡涨幅应包含双向成本', () => {
      const rt = calculateRoundTripCost(10, 10000, 'sh');
      expect(rt.breakevenMove).toBeGreaterThan(0);
    });
  });

  describe('calculateBatchTradeCost', () => {
    it('应正确统计批量交易', () => {
      const trades = [
        { price: 10, quantity: 1000, side: 'buy' as const },
        { price: 11, quantity: 1000, side: 'sell' as const },
        { price: 12, quantity: 500, side: 'buy' as const },
      ];
      const stats = calculateBatchTradeCost(trades);
      expect(stats.totalTrades).toBe(3);
      expect(stats.totalAmount).toBeGreaterThan(0);
      expect(stats.totalCost).toBeGreaterThan(0);
      expect(stats.buyCosts).toBeGreaterThan(0);
      expect(stats.sellCosts).toBeGreaterThan(0);
    });

    it('空交易列表应返回零统计', () => {
      const stats = calculateBatchTradeCost([]);
      expect(stats.totalTrades).toBe(0);
      expect(stats.totalAmount).toBe(0);
      expect(stats.totalCost).toBe(0);
    });

    it('最大最小成本应正确', () => {
      const trades = [
        { price: 10, quantity: 100, side: 'buy' as const },
        { price: 100, quantity: 1000, side: 'sell' as const },
      ];
      const stats = calculateBatchTradeCost(trades);
      expect(stats.maxSingleCost).toBeGreaterThanOrEqual(stats.minSingleCost);
    });
  });

  describe('compareBrokerCosts', () => {
    it('应比较所有券商费率', () => {
      const comparison = compareBrokerCosts(10, 10000, 'buy', 'sh');
      expect(comparison.length).toBe(Object.keys(DEFAULT_BROKERS).length);
      comparison.forEach(item => {
        expect(item.broker).toBeDefined();
        expect(item.cost.totalCost).toBeGreaterThanOrEqual(0);
      });
    });

    it('VIP费率应低于标准费率', () => {
      const comparison = compareBrokerCosts(10, 10000, 'buy', 'sh');
      const standard = comparison.find(c => c.broker === '标准费率');
      const vip = comparison.find(c => c.broker === 'VIP费率');
      expect(standard).toBeDefined();
      expect(vip).toBeDefined();
      expect(vip!.cost.commission).toBeLessThan(standard!.cost.commission);
    });

    it('免五券商小额交易成本应更低', () => {
      const comparison = compareBrokerCosts(1, 100, 'buy', 'sh');
      const standard = comparison.find(c => c.broker === '标准费率');
      const wumian = comparison.find(c => c.broker === '免五券商');
      expect(standard!.cost.commission).toBe(5);
      expect(wumian!.cost.commission).toBeLessThan(5);
    });
  });

  describe('calculateOptimalTradeAmount', () => {
    it('标准费率应返回合理的最优金额', () => {
      const optimal = calculateOptimalTradeAmount(DEFAULT_BROKERS.standard);
      expect(optimal).toBe(20000); // 5元 / (2.5/10000) = 20000
    });

    it('免五券商应返回0', () => {
      const optimal = calculateOptimalTradeAmount(DEFAULT_BROKERS.wuMian);
      expect(optimal).toBe(0);
    });

    it('VIP费率应返回0', () => {
      const optimal = calculateOptimalTradeAmount(DEFAULT_BROKERS.vip);
      expect(optimal).toBe(0);
    });
  });

  describe('边界条件', () => {
    it('大额交易成本应正确', () => {
      const cost = calculateTradeCost(1000, 10000, 'buy', 'sh');
      expect(cost.tradeAmount).toBe(10000000);
      expect(cost.totalCost).toBeGreaterThan(0);
    });

    it('1股交易应正确处理', () => {
      const cost = calculateTradeCost(100, 1, 'buy', 'sh');
      expect(cost.tradeAmount).toBe(100);
      expect(cost.commission).toBe(5); // 最低佣金
    });

    it('不同市场买入成本应相同（过户费已统一）', () => {
      const shCost = calculateTradeCost(10, 10000, 'buy', 'sh');
      const szCost = calculateTradeCost(10, 10000, 'buy', 'sz');
      expect(shCost.totalCost).toBe(szCost.totalCost);
    });
  });
});
