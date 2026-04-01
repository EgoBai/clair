import { describe, it, expect } from 'vitest';

// 量化因子挖掘引擎
interface FactorCandidate {
  name: string;
  formula: string;
  ic: number;
  icir: number;
  turnover: number;
  longShortReturn: number;
  decay: number;
  stability: number;
}

interface FactorEvaluation {
  factor: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  effective: boolean;
  recommendations: string[];
}

function evaluateFactor(factor: FactorCandidate): FactorEvaluation {
  let score = 0;
  const recommendations: string[] = [];

  // IC评估
  if (Math.abs(factor.ic) > 0.05) score += 25;
  else if (Math.abs(factor.ic) > 0.03) score += 15;
  else recommendations.push('IC过低，预测能力弱');

  // ICIR评估
  if (factor.icir > 2) score += 25;
  else if (factor.icir > 1) score += 15;
  else recommendations.push('ICIR不稳定，因子波动大');

  // 换手率评估
  if (factor.turnover < 0.3) score += 20;
  else if (factor.turnover < 0.5) score += 10;
  else recommendations.push('换手率过高，交易成本侵蚀收益');

  // 多空收益评估
  if (factor.longShortReturn > 0.1) score += 15;
  else if (factor.longShortReturn > 0.05) score += 10;
  else recommendations.push('多空收益不足');

  // 衰减评估
  if (factor.decay > 10) score += 15;
  else if (factor.decay > 5) score += 10;
  else recommendations.push('因子衰减快，有效期短');

  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';
  return { factor: factor.name, score, grade, effective: score >= 50, recommendations };
}

function rankFactors(factors: FactorCandidate[]): FactorEvaluation[] {
  return factors
    .map(f => evaluateFactor(f))
    .sort((a, b) => b.score - a.score);
}

function findComplementaryFactors(evaluations: FactorEvaluation[]): FactorEvaluation[][] {
  const effective = evaluations.filter(e => e.effective);
  const pairs: FactorEvaluation[][] = [];
  for (let i = 0; i < effective.length; i++) {
    for (let j = i + 1; j < effective.length; j++) {
      if (effective[i].score > 50 && effective[j].score > 50) {
        pairs.push([effective[i], effective[j]]);
      }
    }
  }
  return pairs.slice(0, 5);
}

function calcFactorDecayCurve(factor: FactorCandidate, days: number = 20): { day: number; ic: number }[] {
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    ic: factor.ic * Math.exp(-i / factor.decay),
  }));
}

describe('量化因子挖掘引擎', () => {
  const factors: FactorCandidate[] = [
    { name: 'EP', formula: 'earnings/price', ic: 0.06, icir: 2.5, turnover: 0.2, longShortReturn: 0.12, decay: 15, stability: 0.8 },
    { name: '动量', formula: 'price_12m/price_1m', ic: 0.04, icir: 1.8, turnover: 0.35, longShortReturn: 0.08, decay: 8, stability: 0.7 },
    { name: '波动率', formula: 'std(returns_20d)', ic: -0.03, icir: 1.2, turnover: 0.25, longShortReturn: 0.06, decay: 12, stability: 0.6 },
    { name: 'SMB', formula: 'market_cap_rank', ic: 0.02, icir: 0.8, turnover: 0.15, longShortReturn: 0.04, decay: 20, stability: 0.5 },
    { name: '噪音因子', formula: 'random', ic: 0.005, icir: 0.1, turnover: 0.8, longShortReturn: 0.01, decay: 1, stability: 0.1 },
  ];

  it('应评估因子质量', () => {
    const eval_ = evaluateFactor(factors[0]);
    expect(eval_.score).toBeGreaterThan(0);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(eval_.grade);
    expect(typeof eval_.effective).toBe('boolean');
  });

  it('高质量因子应得高分', () => {
    const good = evaluateFactor(factors[0]);
    const bad = evaluateFactor(factors[4]);
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it('应排名因子', () => {
    const ranked = rankFactors(factors);
    expect(ranked.length).toBe(factors.length);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
  });

  it('噪音因子应排名最低', () => {
    const ranked = rankFactors(factors);
    expect(ranked[ranked.length - 1].factor).toBe('噪音因子');
  });

  it('应找出互补因子对', () => {
    const ranked = rankFactors(factors);
    const pairs = findComplementaryFactors(ranked);
    pairs.forEach(pair => {
      expect(pair.length).toBe(2);
      expect(pair[0].effective).toBe(true);
      expect(pair[1].effective).toBe(true);
    });
  });

  it('应计算因子衰减曲线', () => {
    const curve = calcFactorDecayCurve(factors[0], 10);
    expect(curve.length).toBe(10);
    expect(curve[0].ic).toBeCloseTo(factors[0].ic, 5);
    for (let i = 1; i < curve.length; i++) {
      expect(Math.abs(curve[i].ic)).toBeLessThanOrEqual(Math.abs(curve[i - 1].ic) + 0.0001);
    }
  });

  it('低IC因子应有改善建议', () => {
    const eval_ = evaluateFactor(factors[4]);
    expect(eval_.recommendations.length).toBeGreaterThan(0);
  });

  it('高换手率因子应被警告', () => {
    const highTurnover = { ...factors[0], turnover: 0.8 };
    const eval_ = evaluateFactor(highTurnover);
    expect(eval_.recommendations.some(r => r.includes('换手率'))).toBe(true);
  });

  it('IC绝对值相同但方向不同应同分', () => {
    const pos = { ...factors[0], ic: 0.05 };
    const neg = { ...factors[0], ic: -0.05 };
    expect(evaluateFactor(pos).score).toBe(evaluateFactor(neg).score);
  });

  it('空因子列表应排名为空', () => {
    expect(rankFactors([])).toEqual([]);
  });
});
