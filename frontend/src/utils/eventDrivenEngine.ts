/**
 * 事件驱动分析引擎
 * 分析股票事件（财报/并购/分红/股权激励等）对股价的影响
 */

export interface StockEvent {
  ticker: string;
  type: 'earnings' | 'ma' | 'dividend' | 'buyback' | 'split' | 'incentive' | 'policy' | 'black_swan';
  date: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  sentiment: 'positive' | 'negative' | 'neutral';
  data: Record<string, unknown>;
}

export interface EventImpact {
  event: StockEvent;
  preEventReturn: number;
  postEventReturn: number;
  abnormalReturn: number;
  volumeChange: number;
  volatilityChange: number;
  impactScore: number;
}

export interface EventPattern {
  eventType: StockEvent['type'];
  avgImpact: number;
  winRate: number;
  avgDuration: number; // days
  bestSector: string;
  worstSector: string;
}

export interface EventCalendar {
  date: string;
  events: StockEvent[];
  marketImpact: 'high' | 'medium' | 'low';
  affectedSectors: string[];
}

export interface CatalystScore {
  ticker: string;
  score: number;
  upcomingEvents: StockEvent[];
  historicalImpact: number;
  recommendation: 'strong_positive' | 'positive' | 'neutral' | 'negative' | 'strong_negative';
}

export function classifyEventImpact(event: StockEvent): number {
  const typeWeights: Record<StockEvent['type'], number> = {
    earnings: 0.8,
    ma: 0.9,
    dividend: 0.5,
    buyback: 0.6,
    split: 0.3,
    incentive: 0.4,
    policy: 0.7,
    black_swan: 1.0,
  };
  
  const importanceMultiplier: Record<StockEvent['importance'], number> = {
    high: 1.0,
    medium: 0.6,
    low: 0.3,
  };
  
  const sentimentSign = event.sentiment === 'positive' ? 1 : event.sentiment === 'negative' ? -1 : 0;
  
  return sentimentSign * typeWeights[event.type] * importanceMultiplier[event.importance] * 100;
}

