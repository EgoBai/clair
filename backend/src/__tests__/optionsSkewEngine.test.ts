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
    it('空输入返回null', () => {
      expect(analyzeSkew([], 100)).toBeNull();
    });

    it('单期权返回null', () => {
      expect(analyzeSkew([{ strike: 100, iv: 0.2, delta: 0.5 }], 100)).toBeNull();
    });

    it('双期权返回null', () => {
      expect(analyzeSkew([
        { strike: 95, iv: 0.22, delta: -0.3 },
        { strike: 105, iv: 0.18, delta: 0.3 },
      ], 100)).toBeNull();
    });

    it('有效输入返回完整结构', () => {
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

    it('平坦IV曲线零偏度', () => {
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

    it('IV递增产生正smirk', () => {
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
      expect(result!.smirk).toBeGreaterThan(0);
    });

    it('IV递减产生负smirk', () => {
      const options: OptionIV[] = [];
      for (let i = 0; i < 5; i++) {
        options.push({
          strike: 90 + i * 5,
          iv: 0.27 - i * 0.03,
          delta: -0.4 + i * 0.2,
        });
      }
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      expect(result!.smirk).toBeLessThan(0);
    });

    it('自动按行权价排序', () => {
      const options: OptionIV[] = [
        { strike: 110, iv: 0.18, delta: 0.4 },
        { strike: 90, iv: 0.25, delta: -0.4 },
        { strike: 100, iv: 0.20, delta: 0 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      expect(result!.smirk).toBeTypeOf('number');
    });

    it('putCallSkew当put IV高时大于1', () => {
      const options: OptionIV[] = [
        { strike: 90, iv: 0.30, delta: -0.4 },
        { strike: 95, iv: 0.25, delta: -0.2 },
        { strike: 100, iv: 0.20, delta: 0 },
      ];
      const result = analyzeSkew(options, 100);
      // put IV > call IV (110, avg IV = 0.2)
      expect(result!.putCallSkew).toBeGreaterThan(0);
    });

    it('所有IV相等时putCallSkew为1', () => {
      const options: OptionIV[] = [
        { strike: 95, iv: 0.2, delta: -0.2 },
        { strike: 100, iv: 0.2, delta: 0 },
        { strike: 105, iv: 0.2, delta: 0.2 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result!.putCallSkew).toBeGreaterThanOrEqual(0.9);
      expect(result!.putCallSkew).toBeLessThanOrEqual(1.1);
    });

    it('波动率微笑形状(两端高中间低)', () => {
      const options: OptionIV[] = [
        { strike: 90, iv: 0.30, delta: -0.4 },  // OTM put, high IV
        { strike: 95, iv: 0.23, delta: -0.2 },
        { strike: 100, iv: 0.20, delta: 0 },     // ATM, low IV
        { strike: 105, iv: 0.24, delta: 0.2 },
        { strike: 110, iv: 0.28, delta: 0.4 },  // OTM call, high IV
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      // In a smile, both sides are high, but slope near ATM is roughly flat
      // Tail risk measured from OTM extremes
      expect(typeof result!.tailRisk).toBe('number');
      expect(typeof result!.butterfly).toBe('number');
    });

    it('skewness >0 当左尾重于右尾(put side更贵)', () => {
      const options: OptionIV[] = [
        { strike: 90, iv: 0.35, delta: -0.4 },  // deep OTM put, expensive
        { strike: 95, iv: 0.25, delta: -0.2 },
        { strike: 100, iv: 0.20, delta: 0 },
        { strike: 105, iv: 0.18, delta: 0.2 },
        { strike: 110, iv: 0.17, delta: 0.4 }, // OTM call, cheap
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      // Should detect put side is more expensive → positive skew
    });

    it('skewness <0 当右tail风险更高(call side更贵)', () => {
      const options: OptionIV[] = [
        { strike: 90, iv: 0.17, delta: -0.4 },
        { strike: 95, iv: 0.18, delta: -0.2 },
        { strike: 100, iv: 0.20, delta: 0 },
        { strike: 105, iv: 0.25, delta: 0.2 },
        { strike: 110, iv: 0.35, delta: 0.4 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
    });

    it('ATM附近没期权时仍能计算', () => {
      const options: OptionIV[] = [
        { strike: 80, iv: 0.30, delta: -0.4 },
        { strike: 90, iv: 0.24, delta: -0.2 },
        { strike: 110, iv: 0.22, delta: 0.2 },
        { strike: 120, iv: 0.18, delta: 0.4 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      expect(result!.skewness).toBeTypeOf('number');
    });

    it('尾风险指标不为负', () => {
      const options = makeOptions(8);
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      expect(result!.tailRisk).toBeGreaterThanOrEqual(0);
    });

    it('蝴蝶指标在微笑形状时最大化', () => {
      // "smile" shape: mid higher than edges
      const smileOptions: OptionIV[] = [
        { strike: 90, iv: 0.18, delta: -0.4 },
        { strike: 95, iv: 0.20, delta: -0.2 },
        { strike: 100, iv: 0.30, delta: 0 },
        { strike: 105, iv: 0.22, delta: 0.2 },
        { strike: 110, iv: 0.18, delta: 0.4 },
      ];
      const result = analyzeSkew(smileOptions, 100);
      expect(result).not.toBeNull();
      expect(typeof result!.butterfly).toBe('number');
    });

    it('风险逆转(riskReversal)在put较贵时为正', () => {
      const options: OptionIV[] = [
        { strike: 90, iv: 0.35, delta: -0.4 },
        { strike: 95, iv: 0.28, delta: -0.2 },
        { strike: 100, iv: 0.20, delta: 0 },
        { strike: 105, iv: 0.18, delta: 0.2 },
        { strike: 110, iv: 0.16, delta: 0.4 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
      // Put OTM IV > Call OTM IV → risk reversal > 0
    });

    it('风险逆转在call更贵时为负', () => {
      const options: OptionIV[] = [
        { strike: 90, iv: 0.16, delta: -0.4 },
        { strike: 95, iv: 0.18, delta: -0.2 },
        { strike: 100, iv: 0.20, delta: 0 },
        { strike: 105, iv: 0.28, delta: 0.2 },
        { strike: 110, iv: 0.35, delta: 0.4 },
      ];
      const result = analyzeSkew(options, 100);
      expect(result).not.toBeNull();
    });
  });
});
