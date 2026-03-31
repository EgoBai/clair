import { describe, it, expect } from 'vitest';
import {
  analyzeMainCapital,
  generateRadarSignals,
  generateCapitalHeatmap,
  analyzeMargin,
  analyzeBlockTrades,
  type CapitalFlowRecord,
} from '../utils/capitalRadarEngine';

function makeFlow(overrides: Partial<CapitalFlowRecord> = {}): CapitalFlowRecord {
  return {
    time: '2025-01-15',
    mainInflow: 50000,
    mainOutflow: 30000,
    retailInflow: 20000,
    retailOutflow: 25000,
    northboundNet: 10000,
    ...overrides,
  };
}

describe('CapitalRadarEngine', () => {
  const sampleFlows: CapitalFlowRecord[] = [
    makeFlow({ time: '2025-01-10', mainInflow: 60000, mainOutflow: 30000, northboundNet: 5000 }),
    makeFlow({ time: '2025-01-11', mainInflow: 55000, mainOutflow: 35000, northboundNet: 8000 }),
    makeFlow({ time: '2025-01-12', mainInflow: 70000, mainOutflow: 25000, northboundNet: -3000 }),
    makeFlow({ time: '2025-01-13', mainInflow: 50000, mainOutflow: 40000, northboundNet: 12000 }),
    makeFlow({ time: '2025-01-14', mainInflow: 65000, mainOutflow: 30000, northboundNet: 7000 }),
  ];

  it('should analyze main capital flow', () => {
    const result = analyzeMainCapital(sampleFlows);
    expect(result.mainNetInflow).toBeGreaterThan(0);
    expect(result.mainDominance).toBeGreaterThan(0);
    expect(result.mainDominance).toBeLessThanOrEqual(1);
    expect(['inflow', 'outflow', 'neutral']).toContain(result.trend);
    expect(result.consecutiveDays).toBeGreaterThan(0);
  });

  it('should handle empty flows', () => {
    const result = analyzeMainCapital([]);
    expect(result.totalNetInflow).toBe(0);
    expect(result.trend).toBe('neutral');
    expect(result.consecutiveDays).toBe(0);
  });

  it('should detect accumulation signals', () => {
    // Main buying but price flat
    const flows = Array(5).fill(null).map((_, i) => makeFlow({
      time: `2025-01-${10 + i}`,
      mainInflow: 80000,
      mainOutflow: 20000,
    }));
    const prices = [10.0, 10.01, 10.0, 9.99, 10.01];
    const signals = generateRadarSignals(flows, prices);
    expect(signals.some(s => s.type === 'accumulation')).toBe(true);
  });

  it('should detect distribution signals', () => {
    // Main selling but price rising
    const flows = Array(5).fill(null).map((_, i) => makeFlow({
      time: `2025-01-${10 + i}`,
      mainInflow: 20000,
      mainOutflow: 80000,
    }));
    const prices = [10.0, 10.5, 10.8, 11.0, 11.2];
    const signals = generateRadarSignals(flows, prices);
    expect(signals.some(s => s.type === 'distribution')).toBe(true);
  });

  it('should detect divergence signals', () => {
    const flows = [
      makeFlow({ mainInflow: 80000, mainOutflow: 20000, northboundNet: -20000 }),
      makeFlow({ mainInflow: 75000, mainOutflow: 25000, northboundNet: -15000 }),
      makeFlow({ mainInflow: 70000, mainOutflow: 30000, northboundNet: -10000 }),
      makeFlow({ mainInflow: 85000, mainOutflow: 15000, northboundNet: -25000 }),
      makeFlow({ mainInflow: 90000, mainOutflow: 10000, northboundNet: -30000 }),
    ];
    const signals = generateRadarSignals(flows, [10, 10, 10, 10, 10]);
    expect(signals.some(s => s.type === 'divergence')).toBe(true);
  });

  it('should return empty signals for insufficient data', () => {
    expect(generateRadarSignals([makeFlow()], [10])).toHaveLength(0);
  });

  it('should generate capital heatmap', () => {
    const sectorFlows = [
      { sector: '科技', netInflow: 50000, stocks: [
        { code: '000001', netInflow: 30000 },
        { code: '000002', netInflow: 20000 },
      ]},
      { sector: '金融', netInflow: -20000, stocks: [
        { code: '600000', netInflow: -15000 },
        { code: '600001', netInflow: -5000 },
      ]},
    ];
    const heatmap = generateCapitalHeatmap(sectorFlows);
    expect(heatmap.length).toBe(2);
    // Sorted by net inflow descending
    expect(heatmap[0].sector).toBe('科技');
    expect(heatmap[0].netInflow).toBe(50000);
    expect(heatmap[0].inflowIntensity).toBeGreaterThan(0);
    expect(heatmap[0].topStocks.length).toBe(2);
  });

  it('should handle empty sector flows', () => {
    expect(generateCapitalHeatmap([])).toHaveLength(0);
  });

  it('should analyze margin trading', () => {
    const history = [
      { date: '2025-01-10', marginBalance: 1000000, shortBalance: 200000 },
      { date: '2025-01-11', marginBalance: 1020000, shortBalance: 195000 },
      { date: '2025-01-12', marginBalance: 1050000, shortBalance: 190000 },
      { date: '2025-01-13', marginBalance: 1080000, shortBalance: 185000 },
      { date: '2025-01-14', marginBalance: 1100000, shortBalance: 180000 },
    ];
    const result = analyzeMargin(history);
    expect(result.balanceChange).toBe(20000);
    expect(result.shortChange).toBe(-5000);
    expect(result.longShortRatio).toBeGreaterThan(0);
    expect(result.sentiment).toBe('bullish');
    expect(result.momentum).toBeGreaterThan(0);
  });

  it('should handle insufficient margin data', () => {
    const result = analyzeMargin([{ date: '2025-01-10', marginBalance: 1000000, shortBalance: 200000 }]);
    expect(result.sentiment).toBe('neutral');
    expect(result.momentum).toBe(0);
  });

  it('should analyze block trades', () => {
    const trades = [
      { price: 10.5, marketPrice: 10.0, volume: 500000, buyer: '机构A' },
      { price: 10.6, marketPrice: 10.0, volume: 300000, buyer: '机构B' },
      { price: 9.8, marketPrice: 10.0, volume: 200000, buyer: '机构C' },
    ];
    const result = analyzeBlockTrades(trades);
    expect(result.premiumCount).toBe(2);
    expect(result.discountCount).toBe(1);
    expect(result.avgPremium).toBeGreaterThan(0);
    expect(result.signal).toBe('bullish');
  });

  it('should handle empty block trades', () => {
    const result = analyzeBlockTrades([]);
    expect(result.signal).toBe('neutral');
    expect(result.avgPremium).toBe(0);
  });
});
