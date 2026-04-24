import { describe, it, expect } from 'vitest';
import { RiskParityEngine, type AssetData, type CovarianceMatrix, type RiskBudget } from '../utils/riskParityEngine';

describe('RiskParityEngine', () => {
  const engine = new RiskParityEngine();

  const assets: AssetData[] = [
    { name: '股票', expectedReturn: 0.1, volatility: 0.2 },
    { name: '债券', expectedReturn: 0.04, volatility: 0.05 },
    { name: '商品', expectedReturn: 0.06, volatility: 0.15 },
  ];

  const covMatrix: CovarianceMatrix = {
    assets: ['股票', '债券', '商品'],
    matrix: [
      [0.04, 0.002, 0.006],
      [0.002, 0.0025, 0.001],
      [0.006, 0.001, 0.0225],
    ],
  };

  describe('风险平价', () => {
    it('应返回权重和风险贡献', () => {
      const result = engine.calculateRiskParity(assets, covMatrix);
      expect(Object.keys(result.weights).length).toBe(3);
      expect(Object.keys(result.riskContributions).length).toBe(3);
    });

    it('权重之和应为1', () => {
      const result = engine.calculateRiskParity(assets, covMatrix);
      const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('风险贡献之和应接近1', () => {
      const result = engine.calculateRiskParity(assets, covMatrix);
      const sum = Object.values(result.riskContributions).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 1);
    });

    it('低波动资产应有更高权重', () => {
      const result = engine.calculateRiskParity(assets, covMatrix);
      expect(result.weights['债券']).toBeGreaterThan(result.weights['股票']);
    });

    it('组合波动率应为正', () => {
      const result = engine.calculateRiskParity(assets, covMatrix);
      expect(result.portfolioVolatility).toBeGreaterThan(0);
    });

    it('空资产应返回空结果', () => {
      const result = engine.calculateRiskParity([], { assets: [], matrix: [] });
      expect(result.portfolioVolatility).toBe(0);
    });
  });

  describe('最大分散化', () => {
    it('应返回权重', () => {
      const result = engine.calculateMaxDiversification(assets, covMatrix);
      expect(Object.keys(result.weights).length).toBe(3);
    });

    it('分散化比率应>=1', () => {
      const result = engine.calculateMaxDiversification(assets, covMatrix);
      expect(result.diversificationRatio).toBeGreaterThanOrEqual(1);
    });

    it('权重之和应为1', () => {
      const result = engine.calculateMaxDiversification(assets, covMatrix);
      const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 2);
    });
  });

  describe('最小方差', () => {
    it('应返回权重', () => {
      const result = engine.calculateMinVariance(assets, covMatrix);
      expect(Object.keys(result.weights).length).toBe(3);
    });

    it('波动率应为正', () => {
      const result = engine.calculateMinVariance(assets, covMatrix);
      expect(result.portfolioVolatility).toBeGreaterThan(0);
    });

    it('应产生低波动率组合', () => {
      const minVar = engine.calculateMinVariance(assets, covMatrix);
      expect(minVar.portfolioVolatility).toBeGreaterThan(0);
      expect(minVar.portfolioVolatility).toBeLessThan(0.3); // 合理范围
    });
  });

  describe('风险预算', () => {
    it('应按预算分配风险', () => {
      const budgets: RiskBudget[] = [
        { asset: '股票', targetRiskPct: 0.6 },
        { asset: '债券', targetRiskPct: 0.2 },
        { asset: '商品', targetRiskPct: 0.2 },
      ];
      const result = engine.calculateRiskBudget(assets, covMatrix, budgets);
      expect(Object.keys(result.weights).length).toBe(3);
    });

    it('权重之和应为1', () => {
      const budgets: RiskBudget[] = [
        { asset: '股票', targetRiskPct: 0.5 },
        { asset: '债券', targetRiskPct: 0.3 },
        { asset: '商品', targetRiskPct: 0.2 },
      ];
      const result = engine.calculateRiskBudget(assets, covMatrix, budgets);
      const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('空预算应使用等权默认', () => {
      const result = engine.calculateRiskBudget(assets, covMatrix, []);
      expect(Object.keys(result.weights).length).toBe(3);
    });

    it('部分预算应使用默认值', () => {
      const budgets: RiskBudget[] = [{ asset: '股票', targetRiskPct: 0.7 }];
      const result = engine.calculateRiskBudget(assets, covMatrix, budgets);
      expect(Object.keys(result.weights).length).toBe(3);
    });
  });

  describe('组合指标', () => {
    it('应计算Sharpe比率', () => {
      const result = engine.calculateRiskParity(assets, covMatrix);
      expect(typeof result.sharpeRatio).toBe('number');
    });

    it('应计算组合收益率', () => {
      const result = engine.calculateRiskParity(assets, covMatrix);
      expect(result.portfolioReturn).toBeGreaterThan(0);
    });

    it('正预期收益应有正Sharpe', () => {
      const result = engine.calculateRiskParity(assets, covMatrix);
      expect(result.sharpeRatio).toBeGreaterThan(0);
    });
  });

  describe('边界情况', () => {
    it('单资产不应报错', () => {
      const single: AssetData[] = [{ name: 'A', expectedReturn: 0.1, volatility: 0.2 }];
      const singleCov: CovarianceMatrix = { assets: ['A'], matrix: [[0.04]] };
      const result = engine.calculateRiskParity(single, singleCov);
      expect(result.weights['A']).toBeCloseTo(1, 2);
    });

    it('零协方差不应报错', () => {
      const zeroCov: CovarianceMatrix = {
        assets: ['A', 'B'],
        matrix: [[0, 0], [0, 0]],
      };
      const twoAssets: AssetData[] = [
        { name: 'A', expectedReturn: 0.1, volatility: 0.2 },
        { name: 'B', expectedReturn: 0.05, volatility: 0.1 },
      ];
      expect(() => engine.calculateRiskParity(twoAssets, zeroCov)).not.toThrow();
    });

    it('对角协方差应使用等权', () => {
      const diagCov: CovarianceMatrix = {
        assets: ['A', 'B'],
        matrix: [[0.04, 0], [0, 0.04]],
      };
      const twoAssets: AssetData[] = [
        { name: 'A', expectedReturn: 0.1, volatility: 0.2 },
        { name: 'B', expectedReturn: 0.1, volatility: 0.2 },
      ];
      const result = engine.calculateRiskParity(twoAssets, diagCov);
      expect(result.weights['A']).toBeCloseTo(0.5, 1);
      expect(result.weights['B']).toBeCloseTo(0.5, 1);
    });
  });
});
