/**
 * 事件驱动策略引擎 - Round 723
 * 基于市场事件的交易信号生成
 */
export interface MarketEvent {
  type: 'earnings' | 'dividend' | 'split' | 'ipo' | 'index_rebalance' | 'policy' | 'merger' | 'halt' | 'block_trade';
  symbol: string;
  timestamp: Date;
  data: Record<string, any>;
  impact: 'positive' | 'negative' | 'neutral';
  magnitude: number; // 0-1
}

export interface EventSignal {
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  eventType: string;
  reason: string;
  expectedDuration: number; // hours
  riskLevel: 'low' | 'medium' | 'high';
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface EventCluster {
  events: MarketEvent[];
  timeWindow: number; // minutes
  combinedImpact: number;
  symbols: string[];
}

export function analyzeEventImpact(event: MarketEvent, currentPrice: number): EventSignal {
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  let confidence = 0.5;
  let expectedDuration = 24;
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';

  switch (event.type) {
    case 'earnings':
      direction = event.impact === 'positive' ? 'long' : event.impact === 'negative' ? 'short' : 'neutral';
      confidence = 0.6 + event.magnitude * 0.3;
      expectedDuration = 48;
      riskLevel = 'high';
      break;
    case 'dividend':
      direction = 'long';
      confidence = 0.7;
      expectedDuration = 72;
      riskLevel = 'low';
      break;
    case 'split':
      direction = 'long';
      confidence = 0.55;
      expectedDuration = 168;
      riskLevel = 'low';
      break;
    case 'policy':
      direction = event.impact === 'positive' ? 'long' : event.impact === 'negative' ? 'short' : 'neutral';
      confidence = 0.5 + event.magnitude * 0.2;
      expectedDuration = 120;
      riskLevel = 'medium';
      break;
    case 'merger':
      direction = event.impact === 'positive' ? 'long' : 'short';
      confidence = 0.75;
      expectedDuration = 720;
      riskLevel = 'medium';
      break;
    case 'halt':
      direction = 'neutral';
      confidence = 0.3;
      expectedDuration = 4;
      riskLevel = 'high';
      break;
    case 'block_trade':
      direction = event.data.price >= currentPrice ? 'long' : 'short';
      confidence = 0.5;
      expectedDuration = 24;
      riskLevel = 'medium';
      break;
    case 'index_rebalance':
      direction = event.impact === 'positive' ? 'long' : 'short';
      confidence = 0.6;
      expectedDuration = 48;
      riskLevel = 'low';
      break;
    default:
      confidence = 0.4;
  }

  const stopLossPct = riskLevel === 'high' ? 0.05 : riskLevel === 'medium' ? 0.03 : 0.02;
  const takeProfitPct = stopLossPct * 2;

  return {
    symbol: event.symbol,
    direction,
    confidence: Math.min(confidence, 0.95),
    eventType: event.type,
    reason: `${event.type}事件: ${event.impact}影响, 强度${(event.magnitude * 100).toFixed(0)}%`,
    expectedDuration,
    riskLevel,
    entryPrice: currentPrice,
    stopLoss: direction === 'long' ? currentPrice * (1 - stopLossPct) : direction === 'short' ? currentPrice * (1 + stopLossPct) : undefined,
    takeProfit: direction === 'long' ? currentPrice * (1 + takeProfitPct) : direction === 'short' ? currentPrice * (1 - takeProfitPct) : undefined,
  };
}

export function detectEventClusters(events: MarketEvent[], windowMinutes: number = 60): EventCluster[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const clusters: EventCluster[] = [];
  let currentCluster: MarketEvent[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime()) / 60000;
    if (gap <= windowMinutes) {
      currentCluster.push(sorted[i]);
    } else {
      if (currentCluster.length > 1) {
        clusters.push(buildCluster(currentCluster, windowMinutes));
      }
      currentCluster = [sorted[i]];
    }
  }
  if (currentCluster.length > 1) {
    clusters.push(buildCluster(currentCluster, windowMinutes));
  }

  return clusters;
}

function buildCluster(events: MarketEvent[], window: number): EventCluster {
  const avgImpact = events.reduce((s, e) => s + (e.impact === 'positive' ? e.magnitude : e.impact === 'negative' ? -e.magnitude : 0), 0) / events.length;
  return {
    events,
    timeWindow: window,
    combinedImpact: avgImpact,
    symbols: [...new Set(events.map(e => e.symbol))],
  };
}

export function calculateEventRiskScore(events: MarketEvent[]): number {
  if (events.length === 0) return 0;
  const typeWeights: Record<string, number> = {
    earnings: 0.8, halt: 0.9, merger: 0.7, policy: 0.6,
    dividend: 0.3, split: 0.2, ipo: 0.5, index_rebalance: 0.4, block_trade: 0.5,
  };
  let totalRisk = 0;
  for (const e of events) {
    const weight = typeWeights[e.type] ?? 0.5;
    totalRisk += weight * e.magnitude;
  }
  return Math.min(totalRisk / events.length, 1);
}

export function prioritizeEvents(events: MarketEvent[]): MarketEvent[] {
  const typePriority: Record<string, number> = {
    halt: 10, earnings: 9, merger: 8, policy: 7, block_trade: 6,
    ipo: 5, index_rebalance: 4, dividend: 3, split: 2,
  };
  return [...events].sort((a, b) => {
    const pa = (typePriority[a.type] ?? 1) * a.magnitude;
    const pb = (typePriority[b.type] ?? 1) * b.magnitude;
    return pb - pa;
  });
}
