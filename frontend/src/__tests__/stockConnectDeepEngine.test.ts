import { describe, it, expect } from 'vitest';

/**
 * 沪深港通深度分析引擎测试
 */

interface StockConnectFlow {
  date: string;
  northbound: { netBuy: number; buyAmount: number; sellAmount: number; topBuys: string[]; topSells: string[] };
  southbound: { netBuy: number; buyAmount: number; sellAmount: number; };
}

interface FlowAnalysis {
  trend: 'inflow' | 'outflow' | 'neutral';
  avgDailyFlow: number;
  cumulativeFlow: number;
  volatility: number;
  consecutiveDays: number;
  momentum: number;
}

function analyzeFlow(flows: StockConnectFlow[]): FlowAnalysis {
  if (flows.length === 0) return { trend: 'neutral', avgDailyFlow: 0, cumulativeFlow: 0, volatility: 0, consecutiveDays: 0, momentum: 0 };
  const netFlows = flows.map(f => f.northbound.netBuy);
  const cumulative = netFlows.reduce((s, v) => s + v, 0);
  const avg = cumulative / netFlows.length;
  const variance = netFlows.reduce((s, v) => s + (v - avg) ** 2, 0) / netFlows.length;
  const volatility = Math.sqrt(variance);
  const trend = avg > 0 ? 'inflow' : avg < 0 ? 'outflow' : 'neutral';
  let consecutive = 0;
  const lastSign = netFlows[netFlows.length - 1] > 0;
  for (let i = netFlows.length - 1; i >= 0; i--) {
    if ((netFlows[i] > 0) === lastSign) consecutive++;
    else break;
  }
  const recent = netFlows.slice(-5).reduce((s, v) => s + v, 0);
  const older = netFlows.slice(0, Math.max(1, netFlows.length - 5)).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(5, netFlows.length - 5));
  const momentum = parseFloat((recent / Math.max(1, Math.abs(older)) - 1).toFixed(4));
  return { trend, avgDailyFlow: parseFloat(avg.toFixed(2)), cumulativeFlow: parseFloat(cumulative.toFixed(2)), volatility: parseFloat(volatility.toFixed(2)), consecutiveDays: consecutive, momentum };
}

function identifyHotStocks(flows: StockConnectFlow[]): { buys: Map<string, number>; sells: Map<string, number> } {
  const buys = new Map<string, number>();
  const sells = new Map<string, number>();
  flows.forEach(f => {
    f.northbound.topBuys.forEach(code => buys.set(code, (buys.get(code) || 0) + 1));
    f.northbound.topSells.forEach(code => sells.set(code, (sells.get(code) || 0) + 1));
  });
  return { buys, sells };
}

describe('沪深港通深度分析引擎', () => {
  const makeFlow = (netBuy: number, date = '2024-01-01'): StockConnectFlow => ({
    date,
    northbound: { netBuy, buyAmount: Math.abs(netBuy) + 100, sellAmount: 100, topBuys: ['600519'], topSells: ['000858'] },
    southbound: { netBuy: netBuy * 0.5, buyAmount: 100, sellAmount: 100 },
  });

  describe('analyzeFlow', () => {
    it('should detect inflow trend', () => {
      const flows = Array.from({ length: 10 }, (_, i) => makeFlow(1000 + i * 100, `2024-01-${String(i+1).padStart(2,'0')}`));
      const analysis = analyzeFlow(flows);
      expect(analysis.trend).toBe('inflow');
      expect(analysis.cumulativeFlow).toBeGreaterThan(0);
    });

    it('should detect outflow trend', () => {
      const flows = Array.from({ length: 10 }, (_, i) => makeFlow(-1000, `2024-01-${String(i+1).padStart(2,'0')}`));
      const analysis = analyzeFlow(flows);
      expect(analysis.trend).toBe('outflow');
    });

    it('should count consecutive days', () => {
      const flows = [makeFlow(100, '1'), makeFlow(200, '2'), makeFlow(150, '3')];
      const analysis = analyzeFlow(flows);
      expect(analysis.consecutiveDays).toBe(3);
    });

    it('should handle empty flows', () => {
      expect(analyzeFlow([]).trend).toBe('neutral');
    });

    it('volatility should be non-negative', () => {
      const flows = [makeFlow(100, '1'), makeFlow(-50, '2'), makeFlow(200, '3')];
      expect(analyzeFlow(flows).volatility).toBeGreaterThanOrEqual(0);
    });
  });

  describe('identifyHotStocks', () => {
    it('should count stock appearances', () => {
      const flows = [
        { date: '1', northbound: { netBuy: 100, buyAmount: 100, sellAmount: 0, topBuys: ['600519', '000858'], topSells: ['601398'] }, southbound: { netBuy: 0, buyAmount: 0, sellAmount: 0 } },
        { date: '2', northbound: { netBuy: 200, buyAmount: 200, sellAmount: 0, topBuys: ['600519'], topSells: ['000858'] }, southbound: { netBuy: 0, buyAmount: 0, sellAmount: 0 } },
      ];
      const hot = identifyHotStocks(flows);
      expect(hot.buys.get('600519')).toBe(2);
      expect(hot.buys.get('000858')).toBe(1);
    });
  });
});
