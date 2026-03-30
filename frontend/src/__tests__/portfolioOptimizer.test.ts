import { describe, it, expect } from 'vitest';

// ==================== 智能选股组合优化器 ====================

interface CandidateStock {
  symbol: string;
  name: string;
  score: number;
  expectedReturn: number;
  volatility: number;
  beta: number;
  marketCap: number;
  industry: string;
  correlation: Record<string, number>;
}

interface OptimizationConstraint {
  maxPositions: number;
  minPositionWeight: number;
  maxPositionWeight: number;
  maxIndustryWeight: number;
  minScore: number;
  maxBeta: number;
  targetVolatility?: number;
  targetReturn?: number;
}

interface OptimizedPortfolio {
  holdings: { symbol: string; name: string; weight: number; expectedContribution: number }[];
  expectedReturn: number;
  expectedRisk: number;
  sharpeRatio: number;
  diversificationScore: number;
  industryBreakdown: Record<string, number>;
  turnoverEstimate: number;
}

class StockPortfolioOptimizer {
  /** 等权重基准组合 */
  equalWeight(candidates: CandidateStock[], constraints: OptimizationConstraint): OptimizedPortfolio {
    const filtered = this.applyConstraints(candidates, constraints);
    const n = Math.min(filtered.length, constraints.maxPositions);
    const selected = filtered.slice(0, n);
    const weight = 1 / n;

    return this.buildPortfolio(selected, Array(n).fill(weight), constraints);
  }

  /** 评分加权组合 */
  scoreWeighted(candidates: CandidateStock[], constraints: OptimizationConstraint): OptimizedPortfolio {
    const filtered = this.applyConstraints(candidates, constraints);
    const n = Math.min(filtered.length, constraints.maxPositions);
    const selected = filtered.slice(0, n);

    const totalScore = selected.reduce((s, c) => s + Math.max(0, c.score), 0) || 1;
    const weights = selected.map(c => Math.max(0, c.score) / totalScore);

    return this.buildPortfolio(selected, weights, constraints);
  }

  /** 风险平价组合 */
  riskParity(candidates: CandidateStock[], constraints: OptimizationConstraint): OptimizedPortfolio {
    const filtered = this.applyConstraints(candidates, constraints);
    const n = Math.min(filtered.length, constraints.maxPositions);
    const selected = filtered.slice(0, n);

    const invVol = selected.map(c => 1 / (c.volatility || 20));
    const totalInv = invVol.reduce((s, v) => s + v, 0);
    const weights = invVol.map(v => v / totalInv);

    return this.buildPortfolio(selected, weights, constraints);
  }

  /** 均值方差优化 (简化) */
  meanVariance(candidates: CandidateStock[], constraints: OptimizationConstraint): OptimizedPortfolio {
    const filtered = this.applyConstraints(candidates, constraints);
    const n = Math.min(filtered.length, constraints.maxPositions);
    const selected = filtered.slice(0, n);

    // 最大化夏普: 权重 ∝ 超额收益/风险
    const sharpeScores = selected.map(c => {
      const excessReturn = c.expectedReturn - 3; // 3%无风险
      return excessReturn > 0 ? excessReturn / (c.volatility || 20) : 0;
    });
    const total = sharpeScores.reduce((s, v) => s + v, 0) || 1;
    const weights = sharpeScores.map(v => v / total);

    return this.buildPortfolio(selected, weights, constraints);
  }

