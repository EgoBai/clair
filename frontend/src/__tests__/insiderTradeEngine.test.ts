import { describe, it, expect } from 'vitest';
import {
  analyzeInsiderTrades,
  analyzeSharePledge,
  InsiderTrade,
} from '../utils/insiderTradeEngine';

function makeTrades(): InsiderTrade[] {
  return [
    { ticker: '600519', name: '张三', role: 'ceo', type: 'buy', shares: 10000, price: 1750, date: '2026-03-01', afterHolding: 50000, holdingPct: 0.5 },
    { ticker: '600519', name: '李四', role: 'director', type: 'buy', shares: 5000, price: 1760, date: '2026-03-05', afterHolding: 20000, holdingPct: 0.2 },
    { ticker: '600519', name: '王五', role: 'cfo', type: 'sell', shares: 3000, price: 1820, date: '2026-03-10', afterHolding: 15000, holdingPct: 0.15 },
  ];
}

describe('Insider Trade Engine', () => {
  describe('analyzeInsiderTrades', () => {
    it('应汇总内部人交易', () => {
      const result = analyzeInsiderTrades(makeTrades(), 1800);
      expect(result.summary.buyCount).toBe(2);
      expect(result.summary.sellCount).toBe(1);
      expect(result.summary.totalBuyAmount).toBeGreaterThan(0);
    });

    it('应判断净方向', () => {
      const result = analyzeInsiderTrades(makeTrades(), 1800);
      expect(['buy', 'sell', 'neutral']).toContain(result.summary.netDirection);
    });

    it('应识别Top内部人', () => {
      const result = analyzeInsiderTrades(makeTrades(), 1800);
      expect(result.topInsiders.length).toBeLessThanOrEqual(5);
    });

    it('应检测CEO增持信号', () => {
      const result = analyzeInsiderTrades(makeTrades(), 1800);
      expect(result.signals.ceoBuying).toBe(true);
    });

    it('应计算信心指标', () => {
      const result = analyzeInsiderTrades(makeTrades(), 1800);
      expect(result.conviction).toBeGreaterThanOrEqual(0);
      expect(result.conviction).toBeLessThanOrEqual(100);
    });

    it('应生成建议', () => {
      const result = analyzeInsiderTrades(makeTrades(), 1800);
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('应处理空数据', () => {
      const result = analyzeInsiderTrades([], 100);
      expect(result.summary.netDirection).toBe('neutral');
      expect(result.conviction).toBe(50);
    });

    it('应检测集中增持', () => {
      const trades = [
        { ticker: '600519', name: '张三', role: 'ceo' as const, type: 'buy' as const, shares: 10000, price: 1750, date: '2026-03-01', afterHolding: 50000, holdingPct: 0.5 },
        { ticker: '600519', name: '李四', role: 'director' as const, type: 'buy' as const, shares: 5000, price: 1760, date: '2026-03-01', afterHolding: 20000, holdingPct: 0.2 },
        { ticker: '600519', name: '王五', role: 'supervisor' as const, type: 'buy' as const, shares: 3000, price: 1755, date: '2026-03-01', afterHolding: 10000, holdingPct: 0.1 },
      ];
      const result = analyzeInsiderTrades(trades, 1800);
      expect(result.signals.clusterBuying).toBe(true);
    });

    it('应检测高位减持', () => {
      const trades = [
        { ticker: '600519', name: '张三', role: 'ceo' as const, type: 'sell' as const, shares: 10000, price: 2200, date: '2026-03-01', afterHolding: 40000, holdingPct: 0.4 },
      ];
      const result = analyzeInsiderTrades(trades, 1800); // 当前价1800，减持价2200
      expect(result.signals.dumping).toBe(true);
    });
  });

  describe('analyzeSharePledge', () => {
    it('应计算总质押率', () => {
      const pledges = [
        { shareholder: '大股东A', shares: 5000, totalShares: 10000, price: 1500, isControlling: true },
        { shareholder: '股东B', shares: 2000, totalShares: 5000, price: 1600, isControlling: false },
      ];
      const result = analyzeSharePledge('600519', pledges, 1800);
      expect(result.totalPledgeRatio).toBeGreaterThan(0);
    });

    it('应评估风险等级', () => {
      const pledges = [
        { shareholder: '大股东A', shares: 4500, totalShares: 5000, price: 1000, isControlling: true },
      ];
      const result = analyzeSharePledge('600519', pledges, 1800);
      expect(['low', 'moderate', 'elevated', 'high', 'critical']).toContain(result.riskLevel);
    });

    it('应识别接近平仓线的质押', () => {
      const pledges = [
        { shareholder: '大股东A', shares: 5000, totalShares: 10000, price: 1500, isControlling: true },
      ];
      // 平仓线 = 1500 * 1.3 = 1950, 当前价1800 < 1950
      const result = analyzeSharePledge('600519', pledges, 1800);
      expect(result.nearLiquidation).toBeGreaterThanOrEqual(0);
    });

    it('应计算控股股东质押率', () => {
      const pledges = [
        { shareholder: '大股东A', shares: 5000, totalShares: 10000, price: 1500, isControlling: true },
        { shareholder: '股东B', shares: 2000, totalShares: 5000, price: 1600, isControlling: false },
      ];
      const result = analyzeSharePledge('600519', pledges, 1800);
      expect(result.controllingShareholderPledge).toBeGreaterThan(0);
    });

    it('应生成风险提示', () => {
      const pledges = [{ shareholder: '大股东A', shares: 5000, totalShares: 10000, price: 1500, isControlling: true }];
      const result = analyzeSharePledge('600519', pledges, 1800);
      expect(result.riskWarning.length).toBeGreaterThan(0);
    });
  });
});
