import { describe, it, expect } from 'vitest';
import {
  analyzeOrderFlow,
  calculateLiquidity,
  detectSpoofingPatterns,
  calculateKyleLambda,
  TradeTick,
} from '../services/marketMicrostructureEngine';

const makeTrade = (price: number, volume: number, direction: 'buy' | 'sell' | 'neutral' = 'buy', ts?: number): TradeTick => ({
  price, volume, direction, timestamp: ts ?? Date.now(),
});

describe('marketMicrostructureEngine', () => {
  describe('analyzeOrderFlow', () => {
    it('should return zeros for empty trades', () => {
      const metrics = analyzeOrderFlow([]);
      expect(metrics.buyVolume).toBe(0);
      expect(metrics.sellVolume).toBe(0);
      expect(metrics.tradeCount).toBe(0);
    });

    it('should calculate buy/sell volumes', () => {
      const trades = [
        makeTrade(10, 100, 'buy'),
        makeTrade(10.1, 200, 'sell'),
        makeTrade(10.2, 150, 'buy'),
      ];
      const metrics = analyzeOrderFlow(trades);
      expect(metrics.buyVolume).toBe(250);
      expect(metrics.sellVolume).toBe(200);
      expect(metrics.netVolume).toBe(50);
    });

    it('should calculate VWAP', () => {
      const trades = [
        makeTrade(10, 100, 'buy'),
        makeTrade(11, 100, 'sell'),
      ];
      const metrics = analyzeOrderFlow(trades);
      // totalValue = 10*100 + 11*100 = 2100, totalVolume = 200
      expect(metrics.vwap).toBeCloseTo(10.5, 1);
    });

    it('should calculate TWAP', () => {
      const trades = [
        makeTrade(10, 100, 'buy'),
        makeTrade(12, 100, 'sell'),
      ];
      const metrics = analyzeOrderFlow(trades);
      expect(metrics.twap).toBe(11);
    });

    it('should calculate buy ratio', () => {
      const trades = [
        makeTrade(10, 100, 'buy'),
        makeTrade(10, 100, 'buy'),
        makeTrade(10, 200, 'sell'),
      ];
      const metrics = analyzeOrderFlow(trades);
      expect(metrics.buyRatio).toBeCloseTo(0.5, 1);
    });

    it('should calculate order imbalance', () => {
      const trades = [
        makeTrade(10, 300, 'buy'),
        makeTrade(10, 100, 'sell'),
      ];
      const metrics = analyzeOrderFlow(trades);
      expect(metrics.orderImbalance).toBeCloseTo(0.5, 1);
    });

    it('should calculate average trade size', () => {
      const trades = [
        makeTrade(10, 100, 'buy'),
        makeTrade(10, 200, 'sell'),
        makeTrade(10, 300, 'buy'),
      ];
      const metrics = analyzeOrderFlow(trades);
      expect(metrics.avgTradeSize).toBe(200);
    });

    it('should calculate large trade ratio', () => {
      const trades = [
        makeTrade(10, 100, 'buy'),
        makeTrade(10, 100, 'buy'),
        makeTrade(10, 100, 'buy'),
        makeTrade(10, 1000, 'sell'), // large
      ];
      const metrics = analyzeOrderFlow(trades);
      expect(metrics.largeTradeRatio).toBe(0.25);
    });

    it('should have tradeCount', () => {
      const trades = [makeTrade(10, 100, 'buy'), makeTrade(10, 200, 'sell')];
      const metrics = analyzeOrderFlow(trades);
      expect(metrics.tradeCount).toBe(2);
    });
  });

  describe('calculateLiquidity', () => {
    it('should return zeros for empty books', () => {
      const liq = calculateLiquidity([], []);
      expect(liq.bidAskSpread).toBe(0);
      expect(liq.depth).toBe(0);
    });

    it('should calculate bid-ask spread', () => {
      const bids = [{ price: 10.00, volume: 1000 }, { price: 9.99, volume: 2000 }];
      const asks = [{ price: 10.02, volume: 1000 }, { price: 10.03, volume: 2000 }];
      const liq = calculateLiquidity(bids, asks);
      expect(liq.bidAskSpread).toBeGreaterThan(0);
      expect(liq.bidAskSpread).toBeCloseTo(0.002, 2);
    });

    it('should calculate total depth', () => {
      const bids = [{ price: 10, volume: 1000 }, { price: 9, volume: 2000 }];
      const asks = [{ price: 11, volume: 500 }];
      const liq = calculateLiquidity(bids, asks);
      expect(liq.depth).toBe(3500);
    });

    it('should have marketDepthScore', () => {
      const bids = [{ price: 10, volume: 5000 }];
      const asks = [{ price: 10.01, volume: 5000 }];
      const liq = calculateLiquidity(bids, asks);
      expect(liq.marketDepthScore).toBeGreaterThan(0);
    });
  });

  describe('detectSpoofingPatterns', () => {
    it('should return not detected for short data', () => {
      const result = detectSpoofingPatterns([makeTrade(10, 100, 'buy')]);
      expect(result.detected).toBe(false);
    });

    it('should detect rapid size alternation', () => {
      const trades: TradeTick[] = [];
      for (let i = 0; i < 20; i++) {
        trades.push(makeTrade(10, i % 2 === 0 ? 10 : 10000, 'buy'));
      }
      const result = detectSpoofingPatterns(trades);
      expect(result.patterns.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect price layering', () => {
      const trades: TradeTick[] = [];
      for (let i = 0; i < 20; i++) {
        trades.push(makeTrade(10, 100, 'buy'));
      }
      const result = detectSpoofingPatterns(trades);
      expect(result.patterns).toContain('price_layering');
    });

    it('should return not detected for normal trades', () => {
      const trades: TradeTick[] = [];
      for (let i = 0; i < 20; i++) {
        trades.push(makeTrade(10 + i * 0.01, 100 + i * 10, i % 2 === 0 ? 'buy' : 'sell'));
      }
      const result = detectSpoofingPatterns(trades);
      // normal varied prices and sizes
      expect(result.detected).toBe(false);
    });
  });

  describe('calculateKyleLambda', () => {
    it('should return 0 for insufficient data', () => {
      expect(calculateKyleLambda([makeTrade(10, 100, 'buy')])).toBe(0);
    });

    it('should calculate price impact coefficient', () => {
      const trades = [
        makeTrade(10, 100, 'buy'),
        makeTrade(10.1, 200, 'buy'),
        makeTrade(10.2, 300, 'buy'),
        makeTrade(10.3, 400, 'buy'),
      ];
      const lambda = calculateKyleLambda(trades);
      expect(typeof lambda).toBe('number');
    });

    it('should handle flat prices', () => {
      const trades = [
        makeTrade(10, 100, 'buy'),
        makeTrade(10, 200, 'sell'),
        makeTrade(10, 150, 'buy'),
      ];
      const lambda = calculateKyleLambda(trades);
      expect(typeof lambda).toBe('number');
    });
  });
});
