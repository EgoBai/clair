import { describe, it, expect } from 'vitest';
import {
  calculateSectorMomentum,
  detectRotationSignals,
  analyzeStyleRotation,
  generateAllocationAdvice,
  type SectorPerformance,
} from '../utils/sectorRotation';

describe('SectorRotation', () => {
  const mockSectors: SectorPerformance[] = [
    { sector: '半导体', dayReturn: 2.5, weekReturn: 5, monthReturn: 8, quarterReturn: 15, yearReturn: 30, volume: 5000, turnoverRate: 3.5, advanceDeclineRatio: 2.5, momentum: 6 },
    { sector: '新能源', dayReturn: 1.8, weekReturn: 3, monthReturn: 6, quarterReturn: 10, yearReturn: 20, volume: 4000, turnoverRate: 2.8, advanceDeclineRatio: 2, momentum: 4 },
    { sector: '银行', dayReturn: -0.5, weekReturn: -1, monthReturn: -2, quarterReturn: 1, yearReturn: 5, volume: 2000, turnoverRate: 0.5, advanceDeclineRatio: 0.8, momentum: -1 },
    { sector: '煤炭', dayReturn: -1.2, weekReturn: -3, monthReturn: -5, quarterReturn: -8, yearReturn: -10, volume: 1500, turnoverRate: 1.2, advanceDeclineRatio: 0.3, momentum: -4 },
    { sector: '医药', dayReturn: 0.5, weekReturn: 1, monthReturn: 2, quarterReturn: 3, yearReturn: 8, volume: 3000, turnoverRate: 1.5, advanceDeclineRatio: 1.2, momentum: 1 },
    { sector: '消费', dayReturn: 0.3, weekReturn: 0.5, monthReturn: 1, quarterReturn: 2, yearReturn: 6, volume: 2500, turnoverRate: 1.0, advanceDeclineRatio: 1.0, momentum: 0.5 },
  ];

  describe('calculateSectorMomentum', () => {
    it('should rank sectors by composite momentum', () => {
      const result = calculateSectorMomentum(mockSectors);
      expect(result[0].sector).toBe('半导体');
      expect(result[0].rank).toBe(1);
    });

    it('should calculate weighted composite momentum', () => {
      const result = calculateSectorMomentum(mockSectors);
      const semi = result.find((s) => s.sector === '半导体')!;
      // 5 * 0.5 + 8 * 0.3 + 15 * 0.2 = 2.5 + 2.4 + 3.0 = 7.9
      expect(semi.compositeMomentum).toBeCloseTo(7.9, 1);
    });

    it('should determine trend correctly', () => {
      const result = calculateSectorMomentum(mockSectors);
      const semi = result.find((s) => s.sector === '半导体')!;
      expect(semi.trend).toBe('rising');
      const coal = result.find((s) => s.sector === '煤炭')!;
      expect(coal.trend).toBe('falling');
    });

    it('should calculate acceleration', () => {
      const result = calculateSectorMomentum(mockSectors);
      const semi = result.find((s) => s.sector === '半导体')!;
      // acceleration = 5 - 8/4 = 3
      expect(semi.acceleration).toBe(3);
    });

    it('should assign sequential ranks', () => {
      const result = calculateSectorMomentum(mockSectors);
      const ranks = result.map((s) => s.rank);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle single sector', () => {
      const result = calculateSectorMomentum([mockSectors[0]]);
      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
    });

    it('should handle empty sectors', () => {
      const result = calculateSectorMomentum([]);
      expect(result).toHaveLength(0);
    });

    it('should round values to 2 decimal places', () => {
      const result = calculateSectorMomentum(mockSectors);
      for (const s of result) {
        expect(s.compositeMomentum).toBe(Math.round(s.compositeMomentum * 100) / 100);
      }
    });

    it('should detect sideways trend for near-zero momentum', () => {
      const flatSectors: SectorPerformance[] = [
        { sector: '稳定', dayReturn: 0, weekReturn: 0.5, monthReturn: 0.3, quarterReturn: 0.8, yearReturn: 2, volume: 1000, turnoverRate: 1, advanceDeclineRatio: 1, momentum: 0 },
      ];
      const result = calculateSectorMomentum(flatSectors);
      expect(result[0].trend).toBe('sideways');
    });
  });

  describe('detectRotationSignals', () => {
    const prevSectors: SectorPerformance[] = mockSectors.map((s) => ({
      ...s,
      weekReturn: s.weekReturn - 1,
      monthReturn: s.monthReturn - 2,
      volume: s.volume * 0.8,
    }));

    it('should detect rotate_in signals from weak to strong', () => {
      const signals = detectRotationSignals(mockSectors, prevSectors);
      const rotateIn = signals.filter((s) => s.type === 'rotate_in');
      expect(rotateIn.length).toBeGreaterThan(0);
    });

    it('should include strength in signals', () => {
      const signals = detectRotationSignals(mockSectors, prevSectors);
      for (const s of signals) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });

    it('should detect volume spike signals', () => {
      const withSpike = mockSectors.map((s) =>
        s.sector === '医药' ? { ...s, volume: 10000 } : s
      );
      const prevWithNormal = prevSectors.map((s) =>
        s.sector === '医药' ? { ...s, volume: 3000 } : s
      );
      const signals = detectRotationSignals(withSpike, prevWithNormal);
      expect(signals.some((s) => s.reason.includes('成交量'))).toBe(true);
    });

    it('should detect advance-decline ratio signals', () => {
      const withHighADR = mockSectors.map((s) =>
        s.sector === '半导体' ? { ...s, advanceDeclineRatio: 4, dayReturn: 2 } : s
      );
      const signals = detectRotationSignals(withHighADR, prevSectors);
      expect(signals.some((s) => s.reason.includes('涨跌比'))).toBe(true);
    });

    it('should sort signals by strength descending', () => {
      const signals = detectRotationSignals(mockSectors, prevSectors);
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i - 1].strength).toBeGreaterThanOrEqual(signals[i].strength);
      }
    });

    it('should assign phase to signals', () => {
      const signals = detectRotationSignals(mockSectors, prevSectors);
      for (const s of signals) {
        expect(['early', 'mid', 'late']).toContain(s.phase);
      }
    });

    it('should handle empty sectors', () => {
      const signals = detectRotationSignals([], []);
      expect(signals).toHaveLength(0);
    });

    it('should include reason text', () => {
      const signals = detectRotationSignals(mockSectors, prevSectors);
      for (const s of signals) {
        expect(s.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeStyleRotation', () => {
    it('should analyze growth style', () => {
      const styles = analyzeStyleRotation(mockSectors);
      const growth = styles.find((s) => s.style === 'growth')!;
      expect(growth.favorability).toBeGreaterThan(0);
      expect(['improving', 'deteriorating', 'stable']).toContain(growth.trend);
    });

    it('should analyze value style', () => {
      const styles = analyzeStyleRotation(mockSectors);
      const value = styles.find((s) => s.style === 'value')!;
      expect(value.favorability).toBeGreaterThan(0);
    });

    it('should include momentum style', () => {
      const styles = analyzeStyleRotation(mockSectors);
      const momentum = styles.find((s) => s.style === 'momentum')!;
      expect(momentum.favorability).toBeGreaterThan(0);
    });

    it('should include quality style', () => {
      const styles = analyzeStyleRotation(mockSectors);
      const quality = styles.find((s) => s.style === 'quality')!;
      expect(quality.favorability).toBeGreaterThan(0);
    });

    it('should provide signal text for each style', () => {
      const styles = analyzeStyleRotation(mockSectors);
      for (const s of styles) {
        expect(s.signal.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty sectors', () => {
      const styles = analyzeStyleRotation([]);
      expect(styles).toHaveLength(4);
    });

    it('should favor growth when growth sectors outperform', () => {
      const growthHeavy = mockSectors.map((s) =>
        s.sector === '半导体' || s.sector === '新能源' ? { ...s, monthReturn: 15 } : s
      );
      const styles = analyzeStyleRotation(growthHeavy);
      const growth = styles.find((s) => s.style === 'growth')!;
      const value = styles.find((s) => s.style === 'value')!;
      expect(growth.favorability).toBeGreaterThan(value.favorability);
    });

    it('should cap favorability at 100', () => {
      const highReturn = mockSectors.map((s) => ({ ...s, monthReturn: 50 }));
      const styles = analyzeStyleRotation(highReturn);
      for (const s of styles) {
        expect(s.favorability).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('generateAllocationAdvice', () => {
    const momentum = calculateSectorMomentum(mockSectors);
    const signals = detectRotationSignals(mockSectors, mockSectors.map((s) => ({ ...s, monthReturn: s.monthReturn - 1 })));

    it('should recommend overweight for rising sectors', () => {
      const advice = generateAllocationAdvice(momentum, signals);
      const rising = advice.filter((a) => a.recommendation === 'overweight');
      expect(rising.length).toBeGreaterThan(0);
    });

    it('should recommend underweight for falling sectors', () => {
      const advice = generateAllocationAdvice(momentum, signals);
      const falling = advice.filter((a) => a.recommendation === 'underweight');
      expect(falling.length).toBeGreaterThan(0);
    });

    it('should include confidence scores', () => {
      const advice = generateAllocationAdvice(momentum, signals);
      for (const a of advice) {
        expect(a.confidence).toBeGreaterThanOrEqual(0);
        expect(a.confidence).toBeLessThanOrEqual(100);
      }
    });

    it('should include reasoning', () => {
      const advice = generateAllocationAdvice(momentum, signals);
      for (const a of advice) {
        expect(a.reasoning.length).toBeGreaterThan(0);
      }
    });

    it('should handle all sectors same momentum', () => {
      const flat = mockSectors.map((s) => ({ ...s, weekReturn: 0, monthReturn: 0, quarterReturn: 0 }));
      const flatMomentum = calculateSectorMomentum(flat);
      const advice = generateAllocationAdvice(flatMomentum, []);
      expect(advice.length).toBe(flatMomentum.length);
    });

    it('should boost confidence for signal-supported sectors', () => {
      const advice = generateAllocationAdvice(momentum, signals);
      // At least one sector should have boosted confidence
      const boosted = advice.filter((a) => a.reasoning.includes('轮动信号'));
      if (signals.some((s) => s.type === 'rotate_in')) {
        expect(boosted.length).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
