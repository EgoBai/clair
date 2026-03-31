/**
 * Macro Calendar Engine
 * 
 * 宏观经济日历引擎 - 分析经济事件、日历效应、市场影响
 */

export interface EconomicEvent {
  id: string;
  name: string;
  date: string;
  country: 'CN' | 'US' | 'EU' | 'JP';
  importance: 'high' | 'medium' | 'low';
  actual?: number;
  forecast?: number;
  previous?: number;
  unit: string;
  category: 'gdp' | 'inflation' | 'employment' | 'trade' | 'monetary' | 'pmi' | 'other';
}

export interface CalendarEffect {
  effect: 'bullish' | 'bearish' | 'neutral';
  name: string;
  description: string;
  confidence: number;
  historicalReturn: number;
}

export interface MacroAnalysis {
  upcomingEvents: EconomicEvent[];
  surpriseIndex: number;
  calendarEffects: CalendarEffect[];
  riskEvents: EconomicEvent[];
  monetaryPolicyStance: 'dovish' | 'hawkish' | 'neutral';
  economicCycle: 'expansion' | 'peak' | 'contraction' | 'trough';
  compositeScore: number;
}

// ===== Event Impact Assessment =====

export function assessEventImpact(
  event: EconomicEvent
): { impact: 'positive' | 'negative' | 'neutral'; magnitude: number } {
  if (event.actual === undefined || event.forecast === undefined) {
    return { impact: 'neutral', magnitude: 0 };
  }

  const surprise = event.actual - event.forecast;
  const range = Math.abs(event.forecast) || 1;
  const surprisePct = surprise / range;

  // Inflation data - higher than expected is negative
  if (event.category === 'inflation') {
    if (surprisePct > 0.05)
      return { impact: 'negative', magnitude: Math.min(1, Math.abs(surprisePct) * 5) };
    if (surprisePct < -0.05)
      return { impact: 'positive', magnitude: Math.min(1, Math.abs(surprisePct) * 5) };
  }

  // GDP/PMI/Employment - higher is positive
  if (['gdp', 'pmi', 'employment'].includes(event.category)) {
    if (surprisePct > 0.05)
      return { impact: 'positive', magnitude: Math.min(1, Math.abs(surprisePct) * 5) };
    if (surprisePct < -0.05)
      return { impact: 'negative', magnitude: Math.min(1, Math.abs(surprisePct) * 5) };
  }

  return { impact: 'neutral', magnitude: 0 };
}

// ===== Surprise Index =====

