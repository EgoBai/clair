/**
 * 基本面+量化结合引擎 (Quantamental)
 * - 基本面信号量化
 * - 估值+动量+质量融合
 * - 信号权重优化
 * - 综合投资评分
 * - 风险预算分配
 */
export interface QuantamentalInput {
  symbol: string;
  // 估值
  pe: number;
  pb: number;
  pePercentile: number;
  pbPercentile: number;
  // 质量
  roe: number;
  grossMargin: number;
  debtToEquity: number;
  cashFlowYield: number;
  // 成长
  revenueGrowth: number;
  profitGrowth: number;
  // 动量
  priceReturn3m: number;
  priceReturn6m: number;
  rsRating: number; // 0-100
  // 情绪
  analystConsensus: number; // 0-100
  insiderActivity: number; // -1 to 1
  // 风险
  volatility: number;
  beta: number;
  maxDrawdown: number;
}

export interface QuantamentalResult {
  symbol: string;
  valueScore: number;
  qualityScore: number;
  growthScore: number;
  momentumScore: number;
  sentimentScore: number;
  compositeScore: number;
  signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  riskBudget: number; // 建议仓位比例
  factorContributions: { factor: string; score: number; weight: number; contribution: number }[];
  convictionLevel: 'high' | 'moderate' | 'low';
  insights: string[];
}

export function quantamentalScreen(stocks: QuantamentalInput[]): QuantamentalResult[] {
  const _insights_global: string[] = [];

  const results = stocks.map(stock => {
    const insights: string[] = [];

    // 价值评分
    const valueScore = Math.round(
      (1 - stock.pePercentile) * 40 +
      (1 - stock.pbPercentile) * 30 +
      (stock.cashFlowYield > 0.05 ? 15 : stock.cashFlowYield > 0 ? 10 : 0) +
      (stock.pe < 15 ? 15 : stock.pe < 25 ? 10 : 0)
    );

    // 质量评分
    const qualityScore = Math.round(
      Math.min(40, stock.roe * 200) +
      Math.min(25, stock.grossMargin * 50) +
      (stock.debtToEquity < 0.5 ? 20 : stock.debtToEquity < 1 ? 10 : 0) +
      (stock.cashFlowYield > 0.08 ? 15 : 5)
    );

    // 成长评分
    const growthScore = Math.round(
      Math.min(50, stock.revenueGrowth * 100) +
      Math.min(50, stock.profitGrowth * 100)
    );

    // 动量评分
    const momentumScore = Math.round(
      (stock.priceReturn3m * 30 + stock.priceReturn6m * 20 + stock.rsRating * 0.5)
    );

    // 情绪评分
    const sentimentScore = Math.round(
      stock.analystConsensus * 0.6 +
      (stock.insiderActivity + 1) * 50 * 0.4
    );

    // 综合评分
    const compositeScore = Math.round(
      valueScore * 0.25 +
      qualityScore * 0.25 +
      growthScore * 0.2 +
      momentumScore * 0.15 +
      sentimentScore * 0.15
    );

    // 信号
    let signal: QuantamentalResult['signal'];
    if (compositeScore >= 75) signal = 'strong_buy';
    else if (compositeScore >= 60) signal = 'buy';
    else if (compositeScore >= 40) signal = 'hold';
    else if (compositeScore >= 25) signal = 'sell';
    else signal = 'strong_sell';

    // 风险预算
    const riskAdjusted = compositeScore / Math.max(stock.volatility * 100, 10);
    const riskBudget = Math.min(0.2, Math.max(0.01, riskAdjusted / 500));

    // 信念等级
    let convictionLevel: QuantamentalResult['convictionLevel'];
    if (valueScore > 70 && qualityScore > 70 && momentumScore > 50) convictionLevel = 'high';
    else if (compositeScore > 50) convictionLevel = 'moderate';
    else convictionLevel = 'low';

    if (valueScore > 70) insights.push('估值具有吸引力');
    if (qualityScore > 70) insights.push('基本面质量优秀');
    if (momentumScore < 30) insights.push('动量偏弱，需观察');

    const factorContributions = [
      { factor: '价值', score: valueScore, weight: 0.25, contribution: valueScore * 0.25 },
      { factor: '质量', score: qualityScore, weight: 0.25, contribution: qualityScore * 0.25 },
      { factor: '成长', score: growthScore, weight: 0.2, contribution: growthScore * 0.2 },
      { factor: '动量', score: momentumScore, weight: 0.15, contribution: momentumScore * 0.15 },
      { factor: '情绪', score: sentimentScore, weight: 0.15, contribution: sentimentScore * 0.15 },
    ];

    return {
      symbol: stock.symbol,
      valueScore: Math.max(0, Math.min(100, valueScore)),
      qualityScore: Math.max(0, Math.min(100, qualityScore)),
      growthScore: Math.max(0, Math.min(100, growthScore)),
      momentumScore: Math.max(0, Math.min(100, momentumScore)),
      sentimentScore: Math.max(0, Math.min(100, sentimentScore)),
      compositeScore: Math.max(0, Math.min(100, compositeScore)),
      signal,
      riskBudget: Math.round(riskBudget * 10000) / 10000,
      factorContributions,
      convictionLevel,
      insights,
    };
  });

  return results.sort((a, b) => b.compositeScore - a.compositeScore);
}
