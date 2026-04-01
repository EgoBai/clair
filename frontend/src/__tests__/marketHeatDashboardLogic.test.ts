/**
 * 大盘热力图页面逻辑测试
 * 覆盖热力图数据、板块热度、资金流向
 */

import { describe, it, expect } from 'vitest';

describe('大盘热力图逻辑', () => {
  describe('热力图颜色映射', () => {
    function getHeatColor(changePercent: number): string {
      if (changePercent >= 5) return '#b91c1c';
      if (changePercent >= 3) return '#dc2626';
      if (changePercent >= 1) return '#ef4444';
      if (changePercent > 0) return '#fca5a5';
      if (changePercent === 0) return '#e5e7eb';
      if (changePercent > -1) return '#86efac';
      if (changePercent > -3) return '#22c55e';
      if (changePercent > -5) return '#16a34a';
      return '#15803d';
    }

    it('大幅上涨应为深红色', () => {
      expect(getHeatColor(7)).toBe('#b91c1c');
    });

    it('小幅上涨应为浅红色', () => {
      expect(getHeatColor(0.5)).toBe('#fca5a5');
    });

    it('平盘应为灰色', () => {
      expect(getHeatColor(0)).toBe('#e5e7eb');
    });

    it('小幅下跌应为浅绿色', () => {
      expect(getHeatColor(-0.5)).toBe('#86efac');
    });

    it('大幅下跌应为深绿色', () => {
      expect(getHeatColor(-7)).toBe('#15803d');
    });
  });

  describe('板块热力数据聚合', () => {
    interface StockHeat {
      symbol: string;
      changePercent: number;
      marketCap: number;
    }

    function aggregateSectorHeat(stocks: StockHeat[]): {
      avgChange: number;
      weightedChange: number;
      upCount: number;
      downCount: number;
    } {
      if (stocks.length === 0) return { avgChange: 0, weightedChange: 0, upCount: 0, downCount: 0 };
      const totalCap = stocks.reduce((s, st) => s + st.marketCap, 0);
      const avgChange = stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length;
      const weightedChange = totalCap > 0
        ? stocks.reduce((s, st) => s + st.changePercent * st.marketCap, 0) / totalCap
        : 0;
      return {
        avgChange: Math.round(avgChange * 100) / 100,
        weightedChange: Math.round(weightedChange * 100) / 100,
        upCount: stocks.filter(s => s.changePercent > 0).length,
        downCount: stocks.filter(s => s.changePercent < 0).length,
      };
    }

    it('应正确计算平均涨幅', () => {
      const stocks: StockHeat[] = [
        { symbol: 'A', changePercent: 5, marketCap: 1e10 },
        { symbol: 'B', changePercent: 3, marketCap: 1e10 },
      ];
      const result = aggregateSectorHeat(stocks);
      expect(result.avgChange).toBe(4);
    });

    it('应正确计算加权涨幅', () => {
      const stocks: StockHeat[] = [
        { symbol: 'A', changePercent: 10, marketCap: 1e10 },
        { symbol: 'B', changePercent: -2, marketCap: 1e10 },
      ];
      const result = aggregateSectorHeat(stocks);
      expect(result.weightedChange).toBe(4);
    });

    it('空数据应返回0', () => {
      const result = aggregateSectorHeat([]);
      expect(result.avgChange).toBe(0);
      expect(result.upCount).toBe(0);
    });
  });

  describe('资金流向热力数据', () => {
    interface FundFlow {
      mainInflow: number;
      mainOutflow: number;
      retailInflow: number;
      retailOutflow: number;
    }

    function calcFlowDirection(flow: FundFlow): { mainNet: number; retailNet: number; direction: 'inflow' | 'outflow' | 'neutral' } {
      const mainNet = flow.mainInflow - flow.mainOutflow;
      const retailNet = flow.retailInflow - flow.retailOutflow;
      const total = mainNet + retailNet;
      return {
        mainNet,
        retailNet,
        direction: total > 0 ? 'inflow' : total < 0 ? 'outflow' : 'neutral',
      };
    }

    it('主力净流入应标记为inflow', () => {
      const result = calcFlowDirection({
        mainInflow: 5e8, mainOutflow: 3e8,
        retailInflow: 1e8, retailOutflow: 2e8,
      });
      expect(result.mainNet).toBe(2e8);
      expect(result.direction).toBe('inflow');
    });

    it('资金净流出应标记为outflow', () => {
      const result = calcFlowDirection({
        mainInflow: 1e8, mainOutflow: 3e8,
        retailInflow: 1e8, retailOutflow: 2e8,
      });
      expect(result.direction).toBe('outflow');
    });
  });

  describe('TreeMap数据结构', () => {
    interface TreeMapItem {
      name: string;
      value: number;
      changePercent: number;
      children?: TreeMapItem[];
    }

    function buildTreeMap(sectors: { name: string; stocks: { name: string; marketCap: number; changePercent: number }[] }[]): TreeMapItem[] {
      return sectors.map(sector => ({
        name: sector.name,
        value: sector.stocks.reduce((s, st) => s + st.marketCap, 0),
        changePercent: sector.stocks.length > 0
          ? sector.stocks.reduce((s, st) => s + st.changePercent, 0) / sector.stocks.length
          : 0,
        children: sector.stocks.map(st => ({
          name: st.name,
          value: st.marketCap,
          changePercent: st.changePercent,
        })),
      }));
    }

    it('应正确构建TreeMap数据', () => {
      const data = buildTreeMap([{
        name: '科技',
        stocks: [
          { name: '腾讯', marketCap: 3e12, changePercent: 2 },
          { name: '阿里', marketCap: 2e12, changePercent: 1 },
        ],
      }]);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('科技');
      expect(data[0].value).toBe(5e12);
      expect(data[0].children).toHaveLength(2);
    });
  });

  describe('热度变化趋势', () => {
    function calcHeatTrend(historicalHeat: number[]): { trend: 'rising' | 'falling' | 'stable'; change: number } {
      if (historicalHeat.length < 2) return { trend: 'stable', change: 0 };
      const recent = historicalHeat[historicalHeat.length - 1];
      const prev = historicalHeat[historicalHeat.length - 2];
      const change = recent - prev;
      if (Math.abs(change) < 1) return { trend: 'stable', change };
      return { trend: change > 0 ? 'rising' : 'falling', change: Math.round(change * 100) / 100 };
    }

    it('上升趋势应标记rising', () => {
      expect(calcHeatTrend([10, 15, 20]).trend).toBe('rising');
    });

    it('下降趋势应标记falling', () => {
      expect(calcHeatTrend([20, 15, 10]).trend).toBe('falling');
    });

    it('小幅变化应标记stable', () => {
      expect(calcHeatTrend([10, 10.5]).trend).toBe('stable');
    });
  });
});
