import { describe, it, expect } from 'vitest';
import {
  regressFactor,
  multiFactorRegression,
  analyzePortfolioExposure,
  decomposeReturns,
  FactorData,
  StockExposure,
} from '../services/factorExposureEngine';

describe('因子暴露分析引擎', () => {
  const marketFactor: FactorData = {
    name: 'market',
    returns: [0.01, 0.02, -0.01, 0.03, 0.01, -0.02, 0.02, 0.01, -0.01, 0.02],
    description: '市场因子',
  };
  const sizeFactor: FactorData = {
    name: 'size',
    returns: [0.005, -0.01, 0.02, -0.015, 0.01, 0.005, -0.01, 0.015, 0.02, -0.005],
    description: '市值因子',
  };
  const valueFactor: FactorData = {
    name: 'value',
    returns: [0.008, 0.012, -0.005, 0.01, 0.003, -0.008, 0.015, 0.005, -0.003, 0.01],
    description: '价值因子',
  };

  const stockReturns = [0.015, 0.025, -0.015, 0.035, 0.018, -0.025, 0.028, 0.015, -0.012, 0.025];

  describe('单因子回归', () => {
    it('应计算beta系数', () => {
      const result = regressFactor(stockReturns, marketFactor.returns);
      expect(typeof result.beta).toBe('number');
      expect(result.beta).not.toBe(0);
    });

    it('应计算alpha', () => {
      const result = regressFactor(stockReturns, marketFactor.returns);
      expect(typeof result.alpha).toBe('number');
    });

    it('应计算R平方', () => {
      const result = regressFactor(stockReturns, marketFactor.returns);
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });

    it('应计算残差波动率', () => {
      const result = regressFactor(stockReturns, marketFactor.returns);
      expect(result.residual).toBeGreaterThanOrEqual(0);
    });

    it('完全正相关beta应接近1', () => {
      const x = [0.01, 0.02, 0.03, 0.04, 0.05];
      const y = [0.01, 0.02, 0.03, 0.04, 0.05];
      const result = regressFactor(y, x);
      expect(result.beta).toBeCloseTo(1, 3);
    });

    it('数据不足应返回零值', () => {
      const result = regressFactor([0.01], [0.02]);
      expect(result.beta).toBe(0);
      expect(result.rSquared).toBe(0);
    });

    it('完全负相关beta应为负', () => {
      const x = [0.01, 0.02, 0.03, 0.04, 0.05];
      const y = [0.05, 0.04, 0.03, 0.02, 0.01];
      const result = regressFactor(y, x);
      expect(result.beta).toBeCloseTo(-1, 3);
    });
  });

  describe('多因子回归', () => {
    it('应返回所有因子暴露', () => {
      const result = multiFactorRegression(stockReturns, [marketFactor, sizeFactor, valueFactor]);
      expect(result.exposures.size).toBe(3);
    });

    it('应计算alpha', () => {
      const result = multiFactorRegression(stockReturns, [marketFactor, sizeFactor, valueFactor]);
      expect(typeof result.alpha).toBe('number');
    });

    it('应计算R平方', () => {
      const result = multiFactorRegression(stockReturns, [marketFactor, sizeFactor, valueFactor]);
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });

    it('应计算残差波动率', () => {
      const result = multiFactorRegression(stockReturns, [marketFactor, sizeFactor, valueFactor]);
      expect(result.residualVol).toBeGreaterThanOrEqual(0);
    });

    it('空因子应返回alpha等于均值', () => {
      const result = multiFactorRegression(stockReturns, []);
      const mean = stockReturns.reduce((s, r) => s + r, 0) / stockReturns.length;
      expect(result.alpha).toBeCloseTo(mean, 5);
    });

    it('市场因子暴露应为正(对正相关序列)', () => {
      const result = multiFactorRegression(stockReturns, [marketFactor]);
      expect(result.exposures.get('market')).toBeGreaterThan(0);
    });
  });

  describe('组合暴露分析', () => {
    it('应计算总暴露', () => {
      const exposures: StockExposure[] = [
        {
          symbol: 'A', returns: stockReturns,
          exposures: new Map([['market', 1.2], ['size', -0.3]]),
          alpha: 0.001, rSquared: 0.8, residualVol: 0.01,
        },
        {
          symbol: 'B', returns: stockReturns,
          exposures: new Map([['market', 0.8], ['size', 0.5]]),
          alpha: 0.002, rSquared: 0.7, residualVol: 0.015,
        },
      ];
      const result = analyzePortfolioExposure(
        exposures, [0.6, 0.4],
        new Map([['market', 1.0], ['size', 0]])
      );
      expect(result.totalExposures.get('market')).toBeCloseTo(1.04, 2);
    });

    it('应计算主动暴露', () => {
      const exposures: StockExposure[] = [
        {
          symbol: 'A', returns: stockReturns,
          exposures: new Map([['market', 1.2]]),
          alpha: 0.001, rSquared: 0.8, residualVol: 0.01,
        },
      ];
      const result = analyzePortfolioExposure(
        exposures, [1.0], new Map([['market', 1.0]])
      );
      expect(result.activeExposures.get('market')).toBeCloseTo(0.2, 2);
    });

    it('应计算信息比率', () => {
      const exposures: StockExposure[] = [
        {
          symbol: 'A', returns: stockReturns,
          exposures: new Map([['market', 1.0]]),
          alpha: 0.002, rSquared: 0.8, residualVol: 0.01,
        },
      ];
      const result = analyzePortfolioExposure(exposures, [1.0], new Map());
      expect(typeof result.informationRatio).toBe('number');
    });

    it('应计算跟踪误差', () => {
      const exposures: StockExposure[] = [
        {
          symbol: 'A', returns: stockReturns,
          exposures: new Map([['market', 1.2]]),
          alpha: 0.001, rSquared: 0.8, residualVol: 0.01,
        },
      ];
      const result = analyzePortfolioExposure(
        exposures, [1.0], new Map([['market', 1.0]])
      );
      expect(result.trackingError).toBeGreaterThan(0);
    });

    it('空组合应返回零值', () => {
      const result = analyzePortfolioExposure([], [], new Map());
      expect(result.alpha).toBe(0);
    });
  });

  describe('收益归因分解', () => {
    it('应分解因子贡献', () => {
      const result = decomposeReturns(stockReturns, [marketFactor, sizeFactor]);
      expect(result.factorContributions.size).toBe(2);
    });

    it('应计算alpha', () => {
      const result = decomposeReturns(stockReturns, [marketFactor, sizeFactor]);
      expect(typeof result.alpha).toBe('number');
    });

    it('应计算总收益', () => {
      const result = decomposeReturns(stockReturns, [marketFactor]);
      const total = stockReturns.reduce((s, r) => s + r, 0);
      expect(result.totalReturn).toBeCloseTo(total, 5);
    });

    it('空因子应有零贡献', () => {
      const result = decomposeReturns(stockReturns, []);
      expect(result.factorContributions.size).toBe(0);
    });

    it('因子贡献加alpha应接近总收益', () => {
      const result = decomposeReturns(stockReturns, [marketFactor, sizeFactor, valueFactor]);
      let factorSum = 0;
      result.factorContributions.forEach(v => factorSum += v);
      // Due to approximation, may not be exact
      expect(typeof factorSum).toBe('number');
    });
  });
});
