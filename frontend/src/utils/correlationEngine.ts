/**
 * 相关性矩阵引擎
 * 计算股票之间的价格相关性，支持Pearson/Spearman/Kendall算法
 * 用于投资组合分析、板块联动检测、风险分散评估
 */

export interface CorrelationConfig {
  algorithm: 'pearson' | 'spearman' | 'kendall';
  period: number;        // 计算周期（天）
  minDataPoints: number; // 最少数据点
  smoothing: number;     // 平滑系数 (0-1)
}

export interface StockPriceData {
  symbol: string;
  name: string;
  prices: number[];
  dates: string[];
}

export interface CorrelationResult {
  stock1: string;
  stock2: string;
  correlation: number;
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative';
  pValue: number;
  confidence: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  timestamp: number;
  config: CorrelationConfig;
  stats: {
    avgCorrelation: number;
    maxCorrelation: number;
    minCorrelation: number;
    clusters: string[][];
  };
}

const DEFAULT_CONFIG: CorrelationConfig = {
  algorithm: 'pearson',
  period: 60,
  minDataPoints: 20,
  smoothing: 0.3,
};

export class CorrelationEngine {
  private config: CorrelationConfig;
  private cache: Map<string, CorrelationMatrix> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5分钟缓存

  constructor(config: Partial<CorrelationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 计算Pearson相关系数
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom === 0 ? 0 : numerator / denom;
  }

  /**
   * 计算Spearman秩相关系数
   */
  private spearmanCorrelation(x: number[], y: number[]): number {
    const rankX = this.getRanks(x);
    const rankY = this.getRanks(y);
    return this.pearsonCorrelation(rankX, rankY);
  }

  /**
   * 计算Kendall Tau相关系数
   */
  private kendallCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;

