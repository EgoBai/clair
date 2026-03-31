/**
 * Event Calendar Engine
 *
 * Manages and analyzes market events: earnings dates, ex-dividend dates,
 * IPO calendar, lock-up expirations, index rebalancing, and economic events.
 */

export type EventType =
  | 'earnings'
  | 'ex_dividend'
  | 'ipo'
  | 'lockup_expiry'
  | 'index_rebalance'
  | 'economic'
  | 'split'
  | 'merger';

export type EventImpact = 'high' | 'medium' | 'low';

export interface CalendarEvent {
  id: string;
  date: string;
  type: EventType;
  symbol?: string;
  title: string;
  description: string;
  impact: EventImpact;
  estimatedEffect?: number; // expected price impact %
  category: string;
}

export interface EventCluster {
  date: string;
  events: CalendarEvent[];
  riskLevel: 'high' | 'medium' | 'low';
  symbolsAffected: string[];
  recommendedAction: string;
}

export interface EventImpactAnalysis {
  event: CalendarEvent;
  historicalImpact: {
    avgAbsChange: number;
    positiveRate: number;
    maxGain: number;
    maxLoss: number;
    sampleSize: number;
  };
  similarEvents: CalendarEvent[];
  riskAdjustedScore: number;
}

export interface EventFilter {
  types?: EventType[];
  startDate?: string;
  endDate?: string;
  symbols?: string[];
  minImpact?: EventImpact;
}

/**
 * Parse and categorize calendar events
 */
export function parseEvents(rawEvents: {
  date: string;
  type: string;
  symbol?: string;
  title: string;
  description?: string;
}[]): CalendarEvent[] {
  return rawEvents.map((e, i) => {
    const type = e.type as EventType;
    let impact: EventImpact = 'low';
    let category = 'general';

    switch (type) {
      case 'earnings':
        impact = 'high';
        category = 'corporate';
        break;
      case 'ex_dividend':
        impact = 'low';
        category = 'corporate';
        break;
      case 'ipo':
        impact = 'medium';
        category = 'market';
        break;
      case 'lockup_expiry':
        impact = 'medium';
        category = 'corporate';
        break;
      case 'index_rebalance':
        impact = 'medium';
        category = 'market';
        break;
      case 'economic':
        impact = 'high';
        category = 'macro';
        break;
      case 'split':
        impact = 'low';
        category = 'corporate';
        break;
      case 'merger':
        impact = 'high';
        category = 'corporate';
        break;
    }

    return {
      id: `event_${i}`,
      date: e.date,
      type,
      symbol: e.symbol,
      title: e.title,
      description: e.description || '',
      impact,
      category,
    };
  });
}

/**
 * Filter events
 */
export function filterEvents(events: CalendarEvent[], filter: EventFilter): CalendarEvent[] {
  return events.filter(e => {
    if (filter.types && !filter.types.includes(e.type)) return false;
    if (filter.startDate && e.date < filter.startDate) return false;
    if (filter.endDate && e.date > filter.endDate) return false;
    if (filter.symbols) {
      if (!e.symbol || !filter.symbols.includes(e.symbol)) return false;
    }
    if (filter.minImpact) {
      const levels = { low: 0, medium: 1, high: 2 };
      if (levels[e.impact] < levels[filter.minImpact]) return false;
    }
    return true;
  });
}

/**
 * Detect event clusters (multiple events on same/nearby dates)
 */
export function detectEventClusters(
  events: CalendarEvent[],
  clusterWindow: number = 2 // days
): EventCluster[] {
  const dateMap = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const dateKey = event.date;
    if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
    dateMap.get(dateKey)!.push(event);
  }

  const clusters: EventCluster[] = [];

  for (const [date, dateEvents] of dateMap) {
    if (dateEvents.length < 2) continue;

    const symbolsAffected = [...new Set(dateEvents.filter(e => e.symbol).map(e => e.symbol!))];
    const highImpactCount = dateEvents.filter(e => e.impact === 'high').length;

    let riskLevel: EventCluster['riskLevel'];
    if (highImpactCount >= 2 || dateEvents.length >= 5) riskLevel = 'high';
    else if (highImpactCount >= 1 || dateEvents.length >= 3) riskLevel = 'medium';
    else riskLevel = 'low';

    let recommendedAction = '';
    if (riskLevel === 'high') recommendedAction = '考虑减仓或对冲';
    else if (riskLevel === 'medium') recommendedAction = '关注事件进展，准备应对方案';
    else recommendedAction = '正常监控';

    clusters.push({
      date,
      events: dateEvents,
      riskLevel,
      symbolsAffected,
      recommendedAction,
    });
  }

  return clusters.sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });
}

/**
 * Get upcoming events for a symbol
 */
export function getUpcomingEvents(
  events: CalendarEvent[],
  symbol: string,
  daysAhead: number = 30
): CalendarEvent[] {
  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return filterEvents(events, {
    symbols: [symbol],
    startDate: today,
    endDate,
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Analyze event impact based on historical patterns
 */
export function analyzeEventImpact(
  event: CalendarEvent,
  historicalEvents: CalendarEvent[],
  priceData: Record<string, number[]>
): EventImpactAnalysis {
  // Find similar events
  const similar = historicalEvents.filter(e =>
    e.type === event.type &&
    (event.symbol ? e.symbol === event.symbol : true)
  );

  // Calculate historical impact
  let totalAbsChange = 0;
  let positiveCount = 0;
  let maxGain = 0;
  let maxLoss = 0;
  let sampleSize = 0;

  for (const histEvent of similar) {
    if (histEvent.estimatedEffect !== undefined) {
      const change = histEvent.estimatedEffect;
      totalAbsChange += Math.abs(change);
      if (change > 0) positiveCount++;
      if (change > maxGain) maxGain = change;
      if (change < maxLoss) maxLoss = change;
      sampleSize++;
    }
  }

  const historicalImpact = {
    avgAbsChange: sampleSize > 0 ? totalAbsChange / sampleSize : 0,
    positiveRate: sampleSize > 0 ? positiveCount / sampleSize : 0.5,
    maxGain,
    maxLoss,
    sampleSize,
  };

  // Risk-adjusted score
  const impactLevels = { low: 1, medium: 2, high: 3 };
  const riskAdjustedScore = impactLevels[event.impact] * historicalImpact.avgAbsChange;

  return {
    event,
    historicalImpact,
    similarEvents: similar.slice(0, 5),
    riskAdjustedScore,
  };
}

/**
 * Generate event risk calendar
 */
export function generateRiskCalendar(
  events: CalendarEvent[],
  startDate: string,
  endDate: string
): { date: string; riskScore: number; eventCount: number; highImpactCount: number }[] {
  const calendar: { date: string; riskScore: number; eventCount: number; highImpactCount: number }[] = [];

  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayEvents = events.filter(e => e.date === dateStr);

    const eventCount = dayEvents.length;
    const highImpactCount = dayEvents.filter(e => e.impact === 'high').length;

    const riskScore = highImpactCount * 30 + (eventCount - highImpactCount) * 10;

    calendar.push({ date: dateStr, riskScore: Math.min(100, riskScore), eventCount, highImpactCount });
  }

  return calendar;
}
