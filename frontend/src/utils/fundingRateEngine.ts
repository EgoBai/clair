/**
 * 资金费率分析引擎 - 期货/永续合约资金费率/持仓量/多空比
 */

export interface FundingRateData {
  ticker: string;
  date: string;
  fundingRate: number; // 资金费率(%)
  openInterest: number; // 持仓量
  longShortRatio: number; // 多空比
  markPrice: number;
  indexPrice: number;
  basis: number; // 基差
}

export interface FundingRateAnalysis {
  ticker: string;
  currentRate: number;
  avgRate7d: number;
  avgRate30d: number;
  annualizedRate: number;
  ratePercentile: number; // 历史分位
  trend: 'rising' | 'falling' | 'stable';
  sentiment: 'extreme_long' | 'long' | 'neutral' | 'short' | 'extreme_short';
  arbitrageOpportunity: boolean;
  arbitrageReturn: number; // 年化套利收益
  riskLevel: 'low' | 'moderate' | 'high';
  recommendation: string;
}

export interface OpenInterestAnalysis {
  ticker: string;
  currentOI: number;
  oiChange24h: number; // 24h变化(%)
  oiChange7d: number;
  oiVsAvg: number; // vs30日均值
  oiSignal: 'building' | 'unwinding' | 'stable';
  liquidationRisk: number; // 爆仓风险 0-100
  maxPain: number; // 最大痛点价格
}

export interface LongShortSentiment {
  ticker: string;
  longShortRatio: number;
  topTraderLongRatio: number; // 大户多头比例
  retailLongRatio: number; // 散户多头比例
  divergence: boolean; // 大户散户分歧
  contrarianSignal: 'long' | 'short' | 'neutral';
  extremeReading: boolean;
}

/**
 * 分析资金费率
 */
export function analyzeFundingRate(history: FundingRateData[]): FundingRateAnalysis {
  const ticker = history[0]?.ticker || '';

  if (history.length === 0) {
    return {
      ticker, currentRate: 0, avgRate7d: 0, avgRate30d: 0, annualizedRate: 0,
      ratePercentile: 50, trend: 'stable', sentiment: 'neutral',
      arbitrageOpportunity: false, arbitrageReturn: 0, riskLevel: 'low',
      recommendation: '无数据',
    };
  }

  const rates = history.map(h => h.fundingRate);
  const currentRate = rates[rates.length - 1];

  const avgRate7d = rates.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, rates.length);
  const avgRate30d = rates.reduce((a, b) => a + b, 0) / rates.length;

  // 年化 (假设8小时结算一次, 一天3次)
  const annualizedRate = currentRate * 3 * 365;

  // 历史分位
  const sorted = [...rates].sort((a, b) => a - b);
  const ratePercentile = (sorted.filter(r => r <= currentRate).length / sorted.length) * 100;

  // 趋势
  const recent = rates.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const earlier = rates.slice(-7, -3).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(4, rates.length - 3));
  let trend: FundingRateAnalysis['trend'];
  if (recent > earlier * 1.3) trend = 'rising';
  else if (recent < earlier * 0.7) trend = 'falling';
  else trend = 'stable';

  // 市场情绪
  let sentiment: FundingRateAnalysis['sentiment'];
  if (currentRate > 0.1) sentiment = 'extreme_long';
  else if (currentRate > 0.03) sentiment = 'long';
  else if (currentRate < -0.1) sentiment = 'extreme_short';
  else if (currentRate < -0.03) sentiment = 'short';
  else sentiment = 'neutral';

  // 套利机会
  const arbitrageOpportunity = Math.abs(annualizedRate) > 10;
  const arbitrageReturn = Math.abs(annualizedRate);

  // 风险
  let riskLevel: FundingRateAnalysis['riskLevel'];
  if (Math.abs(currentRate) > 0.1) riskLevel = 'high';
  else if (Math.abs(currentRate) > 0.05) riskLevel = 'moderate';
  else riskLevel = 'low';

  let recommendation = '';
  if (sentiment === 'extreme_long') recommendation = '资金费率极端偏多，考虑做空或套利';
  else if (sentiment === 'extreme_short') recommendation = '资金费率极端偏空，市场恐慌，可考虑做多';
  else if (arbitrageOpportunity) recommendation = `年化套利收益${annualizedRate.toFixed(1)}%，可进行资金费率套利`;
  else recommendation = '资金费率正常，无明显信号';

  return {
    ticker,
    currentRate: Math.round(currentRate * 10000) / 10000,
    avgRate7d: Math.round(avgRate7d * 10000) / 10000,
    avgRate30d: Math.round(avgRate30d * 10000) / 10000,
    annualizedRate: Math.round(annualizedRate * 100) / 100,
    ratePercentile: Math.round(ratePercentile),
    trend,
    sentiment,
    arbitrageOpportunity,
    arbitrageReturn: Math.round(arbitrageReturn * 100) / 100,
    riskLevel,
    recommendation,
  };
}

