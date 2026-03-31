/**
 * 流动性评分引擎
 * 综合流动性评估: Amihud、成交量、换手率、买卖价差、市场深度
 */

export interface LiquidityMetrics {
  turnoverRate: number; // 换手率
  amihudRatio: number; // Amihud 非流动性
  volumeConsistency: number; // 成交量稳定性
  priceImpact: number; // 价格冲击
  bidAskSpread: number; // 买卖价差（估计）
  depthScore: number; // 深度评分
  resilienceScore: number; // 弹性评分
}

export interface LiquidityScore {
  totalScore: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  metrics: LiquidityMetrics;
  factorScores: {
    volume: number;
    turnover: number;
    priceImpact: number;
    consistency: number;
    spread: number;
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  tradingRecommendation: string;
}

export interface LiquidityTrend {
  date: string;
  score: number;
  trend: 'improving' | 'stable' | 'deteriorating';
  ma5: number;
  ma20: number;
}

export interface CrossSectionLiquidity {
  name: string;
  rank: number;
  score: number;
  percentile: number;
  isOutlier: boolean;
}

/**
 * 计算 Amihud 非流动性比率
 */
export function calculateAmihud(
  returns: number[],
  volumes: number[],
  prices: number[]
): number[] {
  const result: number[] = [];

  for (let i = 0; i < returns.length; i++) {
    const dollarVolume = prices[i] * volumes[i];
    if (dollarVolume > 0) {
      result.push(Math.abs(returns[i]) / dollarVolume);
    } else {
      result.push(0);
    }
  }

  return result;
}

/**
 * 计算换手率
 */
export function calculateTurnoverRate(
  volumes: number[],
  totalShares: number[]
): number[] {
  return volumes.map((v, i) => totalShares[i] > 0 ? v / totalShares[i] : 0);
}

/**
 * 估计买卖价差（Roll 模型）
 */
export function estimateBidAskSpread(returns: number[]): number {
  if (returns.length < 2) return 0;

  // Roll (1984): Cov(Δp_t, Δp_{t-1}) ≈ -s²/4
  let sumProduct = 0;
  let meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

  for (let i = 1; i < returns.length; i++) {
    sumProduct += (returns[i] - meanReturn) * (returns[i - 1] - meanReturn);
  }

  const covariance = sumProduct / (returns.length - 1);

  // 如果协方差为负，估计价差
  if (covariance < 0) {
    return Math.sqrt(-4 * covariance);
  }

  return 0;
}

/**
 * 计算流动性评分
 */
export function calculateLiquidityScore(
  data: {
    dailyVolume: number[];
    dailyReturn: number[];
    dailyPrice: number[];
    totalShares: number[];
    avgSpread?: number;
    marketDepth?: number;
  }
): LiquidityScore {
  const { dailyVolume, dailyReturn, dailyPrice, totalShares, avgSpread, marketDepth } = data;
  const n = dailyVolume.length;

  if (n === 0) {
    return {
      totalScore: 0, grade: 'E',
      metrics: {
        turnoverRate: 0, amihudRatio: 0, volumeConsistency: 0,
        priceImpact: 0, bidAskSpread: 0, depthScore: 0, resilienceScore: 0,
      },
      factorScores: { volume: 0, turnover: 0, priceImpact: 0, consistency: 0, spread: 0 },
      riskLevel: 'critical',
      tradingRecommendation: '数据不足，无法评估',
    };
  }

  // 成交量指标
  const avgVolume = dailyVolume.reduce((a, b) => a + b, 0) / n;
  const volumeStd = Math.sqrt(
    dailyVolume.reduce((a, b) => a + (b - avgVolume) ** 2, 0) / n
  );
  const volumeCV = avgVolume > 0 ? volumeStd / avgVolume : 1;
  const volumeConsistency = Math.max(0, 100 - volumeCV * 100);

  // 成交量评分 (log scale, 相对化)
  const volumeScore = Math.min(100, Math.log10(avgVolume + 1) * 15);

  // 换手率
  const turnoverRates = dailyVolume.map((v, i) =>
    totalShares[i] > 0 ? v / totalShares[i] : 0
  );
  const avgTurnover = turnoverRates.reduce((a, b) => a + b, 0) / n;
  const turnoverScore = Math.min(100, avgTurnover * 5000); // 2%换手率=100分

  // Amihud 非流动性
  const amihudValues = calculateAmihud(dailyReturn, dailyVolume, dailyPrice);
  const avgAmihud = amihudValues.reduce((a, b) => a + b, 0) / n;
  // 评分: Amihud 越低越好
  const amihudScore = Math.max(0, 100 - avgAmihud * 1e8);

  // 价格冲击
  let priceImpact = 0;
  for (let i = 1; i < n; i++) {
    if (dailyVolume[i] > 0) {
      priceImpact += Math.abs(dailyReturn[i]) / dailyVolume[i];
    }
  }
  priceImpact /= (n - 1);
  const priceImpactScore = Math.max(0, 100 - priceImpact * 1e6);

  // 价差估计
  const spread = avgSpread ?? estimateBidAskSpread(dailyReturn);
  const spreadScore = Math.max(0, 100 - spread * 10000);

  // 深度
  const depthScore = marketDepth ? Math.min(100, marketDepth / 1000) : 50;

  // 弹性（价格偏离均值后回归的速度）
  const prices = dailyPrice;
  const ma20: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < 19) { ma20.push(NaN); continue; }
    ma20.push(prices.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20);
  }
  let recoveryCount = 0;
  let extremeCount = 0;
  for (let i = 20; i < prices.length; i++) {
    if (isNaN(ma20[i])) continue;
    const dev = Math.abs(prices[i] - ma20[i]) / ma20[i];
    if (dev > 0.03) {
      extremeCount++;
      if (i < prices.length - 5) {
        const futureDev = Math.abs(prices[i + 5] - ma20[i]) / ma20[i];
        if (futureDev < dev) recoveryCount++;
      }
    }
  }
  const resilienceScore = extremeCount > 0 ? (recoveryCount / extremeCount) * 100 : 50;

  // 因子评分
  const factorScores = {
    volume: Math.round(volumeScore),
    turnover: Math.round(turnoverScore),
    priceImpact: Math.round(priceImpactScore),
    consistency: Math.round(volumeConsistency),
    spread: Math.round(spreadScore),
  };

  // 综合评分
  const totalScore = Math.round(
    factorScores.volume * 0.25 +
    factorScores.turnover * 0.2 +
    factorScores.priceImpact * 0.2 +
    factorScores.consistency * 0.15 +
    factorScores.spread * 0.2
  );

  // 评级
  let grade: LiquidityScore['grade'];
  if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 60) grade = 'B';
  else if (totalScore >= 40) grade = 'C';
  else if (totalScore >= 20) grade = 'D';
  else grade = 'E';

  // 风险等级
  let riskLevel: LiquidityScore['riskLevel'];
  if (totalScore >= 70) riskLevel = 'low';
  else if (totalScore >= 45) riskLevel = 'medium';
  else if (totalScore >= 20) riskLevel = 'high';
  else riskLevel = 'critical';

  // 交易建议
  let tradingRecommendation = '';
  if (grade === 'A') tradingRecommendation = '流动性充足，可大额交易';
  else if (grade === 'B') tradingRecommendation = '流动性良好，注意交易时机';
  else if (grade === 'C') tradingRecommendation = '流动性一般，建议分批交易';
  else if (grade === 'D') tradingRecommendation = '流动性较差，控制单笔交易量';
  else tradingRecommendation = '流动性极差，谨慎交易';

  const metrics: LiquidityMetrics = {
    turnoverRate: Math.round(avgTurnover * 10000) / 10000,
    amihudRatio: Math.round(avgAmihud * 1e10) / 1e10,
    volumeConsistency: Math.round(volumeConsistency * 10) / 10,
    priceImpact: Math.round(priceImpact * 1e8) / 1e8,
    bidAskSpread: Math.round(spread * 10000) / 10000,
    depthScore: Math.round(depthScore),
    resilienceScore: Math.round(resilienceScore),
  };

  return {
    totalScore,
    grade,
    metrics,
    factorScores,
    riskLevel,
    tradingRecommendation,
  };
}

