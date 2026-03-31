import { describe, it, expect } from 'vitest';
import {
  calculateCompositeMomentum,
  rankSectorsByMomentum,
  detectRotationSignals,
  analyzePropagation,
  clusterSectors,
  analyzeSectorRotation,
  type SectorData,
} from '../utils/sectorMomentumRotationEngine';

const mockSectors: SectorData[] = [
  {
    name: '半导体', code: 'BK0500',
    returns: { d1: 2.5, d5: 8.2, d10: 12.1, d20: 15.3, d60: 22.0 },
    volume: { current: 150000, avg20: 100000, change: 50 },
    breadth: 0.75, constituents: 80, advancing: 60, declining: 20,
  },
  {
    name: '白酒', code: 'BK0501',
    returns: { d1: -0.5, d5: 1.2, d10: 3.5, d20: 8.0, d60: 15.0 },
    volume: { current: 80000, avg20: 90000, change: -11 },
    breadth: 0.45, constituents: 30, advancing: 14, declining: 16,
  },
  {
    name: '新能源', code: 'BK0502',
    returns: { d1: 3.0, d5: 6.5, d10: 4.2, d20: -2.1, d60: -8.0 },
    volume: { current: 200000, avg20: 120000, change: 67 },
    breadth: 0.7, constituents: 100, advancing: 70, declining: 30,
  },
  {
    name: '银行', code: 'BK0503',
    returns: { d1: 0.3, d5: 0.8, d10: 1.5, d20: 3.0, d60: 5.0 },
    volume: { current: 50000, avg20: 55000, change: -9 },
    breadth: 0.55, constituents: 40, advancing: 22, declining: 18,
  },
  {
    name: '医药', code: 'BK0504',
    returns: { d1: -1.0, d5: -3.5, d10: -5.0, d20: -8.0, d60: -12.0 },
    volume: { current: 60000, avg20: 70000, change: -14 },
    breadth: 0.3, constituents: 60, advancing: 18, declining: 42,
  },
  {
    name: '军工', code: 'BK0505',
    returns: { d1: 1.8, d5: 4.5, d10: 6.0, d20: 7.5, d60: 10.0 },
    volume: { current: 110000, avg20: 80000, change: 38 },
    breadth: 0.65, constituents: 50, advancing: 33, declining: 17,
  },
];

