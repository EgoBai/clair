import { describe, it, expect } from 'vitest';
import {
  calculateOBV,
  analyzeVolumePrice,
  identifyVolumePatterns,
  type VolumePriceData,
} from '../utils/volumePriceEngine';

function generateVPData(count: number, trend: number = 0.5): VolumePriceData[] {
  const data: VolumePriceData[] = [];
  let price = 10;
  for (let i = 0; i < count; i++) {
    price = Math.max(1, price + (Math.random() - 0.5 + trend * 0.1) * 0.5);
    data.push({
      date: `2026-${String(Math.floor(i / 20) + 1).padStart(2, '0')}-${String((i % 20) + 1).padStart(2, '0')}`,
      open: price - 0.1,
      high: price + 0.3,
      low: price - 0.3,
      close: price,
      volume: 100000 + Math.round(Math.random() * 50000),
      turnover: 1 + Math.random() * 2,
    });
  }
  return data;
}

const mockData = generateVPData(30);

describe('量价分析引擎', () => {
  describe('calculateOBV', () => {
    it('should calculate OBV values', () => {
      const obv = calculateOBV(mockData);
      expect(obv).toHaveLength(mockData.length);
    });

    it('should increase on up days', () => {
      const data: VolumePriceData[] = [
        { date: '1', open: 10, high: 10.5, low: 9.5, close: 10, volume: 1000, turnover: 1 },
        { date: '2', open: 10, high: 11, low: 10, close: 11, volume: 2000, turnover: 1 },
      ];
      const obv = calculateOBV(data);
      expect(obv[1]).toBe(obv[0] + 2000);
    });

    it('should decrease on down days', () => {
      const data: VolumePriceData[] = [
        { date: '1', open: 10, high: 10.5, low: 9.5, close: 10, volume: 1000, turnover: 1 },
        { date: '2', open: 10, high: 10, low: 9, close: 9, volume: 2000, turnover: 1 },
      ];
      const obv = calculateOBV(data);
      expect(obv[1]).toBe(obv[0] - 2000);
    });

    it('should handle empty data', () => {
      expect(calculateOBV([])).toHaveLength(0);
    });
  });

  describe('analyzeVolumePrice', () => {
    it('should return analysis', () => {
      const result = analyzeVolumePrice(mockData);
      expect(result.analysis.volumeRatio).toBeGreaterThan(0);
      expect(typeof result.analysis.obvTrend).toBe('string');
    });

    it('should detect signals', () => {
      const result = analyzeVolumePrice(mockData);
      expect(Array.isArray(result.signals)).toBe(true);
    });

    it('should handle insufficient data', () => {
      const result = analyzeVolumePrice([{ date: '1', open: 10, high: 10, low: 10, close: 10, volume: 100, turnover: 1 }]);
      expect(result.analysis.volumeRatio).toBe(0);
    });

    it('should calculate volume ratio', () => {
      const result = analyzeVolumePrice(mockData);
      expect(result.analysis.avgVolume5).toBeGreaterThan(0);
      expect(result.analysis.avgVolume20).toBeGreaterThan(0);
    });

    it('should include signal descriptions', () => {
      const result = analyzeVolumePrice(mockData);
      result.signals.forEach(s => {
        expect(s.description).toBeTruthy();
        expect(s.strength).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('identifyVolumePatterns', () => {
    it('should identify patterns', () => {
      const patterns = identifyVolumePatterns(mockData);
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should return empty for insufficient data', () => {
      expect(identifyVolumePatterns(generateVPData(3))).toHaveLength(0);
    });

    it('should include confidence and implication', () => {
      const patterns = identifyVolumePatterns(mockData);
      patterns.forEach(p => {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.implication).toBeTruthy();
      });
    });

    it('should detect 放量突破', () => {
      const data = generateVPData(25);
      // Make last day a breakout
      data[data.length - 1].close = Math.max(...data.slice(-20).map(d => d.high)) * 1.05;
      data[data.length - 1].volume = 500000;
      const patterns = identifyVolumePatterns(data);
      expect(patterns.some(p => p.pattern === '放量突破')).toBe(true);
    });
  });
});
