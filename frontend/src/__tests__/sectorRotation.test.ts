import { describe, it, expect } from 'vitest';
import {
  calculateSectorMomentum,
  detectRotationSignals,
  analyzeStyleRotation,
  generateAllocationAdvice,
  type SectorPerformance,
  type SectorMomentum,
  type RotationSignal
} from '../utils/sectorRotation';

/**
 * 板块轮动信号引擎测试（导入真实模块）
 * 使用确定性数据驱动真实逻辑。
 */

function makeSectors(): SectorPerformance[] {
  return [
    { sector: '科技', dayReturn: 2, weekReturn: 8, monthReturn: 10, quarterReturn: 12, yearReturn: 20, volume: 2000, turnoverRate: 2, advanceDeclineRatio: 4, momentum: 0.9 },
    { sector: '新能源', dayReturn: 1, weekReturn: 6, monthReturn: 8, quarterReturn: 9, yearReturn: 15, volume: 1500, turnoverRate: 2.5, advanceDeclineRatio: 2, momentum: 0.8 },
    { sector: '银行', dayReturn: 0.2, weekReturn: 0.5, monthReturn: 0.5, quarterReturn: 0.5, yearReturn: 1, volume: 1000, turnoverRate: 1, advanceDeclineRatio: 1, momentum: 0.3 },
    { sector: '煤炭', dayReturn: 0.1, weekReturn: 0.3, monthReturn: 0.2, quarterReturn: 0.1, yearReturn: 0.5, volume: 800, turnoverRate: 1.5, advanceDeclineRatio: 1, momentum: 0.1 },
    { sector: '医药', dayReturn: -2, weekReturn: -8, monthReturn: -10, quarterReturn: -12, yearReturn: -20, volume: 1200, turnoverRate: 2, advanceDeclineRatio: 1, momentum: -0.5 },
  ];
}

// 上一期数据，用于检测轮动：强势板块前期较弱、弱势板块前期较强，并触发成交量异动
function makePreviousSectors(): SectorPerformance[] {
  return [
    { sector: '科技', dayReturn: 1, weekReturn: 6, monthReturn: 6, quarterReturn: 8, yearReturn: 14, volume: 800, turnoverRate: 2, advanceDeclineRatio: 2, momentum: 0.6 },
    { sector: '新能源', dayReturn: 0.5, weekReturn: 4, monthReturn: 4, quarterReturn: 6, yearReturn: 10, volume: 1500, turnoverRate: 2.5, advanceDeclineRatio: 1, momentum: 0.5 },
    { sector: '银行', dayReturn: 0.2, weekReturn: 0.5, monthReturn: 0.5, quarterReturn: 0.5, yearReturn: 1, volume: 1000, turnoverRate: 1, advanceDeclineRatio: 1, momentum: 0.3 },
    { sector: '煤炭', dayReturn: 0.1, weekReturn: 0.3, monthReturn: 0.5, quarterReturn: 0.3, yearReturn: 1, volume: 800, turnoverRate: 1.5, advanceDeclineRatio: 1, momentum: 0.1 },
    { sector: '医药', dayReturn: -1, weekReturn: -6, monthReturn: -6, quarterReturn: -9, yearReturn: -15, volume: 1200, turnoverRate: 2, advanceDeclineRatio: 1, momentum: -0.3 },
  ];
}

