/**
 * 资金流向分析引擎
 * Capital Flow Analysis Engine
 *
 * 主力/散户资金流向追踪、大单分析、板块资金轮动、资金面评分
 */

export interface TradeRecord {
  price: number;
  volume: number;
  amount: number;
  timestamp: number;
  isBuy: boolean;
}

export interface FlowSnapshot {
  timestamp: number;
  mainInflow: number;
  mainOutflow: number;
  retailInflow: number;
  retailOutflow: number;
  netMainFlow: number;
  netRetailFlow: number;
}

export interface LargeOrderAlert {
  timestamp: number;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  significance: 'high' | 'extreme';
}

export interface SectorFlow {
  sector: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  flowTrend: 'accelerating' | 'steady' | 'decelerating';
}

export interface FundFlowScore {
  total: number;
  mainFlowScore: number;
  largeOrderScore: number;
  consistencyScore: number;
  momentumScore: number;
}

const MAIN_ORDER_THRESHOLD = 500_000; // 50万
const EXTREME_ORDER_THRESHOLD = 2_000_000; // 200万

/**
 * 区分主散户资金
 * 以单笔成交金额阈值区分：>=50万为主力
 */
export function classifyOrder(trade: TradeRecord): 'main' | 'retail' {
  return trade.amount >= MAIN_ORDER_THRESHOLD ? 'main' : 'retail';
}

/**
 * 计算一段时间内的资金流向快照
 */
export function calculateFlowSnapshot(trades: TradeRecord[]): FlowSnapshot {
  if (trades.length === 0) {
    const now = Date.now();
    return { timestamp: now, mainInflow: 0, mainOutflow: 0, retailInflow: 0, retailOutflow: 0, netMainFlow: 0, netRetailFlow: 0 };
  }

  let mainIn = 0, mainOut = 0, retailIn = 0, retailOut = 0;

  for (const t of trades) {
    const type = classifyOrder(t);
    if (type === 'main') {
      if (t.isBuy) mainIn += t.amount; else mainOut += t.amount;
    } else {
      if (t.isBuy) retailIn += t.amount; else retailOut += t.amount;
    }
  }

  return {
    timestamp: trades[trades.length - 1].timestamp,
    mainInflow: mainIn,
    mainOutflow: mainOut,
    retailInflow: retailIn,
    retailOutflow: retailOut,
    netMainFlow: mainIn - mainOut,
    netRetailFlow: retailIn - retailOut,
  };
}

/**
 * 识别大单异动
 */
export function detectLargeOrders(trades: TradeRecord[]): LargeOrderAlert[] {
  return trades
    .filter(t => t.amount >= MAIN_ORDER_THRESHOLD)
    .map(t => ({
      timestamp: t.timestamp,
      side: t.isBuy ? 'buy' as const : 'sell' as const,
      amount: t.amount,
      price: t.price,
      significance: t.amount >= EXTREME_ORDER_THRESHOLD ? 'extreme' as const : 'high' as const,
    }));
}

/**
 * 多时段资金流向趋势分析
 */
export function analyzeFlowTrend(snapshots: FlowSnapshot[]): {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  consecutiveMainIn: number;
} {
  if (snapshots.length === 0) return { direction: 'neutral', strength: 0, consecutiveMainIn: 0 };

  let consecutiveIn = 0;
  let maxConsecutiveIn = 0;
  let totalNetMain = 0;

  for (const s of snapshots) {
    totalNetMain += s.netMainFlow;
    if (s.netMainFlow > 0) {
      consecutiveIn++;
      maxConsecutiveIn = Math.max(maxConsecutiveIn, consecutiveIn);
    } else {
      consecutiveIn = 0;
    }
  }

  const avgNet = totalNetMain / snapshots.length;
  const direction = avgNet > 0 ? 'bullish' : avgNet < 0 ? 'bearish' : 'neutral';
  const maxAbs = Math.max(...snapshots.map(s => Math.abs(s.netMainFlow)), 1);
  const strength = Math.min(Math.abs(avgNet) / maxAbs, 1);

  return { direction, strength, consecutiveMainIn: maxConsecutiveIn };
}

/**
 * 板块资金流向汇总
 */
export function aggregateSectorFlows(
  sectorTrades: Record<string, TradeRecord[]>
): SectorFlow[] {
  const flows: SectorFlow[] = [];

  for (const [sector, trades] of Object.entries(sectorTrades)) {
    const snapshot = calculateFlowSnapshot(trades);
    const netFlow = snapshot.netMainFlow;

    // 简易趋势：最近成交金额占比
    const recentCount = Math.min(trades.length, Math.ceil(trades.length / 3));
    const recentTrades = trades.slice(-recentCount);
    const recentSnapshot = calculateFlowSnapshot(recentTrades);
    const recentRatio = Math.abs(recentSnapshot.netMainFlow) / (Math.abs(netFlow) || 1);

    let flowTrend: SectorFlow['flowTrend'] = 'steady';
    if (recentRatio > 0.6) flowTrend = 'accelerating';
    else if (recentRatio < 0.3) flowTrend = 'decelerating';

    flows.push({
      sector,
      inflow: snapshot.mainInflow,
      outflow: snapshot.mainOutflow,
      netFlow,
      flowTrend,
    });
  }

  return flows.sort((a, b) => b.netFlow - a.netFlow);
}

/**
 * 资金面综合评分 0-100
 */
export function calculateFundFlowScore(
  snapshots: FlowSnapshot[],
  largeOrders: LargeOrderAlert[]
): FundFlowScore {
  // 主力净流入占比
  const totalMain = snapshots.reduce((s, d) => s + d.mainInflow + d.mainOutflow, 0);
  const totalNet = snapshots.reduce((s, d) => s + d.netMainFlow, 0);
  const mainFlowScore = totalMain > 0 ? Math.min(50, (totalNet / totalMain) * 100 + 25) : 25;

  // 大单买入占比
  const buyLarge = largeOrders.filter(o => o.side === 'buy').length;
  const totalLarge = largeOrders.length || 1;
  const largeOrderScore = (buyLarge / totalLarge) * 30;

  // 连续性
  const trend = analyzeFlowTrend(snapshots);
  const consistencyScore = Math.min(20, trend.consecutiveMainIn * 4);

  // 动量
  const momentumScore = trend.strength * 20;

  const total = Math.round(Math.min(100, Math.max(0,
    mainFlowScore + largeOrderScore + consistencyScore + momentumScore
  )));

  return {
    total,
    mainFlowScore: Math.round(mainFlowScore),
    largeOrderScore: Math.round(largeOrderScore),
    consistencyScore: Math.round(consistencyScore),
    momentumScore: Math.round(momentumScore),
  };
}

/**
 * 生成模拟资金流数据（测试/演示用）
 */
export function generateMockFlowData(
  count: number,
  bias: 'inflow' | 'outflow' | 'neutral' = 'neutral'
): TradeRecord[] {
  const now = Date.now();
  const records: TradeRecord[] = [];
  const basePrice = 10;

  for (let i = 0; i < count; i++) {
    const isMain = Math.random() < 0.3;
    const baseAmount = isMain ? 500_000 + Math.random() * 2_000_000 : 10_000 + Math.random() * 40_000;
    const buyBias = bias === 'inflow' ? 0.7 : bias === 'outflow' ? 0.3 : 0.5;

    records.push({
      price: basePrice + (Math.random() - 0.5) * 0.5,
      volume: Math.floor(baseAmount / basePrice),
      amount: baseAmount,
      timestamp: now - (count - i) * 1000,
      isBuy: Math.random() < buyBias,
    });
  }
  return records;
}
