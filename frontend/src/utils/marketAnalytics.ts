/**
 * 市场综合分析引擎
 * 集成板块轮动、资金流向、北向资金、涨跌停等多维度数据
 * 提供综合评分、信号判断、配置建议
 */

// ==================== 类型定义 ====================

export interface MarketAnalyticsConfig {
  weights: {
    breadth: number;      // 市场广度权重
    capitalFlow: number;  // 资金流向权重
    northbound: number;   // 北向资金权重
    sectorMomentum: number; // 板块动量权重
    sentiment: number;    // 市场情绪权重
    valuation: number;    // 估值权重
  };
  thresholds: {
    bullish: number;      // 综合评分牛市阈值
    bearish: number;      // 综合评分熊市阈值
    volatility: number;   // 波动率预警阈值
  };
  lookbackDays: number;
}

export interface MarketSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  sources: string[];
  confidence: number; // 0-1
  timestamp: number;
}

export interface SectorRecommendation {
  sector: string;
  score: number;
  momentum: number;
  capitalInflow: number;
  northboundChange: number;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  reasons: string[];
}

export interface MarketOverview {
  compositeScore: number; // 0-100
  signal: MarketSignal;
  topSectors: SectorRecommendation[];
  riskLevel: 'low' | 'medium' | 'high';
  trend: 'up' | 'down' | 'sideways';
  diversificationAdvice: string[];
}

export interface BreadthData {
  advanceCount: number;
  declineCount: number;
  unchangedCount: number;
  newHighs: number;
  newLows: number;
  advanceDeclineRatio: number;
  aboveMA50Percent: number;
  aboveMA200Percent: number;
}

export interface CapitalFlowData {
  mainNetInflow: number;
  retailNetInflow: number;
  largeOrderNetInflow: number;
  sectorFlows: Record<string, number>;
  trend: 'inflow' | 'outflow' | 'neutral';
}

export interface NorthboundData {
  totalNetBuy: number;
  dailyNetBuy: number;
  topHolds: Array<{ code: string; name: string; change: number }>;
  sectorExposure: Record<string, number>;
  trend: 'accumulating' | 'reducing' | 'stable';
}

export interface SectorMomentumData {
  sector: string;
  momentum: number; // -100 to 100
  priceChange5d: number;
  priceChange20d: number;
  volumeRatio: number;
  relativeStrength: number;
}

export interface SentimentData {
  limitUpCount: number;
  limitDownCount: number;
  consecutiveLimitUp: number;
  marketSentimentIndex: number; // 0-100
  fearGreedIndex: number; // 0-100
  putCallRatio: number;
}

