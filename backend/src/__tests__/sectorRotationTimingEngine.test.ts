import { describe, it, expect } from 'vitest';
import {
  analyzeSectorRotation,
  getRotationTopBottom,
  detectRotationPair,
  SectorData,
} from '../services/sectorRotationTimingEngine';

const mockSectors: SectorData[] = [
  { name: '半导体', code: 'BK0001', momentum5d: 0.05, momentum20d: 0.10, momentum60d: 0.15, fundFlow: 50, pePercentile: 30, turnoverRate: 3.5, relativeStrength: 1.2 },
  { name: '银行', code: 'BK0002', momentum5d: -0.02, momentum20d: 0.01, momentum60d: 0.03, fundFlow: -20, pePercentile: 15, turnoverRate: 0.8, relativeStrength: 0.95 },
  { name: '白酒', code: 'BK0003', momentum5d: -0.05, momentum20d: -0.08, momentum60d: -0.02, fundFlow: -30, pePercentile: 70, turnoverRate: 1.2, relativeStrength: 0.85 },
  { name: '新能源', code: 'BK0004', momentum5d: 0.08, momentum20d: 0.15, momentum60d: 0.20, fundFlow: 80, pePercentile: 50, turnoverRate: 4.0, relativeStrength: 1.5 },
  { name: '医药', code: 'BK0005', momentum5d: 0.01, momentum20d: 0.02, momentum60d: 0.05, fundFlow: 10, pePercentile: 40, turnoverRate: 1.5, relativeStrength: 1.0 },
];

describe('SectorRotationTimingEngine', () => {
  describe('analyzeSectorRotation', () => {
    it('should return empty for empty input', () => {
      expect(analyzeSectorRotation([])).toEqual([]);
    });

    it('should return signals for all sectors', () => {
      const result = analyzeSectorRotation(mockSectors);
      expect(result).toHaveLength(5);
      result.forEach(r => {
        expect(r.sector).toBeDefined();
        expect(['rotate_in', 'hold', 'rotate_out']).toContain(r.signal);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      });
    });

    it('should rank by score descending', () => {
      const result = analyzeSectorRotation(mockSectors);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });

    it('should detect rotate_in for strong momentum sectors', () => {
      const result = analyzeSectorRotation(mockSectors);
      const topSector = result[0];
      expect(topSector.signal).toBe('rotate_in');
      expect(topSector.momentumRank).toBeLessThanOrEqual(2);
    });

    it('should apply custom weights', () => {
      const result = analyzeSectorRotation(mockSectors, {
        momentumWeight: 0.8,
        flowWeight: 0.1,
        valueWeight: 0.1,
      });
      expect(result).toHaveLength(5);
    });
  });

  describe('getRotationTopBottom', () => {
    it('should return top and bottom sectors', () => {
      const { top, bottom } = getRotationTopBottom(mockSectors);
      expect(top).toHaveLength(3);
      expect(bottom).toHaveLength(3);
      expect(top[0].score).toBeGreaterThanOrEqual(bottom[0].score);
    });
  });

  describe('detectRotationPair', () => {
    it('should detect rotation pair when conditions met', () => {
      const result = detectRotationPair(mockSectors);
      if (result) {
        expect(result.from).toBeDefined();
        expect(result.to).toBeDefined();
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.from).not.toBe(result.to);
      }
    });

    it('should return null for insufficient sectors', () => {
      expect(detectRotationPair([])).toBeNull();
      expect(detectRotationPair([mockSectors[0]])).toBeNull();
    });
  });
});
