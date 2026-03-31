import { describe, it, expect } from 'vitest';
import { gordonGrowthModel, multiStageDDM, DDMInput } from '../utils/ddmEngine';

describe('股息贴现模型引擎', () => {
  describe('gordonGrowthModel', () => {
    it('should calculate intrinsic value', () => {
      const value = gordonGrowthModel(2, 0.05, 0.10);
      expect(value).toBeCloseTo(42, 0);
    });

    it('should return Infinity when required <= growth', () => {
      expect(gordonGrowthModel(2, 0.10, 0.05)).toBe(Infinity);
    });

    it('should handle zero dividend', () => {
      expect(gordonGrowthModel(0, 0.05, 0.10)).toBe(0);
    });
  });

  describe('multiStageDDM', () => {
    const input: DDMInput = {
      currentDividend: 2,
      growthRate: 0.10,
      requiredReturn: 0.12,
      growthDuration: 5,
      terminalGrowth: 0.03,
    };

    it('should calculate intrinsic value', () => {
      const result = multiStageDDM(input, 50);
      expect(result.intrinsicValue).toBeGreaterThan(0);
    });

    it('should have stages', () => {
      const result = multiStageDDM(input, 50);
      expect(result.stages.length).toBe(2);
      expect(result.stages[0].name).toBe('高增长阶段');
      expect(result.stages[1].name).toBe('永续阶段');
    });

    it('should calculate margin of safety', () => {
      const result = multiStageDDM(input, 30);
      expect(result.marginOfSafety).toBeGreaterThan(0); // undervalued
    });

    it('should generate recommendation', () => {
      const result = multiStageDDM(input, 50);
      expect(['undervalued', 'fairly_valued', 'overvalued']).toContain(result.recommendation);
    });

    it('should generate sensitivity table', () => {
      const result = multiStageDDM(input, 50);
      expect(result.sensitivity.length).toBeGreaterThan(0);
    });

    it('should calculate current yield', () => {
      const result = multiStageDDM(input, 50);
      expect(result.currentYield).toBeCloseTo(0.04, 2);
    });

    it('should handle zero required return', () => {
      const result = multiStageDDM({ ...input, requiredReturn: 0 }, 50);
      expect(result.intrinsicValue).toBe(0);
    });
  });
});
