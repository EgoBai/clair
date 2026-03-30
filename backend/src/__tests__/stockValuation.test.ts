import { describe, it, expect } from 'vitest';

// 股票估值模型测试
describe('股票估值模型', () => {
  // DCF模型
  describe('DCF估值', () => {
    function dcfValuation(
      freeCashFlows: number[],
      terminalGrowthRate: number,
      discountRate: number
    ): { presentValue: number; terminalValue: number; totalValue: number } {
      let presentValue = 0;
      for (let i = 0; i < freeCashFlows.length; i++) {
        presentValue += freeCashFlows[i] / Math.pow(1 + discountRate, i + 1);
      }

      const lastFCF = freeCashFlows[freeCashFlows.length - 1];
      const terminalFCF = lastFCF * (1 + terminalGrowthRate);
      const terminalValue = terminalFCF / (discountRate - terminalGrowthRate);
      const terminalPV = terminalValue / Math.pow(1 + discountRate, freeCashFlows.length);

      return {
        presentValue,
        terminalValue,
        totalValue: presentValue + terminalPV,
      };
    }

    it('应该正确计算现值', () => {
      const result = dcfValuation([100, 110, 121], 0.03, 0.1);
      expect(result.presentValue).toBeGreaterThan(0);
    });

    it('更高增长率应该有更高估值', () => {
      const low = dcfValuation([100, 110, 121], 0.02, 0.1);
      const high = dcfValuation([100, 110, 121], 0.05, 0.1);
      expect(high.totalValue).toBeGreaterThan(low.totalValue);
    });

    it('更高折现率应该有更低估值', () => {
      const low = dcfValuation([100, 110, 121], 0.03, 0.08);
      const high = dcfValuation([100, 110, 121], 0.03, 0.15);
      expect(low.totalValue).toBeGreaterThan(high.totalValue);
    });

    it('折现率应该大于增长率', () => {
      // 增长率 >= 折现率会导致无穷大
      const result = dcfValuation([100], 0.1, 0.1);
      expect(result.terminalValue).toBe(Infinity);
    });

    it('零现金流应该估值为零', () => {
      const result = dcfValuation([0, 0, 0], 0.03, 0.1);
      expect(result.presentValue).toBeCloseTo(0, 5);
    });
  });

  // PE估值
  describe('PE估值', () => {
    function peValuation(eps: number, industryPE: number, growthRate: number, premium: number = 0): number {
      const adjustedPE = industryPE * (1 + growthRate) * (1 + premium);
      return eps * adjustedPE;
    }

    function pegRatio(pe: number, growthRate: number): number {
      if (growthRate <= 0) return Infinity;
      return pe / (growthRate * 100);
    }

    it('应该正确计算PE估值', () => {
      const value = peValuation(5, 20, 0.1);
      // 5 * 20 * (1+0.1) * (1+0) = 5 * 20 * 1.1 = 110
      expect(value).toBeCloseTo(110, 2);
    });

    it('高增长率应该有更高估值', () => {
      const low = peValuation(5, 20, 0.05);
      const high = peValuation(5, 20, 0.2);
      expect(high).toBeGreaterThan(low);
    });

    it('应该支持估值溢价', () => {
      const base = peValuation(5, 20, 0.1, 0);
      const withPremium = peValuation(5, 20, 0.1, 0.2);
      expect(withPremium).toBeGreaterThan(base);
    });

    it('PEG=1表示合理估值', () => {
      expect(pegRatio(20, 0.2)).toBeCloseTo(1, 2);
    });

    it('PEG<1表示低估', () => {
      expect(pegRatio(15, 0.2)).toBeLessThan(1);
    });

    it('PEG>1表示高估', () => {
      expect(pegRatio(30, 0.2)).toBeGreaterThan(1);
    });

    it('零增长率PEG应该为无穷大', () => {
      expect(pegRatio(20, 0)).toBe(Infinity);
    });

    it('负增长率PEG应该为无穷大', () => {
      expect(pegRatio(20, -0.05)).toBe(Infinity);
    });
  });

  // PB估值
  describe('PB估值', () => {
    function pbValuation(bps: number, targetPB: number): number {
      return bps * targetPB;
    }

    function justifiedPB(roe: number, growthRate: number, costOfEquity: number): number {
      if (costOfEquity <= growthRate) return Infinity;
      return (roe - growthRate) / (costOfEquity - growthRate);
    }

    it('应该正确计算PB估值', () => {
      expect(pbValuation(10, 1.5)).toBe(15);
    });

    it('高PB应该有高估值', () => {
      expect(pbValuation(10, 2)).toBeGreaterThan(pbValuation(10, 1));
    });

    it('合理PB应该基于ROE计算', () => {
      const pb = justifiedPB(0.15, 0.05, 0.1);
      expect(pb).toBeGreaterThan(0);
    });

    it('高ROE应该有高合理PB', () => {
      const low = justifiedPB(0.1, 0.03, 0.1);
      const high = justifiedPB(0.2, 0.03, 0.1);
      expect(high).toBeGreaterThan(low);
    });
  });

  // 股息折现模型
  describe('股息折现模型', () => {
    function dividendDiscountModel(
      currentDividend: number,
      growthRate: number,
      requiredReturn: number,
      years: number = 10
    ): number {
      let value = 0;
      let dividend = currentDividend;
      for (let i = 1; i <= years; i++) {
        dividend *= (1 + growthRate);
        value += dividend / Math.pow(1 + requiredReturn, i);
      }
      // 终值
      const terminalDividend = dividend * (1 + growthRate);
      const terminalValue = terminalDividend / (requiredReturn - growthRate);
      value += terminalValue / Math.pow(1 + requiredReturn, years);
      return value;
    }

    it('应该正确计算股息现值', () => {
      const value = dividendDiscountModel(2, 0.05, 0.1);
      expect(value).toBeGreaterThan(0);
    });

    it('高增长率应该有高估值', () => {
      const low = dividendDiscountModel(2, 0.03, 0.1);
      const high = dividendDiscountModel(2, 0.07, 0.1);
      expect(high).toBeGreaterThan(low);
    });

    it('高要求收益率应该有低估值', () => {
      const low = dividendDiscountModel(2, 0.05, 0.08);
      const high = dividendDiscountModel(2, 0.05, 0.15);
      expect(low).toBeGreaterThan(high);
    });

    it('零股息应该估值为零', () => {
      expect(dividendDiscountModel(0, 0.05, 0.1)).toBeCloseTo(0, 5);
    });
  });

  // 相对估值比较
  describe('相对估值比较', () => {
    interface ComparableCompany {
      name: string;
      pe: number;
      pb: number;
      ps: number;
      roe: number;
      growth: number;
    }

    function calculateMedianMultiples(companies: ComparableCompany[]) {
      const pes = companies.map(c => c.pe).sort((a, b) => a - b);
      const pbs = companies.map(c => c.pb).sort((a, b) => a - b);
      const pss = companies.map(c => c.ps).sort((a, b) => a - b);

      const median = (arr: number[]) => {
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
      };

      return {
        medianPE: median(pes),
        medianPB: median(pbs),
        medianPS: median(pss),
      };
    }

    it('应该正确计算中位数倍数', () => {
      const companies: ComparableCompany[] = [
        { name: 'A', pe: 15, pb: 1.5, ps: 3, roe: 0.15, growth: 0.1 },
        { name: 'B', pe: 20, pb: 2, ps: 4, roe: 0.18, growth: 0.15 },
        { name: 'C', pe: 25, pb: 2.5, ps: 5, roe: 0.2, growth: 0.2 },
      ];
      const result = calculateMedianMultiples(companies);
      expect(result.medianPE).toBe(20);
      expect(result.medianPB).toBe(2);
    });

    it('偶数个公司应该取中间两个平均', () => {
      const companies: ComparableCompany[] = [
        { name: 'A', pe: 10, pb: 1, ps: 2, roe: 0.1, growth: 0.05 },
        { name: 'B', pe: 20, pb: 2, ps: 3, roe: 0.15, growth: 0.1 },
        { name: 'C', pe: 30, pb: 3, ps: 4, roe: 0.2, growth: 0.15 },
        { name: 'D', pe: 40, pb: 4, ps: 5, roe: 0.25, growth: 0.2 },
      ];
      const result = calculateMedianMultiples(companies);
      expect(result.medianPE).toBe(25);
    });

    it('单个公司应该返回该公司的值', () => {
      const companies: ComparableCompany[] = [
        { name: 'A', pe: 15, pb: 1.5, ps: 3, roe: 0.15, growth: 0.1 },
      ];
      const result = calculateMedianMultiples(companies);
      expect(result.medianPE).toBe(15);
    });
  });
});
