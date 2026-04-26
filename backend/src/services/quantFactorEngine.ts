/**
 * 量化因子计算引擎
 * 支持常见量化因子的计算和组合
 */

export type FactorCategory = 'momentum' | 'value' | 'quality' | 'volatility' | 'size' | 'growth' | 'liquidity';

export interface FactorDefinition {
  name: string;
  category: FactorCategory;
  description: string;
  calculate: (data: StockData) => number | null;
}

export interface StockData {
  code: string;
  name: string;
  prices: number[];
  volumes: number[];
  highs: number[];
  lows: number[];
  open: number[];
  marketCap: number;
  pe: number;
  pb: number;
  ps: number;
  roe: number;
  revenueGrowth: number;
  earningsGrowth: number;
  debtToEquity: number;
  currentRatio: number;
  grossMargin: number;
  netMargin: number;
  dividendYield: number;
  sharesOutstanding: number;
}

export interface FactorScore {
  code: string;
  name: string;
  factors: Map<string, number>;
  compositeScore: number;
  rank: number;
  percentile: number;
}

export interface FactorNeutralization {
  sectorExposure: Map<string, number>;
  industryExposure: Map<string, number>;
  sizeExposure: number;
  residualAlpha: number;
}

export class QuantFactorEngine {
  private factors: Map<string, FactorDefinition> = new Map();
  private scores: Map<string, FactorScore> = new Map();

  constructor() {
    this.registerBuiltinFactors();
  }

  private registerBuiltinFactors(): void {
    // Momentum factors
    this.registerFactor({
      name: 'momentum_1m',
      category: 'momentum',
      description: '1个月动量',
      calculate: (data) => {
        if (data.prices.length < 22) return null;
        return (data.prices[data.prices.length - 1] - data.prices[data.prices.length - 22]) / data.prices[data.prices.length - 22];
      }
    });

    this.registerFactor({
      name: 'momentum_3m',
      category: 'momentum',
      description: '3个月动量',
      calculate: (data) => {
        if (data.prices.length < 66) return null;
        return (data.prices[data.prices.length - 1] - data.prices[data.prices.length - 66]) / data.prices[data.prices.length - 66];
      }
    });

    this.registerFactor({
      name: 'momentum_12m',
      category: 'momentum',
      description: '12个月动量',
      calculate: (data) => {
        if (data.prices.length < 252) return null;
        return (data.prices[data.prices.length - 1] - data.prices[data.prices.length - 252]) / data.prices[data.prices.length - 252];
      }
    });

    this.registerFactor({
      name: 'reversal_1w',
      category: 'momentum',
      description: '1周反转',
      calculate: (data) => {
        if (data.prices.length < 5) return null;
        return -(data.prices[data.prices.length - 1] - data.prices[data.prices.length - 5]) / data.prices[data.prices.length - 5];
      }
    });

    // Value factors
    this.registerFactor({
      name: 'ep',
      category: 'value',
      description: '盈利收益率 (1/PE)',
      calculate: (data) => data.pe > 0 ? 1 / data.pe : null
    });

    this.registerFactor({
      name: 'bp',
      category: 'value',
      description: '账面市值比 (1/PB)',
      calculate: (data) => data.pb > 0 ? 1 / data.pb : null
    });

    this.registerFactor({
      name: 'sp',
      category: 'value',
      description: '营收市值比 (1/PS)',
      calculate: (data) => data.ps > 0 ? 1 / data.ps : null
    });

    this.registerFactor({
      name: 'dividend_yield',
      category: 'value',
      description: '股息率',
      calculate: (data) => data.dividendYield
    });

    // Quality factors
    this.registerFactor({
      name: 'roe',
      category: 'quality',
      description: '净资产收益率',
      calculate: (data) => data.roe
    });

    this.registerFactor({
      name: 'gross_margin',
      category: 'quality',
      description: '毛利率',
      calculate: (data) => data.grossMargin
    });

    this.registerFactor({
      name: 'net_margin',
      category: 'quality',
      description: '净利率',
      calculate: (data) => data.netMargin
    });

    this.registerFactor({
      name: 'current_ratio',
      category: 'quality',
      description: '流动比率',
      calculate: (data) => data.currentRatio
    });

    // Volatility factors
    this.registerFactor({
      name: 'volatility_1m',
      category: 'volatility',
      description: '1个月波动率',
      calculate: (data) => {
        if (data.prices.length < 22) return null;
        const returns: number[] = [];
        for (let i = data.prices.length - 22; i < data.prices.length; i++) {
          if (i > 0) returns.push((data.prices[i] - data.prices[i - 1]) / data.prices[i - 1]);
        }
        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
        return Math.sqrt(variance * 252);
      }
    });

    this.registerFactor({
      name: 'beta',
      category: 'volatility',
      description: 'Beta系数 (简化)',
      calculate: (data) => {
        if (data.prices.length < 60) return null;
        const returns: number[] = [];
        for (let i = data.prices.length - 60; i < data.prices.length; i++) {
          if (i > 0) returns.push((data.prices[i] - data.prices[i - 1]) / data.prices[i - 1]);
        }
        const variance = returns.reduce((s, r) => s + r * r, 0) / (returns.length - 1);
        return Math.sqrt(variance) * 1.5; // Simplified beta
      }
    });

    // Growth factors
    this.registerFactor({
      name: 'revenue_growth',
      category: 'growth',
      description: '营收增长率',
      calculate: (data) => data.revenueGrowth
    });

    this.registerFactor({
      name: 'earnings_growth',
      category: 'growth',
      description: '盈利增长率',
      calculate: (data) => data.earningsGrowth
    });

    // Size factor
    this.registerFactor({
      name: 'log_market_cap',
      category: 'size',
      description: '对数市值',
      calculate: (data) => Math.log(data.marketCap)
    });

    // Liquidity factors
    this.registerFactor({
      name: 'turnover_1m',
      category: 'liquidity',
      description: '1个月换手率',
      calculate: (data) => {
        if (data.volumes.length < 22 || data.sharesOutstanding <= 0) return null;
        const avgVol = data.volumes.slice(-22).reduce((s, v) => s + v, 0) / 22;
        return avgVol / data.sharesOutstanding;
      }
    });

    this.registerFactor({
      name: 'amihud_illiquidity',
      category: 'liquidity',
      description: 'Amihud非流动性指标',
      calculate: (data) => {
        if (data.prices.length < 22 || data.volumes.length < 22) return null;
        let illiquidity = 0;
        const start = Math.max(1, data.prices.length - 22);
        for (let i = start; i < data.prices.length; i++) {
          const ret = Math.abs((data.prices[i] - data.prices[i - 1]) / data.prices[i - 1]);
          const vol = data.volumes[i] * data.prices[i];
          if (vol > 0) illiquidity += ret / vol;
        }
        return illiquidity / (data.prices.length - start);
      }
    });
  }

