/**
 * 事件驱动交易引擎 - 业绩预告/重组/分红/配股/停牌/限售解禁
 */

export interface MarketEvent {
  id: string;
  ticker: string;
  type: 'earnings_pre' | 'restructuring' | 'dividend' | 'rights_offering' |
        'suspension' | 'lockup_expiry' | 'buyback' | 'split' | 'merger' |
        'regulatory' | 'macro' | 'index_rebalance';
  date: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  magnitude: number; // 预期影响幅度(%)
  confidence: number; // 0-1
}

export interface EventImpactAnalysis {
  event: MarketEvent;
  expectedReturn: number; // 事件前后预期收益(%)
  historicalPattern: {
    avgReturn: number;
    winRate: number;
    maxGain: number;
    maxLoss: number;
    avgDuration: number; // 天
  };
  tradingStrategy: {
    action: 'buy' | 'sell' | 'hold' | 'straddle' | 'avoid';
    entryTiming: string;
    exitTiming: string;
    stopLoss: number;
    takeProfit: number;
    riskReward: number;
  };
}

export interface EventCalendar {
  date: string;
  events: MarketEvent[];
  riskLevel: 'low' | 'moderate' | 'high' | 'extreme';
  marketImpact: number; // 综合影响
}

export interface EarningsPreAnnouncement {
  ticker: string;
  type: '预增' | '预减' | '扭亏' | '首亏' | '续亏' | '略增' | '略减';
  period: string;
  expectedEPS?: number;
  lastYearEPS?: number;
  changePct?: number;
  reason?: string;
  signal: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
}

export interface LockupExpiry {
  ticker: string;
  date: string;
  shares: number; // 解禁股数
  totalShares: number;
  ratio: number; // 解禁比例(%)
  holders: number; // 解禁股东数
  avgCost: number; // 平均成本
  currentPrice: number;
  profitLoss: number; // 盈亏比
  pressure: 'high' | 'moderate' | 'low';
  estimatedSelling: number; // 预计卖出比例
}

/**
 * 分析事件影响
 */
export function analyzeEventImpact(event: MarketEvent): EventImpactAnalysis {
  // 历史模式 (简化)
  const patterns: Record<string, EventImpactAnalysis['historicalPattern']> = {
    earnings_pre: { avgReturn: 2.5, winRate: 0.6, maxGain: 8, maxLoss: -5, avgDuration: 3 },
    restructuring: { avgReturn: 5.0, winRate: 0.55, maxGain: 20, maxLoss: -10, avgDuration: 10 },
    dividend: { avgReturn: 0.5, winRate: 0.52, maxGain: 3, maxLoss: -2, avgDuration: 2 },
    rights_offering: { avgReturn: -1.5, winRate: 0.45, maxGain: 2, maxLoss: -5, avgDuration: 5 },
    suspension: { avgReturn: 0, winRate: 0.5, maxGain: 15, maxLoss: -15, avgDuration: 30 },
    lockup_expiry: { avgReturn: -2.0, winRate: 0.4, maxGain: 3, maxLoss: -8, avgDuration: 5 },
    buyback: { avgReturn: 3.0, winRate: 0.65, maxGain: 10, maxLoss: -3, avgDuration: 15 },
    split: { avgReturn: 2.0, winRate: 0.6, maxGain: 8, maxLoss: -4, avgDuration: 5 },
    merger: { avgReturn: 8.0, winRate: 0.5, maxGain: 25, maxLoss: -15, avgDuration: 30 },
    regulatory: { avgReturn: -3.0, winRate: 0.35, maxGain: 5, maxLoss: -20, avgDuration: 10 },
    macro: { avgReturn: -1.0, winRate: 0.45, maxGain: 5, maxLoss: -10, avgDuration: 5 },
    index_rebalance: { avgReturn: 1.0, winRate: 0.55, maxGain: 4, maxLoss: -3, avgDuration: 3 },
  };

  const pattern = patterns[event.type] || patterns.macro;
  const adjustedReturn = pattern.avgReturn * (event.impact === 'positive' ? 1 : event.impact === 'negative' ? -1 : 0) * event.magnitude / 5;

  // 交易策略
  let action: EventImpactAnalysis['tradingStrategy']['action'];
  if (event.impact === 'positive' && event.confidence > 0.7) action = 'buy';
  else if (event.impact === 'negative' && event.confidence > 0.7) action = 'sell';
  else if (event.type === 'suspension') action = 'avoid';
  else if (Math.abs(event.magnitude) > 10 && event.confidence < 0.5) action = 'straddle';
  else action = 'hold';

  const stopLoss = adjustedReturn < 0 ? adjustedReturn * 1.5 : -adjustedReturn * 0.5;
  const takeProfit = adjustedReturn > 0 ? adjustedReturn * 2 : Math.abs(adjustedReturn) * 0.8;
  const riskReward = Math.abs(takeProfit / (stopLoss || 1));

  return {
    event,
    expectedReturn: Math.round(adjustedReturn * 100) / 100,
    historicalPattern: pattern,
    tradingStrategy: {
      action,
      entryTiming: event.impact === 'positive' ? '事件前1-3日' : '事件确认后',
      exitTiming: `持有${pattern.avgDuration}日或达到目标`,
      stopLoss: Math.round(stopLoss * 100) / 100,
      takeProfit: Math.round(takeProfit * 100) / 100,
      riskReward: Math.round(riskReward * 100) / 100,
    },
  };
}