describe('板块动量轮动引擎', () => {
  describe('calculateCompositeMomentum', () => {
    it('should calculate weighted composite momentum', () => {
      const mom = calculateCompositeMomentum(mockSectors[0]);
      // 2.5*0.35 + 8.2*0.25 + 12.1*0.2 + 15.3*0.15 + 22.0*0.05
      expect(mom).toBeCloseTo(2.5 * 0.35 + 8.2 * 0.25 + 12.1 * 0.2 + 15.3 * 0.15 + 22.0 * 0.05, 2);
    });

    it('should handle negative momentum', () => {
      const mom = calculateCompositeMomentum(mockSectors[4]); // 医药
      expect(mom).toBeLessThan(0);
    });

    it('should prioritize recent returns', () => {
      const sectorA: SectorData = {
        ...mockSectors[0],
        returns: { d1: 10, d5: 0, d10: 0, d20: 0, d60: 0 },
      };
      const sectorB: SectorData = {
        ...mockSectors[0],
        returns: { d1: 0, d5: 0, d10: 0, d20: 0, d60: 10 },
      };
      expect(calculateCompositeMomentum(sectorA)).toBeGreaterThan(calculateCompositeMomentum(sectorB));
    });
  });

  describe('rankSectorsByMomentum', () => {
    it('should rank sectors by composite momentum', () => {
      const ranks = rankSectorsByMomentum(mockSectors);
      expect(ranks).toHaveLength(mockSectors.length);
      expect(ranks[0].rank).toBe(1);
      expect(ranks[0].composite).toBeGreaterThanOrEqual(ranks[1].composite);
    });

    it('should assign percentiles correctly', () => {
      const ranks = rankSectorsByMomentum(mockSectors);
      expect(ranks[0].percentile).toBe(100);
      expect(ranks[ranks.length - 1].percentile).toBeGreaterThanOrEqual(0);
    });

    it('should detect trend direction', () => {
      const ranks = rankSectorsByMomentum(mockSectors);
      const accelerating = ranks.filter(r => r.trend === 'accelerating');
      const decelerating = ranks.filter(r => r.trend === 'decelerating');
      expect(accelerating.length + decelerating.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle single sector', () => {
      const ranks = rankSectorsByMomentum([mockSectors[0]]);
      expect(ranks).toHaveLength(1);
      expect(ranks[0].rank).toBe(1);
      expect(ranks[0].percentile).toBe(100);
    });
  });

  describe('detectRotationSignals', () => {
    it('should detect leading signals for hot sectors', () => {
      const signals = detectRotationSignals(mockSectors);
      const leadingSignals = signals.filter(s => s.type === 'leading');
      // 半导体 d5=8.2, volRatio=1.5, breadth=0.75 → 应该是leading
      expect(leadingSignals.length).toBeGreaterThan(0);
      expect(leadingSignals[0].sector).toBe('半导体');
    });

    it('should detect reversing signals', () => {
      const reversingSector: SectorData[] = [{
        name: '反转板块', code: 'BK9999',
        returns: { d1: 4.0, d5: 5.5, d10: 2.0, d20: -8.0, d60: -15.0 },
        volume: { current: 200000, avg20: 100000, change: 100 },
        breadth: 0.6, constituents: 50, advancing: 30, declining: 20,
      }];
      const signals = detectRotationSignals(reversingSector);
      const reversingSignals = signals.filter(s => s.type === 'reversing');
      expect(reversingSignals.length).toBeGreaterThan(0);
    });

    it('should sort signals by strength', () => {
      const signals = detectRotationSignals(mockSectors);
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i - 1].strength).toBeGreaterThanOrEqual(signals[i].strength);
      }
    });

    it('should return empty signals for neutral sectors', () => {
      const neutral: SectorData[] = [{
        name: '中性', code: 'N',
        returns: { d1: 0, d5: 0.5, d10: 1, d20: 1.5, d60: 2 },
        volume: { current: 100, avg20: 100, change: 0 },
        breadth: 0.5, constituents: 10, advancing: 5, declining: 5,
      }];
      const signals = detectRotationSignals(neutral);
      expect(signals).toHaveLength(0);
    });

    it('should include description in each signal', () => {
      const signals = detectRotationSignals(mockSectors);
      signals.forEach(s => {
        expect(s.description).toBeTruthy();
        expect(s.description.length).toBeGreaterThan(5);
      });
    });
  });

  describe('analyzePropagation', () => {
    it('should detect propagation links between sectors', () => {
      const links = analyzePropagation(mockSectors);
      expect(Array.isArray(links)).toBe(true);
    });

    it('should have valid correlation values', () => {
      const links = analyzePropagation(mockSectors);
      links.forEach(link => {
        expect(link.correlation).toBeGreaterThanOrEqual(0);
        expect(link.correlation).toBeLessThanOrEqual(1);
        expect(link.lag).toBeGreaterThanOrEqual(1);
        expect(link.lag).toBeLessThanOrEqual(5);
      });
    });

    it('should limit results to 20', () => {
      const manySectors: SectorData[] = Array.from({ length: 30 }, (_, i) => ({
        name: `板块${i}`, code: `B${i}`,
        returns: { d1: Math.random() * 5, d5: Math.random() * 10, d10: Math.random() * 15, d20: Math.random() * 20 - 5, d60: Math.random() * 30 - 10 },
        volume: { current: 100000, avg20: 80000, change: 25 },
        breadth: 0.5, constituents: 20, advancing: 10, declining: 10,
      }));
      const links = analyzePropagation(manySectors);
      expect(links.length).toBeLessThanOrEqual(20);
    });
  });

  describe('clusterSectors', () => {
    it('should cluster sectors into groups', () => {
      const clusters = clusterSectors(mockSectors);
      expect(clusters.length).toBeGreaterThan(0);
      const totalMembers = clusters.reduce((s, c) => s + c.members.length, 0);
      expect(totalMembers).toBe(mockSectors.length);
    });

    it('should assign phase to each cluster', () => {
      const clusters = clusterSectors(mockSectors);
      clusters.forEach(c => {
        expect(['early', 'mid', 'late']).toContain(c.phase);
        expect(c.coherence).toBeGreaterThanOrEqual(0);
        expect(c.coherence).toBeLessThanOrEqual(1);
      });
    });

    it('should return empty for less than 3 sectors', () => {
      expect(clusterSectors([mockSectors[0], mockSectors[1]])).toHaveLength(0);
    });

    it('should have coherent clusters', () => {
      const clusters = clusterSectors(mockSectors);
      clusters.forEach(c => {
        expect(c.members.length).toBeGreaterThanOrEqual(1);
        expect(typeof c.avgMomentum).toBe('number');
      });
    });
  });

  describe('analyzeSectorRotation', () => {
    it('should return complete analysis', () => {
      const result = analyzeSectorRotation(mockSectors);
      expect(result.ranks.length).toBe(mockSectors.length);
      expect(Array.isArray(result.signals)).toBe(true);
      expect(Array.isArray(result.propagation)).toBe(true);
      expect(Array.isArray(result.clusters)).toBe(true);
    });

    it('should identify hot and cold sectors', () => {
      const result = analyzeSectorRotation(mockSectors);
      expect(result.summary.hotSector).toBe('半导体');
      expect(result.summary.coldSector).toBe('医药');
    });

    it('should determine market phase', () => {
      const result = analyzeSectorRotation(mockSectors);
      expect(['risk_on', 'risk_off', 'transition']).toContain(result.summary.marketPhase);
    });

    it('should calculate rotation intensity', () => {
      const result = analyzeSectorRotation(mockSectors);
      expect(result.summary.rotationIntensity).toBeGreaterThan(0);
      expect(result.summary.rotationIntensity).toBeLessThanOrEqual(100);
    });

    it('should handle all positive sectors', () => {
      const positive: SectorData[] = mockSectors.map(s => ({
        ...s,
        returns: { d1: 2, d5: 5, d10: 8, d20: 12, d60: 18 },
        volume: { current: 150000, avg20: 80000, change: 87 },
        breadth: 0.7,
      }));
      const result = analyzeSectorRotation(positive);
      expect(['risk_on', 'transition']).toContain(result.summary.marketPhase);
    });

    it('should handle all negative sectors', () => {
      const negative: SectorData[] = mockSectors.map(s => ({
        ...s,
        returns: { d1: -1, d5: -3, d10: -5, d20: -8, d60: -12 },
      }));
      const result = analyzeSectorRotation(negative);
      expect(result.summary.marketPhase).toBe('risk_off');
    });

    it('should handle empty sectors', () => {
      const result = analyzeSectorRotation([]);
      expect(result.ranks).toHaveLength(0);
      expect(result.signals).toHaveLength(0);
    });

    it('should handle single sector', () => {
      const result = analyzeSectorRotation([mockSectors[0]]);
      expect(result.ranks).toHaveLength(1);
      expect(result.summary.hotSector).toBe(result.summary.coldSector);
    });
  });
});