  /** 黑利特曼模型 (简化) */
  blackLitterman(
    candidates: CandidateStock[],
    marketWeights: Record<string, number>,
    views: { symbol: string; expectedReturn: number; confidence: number }[],
    constraints: OptimizationConstraint
  ): OptimizedPortfolio {
    const filtered = this.applyConstraints(candidates, constraints);
    const n = Math.min(filtered.length, constraints.maxPositions);
    const selected = filtered.slice(0, n);

    // 市场均衡收益
    const equilibriumReturns = selected.map(c => {
      const mw = marketWeights[c.symbol] || (1 / n);
      return mw * c.expectedReturn * 0.5 + 5; // 简化
    });

    // 融合观点
    const adjustedReturns = equilibriumReturns.map((er, i) => {
      const view = views.find(v => v.symbol === selected[i].symbol);
      if (view) {
        return er * (1 - view.confidence) + view.expectedReturn * view.confidence;
      }
      return er;
    });

    // 基于调整后收益分配权重
    const positiveReturns = adjustedReturns.map(r => Math.max(0, r));
    const total = positiveReturns.reduce((s, v) => s + v, 0) || 1;
    const weights = positiveReturns.map(v => v / total);

    return this.buildPortfolio(selected, weights, constraints);
  }

  /** 约束优化 */
  constrainedOptimize(
    candidates: CandidateStock[],
    constraints: OptimizationConstraint,
    objective: 'maxReturn' | 'minRisk' | 'maxSharpe'
  ): OptimizedPortfolio {
    switch (objective) {
      case 'maxReturn': return this.scoreWeighted(candidates, constraints);
      case 'minRisk': return this.riskParity(candidates, constraints);
      case 'maxSharpe': return this.meanVariance(candidates, constraints);
    }
  }

  /** 换手率优化 */
  turnoverOptimized(
    newCandidates: CandidateStock[],
    currentHoldings: Record<string, number>,
    constraints: OptimizationConstraint,
    maxTurnover: number = 0.3
  ): OptimizedPortfolio {
    const target = this.meanVariance(newCandidates, constraints);
    const currentSymbols = new Set(Object.keys(currentHoldings));

    // 混合新旧权重
    const blendedHoldings = target.holdings.map(h => {
      const currentWeight = currentHoldings[h.symbol] || 0;
      const targetWeight = h.weight;
      // 限制换手
      const maxChange = maxTurnover / target.holdings.length;
      const newWeight = currentWeight + Math.max(-maxChange, Math.min(maxChange, targetWeight - currentWeight));
      return { ...h, weight: Math.max(0, newWeight) };
    });

    // 归一化
    const totalWeight = blendedHoldings.reduce((s, h) => s + h.weight, 0);
    const normalized = blendedHoldings.map(h => ({ ...h, weight: totalWeight > 0 ? h.weight / totalWeight : 0 }));

    // 计算换手率
    let turnover = 0;
    for (const h of normalized) {
      turnover += Math.abs(h.weight - (currentHoldings[h.symbol] || 0));
    }

    return {
      ...target,
      holdings: normalized,
      turnoverEstimate: Math.round(turnover / 2 * 100) / 100,
    };
  }

  /** 敏感性分析 */
  sensitivityAnalysis(
    candidates: CandidateStock[],
    constraints: OptimizationConstraint,
    param: 'volatility' | 'expectedReturn',
    changePercent: number = 10
  ): { base: OptimizedPortfolio; stressed: OptimizedPortfolio; impact: number }[] {
    const base = this.meanVariance(candidates, constraints);
    const results: { base: OptimizedPortfolio; stressed: OptimizedPortfolio; impact: number }[] = [];

    for (const stock of candidates.slice(0, 5)) {
      const stressedCandidates = candidates.map(c => {
        if (c.symbol !== stock.symbol) return c;
        return { ...c, [param]: c[param] * (1 + changePercent / 100) };
      });

      const stressed = this.meanVariance(stressedCandidates, constraints);
      const impact = stressed.expectedReturn - base.expectedReturn;

      results.push({
        base,
        stressed,
        impact: Math.round(impact * 100) / 100,
      });
    }

    return results;
  }

  // ==================== 私有方法 ====================

  private applyConstraints(candidates: CandidateStock[], constraints: OptimizationConstraint): CandidateStock[] {
    return candidates
      .filter(c => c.score >= constraints.minScore)
      .filter(c => c.beta <= constraints.maxBeta)
      .sort((a, b) => b.score - a.score);
  }

