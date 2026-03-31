/**
 * 流动性风险引擎
 * - 买卖价差分析
 * - 市场冲击成本估计
 * - Amihud非流动性指标
 * - Turnover率分析
 * - 流动性集中度
 * - 大单执行风险
 * - 流动性评分
 */

export interface SpreadAnalysis {
  avgSpread: number; // 平均价差(元)
  avgSpreadPct: number; // 平均价差(%)
  effectiveSpread: number;
  realizedSpread: number;
  spreadVolatility: number;
}

export interface MarketImpact {
  temporaryImpact: number; // 临时冲击(bp)
  permanentImpact: number; // 永久冲击(bp)
  totalCost: number; // 总交易成本(bp)
  executionRisk: number; // 执行风险
}

export interface AmihudIlliquidity {
  dailyAmihud: number; // 日均非流动性
  rollingAmihud: number; // 滚动非流动性
  illiquidityPercentile: number; // 历史分位数
  isIlliquid: boolean;
}

export interface TurnoverAnalysis {
  avgTurnover: number;
  turnoverVolatility: number;
  turnoverTrend: 'increasing' | 'stable' | 'decreasing';
  freeFloatTurnover: number;
  turnoverStability: number; // 0-1
}

export interface LargeOrderRisk {
  participationRate: number; // 参与率(%)
  estimatedCompletionTime: number; // 预计完成时间(分钟)
  priceImpact: number; // 预计价格冲击(bp)
  slippageRisk: number; // 滑点风险(0-100)
  recommendation: 'market' | 'limit' | 'twap' | 'vwap' | 'iceberg';
}

