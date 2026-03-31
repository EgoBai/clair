/**
 * 事件驱动策略引擎 (Event-Driven Strategy Engine)
 * - 业绩预告/快报事件
 * - 分红送转事件
 * - 重组并购事件
 * - 股权激励事件
 * - 事件影响评估
 * - 事件组合策略
 */

export interface MarketEvent {
  id: string;
  type: 'earnings_preview' | 'earnings_report' | 'dividend' | 'bonus' | 'split'
    | 'restructuring' | 'equity_incentive' | 'ipo' | 'delisting' | 'major_order';
  stock: string;
  date: string;
  details: Record<string, number | string>;
  impact: 'positive' | 'negative' | 'neutral';
  significance: number; // 0-100
}

export interface EventImpact {
  eventType: string;
  avgReturn: number;
  winRate: number;
  sampleSize: number;
  bestReturn: number;
  worstReturn: number;
  holdingPeriod: number; // 最优持有期(天)
  decayRate: number;
}

export interface EventSignal {
  event: MarketEvent;
  expectedReturn: number;
  confidence: number;
  entryTiming: 'before' | 'at' | 'after';
  exitDays: number;
  riskLevel: 'low' | 'medium' | 'high';
  reasoning: string;
}

export interface EventCalendar {
  date: string;
  events: MarketEvent[];
  marketImpact: number;
  sectorExposure: string[];
}

/**
 * 评估业绩预告事件
 */
export function evaluateEarningsPreview(
  stock: string,
  date: string,
  profitChange: number,
  revenueChange: number
): EventSignal {
  const isPositive = profitChange > 20;
  const isNegative = profitChange < -20;

  const expectedReturn = profitChange * 0.3 + revenueChange * 0.1;
  const confidence = Math.min(100, Math.abs(profitChange) / 2);

  let reasoning: string;
  if (isPositive) {
    reasoning = `业绩预增${profitChange.toFixed(0)}%，超预期概率高`;
  } else if (isNegative) {
    reasoning = `业绩预减${profitChange.toFixed(0)}%，存在下行风险`;
  } else {
    reasoning = `业绩变动${profitChange.toFixed(0)}%，符合预期`;
  }

  return {
    event: {
      id: `ep_${stock}_${date}`,
      type: 'earnings_preview',
      stock,
      date,
      details: { profitChange, revenueChange },
      impact: isPositive ? 'positive' : isNegative ? 'negative' : 'neutral',
      significance: confidence,
    },
    expectedReturn: Math.round(expectedReturn * 100) / 100,
    confidence,
    entryTiming: isPositive ? 'before' : 'after',
    exitDays: isPositive ? 5 : 10,
    riskLevel: Math.abs(profitChange) > 50 ? 'high' : 'medium',
    reasoning,
  };
}

/**
 * 评估分红事件
 */
export function evaluateDividendEvent(
  stock: string,
  date: string,
  dividendPerShare: number,
  currentPrice: number
): EventSignal {
  const dividendYield = currentPrice > 0 ? dividendPerShare / currentPrice * 100 : 0;
  const isHighYield = dividendYield > 3;
  const expectedReturn = dividendYield * 0.5;
  const confidence = Math.min(100, dividendYield * 20);

  return {
    event: {
      id: `div_${stock}_${date}`,
      type: 'dividend',
      stock,
      date,
      details: { dividendPerShare, dividendYield },
      impact: isHighYield ? 'positive' : 'neutral',
      significance: confidence,
    },
    expectedReturn: Math.round(expectedReturn * 100) / 100,
    confidence,
    entryTiming: 'before',
    exitDays: isHighYield ? 10 : 5,
    riskLevel: 'low',
    reasoning: `分红${dividendPerShare.toFixed(2)}元/股，股息率${dividendYield.toFixed(1)}%`,
  };
}

/**
 * 评估送转事件
 */
export function evaluateBonusEvent(
  stock: string,
  date: string,
  bonusRatio: number,    // 送股比例
  transferRatio: number  // 转增比例
): EventSignal {
  const totalRatio = bonusRatio + transferRatio;
  const isHighBonus = totalRatio >= 10; // 10送/转10以上
  const expectedReturn = isHighBonus ? 5 : totalRatio * 0.3;
  const confidence = Math.min(100, totalRatio * 5);

  return {
    event: {
      id: `bonus_${stock}_${date}`,
      type: 'bonus',
      stock,
      date,
      details: { bonusRatio, transferRatio, totalRatio },
      impact: isHighBonus ? 'positive' : 'neutral',
      significance: confidence,
    },
    expectedReturn: Math.round(expectedReturn * 100) / 100,
    confidence,
    entryTiming: 'before',
    exitDays: 15,
    riskLevel: isHighBonus ? 'medium' : 'low',
    reasoning: `每10股送${bonusRatio}转${transferRatio}，高送转${isHighBonus ? '是' : '否'}`,
  };
}

