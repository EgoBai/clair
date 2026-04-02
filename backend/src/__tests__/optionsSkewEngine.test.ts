import { describe, it, expect } from 'vitest';
import { analyzeSkew, OptionIV } from '../services/optionsSkewEngine';

function makeOptions(count: number): OptionIV[] {
  const options: OptionIV[] = [];
  for (let i = 0; i < count; i++) {
    const strike = 100 + i * 5;
    options.push({
      strike,
      iv: 0.2 + Math.sin(i * 0.5) * 0.05,
      delta: -0.5 + i * (1 / count),
    });
  }
  return options;
}

describe('OptionsSkewEngine', () => {
  describe('analyzeSkew', () => {
    it('should return null when fewer than 3 options', () => {
      expect(analyzeSkew([], 100)).toBeNull();
      expect(analyzeSkew([{ strike: 100, iv: 0.2, delta: 0.5 }], 100)).toBeNull();
      expect(analyzeSkew([
        { strike: 95, iv: 0.22, delta: -0.3 },
        { strike: 105, iv: 0.18, delta: 0.3 },
      ], 100)).toBeNull();
    });

    it('should return correct structure for valid input', () => {
      const options = makeOptions(10);
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('skewness');
      expect(result).toHaveProperty('smirk');
      expect(result).toHaveProperty('putCallSkew');
      expect(result).toHaveProperty('tailRisk');
      expect(result).toHaveProperty('riskReversal');
      expect(result).toHaveProperty('butterfly');
    });

    it('should handle flat IV curve (zero skewness)', () => {
      const options: OptionIV[] = [
        { strike: 90, iv: 0.2, delta: -0.4 },
        { strike: 95, iv: 0.2, delta: -0.2 },
        { strike: 100, iv: 0.2, delta: 0 },
        { strike: 105, iv: 0.2, delta: 0.2 },
        { strike: 110, iv: 0.2, delta: 0.4 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      expect(result!.skewness).toBe(0);
      expect(result!.smirk).toBe(0);
      expect(result!.riskReversal).toBe(0);
    });

    it('should compute positive smirk for increasing IV across strikes', () => {
      const options: OptionIV[] = [];
      for (let i = 0; i < 5; i++) {
        options.push({
          strike: 90 + i * 5,
          iv: 0.15 + i * 0.03,
          delta: -0.4 + i * 0.2,
        });
      }
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      // Monotonically increasing IV -> positive smirk (slope)
      expect(result!.smirk).toBeGreaterThan(0);
    });

    it('should sort options by strike internally', () => {
      const options: OptionIV[] = [
        { strike: 110, iv: 0.18, delta: 0.4 },
        { strike: 90, iv: 0.25, delta: -0.4 },
        { strike: 100, iv: 0.20, delta: 0 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      // Should work regardless of input order
      expect(result!.smirk).toBeTypeOf('number');
    });

    it('should handle putCallSkew when avgItm is 0', () => {
      const options: OptionIV[] = [
        { strike: 90, iv: 0.25, delta: -0.4 },
        { strike: 95, iv: 0.22, delta: -0.2 },
        { strike: 100, iv: 0.20, delta: 0 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      // With no ITM puts/calls, avgItm falls back to atm IV -> putCallSkew ~ 1
      expect(result!.putCallSkew).toBeGreaterThan(0);
    });
  });
});
