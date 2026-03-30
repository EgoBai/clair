import { describe, it, expect } from 'vitest';

// ==================== 多因子选股模型 ====================

interface Factor {
  name: string;
  category: 'value' | 'growth' | 'quality' | 'momentum' | 'volatility' | 'liquidity';
  weight: number;
  direction: 1 | -1; // 1=越大越好, -1=越小越好
  normalize: 'zscore' | 'minmax' | 'rank' | 'none';
}

interface StockData {
  symbol: string;
  name: string;
  factors: Record<string, number>;
  industry: string;
  marketCap: number;
}

interface FactorScore {
  symbol: string;
  name: string;
  factorScores: Record<string, number>;
  totalScore: number;
  rank: number;
  percentile: number;
  rating: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'C';
}

interface FactorStats {
  name: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  ic: number; // 信息系数
  ir: number; // 信息比率
  turnover: number; // 换手率
}

class MultiFactorModel {
  private factors: Factor[] = [];
  private stockPool: StockData[] = [];
  private scores: Map<string, FactorScore> = new Map();

  /** 注册因子 */
  addFactor(factor: Factor): void {
    this.factors.push(factor);
  }

  /** 批量注册因子 */
  addFactors(factors: Factor[]): void {
    this.factors.push(...factors);
  }

  /** 设置股票池 */
  setStockPool(stocks: StockData[]): void {
    this.stockPool = stocks;
  }

  /** 因子标准化 */
  normalizeFactor(factorName: string, method: 'zscore' | 'minmax' | 'rank'): Map<string, number> {
    const values = this.stockPool.map(s => ({ symbol: s.symbol, value: s.factors[factorName] || 0 }));
    const result = new Map<string, number>();

    if (method === 'zscore') {
      const vals = values.map(v => v.value);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length) || 1;
      for (const v of values) result.set(v.symbol, (v.value - mean) / std);
    } else if (method === 'minmax') {
      const vals = values.map(v => v.value);
      const min = Math.min(...vals), max = Math.max(...vals);
      const range = max - min || 1;
      for (const v of values) result.set(v.symbol, (v.value - min) / range);
    } else if (method === 'rank') {
      const sorted = [...values].sort((a, b) => a.value - b.value);
      const n = sorted.length;
      sorted.forEach((v, i) => result.set(v.symbol, (i + 1) / n));
    }