export interface LiquidityScore {
  overallScore: number; // 0-100
  spreadScore: number;
  depthScore: number;
  turnoverScore: number;
  resilienceScore: number; // 恢复能力
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export class LiquidityRiskEngine {
  /**
   * 分析买卖价差
   */
  analyzeSpreads(
    bidPrices: number[],
    askPrices: number[],
    midPrices: number[],
  ): SpreadAnalysis {
    if (bidPrices.length < 2) {
      return { avgSpread: 0, avgSpreadPct: 0, effectiveSpread: 0, realizedSpread: 0, spreadVolatility: 0 };
    }

    const spreads = bidPrices.map((bid, i) => askPrices[i] - bid);
    const spreadPcts = midPrices.map((mid, i) => mid > 0 ? spreads[i] / mid : 0);

    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const avgSpreadPct = spreadPcts.reduce((a, b) => a + b, 0) / spreadPcts.length * 100;

    // 有效价差 = 2 * |成交价 - 中间价|
    const effectiveSpread = avgSpread * 2;

    // 实现价差 ≈ 有效价差的一半(流动性提供者利润)
    const realizedSpread = effectiveSpread * 0.5;

    // 价差波动率
    const spreadMean = avgSpread;
    const spreadVol = Math.sqrt(spreads.reduce((s, sp) => s + (sp - spreadMean) ** 2, 0) / spreads.length);

    return {
      avgSpread: Math.round(avgSpread * 10000) / 10000,
      avgSpreadPct: Math.round(avgSpreadPct * 10000) / 10000,
      effectiveSpread: Math.round(effectiveSpread * 10000) / 10000,
      realizedSpread: Math.round(realizedSpread * 10000) / 10000,
      spreadVolatility: Math.round(spreadVol * 10000) / 10000,
    };
  }

  /**
   * 市场冲击成本估计
   */
  estimateMarketImpact(
    orderSize: number,
    avgDailyVolume: number,
    volatility: number,
    spread: number,
  ): MarketImpact {
    // Kyle's Lambda: 临时冲击 ∝ σ * √(Q/V)
    const participationRate = orderSize / avgDailyVolume;
    const temporaryImpact = volatility * Math.sqrt(participationRate) * 10000; // bp
    const permanentImpact = temporaryImpact * 0.3; // 永久冲击约为临时冲击的30%

    // 总成本 = 临时冲击 + 价差/2
    const totalCost = temporaryImpact + (spread / 2) * 10000;

    // 执行风险: 波动率 × 时间
    const estimatedTime = participationRate * 390; // 假设390分钟交易日
    const executionRisk = volatility * Math.sqrt(estimatedTime / 390) * 10000;

    return {
      temporaryImpact: Math.round(temporaryImpact * 100) / 100,
      permanentImpact: Math.round(permanentImpact * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      executionRisk: Math.round(executionRisk * 100) / 100,
    };
  }

  /**
   * Amihud非流动性指标
   */
  calcAmihudIlliquidity(
    returns: number[],
    volumes: number[],
    prices: number[],
    lookback: number = 20,
  ): AmihudIlliquidity {
    if (returns.length < lookback || volumes.length < lookback) {
      return { dailyAmihud: 0, rollingAmihud: 0, illiquidityPercentile: 50, isIlliquid: false };
    }

    // Amihud = |return| / (volume * price)
    const dailyAmihuds: number[] = [];
    for (let i = 0; i < returns.length; i++) {
      const dollarVolume = volumes[i] * prices[i];
      dailyAmihuds.push(dollarVolume > 0 ? Math.abs(returns[i]) / dollarVolume : 0);
    }

    const dailyAmihud = dailyAmihuds.reduce((a, b) => a + b, 0) / dailyAmihuds.length;
    const rollingAmihud = dailyAmihuds.slice(-lookback).reduce((a, b) => a + b, 0) / lookback;

    // 百分位
    const sorted = [...dailyAmihuds].sort((a, b) => a - b);
    const rank = sorted.filter(v => v <= rollingAmihud).length;
    const percentile = (rank / sorted.length) * 100;

    return {
      dailyAmihud: Math.round(dailyAmihud * 1e10) / 1e10,
      rollingAmihud: Math.round(rollingAmihud * 1e10) / 1e10,
      illiquidityPercentile: Math.round(percentile * 10) / 10,
      isIlliquid: percentile > 80,
    };
  }

  /**
   * 换手率分析
   */
  analyzeTurnover(
    turnovers: number[],
    freeFloatShares: number[],
  ): TurnoverAnalysis {
    if (turnovers.length < 5) {
      return { avgTurnover: 0, turnoverVolatility: 0, turnoverTrend: 'stable', freeFloatTurnover: 0, turnoverStability: 0.5 };
    }

    const avgTurnover = turnovers.reduce((a, b) => a + b, 0) / turnovers.length;
    const stdTurnover = Math.sqrt(turnovers.reduce((s, t) => s + (t - avgTurnover) ** 2, 0) / turnovers.length);

    // 趋势: 前半 vs 后半
    const mid = Math.floor(turnovers.length / 2);
    const firstHalf = turnovers.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalf = turnovers.slice(mid).reduce((a, b) => a + b, 0) / (turnovers.length - mid);

    let turnoverTrend: TurnoverAnalysis['turnoverTrend'];
    if (secondHalf > firstHalf * 1.2) turnoverTrend = 'increasing';
    else if (secondHalf < firstHalf * 0.8) turnoverTrend = 'decreasing';
    else turnoverTrend = 'stable';

    // 自由流通换手率
    const freeFloatTurnover = freeFloatShares.length > 0
      ? turnovers.reduce((a, b) => a + b, 0) / turnovers.length
      : avgTurnover;

    // 稳定性: 1 - CV
    const turnoverStability = avgTurnover > 0 ? Math.max(0, 1 - stdTurnover / avgTurnover) : 0.5;

    return {
      avgTurnover: Math.round(avgTurnover * 10000) / 10000,
      turnoverVolatility: Math.round(stdTurnover * 10000) / 10000,
      turnoverTrend,
      freeFloatTurnover: Math.round(freeFloatTurnover * 10000) / 10000,
      turnoverStability: Math.round(turnoverStability * 100) / 100,
    };
  }

  /**
   * 大单执行风险评估
   */
  assessLargeOrderRisk(
    orderSize: number,
    avgDailyVolume: number,
    volatility: number,
    spreadPct: number,
  ): LargeOrderRisk {
    const participationRate = (orderSize / avgDailyVolume) * 100;
    const estimatedCompletionTime = Math.max(5, participationRate * 3.9); // 390分钟交易日
    const priceImpact = volatility * Math.sqrt(orderSize / avgDailyVolume) * 10000;
    const slippageRisk = Math.min(100, participationRate * 5 + spreadPct * 100);

    let recommendation: LargeOrderRisk['recommendation'];
    if (participationRate < 1) recommendation = 'limit';
    else if (participationRate < 5) recommendation = 'vwap';
    else if (participationRate < 15) recommendation = 'twap';
    else if (participationRate < 30) recommendation = 'iceberg';
    else recommendation = 'twap';

    return {
      participationRate: Math.round(participationRate * 100) / 100,
      estimatedCompletionTime: Math.round(estimatedCompletionTime * 10) / 10,
      priceImpact: Math.round(priceImpact * 100) / 100,
      slippageRisk: Math.round(slippageRisk * 100) / 100,
      recommendation,
    };
  }

  /**
   * 流动性综合评分
   */
  calcLiquidityScore(
    spreadPct: number,
    avgVolume: number,
    turnover: number,
    volatility: number,
  ): LiquidityScore {
    // 价差评分(越小越好)
    const spreadScore = Math.max(0, 100 - spreadPct * 1000);

    // 深度评分(成交量)
    const depthScore = Math.min(100, Math.log10(avgVolume + 1) * 20);

    // 换手率评分
    const turnoverScore = Math.min(100, turnover * 1000);

    // 恢复能力: 波动率适中最好
    const resilienceScore = volatility > 0.005 && volatility < 0.03
      ? 100 - Math.abs(volatility - 0.015) * 3000
      : Math.max(0, 50 - Math.abs(volatility - 0.015) * 3000);

    const overallScore = spreadScore * 0.3 + depthScore * 0.3 + turnoverScore * 0.2 + resilienceScore * 0.2;

    let grade: LiquidityScore['grade'];
    if (overallScore > 80) grade = 'A';
    else if (overallScore > 60) grade = 'B';
    else if (overallScore > 40) grade = 'C';
    else if (overallScore > 20) grade = 'D';
    else grade = 'F';

    return {
      overallScore: Math.round(overallScore * 10) / 10,
      spreadScore: Math.round(spreadScore * 10) / 10,
      depthScore: Math.round(depthScore * 10) / 10,
      turnoverScore: Math.round(turnoverScore * 10) / 10,
      resilienceScore: Math.round(Math.max(0, resilienceScore) * 10) / 10,
      grade,
    };
  }
}

export default new LiquidityRiskEngine();