export function calculateEventImpact(
  event: StockEvent,
  priceBefore: number[],
  priceAfter: number[],
  marketReturns: number[]
): EventImpact {
  const preEventReturn = priceBefore.length >= 2 
    ? (priceBefore[priceBefore.length - 1] - priceBefore[0]) / priceBefore[0] 
    : 0;
  const postEventReturn = priceAfter.length >= 2 
    ? (priceAfter[priceAfter.length - 1] - priceAfter[0]) / priceAfter[0] 
    : 0;
  
  const marketReturn = marketReturns.length >= 2 
    ? (marketReturns[marketReturns.length - 1] - marketReturns[0]) / marketReturns[0] 
    : 0;
  const abnormalReturn = postEventReturn - marketReturn;
  
  // Volume change (placeholder)
  const volumeChange = Math.abs(postEventReturn) * 2;
  
  // Volatility change
  const preVol = calculateVolatility(priceBefore);
  const postVol = calculateVolatility(priceAfter);
  const volatilityChange = preVol !== 0 ? (postVol - preVol) / preVol : 0;
  
  const impactScore = Math.abs(abnormalReturn) * 50 + Math.abs(volatilityChange) * 20 + volumeChange * 10;
  
  return { event, preEventReturn, postEventReturn, abnormalReturn, volumeChange, volatilityChange, impactScore };
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns = prices.slice(1).map((p, i) => prices[i] !== 0 ? (p - prices[i]) / prices[i] : 0);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

export function analyzeEventPatterns(impacts: EventImpact[]): EventPattern[] {
  const patternMap = new Map<StockEvent['type'], EventImpact[]>();
  
  for (const impact of impacts) {
    const type = impact.event.type;
    if (!patternMap.has(type)) patternMap.set(type, []);
    patternMap.get(type)!.push(impact);
  }
  
  const patterns: EventPattern[] = [];
  patternMap.forEach((group, eventType) => {
    const avgImpact = group.reduce((s, i) => s + i.abnormalReturn, 0) / group.length;
    const winRate = group.filter(i => i.abnormalReturn > 0).length / group.length;
    const avgDuration = group.reduce((s, i) => s + (i.event.data.durationDays as number || 5), 0) / group.length;
    
    patterns.push({
      eventType,
      avgImpact,
      winRate,
      avgDuration,
      bestSector: '',
      worstSector: '',
    });
  });
  
  return patterns.sort((a, b) => Math.abs(b.avgImpact) - Math.abs(a.avgImpact));
}

export function buildEventCalendar(events: StockEvent[], startDate: string, endDate: string): EventCalendar[] {
  const calendar: EventCalendar[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayEvents = events.filter(e => e.date === dateStr);
    
    if (dayEvents.length > 0) {
      const highImportance = dayEvents.filter(e => e.importance === 'high').length;
      const marketImpact: EventCalendar['marketImpact'] = highImportance >= 2 ? 'high' : highImportance >= 1 ? 'medium' : 'low';
      
      const affectedSectors = [...new Set(dayEvents.map(e => e.data.sector as string).filter(Boolean))];
      
      calendar.push({ date: dateStr, events: dayEvents, marketImpact, affectedSectors });
    }
  }
  
  return calendar;
}

export function calculateCatalystScore(
  ticker: string,
  upcomingEvents: StockEvent[],
  historicalImpacts: EventImpact[]
): CatalystScore {
  const relevantImpacts = historicalImpacts.filter(i => i.event.ticker === ticker);
  const historicalImpact = relevantImpacts.length > 0 
    ? relevantImpacts.reduce((s, i) => s + i.abnormalReturn, 0) / relevantImpacts.length 
    : 0;
  
  let score = 50; // Neutral base
  
  // Upcoming events contribution
  for (const event of upcomingEvents) {
    const impact = classifyEventImpact(event);
    score += impact * 0.3;
  }
  
  // Historical impact contribution
  score += historicalImpact * 100;
  
  score = Math.max(0, Math.min(100, score));
  
  let recommendation: CatalystScore['recommendation'];
  if (score > 75) recommendation = 'strong_positive';
  else if (score > 60) recommendation = 'positive';
  else if (score > 40) recommendation = 'neutral';
  else if (score > 25) recommendation = 'negative';
  else recommendation = 'strong_negative';
  
  return { ticker, score, upcomingEvents, historicalImpact, recommendation };
}

export function predictEarningsReaction(
  actualEPS: number,
  estimatedEPS: number,
  historicalSurprises: number[]
): { expectedMove: number; confidence: number; direction: 'up' | 'down' | 'flat' } {
  const surprise = estimatedEPS !== 0 ? (actualEPS - estimatedEPS) / Math.abs(estimatedEPS) : 0;
  
  // Use historical surprise-response relationship
  let avgResponse = 0;
  if (historicalSurprises.length >= 2) {
    for (let i = 0; i < historicalSurprises.length - 1; i += 2) {
      avgResponse += historicalSurprises[i + 1] / (historicalSurprises[i] || 1);
    }
    avgResponse /= (historicalSurprises.length / 2);
  } else {
    avgResponse = 2; // Default multiplier
  }
  
  const expectedMove = surprise * avgResponse;
  const confidence = Math.min(1, Math.abs(surprise) * 2 + 0.3);
  const direction = expectedMove > 0.005 ? 'up' : expectedMove < -0.005 ? 'down' : 'flat';
  
  return { expectedMove, confidence, direction };
}

export function detectEventClusters(
  events: StockEvent[],
  windowDays: number = 7
): { center: string; events: StockEvent[]; clusterScore: number }[] {
  const clusters: { center: string; events: StockEvent[]; clusterScore: number }[] = [];
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  
  let i = 0;
  while (i < sorted.length) {
    const cluster: StockEvent[] = [sorted[i]];
    const centerDate = new Date(sorted[i].date);
    
    for (let j = i + 1; j < sorted.length; j++) {
      const eventDate = new Date(sorted[j].date);
      const diffDays = Math.abs(eventDate.getTime() - centerDate.getTime()) / 86400000;
      if (diffDays <= windowDays) {
        cluster.push(sorted[j]);
      } else break;
    }
    
    if (cluster.length >= 2) {
      const clusterScore = cluster.reduce((s, e) => s + classifyEventImpact(e), 0);
      clusters.push({
        center: sorted[i].date,
        events: cluster,
        clusterScore,
      });
      i += cluster.length;
    } else {
      i++;
    }
  }
  
  return clusters.sort((a, b) => Math.abs(b.clusterScore) - Math.abs(a.clusterScore));
}