/**
 * 解禁分析
 */
export function analyzeLockupExpiry(
  ticker: string,
  date: string,
  shares: number,
  totalShares: number,
  avgCost: number,
  currentPrice: number,
  holders: number = 10,
): LockupExpiry {
  const ratio = (shares / totalShares) * 100;
  const profitLoss = (currentPrice - avgCost) / avgCost;

  let pressure: LockupExpiry['pressure'];
  if (ratio > 15 && profitLoss > 0.3) pressure = 'high';
  else if (ratio > 8 || profitLoss > 0.5) pressure = 'moderate';
  else pressure = 'low';

  // 预计卖出比例
  let estimatedSelling = 0.3; // 基础30%
  if (profitLoss > 0.5) estimatedSelling += 0.2;
  if (profitLoss > 1) estimatedSelling += 0.15;
  if (ratio > 10) estimatedSelling += 0.1;
  if (holders > 20) estimatedSelling += 0.1;
  estimatedSelling = Math.min(0.8, estimatedSelling);

  return {
    ticker,
    date,
    shares,
    totalShares,
    ratio: Math.round(ratio * 100) / 100,
    holders,
    avgCost: Math.round(avgCost * 100) / 100,
    currentPrice,
    profitLoss: Math.round(profitLoss * 100) / 100,
    pressure,
    estimatedSelling: Math.round(estimatedSelling * 100) / 100,
  };
}

/**
 * 业绩预告分析
 */
export function analyzeEarningsPreAnnouncement(
  ticker: string,
  type: EarningsPreAnnouncement['type'],
  changePct: number,
  period: string,
  reason?: string,
): EarningsPreAnnouncement {
  let signal: EarningsPreAnnouncement['signal'];

  const bullishTypes = ['预增', '扭亏', '略增'];
  const bearishTypes = ['预减', '首亏', '续亏', '略减'];

  if (bullishTypes.includes(type) && changePct > 50) signal = 'strong_bullish';
  else if (bullishTypes.includes(type)) signal = 'bullish';
  else if (bearishTypes.includes(type) && changePct < -50) signal = 'strong_bearish';
  else if (bearishTypes.includes(type)) signal = 'bearish';
  else signal = 'neutral';

  return { ticker, type, period, changePct, reason, signal };
}

/**
 * 事件日历
 */
export function buildEventCalendar(events: MarketEvent[]): EventCalendar[] {
  const calendarMap = new Map<string, MarketEvent[]>();

  events.forEach(e => {
    const existing = calendarMap.get(e.date) || [];
    existing.push(e);
    calendarMap.set(e.date, existing);
  });

  return Array.from(calendarMap.entries())
    .map(([date, dateEvents]) => {
      const totalImpact = dateEvents.reduce((s, e) =>
        s + e.magnitude * (e.impact === 'positive' ? 1 : e.impact === 'negative' ? -1 : 0) * e.confidence, 0);

      let riskLevel: EventCalendar['riskLevel'];
      const highImpactCount = dateEvents.filter(e => e.magnitude > 5).length;
      if (highImpactCount >= 3) riskLevel = 'extreme';
      else if (highImpactCount >= 2) riskLevel = 'high';
      else if (highImpactCount >= 1) riskLevel = 'moderate';
      else riskLevel = 'low';

      return { date, events: dateEvents, riskLevel, marketImpact: Math.round(totalImpact * 100) / 100 };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
