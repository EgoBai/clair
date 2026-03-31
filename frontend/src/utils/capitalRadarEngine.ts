/**
 * 资金雷达引擎 - 主力资金追踪/北向资金/融资融券/大宗交易资金分析
 */

export interface CapitalFlowRecord {
  time: string;
  mainInflow: number;
  mainOutflow: number;
  retailInflow: number;
  retailOutflow: number;
  northboundNet: number;
}

export interface RadarSignal {
  type: 'accumulation' | 'distribution' | 'divergence' | 'smart_money';
  strength: number; // 0-100
  description: string;
  confidence: number; // 0-1
  timestamp: string;
}

export interface CapitalHeatMap {
  sector: string;
  netInflow: number;
  inflowIntensity: number; // 0-1
  trend: 'accelerating' | 'stable' | 'decelerating';
  topStocks: Array<{ code: string; netInflow: number }>;
}

export interface MarginAnalysis {
  balanceChange: number;
  shortChange: number;
  longShortRatio: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  momentum: number; // -1 to 1
}

/**
 * 分析主力资金动向
 */
export function analyzeMainCapital(flows: CapitalFlowRecord[]): {
  totalNetInflow: number;
  mainNetInflow: number;
  retailNetInflow: number;
  mainDominance: number; // 主力主导度 0-1
  trend: 'inflow' | 'outflow' | 'neutral';
  consecutiveDays: number;
} {
  if (flows.length === 0) {
    return { totalNetInflow: 0, mainNetInflow: 0, retailNetInflow: 0, mainDominance: 0.5, trend: 'neutral', consecutiveDays: 0 };
  }

  let mainNet = 0;
  let retailNet = 0;

  for (const f of flows) {
    mainNet += f.mainInflow - f.mainOutflow;
    retailNet += f.retailInflow - f.retailOutflow;
  }

  const totalNet = mainNet + retailNet;
  const absTotal = Math.abs(mainNet) + Math.abs(retailNet) || 1;
  const mainDominance = Math.round((Math.abs(mainNet) / absTotal) * 1000) / 1000;

  // Consecutive days tracking
  let consecutiveDays = 0;
  const lastSign = mainNet >= 0 ? 1 : -1;
  for (let i = flows.length - 1; i >= 0; i--) {
    const dayNet = flows[i].mainInflow - flows[i].mainOutflow;
    if ((dayNet >= 0 && lastSign > 0) || (dayNet < 0 && lastSign < 0)) {
      consecutiveDays++;
    } else {
      break;
    }
  }

  return {
    totalNetInflow: Math.round(totalNet),
    mainNetInflow: Math.round(mainNet),
    retailNetInflow: Math.round(retailNet),
    mainDominance,
    trend: mainNet > 0 ? 'inflow' : mainNet < 0 ? 'outflow' : 'neutral',
    consecutiveDays,
  };
}

/**
 * 生成雷达信号
 */
export function generateRadarSignals(
  flows: CapitalFlowRecord[],
  priceData: number[],
): RadarSignal[] {
  const signals: RadarSignal[] = [];
  if (flows.length < 3) return signals;

  // Accumulation detection: main buying while price flat/down
  const recentFlows = flows.slice(-5);
  const mainNetFlows = recentFlows.map(f => f.mainInflow - f.mainOutflow);
  const avgMainNet = mainNetFlows.reduce((a, b) => a + b, 0) / mainNetFlows.length;

  if (avgMainNet > 0) {
    const priceChange = priceData.length >= 2
      ? (priceData[priceData.length - 1] - priceData[0]) / priceData[0]
      : 0;

    if (priceChange < 0.02 && avgMainNet > 0) {
      signals.push({
        type: 'accumulation',
        strength: Math.min(100, Math.round((avgMainNet / 10000) * 100)),
        description: '主力持续净流入，股价未明显上涨，疑似吸筹',
        confidence: Math.min(1, 0.5 + Math.abs(avgMainNet) / 50000),
        timestamp: flows[flows.length - 1].time,
      });
    }
  }

  // Distribution detection: main selling while price up
  if (avgMainNet < 0 && priceData.length >= 2) {
    const priceChange = (priceData[priceData.length - 1] - priceData[0]) / priceData[0];
    if (priceChange > 0.02) {
      signals.push({
        type: 'distribution',
        strength: Math.min(100, Math.round((Math.abs(avgMainNet) / 10000) * 100)),
        description: '主力持续净流出，股价仍在上涨，疑似派发',
        confidence: Math.min(1, 0.5 + Math.abs(avgMainNet) / 50000),
        timestamp: flows[flows.length - 1].time,
      });
    }
  }

  // Divergence: northbound vs main capital
  const northboundNet = recentFlows.reduce((s, f) => s + f.northboundNet, 0);
  if ((northboundNet > 0 && avgMainNet < 0) || (northboundNet < 0 && avgMainNet > 0)) {
    signals.push({
      type: 'divergence',
      strength: Math.min(100, Math.round((Math.abs(northboundNet - avgMainNet) / 10000) * 100)),
      description: '北向资金与主力资金方向背离',
      confidence: 0.6,
      timestamp: flows[flows.length - 1].time,
    });
  }

  // Smart money detection: large single-day main inflow
  for (let i = Math.max(0, flows.length - 3); i < flows.length; i++) {
    const dayNet = flows[i].mainInflow - flows[i].mainOutflow;
    const avgVolume = (flows[i].mainInflow + flows[i].mainOutflow) / 2 || 1;
    if (dayNet / avgVolume > 0.3) {
      signals.push({
        type: 'smart_money',
        strength: Math.min(100, Math.round((dayNet / avgVolume) * 100)),
        description: '大额资金异常流入，疑似聪明钱建仓',
        confidence: 0.7,
        timestamp: flows[i].time,
      });
    }
  }

  return signals;
}

