import { describe, it, expect } from 'vitest';
import {
  generateTWAPSchedule,
  generateVWAPSchedule,
  generateIcebergSlices,
  simulateExecution,
  selectOptimalAlgo,
  type AlgoOrder,
} from '../utils/algoTradingEngine';

function makeOrder(overrides: Partial<AlgoOrder> = {}): AlgoOrder {
  return {
    id: 'order-1',
    stockCode: '000001',
    side: 'buy',
    totalQuantity: 10000,
    startTime: '09:30:00',
    endTime: '15:00:00',
    urgency: 'medium',
    ...overrides,
  };
}

describe('AlgoTradingEngine', () => {
  it('should generate TWAP schedule', () => {
    const order = makeOrder();
    const schedule = generateTWAPSchedule(order, 5);
    expect(schedule.length).toBe(5);
    const totalQty = schedule.reduce((s, sl) => s + sl.quantity, 0);
    expect(totalQty).toBe(10000);
    // Times should be sequential
    expect(schedule[0].time < schedule[1].time).toBe(true);
  });

  it('should generate TWAP with remainder distribution', () => {
    const order = makeOrder({ totalQuantity: 13 });
    const schedule = generateTWAPSchedule(order, 5);
    const totalQty = schedule.reduce((s, sl) => s + sl.quantity, 0);
    expect(totalQty).toBe(13);
    // First 3 slices should get the extra
    expect(schedule[0].quantity).toBe(3);
    expect(schedule[1].quantity).toBe(3);
    expect(schedule[2].quantity).toBe(3);
    expect(schedule[3].quantity).toBe(2);
  });

  it('should generate VWAP schedule', () => {
    const order = makeOrder();
    const volumeProfile = [
      { time: '09:30:00', volumePercent: 30 },
      { time: '10:00:00', volumePercent: 25 },
      { time: '11:00:00', volumePercent: 20 },
      { time: '14:00:00', volumePercent: 25 },
    ];
    const schedule = generateVWAPSchedule(order, volumeProfile);
    expect(schedule.length).toBe(4);
    // First slot should have highest allocation
    expect(schedule[0].quantity).toBeGreaterThanOrEqual(schedule[2].quantity);
  });

  it('should generate iceberg slices', () => {
    const order = makeOrder({ totalQuantity: 50000 });
    const config = { displaySize: 5000, refreshThreshold: 0.2, minDisplaySize: 1000, randomizeSize: false };
    const slices = generateIcebergSlices(order, config);
    expect(slices.length).toBeGreaterThan(0);
    for (const s of slices) {
      expect(s.displayQty).toBeGreaterThan(0);
    }
  });

  it('should handle small iceberg orders', () => {
    const order = makeOrder({ totalQuantity: 500 });
    const config = { displaySize: 1000, refreshThreshold: 0.2, minDisplaySize: 100, randomizeSize: false };
    const slices = generateIcebergSlices(order, config);
    expect(slices.length).toBe(1);
    expect(slices[0].displayQty).toBe(500);
  });

  it('should simulate execution', () => {
    const order = makeOrder({ totalQuantity: 5000 });
    const marketData = Array.from({ length: 20 }, (_, i) => ({
      time: `09:${(30 + i).toString().padStart(2, '0')}:00`,
      price: 10 + i * 0.01,
      volume: 50000,
    }));
    const result = simulateExecution(order, marketData, 0.05);
    expect(result.orderId).toBe('order-1');
    expect(result.totalFilled).toBeGreaterThan(0);
    expect(result.avgPrice).toBeGreaterThan(0);
    expect(result.vwap).toBeGreaterThan(0);
    expect(result.slices.length).toBeGreaterThan(0);
    expect(result.costAnalysis.total).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty market data', () => {
    const order = makeOrder();
    const result = simulateExecution(order, []);
    expect(result.totalFilled).toBe(0);
    expect(result.avgPrice).toBe(0);
  });

  it('should select snipe for high urgency + tight spread', () => {
    const order = makeOrder({ urgency: 'high' });
    const algo = selectOptimalAlgo(order, {
      volatility: 0.02,
      liquidity: 0.8,
      spread: 0.0005,
      trend: 'flat',
    });
    expect(algo.strategy).toBe('snipe');
  });

  it('should select TWAP for low vol + high liquidity', () => {
    const order = makeOrder({ urgency: 'low' });
    const algo = selectOptimalAlgo(order, {
      volatility: 0.01,
      liquidity: 0.9,
      spread: 0.002,
      trend: 'flat',
    });
    expect(algo.strategy).toBe('twap');
  });

  it('should select VWAP for high volatility', () => {
    const order = makeOrder();
    const algo = selectOptimalAlgo(order, {
      volatility: 0.04,
      liquidity: 0.5,
      spread: 0.002,
      trend: 'up',
    });
    expect(algo.strategy).toBe('vwap');
  });

  it('should select Iceberg for large orders', () => {
    const order = makeOrder({ totalQuantity: 500000, urgency: 'low' });
    const algo = selectOptimalAlgo(order, {
      volatility: 0.02,
      liquidity: 0.5,
      spread: 0.002,
      trend: 'flat',
    });
    expect(algo.strategy).toBe('iceberg');
  });
});
