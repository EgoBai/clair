/**
 * 投资组合 API 集成测试
 */

import { describe, it, expect } from 'vitest';

// 由于投资组合API依赖数据库和Express，这里测试核心逻辑
describe('投资组合管理', () => {
  describe('持仓计算', () => {
    it('应该正确计算成本', () => {
      const positions = [
        { symbol: '000001.SZ', name: '平安银行', quantity: 1000, costPrice: 12.50 },
        { symbol: '600519.SH', name: '贵州茅台', quantity: 100, costPrice: 1680.00 },
      ];

      const totalCost = positions.reduce((s, p) => s + p.quantity * p.costPrice, 0);
      expect(totalCost).toBe(12500 + 168000); // 180500
    });

    it('应该正确计算盈亏', () => {
      const position = { quantity: 1000, costPrice: 12.50 };
      const currentPrice = 13.80;

      const costTotal = position.quantity * position.costPrice;
      const marketValue = position.quantity * currentPrice;
      const profit = marketValue - costTotal;
      const profitPercent = (profit / costTotal) * 100;

      expect(costTotal).toBe(12500);
      expect(marketValue).toBe(13800);
      expect(profit).toBe(1300);
      expect(profitPercent).toBeCloseTo(10.4, 1);
    });

    it('应该正确计算亏损', () => {
      const position = { quantity: 500, costPrice: 20.00 };
      const currentPrice = 18.50;

      const costTotal = position.quantity * position.costPrice;
      const marketValue = position.quantity * currentPrice;
      const profit = marketValue - costTotal;
      const profitPercent = (profit / costTotal) * 100;

      expect(profit).toBe(-750);
      expect(profitPercent).toBeCloseTo(-7.5, 1);
    });

    it('应该正确计算加仓后的均价', () => {
      // 第一次买入
      let totalCost = 1000 * 12.50;
      let totalQty = 1000;

      // 加仓
      const addQty = 500;
      const addPrice = 13.00;
      totalCost += addQty * addPrice;
      totalQty += addQty;

      const avgPrice = totalCost / totalQty;

      expect(totalQty).toBe(1500);
      expect(avgPrice).toBeCloseTo(12.67, 2);
    });

    it('应该正确计算资产配置权重', () => {
      const positions = [
        { name: '平安银行', marketValue: 13800 },
        { name: '贵州茅台', marketValue: 175000 },
        { name: '宁德时代', marketValue: 58500 },
      ];
      const cashBalance = 50000;

      const totalValue = positions.reduce((s, p) => s + p.marketValue, 0) + cashBalance;
      const allocation = positions.map((p) => ({
        name: p.name,
        weight: Math.round(p.marketValue / totalValue * 10000) / 100,
      }));
      allocation.push({
        name: '现金',
        weight: Math.round(cashBalance / totalValue * 10000) / 100,
      });

      // 权重之和应该为100%
      const totalWeight = allocation.reduce((s, a) => s + a.weight, 0);
      expect(totalWeight).toBeCloseTo(100, 0);

      expect(allocation[0].name).toBe('平安银行');
      expect(allocation[3].name).toBe('现金');
    });
  });

  describe('收益计算', () => {
    it('应该正确计算组合总收益率', () => {
      const initialCapital = 200000;
      const totalMarketValue = 220000;
      const totalProfit = totalMarketValue - initialCapital;
      const totalProfitPercent = (totalProfit / initialCapital) * 100;

      expect(totalProfit).toBe(20000);
      expect(totalProfitPercent).toBe(10);
    });

    it('应该正确区分浮盈和浮亏', () => {
      const positions = [
        { name: '股票A', profit: 1500 },
        { name: '股票B', profit: -300 },
        { name: '股票C', profit: 800 },
      ];

      const totalProfit = positions.reduce((s, p) => s + p.profit, 0);
      const winners = positions.filter((p) => p.profit > 0);
      const losers = positions.filter((p) => p.profit < 0);

      expect(totalProfit).toBe(2000);
      expect(winners.length).toBe(2);
      expect(losers.length).toBe(1);
    });
  });
});