/**
 * 生成资金热力图
 */
export function generateCapitalHeatmap(
  sectorFlows: Array<{
    sector: string;
    netInflow: number;
    stocks: Array<{ code: string; netInflow: number }>;
  }>,
): CapitalHeatMap[] {
  if (sectorFlows.length === 0) return [];

  const maxAbs = Math.max(...sectorFlows.map(s => Math.abs(s.netInflow)), 1);

  return sectorFlows.map(s => {
    const topStocks = [...s.stocks]
      .sort((a, b) => b.netInflow - a.netInflow)
      .slice(0, 5);

    return {
      sector: s.sector,
      netInflow: s.netInflow,
      inflowIntensity: Math.abs(s.netInflow) / maxAbs,
      trend: 'stable' as const,
      topStocks,
    };
  }).sort((a, b) => b.netInflow - a.netInflow);
}

/**
 * 融资融券分析
 */
export function analyzeMargin(
  history: Array<{ date: string; marginBalance: number; shortBalance: number }>,
): MarginAnalysis {
  if (history.length < 2) {
    return { balanceChange: 0, shortChange: 0, longShortRatio: 1, sentiment: 'neutral', momentum: 0 };
  }

  const latest = history[history.length - 1];
  const prev = history[history.length - 2];

  const balanceChange = latest.marginBalance - prev.marginBalance;
  const shortChange = latest.shortBalance - prev.shortBalance;
  const longShortRatio = latest.shortBalance > 0
    ? Math.round((latest.marginBalance / latest.shortBalance) * 100) / 100
    : Infinity;

  // Momentum: compare recent 5-day trend
  const recent = history.slice(-5);
  let momentumSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const delta = recent[i].marginBalance - recent[i - 1].marginBalance;
    momentumSum += delta > 0 ? 1 : delta < 0 ? -1 : 0;
  }
  const momentum = Math.round((momentumSum / (recent.length - 1)) * 100) / 100;

  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (balanceChange > 0 && shortChange < 0) sentiment = 'bullish';
  else if (balanceChange < 0 && shortChange > 0) sentiment = 'bearish';
  else if (balanceChange > 0 && momentum > 0.3) sentiment = 'bullish';
  else if (balanceChange < 0 && momentum < -0.3) sentiment = 'bearish';

  return { balanceChange, shortChange, longShortRatio, sentiment, momentum };
}

/**
 * 大宗交易折溢价分析
 */
export function analyzeBlockTrades(
  trades: Array<{ price: number; marketPrice: number; volume: number; buyer: string }>,
): {
  premiumCount: number;
  discountCount: number;
  avgPremium: number;
  institutionalActivity: number; // 0-1
  signal: 'bullish' | 'bearish' | 'neutral';
} {
  if (trades.length === 0) {
    return { premiumCount: 0, discountCount: 0, avgPremium: 0, institutionalActivity: 0, signal: 'neutral' };
  }

  let premiumCount = 0;
  let discountCount = 0;
  let totalPremium = 0;
  let totalVolume = 0;

  for (const t of trades) {
    const premium = (t.price - t.marketPrice) / t.marketPrice;
    totalPremium += premium * t.volume;
    totalVolume += t.volume;
    if (premium > 0.001) premiumCount++;
    else if (premium < -0.001) discountCount++;
  }

  const avgPremium = totalVolume > 0 ? totalPremium / totalVolume : 0;
  const uniqueBuyers = new Set(trades.map(t => t.buyer)).size;
  const institutionalActivity = Math.min(1, uniqueBuyers / 5);

  let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (premiumCount > discountCount * 1.5) signal = 'bullish';
  else if (discountCount > premiumCount * 1.5) signal = 'bearish';

  return {
    premiumCount,
    discountCount,
    avgPremium: Math.round(avgPremium * 10000) / 10000,
    institutionalActivity: Math.round(institutionalActivity * 100) / 100,
    signal,
  };
}
