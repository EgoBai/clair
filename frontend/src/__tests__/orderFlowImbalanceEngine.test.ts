import { describe, it, expect } from 'vitest';
import { analyzeOrderFlow, Trade } from '../utils/orderFlowImbalanceEngine';

describe('订单流不平衡引擎', () => {
  const makeTrades = (n: number): Trade[] =>
    Array.from({ length: n }, (_, i) => ({
      price: 10 + Math.random() * 0.5,
      volume: Math.floor(100 + Math.random() * 900),
      timestamp: 1710000000000 + i * 1000,
      aggressor: Math.random() > 0.45 ? 'buy' : 'sell' as 'buy' | 'sell',
    }));

  const trades = makeTrades(100);

  it('应该计算买卖量', () => {
    const { metrics } = analyzeOrderFlow(trades);
    expect(metrics.buyVolume).toBeGreaterThan(0);
    expect(metrics.sellVolume).toBeGreaterThan(0);
  });

  it('应该计算净订单流', () => {
    const { metrics } = analyzeOrderFlow(trades);
    expect(metrics.netOrderFlow).toBe(metrics.buyVolume - metrics.sellVolume);
  });

  it('应该计算OFR比率', () => {
    const { metrics } = analyzeOrderFlow(trades);
    expect(metrics.ofrRatio).toBeGreaterThan(0);
  });

  it('应该计算VWAP', () => {
    const { metrics } = analyzeOrderFlow(trades);
    expect(metrics.vwapBuy).toBeGreaterThan(0);
    expect(metrics.vwapSell).toBeGreaterThan(0);
  });

  it('应该计算流动性消耗', () => {
    const { metrics } = analyzeOrderFlow(trades);
    expect(metrics.liquidityConsumption).toBeGreaterThan(0);
  });

  it('应该生成方向信号', () => {
    const { signal } = analyzeOrderFlow(trades);
    expect(['bullish', 'bearish', 'neutral']).toContain(signal.direction);
  });

  it('应该计算信号强度', () => {
    const { signal } = analyzeOrderFlow(trades);
    expect(signal.strength).toBeGreaterThanOrEqual(0);
    expect(signal.strength).toBeLessThanOrEqual(1);
  });

  it('应该计算持续性', () => {
    const { signal } = analyzeOrderFlow(trades);
    expect(signal.persistence).toBeGreaterThanOrEqual(0);
    expect(signal.persistence).toBeLessThanOrEqual(1);
  });

  it('应该预测价格影响', () => {
    const { signal } = analyzeOrderFlow(trades);
    expect(signal.priceImpact).toBeGreaterThanOrEqual(0);
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeOrderFlow([])).toThrow();
  });

  it('纯买单应给出看涨信号', () => {
    const buyOnly: Trade[] = Array.from({ length: 50 }, (_, i) => ({
      price: 10, volume: 500, timestamp: i, aggressor: 'buy' as const,
    }));
    const { signal } = analyzeOrderFlow(buyOnly);
    expect(signal.direction).toBe('bullish');
  });

  it('应该检测大单不平衡', () => {
    const tradesWithLarge: Trade[] = [
      ...makeTrades(20),
      { price: 10.5, volume: 50000, timestamp: 999, aggressor: 'buy' },
      { price: 10.5, volume: 50000, timestamp: 1000, aggressor: 'buy' },
    ];
    const { signal } = analyzeOrderFlow(tradesWithLarge);
    expect(signal.largeOrderSignal).toBe(true);
  });
});
