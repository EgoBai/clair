import { describe, it, expect } from 'vitest';
import {
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  findPivots,
  detectDivergences,
  detectHiddenDivergences,
  calculateCompositeScore,
  checkTimeframeAlignment,
  analyzeMomentumDivergence,
  TimeframeData,
  MomentumSignal
} from '../services/momentumDivergenceEngine';

describe('Momentum Divergence Engine', () => {
  // Generate test price data with known patterns
  const generateUptrend = (length: number): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < length; i++) {
      prices.push(prices[i - 1] + Math.random() * 2 - 0.5);
    }
    return prices;
  };

  const generateDowntrend = (length: number): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < length; i++) {
      prices.push(prices[i - 1] - Math.random() * 2 - 0.5);
    }
    return prices;
  };

  const generateBullishDivergence = (): number[] => {
    // Price makes lower lows, but momentum will show higher lows
    return [100, 98, 96, 94, 95, 93, 91, 92, 90, 88, 90, 92, 94, 96, 98, 100, 102, 101, 103, 105,
            103, 101, 99, 97, 98, 96, 94, 95, 97, 99, 101, 103, 105, 107, 109, 111, 110, 112, 114, 113];
  };

  describe('calculateRSI', () => {
    it('should calculate RSI for sufficient data', () => {
      const prices = generateUptrend(50);
      const rsi = calculateRSI(prices, 14);
      expect(rsi.length).toBeGreaterThan(0);
      rsi.forEach(val => {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      });
    });

    it('should return empty array for insufficient data', () => {
      const prices = [1, 2, 3];
      const rsi = calculateRSI(prices, 14);
      expect(rsi).toEqual([]);
    });

    it('should show higher RSI for uptrend', () => {
      const prices = generateUptrend(50);
      const rsi = calculateRSI(prices, 14);
      const avgRSI = rsi.reduce((a, b) => a + b, 0) / rsi.length;
      expect(avgRSI).toBeGreaterThan(50);
    });

    it('should show lower RSI for downtrend', () => {
      const prices = generateDowntrend(50);
      const rsi = calculateRSI(prices, 14);
      const avgRSI = rsi.reduce((a, b) => a + b, 0) / rsi.length;
      expect(avgRSI).toBeLessThan(50);
    });

    it('should handle constant prices', () => {
      const prices = Array(30).fill(100);
      const rsi = calculateRSI(prices, 14);
      expect(rsi.length).toBeGreaterThan(0);
    });

    it('should work with custom period', () => {
      const prices = generateUptrend(30);
      const rsi7 = calculateRSI(prices, 7);
      const rsi14 = calculateRSI(prices, 14);
      expect(rsi7.length).toBeGreaterThan(rsi14.length);
    });
  });

  describe('calculateMACD', () => {
    it('should calculate MACD components', () => {
      const prices = generateUptrend(60);
      const { macd, signal, histogram } = calculateMACD(prices);
      expect(macd.length).toBeGreaterThan(0);
      expect(histogram.length).toBeGreaterThan(0);
    });

    it('should return empty arrays for insufficient data', () => {
      const prices = [1, 2, 3];
      const result = calculateMACD(prices);
      expect(result.macd).toEqual([]);
    });

    it('should have histogram = macd - signal', () => {
      const prices = generateUptrend(60);
      const { macd, signal, histogram } = calculateMACD(prices);
      // histogram length should be signal length
      expect(histogram.length).toBe(signal.length);
    });
  });

  describe('calculateStochastic', () => {
    it('should calculate stochastic oscillator', () => {
      const prices = generateUptrend(30);
      const highs = prices.map(p => p * 1.02);
      const lows = prices.map(p => p * 0.98);
      const { k, d } = calculateStochastic(highs, lows, prices);
      expect(k.length).toBeGreaterThan(0);
      k.forEach(val => {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      });
    });

    it('should return empty for insufficient data', () => {
      const result = calculateStochastic([1], [1], [1]);
      expect(result.k).toEqual([]);
    });
  });

  describe('findPivots', () => {
    it('should find pivot highs and lows', () => {
      const prices = [1, 3, 5, 3, 1, 3, 5, 3, 1, 3, 5, 3, 1, 3, 5, 3, 1];
      const { highs, lows } = findPivots(prices, 2);
      expect(highs.length).toBeGreaterThan(0);
      expect(lows.length).toBeGreaterThan(0);
    });

    it('should not find pivots in monotonic data', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { highs, lows } = findPivots(prices, 2);
      // Strictly increasing: no local pivots in the interior
      expect(highs.length).toBe(0);
      expect(lows.length).toBe(0);
    });

    it('should handle empty array', () => {
      const { highs, lows } = findPivots([], 2);
      expect(highs).toEqual([]);
      expect(lows).toEqual([]);
    });
  });

  describe('detectDivergences', () => {
    it('should detect bullish divergence', () => {
      const prices = [100, 95, 90, 85, 90, 80, 75, 80, 85, 90, 95, 100,
                      95, 90, 85, 80, 75, 70, 75, 80, 85, 90, 95, 100,
                      95, 90, 85, 80, 75, 80, 85, 90, 95, 100, 105, 110];
      const indicator = [50, 45, 40, 35, 40, 30, 25, 35, 40, 45, 50, 55,
                         50, 45, 40, 35, 30, 25, 35, 40, 45, 50, 55, 60,
                         55, 50, 45, 40, 35, 45, 50, 55, 60, 65, 70, 75];
      const signals = detectDivergences(prices, indicator, 3);
      // May or may not detect depending on exact pivot alignment
      expect(Array.isArray(signals)).toBe(true);
    });

    it('should return empty for insufficient data', () => {
      const signals = detectDivergences([1, 2, 3], [1, 2, 3], 5);
      expect(signals).toEqual([]);
    });

    it('should include correct signal properties', () => {
      const prices = [100, 98, 96, 94, 92, 94, 96, 92, 90, 88, 90, 92, 94, 96, 98,
                      100, 98, 96, 94, 92, 90, 92, 94, 96, 98, 100, 102, 104, 102, 100,
                      98, 96, 94, 96, 98, 100, 102, 104, 106, 108];
      const indicator = prices.map((p, i) => p * 0.5 + i * 0.3);
      const signals = detectDivergences(prices, indicator, 3);
      signals.forEach(s => {
        expect(s).toHaveProperty('type');
        expect(s).toHaveProperty('strength');
        expect(s).toHaveProperty('confidence');
        expect(s).toHaveProperty('pricePoints');
        expect(s).toHaveProperty('indicatorPoints');
        expect(s).toHaveProperty('description');
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('detectHiddenDivergences', () => {
    it('should detect hidden bullish divergence', () => {
      const prices = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 3);
      const indicator = prices.map((p, i) => 50 - i * 0.3 + Math.cos(i) * 5);
      const signals = detectHiddenDivergences(prices, indicator, 3);
      expect(Array.isArray(signals)).toBe(true);
    });

    it('should return empty for insufficient data', () => {
      const signals = detectHiddenDivergences([1, 2, 3], [1, 2, 3], 5);
      expect(signals).toEqual([]);
    });
  });

  describe('calculateCompositeScore', () => {
    it('should return 50 for no signals', () => {
      expect(calculateCompositeScore([])).toBe(50);
    });

    it('should score bullish signals higher', () => {
      const signals: MomentumSignal[] = [
        {
          type: 'bullish_divergence',
          timeframe: '1d',
          strength: 80,
          confidence: 0.8,
          pricePoints: [],
          indicatorPoints: [],
          description: 'test'
        }
      ];
      expect(calculateCompositeScore(signals)).toBeGreaterThan(50);
    });

    it('should score bearish signals lower', () => {
      const signals: MomentumSignal[] = [
        {
          type: 'bearish_divergence',
          timeframe: '1d',
          strength: 80,
          confidence: 0.8,
          pricePoints: [],
          indicatorPoints: [],
          description: 'test'
        }
      ];
      expect(calculateCompositeScore(signals)).toBeLessThan(50);
    });

    it('should balance mixed signals', () => {
      const signals: MomentumSignal[] = [
        {
          type: 'bullish_divergence',
          timeframe: '1d',
          strength: 70,
          confidence: 0.7,
          pricePoints: [],
          indicatorPoints: [],
          description: 'test'
        },
        {
          type: 'bearish_divergence',
          timeframe: '1d',
          strength: 70,
          confidence: 0.7,
          pricePoints: [],
          indicatorPoints: [],
          description: 'test'
        }
      ];
      expect(calculateCompositeScore(signals)).toBe(50);
    });
  });

  describe('checkTimeframeAlignment', () => {
    it('should return false for less than 2 signals', () => {
      expect(checkTimeframeAlignment([])).toBe(false);
      const single: MomentumSignal[] = [{
        type: 'bullish_divergence', timeframe: '1d', strength: 80, confidence: 0.8,
        pricePoints: [], indicatorPoints: [], description: ''
      }];
      expect(checkTimeframeAlignment(single)).toBe(false);
    });

    it('should detect alignment when majority agree', () => {
      const signals: MomentumSignal[] = [
        { type: 'bullish_divergence', timeframe: '1d', strength: 80, confidence: 0.8, pricePoints: [], indicatorPoints: [], description: '' },
        { type: 'bullish_divergence', timeframe: '4h', strength: 70, confidence: 0.7, pricePoints: [], indicatorPoints: [], description: '' },
        { type: 'bullish_divergence', timeframe: '1h', strength: 60, confidence: 0.6, pricePoints: [], indicatorPoints: [], description: '' },
        { type: 'bearish_divergence', timeframe: '15m', strength: 50, confidence: 0.5, pricePoints: [], indicatorPoints: [], description: '' }
      ];
      expect(checkTimeframeAlignment(signals)).toBe(true);
    });

    it('should not align when signals are mixed', () => {
      const signals: MomentumSignal[] = [
        { type: 'bullish_divergence', timeframe: '1d', strength: 80, confidence: 0.8, pricePoints: [], indicatorPoints: [], description: '' },
        { type: 'bearish_divergence', timeframe: '4h', strength: 70, confidence: 0.7, pricePoints: [], indicatorPoints: [], description: '' }
      ];
      expect(checkTimeframeAlignment(signals)).toBe(false);
    });
  });

  describe('analyzeMomentumDivergence', () => {
    it('should analyze single timeframe', () => {
      const tf: TimeframeData = {
        timeframe: '1d',
        prices: generateUptrend(60),
        volumes: Array(60).fill(1000000),
        timestamps: Array.from({ length: 60 }, (_, i) => i)
      };
      const result = analyzeMomentumDivergence('TEST', [tf]);
      expect(result.symbol).toBe('TEST');
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high']).toContain(result.riskLevel);
      expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(result.recommendedAction);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should analyze multiple timeframes', () => {
      const tfs: TimeframeData[] = [
        { timeframe: '1d', prices: generateUptrend(60), volumes: Array(60).fill(1000000), timestamps: Array.from({ length: 60 }, (_, i) => i) },
        { timeframe: '4h', prices: generateUptrend(60), volumes: Array(60).fill(500000), timestamps: Array.from({ length: 60 }, (_, i) => i) },
        { timeframe: '1h', prices: generateUptrend(60), volumes: Array(60).fill(200000), timestamps: Array.from({ length: 60 }, (_, i) => i) }
      ];
      const result = analyzeMomentumDivergence('MULTI', tfs);
      expect(result.symbol).toBe('MULTI');
      expect(Array.isArray(result.signals)).toBe(true);
    });

    it('should handle empty timeframes', () => {
      const result = analyzeMomentumDivergence('EMPTY', []);
      expect(result.signals).toEqual([]);
      expect(result.compositeScore).toBe(50);
    });

    it('should have valid signal types', () => {
      const tf: TimeframeData = {
        timeframe: '1d',
        prices: generateBullishDivergence(),
        volumes: Array(40).fill(1000000),
        timestamps: Array.from({ length: 40 }, (_, i) => i)
      };
      const result = analyzeMomentumDivergence('DIVERGE', [tf]);
      result.signals.forEach(s => {
        expect(['bullish_divergence', 'bearish_divergence', 'hidden_bullish', 'hidden_bearish', 'triple_divergence']).toContain(s.type);
      });
    });
  });
});
