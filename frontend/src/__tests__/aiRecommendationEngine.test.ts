import { describe, it, expect } from 'vitest';

// ==================== AI评分推荐引擎 ====================

interface StockProfile {
  symbol: string;
  name: string;
  industry: string;
  marketCap: number;
  price: number;
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  dividendYield: number;
  debtRatio: number;
  currentRatio: number;
  grossMargin: number;
  momentum1m: number;
  momentum3m: number;
  momentum6m: number;
  volatility: number;
  beta: number;
  rsi: number;
  macdSignal: number;
}

interface Recommendation {
  symbol: string;
  name: string;
  score: number;
  action: 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell';
  confidence: number;
  reasons: string[];
  risks: string[];
  targetPrice: number;
  stopLoss: number;
  timeHorizon: 'short' | 'medium' | 'long';
  tags: string[];
}

interface RecommendationFilter {
  minScore?: number;
  maxScore?: number;
  industries?: string[];
  actions?: Recommendation['action'][];
  timeHorizons?: Recommendation['timeHorizon'][];
  minMarketCap?: number;
  maxPE?: number;
}

class AIRecommendationEngine {
  /** 生成推荐 */
  recommend(stock: StockProfile): Recommendation {
    const scores = this.calculateDimensionScores(stock);
    const totalScore = this.aggregateScore(scores);
    const action = this.determineAction(totalScore);
    const confidence = this.calculateConfidence(stock, scores);

    return {
      symbol: stock.symbol,
      name: stock.name,
      score: Math.round(totalScore * 100) / 100,
      action,
      confidence: Math.round(confidence * 100) / 100,
      reasons: this.generateReasons(stock, scores),
      risks: this.identifyRisks(stock),
      targetPrice: this.calcTargetPrice(stock),
      stopLoss: this.calcStopLoss(stock),
      timeHorizon: this.determineTimeHorizon(scores),
      tags: this.generateTags(stock, scores),
    };
  }

  /** 批量推荐 */
  batchRecommend(stocks: StockProfile[], filter?: RecommendationFilter): Recommendation[] {
    let recommendations = stocks.map(s => this.recommend(s));

    if (filter) {
      if (filter.minScore !== undefined) recommendations = recommendations.filter(r => r.score >= filter.minScore!);
      if (filter.maxScore !== undefined) recommendations = recommendations.filter(r => r.score <= filter.maxScore!);
      if (filter.industries?.length) recommendations = recommendations.filter(r => filter.industries!.includes(stocks.find(s => s.symbol === r.symbol)?.industry || ''));
      if (filter.actions?.length) recommendations = recommendations.filter(r => filter.actions!.includes(r.action));
      if (filter.timeHorizons?.length) recommendations = recommendations.filter(r => filter.timeHorizons!.includes(r.timeHorizon));
      if (filter.maxPE !== undefined) recommendations = recommendations.filter(r => (stocks.find(s => s.symbol === r.symbol)?.pe || 0) <= filter.maxPE!);
    }

    return recommendations.sort((a, b) => b.score - a.score);
  }

  /** 投资组合推荐 */
  portfolioRecommend(stocks: StockProfile[], budget: number, maxPositions: number = 10): {
    recommendations: Recommendation[];
    allocations: { symbol: string; weight: number; amount: number }[];
    expectedReturn: number;
    expectedRisk: number;
  } {
    const recs = this.batchRecommend(stocks).filter(r => r.action === 'strongBuy' || r.action === 'buy').slice(0, maxPositions);

    // 风险预算分配
    const weights = recs.map(r => {
      const stock = stocks.find(s => s.symbol === r.symbol)!;
      return 1 / (stock.volatility || 20);
    });
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);

    const allocations = recs.map((r, i) => ({
      symbol: r.symbol,
      weight: Math.round(normalizedWeights[i] * 10000) / 10000,
      amount: Math.round(budget * normalizedWeights[i] * 100) / 100,
    }));

    const avgScore = recs.reduce((s, r) => s + r.score, 0) / (recs.length || 1);
    const avgVol = recs.reduce((s, r) => {
      const stock = stocks.find(st => st.symbol === r.symbol);
      return s + (stock?.volatility || 20);
    }, 0) / (recs.length || 1);

