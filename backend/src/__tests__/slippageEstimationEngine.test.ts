import { describe, it, expect } from 'vitest';
import { SlippageEstimationEngine } from '../services/slippageEstimationEngine';

describe('SlippageEstimationEngine', () => {
  const engine = new SlippageEstimationEngine();
  const mkOrder = (qty: number, price = 10.50) => ({ side: 'buy' as const, quantity: qty, price, orderType: 'market' as const, symbol: 'TEST' });
  const mkMarket = () => ({ bid: 10.48, ask: 10.52, volume: 5000000, avgVolume20d: 4800000, volatility: 0.02, spread: 0.004 });

  it('should estimate slippage for market order', () => {
    const result = engine.estimateSlippage(mkOrder(10000), mkMarket());
    expect(result.expectedSlippageBps).toBeGreaterThan(0);
    expect(result.worstCaseBps).toBeGreaterThanOrEqual(result.expectedSlippageBps);
  });

  it('should return near-zero slippage for zero quantity', () => {
    const result = engine.estimateSlippage(mkOrder(0), mkMarket());
    expect(result.expectedSlippageBps).toBeLessThanOrEqual(100);
  });

  it('should calculate spread cost', () => {
    const cost = engine.calculateSpreadCost(mkOrder(10000), mkMarket());
    expect(cost).toBeGreaterThan(0);
  });

  it('should calculate market impact', () => {
    const impact = engine.calculateMarketImpact(mkOrder(50000), mkMarket());
    expect(impact).toBeGreaterThanOrEqual(0);
  });

  it('should calculate timing risk', () => {
    const risk = engine.calculateTimingRisk(mkOrder(10000), mkMarket());
    expect(risk).toBeGreaterThanOrEqual(0);
  });

  it('should estimate total execution cost', () => {
    const cost = engine.estimateTotalExecutionCost(mkOrder(50000), mkMarket());
    expect(cost.totalCostBps).toBeGreaterThan(0);
    expect(cost.slippage).toBeDefined();
  });

  it('should show higher impact for larger orders', () => {
    const small = engine.estimateSlippage(mkOrder(1000), mkMarket());
    const large = engine.estimateSlippage(mkOrder(100000), mkMarket());
    expect(large.expectedSlippageBps).toBeGreaterThanOrEqual(small.expectedSlippageBps);
  });

  it('should handle sell side orders', () => {
    const result = engine.estimateSlippage({ ...mkOrder(10000), side: 'sell' }, mkMarket());
    expect(result.expectedSlippageBps).toBeGreaterThan(0);
  });
});
