import { describe, it, expect } from 'vitest';

// 宏观经济指标分析引擎测试
describe('宏观经济指标分析', () => {
  // GDP增长率分析
  function gdpGrowthRate(current: number, previous: number): number {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }

  // 年化GDP增长率
  function annualizedGrowth(quarterlyRates: number[]): number {
    if (quarterlyRates.length === 0) return 0;
    const compound = quarterlyRates.reduce((acc, r) => acc * (1 + r / 100), 1);
    return (Math.pow(compound, 4 / quarterlyRates.length) - 1) * 100;
  }

  // CPI通胀率
  function inflationRate(cpiCurrent: number, cpiPrevious: number): number {
    if (cpiPrevious === 0) return 0;
    return ((cpiCurrent - cpiPrevious) / cpiPrevious) * 100;
  }

  // 实际利率
  function realInterestRate(nominalRate: number, inflation: number): number {
    return ((1 + nominalRate / 100) / (1 + inflation / 100) - 1) * 100;
  }

  // 费雪方程近似
  function fisherApproximation(nominalRate: number, inflation: number): number {
    return nominalRate - inflation;
  }

  // PMI景气判断
  function pmiSignal(pmi: number): 'expansion' | 'contraction' | 'neutral' {
    if (pmi > 50) return 'expansion';
    if (pmi < 50) return 'contraction';
    return 'neutral';
  }

  // 利率期限结构
  function yieldCurve(rates: { tenor: number; rate: number }[]): 'normal' | 'inverted' | 'flat' {
    if (rates.length < 2) return 'flat';
    const sorted = [...rates].sort((a, b) => a.tenor - b.tenor);
    const slope = sorted[sorted.length - 1].rate - sorted[0].rate;
    if (Math.abs(slope) < 0.01) return 'flat';
    return slope > 0 ? 'normal' : 'inverted';
  }

  // 货币乘数
  function moneyMultiplier(reserveRatio: number): number {
    if (reserveRatio <= 0 || reserveRatio > 1) return 0;
    return 1 / reserveRatio;
  }

  // 泰勒规则利率
  function taylorRule(inflation: number, targetInflation: number, outputGap: number, neutralRate: number = 2): number {
    return neutralRate + inflation + 0.5 * (inflation - targetInflation) + 0.5 * outputGap;
  }

  // 购买力平价汇率
  function pppExchangeRate(domesticPrice: number, foreignPrice: number, spotRate: number): number {
    if (foreignPrice === 0) return 0;
    return spotRate * (domesticPrice / foreignPrice);
  }

  // GDP缺口
  function outputGap(actualGDP: number, potentialGDP: number): number {
    if (potentialGDP === 0) return 0;
    return ((actualGDP - potentialGDP) / potentialGDP) * 100;
  }

  // 科布-道格拉斯生产函数
  function cobbDouglas(capital: number, labor: number, alpha: number, A: number = 1): number {
    return A * Math.pow(capital, alpha) * Math.pow(labor, 1 - alpha);
  }

  // 恩格尔系数
  function engelCoefficient(foodExpenditure: number, totalExpenditure: number): number {
    if (totalExpenditure === 0) return 0;
    return (foodExpenditure / totalExpenditure) * 100;
  }

  // 基尼系数 (简化)
  function giniCoefficient(incomes: number[]): number {
    if (incomes.length === 0) return 0;
    const sorted = [...incomes].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    if (mean === 0) return 0;
    let sumDiff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumDiff += Math.abs(sorted[i] - sorted[j]);
      }
    }
    return sumDiff / (2 * n * n * mean);
  }

  describe('GDP增长率', () => {
    it('增长返回正值', () => {
      expect(gdpGrowthRate(110, 100)).toBe(10);
    });

    it('衰退返回负值', () => {
      expect(gdpGrowthRate(90, 100)).toBe(-10);
    });

    it('零增长返回0', () => {
      expect(gdpGrowthRate(100, 100)).toBe(0);
    });

    it('前期为0返回0', () => {
      expect(gdpGrowthRate(100, 0)).toBe(0);
    });
  });

  describe('年化增长率', () => {
    it('四个季度1% ≈ 年化4%', () => {
      const result = annualizedGrowth([1, 1, 1, 1]);
      expect(result).toBeCloseTo(4, 0);
    });

    it('空数组返回0', () => {
      expect(annualizedGrowth([])).toBe(0);
    });

    it('两个季度年化', () => {
      const result = annualizedGrowth([2, 2]);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('通胀率', () => {
    it('正确计算CPI通胀', () => {
      expect(inflationRate(103, 100)).toBeCloseTo(3, 5);
    });

    it('通缩返回负值', () => {
      expect(inflationRate(98, 100)).toBeCloseTo(-2, 5);
    });
  });

  describe('实际利率', () => {
    it('费雪方程精确版', () => {
      const real = realInterestRate(5, 3);
      expect(real).toBeCloseTo(1.94, 1);
    });

    it('名义<通胀时实际为负', () => {
      expect(realInterestRate(2, 5)).toBeLessThan(0);
    });

    it('费雪近似与精确版接近(低通胀)', () => {
      const exact = realInterestRate(5, 2);
      const approx = fisherApproximation(5, 2);
      expect(Math.abs(exact - approx)).toBeLessThan(0.1);
    });
  });

  describe('PMI景气信号', () => {
    it('50以上扩张', () => expect(pmiSignal(55)).toBe('expansion'));
    it('50以下收缩', () => expect(pmiSignal(45)).toBe('contraction'));
    it('50中性', () => expect(pmiSignal(50)).toBe('neutral'));
  });

  describe('收益率曲线', () => {
    it('短低长高为正常', () => {
      const rates = [{ tenor: 1, rate: 2 }, { tenor: 10, rate: 4 }];
      expect(yieldCurve(rates)).toBe('normal');
    });

    it('短高长低为倒挂', () => {
      const rates = [{ tenor: 1, rate: 4 }, { tenor: 10, rate: 2 }];
      expect(yieldCurve(rates)).toBe('inverted');
    });

    it('持平为flat', () => {
      const rates = [{ tenor: 1, rate: 3 }, { tenor: 10, rate: 3.005 }];
      expect(yieldCurve(rates)).toBe('flat');
    });

    it('单个期限为flat', () => {
      expect(yieldCurve([{ tenor: 5, rate: 3 }])).toBe('flat');
    });
  });

  describe('货币乘数', () => {
    it('10%准备金率 → 乘数10', () => {
      expect(moneyMultiplier(0.1)).toBe(10);
    });

    it('20%准备金率 → 乘数5', () => {
      expect(moneyMultiplier(0.2)).toBe(5);
    });

    it('100%准备金率 → 乘数1', () => {
      expect(moneyMultiplier(1)).toBe(1);
    });

    it('无效比率返回0', () => {
      expect(moneyMultiplier(0)).toBe(0);
      expect(moneyMultiplier(1.5)).toBe(0);
    });
  });

  describe('泰勒规则', () => {
    it('通胀=目标,产出缺口=0 → 中性利率+通胀', () => {
      const rate = taylorRule(2, 2, 0);
      expect(rate).toBe(4); // 2 + 2 + 0 + 0
    });

    it('高通胀 → 提高利率', () => {
      const r1 = taylorRule(2, 2, 0);
      const r2 = taylorRule(5, 2, 0);
      expect(r2).toBeGreaterThan(r1);
    });

    it('负产出缺口 → 降低利率', () => {
      const r1 = taylorRule(2, 2, 0);
      const r2 = taylorRule(2, 2, -2);
      expect(r2).toBeLessThan(r1);
    });
  });

  describe('购买力平价', () => {
    it('价格相等时汇率不变', () => {
      expect(pppExchangeRate(100, 100, 7)).toBe(7);
    });

    it('国内更贵 → 汇率上升', () => {
      expect(pppExchangeRate(150, 100, 7)).toBeGreaterThan(7);
    });

    it('外币价格为0返回0', () => {
      expect(pppExchangeRate(100, 0, 7)).toBe(0);
    });
  });

  describe('产出缺口', () => {
    it('超过潜力为正缺口', () => {
      expect(outputGap(110, 100)).toBe(10);
    });

    it('低于潜力为负缺口', () => {
      expect(outputGap(95, 100)).toBe(-5);
    });
  });

  describe('科布-道格拉斯', () => {
    it('资本翻倍产量增加', () => {
      const y1 = cobbDouglas(100, 100, 0.3);
      const y2 = cobbDouglas(200, 100, 0.3);
      expect(y2).toBeGreaterThan(y1);
    });

    it('alpha=0时只与劳动有关', () => {
      const y1 = cobbDouglas(100, 100, 0);
      const y2 = cobbDouglas(200, 100, 0);
      expect(y1).toBe(y2);
    });

    it('alpha=1时只与资本有关', () => {
      const y1 = cobbDouglas(100, 100, 1);
      const y2 = cobbDouglas(100, 200, 1);
      expect(y1).toBe(y2);
    });
  });

  describe('恩格尔系数', () => {
    it('返回百分比', () => {
      expect(engelCoefficient(3000, 10000)).toBe(30);
    });

    it('总支出为0返回0', () => {
      expect(engelCoefficient(100, 0)).toBe(0);
    });

    it('范围在[0,100]', () => {
      const e = engelCoefficient(5000, 10000);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(100);
    });
  });

  describe('基尼系数', () => {
    it('完全平等返回0', () => {
      expect(giniCoefficient([100, 100, 100, 100])).toBeCloseTo(0, 5);
    });

    it('完全不平等 > 0', () => {
      expect(giniCoefficient([0, 0, 0, 1000])).toBeGreaterThan(0.5);
    });

    it('空数组返回0', () => {
      expect(giniCoefficient([])).toBe(0);
    });

    it('在[0,1]范围', () => {
      const g = giniCoefficient([10, 50, 100, 200, 500]);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    });
  });
});