/**
 * 计算流动性趋势
 */
export function calculateLiquidityTrend(
  scores: number[],
  dates: string[]
): LiquidityTrend[] {
  const result: LiquidityTrend[] = [];

  for (let i = 0; i < scores.length; i++) {
    // MA5
    const ma5Start = Math.max(0, i - 4);
    const ma5Slice = scores.slice(ma5Start, i + 1);
    const ma5 = ma5Slice.reduce((a, b) => a + b, 0) / ma5Slice.length;

    // MA20
    const ma20Start = Math.max(0, i - 19);
    const ma20Slice = scores.slice(ma20Start, i + 1);
    const ma20 = ma20Slice.reduce((a, b) => a + b, 0) / ma20Slice.length;

    let trend: LiquidityTrend['trend'] = 'stable';
    if (ma5 > ma20 * 1.05) trend = 'improving';
    else if (ma5 < ma20 * 0.95) trend = 'deteriorating';

    result.push({
      date: dates[i] || `day_${i}`,
      score: scores[i],
      trend,
      ma5: Math.round(ma5 * 10) / 10,
      ma20: Math.round(ma20 * 10) / 10,
    });
  }

  return result;
}

/**
 * 截面流动性排名
 */
export function crossSectionLiquidityRanking(
  stocks: { name: string; score: number }[]
): CrossSectionLiquidity[] {
  const sorted = [...stocks].sort((a, b) => b.score - a.score);
  const scores = stocks.map(s => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);

  return sorted.map((s, i) => {
    const percentile = ((stocks.length - i - 1) / stocks.length) * 100;
    const zScore = std > 0 ? (s.score - mean) / std : 0;
    return {
      name: s.name,
      rank: i + 1,
      score: s.score,
      percentile: Math.round(percentile * 10) / 10,
      isOutlier: Math.abs(zScore) > 2,
    };
  });
}
