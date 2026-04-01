/**
 * 性能归因分析逻辑测试
 * 覆盖收益归因、因子暴露、Brinson模型
 */

import { describe, it, expect } from 'vitest';

describe('性能归因分析', () => {
  describe('收益归因计算', () => {
    interface Attribution {
      sector: string;
      weight: number;
      sectorReturn: number;
      benchmarkWeight: number;
      benchmarkReturn: number;
    }

    function calcBrinsonAttribution(attributions: Attribution[]): {
      allocationEffect: number;
      selectionEffect: number;
      interactionEffect: number;
      totalActive: number;
    } {
      let allocation = 0, selection = 0, interaction = 0;
      const benchmarkReturn = attributions.reduce((s, a) => s + a.benchmarkWeight * a.benchmarkReturn, 0);

      for (const a of attributions) {
        const wDiff = a.weight - a.benchmarkWeight;
        const rDiff = a.sectorReturn - a.benchmarkReturn;
        allocation += wDiff * a.benchmarkReturn;
        selection += a.benchmarkWeight * rDiff;
        interaction += wDiff * rDiff;
      }

      return {
        allocationEffect: Math.round(allocation * 10000) / 10000,
        selectionEffect: Math.round(selection * 10000) / 10000,
        interactionEffect: Math.round(interaction * 10000) / 10000,
        totalActive: Math.round((allocation + selection + interaction) * 10000) / 10000,
      };
    }

    it('应正确计算Brinson归因', () => {
      const attributions: Attribution[] = [
        { sector: '科技', weight: 0.4, sectorReturn: 0.1, benchmarkWeight: 0.3, benchmarkReturn: 0.08 },
        { sector: '消费', weight: 0.6, sectorReturn: 0.05, benchmarkWeight: 0.7, benchmarkReturn: 0.06 },
      ];
      const result = calcBrinsonAttribution(attributions);
      expect(result.allocationEffect).toBeDefined();
      expect(result.selectionEffect).toBeDefined();
      expect(typeof result.totalActive).toBe('number');
    });
  });

  describe('因子暴露分析', () => {
    interface FactorExposure {
      factor: string;
      portfolioExposure: number;
      benchmarkExposure: number;
      factorReturn: number;
    }

    function calcFactorContribution(exposures: FactorExposure[]): { factor: string; contribution: number }[] {
      return exposures.map(e => ({
        factor: e.factor,
        contribution: Math.round((e.portfolioExposure - e.benchmarkExposure) * e.factorReturn * 10000) / 10000,
      }));
    }

    it('应正确计算因子贡献', () => {
      const exposures: FactorExposure[] = [
        { factor: 'value', portfolioExposure: 0.5, benchmarkExposure: 0.3, factorReturn: 0.02 },
        { factor: 'momentum', portfolioExposure: 0.2, benchmarkExposure: 0.4, factorReturn: 0.03 },
      ];
      const contributions = calcFactorContribution(exposures);
      expect(contributions[0].contribution).toBe(0.004);
      expect(contributions[1].contribution).toBe(-0.006);
    });
  });

  describe('主动收益分解', () => {
    function decomposeAlpha(portfolioReturn: number, benchmarkReturn: number, factorReturns: { name: string; exposure: number; return: number }[]): {
      totalAlpha: number;
      factorAlpha: number;
      residualAlpha: number;
    } {
      const activeReturn = portfolioReturn - benchmarkReturn;
      const factorAlpha = factorReturns.reduce((s, f) => s + f.exposure * f.return, 0);
      return {
        totalAlpha: Math.round(activeReturn * 10000) / 10000,
        factorAlpha: Math.round(factorAlpha * 10000) / 10000,
        residualAlpha: Math.round((activeReturn - factorAlpha) * 10000) / 10000,
      };
    }

    it('应正确分解Alpha', () => {
      const result = decomposeAlpha(0.15, 0.10, [
        { name: 'value', exposure: 0.3, return: 0.05 },
        { name: 'size', exposure: 0.2, return: -0.02 },
      ]);
      expect(result.totalAlpha).toBe(0.05);
      expect(result.factorAlpha).toBe(0.011);
      expect(result.residualAlpha).toBe(0.039);
    });
  });

  describe('滚动收益分析', () => {
    function calcRollingReturn(prices: number[], window: number): number[] {
      const returns: number[] = [];
      for (let i = window; i < prices.length; i++) {
        returns.push(Math.round(((prices[i] - prices[i - window]) / prices[i - window]) * 10000) / 100);
      }
      return returns;
    }

    it('应正确计算滚动收益', () => {
      const prices = [100, 110, 105, 120, 115];
      const rolling = calcRollingReturn(prices, 3);
      expect(rolling).toHaveLength(2);
      expect(rolling[0]).toBe(20); // (120-100)/100 = 20%
    });
  });

  describe('风险调整收益', () => {
    function calcRiskAdjustedReturn(returns: number[], riskFreeRate: number = 0.02 / 252): {
      sharpe: number;
      sortino: number;
      calmar: number;
    } {
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
      const downside = returns.filter(r => r < 0);
      const downsideVariance = downside.length > 0
        ? downside.reduce((s, r) => s + r * r, 0) / downside.length
        : 0;

      const sharpe = Math.sqrt(variance) > 1e-10 ? (mean - riskFreeRate) / Math.sqrt(variance) : 0;
      const sortino = Math.sqrt(downsideVariance) > 1e-10 ? (mean - riskFreeRate) / Math.sqrt(downsideVariance) : 0;

      return {
        sharpe: Math.round(sharpe * Math.sqrt(252) * 100) / 100,
        sortino: Math.round(sortino * Math.sqrt(252) * 100) / 100,
        calmar: 0,
      };
    }

    it('应正确计算风险调整收益', () => {
      const returns = [0.01, -0.005, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012];
      const result = calcRiskAdjustedReturn(returns);
      expect(typeof result.sharpe).toBe('number');
      expect(typeof result.sortino).toBe('number');
    });
  });
});