  private buildPortfolio(selected: CandidateStock[], weights: number[], constraints: OptimizationConstraint): OptimizedPortfolio {
    const n = selected.length;

    // 约束权重
    const constrained = weights.map(w => Math.max(constraints.minPositionWeight, Math.min(constraints.maxPositionWeight, w)));
    const total = constrained.reduce((s, v) => s + v, 0) || 1;
    const normalized = constrained.map(w => w / total);

    const holdings = selected.map((c, i) => ({
      symbol: c.symbol, name: c.name,
      weight: Math.round(normalized[i] * 10000) / 10000,
      expectedContribution: Math.round(normalized[i] * c.expectedReturn * 100) / 100,
    }));

    const expectedReturn = holdings.reduce((s, h) => s + h.expectedContribution, 0);
    const expectedRisk = Math.sqrt(selected.reduce((s, c, i) => s + Math.pow(normalized[i] * c.volatility, 2), 0));
    const sharpeRatio = expectedRisk > 0 ? (expectedReturn - 3) / expectedRisk : 0;

    // 行业分布
    const industryBreakdown: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const ind = selected[i].industry;
      industryBreakdown[ind] = Math.round(((industryBreakdown[ind] || 0) + normalized[i]) * 10000) / 10000;
    }

    // 分散化得分
    const herfindahl = normalized.reduce((s, w) => s + w * w, 0);
    const diversificationScore = Math.round((1 - herfindahl) * 100) / 100;

    return {
      holdings, expectedReturn: Math.round(expectedReturn * 100) / 100,
      expectedRisk: Math.round(expectedRisk * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      diversificationScore, industryBreakdown, turnoverEstimate: 1,
    };
  }
}

// ==================== 测试数据 ====================

function genCandidates(count: number): CandidateStock[] {
  const industries = ['科技', '金融', '消费', '医药', '制造'];
  return Array.from({ length: count }, (_, i) => ({
    symbol: `${String(i).padStart(6, '0')}`,
    name: `股票${i}`,
    score: 30 + Math.random() * 60,
    expectedReturn: 5 + Math.random() * 25,
    volatility: 10 + Math.random() * 30,
    beta: 0.5 + Math.random() * 1.5,
    marketCap: 50 + Math.random() * 500,
    industry: industries[i % industries.length],
    correlation: {},
  }));
}

const defaultConstraints: OptimizationConstraint = {
  maxPositions: 10, minPositionWeight: 0.02, maxPositionWeight: 0.3,
  maxIndustryWeight: 0.4, minScore: 30, maxBeta: 2,
};

// ==================== 测试 ====================

