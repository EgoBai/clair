/**
 * 板块资金流向逻辑测试
 * 覆盖资金流向计算、主力追踪、板块轮动
 */

import { describe, it, expect } from 'vitest';

describe('板块资金流向', () => {
  describe('资金流向计算', () => {
    interface FlowData {
      mainIn: number;
      mainOut: number;
      retailIn: number;
      retailOut: number;
    }

    function calcFundFlow(data: FlowData): {
      mainNet: number;
      retailNet: number;
      totalNet: number;
      mainRatio: number;
    } {
      const mainNet = data.mainIn - data.mainOut;
      const retailNet = data.retailIn - data.retailOut;
      const totalNet = mainNet + retailNet;
      const totalFlow = data.mainIn + data.mainOut + data.retailIn + data.retailOut;
      const mainRatio = totalFlow > 0 ? Math.round(((data.mainIn + data.mainOut) / totalFlow) * 100) : 0;
      return { mainNet, retailNet, totalNet, mainRatio };
    }

    it('应正确计算主力和散户净流入', () => {
      const result = calcFundFlow({
        mainIn: 5e8, mainOut: 3e8,
        retailIn: 2e8, retailOut: 4e8,
      });
      expect(result.mainNet).toBe(2e8);
      expect(result.retailNet).toBe(-2e8);
      expect(result.totalNet).toBe(0);
    });
  });

  describe('板块资金排名', () => {
    interface SectorFlow {
      name: string;
      mainNet: number;
      changePercent: number;
    }

    function rankSectors(sectors: SectorFlow[], by: 'mainNet' | 'changePercent' = 'mainNet'): SectorFlow[] {
      return [...sectors].sort((a, b) => b[by] - a[by]);
    }

    function getHotSectors(sectors: SectorFlow[], topN: number = 5): SectorFlow[] {
      return rankSectors(sectors).slice(0, topN);
    }

    function getColdSectors(sectors: SectorFlow[], topN: number = 5): SectorFlow[] {
      return rankSectors(sectors).slice(-topN).reverse();
    }

    it('应正确获取热门板块', () => {
      const sectors: SectorFlow[] = [
        { name: '科技', mainNet: 5e8, changePercent: 3 },
        { name: '消费', mainNet: -2e8, changePercent: -1 },
        { name: '医药', mainNet: 3e8, changePercent: 2 },
      ];
      const hot = getHotSectors(sectors, 2);
      expect(hot[0].name).toBe('科技');
      expect(hot[1].name).toBe('医药');
    });
  });

  describe('连续资金流向', () => {
    function detectContinuousFlow(dailyFlows: number[]): { direction: 'inflow' | 'outflow' | 'mixed'; days: number } {
      if (dailyFlows.length === 0) return { direction: 'mixed', days: 0 };
      let consecutiveInflow = 0, consecutiveOutflow = 0;
      let maxInflow = 0, maxOutflow = 0;

      for (const flow of dailyFlows) {
        if (flow > 0) {
          consecutiveInflow++;
          consecutiveOutflow = 0;
          maxInflow = Math.max(maxInflow, consecutiveInflow);
        } else if (flow < 0) {
          consecutiveOutflow++;
          consecutiveInflow = 0;
          maxOutflow = Math.max(maxOutflow, consecutiveOutflow);
        }
      }

      if (maxInflow > maxOutflow) return { direction: 'inflow', days: maxInflow };
      if (maxOutflow > maxInflow) return { direction: 'outflow', days: maxOutflow };
      return { direction: 'mixed', days: 0 };
    }

    it('连续流入应标记inflow', () => {
      expect(detectContinuousFlow([1, 2, 3, -1]).direction).toBe('inflow');
    });

    it('连续流出应标记outflow', () => {
      expect(detectContinuousFlow([-1, -2, -3, 1]).direction).toBe('outflow');
    });

    it('应正确计算连续天数', () => {
      const result = detectContinuousFlow([1, 2, 3, 4, -1, -2]);
      expect(result.days).toBe(4);
    });
  });

  describe('主力资金追踪', () => {
    interface MainForceAction {
      date: string;
      action: 'buy' | 'sell';
      amount: number;
      price: number;
    }

    function trackMainForce(actions: MainForceAction[]): {
      totalBuy: number;
      totalSell: number;
      netPosition: number;
      avgBuyPrice: number;
      avgSellPrice: number;
    } {
      const buys = actions.filter(a => a.action === 'buy');
      const sells = actions.filter(a => a.action === 'sell');
      const totalBuy = buys.reduce((s, a) => s + a.amount, 0);
      const totalSell = sells.reduce((s, a) => s + a.amount, 0);
      const avgBuyPrice = totalBuy > 0
        ? Math.round(buys.reduce((s, a) => s + a.price * a.amount, 0) / totalBuy * 100) / 100
        : 0;
      const avgSellPrice = totalSell > 0
        ? Math.round(sells.reduce((s, a) => s + a.price * a.amount, 0) / totalSell * 100) / 100
        : 0;
      return { totalBuy, totalSell, netPosition: totalBuy - totalSell, avgBuyPrice, avgSellPrice };
    }

    it('应正确追踪主力资金', () => {
      const actions: MainForceAction[] = [
        { date: '2024-01-01', action: 'buy', amount: 1e8, price: 100 },
        { date: '2024-01-02', action: 'buy', amount: 5e7, price: 102 },
        { date: '2024-01-03', action: 'sell', amount: 8e7, price: 105 },
      ];
      const result = trackMainForce(actions);
      expect(result.totalBuy).toBe(1.5e8);
      expect(result.totalSell).toBe(8e7);
      expect(result.netPosition).toBe(7e7);
      expect(result.avgBuyPrice).toBe(100.67);
    });
  });
});
