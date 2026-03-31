/**
 * 基本面量化筛选引擎
 * - 价值因子(PE/PB/PS/PCF)
 * - 质量因子(ROE/毛利率/现金流)
 * - 成长因子(收入/利润增长率)
 * - 动量因子(价格动量/盈利动量)
 * - 综合评分排名
 */
export interface FundamentalData {
  symbol: string;
  pe: number;
  pb: number;
  ps: number;
  pcf: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  revenueGrowth: number;
  profitGrowth: number;
  debtToEquity: number;
  currentRatio: number;
  operatingCashFlow: number;
  netProfit: number;
  dividendYield: number;
  priceReturn6m: number; // 6个月价格收益率
  priceReturn12m: number; // 12个月价格收益率
  earningsSurprise: number; // 盈利超预期程度
}

export interface QuantScoreResult {
  symbol: string;
  valueScore: number; // 0-100
  qualityScore: number; // 0-100
  growthScore: number; // 0-100
  momentumScore: number; // 0-100
  totalScore: number; // 0-100
  rank: number;
  percentile: number;
  factorBreakdown: { factor: string; score: number; weight: number }[];
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
}

export function quantScreening(stocks: FundamentalData[]): QuantScoreResult[] {
  if (stocks.length === 0) return [];

  // 计算百分位排名辅助函数
  const percentileRank = (values: number[], value: number, reverse = false): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const idx = sorted.indexOf(value);
    const rank = idx / Math.max(sorted.length - 1, 1);
    return reverse ? 1 - rank : rank;
  };

  const results: QuantScoreResult[] = [];

  for (const stock of stocks) {
    // 价值因子 (越低越好)
    const pePercentile = percentileRank(stocks.map(s => s.pe), stock.pe, true);
    const pbPercentile = percentileRank(stocks.map(s => s.pb), stock.pb, true);
    const psPercentile = percentileRank(stocks.map(s => s.ps), stock.ps, true);
    const pcfPercentile = percentileRank(stocks.map(s => s.pcf), stock.pcf, true);
    const valueScore = Math.round((pePercentile * 0.35 + pbPercentile * 0.25 + psPercentile * 0.2 + pcfPercentile * 0.2) * 100);

    // 质量因子 (越高越好)
    const roePercentile = percentileRank(stocks.map(s => s.roe), stock.roe);
    const gmPercentile = percentileRank(stocks.map(s => s.grossMargin), stock.grossMargin);
    const nmPercentile = percentileRank(stocks.map(s => s.netMargin), stock.netMargin);
    const cfPercentile = percentileRank(stocks.map(s => s.operatingCashFlow / Math.max(s.netProfit, 1)), stock.operatingCashFlow / Math.max(stock.netProfit, 1));
    const qualityScore = Math.round((roePercentile * 0.35 + gmPercentile * 0.25 + nmPercentile * 0.25 + cfPercentile * 0.15) * 100);

    // 成长因子
    const revGrowthPct = percentileRank(stocks.map(s => s.revenueGrowth), stock.revenueGrowth);
    const profGrowthPct = percentileRank(stocks.map(s => s.profitGrowth), stock.profitGrowth);
    const surprisePct = percentileRank(stocks.map(s => s.earningsSurprise), stock.earningsSurprise);
    const growthScore = Math.round((revGrowthPct * 0.3 + profGrowthPct * 0.4 + surprisePct * 0.3) * 100);

    // 动量因子
    const mom6Pct = percentileRank(stocks.map(s => s.priceReturn6m), stock.priceReturn6m);
    const mom12Pct = percentileRank(stocks.map(s => s.priceReturn12m), stock.priceReturn12m);
    const momentumScore = Math.round((mom6Pct * 0.6 + mom12Pct * 0.4) * 100);

    // 综合评分
    const totalScore = Math.round(valueScore * 0.3 + qualityScore * 0.3 + growthScore * 0.25 + momentumScore * 0.15);

    const factorBreakdown = [
      { factor: '价值', score: valueScore, weight: 0.3 },
      { factor: '质量', score: qualityScore, weight: 0.3 },
      { factor: '成长', score: growthScore, weight: 0.25 },
      { factor: '动量', score: momentumScore, weight: 0.15 },
    ];

    let recommendation: QuantScoreResult['recommendation'];
    if (totalScore >= 80) recommendation = 'strong_buy';
    else if (totalScore >= 65) recommendation = 'buy';
    else if (totalScore >= 40) recommendation = 'hold';
    else if (totalScore >= 25) recommendation = 'sell';
    else recommendation = 'strong_sell';

    results.push({
      symbol: stock.symbol,
      valueScore,
      qualityScore,
      growthScore,
      momentumScore,
      totalScore,
      rank: 0,
      percentile: 0,
      factorBreakdown,
      recommendation,
    });
  }

  // 排名
  results.sort((a, b) => b.totalScore - a.totalScore);
  results.forEach((r, i) => {
    r.rank = i + 1;
    r.percentile = Math.round((1 - i / Math.max(results.length - 1, 1)) * 100);
  });

  return results;
}