describe('SectorRotation (real module)', () => {
  describe('calculateSectorMomentum', () => {
    it('should return momentum per sector with ranks', () => {
      const m: SectorMomentum[] = calculateSectorMomentum(makeSectors());
      expect(m).toHaveLength(5);
      m.forEach(r => expect(r.rank).toBeGreaterThanOrEqual(1));
    });

    it('should rank by composite momentum descending', () => {
      const m = calculateSectorMomentum(makeSectors());
      for (let i = 1; i < m.length; i++) {
        expect(m[i - 1].compositeMomentum).toBeGreaterThanOrEqual(m[i].compositeMomentum);
      }
      expect(m[0].sector).toBe('科技'); // highest composite
    });

    it('should classify trend by composite magnitude', () => {
      const m = calculateSectorMomentum(makeSectors());
      const tech = m.find(x => x.sector === '科技')!;
      const med = m.find(x => x.sector === '医药')!;
      expect(tech.trend).toBe('rising');
      expect(med.trend).toBe('falling');
    });
  });

  describe('detectRotationSignals', () => {
    it('should detect rotation from weak to strong sectors', () => {
      const signals: RotationSignal[] = detectRotationSignals(makeSectors(), makePreviousSectors());
      const rotateToTech = signals.filter(s => s.type === 'rotate_in' && s.toSector === '科技' && s.fromSector === '医药');
      const rotateToNewEnergy = signals.filter(s => s.type === 'rotate_in' && s.toSector === '新能源' && s.fromSector === '医药');
      expect(rotateToTech.length).toBeGreaterThanOrEqual(1);
      expect(rotateToNewEnergy.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit watch signal on volume spike', () => {
      const signals = detectRotationSignals(makeSectors(), makePreviousSectors());
      expect(signals.some(s => s.type === 'watch')).toBe(true);
    });

    it('should detect advance/decline breadth strength', () => {
      const signals = detectRotationSignals(makeSectors(), makePreviousSectors());
      const ad = signals.find(s => s.type === 'rotate_in' && s.fromSector === '' && s.toSector === '科技');
      // 科技 advanceDeclineRatio=4 + dayReturn=2 触发涨跌比信号
      expect(ad).toBeDefined();
    });

    it('should sort signals by strength descending', () => {
      const signals = detectRotationSignals(makeSectors(), makePreviousSectors());
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i - 1].strength).toBeGreaterThanOrEqual(signals[i].strength);
      }
    });
  });

  describe('analyzeStyleRotation', () => {
    it('should cover growth/value/momentum/quality styles', () => {
      const styles = analyzeStyleRotation(makeSectors());
      expect(styles.map(s => s.style)).toEqual(['growth', 'value', 'momentum', 'quality']);
      styles.forEach(s => {
        expect(s.favorability).toBeGreaterThanOrEqual(0);
        expect(s.favorability).toBeLessThanOrEqual(100);
        expect(['improving', 'deteriorating', 'stable']).toContain(s.trend);
        expect(s.signal.length).toBeGreaterThan(0);
      });
    });

    it('should favor growth when growth beats value', () => {
      const styles = analyzeStyleRotation(makeSectors());
      const growth = styles.find(s => s.style === 'growth')!;
      const value = styles.find(s => s.style === 'value')!;
      expect(growth.trend).toBe('improving');
      expect(growth.favorability).toBeGreaterThan(value.favorability);
    });
  });

  describe('generateAllocationAdvice', () => {
    it('should advise overweight/underweight/neutral with valid confidence', () => {
      const momentum = calculateSectorMomentum(makeSectors());
      const signals = detectRotationSignals(makeSectors(), makePreviousSectors());
      const advice = generateAllocationAdvice(momentum, signals);
      expect(advice).toHaveLength(5);
      advice.forEach(a => {
        expect(['overweight', 'neutral', 'underweight']).toContain(a.recommendation);
        expect(a.confidence).toBeGreaterThanOrEqual(0);
        expect(a.confidence).toBeLessThanOrEqual(100);
      });
      expect(advice.some(a => a.recommendation === 'overweight')).toBe(true);
      expect(advice.some(a => a.recommendation === 'underweight')).toBe(true);
    });

    it('should mark 科技 as overweight (strong rising momentum)', () => {
      const momentum = calculateSectorMomentum(makeSectors());
      const signals = detectRotationSignals(makeSectors(), makePreviousSectors());
      const advice = generateAllocationAdvice(momentum, signals);
      expect(advice.find(a => a.sector === '科技')!.recommendation).toBe('overweight');
      expect(advice.find(a => a.sector === '医药')!.recommendation).toBe('underweight');
    });
  });
});
