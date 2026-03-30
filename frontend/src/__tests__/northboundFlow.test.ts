import { describe, it, expect } from 'vitest';
import {
  summarizeNorthboundFlow,
  analyzeHoldingsChanges,
  sectorFlowAggregation,
  generateNorthboundSignals,
  type NorthboundFlow,
  type NorthboundHolding,
} from '../utils/northboundFlow';

describe('NorthboundFlow', () => {
  const mockFlows: NorthboundFlow[] = [
    {
      date: '2024-01-05',
      shConnect: 30,
      szConnect: 20,
      total: 50,
      shBuy: 500,
      shSell: 470,
      szBuy: 400,
      szSell: 380,
    },
    {
      date: '2024-01-04',
      shConnect: -10,
      szConnect: 15,
      total: 5,
      shBuy: 450,
      shSell: 460,
      szBuy: 380,
      szSell: 365,
    },
    {
      date: '2024-01-03',
      shConnect: 25,
      szConnect: 10,
      total: 35,
      shBuy: 480,
      shSell: 455,
      szBuy: 370,
      szSell: 360,
    },
    {
      date: '2024-01-02',
      shConnect: -5,
      szConnect: -10,
      total: -15,
      shBuy: 420,
      shSell: 425,
      szBuy: 350,
      szSell: 360,
    },
    {
      date: '2024-01-01',
      shConnect: 40,
      szConnect: 30,
      total: 70,
      shBuy: 520,
      shSell: 480,
      szBuy: 410,
      szSell: 380,
    },
    {
      date: '2023-12-29',
      shConnect: 15,
      szConnect: 5,
      total: 20,
      shBuy: 460,
      shSell: 445,
      szBuy: 365,
      szSell: 360,
    },
    {
      date: '2023-12-28',
      shConnect: -20,
      szConnect: -15,
      total: -35,
      shBuy: 400,
      shSell: 420,
      szBuy: 340,
      szSell: 355,
    },
  ];

  describe('summarizeNorthboundFlow', () => {
    it('should calculate today net correctly', () => {
      const summary = summarizeNorthboundFlow(mockFlows);
      expect(summary.todayNet).toBe(50); // latest date
    });

    it('should calculate week net (last 5 days)', () => {
      const summary = summarizeNorthboundFlow(mockFlows);
      // 50 + 5 + 35 + (-15) + 70 = 145
      expect(summary.weekNet).toBe(145);
    });

    it('should calculate month net (all available)', () => {
      const summary = summarizeNorthboundFlow(mockFlows);
      const expectedTotal = mockFlows.reduce((s, f) => s + f.total, 0);
      expect(summary.monthNet).toBe(expectedTotal);
    });

    it('should calculate month daily average', () => {
      const summary = summarizeNorthboundFlow(mockFlows);
      const expectedAvg = mockFlows.reduce((s, f) => s + f.total, 0) / mockFlows.length;
      expect(summary.monthDayAvg).toBeCloseTo(expectedAvg, 0);
    });

    it('should determine trend correctly', () => {
      const inflowFlows: NorthboundFlow[] = Array.from({ length: 20 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        shConnect: 10,
        szConnect: 5,
        total: 15,
        shBuy: 100,
        shSell: 90,
        szBuy: 80,
        szSell: 75,
      }));
      const summary = summarizeNorthboundFlow(inflowFlows);
      expect(summary.trend).toBe('inflow');
    });

    it('should determine outflow trend', () => {
      const outflowFlows: NorthboundFlow[] = Array.from({ length: 20 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        shConnect: -10,
        szConnect: -5,
        total: -15,
        shBuy: 80,
        shSell: 90,
        szBuy: 70,
        szSell: 75,
      }));
      const summary = summarizeNorthboundFlow(outflowFlows);
      expect(summary.trend).toBe('outflow');
    });

    it('should calculate momentum', () => {
      const summary = summarizeNorthboundFlow(mockFlows);
      expect(typeof summary.momentum).toBe('number');
      expect(summary.momentum).not.toBeNaN();
    });

    it('should count consecutive days', () => {
      const summary = summarizeNorthboundFlow(mockFlows);
      expect(summary.consecutiveDays).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty flows', () => {
      const summary = summarizeNorthboundFlow([]);
      expect(summary.todayNet).toBe(0);
      expect(summary.weekNet).toBe(0);
      expect(summary.trend).toBe('neutral');
    });

    it('should handle single flow entry', () => {
      const summary = summarizeNorthboundFlow([mockFlows[0]]);
      expect(summary.todayNet).toBe(50);
      expect(summary.weekNet).toBe(50);
    });

    it('should round results to 2 decimal places', () => {
      const summary = summarizeNorthboundFlow(mockFlows);
      expect(summary.todayNet).toBe(Math.round(summary.todayNet * 100) / 100);
      expect(summary.monthDayAvg).toBe(Math.round(summary.monthDayAvg * 100) / 100);
    });

    it('should detect consecutive inflow days', () => {
      const consecutiveFlows: NorthboundFlow[] = [
        { date: '2024-01-05', shConnect: 20, szConnect: 10, total: 30, shBuy: 0, shSell: 0, szBuy: 0, szSell: 0 },
        { date: '2024-01-04', shConnect: 15, szConnect: 5, total: 20, shBuy: 0, shSell: 0, szBuy: 0, szSell: 0 },
        { date: '2024-01-03', shConnect: 10, szConnect: 10, total: 20, shBuy: 0, shSell: 0, szBuy: 0, szSell: 0 },
        { date: '2024-01-02', shConnect: -5, szConnect: 2, total: -3, shBuy: 0, shSell: 0, szBuy: 0, szSell: 0 },
      ];
      const summary = summarizeNorthboundFlow(consecutiveFlows);
      expect(summary.consecutiveDays).toBe(3);
    });
  });

  describe('analyzeHoldingsChanges', () => {
    const currentHoldings: NorthboundHolding[] = [
      { ticker: '600519', name: '贵州茅台', shares: 12000, marketValue: 24000000, changePercent: 0, freeFloatRatio: 0.05, sector: '白酒' },
      { ticker: '000858', name: '五粮液', shares: 8000, marketValue: 12000000, changePercent: 0, freeFloatRatio: 0.03, sector: '白酒' },
      { ticker: '300750', name: '宁德时代', shares: 15000, marketValue: 30000000, changePercent: 0, freeFloatRatio: 0.04, sector: '新能源' },
      { ticker: '002594', name: '比亚迪', shares: 5000, marketValue: 10000000, changePercent: 0, freeFloatRatio: 0.02, sector: '新能源汽车' },
    ];

    const previousHoldings: NorthboundHolding[] = [
      { ticker: '600519', name: '贵州茅台', shares: 10000, marketValue: 20000000, changePercent: 0, freeFloatRatio: 0.05, sector: '白酒' },
      { ticker: '000858', name: '五粮液', shares: 10000, marketValue: 15000000, changePercent: 0, freeFloatRatio: 0.03, sector: '白酒' },
      { ticker: '002415', name: '海康威视', shares: 6000, marketValue: 8000000, changePercent: 0, freeFloatRatio: 0.02, sector: '安防' },
    ];

    it('should identify top increased holdings', () => {
      const result = analyzeHoldingsChanges(currentHoldings, previousHoldings);
      expect(result.topIncreased.length).toBeGreaterThan(0);
      const moutai = result.topIncreased.find((h) => h.ticker === '600519');
      expect(moutai).toBeDefined();
      expect(moutai!.changePercent).toBe(20); // (12000-10000)/10000 * 100
    });

    it('should identify top decreased holdings', () => {
      const result = analyzeHoldingsChanges(currentHoldings, previousHoldings);
      expect(result.topDecreased.length).toBeGreaterThan(0);
      const wuliangye = result.topDecreased.find((h) => h.ticker === '000858');
      expect(wuliangye).toBeDefined();
      expect(wuliangye!.changePercent).toBe(-20); // (8000-10000)/10000 * 100
    });

    it('should identify new positions', () => {
      const result = analyzeHoldingsChanges(currentHoldings, previousHoldings);
      expect(result.topNewPositions.some((h) => h.ticker === '300750')).toBe(true);
      expect(result.topNewPositions.some((h) => h.ticker === '002594')).toBe(true);
    });

    it('should identify exited positions', () => {
      const result = analyzeHoldingsChanges(currentHoldings, previousHoldings);
      expect(result.topExited.some((h) => h.ticker === '002415')).toBe(true);
    });

    it('should limit results to 10', () => {
      const manyCurrent = Array.from({ length: 20 }, (_, i) => ({
        ticker: `T${i}`,
        name: `Stock${i}`,
        shares: 1000 + i * 100,
        marketValue: 10000,
        changePercent: 0,
        freeFloatRatio: 0.01,
        sector: 'Tech',
      }));
      const manyPrevious = Array.from({ length: 20 }, (_, i) => ({
        ticker: `T${i}`,
        name: `Stock${i}`,
        shares: 1000,
        marketValue: 10000,
        changePercent: 0,
        freeFloatRatio: 0.01,
        sector: 'Tech',
      }));
      const result = analyzeHoldingsChanges(manyCurrent, manyPrevious);
      expect(result.topIncreased.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty previous holdings', () => {
      const result = analyzeHoldingsChanges(currentHoldings, []);
      expect(result.topIncreased).toHaveLength(0);
      expect(result.topNewPositions.length).toBe(currentHoldings.length);
    });

    it('should handle empty current holdings', () => {
      const result = analyzeHoldingsChanges([], previousHoldings);
      expect(result.topIncreased).toHaveLength(0);
      expect(result.topExited.length).toBe(previousHoldings.length);
    });

    it('should handle both empty', () => {
      const result = analyzeHoldingsChanges([], []);
      expect(result.topIncreased).toHaveLength(0);
      expect(result.topDecreased).toHaveLength(0);
      expect(result.topNewPositions).toHaveLength(0);
      expect(result.topExited).toHaveLength(0);
    });

    it('should sort by absolute change percent descending', () => {
      const result = analyzeHoldingsChanges(currentHoldings, previousHoldings);
      for (let i = 1; i < result.topIncreased.length; i++) {
        expect(Math.abs(result.topIncreased[i - 1].changePercent)).toBeGreaterThanOrEqual(
          Math.abs(result.topIncreased[i].changePercent)
        );
      }
    });
  });

  describe('sectorFlowAggregation', () => {
    const holdings: NorthboundHolding[] = [
      { ticker: '600519', name: '茅台', shares: 10000, marketValue: 20000000, changePercent: 5, freeFloatRatio: 0.05, sector: '白酒' },
      { ticker: '000858', name: '五粮液', shares: 8000, marketValue: 12000000, changePercent: -3, freeFloatRatio: 0.03, sector: '白酒' },
      { ticker: '300750', name: '宁德时代', shares: 15000, marketValue: 30000000, changePercent: 10, freeFloatRatio: 0.04, sector: '新能源' },
      { ticker: '601012', name: '隆基绿能', shares: 5000, marketValue: 8000000, changePercent: -2, freeFloatRatio: 0.02, sector: '新能源' },
      { ticker: '002594', name: '比亚迪', shares: 5000, marketValue: 15000000, changePercent: 8, freeFloatRatio: 0.02, sector: '新能源汽车' },
    ];

    it('should aggregate by sector', () => {
      const result = sectorFlowAggregation(holdings);
      expect(result.length).toBe(3); // 3 sectors
      const baijiu = result.find((s) => s.sector === '白酒');
      expect(baijiu!.totalValue).toBe(32000000);
      expect(baijiu!.count).toBe(2);
    });

    it('should calculate average change per sector', () => {
      const result = sectorFlowAggregation(holdings);
      const baijiu = result.find((s) => s.sector === '白酒');
      expect(baijiu!.avgChange).toBe(1); // (5 + (-3)) / 2
    });

    it('should sort by total value descending', () => {
      const result = sectorFlowAggregation(holdings);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].totalValue).toBeGreaterThanOrEqual(result[i].totalValue);
      }
    });

    it('should handle empty holdings', () => {
      const result = sectorFlowAggregation([]);
      expect(result).toHaveLength(0);
    });

    it('should handle single holding', () => {
      const result = sectorFlowAggregation([holdings[0]]);
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(1);
    });

    it('should round values', () => {
      const result = sectorFlowAggregation(holdings);
      for (const s of result) {
        expect(s.totalValue).toBe(Math.round(s.totalValue * 100) / 100);
        expect(s.avgChange).toBe(Math.round(s.avgChange * 100) / 100);
      }
    });
  });

  describe('generateNorthboundSignals', () => {
    it('should generate bullish signal for consecutive inflow', () => {
      const summary = {
        todayNet: 20,
        weekNet: 100,
        monthNet: 400,
        monthDayAvg: 20,
        trend: 'inflow' as const,
        momentum: 1.0,
        consecutiveDays: 7,
      };
      const signals = generateNorthboundSignals(summary);
      expect(signals.some((s) => s.type === 'bullish')).toBe(true);
    });

    it('should generate bearish signal for consecutive outflow', () => {
      const summary = {
        todayNet: -20,
        weekNet: -100,
        monthNet: -400,
        monthDayAvg: -20,
        trend: 'outflow' as const,
        momentum: 1.0,
        consecutiveDays: 7,
      };
      const signals = generateNorthboundSignals(summary);
      expect(signals.some((s) => s.type === 'bearish')).toBe(true);
    });

    it('should generate bullish signal for accelerating momentum', () => {
      const summary = {
        todayNet: 30,
        weekNet: 150,
        monthNet: 400,
        monthDayAvg: 20,
        trend: 'inflow' as const,
        momentum: 2.0,
        consecutiveDays: 3,
      };
      const signals = generateNorthboundSignals(summary);
      expect(signals.some((s) => s.type === 'bullish' && s.message.includes('动量'))).toBe(true);
    });

    it('should generate bearish signal for decelerating momentum', () => {
      const summary = {
        todayNet: 10,
        weekNet: 20,
        monthNet: 400,
        monthDayAvg: 20,
        trend: 'inflow' as const,
        momentum: 0.3,
        consecutiveDays: 3,
      };
      const signals = generateNorthboundSignals(summary);
      expect(signals.some((s) => s.type === 'bearish')).toBe(true);
    });

    it('should generate bullish signal for large inflow', () => {
      const summary = {
        todayNet: 150,
        weekNet: 500,
        monthNet: 1000,
        monthDayAvg: 50,
        trend: 'inflow' as const,
        momentum: 1.2,
        consecutiveDays: 3,
      };
      const signals = generateNorthboundSignals(summary);
      expect(signals.some((s) => s.type === 'bullish' && s.message.includes('大幅'))).toBe(true);
    });

    it('should generate bearish signal for large outflow', () => {
      const summary = {
        todayNet: -150,
        weekNet: -500,
        monthNet: -1000,
        monthDayAvg: -50,
        trend: 'outflow' as const,
        momentum: 1.2,
        consecutiveDays: 3,
      };
      const signals = generateNorthboundSignals(summary);
      expect(signals.some((s) => s.type === 'bearish' && s.message.includes('大幅'))).toBe(true);
    });

    it('should generate neutral signal when no other signals', () => {
      const summary = {
        todayNet: 5,
        weekNet: 20,
        monthNet: 80,
        monthDayAvg: 4,
        trend: 'neutral' as const,
        momentum: 1.0,
        consecutiveDays: 0,
      };
      const signals = generateNorthboundSignals(summary);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('neutral');
    });

    it('should assign strength between 0 and 100', () => {
      const summary = {
        todayNet: 50,
        weekNet: 200,
        monthNet: 800,
        monthDayAvg: 40,
        trend: 'inflow' as const,
        momentum: 1.5,
        consecutiveDays: 6,
      };
      const signals = generateNorthboundSignals(summary);
      for (const s of signals) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });

    it('should include message in every signal', () => {
      const summary = {
        todayNet: 50,
        weekNet: 200,
        monthNet: 800,
        monthDayAvg: 40,
        trend: 'inflow' as const,
        momentum: 1.5,
        consecutiveDays: 6,
      };
      const signals = generateNorthboundSignals(summary);
      for (const s of signals) {
        expect(s.message.length).toBeGreaterThan(0);
      }
    });

    it('should handle zero consecutive days', () => {
      const summary = {
        todayNet: 0,
        weekNet: 0,
        monthNet: 0,
        monthDayAvg: 0,
        trend: 'neutral' as const,
        momentum: 1.0,
        consecutiveDays: 0,
      };
      const signals = generateNorthboundSignals(summary);
      expect(signals.length).toBeGreaterThanOrEqual(1);
    });
  });
});
