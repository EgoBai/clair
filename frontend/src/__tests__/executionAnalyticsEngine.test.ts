import { describe, it, expect } from 'vitest';
import {
  calculateVWAP,
  calculateTWAP,
  evaluateExecution,
  summarizeExecutions,
  analyzeTimeSlices,
  TradeExecution,
  BenchmarkPrices,
} from '../utils/executionAnalyticsEngine';

function makeExec(overrides: Partial<TradeExecution> = {}): TradeExecution {
  return {
    symbol: '000001',
    side: 'buy',
    price: 100,
    quantity: 100,
    timestamp: Date.now(),
    ...overrides,
  };
}

const benchmark: BenchmarkPrices = {
  vwap: 100,
  twap: 100,
  open: 99,
  close: 101,
  high: 102,
  low: 98,
  arrivalPrice: 99.5,
};

describe('calculateVWAP', () => {
  it('calculates volume-weighted average', () => {
    const execs = [
      makeExec({ price: 100, quantity: 100 }),
      makeExec({ price: 110, quantity: 200 }),
    ];
    const vwap = calculateVWAP(execs);
    // (100*100 + 110*200) / 300 = 32000/300 = 106.667
    expect(vwap).toBeCloseTo(106.667, 1);
  });

  it('returns 0 for empty', () => {
    expect(calculateVWAP([])).toBe(0);
  });
});

describe('calculateTWAP', () => {
  it('calculates time-weighted average', () => {
    const execs = [
      makeExec({ price: 100, timestamp: 1000 }),
      makeExec({ price: 110, timestamp: 2000 }),
      makeExec({ price: 120, timestamp: 3000 }),
    ];
    const twap = calculateTWAP(execs);
    expect(twap).toBeGreaterThan(100);
  });

  it('returns single price for one execution', () => {
    expect(calculateTWAP([makeExec({ price: 105 })])).toBe(105);
  });
});

describe('evaluateExecution', () => {
  it('calculates slippage', () => {
    const execs = [makeExec({ price: 100.5 })];
    const quality = evaluateExecution(execs, benchmark);
    expect(quality.vwapSlippage).toBeGreaterThan(0);
  });

  it('execution score reflects quality', () => {
    const execs = [makeExec({ price: 100.01 })]; // tiny slippage
    const quality = evaluateExecution(execs, benchmark);
    expect(quality.executionScore).toBeGreaterThan(50);
  });

  it('handles sell side', () => {
    const execs = [makeExec({ price: 101, side: 'sell' })];
    const quality = evaluateExecution(execs, benchmark);
    expect(quality.side).toBe('sell');
  });

  it('calculates participation rate', () => {
    const execs = [makeExec({ quantity: 500 })];
    const quality = evaluateExecution(execs, benchmark, 10000);
    expect(quality.participationRate).toBe(5);
  });
});

describe('summarizeExecutions', () => {
  it('summarizes execution data', () => {
    const execs = [
      makeExec({ price: 100, quantity: 100, venue: 'exchange-a' }),
      makeExec({ price: 101, quantity: 200, venue: 'exchange-b' }),
      makeExec({ price: 99, quantity: 150, venue: 'exchange-a' }),
    ];
    const summary = summarizeExecutions(execs);
    expect(summary.trades).toBe(3);
    expect(summary.totalVolume).toBe(450);
    expect(summary.venueBreakdown['exchange-a'].count).toBe(2);
    expect(summary.bestExecution).not.toBeNull();
    expect(summary.worstExecution).not.toBeNull();
  });

  it('handles empty', () => {
    const summary = summarizeExecutions([]);
    expect(summary.trades).toBe(0);
    expect(summary.bestExecution).toBeNull();
  });
});

describe('analyzeTimeSlices', () => {
  it('groups by time interval', () => {
    const execs = [
      makeExec({ timestamp: 1000 }),
      makeExec({ timestamp: 2000 }),
      makeExec({ timestamp: 700000 }),
    ];
    const slices = analyzeTimeSlices(execs, 600000); // 10 min
    expect(slices).toHaveLength(2);
    expect(slices[0].count).toBe(2);
    expect(slices[1].count).toBe(1);
  });

  it('handles empty', () => {
    expect(analyzeTimeSlices([])).toEqual([]);
  });
});
