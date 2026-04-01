import { describe, it, expect } from 'vitest';
import { StockConnectEngine } from '../utils/stockConnectDeepEngine';
import type { AHStock } from '../utils/stockConnectDeepEngine';

describe('港股通深度分析引擎', () => {
  const engine = new StockConnectEngine();

  const createAHStock = (overrides: Partial<AHStock> = {}): AHStock => ({
    codeA: '000001',
    codeH: '00001.HK',
    name: '平安银行',
    priceA: 12,
    priceH: 10,
    exchangeRate: 0.9,
    industry: '银行',
    ...overrides
  });

  describe('calculateAHPremium', () => {
    it('计算AH溢价率', () => {
      const result = engine.calculateAHPremium(createAHStock());
      expect(result.premium).toBeGreaterThan(0);
      expect(result.priceHInRMB).toBeCloseTo(10 / 0.9);
    });

    it('H股价格转人民币', () => {
      const result = engine.calculateAHPremium(createAHStock({ priceH: 9, exchangeRate: 0.9 }));
      expect(result.priceHInRMB).toBeCloseTo(10);
    });

    it('A股便宜时建议买A', () => {
      const result = engine.calculateAHPremium(createAHStock({ priceA: 8, priceH: 15 }), 30);
      expect(result.signal).toBe('buy_A');
    });

    it('A股贵时建议买H', () => {
      const result = engine.calculateAHPremium(createAHStock({ priceA: 20, priceH: 5 }), 10);
      expect(result.signal).toBe('buy_H');
    });

    it('包含Z-Score', () => {
      const result = engine.calculateAHPremium(createAHStock(), 30);
      expect(typeof result.premiumZScore).toBe('number');
    });

    it('汇率为0时不报错', () => {
      const result = engine.calculateAHPremium(createAHStock({ exchangeRate: 0 }));
      expect(isNaN(result.premium) || result.premium === 0).toBe(true);
    });
  });

  describe('rankAHPremiums', () => {
    it('按溢价率降序排列', () => {
      const stocks = [
        createAHStock({ codeA: 'A1', priceA: 10, priceH: 8 }),
        createAHStock({ codeA: 'A2', priceA: 15, priceH: 8 }),
        createAHStock({ codeA: 'A3', priceA: 12, priceH: 8 }),
      ];
      const result = engine.rankAHPremiums(stocks, new Map());
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].premium).toBeGreaterThanOrEqual(result[i].premium);
      }
    });

    it('空数组返回空', () => {
      expect(engine.rankAHPremiums([], new Map())).toEqual([]);
    });
  });

  describe('summarizeStockConnect', () => {
    it('汇总南北向资金', () => {
      const north = [{ date: '2024-01-15', netBuy: 50, volume: 500 }];
      const south = [{ date: '2024-01-15', netBuy: 30, volume: 300 }];
      const result = engine.summarizeStockConnect(north, south);
      expect(result.length).toBe(1);
      expect(result[0].totalConnect).toBe(800);
    });

    it('市场情绪判断', () => {
      const north = [{ date: '2024-01-15', netBuy: 100, volume: 1000 }];
      const south = [{ date: '2024-01-15', netBuy: 0, volume: 100 }];
      const result = engine.summarizeStockConnect(north, south);
      expect(result[0].marketSentiment).toBe('risk_on');
    });

    it('净流出→risk_off', () => {
      const north = [{ date: '2024-01-15', netBuy: -100, volume: 500 }];
      const result = engine.summarizeStockConnect(north, []);
      expect(result[0].marketSentiment).toBe('risk_off');
    });

    it('按日期排序', () => {
      const north = [
        { date: '2024-01-16', netBuy: 10, volume: 100 },
        { date: '2024-01-15', netBuy: 20, volume: 200 },
      ];
      const result = engine.summarizeStockConnect(north, []);
      expect(result[0].date).toBe('2024-01-15');
    });
  });

  describe('analyzeCrossBorderFlow', () => {
    it('分析跨境资金', () => {
      const holdings = [
        { stockCode: '000001', date: '2024-01-01', shares: 1000, channel: 'north' as const },
        { stockCode: '000001', date: '2024-01-02', shares: 1100, channel: 'north' as const },
        { stockCode: '000001', date: '2024-01-03', shares: 1200, channel: 'north' as const },
      ];
      const result = engine.analyzeCrossBorderFlow(holdings);
      expect(result.length).toBe(1);
      expect(result[0].trend).toBe('accumulating');
    });

    it('减持趋势', () => {
      const holdings = [
        { stockCode: '000001', date: '2024-01-01', shares: 1500, channel: 'north' as const },
        { stockCode: '000001', date: '2024-01-02', shares: 1200, channel: 'north' as const },
        { stockCode: '000001', date: '2024-01-03', shares: 1000, channel: 'north' as const },
      ];
      const result = engine.analyzeCrossBorderFlow(holdings);
      expect(result[0].trend).toBe('distributing');
    });

    it('持仓变动百分比', () => {
      const holdings = [
        { stockCode: '000001', date: '2024-01-01', shares: 1000, channel: 'south' as const },
        { stockCode: '000001', date: '2024-01-02', shares: 1500, channel: 'south' as const },
      ];
      const result = engine.analyzeCrossBorderFlow(holdings);
      expect(result[0].holdingChange).toBeCloseTo(50);
    });

    it('空数据返回空', () => {
      expect(engine.analyzeCrossBorderFlow([])).toEqual([]);
    });
  });

  describe('analyzePremiumMeanReversion', () => {
    it('计算均值回归分析', () => {
      const premiums = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        premium: 30 + Math.sin(i) * 10
      }));
      const result = engine.analyzePremiumMeanReversion(premiums);
      expect(result.avgPremium).toBeGreaterThan(0);
      expect(result.stdDev).toBeGreaterThan(0);
    });

    it('Z-Score过高→回归信号', () => {
      const premiums = [
        ...Array.from({ length: 20 }, (_, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, premium: 30 })),
        { date: '2024-01-21', premium: 80 },
      ];
      const result = engine.analyzePremiumMeanReversion(premiums);
      expect(result.signal).toBe('revert_high');
    });

    it('空数据返回默认', () => {
      const result = engine.analyzePremiumMeanReversion([]);
      expect(result.signal).toBe('stable');
    });

    it('百分位在0-100之间', () => {
      const premiums = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        premium: i * 10
      }));
      const result = engine.analyzePremiumMeanReversion(premiums);
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
    });

    it('均值回归概率在0-1之间', () => {
      const premiums = Array.from({ length: 20 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        premium: 30 + i * 2
      }));
      const result = engine.analyzePremiumMeanReversion(premiums);
      expect(result.meanReversionProb).toBeGreaterThanOrEqual(0);
      expect(result.meanReversionProb).toBeLessThanOrEqual(1);
    });
  });
});
