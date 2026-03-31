import { describe, it, expect } from 'vitest';
import { IntradaySeasonalityEngine } from '../utils/intradaySeasonalityEngine';

describe('Intraday Seasonality Engine', () => {
  const engine = new IntradaySeasonalityEngine();
  const slots = engine.getTimeSlots();

  const makeSlotReturns = () => {
    const result: Record<string, number[]> = {};
    for (const slot of slots) {
      result[slot] = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.01);
    }
    return result;
  };

  const makeSlotVolumes = () => {
    const result: Record<string, number[]> = {};
    for (const slot of slots) {
      result[slot] = Array.from({ length: 30 }, () => 1e6 + Math.random() * 1e6);
    }
    return result;
  };

  describe('analyzeSlotReturns', () => {
    it('应分析各时段收益率', () => {
      const slotReturns = makeSlotReturns();
      const results = engine.analyzeSlotReturns(slotReturns);
      expect(results.length).toBe(8);
    });

    it('胜率应在0-1之间', () => {
      const slotReturns = makeSlotReturns();
      const results = engine.analyzeSlotReturns(slotReturns);
      for (const r of results) {
        expect(r.winRate).toBeGreaterThanOrEqual(0);
        expect(r.winRate).toBeLessThanOrEqual(1);
      }
    });

    it('波动率应为正', () => {
      const slotReturns = makeSlotReturns();
      const results = engine.analyzeSlotReturns(slotReturns);
      for (const r of results) {
        expect(r.volatility).toBeGreaterThanOrEqual(0);
      }
    });

    it('空数据应返回零值', () => {
      const results = engine.analyzeSlotReturns({});
      for (const r of results) {
        expect(r.avgReturn).toBe(0);
        expect(r.winRate).toBe(0);
      }
    });
  });

  describe('detectIntradayPattern', () => {
    it('应检测日内模式', () => {
      const n = 30;
      const opens = Array.from({ length: n }, () => 10 + Math.random());
      const closes = Array.from({ length: n }, () => 10 + Math.random());
      const highs = Array.from({ length: n }, () => 10.5 + Math.random());
      const lows = Array.from({ length: n }, () => 9.5 + Math.random());
      const pattern = engine.detectIntradayPattern(opens, closes, highs, lows, []);
      expect(['gap_up', 'gap_down', 'flat', 'volatile']).toContain(pattern.openingPattern);
      expect(['quiet', 'trending', 'reversal']).toContain(pattern.middayPattern);
      expect(['rally', 'sell_off', 'flat', 'surge']).toContain(pattern.closingPattern);
    });
  });

  describe('calcVolumeProfile', () => {
    it('应计算成交量分布', () => {
      const slotVolumes = makeSlotVolumes();
      const profile = engine.calcVolumeProfile(slotVolumes);
      expect(profile.length).toBe(8);
      for (const p of profile) {
        expect(['high', 'normal', 'low']).toContain(p.dominance);
        expect(p.relativeVolume).toBeGreaterThan(0);
      }
    });
  });

  describe('findOptimalTiming', () => {
    it('应找到最佳时段', () => {
      const slotReturns = makeSlotReturns();
      const results = engine.analyzeSlotReturns(slotReturns);
      const timing = engine.findOptimalTiming(results);
      expect(slots).toContain(timing.bestEntrySlot);
      expect(slots).toContain(timing.bestExitSlot);
      expect(timing.reasoning).toBeDefined();
    });
  });

  describe('calcSeasonalityStrength', () => {
    it('应计算季节性强度', () => {
      const slotReturns = makeSlotReturns();
      const results = engine.analyzeSlotReturns(slotReturns);
      const strength = engine.calcSeasonalityStrength(results);
      expect(strength.overallScore).toBeGreaterThanOrEqual(0);
      expect(strength.overallScore).toBeLessThanOrEqual(100);
      expect(strength.consistency).toBeGreaterThanOrEqual(0);
      expect(strength.predictability).toBeGreaterThanOrEqual(0);
    });

    it('空数据应返回零', () => {
      const strength = engine.calcSeasonalityStrength([]);
      expect(strength.overallScore).toBe(0);
    });
  });

  describe('getTimeSlots', () => {
    it('应返回8个交易时段', () => {
      const slots = engine.getTimeSlots();
      expect(slots.length).toBe(8);
      expect(slots[0]).toBe('09:30-10:00');
      expect(slots[7]).toBe('14:30-15:00');
    });
  });
});
