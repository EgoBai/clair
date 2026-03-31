/**
 * Earnings Surprise Analysis Engine
 *
 * Analyzes earnings surprises (SUE), post-earnings-announcement drift (PEAD),
 * earnings quality, and revision momentum.
 */

// ==================== Types ====================

export interface EarningsRecord {
  date: string;
  actualEPS: number;
  estimatedEPS: number;
  revenue: number;
  estimatedRevenue: number;
  quarter: string;
}

export interface EarningsSurprise {
  date: string;
  epsSurprise: number;
  epsSurprisePercent: number;
  revenueSurprise: number;
  revenueSurprisePercent: number;
  standardizedSurprise: number; // SUE
  magnitude: 'small' | 'moderate' | 'large' | 'massive';
  direction: 'beat' | 'miss' | 'meet';
}

export interface PEADResult {
  days: number[];
  cumulativeReturns: number[];
  driftMagnitude: number;
  significanceLevel: number;
  halfLife: number; // days for half the drift to occur
}

export interface EarningsQuality {
  score: number; // 0-100
  accrualRatio: number;
  cashFlowAdequacy: number;
  revenueQuality: number;
  consistency: number;
  flags: string[];
}

export interface RevisionMomentum {
  symbol: string;
  currentEstimate: number;
  estimate30dAgo: number;
  estimate90dAgo: number;
  revisionPercent30d: number;
  revisionPercent90d: number;
  revisionDirection: 'up' | 'down' | 'stable';
  revisionAcceleration: number;
  analystCount: number;
  consensusDispersion: number;
}

export interface EarningsGrowthAnalysis {
  symbol: string;
  yoyEpsGrowth: number[];
  qoqEpsGrowth: number[];
  averageGrowth: number;
  growthAcceleration: number;
  growthConsistency: number;
  earningsCAGR3Y: number;
  revenueGrowthTrend: number[];
}

export interface EarningsSeasonality {
  quarter: string;
  averageSurprise: number;
  beatRate: number;
  averageMagnitude: number;
  volatility: number;
}

export interface EarningsCalendarEvent {
  date: string;
  symbol: string;
  eventType: 'earnings' | 'guidance' | 'dividend';
  estimatedEPS?: number;
  importance: 'low' | 'medium' | 'high';
}

// ==================== Core Functions ====================

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/**
 * Calculate standardized unexpected earnings (SUE)
 */
export function calculateSUE(earnings: EarningsRecord[]): EarningsSurprise[] {
  if (earnings.length === 0) return [];

  // Calculate rolling std of past surprises for standardization
  const surprises = earnings.map(e => e.actualEPS - e.estimatedEPS);
  const rollingStd = surprises.map((_, i) => {
    const window = surprises.slice(Math.max(0, i - 7), i + 1);
    return std(window) || 1;
  });

  return earnings.map((e, i) => {
    const epsSurprise = e.actualEPS - e.estimatedEPS;
    const epsSurprisePercent = e.estimatedEPS === 0
      ? (epsSurprise !== 0 ? 100 : 0)
      : (epsSurprise / Math.abs(e.estimatedEPS)) * 100;
    const revenueSurprise = e.revenue - e.estimatedRevenue;
    const revenueSurprisePercent = e.estimatedRevenue === 0
      ? 0
      : (revenueSurprise / Math.abs(e.estimatedRevenue)) * 100;
    const sue = epsSurprise / rollingStd[i];

    let magnitude: EarningsSurprise['magnitude'];
    const absSurprise = Math.abs(epsSurprisePercent);
    if (absSurprise > 50) magnitude = 'massive';
    else if (absSurprise > 20) magnitude = 'large';
    else if (absSurprise > 5) magnitude = 'moderate';
    else magnitude = 'small';

    let direction: EarningsSurprise['direction'];
    if (epsSurprise > 0.005) direction = 'beat';
    else if (epsSurprise < -0.005) direction = 'miss';
    else direction = 'meet';

    return {
      date: e.date,
      epsSurprise,
      epsSurprisePercent,
      revenueSurprise,
      revenueSurprisePercent,
      standardizedSurprise: sue,
      magnitude,
      direction,
    };
  });
}

