import { describe, it, expect } from 'vitest';
import {
  classifyTicks,
  buildOrderFlowBars,
  calculateVolumeProfile,
  analyzeDelta,
  calculateLiquidity,
  classifyTrades,
  buildFootprint,
  detectImbalanceZones,
} from '../utils/orderFlowEngine';
import type { Tick } from '../utils/orderFlowEngine';

function generateTicks(n: number, startPrice: number = 100): Tick[] {
  const ticks: Tick[] = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const change = (Math.random() - 0.5) * 0.1;
    price += change;
    ticks.push({
      timestamp: i * 100,
      price: Math.round(price * 100) / 100,
      volume: Math.floor(Math.random() * 500) + 100,
      isBuy: Math.random() > 0.5,
    });
  }
  return ticks;
}

describe('Order Flow Engine', () => {
  describe('classifyTicks', () => {
    it('should classify ticks using Lee-Ready', () => {
      const ticks = generateTicks(100);
      const classified = classifyTicks(ticks);

      expect(classified).toHaveLength(100);
      for (const tick of classified) {
        expect(typeof tick.isBuy).toBe('boolean');
      }
    });

    it('should handle empty input', () => {
      expect(classifyTicks([])).toEqual([]);
    });

    it('should classify higher prices as buys', () => {
      const ticks: Tick[] = [
        { timestamp: 0, price: 100, volume: 100, isBuy: false },
        { timestamp: 1, price: 101, volume: 100, isBuy: false }, // should be buy
      ];
      const classified = classifyTicks(ticks);
      expect(classified[1].isBuy).toBe(true);
    });
  });

  describe('buildOrderFlowBars', () => {
    it('should build bars from ticks', () => {
      const ticks = generateTicks(200);
      const bars = buildOrderFlowBars(ticks, 10000);

      expect(bars.length).toBeGreaterThan(0);
      for (const bar of bars) {
        expect(bar).toHaveProperty('open');
        expect(bar).toHaveProperty('high');
        expect(bar).toHaveProperty('low');
        expect(bar).toHaveProperty('close');
        expect(bar).toHaveProperty('buyVolume');
        expect(bar).toHaveProperty('sellVolume');
        expect(bar).toHaveProperty('delta');
        expect(bar).toHaveProperty('cumulativeDelta');
        expect(bar).toHaveProperty('imbalance');
        expect(bar.high).toBeGreaterThanOrEqual(bar.low);
      }
    });

    it('should handle empty ticks', () => {
      expect(buildOrderFlowBars([])).toEqual([]);
    });

    it('should maintain cumulative delta', () => {
      const ticks = generateTicks(100);
      const bars = buildOrderFlowBars(ticks, 1000);

      let runningDelta = 0;
      for (const bar of bars) {
        runningDelta += bar.delta;
        expect(bar.cumulativeDelta).toBeCloseTo(runningDelta, 0);
      }
    });
  });

  describe('calculateVolumeProfile', () => {
    it('should calculate volume profile', () => {
      const ticks = generateTicks(500);
      const profile = calculateVolumeProfile(ticks, 0.01, 30);

      expect(profile.poc).toBeGreaterThan(0);
      expect(profile.valueAreaHigh).toBeGreaterThanOrEqual(profile.valueAreaLow);
      expect(profile.totalVolume).toBeGreaterThan(0);
      expect(typeof profile.imbalance).toBe('number');

      for (const level of profile.levels) {
        expect(level.totalVolume).toBeGreaterThan(0);
        expect(level.percentOfTotal).toBeGreaterThanOrEqual(0);
        expect(level).toHaveProperty('buyVolume');
        expect(level).toHaveProperty('sellVolume');
        expect(level).toHaveProperty('delta');
      }
    });

    it('should handle empty ticks', () => {
      const profile = calculateVolumeProfile([], 0.01);
      expect(profile.totalVolume).toBe(0);
      expect(profile.levels).toHaveLength(0);
    });

    it('should find POC at highest volume level', () => {
      const ticks = generateTicks(500);
      const profile = calculateVolumeProfile(ticks, 0.1, 20);

      const maxVolumeLevel = profile.levels.reduce(
        (max, l) => l.totalVolume > max.totalVolume ? l : max,
        profile.levels[0]
      );
      if (maxVolumeLevel) {
        expect(profile.poc).toBeCloseTo(maxVolumeLevel.price, 1);
      }
    });
  });

  describe('analyzeDelta', () => {
    it('should analyze delta', () => {
      const ticks = generateTicks(200);
      const delta = analyzeDelta(ticks);

      expect(Array.isArray(delta.cumulativeDelta)).toBe(true);
      expect(typeof delta.deltaMA).toBe('number');
      expect(typeof delta.deltaDivergence).toBe('boolean');
      expect(Array.isArray(delta.absorptionPoints)).toBe(true);
      expect(Array.isArray(delta.exhaustionPoints)).toBe(true);
      expect(['bullish', 'bearish', 'neutral']).toContain(delta.trendConfirmation);
    });

    it('should handle short data', () => {
      const ticks = generateTicks(5);
      const delta = analyzeDelta(ticks);
      expect(delta.trendConfirmation).toBeDefined();
    });
  });

  describe('calculateLiquidity', () => {
    it('should calculate liquidity metrics', () => {
      const ticks = generateTicks(200);
      const bids = ticks.map(t => t.price - 0.01);
      const asks = ticks.map(t => t.price + 0.01);
      const volumes = ticks.map(t => t.volume);

      const liquidity = calculateLiquidity(ticks, bids, asks, volumes);

      expect(liquidity.bidAskSpread).toBeGreaterThan(0);
      expect(liquidity.effectiveSpread).toBeGreaterThanOrEqual(0);
      expect(liquidity.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(liquidity.liquidityScore).toBeLessThanOrEqual(100);
      expect(typeof liquidity.amihudIlliquidity).toBe('number');
      expect(typeof liquidity.kyleLambda).toBe('number');
    });
  });

  describe('classifyTrades', () => {
    it('should classify trades', () => {
      const ticks = generateTicks(200);
      const classification = classifyTrades(ticks, 300);

      expect(classification.aggressiveBuys).toBeGreaterThanOrEqual(0);
      expect(classification.aggressiveSells).toBeGreaterThanOrEqual(0);
      expect(classification.passiveBuys).toBeGreaterThanOrEqual(0);
      expect(classification.passiveSells).toBeGreaterThanOrEqual(0);
      expect(classification.buyPressure).toBeGreaterThanOrEqual(-1);
      expect(classification.buyPressure).toBeLessThanOrEqual(1);
      expect(classification.institutionalFlow + classification.retailFlow).toBeCloseTo(1, 1);
    });
  });

  describe('buildFootprint', () => {
    it('should build footprint chart', () => {
      const ticks = generateTicks(300);
      const footprint = buildFootprint(ticks, 0.05);

      expect(footprint.length).toBeGreaterThan(0);
      for (const bar of footprint) {
        expect(bar).toHaveProperty('price');
        expect(bar).toHaveProperty('buyVolume');
        expect(bar).toHaveProperty('sellVolume');
        expect(bar).toHaveProperty('delta');
        expect(bar).toHaveProperty('rowImbalance');
        expect(typeof bar.rowImbalance).toBe('boolean');
      }
    });

    it('should handle empty ticks', () => {
      expect(buildFootprint([])).toEqual([]);
    });

    it('should have sorted prices', () => {
      const ticks = generateTicks(200);
      const footprint = buildFootprint(ticks, 0.05);

      for (let i = 1; i < footprint.length; i++) {
        expect(footprint[i].price).toBeGreaterThanOrEqual(footprint[i - 1].price);
      }
    });
  });

  describe('detectImbalanceZones', () => {
    it('should detect imbalance zones', () => {
      const ticks = generateTicks(500);
      const footprint = buildFootprint(ticks, 0.05);
      const zones = detectImbalanceZones(footprint, 0.6);

      for (const zone of zones) {
        expect(zone).toHaveProperty('startPrice');
        expect(zone).toHaveProperty('endPrice');
        expect(zone).toHaveProperty('totalDelta');
        expect(zone).toHaveProperty('significance');
        expect(zone).toHaveProperty('type');
        expect(['buying', 'selling']).toContain(zone.type);
        expect(zone.significance).toBeGreaterThan(0);
      }
    });

    it('should handle empty footprint', () => {
      expect(detectImbalanceZones([])).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle single tick', () => {
      const ticks: Tick[] = [{ timestamp: 0, price: 100, volume: 100, isBuy: true }];
      const bars = buildOrderFlowBars(ticks, 10000);
      expect(bars.length).toBe(1);
    });

    it('should handle all same price', () => {
      const ticks: Tick[] = Array(50).fill(null).map((_, i) => ({
        timestamp: i * 100,
        price: 100,
        volume: 100,
        isBuy: i % 2 === 0,
      }));

      const profile = calculateVolumeProfile(ticks, 0.01);
      expect(profile.levels.length).toBeGreaterThan(0);
    });

    it('should handle very large volumes', () => {
      const ticks: Tick[] = [
        { timestamp: 0, price: 100, volume: 1000000, isBuy: true },
        { timestamp: 1, price: 100.01, volume: 100, isBuy: false },
      ];
      const classification = classifyTrades(ticks, 1000);
      expect(classification.institutionalFlow).toBeGreaterThan(0.9);
    });
  });
});