export function calculateSurpriseIndex(
  events: EconomicEvent[]
): number {
  const completedEvents = events.filter(
    (e) => e.actual !== undefined && e.forecast !== undefined
  );

  if (completedEvents.length === 0) return 0;

  let surpriseSum = 0;
  let weightSum = 0;

  for (const event of completedEvents) {
    const weight = event.importance === 'high' ? 3 : event.importance === 'medium' ? 2 : 1;
    const surprise = (event.actual! - event.forecast!) / (Math.abs(event.forecast!) || 1);
    surpriseSum += surprise * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? Math.round((surpriseSum / weightSum) * 1000) / 10 : 0;
}

// ===== Calendar Effects =====

export function detectCalendarEffects(
  currentDate: Date
): CalendarEffect[] {
  const effects: CalendarEffect[] = [];
  const month = currentDate.getMonth(); // 0-indexed
  const dayOfMonth = currentDate.getDate();
  const dayOfWeek = currentDate.getDay();

  // January effect
  if (month === 0 && dayOfMonth <= 15) {
    effects.push({
      effect: 'bullish',
      name: '一月效应',
      description: '历史上一月前半月市场倾向于上涨',
      confidence: 0.65,
      historicalReturn: 0.02,
    });
  }

  // Sell in May
  if (month >= 4 && month <= 9) {
    effects.push({
      effect: 'bearish',
      name: 'Sell in May',
      description: '5-10月历史上收益较低',
      confidence: 0.55,
      historicalReturn: -0.01,
    });
  }

  // Friday effect
  if (dayOfWeek === 5) {
    effects.push({
      effect: 'bearish',
      name: '周五效应',
      description: '周五倾向于获利了结',
      confidence: 0.5,
      historicalReturn: -0.002,
    });
  }

  // Monday effect
  if (dayOfWeek === 1) {
    effects.push({
      effect: 'bearish',
      name: '周一效应',
      description: '周一倾向于补跌',
      confidence: 0.5,
      historicalReturn: -0.001,
    });
  }

  // Month-end rebalancing
  if (dayOfMonth >= 25) {
    effects.push({
      effect: 'neutral',
      name: '月末调仓',
      description: '机构月末调仓效应',
      confidence: 0.6,
      historicalReturn: 0,
    });
  }

  return effects;
}

// ===== Risk Events =====

export function identifyRiskEvents(
  events: EconomicEvent[],
  daysAhead: number = 7
): EconomicEvent[] {
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return events
    .filter((e) => {
      const eventDate = new Date(e.date);
      return eventDate >= now && eventDate <= futureDate && e.importance === 'high';
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ===== Monetary Policy Stance =====

export function assessMonetaryStance(
  events: EconomicEvent[]
): 'dovish' | 'hawkish' | 'neutral' {
  const monetaryEvents = events.filter((e) => e.category === 'monetary');

  if (monetaryEvents.length === 0) return 'neutral';

  let stance = 0;
  for (const event of monetaryEvents) {
    if (event.actual !== undefined && event.previous !== undefined) {
      if (event.name.includes('利率') || event.name.includes('rate')) {
        if (event.actual > event.previous) stance += 1; // Hawkish
        if (event.actual < event.previous) stance -= 1; // Dovish
      }
    }
  }

  if (stance > 0) return 'hawkish';
  if (stance < 0) return 'dovish';
  return 'neutral';
}

// ===== Economic Cycle =====

export function classifyEconomicCycle(
  events: EconomicEvent[]
): 'expansion' | 'peak' | 'contraction' | 'trough' {
  const pmiEvents = events.filter((e) => e.category === 'pmi' && e.actual !== undefined);
  const gdpEvents = events.filter((e) => e.category === 'gdp' && e.actual !== undefined);

  if (pmiEvents.length === 0) return 'expansion';

  const latestPMI = pmiEvents[pmiEvents.length - 1].actual!;

  if (latestPMI > 52) return 'expansion';
  if (latestPMI > 50 && latestPMI <= 52) return 'peak';
  if (latestPMI >= 48 && latestPMI <= 50) return 'contraction';
  return 'trough';
}

// ===== Full Macro Analysis =====

export function analyzeMacroCalendar(
  events: EconomicEvent[],
  currentDate: Date = new Date()
): MacroAnalysis {
  const upcoming = events
    .filter((e) => new Date(e.date) >= currentDate)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 10);

  const surpriseIndex = calculateSurpriseIndex(events);
  const calendarEffects = detectCalendarEffects(currentDate);
  const riskEvents = identifyRiskEvents(events);
  const monetaryStance = assessMonetaryStance(events);
  const economicCycle = classifyEconomicCycle(events);

  // Composite score (-100 to 100)
  let compositeScore = 0;
  compositeScore += surpriseIndex * 5; // Economic surprises
  compositeScore += calendarEffects.reduce((s, e) => {
    return s + (e.effect === 'bullish' ? e.confidence * 10 : e.effect === 'bearish' ? -e.confidence * 10 : 0);
  }, 0);
  compositeScore -= riskEvents.length * 5; // Risk events subtract

  if (monetaryStance === 'dovish') compositeScore += 10;
  if (monetaryStance === 'hawkish') compositeScore -= 10;

  if (economicCycle === 'expansion') compositeScore += 15;
  if (economicCycle === 'trough') compositeScore += 5;
  if (economicCycle === 'contraction') compositeScore -= 10;

  compositeScore = Math.max(-100, Math.min(100, compositeScore));

  return {
    upcomingEvents: upcoming,
    surpriseIndex,
    calendarEffects,
    riskEvents,
    monetaryPolicyStance: monetaryStance,
    economicCycle,
    compositeScore: Math.round(compositeScore),
  };
}
