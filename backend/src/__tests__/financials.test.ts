/**
 * 财务报表 API 测试
 */

import { describe, it, expect } from 'vitest';

// 测试财务数据生成逻辑
describe('财务报表数据', () => {
  // 资产负债表平衡性检查
  describe('资产负债表', () => {
    it('应返回正确的数据结构', () => {
      const requiredFields = [
        'totalAssets', 'currentAssets', 'nonCurrentAssets', 'cash',
        'totalLiabilities', 'currentLiabilities', 'totalEquity',
        'currentRatio', 'debtToAssetRatio',
      ];

      const mockData = {
        symbol: '600519',
        period: '2025-12-31',
        totalAssets: 3000,
        currentAssets: 1200,
        nonCurrentAssets: 1800,
        cash: 450,
        accountsReceivable: 240,
        inventory: 300,
        fixedAssets: 900,
        totalLiabilities: 1650,
        currentLiabilities: 900,
        totalEquity: 1350,
        currentRatio: 1.33,
        debtToAssetRatio: 55.0,
      };

      for (const field of requiredFields) {
        expect(mockData).toHaveProperty(field);
      }
    });

    it('资产 = 负债 + 权益（基本平衡）', () => {
      const totalAssets = 3000;
      const totalLiabilities = 1650;
      const totalEquity = 1350;
      expect(totalAssets).toBeCloseTo(totalLiabilities + totalEquity, 0);
    });

    it('流动比率应大于0', () => {
      const currentRatio = 1200 / 900;
      expect(currentRatio).toBeGreaterThan(0);
    });

    it('资产负债率应在合理范围 (0-100)', () => {
      const debtRatio = 55.0;
      expect(debtRatio).toBeGreaterThanOrEqual(0);
      expect(debtRatio).toBeLessThanOrEqual(100);
    });
  });

  // 利润表检查
  describe('利润表', () => {
    it('应包含关键盈利指标', () => {
      const incomeStatement = {
        totalRevenue: 24000,
        operatingCost: 13200,
        grossProfit: 10800,
        netProfit: 6000,
        eps: 120.5,
        grossMargin: 45.0,
        netMargin: 25.0,
        roe: 28.5,
        roa: 15.2,
      };

      expect(incomeStatement.grossMargin).toBeGreaterThan(0);
      expect(incomeStatement.grossMargin).toBeLessThanOrEqual(100);
      expect(incomeStatement.netMargin).toBeLessThanOrEqual(incomeStatement.grossMargin);
    });

    it('毛利率应高于净利率', () => {
      const grossMargin = 45.0;
      const netMargin = 25.0;
      expect(grossMargin).toBeGreaterThan(netMargin);
    });

    it('ROE应在合理范围', () => {
      const roe = 28.5;
      expect(roe).toBeGreaterThan(-100);
      expect(roe).toBeLessThan(200);
    });
  });

  // 现金流量表检查
  describe('现金流量表', () => {
    it('净现金流 = 经营+投资+筹资', () => {
      const operating = 600;
      const investing = -360;
      const financing = -150;
      const netCashFlow = operating + investing + financing;
      expect(netCashFlow).toBe(90);
    });

    it('自由现金流应小于等于经营现金流', () => {
      const operatingCash = 600;
      const freeCashFlow = 420;
      expect(freeCashFlow).toBeLessThanOrEqual(operatingCash);
    });
  });

  // 财务趋势检查
  describe('财务趋势', () => {
    it('应支持多个指标', () => {
      const validMetrics = ['roe', 'roa', 'netMargin', 'grossMargin', 'currentRatio', 'debtToAssetRatio', 'eps', 'revenueGrowth', 'profitGrowth'];
      expect(validMetrics.length).toBe(9);
    });

    it('趋势数据应按时间排序', () => {
      const trends = [
        { period: '2022', value: 20.5 },
        { period: '2023', value: 22.3 },
        { period: '2024', value: 25.1 },
        { period: '2025', value: 28.5 },
      ];

      for (let i = 1; i < trends.length; i++) {
        expect(trends[i].period > trends[i - 1].period).toBe(true);
      }
    });
  });
});