/**
 * Analyze post-earnings-announcement drift (PEAD)
 */
export function analyzePEAD(
  postEarningsReturns: number[][],
  surpriseSigns: number[] // +1 beat, -1 miss
): PEADResult {
  if (postEarningsReturns.length === 0) {
    return { days: [], cumulativeReturns: [], driftMagnitude: 0, significanceLevel: 0, halfLife: 0 };
  }
  const maxDays = Math.min(...postEarningsReturns.map(r => r.length));
  if (maxDays === 0) {
    return { days: [], cumulativeReturns: [], driftMagnitude: 0, significanceLevel: 0, halfLife: 0 };
  }

  const days = Array.from({ length: maxDays }, (_, i) => i + 1);
  const cumulativeReturns: number[] = [];

  for (let d = 0; d < maxDays; d++) {
    let cumRet = 0;
    let count = 0;
    for (let e = 0; e < postEarningsReturns.length; e++) {
      if (postEarningsReturns[e].length > d) {
        cumRet += postEarningsReturns[e][d] * (surpriseSigns[e] || 1);
        count++;
      }
    }
    cumulativeReturns.push(count > 0 ? cumRet / count : 0);
  }

  const driftMagnitude = cumulativeReturns[cumulativeReturns.length - 1] || 0;
  const halfDrift = driftMagnitude / 2;
  let halfLife = maxDays;
  for (let d = 0; d < cumulativeReturns.length; d++) {
    if (Math.abs(cumulativeReturns[d]) >= Math.abs(halfDrift)) {
      halfLife = d + 1;
      break;
    }
  }

  // Simplified significance (t-test on final cumulative return)
  const meanRet = mean(cumulativeReturns);
  const stdRet = std(cumulativeReturns);
  const tStat = stdRet === 0 ? 0 : (meanRet / stdRet) * Math.sqrt(cumulativeReturns.length);
  const significanceLevel = Math.abs(tStat);

  return { days, cumulativeReturns, driftMagnitude, significanceLevel, halfLife };
}

/**
 * Assess earnings quality
 */
export function assessEarningsQuality(
  earnings: EarningsRecord[],
  cashFlows: number[],
  accruals: number[],
  revenues: number[]
): EarningsQuality {
  const flags: string[] = [];

  // Accrual ratio: accruals / average total assets (simplified: accruals / revenue)
  const avgRevenue = revenues.length > 0 ? mean(revenues) : 1;
  const accrualRatio = avgRevenue === 0 ? 0 : mean(accruals) / avgRevenue;

  // Cash flow adequacy: operating CF / net income
  const epsValues = earnings.map(e => e.actualEPS);
  const avgEps = mean(epsValues);
  const avgCashFlow = mean(cashFlows);
  const cashFlowAdequacy = avgEps === 0 ? 0 : avgCashFlow / avgEps;

  // Revenue quality: actual vs estimated consistency
  const revenueDeviations = earnings.map(e =>
    e.estimatedRevenue === 0 ? 0 : (e.revenue - e.estimatedRevenue) / Math.abs(e.estimatedRevenue)
  );
  const revenueQuality = 1 - Math.min(1, std(revenueDeviations));

  // Consistency: EPS growth consistency
  const epsGrowth: number[] = [];
  for (let i = 1; i < epsValues.length; i++) {
    if (epsValues[i - 1] !== 0) {
      epsGrowth.push((epsValues[i] - epsValues[i - 1]) / Math.abs(epsValues[i - 1]));
    }
  }
  const consistency = epsGrowth.length > 0 ? Math.max(0, 1 - std(epsGrowth)) : 0.5;

  // Flags
  if (accrualRatio > 0.1) flags.push('HIGH_ACCRUALS');
  if (cashFlowAdequacy < 0.8) flags.push('LOW_CASH_FLOW');
  if (revenueQuality < 0.5) flags.push('REVENUE_VOLATILITY');
  if (consistency < 0.3) flags.push('INCONSISTENT_EARNINGS');

  const score = Math.round(
    Math.max(0, Math.min(100,
      (1 - Math.abs(accrualRatio)) * 25 +
      Math.min(1, cashFlowAdequacy) * 25 +
      revenueQuality * 25 +
      consistency * 25
    ))
  );

  return { score, accrualRatio, cashFlowAdequacy, revenueQuality, consistency, flags };
}

