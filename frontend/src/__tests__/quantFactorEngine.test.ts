/**
 * 量化因子引擎测试 —— 直接驱动真实模块
 * 说明: 原测试内联重实现了因子定义/动量/z-score/因子合成/分组回测/Alpha衰减, 与真实模块(QuantFactorEngine.scoreStock)不符, 已删除。
 *       改为测试真实导出: QuantFactorEngine 的 scoreStock / batchScore / updateConfig
 */
import { describe, it, expect } from 'vitest';
import { QuantFactorEngine, type StockFactors } from '../utils/quantFactorEngine';

const validGrades = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];
const validRecs = ['strong_buy', 'buy', 'hold', 'sell', 'strong_sell'];

const stock: StockFactors = {
  symbol: 'A',
  returns1M: 0.1,
  returns3M: 0.2,
  returns6M: 0.3,
  returns12M: 0.4,
  pe: 15,
  pb: 2,
  ps: 1,
  roe: 0.2,
  grossMargin: 0.5,
  debtToEquity: 1,
  revenueGrowth: 0.2,
  earningsGrowth: 0.2,
  volatility20D: 0.2,
  volatility60D: 0.25,
  analystRating: 4,
  shortInterest: 0.05,
  institutionalHolding: 0.6,
};

const weakStock: StockFactors = {
  ...stock,
  symbol: 'B',
  returns1M: -0.1,
  returns3M: -0.2,
  returns6M: -0.3,
  pe: 80,
  pb: 10,
  ps: 8,
  roe: 0.02,
  grossMargin: 0.1,
  debtToEquity: 3,
  revenueGrowth: -0.1,
  earningsGrowth: -0.1,
  volatility20D: 0.8,
  analystRating: 1,
  shortInterest: 0.3,
  institutionalHolding: 0.1,
};

describe('scoreStock', () => {
  it('应返回完整评分结果', () => {
    const engine = new QuantFactorEngine();
    const r = engine.scoreStock(stock);
    expect(r.symbol).toBe('A');
    expect(r.totalScore).toBeGreaterThanOrEqual(0);
    expect(r.totalScore).toBeLessThanOrEqual(100);
    expect(validGrades).toContain(r.grade);
    expect(validRecs).toContain(r.recommendation);
  });

  it('应计算 6 个因子得分且均在 0-100', () => {
    const engine = new QuantFactorEngine();
    const r = engine.scoreStock(stock);
    expect(r.factors).toHaveLength(6);
    for (const f of r.factors) {
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(100);
      expect(typeof f.weight).toBe('number');
    }
  });

  it('优质股与弱势股总分应有区分', () => {
    const engine = new QuantFactorEngine();
    const good = engine.scoreStock(stock).totalScore;
    const weak = engine.scoreStock(weakStock).totalScore;
    expect(good).toBeGreaterThan(weak);
  });
});

describe('batchScore', () => {
  it('应按总分降序排列', () => {
    const engine = new QuantFactorEngine();
    const results = engine.batchScore([weakStock, stock]);
    expect(results).toHaveLength(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].totalScore).toBeGreaterThanOrEqual(results[i].totalScore);
    }
    expect(results[0].symbol).toBe('A');
  });
});

describe('updateConfig', () => {
  it('应更新因子权重并影响评分', () => {
    const engine = new QuantFactorEngine();
    const before = engine.scoreStock(stock);
    const momentumBefore = before.factors.find(f => f.name === '动量')!;
    expect(momentumBefore.weight).toBe(0.25);

    engine.updateConfig({ momentum: { weight: 0.5, lookback: 60 } });
    const after = engine.scoreStock(stock);
    const momentumAfter = after.factors.find(f => f.name === '动量')!;
    expect(momentumAfter.weight).toBe(0.5);
  });
});