    return {
      recommendations: recs,
      allocations,
      expectedReturn: Math.round(avgScore * 15 * 100) / 100,
      expectedRisk: Math.round(avgVol * 100) / 100,
    };
  }

  /** 解释推荐理由 */
  explainRecommendation(recommendation: Recommendation, stock: StockProfile): string {
    const lines: string[] = [];
    lines.push(`## ${stock.name} (${stock.symbol}) 综合评分: ${recommendation.score}`);
    lines.push(`**建议: ${this.actionLabel(recommendation.action)}** (置信度: ${recommendation.confidence}%)`);
    lines.push('');

    if (recommendation.reasons.length > 0) {
      lines.push('### 推荐理由');
      recommendation.reasons.forEach(r => lines.push(`- ✅ ${r}`));
    }

    if (recommendation.risks.length > 0) {
      lines.push('### 风险提示');
      recommendation.risks.forEach(r => lines.push(`- ⚠️ ${r}`));
    }

    lines.push('');
    lines.push(`**目标价:** ¥${recommendation.targetPrice.toFixed(2)}`);
    lines.push(`**止损价:** ¥${recommendation.stopLoss.toFixed(2)}`);
    lines.push(`**持有期限:** ${recommendation.timeHorizon === 'short' ? '短期(1-3月)' : recommendation.timeHorizon === 'medium' ? '中期(3-6月)' : '长期(6-12月)'}`);

    return lines.join('\n');
  }

  // ==================== 私有方法 ====================

  private calculateDimensionScores(stock: StockProfile) {
    return {
      value: this.scoreValue(stock),
      quality: this.scoreQuality(stock),
      growth: this.scoreGrowth(stock),
      momentum: this.scoreMomentum(stock),
      technical: this.scoreTechnical(stock),
      risk: this.scoreRisk(stock),
    };
  }

  private scoreValue(stock: StockProfile): number {
    let score = 50;
    if (stock.pe > 0 && stock.pe < 15) score += 15;
    else if (stock.pe > 0 && stock.pe < 25) score += 5;
    else if (stock.pe > 50) score -= 15;

    if (stock.pb > 0 && stock.pb < 1.5) score += 15;
    else if (stock.pb > 0 && stock.pb < 3) score += 5;
    else if (stock.pb > 8) score -= 10;

    if (stock.dividendYield > 3) score += 10;
    return Math.max(0, Math.min(100, score));
  }

  private scoreQuality(stock: StockProfile): number {
    let score = 50;
    if (stock.roe > 20) score += 20;
    else if (stock.roe > 15) score += 10;
    else if (stock.roe < 5) score -= 15;

    if (stock.grossMargin > 40) score += 15;
    if (stock.debtRatio < 40) score += 10;
    else if (stock.debtRatio > 70) score -= 15;

    if (stock.currentRatio > 1.5) score += 5;
    return Math.max(0, Math.min(100, score));
  }

  private scoreGrowth(stock: StockProfile): number {
    let score = 50;
    if (stock.revenueGrowth > 30) score += 20;
    else if (stock.revenueGrowth > 15) score += 10;
    else if (stock.revenueGrowth < 0) score -= 15;

    if (stock.profitGrowth > 30) score += 20;
    else if (stock.profitGrowth > 15) score += 10;
    else if (stock.profitGrowth < 0) score -= 15;

    return Math.max(0, Math.min(100, score));
  }

  private scoreMomentum(stock: StockProfile): number {
    let score = 50;
    if (stock.momentum1m > 5) score += 10;
    else if (stock.momentum1m < -5) score -= 10;
    if (stock.momentum3m > 10) score += 15;
    else if (stock.momentum3m < -10) score -= 15;
    if (stock.momentum6m > 20) score += 10;
    else if (stock.momentum6m < -20) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private scoreTechnical(stock: StockProfile): number {
    let score = 50;
    if (stock.rsi < 30) score += 15; // 超卖
    else if (stock.rsi > 70) score -= 15; // 超买
    if (stock.macdSignal > 0) score += 10;
    else score -= 5;
    return Math.max(0, Math.min(100, score));
  }

  private scoreRisk(stock: StockProfile): number {
    let score = 50;
    if (stock.volatility < 15) score += 15;
    else if (stock.volatility > 35) score -= 15;
    if (stock.beta < 0.8) score += 10;
    else if (stock.beta > 1.5) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private aggregateScore(scores: Record<string, number>): number {
    const weights = { value: 0.2, quality: 0.25, growth: 0.2, momentum: 0.15, technical: 0.1, risk: 0.1 };
    return Object.entries(weights).reduce((s, [k, w]) => s + (scores[k] || 50) * w, 0) / 100 * 100;
  }

  private determineAction(score: number): Recommendation['action'] {
    if (score >= 75) return 'strongBuy';
    if (score >= 60) return 'buy';
    if (score >= 40) return 'hold';
    if (score >= 25) return 'sell';
    return 'strongSell';
  }

  private calculateConfidence(stock: StockProfile, scores: Record<string, number>): number {
    const values = Object.values(scores);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const consistency = 100 - Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
    return Math.max(30, Math.min(95, consistency));
  }

  private generateReasons(stock: StockProfile, scores: Record<string, number>): string[] {
    const reasons: string[] = [];
    if (scores.value > 65) reasons.push('估值处于合理偏低区间');
    if (scores.quality > 65) reasons.push('盈利能力优秀，ROE高于行业平均');
    if (scores.growth > 65) reasons.push('营收和利润增速强劲');
    if (scores.momentum > 65) reasons.push('近期走势强劲，趋势向上');
    if (scores.technical > 65) reasons.push('技术指标显示超卖反弹机会');
    if (stock.dividendYield > 3) reasons.push(`股息率${stock.dividendYield.toFixed(1)}%，提供安全垫`);
    return reasons;
  }

  private identifyRisks(stock: StockProfile): string[] {
    const risks: string[] = [];
    if (stock.pe > 40) risks.push('估值偏高，存在回调风险');
    if (stock.debtRatio > 60) risks.push('资产负债率较高');
    if (stock.volatility > 30) risks.push('波动率偏高，需注意仓位控制');
    if (stock.beta > 1.3) risks.push('Beta值偏高，市场下跌时跌幅可能较大');
    if (stock.rsi > 70) risks.push('RSI超买，短期有回调压力');
    return risks;
  }

  private calcTargetPrice(stock: StockProfile): number {
    const growthFactor = 1 + (stock.revenueGrowth / 100) * 0.3;
    return Math.round(stock.price * Math.max(1.05, growthFactor) * 100) / 100;
  }

  private calcStopLoss(stock: StockProfile): number {
    return Math.round(stock.price * 0.92 * 100) / 100;
  }

  private determineTimeHorizon(scores: Record<string, number>): Recommendation['timeHorizon'] {
    if (scores.momentum > 65) return 'short';
    if (scores.value > 65 || scores.quality > 65) return 'long';
    return 'medium';
  }

  private generateTags(stock: StockProfile, scores: Record<string, number>): string[] {
    const tags: string[] = [];
    if (stock.marketCap > 500) tags.push('大盘股');
    else if (stock.marketCap > 100) tags.push('中盘股');
    else tags.push('小盘股');
    if (scores.value > 65) tags.push('价值');
    if (scores.growth > 65) tags.push('成长');
    if (scores.momentum > 65) tags.push('动量');
    if (stock.dividendYield > 3) tags.push('高股息');
    return tags;
  }

  private actionLabel(action: Recommendation['action']): string {
    const labels = { strongBuy: '强烈买入', buy: '买入', hold: '持有', sell: '卖出', strongSell: '强烈卖出' };
    return labels[action];
  }
}

// ==================== 测试数据 ====================

function genStockProfile(overrides: Partial<StockProfile> = {}): StockProfile {
  return {
    symbol: '000001', name: '测试股票', industry: '科技', marketCap: 200,
    price: 15, pe: 18, pb: 2.5, roe: 15, revenueGrowth: 20, profitGrowth: 18,
    dividendYield: 2, debtRatio: 45, currentRatio: 1.8, grossMargin: 35,
    momentum1m: 3, momentum3m: 8, momentum6m: 15, volatility: 22, beta: 1.1,
    rsi: 50, macdSignal: 0.5, ...overrides,
  };
}

// ==================== 测试 ====================

describe('AIRecommendationEngine AI评分推荐引擎', () => {
  const engine = new AIRecommendationEngine();

  describe('单股票推荐', () => {
    it('应生成推荐结果', () => {
      const rec = engine.recommend(genStockProfile());
      expect(rec.symbol).toBe('000001');
      expect(rec.score).toBeGreaterThan(0);
      expect(['strongBuy', 'buy', 'hold', 'sell', 'strongSell']).toContain(rec.action);
    });

    it('高ROE低PE应获得高评分', () => {
      const good = engine.recommend(genStockProfile({ roe: 25, pe: 10, pb: 1, revenueGrowth: 30 }));
      const bad = engine.recommend(genStockProfile({ roe: 3, pe: 60, pb: 10, revenueGrowth: -5 }));
      expect(good.score).toBeGreaterThan(bad.score);
    });

    it('应包含推荐理由', () => {
      const rec = engine.recommend(genStockProfile({ roe: 25, revenueGrowth: 35 }));
      expect(rec.reasons.length).toBeGreaterThan(0);
    });

    it('应包含风险提示', () => {
      const rec = engine.recommend(genStockProfile({ pe: 60, volatility: 40 }));
      expect(rec.risks.length).toBeGreaterThan(0);
    });

    it('目标价应高于当前价（看多时）', () => {
      const rec = engine.recommend(genStockProfile({ revenueGrowth: 25 }));
      if (rec.action === 'strongBuy' || rec.action === 'buy') {
        expect(rec.targetPrice).toBeGreaterThan(15);
      }
    });

    it('止损价应低于当前价', () => {
      const rec = engine.recommend(genStockProfile());
      expect(rec.stopLoss).toBeLessThan(15);
    });

    it('置信度应在30-95之间', () => {
      const rec = engine.recommend(genStockProfile());
      expect(rec.confidence).toBeGreaterThanOrEqual(30);
      expect(rec.confidence).toBeLessThanOrEqual(95);
    });

    it('应有标签', () => {
      const rec = engine.recommend(genStockProfile({ marketCap: 600, dividendYield: 5 }));
      expect(rec.tags).toContain('大盘股');
      expect(rec.tags).toContain('高股息');
    });
  });

  describe('批量推荐', () => {
    const stocks = [
      genStockProfile({ symbol: '001', name: '优质股', roe: 25, pe: 10, revenueGrowth: 30 }),
      genStockProfile({ symbol: '002', name: '普通股', roe: 12, pe: 25, revenueGrowth: 10 }),
      genStockProfile({ symbol: '003', name: '差股', roe: 2, pe: 80, revenueGrowth: -10 }),
    ];

    it('应返回排序推荐', () => {
      const recs = engine.batchRecommend(stocks);
      expect(recs.length).toBe(3);
      expect(recs[0].score).toBeGreaterThanOrEqual(recs[2].score);
    });

    it('应按评分过滤', () => {
      const recs = engine.batchRecommend(stocks, { minScore: 50 });
      for (const r of recs) expect(r.score).toBeGreaterThanOrEqual(50);
    });

    it('应按操作类型过滤', () => {
      const recs = engine.batchRecommend(stocks, { actions: ['buy', 'strongBuy'] });
      for (const r of recs) expect(['buy', 'strongBuy']).toContain(r.action);
    });

    it('应按PE过滤', () => {
      const recs = engine.batchRecommend(stocks, { maxPE: 30 });
      // 只保留pe<=30的
      expect(recs.length).toBeLessThanOrEqual(2);
    });
  });

  describe('组合推荐', () => {
    it('应生成组合', () => {
      const stocks = Array.from({ length: 5 }, (_, i) =>
        genStockProfile({ symbol: `${i}`, name: `股${i}`, roe: 15 + i * 3, volatility: 15 + i * 5 })
      );
      const portfolio = engine.portfolioRecommend(stocks, 100000, 3);
      expect(portfolio.recommendations.length).toBeLessThanOrEqual(3);
      expect(portfolio.allocations.length).toBe(portfolio.recommendations.length);

      const totalWeight = portfolio.allocations.reduce((s, a) => s + a.weight, 0);
      expect(totalWeight).toBeCloseTo(1, 1);
    });

    it('低波动应获得更高权重', () => {
      const stocks = [
        genStockProfile({ symbol: 'A', roe: 20, volatility: 10, revenueGrowth: 20 }),
        genStockProfile({ symbol: 'B', roe: 20, volatility: 40, revenueGrowth: 20 }),
      ];
      const portfolio = engine.portfolioRecommend(stocks, 100000);
      if (portfolio.allocations.length >= 2) {
        const a = portfolio.allocations.find(x => x.symbol === 'A');
        const b = portfolio.allocations.find(x => x.symbol === 'B');
        if (a && b) expect(a.weight).toBeGreaterThan(b.weight);
      }
    });
  });

  describe('推荐解释', () => {
    it('应生成解释文本', () => {
      const stock = genStockProfile({ roe: 25, revenueGrowth: 30 });
      const rec = engine.recommend(stock);
      const explain = engine.explainRecommendation(rec, stock);
      expect(explain).toContain('测试股票');
      expect(explain).toContain('000001');
      expect(explain).toContain('推荐理由');
    });

    it('应包含风险提示', () => {
      const stock = genStockProfile({ pe: 60, volatility: 40 });
      const rec = engine.recommend(stock);
      const explain = engine.explainRecommendation(rec, stock);
      expect(explain).toContain('风险提示');
    });
  });

  describe('边界情况', () => {
    it('极低PE应获得高价值分', () => {
      const rec = engine.recommend(genStockProfile({ pe: 3, pb: 0.3 }));
      expect(rec.score).toBeGreaterThan(40);
    });

    it('极高PE应获得低价值分', () => {
      const rec = engine.recommend(genStockProfile({ pe: 100, pb: 20 }));
      expect(rec.score).toBeLessThan(65);
    });

    it('小盘股标签正确', () => {
      const rec = engine.recommend(genStockProfile({ marketCap: 50 }));
      expect(rec.tags).toContain('小盘股');
    });
  });
});
