import { describe, it, expect } from 'vitest';
import { computeStopLoss, computeMultiTimeframeStop, OHLCData } from '../services/adaptiveStopLossEngine';

function genOHLC(days: number, start: number, trend: number): OHLCData[] {
  const data: OHLCData[] = [];
  let p = start;
  for (let i = 0; i < days; i++) {
    const change = trend + (Math.random() - 0.5) * 0.02;
    const h = p * (1 + Math.abs(change) + 0.01);
    const l = p * (1 - Math.abs(change) - 0.01);
    p = p * (1 + change);
    data.push({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, high: h, low: l, close: p });
  }
  return data;
}

describe('AdaptiveStopLossEngine', () => {
  const uptrendData = genOHLC(60, 10, 0.005);
  const downtrendData = genOHLC(60, 10, -0.005);

  describe('computeStopLoss', () => {
    it('should return null for insufficient data', () => {
      expect(computeStopLoss([{ date: '2025-01-01', high: 1, low: 1, close: 1 }], 10)).toBeNull();
    });

    it('should compute stop loss for long position', () => {
      const entryPrice = uptrendData[uptrendData.length - 1].close;
      const result = computeStopLoss(uptrendData, entryPrice, 'long');
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.atrValue).toBeGreaterThan(0);
      expect(result.finalStopLoss).toBeLessThan(entryPrice);
      expect(result.riskPercent).toBeGreaterThan(0);
      expect(['tight', 'normal', 'wide']).toContain(result.stopType);
    });

    it('should compute stop loss for short position', () => {
      const entryPrice = downtrendData[downtrendData.length - 1].close;
      const result = computeStopLoss(downtrendData, entryPrice, 'short');
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.finalStopLoss).toBeGreaterThan(entryPrice);
    });

    it('should apply risk tolerance config', () => {
      const ep = uptrendData[uptrendData.length - 1].close;
      const conservative = computeStopLoss(uptrendData, ep, 'long', { riskTolerance: 'conservative' });
      const aggressive = computeStopLoss(uptrendData, ep, 'long', { riskTolerance: 'aggressive' });
      expect(conservative).not.toBeNull();
      expect(aggressive).not.toBeNull();
      if (!conservative || !aggressive) return;
      expect(aggressive.riskPercent).toBeGreaterThan(conservative.riskPercent);
    });

    it('should detect exit conditions', () => {
      const ep = downtrendData[downtrendData.length - 1].close;
      const result = computeStopLoss(downtrendData, ep, 'long');
      expect(result).not.toBeNull();
      if (!result) return;
      expect(typeof result.shouldExit).toBe('boolean');
    });
  });

  describe('computeMultiTimeframeStop', () => {
    it('should return daily and weekly stops', () => {
      const ep = uptrendData[uptrendData.length - 1].close;
      const result = computeMultiTimeframeStop(uptrendData, ep);
      expect(result.daily).not.toBeNull();
      expect(result.weekly).not.toBeNull();
    });
  });
});
