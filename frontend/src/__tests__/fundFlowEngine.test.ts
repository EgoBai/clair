import { describe, it, expect } from 'vitest';
import {
  analyzeFundFlow,
  trackNorthBoundFlow,
  rankSectorFlows,
  detectLargeOrderAlerts,
  computeFlowSentiment,
  detectSectorRotation,
  flowDistribution,
} from '../utils/fundFlowEngine';
import type { FundFlowTick, FundFlowResult, NorthBoundFlow } from '../utils/fundFlowEngine';

describe('Fund Flow Engine', () => {
  const makeTick = (overrides: Partial<FundFlowTick> = {}): FundFlowTick => ({
    timestamp: Date.now(),
    stockCode: '000001',
    price: 10,
    volume: 10000,
    amount: 100000,
    buyVolume: 5000,
    sellVolume: 5000,
    orderSize: 'medium',
    ...overrides,
  });

  describe('analyzeFundFlow', () => {
    it('returns zero result for empty ticks', () => {
      const result = analyzeFundFlow([]);
      expect(result.netFlow).toBe(0);
      expect(result.flowTrend).toBe('neutral');
    });

    it('computes net flow correctly', () => {
      const ticks = [
        makeTick({ buyVolume: 8000, sellVolume: 2000 }),
        makeTick({ buyVolume: 6000, sellVolume: 4000 }),
      ];
      const result = analyzeFundFlow(ticks);
      expect(result.netFlow).toBeGreaterThan(0);
      expect(result.flowTrend).toBe('inflow');
    });

    it('detects outflow', () => {
      const ticks = [
        makeTick({ buyVolume: 2000, sellVolume: 8000 }),
        makeTick({ buyVolume: 3000, sellVolume: 7000 }),
      ];
      const result = analyzeFundFlow(ticks);
      expect(result.netFlow).toBeLessThan(0);
      expect(result.flowTrend).toBe('outflow');
    });

    it('decomposes main force vs retail', () => {
      const ticks = [
        makeTick({ orderSize: 'superLarge', buyVolume: 9000, sellVolume: 1000 }),
        makeTick({ orderSize: 'small', buyVolume: 4000, sellVolume: 6000 }),
      ];
      const result = analyzeFundFlow(ticks);
      expect(result.mainForceNetFlow).toBeGreaterThan(0);
      expect(result.retailNetFlow).toBeLessThan(0);
    });

    it('calculates large order ratio', () => {
      const ticks = [
        makeTick({ orderSize: 'superLarge' }),
        makeTick({ orderSize: 'large' }),
        makeTick({ orderSize: 'small' }),
        makeTick({ orderSize: 'medium' }),
      ];
      const result = analyzeFundFlow(ticks);
      expect(result.largeOrderRatio).toBe(0.5);
    });

    it('intensity bounded 0-100', () => {
      const ticks = Array.from({ length: 10 }, (_, i) =>
        makeTick({ buyVolume: 1000 * (i + 1), sellVolume: 500, timestamp: i })
      );
      const result = analyzeFundFlow(ticks);
      expect(result.intensity).toBeGreaterThanOrEqual(0);
      expect(result.intensity).toBeLessThanOrEqual(100);
    });

    it('handles neutral flow', () => {
      const ticks = [
        makeTick({ buyVolume: 5000, sellVolume: 5000 }),
        makeTick({ buyVolume: 5000, sellVolume: 5000 }),
      ];
      const result = analyzeFundFlow(ticks);
      expect(result.netFlow).toBe(0);
      expect(result.flowTrend).toBe('neutral');
    });
  });

  describe('trackNorthBoundFlow', () => {
    it('computes daily net buy', () => {
      const flows = trackNorthBoundFlow([
        { date: '2026-03-01', buy: 100000, sell: 80000 },
        { date: '2026-03-02', buy: 90000, sell: 85000 },
      ]);
      expect(flows[0].netBuy).toBe(20000);
      expect(flows[1].netBuy).toBe(5000);
    });

    it('computes 5-day cumulative', () => {
      const daily = Array.from({ length: 6 }, (_, i) => ({
        date: `2026-03-0${i + 1}`,
        buy: 100000,
        sell: 80000,
      }));
      const flows = trackNorthBoundFlow(daily);
      expect(flows[0].cumulative5d).toBe(20000);
      expect(flows[5].cumulative5d).toBe(100000); // 5 * 20000
    });

    it('determines bullish trend', () => {
      const flows = trackNorthBoundFlow(
        Array.from({ length: 5 }, (_, i) => ({ date: `2026-03-0${i + 1}`, buy: 100000, sell: 50000 }))
      );
      expect(flows[4].trend).toBe('bullish');
    });

    it('determines bearish trend', () => {
      const flows = trackNorthBoundFlow(
        Array.from({ length: 5 }, (_, i) => ({ date: `2026-03-0${i + 1}`, buy: 50000, sell: 100000 }))
      );
      expect(flows[4].trend).toBe('bearish');
    });

    it('handles single day', () => {
      const flows = trackNorthBoundFlow([{ date: '2026-03-01', buy: 100000, sell: 80000 }]);
      expect(flows).toHaveLength(1);
      expect(flows[0].cumulative5d).toBe(20000);
    });
  });

  describe('rankSectorFlows', () => {
    it('ranks by net flow descending', () => {
      const sectors = [
        { code: 'tech', name: '科技', netFlow: 100000, totalAmount: 1000000, stocks: [{ code: '001', flow: 50000 }] },
        { code: 'bank', name: '银行', netFlow: -50000, totalAmount: 800000, stocks: [{ code: '002', flow: -25000 }] },
        { code: 'med', name: '医药', netFlow: 200000, totalAmount: 600000, stocks: [{ code: '003', flow: 100000 }] },
      ];
      const ranked = rankSectorFlows(sectors);
      expect(ranked[0].sectorCode).toBe('med');
      expect(ranked[1].sectorCode).toBe('tech');
      expect(ranked[2].sectorCode).toBe('bank');
    });

    it('computes flow percent', () => {
      const sectors = [
        { code: 'a', name: 'A', netFlow: 100000, totalAmount: 500000, stocks: [{ code: 's1', flow: 100000 }] },
      ];
      const ranked = rankSectorFlows(sectors);
      expect(ranked[0].flowPercent).toBe(20);
    });

    it('identifies lead stock', () => {
      const sectors = [
        {
          code: 'tech', name: '科技', netFlow: 100000, totalAmount: 1000000,
          stocks: [
            { code: 'aaa', flow: 10000 },
            { code: 'bbb', flow: 90000 },
          ],
        },
      ];
      const ranked = rankSectorFlows(sectors);
      expect(ranked[0].leadStock).toBe('bbb');
    });

    it('handles empty stocks', () => {
      const sectors = [
        { code: 'empty', name: '空', netFlow: 0, totalAmount: 0, stocks: [] },
      ];
      const ranked = rankSectorFlows(sectors);
      expect(ranked[0].activeStocks).toBe(0);
    });
  });

  describe('detectLargeOrderAlerts', () => {
    it('detects buy sweep', () => {
      const ticks = [
        makeTick({ timestamp: 1, buyVolume: 1000, sellVolume: 1000, amount: 10000 }),
        makeTick({ timestamp: 2, buyVolume: 50000, sellVolume: 5000, amount: 550000, volume: 55000 }),
      ];
      const alerts = detectLargeOrderAlerts(ticks, 500000);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].type).toBe('buySweep');
    });

    it('detects sell dump', () => {
      const ticks = [
        makeTick({ timestamp: 1, buyVolume: 1000, sellVolume: 1000, amount: 10000 }),
        makeTick({ timestamp: 2, buyVolume: 3000, sellVolume: 60000, amount: 630000, volume: 63000 }),
      ];
      const alerts = detectLargeOrderAlerts(ticks, 500000);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].type).toBe('sellDump');
    });

    it('ignores below threshold', () => {
      const ticks = [
        makeTick({ timestamp: 1, amount: 10000 }),
        makeTick({ timestamp: 2, amount: 10000 }),
      ];
      const alerts = detectLargeOrderAlerts(ticks, 500000);
      expect(alerts).toHaveLength(0);
    });

    it('returns empty for insufficient ticks', () => {
      const alerts = detectLargeOrderAlerts([makeTick()]);
      expect(alerts).toHaveLength(0);
    });

    it('confidence between 0 and 1', () => {
      const ticks = [
        makeTick({ timestamp: 1, buyVolume: 1000, sellVolume: 1000, amount: 10000 }),
        makeTick({ timestamp: 2, buyVolume: 50000, sellVolume: 1000, amount: 510000, volume: 51000 }),
      ];
      const alerts = detectLargeOrderAlerts(ticks, 500000);
      for (const a of alerts) {
        expect(a.confidence).toBeGreaterThanOrEqual(0);
        expect(a.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('computeFlowSentiment', () => {
    it('returns neutral for empty data', () => {
      const sentiment = computeFlowSentiment([], []);
      expect(sentiment.score).toBe(0);
      expect(sentiment.label).toBe('neutral');
    });

    it('detects greed on strong inflows', () => {
      const flows: FundFlowResult[] = Array.from({ length: 10 }, () => ({
        netInflow: 200000, netOutflow: 100000, netFlow: 100000,
        mainForceNetFlow: 80000, retailNetFlow: 20000,
        largeOrderRatio: 0.5, flowTrend: 'inflow' as const, intensity: 50,
      }));
      const north = Array.from({ length: 10 }, (_, i) => ({
        date: `2026-03-0${i + 1}`, buyAmount: 100000, sellAmount: 50000,
        netBuy: 50000, cumulative5d: 250000, trend: 'bullish' as const,
      }));
      const sentiment = computeFlowSentiment(flows, north);
      expect(sentiment.score).toBeGreaterThan(0);
    });

    it('detects divergence', () => {
      const flows: FundFlowResult[] = [
        { netInflow: 100000, netOutflow: 50000, netFlow: 50000, mainForceNetFlow: 40000, retailNetFlow: -10000, largeOrderRatio: 0.5, flowTrend: 'inflow', intensity: 30 },
        { netInflow: 100000, netOutflow: 50000, netFlow: 50000, mainForceNetFlow: 30000, retailNetFlow: -20000, largeOrderRatio: 0.5, flowTrend: 'inflow', intensity: 30 },
        { netInflow: 100000, netOutflow: 50000, netFlow: 50000, mainForceNetFlow: 50000, retailNetFlow: -5000, largeOrderRatio: 0.5, flowTrend: 'inflow', intensity: 30 },
      ];
      const sentiment = computeFlowSentiment(flows, []);
      expect(sentiment.divergence).toBe(true);
    });
  });

  describe('detectSectorRotation', () => {
    it('detects inflow shift', () => {
      const prev = [{ sectorCode: 'tech', sectorName: '科技', netFlow: 10000, flowPercent: 1, activeStocks: 5, leadStock: 'a', heat: 10 }];
      const curr = [{ sectorCode: 'tech', sectorName: '科技', netFlow: 50000, flowPercent: 5, activeStocks: 8, leadStock: 'a', heat: 50 }];
      const rotation = detectSectorRotation(curr, prev);
      expect(rotation[0].rotationType).toBe('inflow_shift');
    });

    it('detects outflow shift', () => {
      const prev = [{ sectorCode: 'bank', sectorName: '银行', netFlow: -10000, flowPercent: -1, activeStocks: 3, leadStock: 'b', heat: 10 }];
      const curr = [{ sectorCode: 'bank', sectorName: '银行', netFlow: -50000, flowPercent: -5, activeStocks: 3, leadStock: 'b', heat: 50 }];
      const rotation = detectSectorRotation(curr, prev);
      expect(rotation[0].rotationType).toBe('outflow_shift');
    });

    it('stable when no significant change', () => {
      const prev = [{ sectorCode: 'a', sectorName: 'A', netFlow: 10000, flowPercent: 1, activeStocks: 2, leadStock: 'x', heat: 10 }];
      const curr = [{ sectorCode: 'a', sectorName: 'A', netFlow: 11000, flowPercent: 1.1, activeStocks: 2, leadStock: 'x', heat: 11 }];
      const rotation = detectSectorRotation(curr, prev);
      expect(rotation[0].rotationType).toBe('stable');
    });
  });

  describe('flowDistribution', () => {
    it('counts inflow/outflow days', () => {
      const flows: FundFlowResult[] = [
        { netInflow: 100, netOutflow: 50, netFlow: 50, mainForceNetFlow: 30, retailNetFlow: 20, largeOrderRatio: 0.3, flowTrend: 'inflow', intensity: 10 },
        { netInflow: 50, netOutflow: 100, netFlow: -50, mainForceNetFlow: -30, retailNetFlow: -20, largeOrderRatio: 0.3, flowTrend: 'outflow', intensity: 10 },
        { netInflow: 200, netOutflow: 50, netFlow: 150, mainForceNetFlow: 100, retailNetFlow: 50, largeOrderRatio: 0.4, flowTrend: 'inflow', intensity: 20 },
      ];
      const dist = flowDistribution(flows);
      expect(dist.inflowDays).toBe(2);
      expect(dist.outflowDays).toBe(1);
    });

    it('computes max inflow/outflow', () => {
      const flows: FundFlowResult[] = [
        { netInflow: 100, netOutflow: 50, netFlow: 50, mainForceNetFlow: 30, retailNetFlow: 20, largeOrderRatio: 0.3, flowTrend: 'inflow', intensity: 10 },
        { netInflow: 50, netOutflow: 200, netFlow: -150, mainForceNetFlow: -100, retailNetFlow: -50, largeOrderRatio: 0.3, flowTrend: 'outflow', intensity: 20 },
      ];
      const dist = flowDistribution(flows);
      expect(dist.maxInflow).toBe(50);
      expect(dist.maxOutflow).toBe(-150);
    });

    it('handles empty', () => {
      const dist = flowDistribution([]);
      expect(dist.avgNetFlow).toBe(0);
      expect(dist.inflowDays).toBe(0);
    });

    it('computes consistency', () => {
      const flows: FundFlowResult[] = Array.from({ length: 5 }, () => ({
        netInflow: 100, netOutflow: 50, netFlow: 50,
        mainForceNetFlow: 30, retailNetFlow: 20,
        largeOrderRatio: 0.3, flowTrend: 'inflow' as const, intensity: 10,
      }));
      const dist = flowDistribution(flows);
      expect(dist.consistency).toBe(1);
    });
  });
});
