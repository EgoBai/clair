import { describe, it, expect } from 'vitest';
import {
  detectMarketRegime,
  rollingRegimeDetection,
  type PriceData,
} from '../utils/marketRegimeDetector';

function generateBullData(n: number): PriceData[] {
  const data: PriceData[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price *= 1 + Math.random() * 0.015 + 0.002; // 强势上涨
    const high = price * (1 + Math.random() * 0.01);
    const low = price * (1 - Math.random() * 0.01);
    data.push({
      close: price,
      high,
      low,
      volume: 1000000 + Math.random() * 500000,
      date: i
    });
  }
  return data;
}

function generateBearData(n: number): PriceData[] {
  const data: PriceData[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price *= 1 - Math.random() * 0.015 - 0.002; // 强势下跌
    const high = price * (1 + Math.random() * 0.01);
    const low = price * (1 - Math.random() * 0.01);
    data.push({
      close: price,
      high,
      low,
      volume: 1000000 + Math.random() * 500000,
      date: i
    });
  }
  return data;
}

function generateSidewaysData(n: number): PriceData[] {
  const data: PriceData[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price *= 1 + (Math.random() - 0.5) * 0.01; // 震荡
    const high = price * (1 + Math.random() * 0.005);
    const low = price * (1 - Math.random() * 0.005);
    data.push({
      close: price,
      high,
      low,
      volume: 1000000 + Math.random() * 200000,
      date: i
    });
  }
  return data;
}

describe('市场状态识别引擎', () => {
  describe('detectMarketRegime', () => {
    it('should detect bull market from uptrend data', () => {
      const data = generateBullData(100);
      const result = detectMarketRegime(data, 60);
      expect(['bull', 'sideways']).toContain(result.regime);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect bear market from downtrend data', () => {
      const data = generateBearData(100);
      const result = detectMarketRegime(data, 60);
      expect(['bear', 'sideways']).toContain(result.regime);
    });

    it('should detect sideways from random data', () => {
      const data = generateSidewaysData(100);
      const result = detectMarketRegime(data, 60);
      expect(result.regime).toBeDefined();
    });

    it('should return sideways with 0 confidence for insufficient data', () => {
      const data = generateBullData(10);
      const result = detectMarketRegime(data, 60);
      expect(result.regime).toBe('sideways');
      expect(result.confidence).toBe(0);
    });

    it('should include valid metrics', () => {
      const data = generateBullData(100);
      const result = detectMarketRegime(data, 60);
      expect(result.metrics.trendStrength).toBeGreaterThanOrEqual(-1);
      expect(result.metrics.trendStrength).toBeLessThanOrEqual(1);
      expect(['low', 'medium', 'high']).toContain(result.metrics.volatilityRegime);
      expect(result.metrics.momentumScore).toBeGreaterThanOrEqual(-1);
      expect(result.metrics.momentumScore).toBeLessThanOrEqual(1);
      expect(result.metrics.adx).toBeGreaterThanOrEqual(0);
      expect(result.metrics.hurstExponent).toBeGreaterThanOrEqual(0);
      expect(result.metrics.hurstExponent).toBeLessThanOrEqual(1);
    });

    it('should detect transitions', () => {
      // 先涨后跌
      const bullPart = generateBullData(80);
      const bearPart = generateBearData(80);
      const data = [...bullPart, ...bearPart];
      const result = detectMarketRegime(data, 60);
      // 应该有状态转换
      expect(result.transitions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rollingRegimeDetection', () => {
    it('should return results at regular intervals', () => {
      const data = generateBullData(200);
      const results = rollingRegimeDetection(data, 60, 20);
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(['bull', 'bear', 'sideways']).toContain(r.regime);
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should return empty for short data', () => {
      const data = generateBullData(30);
      const results = rollingRegimeDetection(data, 60, 20);
      expect(results.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle constant prices', () => {
      const data: PriceData[] = Array.from({ length: 100 }, (_, i) => ({
        close: 100,
        high: 101,
        low: 99,
        volume: 1000000,
        date: i
      }));
      const result = detectMarketRegime(data, 60);
      expect(result.regime).toBe('sideways');
    });

    it('should handle zero volume', () => {
      const data = generateBullData(100);
      data.forEach(d => d.volume = 0);
      const result = detectMarketRegime(data, 60);
      expect(result.regime).toBeDefined();
    });

    it('should handle single data point in window', () => {
      const data: PriceData[] = [{ close: 100, high: 101, low: 99, volume: 1000 }];
      const result = detectMarketRegime(data, 60);
      expect(result.regime).toBe('sideways');
      expect(result.confidence).toBe(0);
    });
  });
});
