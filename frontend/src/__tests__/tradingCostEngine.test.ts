import { describe, it, expect } from 'vitest';
import {
  calcCommission,
  estimateSlippage,
  estimateImpact,
  estimateTotalCost,
  suggestSlicing,
  evaluateExecution,
  selectBestAlgo,
  type OrderParams,
  type MarketCondition,
} from '../utils/tradingCostEngine';

function makeOrder(overrides: Partial<OrderParams> = {}): OrderParams {
  return {
    ticker: '600519',
    side: 'buy',
    quantity: 1000,
    price: 1800,
    urgency: 'medium',
    orderType: 'limit',
    ...overrides,
  };
}

function makeMarket(overrides: Partial<MarketCondition> = {}): MarketCondition {
  return {
    ticker: '600519',
    avgDailyVolume: 50000000,
    bidAskSpread: 0.02,
    volatility: 0.02,
    depth: [],
    participationRate: 0.05,
    price: 1800,
    ...overrides,
  };
}

describe('Trading Cost Engine', () => {
  describe('calcCommission', () => {
    it('should apply minimum fee for small orders', () => {
      expect(calcCommission(1000)).toBe(5); // min fee
    });

    it('should calculate rate-based commission for large orders', () => {
      const comm = calcCommission(1000000);
      expect(comm).toBe(250); // 1M * 0.00025
    });

    it('should accept custom rate', () => {
      const comm = calcCommission(1000000, 0.0003);
      expect(comm).toBe(300);
    });
  });

  describe('estimateSlippage', () => {
    it('should estimate slippage for normal order', () => {
      const slippage = estimateSlippage(makeOrder(), makeMarket());
      expect(slippage).toBeGreaterThan(0);
      expect(slippage).toBeLessThan(0.05);
    });

    it('should increase for urgent orders', () => {
      const normal = estimateSlippage(makeOrder({ urgency: 'low' }), makeMarket());
      const urgent = estimateSlippage(makeOrder({ urgency: 'immediate' }), makeMarket());
      expect(urgent).toBeGreaterThan(normal);
    });

    it('should increase for large orders', () => {
      const small = estimateSlippage(makeOrder({ quantity: 100 }), makeMarket());
      const large = estimateSlippage(makeOrder({ quantity: 1000000 }), makeMarket());
      expect(large).toBeGreaterThan(small);
    });

    it('should increase with volatility', () => {
      const lowVol = estimateSlippage(makeOrder(), makeMarket({ volatility: 0.01 }));
      const highVol = estimateSlippage(makeOrder(), makeMarket({ volatility: 0.05 }));
      expect(highVol).toBeGreaterThan(lowVol);
    });
  });

  describe('estimateImpact', () => {
    it('should estimate market impact', () => {
      const impact = estimateImpact(makeOrder(), makeMarket());
      expect(impact).toBeGreaterThan(0);
    });

    it('should be higher for bigger participation', () => {
      const small = estimateImpact(makeOrder({ quantity: 100 }), makeMarket());
      const big = estimateImpact(makeOrder({ quantity: 5000000 }), makeMarket());
      expect(big).toBeGreaterThan(small);
    });
  });

  describe('estimateTotalCost', () => {
    it('should return complete cost breakdown', () => {
      const cost = estimateTotalCost(makeOrder(), makeMarket());

      expect(cost.totalCost).toBeGreaterThan(0);
      expect(cost.breakdown.commission).toBeGreaterThan(0);
      expect(cost.costBps).toBeGreaterThan(0);
      expect(cost.estimatedFillPrice).toBeGreaterThan(0);
      expect(cost.fillProbability).toBeGreaterThan(0);
      expect(cost.fillProbability).toBeLessThanOrEqual(1);
      expect(cost.timeToFill).toBeGreaterThan(0);
    });

    it('should have higher cost for immediate orders', () => {
      const normal = estimateTotalCost(makeOrder({ urgency: 'medium' }), makeMarket());
      const immediate = estimateTotalCost(makeOrder({ urgency: 'immediate' }), makeMarket());
      expect(immediate.totalCost).toBeGreaterThan(normal.totalCost);
    });

    it('should estimate fill price adjusted for slippage', () => {
      const buy = estimateTotalCost(makeOrder({ side: 'buy' }), makeMarket());
      const sell = estimateTotalCost(makeOrder({ side: 'sell' }), makeMarket());
      // Buy should have higher fill price, sell lower
      expect(buy.estimatedFillPrice).toBeGreaterThan(1800);
      expect(sell.estimatedFillPrice).toBeLessThan(1800);
    });
  });

  describe('suggestSlicing', () => {
    it('should slice large orders', () => {
      const strategy = suggestSlicing(
        makeOrder({ quantity: 10000000, urgency: 'low' }),
        makeMarket()
      );

      expect(strategy.slices.length).toBeGreaterThan(1);
      expect(strategy.slices.reduce((s, sl) => s + sl.quantity, 0)).toBe(10000000);
      expect(strategy.algo).toBeDefined();
      expect(strategy.estimatedDuration).toBeGreaterThan(0);
    });

    it('should use sniper for immediate orders', () => {
      const strategy = suggestSlicing(
        makeOrder({ urgency: 'immediate' }),
        makeMarket()
      );
      expect(strategy.algo).toBe('sniper');
      expect(strategy.slices[0].orderType).toBe('market');
    });

    it('should use vwap for very large orders', () => {
      const strategy = suggestSlicing(
        makeOrder({ quantity: 50000000, urgency: 'low' }), // 100% of ADV
        makeMarket()
      );
      expect(strategy.algo).toBe('vwap');
    });

    it('should have time offsets in order', () => {
      const strategy = suggestSlicing(makeOrder({ quantity: 100000 }), makeMarket());
      for (let i = 1; i < strategy.slices.length; i++) {
        expect(strategy.slices[i].timeOffset).toBeGreaterThanOrEqual(
          strategy.slices[i - 1].timeOffset
        );
      }
    });
  });

  describe('evaluateExecution', () => {
    it('should calculate execution quality', () => {
      const fills = [
        { price: 100.1, quantity: 500, time: '09:30:00' },
        { price: 100.2, quantity: 500, time: '09:31:00' },
      ];
      const quality = evaluateExecution('ORD001', fills, 'arrival', 100, 100);

      expect(quality.avgFillPrice).toBeCloseTo(100.15, 1);
      expect(quality.slippage).toBeCloseTo(0.15, 1);
      expect(quality.qualityScore).toBeGreaterThan(0);
      expect(quality.qualityScore).toBeLessThanOrEqual(100);
    });

    it('should penalize bad execution', () => {
      const good = [
        { price: 100.05, quantity: 1000, time: '09:30:00' },
      ];
      const bad = [
        { price: 102, quantity: 1000, time: '09:30:00' },
      ];
      const goodQ = evaluateExecution('G', good, 'arrival', 100, 100);
      const badQ = evaluateExecution('B', bad, 'arrival', 100, 100);

      expect(goodQ.qualityScore).toBeGreaterThan(badQ.qualityScore);
    });
  });

  describe('selectBestAlgo', () => {
    it('should select direct for tiny orders', () => {
      const result = selectBestAlgo(
        makeOrder({ quantity: 10 }),
        makeMarket()
      );
      expect(result.algo).toBe('direct');
    });

    it('should select sniper for immediate orders', () => {
      const result = selectBestAlgo(
        makeOrder({ urgency: 'immediate', quantity: 100000 }),
        makeMarket()
      );
      expect(result.algo).toBe('sniper');
    });

    it('should select vwap for large orders', () => {
      const result = selectBestAlgo(
        makeOrder({ quantity: 10000000 }),
        makeMarket()
      );
      expect(result.algo).toBe('vwap');
    });

    it('should include reason and estimated cost', () => {
      const result = selectBestAlgo(makeOrder(), makeMarket());
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.estimatedCost).toBeGreaterThan(0);
    });
  });
});