/**
 * Calculate revision momentum
 */
export function calculateRevisionMomentum(
  symbol: string,
  currentEstimate: number,
  estimate30dAgo: number,
  estimate90dAgo: number,
  estimateHistory: number[],
  analystCount: number
): RevisionMomentum {
  const revisionPercent30d = estimate30dAgo === 0
    ? 0
    : ((currentEstimate - estimate30dAgo) / Math.abs(estimate30dAgo)) * 100;
  const revisionPercent90d = estimate90dAgo === 0
    ? 0
    : ((currentEstimate - estimate90dAgo) / Math.abs(estimate90dAgo)) * 100;

  let revisionDirection: RevisionMomentum['revisionDirection'];
  if (revisionPercent30d > 1) revisionDirection = 'up';
  else if (revisionPercent30d < -1) revisionDirection = 'down';
  else revisionDirection = 'stable';

  // Acceleration: is revision speeding up?
  const recentChange = Math.abs(revisionPercent30d);
  const longerChange = Math.abs(revisionPercent90d / 3); // monthly rate
  const revisionAcceleration = recentChange - longerChange;

  // Consensus dispersion
  const consensusDispersion = std(estimateHistory);

  return {
    symbol,
    currentEstimate,
    estimate30dAgo,
    estimate90dAgo,
    revisionPercent30d,
    revisionPercent90d,
    revisionDirection,
    revisionAcceleration,
    analystCount,
    consensusDispersion,
  };
}

/**
 * Analyze earnings growth patterns
 */
export function analyzeEarningsGrowth(
  symbol: string,
  epsHistory: number[],
  revenueHistory: number[]
): EarningsGrowthAnalysis {
  // YoY growth (comparing same quarters, simplified as sequential here)
  const yoyEpsGrowth: number[] = [];
  for (let i = 4; i < epsHistory.length; i++) {
    if (epsHistory[i - 4] !== 0) {
      yoyEpsGrowth.push(((epsHistory[i] - epsHistory[i - 4]) / Math.abs(epsHistory[i - 4])) * 100);
    }
  }

  // QoQ growth
  const qoqEpsGrowth: number[] = [];
  for (let i = 1; i < epsHistory.length; i++) {
    if (epsHistory[i - 1] !== 0) {
      qoqEpsGrowth.push(((epsHistory[i] - epsHistory[i - 1]) / Math.abs(epsHistory[i - 1])) * 100);
    }
  }

  const averageGrowth = mean(yoyEpsGrowth);

  // Growth acceleration: recent growth - historical growth
  const recentGrowth = mean(yoyEpsGrowth.slice(-4));
  const historicalGrowth = mean(yoyEpsGrowth.slice(0, -4));
  const growthAcceleration = recentGrowth - historicalGrowth;

  // Growth consistency
  const growthConsistency = yoyEpsGrowth.length > 1 ? Math.max(0, 1 - std(yoyEpsGrowth) / 100) : 0.5;

  // 3Y CAGR
  const periods = Math.min(12, epsHistory.length);
  const earningsCAGR3Y = periods >= 2 && epsHistory[epsHistory.length - periods] > 0
    ? ((epsHistory[epsHistory.length - 1] / epsHistory[epsHistory.length - periods]) **
      (1 / (periods / 4)) - 1) * 100
    : 0;

  // Revenue growth trend
  const revenueGrowthTrend: number[] = [];
  for (let i = 1; i < revenueHistory.length; i++) {
    if (revenueHistory[i - 1] !== 0) {
      revenueGrowthTrend.push(((revenueHistory[i] - revenueHistory[i - 1]) / Math.abs(revenueHistory[i - 1])) * 100);
    }
  }

  return {
    symbol,
    yoyEpsGrowth,
    qoqEpsGrowth,
    averageGrowth,
    growthAcceleration,
    growthConsistency,
    earningsCAGR3Y,
    revenueGrowthTrend,
  };
}

