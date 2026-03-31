import { describe, it, expect } from 'vitest';
import {
  analyzeSectorLinkage,
  analyzeLeaderFollower,
  type SectorStock,
} from '../utils/sectorLinkageEngine';

function makeStock(overrides: Partial<SectorStock> = {}): SectorStock {
  return {
    ticker: '600519',
    name: '贵州茅台',
    sector: '白酒',
    price: 1800,
    change: 2.5,
    volume: 5e7,
    isLeader: false,
    correlation: 0.8,
    ...overrides,
  };
}

describe('Sector Linkage Engine', () => {
  describe('analyzeSectorLinkage', () => {
    it('should return null for insufficient stocks', () => {
      expect(analyzeSectorLinkage([makeStock()])).toBeNull();
    });

    it('should calculate linkage metrics', () => {
      const stocks = [
        makeStock({ ticker: 'A', change: 3 }),
        makeStock({ ticker: 'B', change: 2.5 }),
        makeStock({ ticker: 'C', change: 2 }),
        makeStock({ ticker: 'D', change: -0.5 }),
      ];
      const result = analyzeSectorLinkage(stocks);

      expect(result).not.toBeNull();
      expect(result!.sector).toBe('白酒');
      expect(result!.riseCount).toBe(3);
      expect(result!.fallCount).toBe(1);
      expect(result!.riseRatio).toBe(0.75);
      expect(result!.linkageStrength).toBeGreaterThan(0);
    });

    it('should identify leader stock', () => {
      const stocks = [
        makeStock({ ticker: 'LEADER', change: 5, volume: 1e8 }),
        makeStock({ ticker: 'FOLLOWER', change: 2, volume: 1e7 }),
        makeStock({ ticker: 'WEAK', change: 0.5, volume: 1e6 }),
      ];
      const result = analyzeSectorLinkage(stocks);
      expect(result!.leaderStock).toBe('LEADER');
      expect(result!.leaderChange).toBe(5);
    });

    it('should determine momentum', () => {
      const strongUp = [
        makeStock({ change: 4 }),
        makeStock({ change: 5 }),
        makeStock({ change: 3 }),
        makeStock({ change: 4 }),
      ];
      const result = analyzeSectorLinkage(strongUp);
      expect(result!.momentum).toBe('strong_up');
    });

    it('should determine signal', () => {
      const active = [
        makeStock({ change: 2 }),
        makeStock({ change: 2.5 }),
        makeStock({ change: 1.8 }),
        makeStock({ change: 2.2 }),
      ];
      const result = analyzeSectorLinkage(active);
      expect(['active', 'watch']).toContain(result!.signal);
    });

    it('should handle down momentum', () => {
      const stocks = [
        makeStock({ change: -4 }),
        makeStock({ change: -3 }),
        makeStock({ change: -5 }),
      ];
      const result = analyzeSectorLinkage(stocks);
      expect(['down', 'strong_down']).toContain(result!.momentum);
    });
  });

  describe('analyzeLeaderFollower', () => {
    it('should return null for insufficient stocks', () => {
      expect(analyzeLeaderFollower([makeStock()])).toBeNull();
    });

    it('should identify leader and followers', () => {
      const stocks = [
        makeStock({ ticker: 'LEADER', change: 5, volume: 1e8 }),
        makeStock({ ticker: 'F1', change: 2 }),
        makeStock({ ticker: 'F2', change: -1 }),
      ];
      const result = analyzeLeaderFollower(stocks);

      expect(result).not.toBeNull();
      expect(result!.leader.ticker).toBe('LEADER');
      expect(result!.followers.length).toBe(2);
      expect(result!.leaderAlpha).toBeGreaterThan(0);
    });

    it('should calculate follow strength', () => {
      const stocks = [
        makeStock({ ticker: 'L', change: 5, volume: 1e8 }),
        makeStock({ ticker: 'F', change: 3 }), // same direction
        makeStock({ ticker: 'R', change: -2 }), // reverse
      ];
      const result = analyzeLeaderFollower(stocks);

      const sameDir = result!.followers.find(f => f.stock.ticker === 'F');
      const reverse = result!.followers.find(f => f.stock.ticker === 'R');

      expect(sameDir!.followStrength).toBeGreaterThan(reverse!.followStrength);
    });
  });
});
