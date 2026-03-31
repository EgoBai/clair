import { describe, it, expect } from 'vitest';
import {
  termStructureAnalysis,
  calendarSpread,
  interCommoditySpread,
  FuturesContract,
} from '../utils/commodityFuturesSpreadEngine';

describe('商品期货价差引擎', () => {
  const contracts: FuturesContract[] = [
    { symbol: 'CU2603', expiry: '2026-03-15', price: 70000, openInterest: 10000, volume: 5000 },
    { symbol: 'CU2606', expiry: '2026-06-15', price: 70500, openInterest: 8000, volume: 4000 },
    { symbol: 'CU2609', expiry: '2026-09-15', price: 71000, openInterest: 6000, volume: 3000 },
  ];

  describe('termStructureAnalysis', () => {
    it('should detect contango', () => {
      const result = termStructureAnalysis(contracts);
      expect(result.structure).toBe('contango');
      expect(result.curve.length).toBe(3);
    });

    it('should detect backwardation', () => {
      const back: FuturesContract[] = [
        { symbol: 'A', expiry: '2026-03-15', price: 71000, openInterest: 1000, volume: 500 },
        { symbol: 'B', expiry: '2026-06-15', price: 70500, openInterest: 1000, volume: 500 },
        { symbol: 'C', expiry: '2026-09-15', price: 70000, openInterest: 1000, volume: 500 },
      ];
      const result = termStructureAnalysis(back);
      expect(result.structure).toBe('backwardation');
    });

    it('should calculate roll yield', () => {
      const result = termStructureAnalysis(contracts);
      expect(typeof result.rollYield).toBe('number');
    });

    it('should handle empty input', () => {
      const result = termStructureAnalysis([]);
      expect(result.curve.length).toBe(0);
    });

    it('should handle single contract', () => {
      const result = termStructureAnalysis([contracts[0]]);
      expect(result.curve.length).toBe(0);
    });
  });

  describe('calendarSpread', () => {
    it('should calculate spread', () => {
      const result = calendarSpread(contracts[0], contracts[2]);
      expect(result.spread).toBe(1000);
      expect(result.signal).toBe('contango');
    });

    it('should detect backwardation spread', () => {
      const result = calendarSpread(contracts[2], contracts[0]);
      expect(result.spread).toBeLessThan(0);
      expect(result.signal).toBe('backwardation');
    });

    it('should calculate annualized carry', () => {
      const result = calendarSpread(contracts[0], contracts[1]);
      expect(typeof result.annualizedCarry).toBe('number');
    });
  });

  describe('interCommoditySpread', () => {
    it('should calculate spread between commodities', () => {
      const result = interCommoditySpread(contracts, contracts, 1);
      expect(typeof result.spread).toBe('number');
      expect(typeof result.zScore).toBe('number');
    });

    it('should classify signal', () => {
      const result = interCommoditySpread(contracts, contracts, 0.5);
      expect(['spread_wide', 'spread_narrow', 'normal']).toContain(result.signal);
    });
  });
});