/**
 * Analyze earnings seasonality patterns
 */
export function analyzeSeasonality(surprises: EarningsSurprise[], quarters: string[]): EarningsSeasonality[] {
  const quarterMap = new Map<string, { surprises: number[]; beats: number; magnitudes: number[] }>();

  for (let i = 0; i < surprises.length && i < quarters.length; i++) {
    const q = quarters[i];
    if (!quarterMap.has(q)) {
      quarterMap.set(q, { surprises: [], beats: 0, magnitudes: [] });
    }
    const data = quarterMap.get(q)!;
    data.surprises.push(surprises[i].epsSurprisePercent);
    if (surprises[i].direction === 'beat') data.beats++;
    data.magnitudes.push(Math.abs(surprises[i].epsSurprisePercent));
  }

  const results: EarningsSeasonality[] = [];
  for (const [quarter, data] of quarterMap) {
    results.push({
      quarter,
      averageSurprise: mean(data.surprises),
      beatRate: data.surprises.length === 0 ? 0 : data.beats / data.surprises.length,
      averageMagnitude: mean(data.magnitudes),
      volatility: std(data.surprises),
    });
  }

  return results.sort((a, b) => a.quarter.localeCompare(b.quarter));
}

/**
 * Build earnings calendar
 */
export function buildEarningsCalendar(
  symbols: string[],
  historicalEarnings: Record<string, EarningsRecord[]>,
  futureDates: string[]
): EarningsCalendarEvent[] {
  const events: EarningsCalendarEvent[] = [];

  for (const symbol of symbols) {
    const history = historicalEarnings[symbol] || [];

    // Add historical earnings
    for (const e of history) {
      events.push({
        date: e.date,
        symbol,
        eventType: 'earnings',
        estimatedEPS: e.estimatedEPS,
        importance: Math.abs(e.actualEPS - e.estimatedEPS) > Math.abs(e.estimatedEPS) * 0.1 ? 'high' : 'medium',
      });
    }

    // Add future dates
    for (const d of futureDates) {
      events.push({
        date: d,
        symbol,
        eventType: 'earnings',
        importance: 'medium',
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate earnings momentum score
 */
export function earningsMomentumScore(
  surprises: EarningsSurprise[],
  revision: RevisionMomentum
): number {
  let score = 50; // neutral

  // Recent surprise direction
  const recentSurprises = surprises.slice(-4);
  const beatCount = recentSurprises.filter(s => s.direction === 'beat').length;
  const missCount = recentSurprises.filter(s => s.direction === 'miss').length;
  score += (beatCount - missCount) * 5;

  // Surprise magnitude trend
  if (recentSurprises.length >= 2) {
    const recent = recentSurprises.slice(-2);
    const earlier = recentSurprises.slice(0, -2);
    if (earlier.length > 0) {
      const recentAvg = mean(recent.map(s => Math.abs(s.epsSurprisePercent)));
      const earlierAvg = mean(earlier.map(s => Math.abs(s.epsSurprisePercent)));
      if (recentAvg > earlierAvg) score += 10;
      else score -= 5;
    }
  }

  // Revision momentum
  if (revision.revisionDirection === 'up') score += 15;
  else if (revision.revisionDirection === 'down') score -= 15;

  // Revision acceleration
  if (revision.revisionAcceleration > 0) score += 5;
  else if (revision.revisionAcceleration < 0) score -= 5;

  return Math.max(0, Math.min(100, score));
}
