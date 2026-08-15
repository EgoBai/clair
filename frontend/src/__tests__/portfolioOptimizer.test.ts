/**
 * 组合优化引擎测试 —— 直接驱动真实模块
 * 说明: 原测试内联重实现了等权/风险平价(逆波动率)/组合收益风险/VaR/CVaR 等, 与真实模块导出不符, 已删除。
 *       改为测试真实导出: calculateCovarianceMatrix / buildAssetReturns / minimumVariancePortfolio /
 *       maxSharpePortfolio / riskParityPortfolio / generateEfficientFrontier
 */
import { describe, it, expect } from 'vitest';
import {
  calculateCovarianceMatrix,
  buildAssetReturns,
  minimumVariancePortfolio,
  maxSharpePortfolio,
  riskParityPortfolio,
  generateEfficientFrontier,
  type AssetReturn,
  type CovarianceMatrix,
} from '../utils/portfolioOptimizer';

function sumWeights(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

const assets: AssetReturn[] = [
  { symbol: 'A', returns: [], expectedReturn: 0.1, volatility: 0.2 },
  { symbol: 'B', returns: [], expectedReturn: 0.15, volatility: 0.3 },
];

const cov: CovarianceMatrix = {
  symbols: ['A', 'B'],
  matrix: [
    [0.04, 0.01],
    [0.01, 0.09],
  ],
};

describe('calculateCovarianceMatrix', () => {
  it('空输入应返回空矩阵', () => {
    expect(calculateCovarianceMatrix([])).toEqual({ symbols: [], matrix: [] });
  });

  it('应生成对称矩阵且对角线非负', () => {
    const cm = calculateCovarianceMatrix(assets);
    expect(cm.matrix[0][1]).toBeCloseTo(cm.matrix[1][0], 10);
    expect(cm.matrix[0][0]).toBeGreaterThanOrEqual(0);
    expect(cm.matrix[1][1]).toBeGreaterThanOrEqual(0);
  });
});

describe('buildAssetReturns', () => {
  it('应基于价格序列构建资产, 波动率非负', () => {
    const data = new Map<string, number[]>([
      ['A', [100, 102, 101, 105, 110]],
      ['B', [50, 51, 50, 49, 52]],
    ]);
    const ar = buildAssetReturns(data);
    expect(ar).toHaveLength(2);
    for (const a of ar) {
      expect(a.volatility).toBeGreaterThanOrEqual(0);
      expect(typeof a.expectedReturn).toBe('number');
    }
  });
});

describe('minimumVariancePortfolio', () => {
  it('单资产应返回 100% 权重', () => {
    const w = minimumVariancePortfolio({ symbols: ['A'], matrix: [[0.04]] });
    expect(w).toEqual({ A: 1 });
  });

  it('权重之和应为 1 且低波动资产权重更高', () => {
    const w = minimumVariancePortfolio(cov);
    expect(sumWeights(w)).toBeCloseTo(1, 5);
    expect(w['A']).toBeGreaterThan(w['B']);
  });
});

describe('maxSharpePortfolio', () => {
  it('单资产应返回该资产组合', () => {
    const r = maxSharpePortfolio(
      [{ symbol: 'A', returns: [], expectedReturn: 0.1, volatility: 0.2 }],
      { symbols: ['A'], matrix: [[0.04]] }
    );
    expect(r.weights).toEqual({ A: 1 });
    expect(typeof r.sharpeRatio).toBe('number');
  });

  it('应返回归一化权重及夏普比率', () => {
    const r = maxSharpePortfolio(assets, cov);
    expect(sumWeights(r.weights)).toBeCloseTo(1, 5);
    expect(typeof r.expectedReturn).toBe('number');
    expect(typeof r.volatility).toBe('number');
    expect(typeof r.sharpeRatio).toBe('number');
  });
});

describe('riskParityPortfolio', () => {
  it('权重之和应为 1 且均为正', () => {
    const w = riskParityPortfolio(cov);
    expect(sumWeights(w)).toBeCloseTo(1, 5);
    for (const v of Object.values(w)) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('低波动资产权重应高于等权', () => {
    const w = riskParityPortfolio(cov);
    // 等权为 0.5; 资产 A 波动率更低, 风险平价应超配
    expect(w['A']).toBeGreaterThan(0.5);
  });
});

describe('generateEfficientFrontier', () => {
  it('应生成指定数量的前沿点', () => {
    const frontier = generateEfficientFrontier(assets, cov, 10);
    expect(frontier).toHaveLength(10);
    for (const p of frontier) {
      expect(sumWeights(p.weights)).toBeCloseTo(1, 5);
      expect(typeof p.volatility).toBe('number');
      expect(typeof p.sharpeRatio).toBe('number');
    }
  });

  it('空资产应返回空前沿', () => {
    expect(generateEfficientFrontier([], { symbols: [], matrix: [] })).toEqual([]);
  });
});