/**
 * 评估重组事件
 */
export function evaluateRestructuringEvent(
  stock: string,
  date: string,
  assetChange: number,  // 资产变动百分比
  isRelatedParty: boolean
): EventSignal {
  const baseImpact = assetChange > 50 ? 8 : assetChange > 0 ? 3 : -5;
  const relatedPenalty = isRelatedParty ? -2 : 0;
  const expectedReturn = baseImpact + relatedPenalty;
  const confidence = Math.min(100, Math.abs(assetChange) / 2 + 30);

  return {
    event: {
      id: `restr_${stock}_${date}`,
      type: 'restructuring',
      stock,
      date,
      details: { assetChange, isRelatedParty: isRelatedParty ? 1 : 0 },
      impact: expectedReturn > 0 ? 'positive' : 'negative',
      significance: confidence,
    },
    expectedReturn: Math.round(expectedReturn * 100) / 100,
    confidence,
    entryTiming: 'at',
    exitDays: 30,
    riskLevel: 'high',
    reasoning: `重组资产变动${assetChange.toFixed(0)}%${isRelatedParty ? '，关联交易' : ''}`,
  };
}

/**
 * 事件组合策略
 */
export function buildEventPortfolio(
  signals: EventSignal[],
  maxPositions: number = 10
): {
  selected: EventSignal[];
  expectedReturn: number;
  avgConfidence: number;
  riskProfile: string;
  diversification: number;
} {
  // 按预期收益排序
  const sorted = [...signals]
    .filter(s => s.confidence > 30)
    .sort((a, b) => b.expectedReturn - a.expectedReturn);

  const selected = sorted.slice(0, maxPositions);

  const expectedReturn = selected.length > 0
    ? selected.reduce((s, e) => s + e.expectedReturn, 0) / selected.length
    : 0;

  const avgConfidence = selected.length > 0
    ? selected.reduce((s, e) => s + e.confidence, 0) / selected.length
    : 0;

  const highRiskCount = selected.filter(s => s.riskLevel === 'high').length;
  const riskProfile = highRiskCount > selected.length * 0.5 ? 'aggressive'
    : highRiskCount > 0 ? 'balanced' : 'conservative';

  // 分散化：不同事件类型数
  const eventTypes = new Set(selected.map(s => s.event.type));
  const diversification = eventTypes.size / Math.max(selected.length, 1);

  return { selected, expectedReturn, avgConfidence, riskProfile, diversification };
}

/**
 * 历史事件影响分析
 */
export function analyzeHistoricalEventImpact(
  events: { type: string; return5d: number; return10d: number; return20d: number }[]
): EventImpact[] {
  const byType = new Map<string, { return5d: number[]; return10d: number[]; return20d: number[] }>();

  for (const e of events) {
    if (!byType.has(e.type)) byType.set(e.type, { return5d: [], return10d: [], return20d: [] });
    const bucket = byType.get(e.type)!;
    bucket.return5d.push(e.return5d);
    bucket.return10d.push(e.return10d);
    bucket.return20d.push(e.return20d);
  }

  const results: EventImpact[] = [];

  for (const [type, data] of byType) {
    const avg5 = data.return5d.reduce((a, b) => a + b, 0) / data.return5d.length;
    const avg10 = data.return10d.reduce((a, b) => a + b, 0) / data.return10d.length;
    const avg20 = data.return20d.reduce((a, b) => a + b, 0) / data.return20d.length;

    const bestPeriod = avg5 >= avg10 && avg5 >= avg20 ? 5 : avg10 >= avg20 ? 10 : 20;
    const avgReturn = [avg5, avg10, avg20][[5, 10, 20].indexOf(bestPeriod)];

    const wins = data.return5d.filter(r => r > 0).length;
    const winRate = wins / data.return5d.length;

    results.push({
      eventType: type,
      avgReturn: Math.round(avgReturn * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      sampleSize: data.return5d.length,
      bestReturn: Math.round(Math.max(...data.return5d) * 100) / 100,
      worstReturn: Math.round(Math.min(...data.return5d) * 100) / 100,
      holdingPeriod: bestPeriod,
      decayRate: avg20 < avg5 ? Math.round((1 - avg20 / avg5) * 100) / 100 : 0,
    });
  }

  return results.sort((a, b) => b.avgReturn - a.avgReturn);
}