    let concordant = 0;
    let discordant = 0;

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const signX = Math.sign(x[j] - x[i]);
        const signY = Math.sign(y[j] - y[i]);
        if (signX === signY) concordant++;
        else if (signX !== 0 && signY !== 0) discordant++;
      }
    }

    return (2 * (concordant - discordant)) / (n * (n - 1));
  }

  /**
   * 获取排名数组
   */
  private getRanks(values: number[]): number[] {
    const indexed = values.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => a.value - b.value);

    const ranks = new Array(values.length);
    for (let i = 0; i < indexed.length; i++) {
      ranks[indexed[i].index] = i + 1;
    }
    return ranks;
  }

  /**
   * 计算收益率序列
   */
  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] !== 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
    return returns;
  }

  /**
   * 简化P值计算（t分布近似）
   */
  private calculatePValue(r: number, n: number): number {
    if (n <= 2) return 1;
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    const df = n - 2;
    // 简化的t分布累积分布函数近似
    const x = df / (df + t * t);
    return Math.min(1, Math.max(0, 1 - this.betaIncomplete(df / 2, 0.5, x) / this.betaComplete(df / 2, 0.5)));
  }

  private betaIncomplete(a: number, b: number, x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return this.betaComplete(a, b);
    // 简化的不完全Beta函数近似
    const sum = this.betaComplete(a, b);
    return sum * Math.pow(x, a) * Math.pow(1 - x, b);
  }

  private betaComplete(a: number, b: number): number {
    return (this.gammaLn(a) + this.gammaLn(b) - this.gammaLn(a + b));
  }

  private gammaLn(x: number): number {
    const c = [
      76.18009172947146, -86.50532032941677,
      24.01409824083091, -1.231739572450155,
      0.1208650973866179e-2, -0.5395239384953e-5
    ];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (const cVal of c) {
      ser += cVal / ++y;
    }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /**
   * 判断相关性强度
   */
  private getStrength(r: number): 'strong' | 'moderate' | 'weak' | 'none' {
    const abs = Math.abs(r);
    if (abs >= 0.7) return 'strong';
    if (abs >= 0.4) return 'moderate';
    if (abs >= 0.2) return 'weak';
    return 'none';
  }

  /**
   * 计算两只股票之间的相关性
   */
  computePairCorrelation(
    stock1: StockPriceData,
    stock2: StockPriceData
  ): CorrelationResult {
    const returns1 = this.calculateReturns(stock1.prices);
    const returns2 = this.calculateReturns(stock2.prices);

    // 取共同时间段
    const minLen = Math.min(returns1.length, returns2.length);
    const slice1 = returns1.slice(-minLen);
    const slice2 = returns2.slice(-minLen);

    let correlation: number;
    switch (this.config.algorithm) {
      case 'spearman':
        correlation = this.spearmanCorrelation(slice1, slice2);
        break;
      case 'kendall':
        correlation = this.kendallCorrelation(slice1, slice2);
        break;
      default:
        correlation = this.pearsonCorrelation(slice1, slice2);
    }

    // 应用平滑
    correlation = correlation * (1 - this.config.smoothing);

    const pValue = this.calculatePValue(correlation, minLen);

    return {
      stock1: stock1.symbol,
      stock2: stock2.symbol,
      correlation: Math.round(correlation * 1000) / 1000,
      strength: this.getStrength(correlation),
      direction: correlation >= 0 ? 'positive' : 'negative',
      pValue,
      confidence: Math.round((1 - pValue) * 100) / 100,
    };
  }

  /**
   * 构建完整相关性矩阵
   */
  buildMatrix(stocks: StockPriceData[]): CorrelationMatrix {
    const cacheKey = stocks.map(s => s.symbol).sort().join(',') + 
                     `_${this.config.algorithm}_${this.config.period}`;

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached;
    }

    const n = stocks.length;
    const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    const correlations: number[] = [];

    // 对角线为1
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
    }

    // 计算所有配对
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const result = this.computePairCorrelation(stocks[i], stocks[j]);
        matrix[i][j] = result.correlation;
        matrix[j][i] = result.correlation;
        correlations.push(result.correlation);
      }
    }

    // 聚类分析
    const clusters = this.detectClusters(stocks.map(s => s.symbol), matrix);

    const result: CorrelationMatrix = {
      symbols: stocks.map(s => s.symbol),
      matrix,
      timestamp: Date.now(),
      config: this.config,
      stats: {
        avgCorrelation: correlations.length > 0 
          ? Math.round(correlations.reduce((a, b) => a + b, 0) / correlations.length * 1000) / 1000 
          : 0,
        maxCorrelation: correlations.length > 0 ? Math.max(...correlations) : 0,
        minCorrelation: correlations.length > 0 ? Math.min(...correlations) : 0,
        clusters,
      },
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * 简单聚类检测（基于相关性阈值）
   */
  private detectClusters(symbols: string[], matrix: number[][]): string[][] {
    const threshold = 0.5;
    const visited = new Set<string>();
    const clusters: string[][] = [];

    for (const symbol of symbols) {
      if (visited.has(symbol)) continue;

      const cluster: string[] = [symbol];
      visited.add(symbol);

      const idx = symbols.indexOf(symbol);
      for (let j = 0; j < symbols.length; j++) {
        if (j !== idx && matrix[idx][j] >= threshold && !visited.has(symbols[j])) {
          cluster.push(symbols[j]);
          visited.add(symbols[j]);
        }
      }

      if (cluster.length > 1) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * 计算投资组合分散度
   */
  calculateDiversification(matrix: CorrelationMatrix): {
    score: number;
    level: 'excellent' | 'good' | 'moderate' | 'poor';
    recommendation: string;
  } {
    const avg = matrix.stats.avgCorrelation;
    const score = Math.round((1 - Math.abs(avg)) * 100);

    let level: 'excellent' | 'good' | 'moderate' | 'poor';
    let recommendation: string;

    if (score >= 80) {
      level = 'excellent';
      recommendation = '投资组合分散度优秀，资产间相关性低';
    } else if (score >= 60) {
      level = 'good';
      recommendation = '投资组合分散度良好，建议保持现有配置';
    } else if (score >= 40) {
      level = 'moderate';
      recommendation = '投资组合分散度一般，建议增加低相关资产';
    } else {
      level = 'poor';
      recommendation = '投资组合分散度较差，资产高度相关，风险集中';
    }

    return { score, level, recommendation };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CorrelationConfig>): void {
    this.config = { ...this.config, ...config };
    this.clearCache();
  }
}

export const correlationEngine = new CorrelationEngine();
export default CorrelationEngine;
