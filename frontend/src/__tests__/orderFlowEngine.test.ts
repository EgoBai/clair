import { describe, it, expect } from 'vitest';
import {
  analyzeOrderFlow,
  computeCVP,
  generateFootprint,
  detectLargeOrders,
  computePressureHeatmap,
  type TickTrade,
} from '../utils/orderFlowEngine';

function makeTrade(overrides: Partial<TickTrade> = {}): TickTrade {
  return {
    price: 10.0,
    volume: 1000,
    time: '09:30:00',
    direction: 'buy',
    amount: 10000,
    ...overrides,
  };
}

describe('OrderFlowEngine', () => {
  const sampleTrades: TickTrade[] = [
    makeTrade({ price: 10.0, volume: 5000, direction: 'buy', time: '09:30:01', amount: 50000 }),
    makeTrade({ price: 10.05, volume: 3000, direction: 'sell', time: '09:30:02', amount: 30150 }),
    makeTrade({ price: 10.02, volume: 8000, direction: 'buy', time: '09:30:03', amount: 80160 }),
    makeTrade({ price: 10.0, volume: 2000, direction: 'sell', time: '09:30:04', amount: 20000 }),
    makeTrade({ price: 10.05, volume: 6000, direction: 'buy', time: '09:30:05', amount: 60300 }),
  ];

  it('should analyze order flow correctly', () => {
    const result = analyzeOrderFlow(sampleTrades);
    expect(result.buyVolume).toBe(19000);
    expect(result.sellVolume).toBe(5000);
    expect(result.delta).toBe(14000);
    expect(result.buyPressure).toBeGreaterThan(0.5);
    expect(result.sellPressure).toBeLessThan(0.5);
    expect(result.vwap).toBeGreaterThan(0);
    expect(result.poc).toBe(10.05); // 10.05 has highest total volume (9000)
    expect(result.valueAreaHigh).toBeGreaterThanOrEqual(result.valueAreaLow);
  });

  it('should handle empty trades', () => {
    const result = analyzeOrderFlow([]);
    expect(result.buyVolume).toBe(0);
    expect(result.sellVolume).toBe(0);
    expect(result.delta).toBe(0);
    expect(result.buyPressure).toBe(0.5);
    expect(result.cumulativeDelta).toBe(0);
  });

  it('should compute CVP correctly', () => {
    const cvp = computeCVP(sampleTrades);
    expect(cvp.length).toBeGreaterThan(0);
    // Highest volume level should be first
    expect(cvp[0].totalVolume).toBeGreaterThanOrEqual(cvp[cvp.length - 1].totalVolume);
    // Each level should have valid data
    for (const level of cvp) {
      expect(level.buyVolume).toBeGreaterThanOrEqual(0);
      expect(level.sellVolume).toBeGreaterThanOrEqual(0);
      expect(level.delta).toBe(level.buyVolume - level.sellVolume);
      expect(level.buyPercent).toBeGreaterThanOrEqual(0);
      expect(level.buyPercent).toBeLessThanOrEqual(100);
    }
  });

  it('should generate footprint data', () => {
    const footprint = generateFootprint(sampleTrades, 2);
    expect(footprint.length).toBeGreaterThan(0);
    for (const bar of footprint) {
      expect(bar.buyVolume).toBeGreaterThanOrEqual(0);
      expect(bar.sellVolume).toBeGreaterThanOrEqual(0);
      expect(['buy', 'sell', 'neutral']).toContain(bar.imbalance);
    }
  });

  it('should detect large orders', () => {
    const trades = [
      makeTrade({ volume: 500 }),
      makeTrade({ volume: 150000, direction: 'buy' }),
      makeTrade({ volume: 500000, direction: 'sell' }),
      makeTrade({ volume: 100 }),
    ];
    const alerts = detectLargeOrders(trades, 100000);
    expect(alerts.length).toBe(2);
    expect(alerts[0].significance).toBe('high');
    expect(alerts[1].significance).toBe('extreme');
  });

  it('should compute pressure heatmap', () => {
    const heatmap = computePressureHeatmap(sampleTrades);
    expect(heatmap.length).toBeGreaterThan(0);
    for (const point of heatmap) {
      expect(point.buyPressure).toBeGreaterThanOrEqual(0);
      expect(point.sellPressure).toBeGreaterThanOrEqual(0);
      expect(point.volume).toBeGreaterThan(0);
    }
  });

  it('should handle buy-only trades', () => {
    const buyOnly = sampleTrades.map(t => ({ ...t, direction: 'buy' as const }));
    const result = analyzeOrderFlow(buyOnly);
    expect(result.sellVolume).toBe(0);
    expect(result.buyPressure).toBe(1);
  });

  it('should handle sell-only trades', () => {
    const sellOnly = sampleTrades.map(t => ({ ...t, direction: 'sell' as const }));
    const result = analyzeOrderFlow(sellOnly);
    expect(result.buyVolume).toBe(0);
    expect(result.sellPressure).toBe(1);
  });

  it('should compute cumulative delta series', () => {
    const result = analyzeOrderFlow(sampleTrades);
    // cumulative delta should equal buy - sell at end
    expect(result.cumulativeDelta).toBe(result.delta);
  });

  it('should compute CVP with custom tick size', () => {
    const cvp = computeCVP(sampleTrades, 0.05);
    expect(cvp.length).toBeGreaterThan(0);
  });
});
