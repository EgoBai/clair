/**
 * 量化因子评分引擎
 * 多因子模型综合评分系统
 */

export interface FactorScore {
  name: string;
  value: number;
  weight: number;
  score: number;   // 0-100
  percentile: number;
}

export interface FactorConfig {
  momentum: { weight: number; lookback: number };
  value: { weight: number };
  quality: { weight: number };
  volatility: { weight: number; window: number };
  growth: { weight: number };
  sentiment: { weight: number };
}

export interface StockFactors {
  symbol: string;
  returns1M: number;
  returns3M: number;
  returns6M: number;
  returns12M: number;
  pe: number;
  pb: number;
  ps: number;
  roe: number;
  grossMargin: number;
  debtToEquity: number;
  revenueGrowth: number;
  earningsGrowth: number;
  volatility20D: number;
  volatility60D: number;
  analystRating: number;    // 1-5
  shortInterest: number;    // 做空比例
  institutionalHolding: number; // 机构持仓比例
}

export interface QuantScoreResult {
  symbol: string;
  totalScore: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  factors: FactorScore[];
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
}

export class QuantFactorEngine {
  private config: FactorConfig = {
    momentum: { weight: 0.25, lookback: 60 },
    value: { weight: 0.2 },
    quality: { weight: 0.2 },
    volatility: { weight: 0.15, window: 20 },
    growth: { weight: 0.1 },
    sentiment: { weight: 0.1 },
  };

  /**
   * 计算动量因子得分
   */
  private scoreMomentum(factors: StockFactors): FactorScore {
    const r1m = factors.returns1M * 100;
    const r3m = factors.returns3M * 100;
    const r6m = factors.returns6M * 100;

    // 加权动量
    const weightedMomentum = r1m * 0.5 + r3m * 0.3 + r6m * 0.2;
    const score = Math.max(0, Math.min(100, 50 + weightedMomentum * 2));

    return {
      name: '动量',
      value: weightedMomentum,
      weight: this.config.momentum.weight,
      score: Math.round(score),
      percentile: Math.round(score),
    };
  }

  /**
   * 计算估值因子得分
   */
  private scoreValue(factors: StockFactors): FactorScore {
    // PE、PB、PS越低越好（价值股）
    const peScore = factors.pe > 0 ? Math.max(0, 100 - factors.pe * 2) : 50;
    const pbScore = factors.pb > 0 ? Math.max(0, 100 - factors.pb * 15) : 50;
    const psScore = factors.ps > 0 ? Math.max(0, 100 - factors.ps * 5) : 50;

    const avg = (peScore + pbScore + psScore) / 3;

    return {
      name: '估值',
      value: factors.pe,
      weight: this.config.value.weight,
      score: Math.round(avg),
      percentile: Math.round(avg),
    };
  }

  /**
   * 计算质量因子得分
   */
  private scoreQuality(factors: StockFactors): FactorScore {
    const roeScore = Math.min(100, factors.roe * 500); // 20% ROE → 100分
    const marginScore = Math.min(100, factors.grossMargin * 200);
    const debtScore = Math.max(0, 100 - factors.debtToEquity * 50);

    const avg = (roeScore * 0.4 + marginScore * 0.3 + debtScore * 0.3);

    return {
      name: '质量',
      value: factors.roe,
      weight: this.config.quality.weight,
      score: Math.round(avg),
      percentile: Math.round(avg),
    };
  }

  /**
   * 计算波动率因子得分（低波动溢价）
   */
  private scoreVolatility(factors: StockFactors): FactorScore {
    const volScore = Math.max(0, 100 - factors.volatility20D * 200);

    return {
      name: '波动率',
      value: factors.volatility20D,
      weight: this.config.volatility.weight,
      score: Math.round(volScore),
      percentile: Math.round(volScore),
    };
  }

  /**
   * 计算成长因子得分
   */
  private scoreGrowth(factors: StockFactors): FactorScore {
    const revGrowth = Math.min(100, Math.max(0, 50 + factors.revenueGrowth * 100));
    const earnGrowth = Math.min(100, Math.max(0, 50 + factors.earningsGrowth * 100));
    const avg = (revGrowth + earnGrowth) / 2;

    return {
      name: '成长',
      value: factors.revenueGrowth,
      weight: this.config.growth.weight,
      score: Math.round(avg),
      percentile: Math.round(avg),
    };
  }

  /**
   * 计算情绪因子得分
   */
  private scoreSentiment(factors: StockFactors): FactorScore {
    const analystScore = factors.analystRating * 20; // 1-5 → 20-100
    const shortScore = Math.max(0, 100 - factors.shortInterest * 500);
    const instScore = factors.institutionalHolding * 100;

    const avg = (analystScore * 0.4 + shortScore * 0.3 + instScore * 0.3);

    return {
      name: '情绪',
      value: factors.analystRating,
      weight: this.config.sentiment.weight,
      score: Math.round(avg),
      percentile: Math.round(avg),
    };
  }

  /**
   * 综合评分
   */
  scoreStock(factors: StockFactors): QuantScoreResult {
    const factorScores = [
      this.scoreMomentum(factors),
      this.scoreValue(factors),
      this.scoreQuality(factors),
      this.scoreVolatility(factors),
      this.scoreGrowth(factors),
      this.scoreSentiment(factors),
    ];

    // 加权总分
    const totalScore = Math.round(
      factorScores.reduce((sum, f) => sum + f.score * f.weight, 0) * 100
    ) / 100;

    // 等级
    let grade: QuantScoreResult['grade'];
    if (totalScore >= 85) grade = 'A+';
    else if (totalScore >= 75) grade = 'A';
    else if (totalScore >= 65) grade = 'B+';
    else if (totalScore >= 55) grade = 'B';
    else if (totalScore >= 45) grade = 'C';
    else if (totalScore >= 35) grade = 'D';
    else grade = 'F';

    // 推荐
    let recommendation: QuantScoreResult['recommendation'];
    if (totalScore >= 80) recommendation = 'strong_buy';
    else if (totalScore >= 65) recommendation = 'buy';
    else if (totalScore >= 45) recommendation = 'hold';
    else if (totalScore >= 30) recommendation = 'sell';
    else recommendation = 'strong_sell';

    return {
      symbol: factors.symbol,
      totalScore,
      grade,
      factors: factorScores,
      recommendation,
    };
  }

  /**
   * 批量评分
   */
  batchScore(stocks: StockFactors[]): QuantScoreResult[] {
    return stocks.map(s => this.scoreStock(s)).sort((a, b) => b.totalScore - a.totalScore);
  }

  updateConfig(config: Partial<FactorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const quantFactorEngine = new QuantFactorEngine();
export default QuantFactorEngine;
