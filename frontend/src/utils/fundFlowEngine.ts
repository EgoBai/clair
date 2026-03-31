/**
 * 资金流向引擎 — A股资金流动分析
 * - 主力/散户资金流向分解
 * - 北向/南向资金追踪
 * - 板块资金热度图
 * - 大单监控与异动检测
 * - 资金面情绪指标
 */

export interface FundFlowTick {
  timestamp: number;
  stockCode: string;
  price: number;
  volume: number;
  amount: number;
  buyVolume: number;
  sellVolume: number;
  /** 超大单>100万, 大单>20万, 中单>4万, 小单<4万 */
  orderSize: 'superLarge' | 'large' | 'medium' | 'small';
}

export interface FundFlowResult {
  netInflow: number;
  netOutflow: number;
  netFlow: number;
  mainForceNetFlow: number;
  retailNetFlow: number;
  largeOrderRatio: number;
  flowTrend: 'inflow' | 'outflow' | 'neutral';
  intensity: number; // 0-100
}

export interface NorthBoundFlow {
  date: string;
  buyAmount: number;
  sellAmount: number;
  netBuy: number;
  cumulative5d: number;
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface SectorFlow {
  sectorCode: string;
  sectorName: string;
  netFlow: number;
  flowPercent: number;
  activeStocks: number;
  leadStock: string;
  heat: number; // 0-100
}

export interface LargeOrderAlert {
  timestamp: number;
  stockCode: string;
  type: 'buySweep' | 'sellDump' | 'accumulation' | 'distribution';
  amount: number;
  confidence: number;
  priceImpact: number;
}

export interface FlowSentiment {
  score: number; // -100 to 100
  label: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  mainForceBias: number;
  flowMomentum: number;
  divergence: boolean;
}

/** 分析单只股票资金流向 */
export function analyzeFundFlow(ticks: FundFlowTick[]): FundFlowResult {
  if (ticks.length === 0) {
    return {
      netInflow: 0, netOutflow: 0, netFlow: 0,
      mainForceNetFlow: 0, retailNetFlow: 0,
      largeOrderRatio: 0, flowTrend: 'neutral', intensity: 0,
    };
  }

  let totalBuy = 0, totalSell = 0;
  let mainBuy = 0, mainSell = 0;
  let retailBuy = 0, retailSell = 0;
  let largeOrderCount = 0;

  for (const tick of ticks) {
    const buyAmt = tick.buyVolume * tick.price;
    const sellAmt = tick.sellVolume * tick.price;
    totalBuy += buyAmt;
    totalSell += sellAmt;

    if (tick.orderSize === 'superLarge' || tick.orderSize === 'large') {
      mainBuy += buyAmt;
      mainSell += sellAmt;
      largeOrderCount++;
    } else {
      retailBuy += buyAmt;
      retailSell += sellAmt;
    }
  }

  const netFlow = totalBuy - totalSell;
  const mainForceNetFlow = mainBuy - mainSell;
  const retailNetFlow = retailBuy - retailSell;
  const largeOrderRatio = ticks.length > 0 ? largeOrderCount / ticks.length : 0;

  const flowTrend = netFlow > 0 ? 'inflow' : netFlow < 0 ? 'outflow' : 'neutral';
  const intensity = Math.min(100, Math.abs(netFlow) / Math.max(totalBuy + totalSell, 1) * 200);

  return {
    netInflow: totalBuy,
    netOutflow: totalSell,
    netFlow,
    mainForceNetFlow,
    retailNetFlow,
    largeOrderRatio,
    flowTrend,
    intensity: Math.round(intensity * 100) / 100,
  };
}

/** 北向资金追踪 */
export function trackNorthBoundFlow(dailyFlows: { date: string; buy: number; sell: number }[]): NorthBoundFlow[] {
  return dailyFlows.map((d, i) => {
    const netBuy = d.buy - d.sell;
    const start = Math.max(0, i - 4);
    const cumulative5d = dailyFlows.slice(start, i + 1).reduce((sum, f) => sum + (f.buy - f.sell), 0);

    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (cumulative5d > 0 && netBuy > 0) trend = 'bullish';
    else if (cumulative5d < 0 && netBuy < 0) trend = 'bearish';

    return {
      date: d.date,
      buyAmount: d.buy,
      sellAmount: d.sell,
      netBuy,
      cumulative5d,
      trend,
    };
  });
}

/** 板块资金热度排序 */
export function rankSectorFlows(sectors: { code: string; name: string; netFlow: number; totalAmount: number; stocks: { code: string; flow: number }[] }[]): SectorFlow[] {
  const maxFlow = Math.max(...sectors.map(s => Math.abs(s.netFlow)), 1);

  return sectors
    .map(s => {
      const flowPercent = s.totalAmount > 0 ? (s.netFlow / s.totalAmount) * 100 : 0;
      const leadStock = s.stocks.sort((a, b) => b.flow - a.flow)[0]?.code ?? '';
      const heat = Math.min(100, (Math.abs(s.netFlow) / maxFlow) * 100);

      return {
        sectorCode: s.code,
        sectorName: s.name,
        netFlow: s.netFlow,
        flowPercent: Math.round(flowPercent * 100) / 100,
        activeStocks: s.stocks.filter(st => Math.abs(st.flow) > 0).length,
        leadStock,
        heat: Math.round(heat),
      };
    })
    .sort((a, b) => b.netFlow - a.netFlow);
}

/** 大单异动检测 */
export function detectLargeOrderAlerts(ticks: FundFlowTick[], amountThreshold = 500000, volumeRatioThreshold = 3): LargeOrderAlert[] {
  if (ticks.length < 2) return [];

  const alerts: LargeOrderAlert[] = [];
  const avgVolume = ticks.reduce((s, t) => s + t.volume, 0) / ticks.length;

  for (let i = 1; i < ticks.length; i++) {
    const tick = ticks[i];
    const amount = tick.amount;
    const volRatio = avgVolume > 0 ? tick.volume / avgVolume : 0;

    if (amount < amountThreshold) continue;

    const isBuySweep = tick.buyVolume > tick.sellVolume * 2 && amount > amountThreshold;
    const isSellDump = tick.sellVolume > tick.buyVolume * 2 && amount > amountThreshold;

    if (isBuySweep) {
      alerts.push({
        timestamp: tick.timestamp,
        stockCode: tick.stockCode,
        type: 'buySweep',
        amount,
        confidence: Math.min(1, volRatio / volumeRatioThreshold),
        priceImpact: (tick.buyVolume - tick.sellVolume) * tick.price,
      });
    } else if (isSellDump) {
      alerts.push({
        timestamp: tick.timestamp,
        stockCode: tick.stockCode,
        type: 'sellDump',
        amount,
        confidence: Math.min(1, volRatio / volumeRatioThreshold),
        priceImpact: (tick.sellVolume - tick.buyVolume) * tick.price,
      });
    }
  }

  return alerts;
}

/** 资金面情绪综合指标 */
export function computeFlowSentiment(
  mainFlows: FundFlowResult[],
  northBound: NorthBoundFlow[],
  windowSize = 5
): FlowSentiment {
  if (mainFlows.length === 0) {
    return { score: 0, label: 'neutral', mainForceBias: 0, flowMomentum: 0, divergence: false };
  }

  // 主力资金偏度
  const mainForceBias = mainFlows.reduce((s, f) => s + f.mainForceNetFlow, 0) /
    Math.max(mainFlows.reduce((s, f) => s + Math.abs(f.netFlow), 0), 1);

  // 资金动量
  const recent = mainFlows.slice(-windowSize);
  const older = mainFlows.slice(-windowSize * 2, -windowSize);
  const recentFlow = recent.reduce((s, f) => s + f.netFlow, 0);
  const olderFlow = older.length > 0 ? older.reduce((s, f) => s + f.netFlow, 0) : 0;
  const flowMomentum = olderFlow !== 0 ? (recentFlow - olderFlow) / Math.abs(olderFlow) : 0;

  // 北向资金贡献
  const northNet = northBound.slice(-windowSize).reduce((s, f) => s + f.netBuy, 0);
  const northBias = northNet > 0 ? 1 : northNet < 0 ? -1 : 0;

  // 综合评分
  const rawScore = (mainForceBias * 40 + flowMomentum * 30 + northBias * 30);
  const score = Math.max(-100, Math.min(100, Math.round(rawScore * 100)));

  // 背离检测：主力与散户方向相反
  const mainPositive = mainFlows.slice(-3).filter(f => f.mainForceNetFlow > 0).length;
  const retailPositive = mainFlows.slice(-3).filter(f => f.retailNetFlow > 0).length;
  const divergence = (mainPositive >= 2 && retailPositive <= 1) ||
    (mainPositive <= 1 && retailPositive >= 2);

  let label: FlowSentiment['label'] = 'neutral';
  if (score >= 60) label = 'extreme_greed';
  else if (score >= 25) label = 'greed';
  else if (score <= -60) label = 'extreme_fear';
  else if (score <= -25) label = 'fear';

  return { score, label, mainForceBias, flowMomentum, divergence };
}

/** 板块轮动资金追踪 */
export function detectSectorRotation(
  currentFlows: SectorFlow[],
  previousFlows: SectorFlow[],
  flowChangeThreshold = 0.2
): { sector: string; rotationType: 'inflow_shift' | 'outflow_shift' | 'stable'; changePercent: number }[] {
  return currentFlows.map(current => {
    const prev = previousFlows.find(p => p.sectorCode === current.sectorCode);
    if (!prev) {
      return { sector: current.sectorName, rotationType: 'stable' as const, changePercent: 0 };
    }

    const prevFlow = Math.abs(prev.netFlow);
    const currFlow = Math.abs(current.netFlow);
    const changePercent = prevFlow > 0 ? (currFlow - prevFlow) / prevFlow : 0;

    let rotationType: 'inflow_shift' | 'outflow_shift' | 'stable' = 'stable';
    if (changePercent > flowChangeThreshold && current.netFlow > 0) rotationType = 'inflow_shift';
    else if (changePercent > flowChangeThreshold && current.netFlow < 0) rotationType = 'outflow_shift';

    return { sector: current.sectorName, rotationType, changePercent: Math.round(changePercent * 10000) / 10000 };
  });
}

/** 资金流向分布统计 */
export function flowDistribution(flows: FundFlowResult[]): {
  inflowDays: number;
  outflowDays: number;
  avgNetFlow: number;
  maxInflow: number;
  maxOutflow: number;
  consistency: number;
} {
  const inflowDays = flows.filter(f => f.netFlow > 0).length;
  const outflowDays = flows.filter(f => f.netFlow < 0).length;
  const avgNetFlow = flows.length > 0 ? flows.reduce((s, f) => s + f.netFlow, 0) / flows.length : 0;
  const maxInflow = Math.max(0, ...flows.map(f => f.netFlow));
  const maxOutflow = Math.min(0, ...flows.map(f => f.netFlow));

  // 一致性 = 连续同向天数占比
  let consecutive = 1, maxConsecutive = 1;
  for (let i = 1; i < flows.length; i++) {
    if (Math.sign(flows[i].netFlow) === Math.sign(flows[i - 1].netFlow)) {
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 1;
    }
  }
  const consistency = flows.length > 1 ? maxConsecutive / flows.length : 0;

  return { inflowDays, outflowDays, avgNetFlow, maxInflow, maxOutflow, consistency: Math.round(consistency * 10000) / 10000 };
}