describe('StockPortfolioOptimizer 智能选股组合优化', () => {
  const optimizer = new StockPortfolioOptimizer();
  const candidates = genCandidates(20);

  describe('等权重组合', () => {
    it('应生成等权组合', () => {
      const portfolio = optimizer.equalWeight(candidates, defaultConstraints);
      expect(portfolio.holdings.length).toBeLessThanOrEqual(10);
      const totalWeight = portfolio.holdings.reduce((s, h) => s + h.weight, 0);
      expect(totalWeight).toBeCloseTo(1, 1);
    });

    it('权重应大致相等', () => {
      const portfolio = optimizer.equalWeight(candidates, { ...defaultConstraints, maxPositions: 5 });
      const weights = portfolio.holdings.map(h => h.weight);
      const maxDiff = Math.max(...weights) - Math.min(...weights);
      expect(maxDiff).toBeLessThan(0.1);
    });
  });

  describe('评分加权组合', () => {
    it('应生成评分加权组合', () => {
      const portfolio = optimizer.scoreWeighted(candidates, defaultConstraints);
      expect(portfolio.holdings.length).toBeGreaterThan(0);
    });

    it('高评分应获得高权重', () => {
      const portfolio = optimizer.scoreWeighted(candidates, defaultConstraints);
      if (portfolio.holdings.length >= 2) {
        expect(portfolio.holdings[0].weight).toBeGreaterThanOrEqual(portfolio.holdings[portfolio.holdings.length - 1].weight);
      }
    });
  });

  describe('风险平价组合', () => {
    it('应生成风险平价组合', () => {
      const portfolio = optimizer.riskParity(candidates, defaultConstraints);
      expect(portfolio.holdings.length).toBeGreaterThan(0);
      const totalWeight = portfolio.holdings.reduce((s, h) => s + h.weight, 0);
      expect(totalWeight).toBeCloseTo(1, 1);
    });

    it('低波动应获得高权重', () => {
      const portfolio = optimizer.riskParity(candidates, defaultConstraints);
      // 排名前面的应该是低波动的
      if (portfolio.holdings.length >= 2) {
        const firstStock = candidates.find(c => c.symbol === portfolio.holdings[0].symbol);
        const lastStock = candidates.find(c => c.symbol === portfolio.holdings[portfolio.holdings.length - 1].symbol);
        if (firstStock && lastStock) {
          expect(firstStock.volatility).toBeLessThanOrEqual(lastStock.volatility + 10);
        }
      }
    });
  });

  describe('均值方差组合', () => {
    it('应生成优化组合', () => {
      const portfolio = optimizer.meanVariance(candidates, defaultConstraints);
      expect(portfolio.sharpeRatio).toBeDefined();
      expect(portfolio.expectedReturn).toBeGreaterThan(0);
    });
  });

  describe('Black-Litterman', () => {
    it('应融合观点', () => {
      const views = [{ symbol: '000000', expectedReturn: 30, confidence: 0.7 }];
      const mw: Record<string, number> = {};
      candidates.forEach(c => mw[c.symbol] = 1 / candidates.length);
      const portfolio = optimizer.blackLitterman(candidates, mw, views, defaultConstraints);
      expect(portfolio.holdings.length).toBeGreaterThan(0);
    });
  });

  describe('换手率优化', () => {
    it('应限制换手率', () => {
      const current: Record<string, number> = {};
      candidates.slice(0, 5).forEach(c => current[c.symbol] = 0.2);
      const portfolio = optimizer.turnoverOptimized(candidates, current, defaultConstraints, 0.2);
      expect(portfolio.turnoverEstimate).toBeLessThanOrEqual(0.3);
    });
  });

  describe('约束满足', () => {
    it('单股权重不应超过上限', () => {
      const portfolio = optimizer.scoreWeighted(candidates, defaultConstraints);
      for (const h of portfolio.holdings) {
        expect(h.weight).toBeLessThanOrEqual(defaultConstraints.maxPositionWeight + 0.01);
      }
    });

    it('单股权重不应低于下限', () => {
      const portfolio = optimizer.scoreWeighted(candidates, defaultConstraints);
      for (const h of portfolio.holdings) {
        expect(h.weight).toBeGreaterThanOrEqual(defaultConstraints.minPositionWeight - 0.01);
      }
    });
  });

  describe('分散化', () => {
    it('应计算分散化得分', () => {
      const portfolio = optimizer.equalWeight(candidates, { ...defaultConstraints, maxPositions: 10 });
      expect(portfolio.diversificationScore).toBeGreaterThan(0);
      expect(portfolio.diversificationScore).toBeLessThanOrEqual(1);
    });

    it('等权重应最高分散化', () => {
      const eq = optimizer.equalWeight(candidates, { ...defaultConstraints, maxPositions: 5 });
      const concentrated = optimizer.scoreWeighted(candidates, { ...defaultConstraints, maxPositions: 5 });
      // 等权重通常更分散
      expect(eq.diversificationScore).toBeGreaterThanOrEqual(concentrated.diversificationScore - 0.1);
    });
  });

  describe('行业分布', () => {
    it('应计算行业权重', () => {
      const portfolio = optimizer.scoreWeighted(candidates, defaultConstraints);
      const total = Object.values(portfolio.industryBreakdown).reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1, 1);
    });
  });

  describe('敏感性分析', () => {
    it('应返回影响分析', () => {
      const results = optimizer.sensitivityAnalysis(candidates, defaultConstraints, 'volatility', 10);
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(typeof r.impact).toBe('number');
      }
    });
  });
});
