/**
 * 融券/做空兴趣引擎
 * - 融券余额分析
 * - 做空比例(Days to Cover)
 * - 空头挤压信号
 * - 做空趋势
 * - 风险预警
 */
export interface ShortInterestData {
  symbol: string;
  shortShares: number; // 融券余量
  totalShares: number; // 总股本
  avgDailyVolume: number; // 日均成交量
  shortRatioHistory: { date: string; ratio: number }[]; // 融券比例历史
  priceHistory: { date: string; close: number }[]; // 价格历史
  borrowCost: number; // 融券费率(%)
  availableShares: number; // 可融券数量
}

export interface ShortInterestResult {
  symbol: string;
  shortRatio: number; // 融券比例
  daysToCover: number; // 覆盖天数
  shortTrend: 'increasing' | 'stable' | 'decreasing';
  squeezeRisk: 'low' | 'moderate' | 'high' | 'extreme';
  borrowCostLevel: 'low' | 'moderate' | 'high';
  shortSqueezeSignal: boolean;
  sentiment: 'bearish' | 'neutral' | 'bullish';
  riskScore: number; // 0-100
  insights: string[];
}

export function analyzeShortInterest(data: ShortInterestData): ShortInterestResult {
  const insights: string[] = [];

  // 融券比例
  const shortRatio = data.totalShares > 0 ? data.shortShares / data.totalShares : 0;
  if (shortRatio > 0.15) insights.push('融券比例超过15%，做空兴趣浓厚');
  else if (shortRatio > 0.1) insights.push('融券比例超过10%');

  // 覆盖天数
  const daysToCover = data.avgDailyVolume > 0 ? data.shortShares / data.avgDailyVolume : 0;
  if (daysToCover > 10) insights.push(`需要${Math.round(daysToCover)}天才能回补所有空头`);

  // 做空趋势
  const ratios = data.shortRatioHistory.map(h => h.ratio);
  let shortTrend: ShortInterestResult['shortTrend'];
  if (ratios.length >= 2) {
    const recent = ratios.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, ratios.length);
    const older = ratios.slice(0, Math.min(3, ratios.length)).reduce((s, v) => s + v, 0) / Math.min(3, ratios.length);
    if (recent > older * 1.1) { shortTrend = 'increasing'; insights.push('做空兴趣增加'); }
    else if (recent < older * 0.9) { shortTrend = 'decreasing'; insights.push('做空兴趣减少'); }
    else shortTrend = 'stable';
  } else {
    shortTrend = 'stable';
  }

  // 空头挤压风险
  let squeezeRisk: ShortInterestResult['squeezeRisk'];
  if (shortRatio > 0.2 && daysToCover > 10) { squeezeRisk = 'extreme'; insights.push('空头挤压风险极高'); }
  else if (shortRatio > 0.15 && daysToCover > 7) squeezeRisk = 'high';
  else if (shortRatio > 0.1 && daysToCover > 5) squeezeRisk = 'moderate';
  else squeezeRisk = 'low';

  // 融券费率
  let borrowCostLevel: ShortInterestResult['borrowCostLevel'];
  if (data.borrowCost > 10) { borrowCostLevel = 'high'; insights.push('融券费率极高'); }
  else if (data.borrowCost > 3) borrowCostLevel = 'moderate';
  else borrowCostLevel = 'low';

  // 空头挤压信号
  const prices = data.priceHistory.map(p => p.close);
  const recentPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
  const olderPrice = prices.length > 5 ? prices[prices.length - 6] : recentPrice;
  const priceRise = olderPrice > 0 ? (recentPrice - olderPrice) / olderPrice : 0;

  const shortSqueezeSignal = shortRatio > 0.15 && daysToCover > 5 && priceRise > 0.05;
  if (shortSqueezeSignal) insights.push('可能发生空头挤压');

  // 情绪
  let sentiment: ShortInterestResult['sentiment'];
  if (shortRatio > 0.15) sentiment = 'bearish';
  else if (shortRatio < 0.05) sentiment = 'bullish';
  else sentiment = 'neutral';

  // 风险评分
  let risk = 50;
  risk += shortRatio * 100;
  risk += Math.min(20, daysToCover * 2);
  if (squeezeRisk === 'extreme') risk += 20;
  else if (squeezeRisk === 'high') risk += 10;
  if (borrowCostLevel === 'high') risk += 10;
  risk = Math.max(0, Math.min(100, Math.round(risk)));

  return {
    symbol: data.symbol,
    shortRatio: Math.round(shortRatio * 10000) / 10000,
    daysToCover: Math.round(daysToCover * 10) / 10,
    shortTrend,
    squeezeRisk,
    borrowCostLevel,
    shortSqueezeSignal,
    sentiment,
    riskScore: risk,
    insights,
  };
}
