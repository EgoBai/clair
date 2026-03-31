import { describe, it, expect } from 'vitest';
import { analyzeIndustryCycle, IndustryCycleData } from '../utils/industryCycleEngine';

describe('行业景气度跟踪引擎', () => {
  const data: IndustryCycleData = {
    industry: '半导体',
    pmi: 52,
    capacityUtilization: 0.82,
    profitGrowth: 15,
    revenueGrowth: 12,
    inventoryRatio: 0.15,
    prevInventoryRatio: 0.18,
    orderIndex: 6,
    exportRatio: 0.35,
  };

  describe('analyzeIndustryCycle', () => {
    it('should calculate prosperity score', () => {
      const result = analyzeIndustryCycle(data);
      expect(result.prosperityScore).toBeGreaterThan(0);
      expect(result.prosperityScore).toBeLessThanOrEqual(100);
    });

    it('should assign grade', () => {
      const result = analyzeIndustryCycle(data);
      expect(['A', 'B', 'C', 'D', 'E']).toContain(result.grade);
    });

    it('should determine cycle phase', () => {
      const result = analyzeIndustryCycle(data);
      expect(['expansion', 'peak', 'contraction', 'trough', 'recovery']).toContain(result.cyclePhase);
    });

    it('should determine inventory phase', () => {
      const result = analyzeIndustryCycle(data);
      expect(['destocking', 'restocking', 'passive_destocking', 'passive_restocking']).toContain(result.inventoryPhase);
    });

    it('should generate rotation signal', () => {
      const result = analyzeIndustryCycle(data);
      expect(['overweight', 'neutral', 'underweight']).toContain(result.rotationSignal);
    });

    it('should provide detail breakdown', () => {
      const result = analyzeIndustryCycle(data);
      expect(result.details.pmiScore).toBeGreaterThanOrEqual(0);
      expect(result.details.capacityScore).toBeGreaterThanOrEqual(0);
    });

    it('should warn on low PMI', () => {
      const lowPMI: IndustryCycleData = { ...data, pmi: 45 };
      const result = analyzeIndustryCycle(lowPMI);
      expect(result.warnings.some(w => w.includes('PMI'))).toBe(true);
    });

    it('should detect expansion phase', () => {
      const expansion: IndustryCycleData = { ...data, pmi: 53, profitGrowth: 20, capacityUtilization: 0.85 };
      const result = analyzeIndustryCycle(expansion);
      expect(result.cyclePhase).toBe('peak');
    });

    it('should detect trough phase', () => {
      const trough: IndustryCycleData = { ...data, pmi: 46, profitGrowth: -25, capacityUtilization: 0.6 };
      const result = analyzeIndustryCycle(trough);
      expect(result.cyclePhase).toBe('trough');
    });
  });
});