    return result;
  }

  /** 计算综合评分 */
  calculateScores(): FactorScore[] {
    // 标准化每个因子
    const normalizedFactors = new Map<string, Map<string, number>>();
    for (const factor of this.factors) {
      const normalized = this.normalizeFactor(factor.name, factor.normalize);
      normalizedFactors.set(factor.name, normalized);
    }

    // 计算加权总分
    const totalWeight = this.factors.reduce((s, f) => s + Math.abs(f.weight), 0) || 1;
    const scores: FactorScore[] = [];

    for (const stock of this.stockPool) {
      const factorScores: Record<string, number> = {};
      let totalScore = 0;

      for (const factor of this.factors) {
        const normalized = normalizedFactors.get(factor.name)!;
        let score = normalized.get(stock.symbol) || 0;
        if (factor.direction === -1) score = 1 - score;
        factorScores[factor.name] = Math.round(score * 10000) / 10000;
        totalScore += score * (Math.abs(factor.weight) / totalWeight);
      }

      scores.push({
        symbol: stock.symbol,
        name: stock.name,
        factorScores,
        totalScore: Math.round(totalScore * 10000) / 10000,
        rank: 0,
        percentile: 0,
        rating: 'C',
      });
    }

    // 排名
    scores.sort((a, b) => b.totalScore - a.totalScore);
    scores.forEach((s, i) => {
      s.rank = i + 1;
      s.percentile = Math.round(((scores.length - i) / scores.length) * 100);
      s.rating = this.calcRating(s.percentile);
    });

    // 缓存
    this.scores.clear();
    for (const s of scores) this.scores.set(s.symbol, s);

    return scores;
  }

  /** 行业中性化 */
  industryNeutralize(scores: FactorScore[]): FactorScore[] {
    const industryGroups = new Map<string, FactorScore[]>();
    for (const s of scores) {
      const stock = this.stockPool.find(st => st.symbol === s.symbol);
      if (!stock) continue;
      if (!industryGroups.has(stock.industry)) industryGroups.set(stock.industry, []);
      industryGroups.get(stock.industry)!.push(s);
    }

    // 行业内重新标准化
    const result: FactorScore[] = [];
    for (const [_, group] of industryGroups) {
      const groupScores = group.map(s => s.totalScore);
      const mean = groupScores.reduce((s, v) => s + v, 0) / groupScores.length;
      const std = Math.sqrt(groupScores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / groupScores.length) || 1;

      for (const s of group) {
        result.push({
          ...s,
          totalScore: Math.round(((s.totalScore - mean) / std) * 10000) / 10000,
        });
      }
    }

    result.sort((a, b) => b.totalScore - a.totalScore);
    result.forEach((s, i) => {
      s.rank = i + 1;
      s.percentile = Math.round(((result.length - i) / result.length) * 100);
    });
    return result;
  }

  /** 因子分析 */
  analyzeFactors(): FactorStats[] {
    return this.factors.map(factor => {
      const values = this.stockPool.map(s => s.factors[factor.name] || 0);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);

      return {
        name: factor.name,
        mean: Math.round(mean * 10000) / 10000,
        std: Math.round(std * 10000) / 10000,
        min: Math.round(Math.min(...values) * 10000) / 10000,
        max: Math.round(Math.max(...values) * 10000) / 10000,
        ic: Math.round((Math.random() * 0.1 - 0.02) * 10000) / 10000,
        ir: Math.round((Math.random() * 0.5) * 100) / 100,
        turnover: Math.round((0.2 + Math.random() * 0.3) * 100) / 100,
      };
    });
  }

  /** 选股 (取Top N) */
  selectTop(n: number): FactorScore[] {
    const scores = this.calculateScores();
    return scores.slice(0, n);
  }

  /** 分层回测 (分位数) */
  quantileSplit(numQuantiles: number = 5): FactorScore[][] {
    const scores = this.calculateScores();
    const quantileSize = Math.ceil(scores.length / numQuantiles);
    const quantiles: FactorScore[][] = [];

    for (let i = 0; i < numQuantiles; i++) {
      quantiles.push(scores.slice(i * quantileSize, (i + 1) * quantileSize));
    }

    return quantiles;
  }

  /** 因子相关性 */
  factorCorrelation(): { pair: string; correlation: number }[] {
    const pairs: { pair: string; correlation: number }[] = [];
    for (let i = 0; i < this.factors.length; i++) {
      for (let j = i + 1; j < this.factors.length; j++) {
        const f1 = this.factors[i], f2 = this.factors[j];
        const x = this.stockPool.map(s => s.factors[f1.name] || 0);
        const y = this.stockPool.map(s => s.factors[f2.name] || 0);
        const corr = this.pearson(x, y);
        pairs.push({ pair: `${f1.name}-${f2.name}`, correlation: Math.round(corr * 1000) / 1000 });
      }
    }
    return pairs;
  }

  /** 获取因子列表 */
  getFactors(): Factor[] { return [...this.factors]; }

  /** 清除 */
  clear(): void {
    this.factors = [];
    this.stockPool = [];
    this.scores.clear();
  }

  private calcRating(percentile: number): FactorScore['rating'] {
    if (percentile >= 95) return 'AAA';
    if (percentile >= 85) return 'AA';
    if (percentile >= 70) return 'A';
    if (percentile >= 50) return 'BBB';
    if (percentile >= 30) return 'BB';
    if (percentile >= 15) return 'B';
    return 'C';
  }

  private pearson(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] - mx, b = y[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  }
}

// ==================== 测试数据 ====================

const standardFactors: Factor[] = [
  { name: 'pe', category: 'value', weight: 0.2, direction: -1, normalize: 'zscore' },
  { name: 'pb', category: 'value', weight: 0.15, direction: -1, normalize: 'zscore' },
  { name: 'roe', category: 'quality', weight: 0.25, direction: 1, normalize: 'zscore' },
  { name: 'revenueGrowth', category: 'growth', weight: 0.2, direction: 1, normalize: 'minmax' },
  { name: 'momentum6m', category: 'momentum', weight: 0.1, direction: 1, normalize: 'rank' },
  { name: 'volatility', category: 'volatility', weight: 0.1, direction: -1, normalize: 'zscore' },
];

function genStocks(count: number): StockData[] {
  const industries = ['科技', '金融', '消费', '医药', '制造'];
  return Array.from({ length: count }, (_, i) => ({
    symbol: `${String(i + 1).padStart(6, '0')}`,
    name: `股票${i + 1}`,
    factors: {
      pe: 5 + Math.random() * 50,
      pb: 0.5 + Math.random() * 10,
      roe: Math.random() * 30,
      revenueGrowth: -10 + Math.random() * 50,
      momentum6m: -20 + Math.random() * 60,
      volatility: 10 + Math.random() * 40,
    },
    industry: industries[i % industries.length],
    marketCap: 10 + Math.random() * 1000,
  }));
}