export interface ValuationData {
  sector: string;
  peRatio: number;
  pbRatio: number;
  pePercentile: number; // 历史百分位 0-100
  pbPercentile: number;
  dividendYield: number;
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: MarketAnalyticsConfig = {
  weights: {
    breadth: 0.20,
    capitalFlow: 0.20,
    northbound: 0.15,
    sectorMomentum: 0.20,
    sentiment: 0.15,
    valuation: 0.10,
  },
  thresholds: {
    bullish: 65,
    bearish: 35,
    volatility: 30,
  },
  lookbackDays: 20,
};

// ==================== 核心函数 ====================

/**
 * 计算市场广度评分
 */
export function calculateBreadthScore(data: BreadthData): number {
  const total = data.advanceCount + data.declineCount + data.unchangedCount;
  if (total === 0) return 50;

  const advanceRatio = data.advanceCount / total;
  const adScore = Math.min(100, data.advanceDeclineRatio * 50);
  const newHighScore = total > 0 ? Math.min(100, (data.newHighs / total) * 500) : 0;
  const newLowPenalty = total > 0 ? Math.min(50, (data.newLows / total) * 500) : 0;
  const maScore = (data.aboveMA50Percent + data.aboveMA200Percent) / 2;

  const score = advanceRatio * 25 + adScore * 0.25 + newHighScore * 0.15
    - newLowPenalty * 0.1 + maScore * 0.25;

  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/**
 * 计算资金流向评分
 */
export function calculateCapitalFlowScore(data: CapitalFlowData): number {
  const totalFlow = data.mainNetInflow + data.largeOrderNetInflow;
  const flowScore = Math.min(50, Math.max(-50, totalFlow / 1e9)) + 50;
  const trendBonus = data.trend === 'inflow' ? 10 : data.trend === 'outflow' ? -10 : 0;
  const sectorInflows = Object.values(data.sectorFlows).filter(v => v > 0).length;
  const sectorTotal = Object.keys(data.sectorFlows).length || 1;
  const breadthScore = (sectorInflows / sectorTotal) * 20;

  const score = flowScore * 0.6 + trendBonus + breadthScore + 20;
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/**
 * 计算北向资金评分
 */
export function calculateNorthboundScore(data: NorthboundData): number {
  const flowScore = Math.min(40, Math.max(-40, data.totalNetBuy / 1e9)) + 40;
  const dailyScore = Math.min(30, Math.max(-30, data.dailyNetBuy / 1e8)) + 30;
  const trendBonus = data.trend === 'accumulating' ? 10 : data.trend === 'reducing' ? -10 : 0;

  const positiveHolds = data.topHolds.filter(h => h.change > 0).length;
  const holdScore = data.topHolds.length > 0 ? (positiveHolds / data.topHolds.length) * 20 : 10;

  const score = flowScore + dailyScore + trendBonus + holdScore;
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/**
 * 计算板块动量评分
 */
export function calculateSectorMomentumScore(sectors: SectorMomentumData[]): number {
  if (sectors.length === 0) return 50;

  const avgMomentum = sectors.reduce((sum, s) => sum + s.momentum, 0) / sectors.length;
  const momentumScore = (avgMomentum + 100) / 2;

  const avgRS = sectors.reduce((sum, s) => sum + s.relativeStrength, 0) / sectors.length;
  const rsScore = Math.min(30, Math.max(-30, avgRS)) + 30;

  const strongSectors = sectors.filter(s => s.momentum > 20).length;
  const breadth = (strongSectors / sectors.length) * 20;

  const score = momentumScore * 0.5 + rsScore * 0.3 + breadth + 20;
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/**
 * 计算市场情绪评分
 */
export function calculateSentimentScore(data: SentimentData): number {
  const limitRatio = data.limitUpCount + data.limitDownCount > 0
    ? data.limitUpCount / (data.limitUpCount + data.limitDownCount) : 0.5;
  const limitScore = limitRatio * 30;

  const consecutiveBonus = Math.min(15, data.consecutiveLimitUp * 3);
  const sentimentScore = data.marketSentimentIndex * 0.3;
  const fearGreedContribution = data.fearGreedIndex * 0.15;
  const pcrPenalty = data.putCallRatio > 1.2 ? -5 : data.putCallRatio < 0.8 ? 5 : 0;

  const score = limitScore + consecutiveBonus + sentimentScore + fearGreedContribution + pcrPenalty + 10;
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/**
 * 计算估值评分（越低越好，所以反转）
 */
export function calculateValuationScore(data: ValuationData[]): number {
  if (data.length === 0) return 50;

  const avgPEPercentile = data.reduce((sum, d) => sum + d.pePercentile, 0) / data.length;
  const avgPBPercentile = data.reduce((sum, d) => sum + d.pbPercentile, 0) / data.length;
  const avgYield = data.reduce((sum, d) => sum + d.dividendYield, 0) / data.length;

  // 低估值 = 高分
  const peScore = (100 - avgPEPercentile) * 0.4;
  const pbScore = (100 - avgPBPercentile) * 0.35;
  const yieldScore = Math.min(25, avgYield * 10);

  const score = peScore + pbScore + yieldScore;
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/**
 * 计算综合市场评分
 */
export function calculateCompositeScore(
  breadth: BreadthData,
  capitalFlow: CapitalFlowData,
  northbound: NorthboundData,
  sectors: SectorMomentumData[],
  sentiment: SentimentData,
  valuation: ValuationData[],
  config: MarketAnalyticsConfig = DEFAULT_CONFIG,
): number {
  const scores = {
    breadth: calculateBreadthScore(breadth),
    capitalFlow: calculateCapitalFlowScore(capitalFlow),
    northbound: calculateNorthboundScore(northbound),
    sectorMomentum: calculateSectorMomentumScore(sectors),
    sentiment: calculateSentimentScore(sentiment),
    valuation: calculateValuationScore(valuation),
  };

  const total = Object.values(config.weights).reduce((sum, w) => sum + w, 0);
  const composite = Object.entries(scores).reduce((sum, [key, score]) => {
    const weight = config.weights[key as keyof typeof config.weights] / total;
    return sum + score * weight;
  }, 0);

  return Math.round(composite * 100) / 100;
}

/**
 * 生成市场信号
 */
export function generateMarketSignal(
  compositeScore: number,
  config: MarketAnalyticsConfig = DEFAULT_CONFIG,
): MarketSignal {
  const type: MarketSignal['type'] = compositeScore >= config.thresholds.bullish
    ? 'bullish' : compositeScore <= config.thresholds.bearish
      ? 'bearish' : 'neutral';

  const strength = type === 'bullish'
    ? compositeScore
    : type === 'bearish'
      ? 100 - compositeScore
      : 50 - Math.abs(compositeScore - 50);

  const sources: string[] = [];
  if (compositeScore > 60) sources.push('市场广度良好');
  if (compositeScore > 70) sources.push('资金持续流入');
  if (compositeScore < 40) sources.push('市场情绪偏弱');
  if (compositeScore < 30) sources.push('风险信号增多');

  const confidence = Math.min(1, 0.5 + Math.abs(compositeScore - 50) / 100);

  return {
    type,
    strength: Math.round(strength * 100) / 100,
    sources,
    confidence: Math.round(confidence * 1000) / 1000,
    timestamp: Date.now(),
  };
}

/**
 * 生成板块配置建议
 */
export function generateSectorRecommendations(
  sectors: SectorMomentumData[],
  capitalFlows: Record<string, number>,
  northboundExposure: Record<string, number>,
  valuations: ValuationData[],
): SectorRecommendation[] {
  const valMap = new Map(valuations.map(v => [v.sector, v]));

  return sectors.map(sector => {
    const flow = capitalFlows[sector.sector] || 0;
    const nbChange = northboundExposure[sector.sector] || 0;
    const val = valMap.get(sector.sector);

    const momentumScore = (sector.momentum + 100) / 2;
    const flowScore = Math.min(30, Math.max(-30, flow / 1e8)) + 30;
    const nbScore = Math.min(20, Math.max(-20, nbChange / 1e7)) + 20;
    const valScore = val ? (100 - val.pePercentile) * 0.1 : 10;

    const score = Math.round((momentumScore * 0.4 + flowScore * 0.3 + nbScore * 0.2 + valScore * 0.1) * 100) / 100;

    let recommendation: SectorRecommendation['recommendation'];
    if (score >= 75) recommendation = 'strong_buy';
    else if (score >= 60) recommendation = 'buy';
    else if (score >= 40) recommendation = 'hold';
    else if (score >= 25) recommendation = 'sell';
    else recommendation = 'strong_sell';

    const reasons: string[] = [];
    if (sector.momentum > 30) reasons.push('板块动量强劲');
    if (flow > 5e8) reasons.push('主力资金大幅流入');
    if (nbChange > 1e7) reasons.push('北向资金增持');
    if (val && val.pePercentile < 30) reasons.push('估值处于历史低位');
    if (sector.relativeStrength > 5) reasons.push('相对强度优异');

    return {
      sector: sector.sector,
      score,
      momentum: Math.round(sector.momentum * 100) / 100,
      capitalInflow: Math.round(flow * 100) / 100,
      northboundChange: Math.round(nbChange * 100) / 100,
      recommendation,
      reasons,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * 计算风险等级
 */
export function calculateRiskLevel(
  breadth: BreadthData,
  sentiment: SentimentData,
  volatility: number,
  config: MarketAnalyticsConfig = DEFAULT_CONFIG,
): 'low' | 'medium' | 'high' {
  let riskScore = 0;

  // 广度收窄
  const total = breadth.advanceCount + breadth.declineCount;
  if (total > 0 && breadth.declineCount / total > 0.6) riskScore += 2;

  // 新低数量增加
  if (breadth.newLows > breadth.newHighs) riskScore += 1;

  // 恐慌情绪
  if (sentiment.fearGreedIndex < 25) riskScore += 2;
  else if (sentiment.fearGreedIndex < 40) riskScore += 1;

  // 波动率
  if (volatility > config.thresholds.volatility) riskScore += 2;

  // Put/Call Ratio
  if (sentiment.putCallRatio > 1.3) riskScore += 1;

  if (riskScore >= 5) return 'high';
  if (riskScore >= 3) return 'medium';
  return 'low';
}

/**
 * 判断市场趋势
 */
export function determineMarketTrend(
  breadth: BreadthData,
  sectors: SectorMomentumData[],
): 'up' | 'down' | 'sideways' {
  const advDeclRatio = breadth.advanceDeclineRatio;
  const avgMomentum = sectors.length > 0
    ? sectors.reduce((sum, s) => sum + s.momentum, 0) / sectors.length : 0;
  const strongSectors = sectors.filter(s => s.momentum > 10).length;
  const sectorRatio = sectors.length > 0 ? strongSectors / sectors.length : 0.5;

  const upSignals = (advDeclRatio > 1.2 ? 1 : 0) + (avgMomentum > 10 ? 1 : 0) + (sectorRatio > 0.5 ? 1 : 0);
  const downSignals = (advDeclRatio < 0.8 ? 1 : 0) + (avgMomentum < -10 ? 1 : 0) + (sectorRatio < 0.3 ? 1 : 0);

  if (upSignals >= 2) return 'up';
  if (downSignals >= 2) return 'down';
  return 'sideways';
}

/**
 * 生成分散化建议
 */
export function generateDiversificationAdvice(
  sectors: SectorRecommendation[],
  riskLevel: 'low' | 'medium' | 'high',
): string[] {
  const advice: string[] = [];

  const buySectors = sectors.filter(s => s.recommendation === 'strong_buy' || s.recommendation === 'buy');
  const sellSectors = sectors.filter(s => s.recommendation === 'sell' || s.recommendation === 'strong_sell');

  if (buySectors.length >= 3) {
    advice.push(`建议关注${buySectors.slice(0, 3).map(s => s.sector).join('、')}等强势板块`);
  }

  if (sellSectors.length > 0) {
    advice.push(`建议减持${sellSectors.slice(0, 2).map(s => s.sector).join('、')}等弱势板块`);
  }

  if (riskLevel === 'high') {
    advice.push('当前市场风险较高，建议降低仓位至5-6成');
    advice.push('增加防御性板块配置（公用事业、必需消费）');
  } else if (riskLevel === 'medium') {
    advice.push('市场波动加大，建议维持7成仓位');
    advice.push('适当配置债券类资产对冲风险');
  } else {
    advice.push('市场环境稳定，可维持8-9成仓位');
    advice.push('可适当增加成长型板块配置');
  }

  if (buySectors.length < 2) {
    advice.push('市场缺乏明确主线，建议观望为主');
  }

  return advice;
}

/**
 * 完整的市场分析
 */
export function analyzeMarket(
  breadth: BreadthData,
  capitalFlow: CapitalFlowData,
  northbound: NorthboundData,
  sectors: SectorMomentumData[],
  sentiment: SentimentData,
  valuations: ValuationData[],
  volatility: number = 20,
  config: MarketAnalyticsConfig = DEFAULT_CONFIG,
): MarketOverview {
  const compositeScore = calculateCompositeScore(
    breadth, capitalFlow, northbound, sectors, sentiment, valuations, config,
  );
  const signal = generateMarketSignal(compositeScore, config);
  const riskLevel = calculateRiskLevel(breadth, sentiment, volatility, config);
  const trend = determineMarketTrend(breadth, sectors);
  const topSectors = generateSectorRecommendations(
    sectors,
    capitalFlow.sectorFlows,
    northbound.sectorExposure,
    valuations,
  );
  const diversificationAdvice = generateDiversificationAdvice(topSectors, riskLevel);

  return {
    compositeScore,
    signal,
    topSectors: topSectors.slice(0, 10),
    riskLevel,
    trend,
    diversificationAdvice,
  };
}

/**
 * 计算板块轮动信号
 */
export function detectSectorRotation(
  currentSectors: SectorMomentumData[],
  previousSectors: SectorMomentumData[],
): Array<{ sector: string; from: number; to: number; change: number; signal: 'in' | 'out' | 'stable' }> {
  const prevMap = new Map(previousSectors.map(s => [s.sector, s]));

  return currentSectors.map(current => {
    const prev = prevMap.get(current.sector);
    const prevMomentum = prev ? prev.momentum : 0;
    const change = current.momentum - prevMomentum;

    let signal: 'in' | 'out' | 'stable';
    if (change > 20) signal = 'in';
    else if (change < -20) signal = 'out';
    else signal = 'stable';

    return {
      sector: current.sector,
      from: Math.round(prevMomentum * 100) / 100,
      to: Math.round(current.momentum * 100) / 100,
      change: Math.round(change * 100) / 100,
      signal,
    };
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/**
 * 计算市场集中度
 */
export function calculateMarketConcentration(
  sectors: SectorMomentumData[],
  capitalFlows: Record<string, number>,
): { top3Concentration: number; top5Concentration: number; herfindahlIndex: number } {
  const flows = sectors.map(s => ({
    sector: s.sector,
    flow: Math.abs(capitalFlows[s.sector] || 1),
  }));

  const totalFlow = flows.reduce((sum, f) => sum + f.flow, 0);
  if (totalFlow === 0) return { top3Concentration: 0, top5Concentration: 0, herfindahlIndex: 0 };

  const sorted = flows.sort((a, b) => b.flow - a.flow);
  const shares = sorted.map(f => f.flow / totalFlow);

  const top3Concentration = shares.slice(0, 3).reduce((sum, s) => sum + s, 0);
  const top5Concentration = shares.slice(0, 5).reduce((sum, s) => sum + s, 0);
  const herfindahlIndex = shares.reduce((sum, s) => sum + s * s, 0);

  return {
    top3Concentration: Math.round(top3Concentration * 10000) / 10000,
    top5Concentration: Math.round(top5Concentration * 10000) / 10000,
    herfindahlIndex: Math.round(herfindahlIndex * 10000) / 10000,
  };
}

/**
 * 计算动量加速因子
 */
export function calculateMomentumAcceleration(
  sectors: SectorMomentumData[],
): Array<{ sector: string; acceleration: number; direction: 'accelerating' | 'decelerating' | 'stable' }> {
  return sectors.map(s => {
    // 用5日和20日价格变化差值估算加速度
    const acceleration = s.priceChange5d - (s.priceChange20d / 4);

    let direction: 'accelerating' | 'decelerating' | 'stable';
    if (acceleration > 1) direction = 'accelerating';
    else if (acceleration < -1) direction = 'decelerating';
    else direction = 'stable';

    return {
      sector: s.sector,
      acceleration: Math.round(acceleration * 100) / 100,
      direction,
    };
  });
}

/**
 * 生成市场异常检测报告
 */
export function detectMarketAnomalies(
  breadth: BreadthData,
  sentiment: SentimentData,
  capitalFlow: CapitalFlowData,
): Array<{ type: string; severity: 'info' | 'warning' | 'critical'; message: string }> {
  const anomalies: Array<{ type: string; severity: 'info' | 'warning' | 'critical'; message: string }> = [];

  const total = breadth.advanceCount + breadth.declineCount;
  if (total > 0) {
    const declineRatio = breadth.declineCount / total;
    if (declineRatio > 0.85) {
      anomalies.push({ type: 'breadth_extreme', severity: 'critical', message: `下跌家数占比${(declineRatio * 100).toFixed(1)}%，市场极度悲观` });
    } else if (declineRatio > 0.75) {
      anomalies.push({ type: 'breadth_warning', severity: 'warning', message: `下跌家数占比${(declineRatio * 100).toFixed(1)}%，市场情绪偏弱` });
    }

    if (breadth.newLows > breadth.newHighs * 3 && breadth.newHighs > 0) {
      anomalies.push({ type: 'new_lows_surge', severity: 'critical', message: `创新低(${breadth.newLows})远超创新高(${breadth.newHighs})` });
    }
  }

  if (sentiment.fearGreedIndex < 15) {
    anomalies.push({ type: 'extreme_fear', severity: 'critical', message: `恐惧贪婪指数${sentiment.fearGreedIndex}，极度恐慌` });
  } else if (sentiment.fearGreedIndex > 85) {
    anomalies.push({ type: 'extreme_greed', severity: 'warning', message: `恐惧贪婪指数${sentiment.fearGreedIndex}，极度贪婪` });
  }

  if (sentiment.putCallRatio > 1.5) {
    anomalies.push({ type: 'pcr_extreme', severity: 'warning', message: `Put/Call Ratio ${sentiment.putCallRatio.toFixed(2)}，对冲需求激增` });
  }

  const flowMagnitude = Math.abs(capitalFlow.mainNetInflow);
  if (flowMagnitude > 5e10) {
    const direction = capitalFlow.mainNetInflow > 0 ? '流入' : '流出';
    anomalies.push({ type: 'massive_flow', severity: 'info', message: `主力资金大幅${direction} ${(flowMagnitude / 1e10).toFixed(0)}0亿` });
  }

  return anomalies;
}