  registerFactor(factor: FactorDefinition): void {
    this.factors.set(factor.name, factor);
  }

  getFactor(name: string): FactorDefinition | undefined {
    return this.factors.get(name);
  }

  getAllFactors(): FactorDefinition[] {
    return Array.from(this.factors.values());
  }

  getFactorsByCategory(category: FactorCategory): FactorDefinition[] {
    return this.getAllFactors().filter(f => f.category === category);
  }

  calculateFactorScores(stocks: StockData[], factorNames?: string[]): FactorScore[] {
    const names = factorNames || Array.from(this.factors.keys());
    const scores: FactorScore[] = [];

    for (const stock of stocks) {
      const factorValues = new Map<string, number>();
      
      for (const name of names) {
        const factor = this.factors.get(name);
        if (factor) {
          const value = factor.calculate(stock);
          if (value !== null && isFinite(value)) {
            factorValues.set(name, value);
          }
        }
      }

      scores.push({
        code: stock.code,
        name: stock.name,
        factors: factorValues,
        compositeScore: 0,
        rank: 0,
        percentile: 0
      });
    }

    // Z-score normalization
    this.normalizeScores(scores, names);

    // Calculate composite score
    for (const score of scores) {
      let total = 0;
      let count = 0;
      for (const value of score.factors.values()) {
        total += value;
        count++;
      }
      score.compositeScore = count > 0 ? total / count : 0;
    }

    // Rank
    scores.sort((a, b) => b.compositeScore - a.compositeScore);
    scores.forEach((s, i) => {
      s.rank = i + 1;
      s.percentile = (1 - i / scores.length) * 100;
    });

    // Cache
    for (const score of scores) {
      this.scores.set(score.code, score);
    }

    return scores;
  }

  private normalizeScores(scores: FactorScore[], factorNames: string[]): void {
    for (const name of factorNames) {
      const values = scores.map(s => s.factors.get(name)).filter((v): v is number => v !== undefined);
      if (values.length === 0) continue;

      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1);
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        for (const score of scores) {
          const value = score.factors.get(name);
          if (value !== undefined) {
            score.factors.set(name, (value - mean) / stdDev);
          }
        }
      }
    }
  }

  getFactorScore(code: string): FactorScore | undefined {
    return this.scores.get(code);
  }

  getTopStocks(n: number): FactorScore[] {
    return Array.from(this.scores.values())
      .sort((a, b) => a.rank - b.rank)
      .slice(0, n);
  }

  getBottomStocks(n: number): FactorScore[] {
    return Array.from(this.scores.values())
      .sort((a, b) => b.rank - a.rank)
      .slice(0, n);
  }
}

export default new QuantFactorEngine();