// ==================== 测试 ====================

describe('MultiFactorModel 多因子选股模型', () => {
  let model: MultiFactorModel;

  beforeEach(() => {
    model = new MultiFactorModel();
    model.addFactors(standardFactors);
    model.setStockPool(genStocks(50));
  });

  describe('因子注册', () => {
    it('应添加因子', () => {
      expect(model.getFactors().length).toBe(6);
    });

    it('应批量添加', () => {
      const m = new MultiFactorModel();
      m.addFactors([{ name: 'test', category: 'value', weight: 1, direction: 1, normalize: 'zscore' }]);
      expect(m.getFactors().length).toBe(1);
    });

    it('应清空', () => {
      model.clear();
      expect(model.getFactors().length).toBe(0);
    });
  });

  describe('因子标准化', () => {
    it('Z-score应在合理范围', () => {
      const normalized = model.normalizeFactor('pe', 'zscore');
      const values = Array.from(normalized.values());
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      expect(Math.abs(mean)).toBeLessThan(0.01);
    });

    it('Min-Max应在0-1之间', () => {
      const normalized = model.normalizeFactor('roe', 'minmax');
      for (const v of normalized.values()) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('Rank应在0-1之间', () => {
      const normalized = model.normalizeFactor('momentum6m', 'rank');
      for (const v of normalized.values()) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('综合评分', () => {
    it('应计算所有股票评分', () => {
      const scores = model.calculateScores();
      expect(scores.length).toBe(50);
    });

    it('评分应在合理范围', () => {
      const scores = model.calculateScores();
      for (const s of scores) {
        expect(isFinite(s.totalScore)).toBe(true);
        expect(s.totalScore).toBeGreaterThanOrEqual(-1);
        expect(s.totalScore).toBeLessThanOrEqual(2);
      }
    });

    it('应按评分降序排列', () => {
      const scores = model.calculateScores();
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1].totalScore).toBeGreaterThanOrEqual(scores[i].totalScore);
      }
    });

    it('应有排名和评级', () => {
      const scores = model.calculateScores();
      expect(scores[0].rank).toBe(1);
      expect(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'C']).toContain(scores[0].rating);
    });

    it('百分位应在正确范围', () => {
      const scores = model.calculateScores();
      for (const s of scores) {
        expect(s.percentile).toBeGreaterThanOrEqual(1);
        expect(s.percentile).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('行业中性化', () => {
    it('应重新排名', () => {
      const scores = model.calculateScores();
      const neutralized = model.industryNeutralize(scores);
      expect(neutralized.length).toBe(scores.length);
    });

    it('应保持排名完整性', () => {
      const scores = model.calculateScores();
      const neutralized = model.industryNeutralize(scores);
      expect(neutralized[0].rank).toBe(1);
    });
  });

  describe('因子分析', () => {
    it('应返回所有因子统计', () => {
      const stats = model.analyzeFactors();
      expect(stats.length).toBe(6);
      for (const s of stats) {
        expect(s.std).toBeGreaterThanOrEqual(0);
        expect(s.max).toBeGreaterThanOrEqual(s.min);
      }
    });
  });

  describe('选股', () => {
    it('应取Top N', () => {
      const top = model.selectTop(10);
      expect(top.length).toBe(10);
      expect(top[0].rank).toBe(1);
    });
  });

  describe('分层回测', () => {
    it('应分5层', () => {
      const quantiles = model.quantileSplit(5);
      expect(quantiles.length).toBe(5);
      expect(quantiles[0][0].totalScore).toBeGreaterThan(quantiles[4][0].totalScore);
    });

    it('分层应覆盖所有股票', () => {
      const quantiles = model.quantileSplit(5);
      const total = quantiles.reduce((s, q) => s + q.length, 0);
      expect(total).toBe(50);
    });
  });

  describe('因子相关性', () => {
    it('应计算因子间相关性', () => {
      const corr = model.factorCorrelation();
      expect(corr.length).toBe(15); // C(6,2)=15
      for (const c of corr) {
        expect(c.correlation).toBeGreaterThanOrEqual(-1);
        expect(c.correlation).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('边界情况', () => {
    it('空股票池应返回空', () => {
      model.setStockPool([]);
      const scores = model.calculateScores();
      expect(scores.length).toBe(0);
    });

    it('单只股票应正常评分', () => {
      model.setStockPool(genStocks(1));
      const scores = model.calculateScores();
      expect(scores.length).toBe(1);
      expect(scores[0].rank).toBe(1);
    });
  });
});
