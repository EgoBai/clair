import { describe, it, expect } from 'vitest';
import {
  classifyOrderSize,
  analyzeFundFlow,
  timeWindowFlow,
  fundBattlegroundIndex,
  trackLargeOrders,
  detectFlowTrend,
  DEFAULT_THRESHOLDS,
  type FundFlowEntry,
} from '../utils/capitalFlowDepth';

describe('CapitalFlowDepth', () => {
  describe('classifyOrderSize', () => {
    it('should classify super large orders', () => {
      expect(classifyOrderSize(150)).toBe('superLarge');
      expect(classifyOrderSize(100)).toBe('superLarge');
    });

    it('should classify large orders', () => {
      expect(classifyOrderSize(50)).toBe('large');
      expect(classifyOrderSize(20)).toBe('large');
    });

    it('should classify medium orders', () => {
      expect(classifyOrderSize(10)).toBe('medium');
      expect(classifyOrderSize(4)).toBe('medium');
    });

    it('should classify small orders', () => {
      expect(classifyOrderSize(3)).toBe('small');
      expect(classifyOrderSize(1)).toBe('small');
    });

    it('should use custom thresholds', () => {
      expect(classifyOrderSize(50, { superLarge: 80, large: 15, medium: 3 })).toBe('large');
      expect(classifyOrderSize(80, { superLarge: 80, large: 15, medium: 3 })).toBe('superLarge');
    });

    it('should handle zero volume', () => {
      expect(classifyOrderSize(0)).toBe('small');
    });
  });

  describe('analyzeFundFlow', () => {
    const entries: FundFlowEntry[] = [
      { time: '09:30', price: 10, volume: 150, amount: 1500, direction: 'buy' },     // superLarge buy
      { time: '09:31', price: 10.1, volume: 100, amount: 1010, direction: 'sell' },  // superLarge sell
      { time: '09:32', price: 10.2, volume: 30, amount: 306, direction: 'buy' },     // large buy
      { time: '09:33', price: 10.1, volume: 5, amount: 50.5, direction: 'sell' },    // medium sell
      { time: '09:34', price: 10, volume: 2, amount: 20, direction: 'buy' },         // small buy
      { time: '09:35', price: 9.9, volume: 1, amount: 9.9, direction: 'sell' },      // small sell
    ];

    it('should calculate main inflow/outflow correctly', () => {
      const result = analyzeFundFlow(entries);
      // main = superLarge + large
      expect(result.mainInflow).toBe(1500 + 306);  // superLarge buy + large buy
      expect(result.mainOutflow).toBe(1010);         // superLarge sell
    });

    it('should calculate retail inflow/outflow correctly', () => {
      const result = analyzeFundFlow(entries);
      // retail = medium + small
      expect(result.retailInflow).toBe(20);     // small buy
      expect(result.retailOutflow).toBe(50.5 + 9.9); // medium sell + small sell
    });

    it('should calculate net values', () => {
      const result = analyzeFundFlow(entries);
      expect(result.mainNet).toBe(result.mainInflow - result.mainOutflow);
      expect(result.retailNet).toBe(result.retailInflow - result.retailOutflow);
    });

    it('should calculate order size breakdown', () => {
      const result = analyzeFundFlow(entries);
      expect(result.superLargeNet).toBe(1500 - 1010);
      expect(result.largeNet).toBe(306);
      expect(result.mediumNet).toBe(-50.5);
      expect(result.smallNet).toBe(20 - 9.9);
    });

    it('should handle empty entries', () => {
      const result = analyzeFundFlow([]);
      expect(result.mainInflow).toBe(0);
      expect(result.mainNet).toBe(0);
      expect(result.retailNet).toBe(0);
    });

    it('should handle all buy entries', () => {
      const allBuy: FundFlowEntry[] = [
        { time: '09:30', price: 10, volume: 50, amount: 500, direction: 'buy' },
        { time: '09:31', price: 10, volume: 10, amount: 100, direction: 'buy' },
      ];
      const result = analyzeFundFlow(allBuy);
      expect(result.mainNet).toBe(500);
      expect(result.retailNet).toBe(100);
      expect(result.mainOutflow).toBe(0);
    });

    it('should handle all sell entries', () => {
      const allSell: FundFlowEntry[] = [
        { time: '09:30', price: 10, volume: 50, amount: 500, direction: 'sell' },
        { time: '09:31', price: 10, volume: 10, amount: 100, direction: 'sell' },
      ];
      const result = analyzeFundFlow(allSell);
      expect(result.mainNet).toBe(-500);
      expect(result.retailNet).toBe(-100);
      expect(result.mainInflow).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      const result = analyzeFundFlow(entries);
      expect(result.mainNet).toBe(Math.round(result.mainNet * 100) / 100);
    });

    it('should handle neutral direction', () => {
      const withNeutral: FundFlowEntry[] = [
        { time: '09:30', price: 10, volume: 50, amount: 500, direction: 'neutral' },
      ];
      const result = analyzeFundFlow(withNeutral);
      // neutral doesn't count as buy or sell
      expect(result.mainInflow).toBe(0);
      expect(result.mainOutflow).toBe(0);
    });
  });

  describe('timeWindowFlow', () => {
    const entries: FundFlowEntry[] = [
      { time: '09:30', price: 10, volume: 100, amount: 1000, direction: 'buy' },
      { time: '09:32', price: 10.1, volume: 50, amount: 505, direction: 'sell' },
      { time: '09:35', price: 10.2, volume: 80, amount: 816, direction: 'buy' },
      { time: '09:45', price: 10.3, volume: 60, amount: 618, direction: 'buy' },
    ];

    it('should aggregate by time window', () => {
      const result = timeWindowFlow(entries, 5);
      expect(result.length).toBeGreaterThan(0);
      // 09:30 and 09:32 should be in the same 5-min window
      const window0930 = result.find((w) => w.time === '09:30');
      expect(window0930).toBeDefined();
      expect(window0930!.volume).toBe(150); // 100 + 50
    });

    it('should separate different windows', () => {
      const result = timeWindowFlow(entries, 5);
      const window0935 = result.find((w) => w.time === '09:35');
      expect(window0935).toBeDefined();
      expect(window0935!.volume).toBe(80);
    });

    it('should sort by time', () => {
      const result = timeWindowFlow(entries, 5);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].time.localeCompare(result[i].time)).toBeLessThanOrEqual(0);
      }
    });

    it('should calculate net flow per window', () => {
      const result = timeWindowFlow(entries, 5);
      const window0930 = result.find((w) => w.time === '09:30');
      // 09:30 buy 1000, 09:32 sell 505
      expect(window0930!.netFlow).toBe(1000 - 505);
    });

    it('should handle 1-minute windows', () => {
      const result = timeWindowFlow(entries, 1);
      expect(result.length).toBe(4); // 4 different minutes
    });

    it('should handle empty entries', () => {
      const result = timeWindowFlow([], 5);
      expect(result).toHaveLength(0);
    });

    it('should handle 15-minute windows', () => {
      const result = timeWindowFlow(entries, 15);
      const window0930 = result.find((w) => w.time === '09:30');
      // 09:30, 09:32, 09:35 all in 09:30 window
      expect(window0930!.volume).toBe(230); // 100 + 50 + 80
      const window0945 = result.find((w) => w.time === '09:45');
      expect(window0945!.volume).toBe(60);
    });
  });

  describe('fundBattlegroundIndex', () => {
    it('should calculate battleground index', () => {
      const summary = {
        mainInflow: 5000,
        mainOutflow: 2000,
        mainNet: 3000,
        retailInflow: 1000,
        retailOutflow: 2000,
        retailNet: -1000,
        superLargeNet: 2000,
        largeNet: 1000,
        mediumNet: -500,
        smallNet: -500,
      };
      const result = fundBattlegroundIndex(summary);
      expect(result.index).toBeGreaterThanOrEqual(0);
      expect(result.index).toBeLessThanOrEqual(100);
    });

    it('should identify dominant main force', () => {
      const summary = {
        mainInflow: 9000,
        mainOutflow: 1000,
        mainNet: 8000,
        retailInflow: 500,
        retailOutflow: 1500,
        retailNet: -1000,
        superLargeNet: 5000,
        largeNet: 3000,
        mediumNet: -500,
        smallNet: -500,
      };
      const result = fundBattlegroundIndex(summary);
      expect(result.level).toBe('dominant');
      expect(result.mainControl).toBeGreaterThan(70);
    });

    it('should identify contested market', () => {
      const summary = {
        mainInflow: 3000,
        mainOutflow: 2000,
        mainNet: 1000,
        retailInflow: 2500,
        retailOutflow: 1800,
        retailNet: 700,
        superLargeNet: 500,
        largeNet: 500,
        mediumNet: 350,
        smallNet: 350,
      };
      const result = fundBattlegroundIndex(summary);
      expect(['contested', 'dispersed']).toContain(result.level);
    });

    it('should handle zero total volume', () => {
      const empty = {
        mainInflow: 0, mainOutflow: 0, mainNet: 0,
        retailInflow: 0, retailOutflow: 0, retailNet: 0,
        superLargeNet: 0, largeNet: 0, mediumNet: 0, smallNet: 0,
      };
      const result = fundBattlegroundIndex(empty);
      expect(result.index).toBe(0);
      expect(result.level).toBe('dispersed');
      expect(result.mainControl).toBe(50);
    });

    it('should calculate mainControl as percentage of total', () => {
      const summary = {
        mainInflow: 6000,
        mainOutflow: 0,
        mainNet: 6000,
        retailInflow: 0,
        retailOutflow: 4000,
        retailNet: -4000,
        superLargeNet: 3000,
        largeNet: 3000,
        mediumNet: -2000,
        smallNet: -2000,
      };
      const result = fundBattlegroundIndex(summary);
      // total = 6000 + 4000 = 10000, main = 6000
      expect(result.mainControl).toBe(60);
    });
  });

  describe('trackLargeOrders', () => {
    const entries: FundFlowEntry[] = [
      { time: '09:30', price: 10, volume: 200, amount: 2000, direction: 'buy' },
      { time: '09:31', price: 10.1, volume: 50, amount: 505, direction: 'sell' },
      { time: '09:32', price: 10, volume: 100, amount: 1000, direction: 'buy' },
      { time: '09:33', price: 9.9, volume: 10, amount: 99, direction: 'sell' },
      { time: '09:34', price: 10.2, volume: 500, amount: 5100, direction: 'buy' },
    ];

    it('should filter orders by minimum amount', () => {
      const alerts = trackLargeOrders(entries, 500);
      expect(alerts.length).toBe(4); // 2000, 505, 1000, 5100
    });

    it('should exclude neutral direction', () => {
      const withNeutral: FundFlowEntry[] = [
        { time: '09:30', price: 10, volume: 200, amount: 2000, direction: 'neutral' },
      ];
      const alerts = trackLargeOrders(withNeutral, 100);
      expect(alerts).toHaveLength(0);
    });

    it('should identify high impact orders', () => {
      const alerts = trackLargeOrders(entries, 500);
      const highImpact = alerts.filter((a) => a.impact === 'high');
      expect(highImpact.length).toBeGreaterThan(0);
    });

    it('should sort by amount descending', () => {
      const alerts = trackLargeOrders(entries, 500);
      for (let i = 1; i < alerts.length; i++) {
        expect(alerts[i - 1].amount).toBeGreaterThanOrEqual(alerts[i].amount);
      }
    });

    it('should use default min amount of 500', () => {
      const alerts = trackLargeOrders(entries);
      expect(alerts.every((a) => a.amount >= 500)).toBe(true);
    });

    it('should return empty for no qualifying orders', () => {
      const small: FundFlowEntry[] = [
        { time: '09:30', price: 10, volume: 1, amount: 10, direction: 'buy' },
      ];
      const alerts = trackLargeOrders(small, 500);
      expect(alerts).toHaveLength(0);
    });

    it('should include time, direction, amount and volume', () => {
      const alerts = trackLargeOrders(entries, 500);
      for (const alert of alerts) {
        expect(alert.time).toBeDefined();
        expect(['buy', 'sell']).toContain(alert.direction);
        expect(alert.amount).toBeGreaterThan(0);
        expect(alert.volume).toBeGreaterThan(0);
      }
    });
  });

  describe('detectFlowTrend', () => {
    function makeEntries(amounts: number[]): FundFlowEntry[] {
      return amounts.map((a, i) => ({
        time: `${String(9 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
        price: 10,
        volume: Math.abs(a),
        amount: Math.abs(a),
        direction: a >= 0 ? 'buy' as const : 'sell' as const,
      }));
    }

    it('should detect accelerating inflow', () => {
      const entries = makeEntries([10, 20, 30, 40, 50, 60, 70, 80]);
      const trend = detectFlowTrend(entries, 4);
      expect(trend).toBe('accelerating_inflow');
    });

    it('should detect accelerating outflow', () => {
      const entries = makeEntries([-10, -20, -30, -40, -50, -60, -70, -80]);
      const trend = detectFlowTrend(entries, 4);
      expect(trend).toBe('accelerating_outflow');
    });

    it('should detect steady inflow', () => {
      const entries = makeEntries([20, 20, 20, 20, 20, 20, 20, 20]);
      const trend = detectFlowTrend(entries, 4);
      expect(['steady_inflow', 'neutral']).toContain(trend);
    });

    it('should return neutral for insufficient data', () => {
      const entries = makeEntries([10, 20]);
      const trend = detectFlowTrend(entries, 4);
      expect(trend).toBe('neutral');
    });

    it('should detect decelerating inflow', () => {
      const entries = makeEntries([80, 70, 60, 50, 40, 30, 20, 10]);
      const trend = detectFlowTrend(entries, 4);
      expect(trend).toBe('decelerating_inflow');
    });

    it('should handle mixed buy/sell', () => {
      const entries = makeEntries([10, -5, 15, -3, 20, -2, 25, -1]);
      const trend = detectFlowTrend(entries, 4);
      expect(typeof trend).toBe('string');
    });
  });
});