/**
 * 持仓量分析
 */
export function analyzeOpenInterest(history: FundingRateData[]): OpenInterestAnalysis {
  const ticker = history[0]?.ticker || '';

  if (history.length < 2) {
    return {
      ticker, currentOI: 0, oiChange24h: 0, oiChange7d: 0, oiVsAvg: 1,
      oiSignal: 'stable', liquidationRisk: 0, maxPain: 0,
    };
  }

  const ois = history.map(h => h.openInterest);
  const currentOI = ois[ois.length - 1];
  const oiChange24h = ((currentOI - ois[ois.length - 2]) / ois[ois.length - 2]) * 100;
  const oi7dAgo = ois.length > 7 ? ois[ois.length - 8] : ois[0];
  const oiChange7d = ((currentOI - oi7dAgo) / oi7dAgo) * 100;

  const avgOI = ois.reduce((a, b) => a + b, 0) / ois.length;
  const oiVsAvg = currentOI / avgOI;

  let oiSignal: OpenInterestAnalysis['oiSignal'];
  if (oiChange7d > 10) oiSignal = 'building';
  else if (oiChange7d < -10) oiSignal = 'unwinding';
  else oiSignal = 'stable';

  // 爆仓风险
  const avgLeverage = 10; // 假设平均10x杠杆
  const priceVol = history.slice(-7).map(h => h.markPrice);
  const maxPrice = Math.max(...priceVol);
  const minPrice = Math.min(...priceVol);
  const priceRange = (maxPrice - minPrice) / minPrice * 100;
  const liquidationRisk = Math.min(100, priceRange * avgLeverage / 2);

  // 最大痛点
  const maxPain = history[history.length - 1]?.markPrice || 0;

  return {
    ticker,
    currentOI: Math.round(currentOI),
    oiChange24h: Math.round(oiChange24h * 100) / 100,
    oiChange7d: Math.round(oiChange7d * 100) / 100,
    oiVsAvg: Math.round(oiVsAvg * 100) / 100,
    oiSignal,
    liquidationRisk: Math.round(liquidationRisk),
    maxPain: Math.round(maxPain * 100) / 100,
  };
}

/**
 * 多空情绪分析
 */
export function analyzeLongShortSentiment(history: FundingRateData[]): LongShortSentiment {
  const ticker = history[0]?.ticker || '';

  if (history.length === 0) {
    return {
      ticker, longShortRatio: 1, topTraderLongRatio: 0.5, retailLongRatio: 0.5,
      divergence: false, contrarianSignal: 'neutral', extremeReading: false,
    };
  }

  const ratios = history.map(h => h.longShortRatio);
  const longShortRatio = ratios[ratios.length - 1];

  // 大户 vs 散户 (简化: 用前20%和后20%模拟)
  const sorted = [...history].sort((a, b) => b.openInterest - a.openInterest);
  const topTraders = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.2)));
  const retail = sorted.slice(-Math.max(1, Math.floor(sorted.length * 0.2)));

  const topTraderLongRatio = topTraders.reduce((s, h) => s + h.longShortRatio, 0) / topTraders.length / (1 + topTraders.reduce((s, h) => s + h.longShortRatio, 0) / topTraders.length);
  const retailLongRatio = retail.reduce((s, h) => s + h.longShortRatio, 0) / retail.length / (1 + retail.reduce((s, h) => s + h.longShortRatio, 0) / retail.length);

  // 分歧
  const divergence = Math.abs(topTraderLongRatio - retailLongRatio) > 0.15;

  // 极端读数
  const extremeReading = longShortRatio > 3 || longShortRatio < 0.33;

  // 逆向信号
  let contrarianSignal: LongShortSentiment['contrarianSignal'];
  if (longShortRatio > 2 && topTraderLongRatio < retailLongRatio) contrarianSignal = 'short';
  else if (longShortRatio < 0.5 && topTraderLongRatio > retailLongRatio) contrarianSignal = 'long';
  else contrarianSignal = 'neutral';

  return {
    ticker,
    longShortRatio: Math.round(longShortRatio * 100) / 100,
    topTraderLongRatio: Math.round(topTraderLongRatio * 100) / 100,
    retailLongRatio: Math.round(retailLongRatio * 100) / 100,
    divergence,
    contrarianSignal,
    extremeReading,
  };
}
