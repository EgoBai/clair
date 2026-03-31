/**
 * 股东行为分析引擎
 * 增持/减持/质押/冻结/解禁/回购行为分析与信号
 */

export type ShareholderAction = 'increase' | 'decrease' | 'pledge' | 'unfreeze' | 'buyback' | 'freeze';

export interface ShareholderEvent {
  date: string;
  code: string;
  shareholderName: string;
  shareholderType: 'major' | 'executive' | 'institution' | 'employee';
  action: ShareholderAction;
  shares: number;           // 涉及股数(万股)
  price?: number;
  ratio: number;            // 占总股本比例
  holdingAfter?: number;    // 变动后持股比例
  reason: string;
}

export interface ShareholderBehaviorAnalysis {
  code: string;
  overallSignal: 'bullish' | 'bearish' | 'neutral';
  recentActions: { action: ShareholderAction; count: number; netShares: number }[];
  insiderSentiment: number;  // 内部人情绪 -1 to 1
  pledgeRisk: number;        // 质押风险 0-1
  buybackSignal: { active: boolean; avgPrice: number; progress: number };
  keyInsights: string[];
  riskFactors: string[];
}

export interface BuybackAnalysis {
  code: string;
  announced: boolean;
  planAmount: number;       // 计划金额(万元)
  completedAmount: number;
  progress: number;
  avgBuybackPrice: number;
  currentPrice: number;
  priceVsBuyback: number;
  isAccretive: boolean;     // 是否有利于股东
  signal: 'strong_positive' | 'positive' | 'neutral' | 'negative';
}

export interface PledgeAnalysis {
  code: string;
  totalPledgedRatio: number;
  majorShareholderPledge: number;
  alertLevel: 'normal' | 'warning' | 'danger';
  marginCallRisk: number;
  nearWarningLine: boolean;
}

// ── 股东行为分析 ──

export function analyzeShareholderBehavior(code: string, events: ShareholderEvent[]): ShareholderBehaviorAnalysis {
  const codeEvents = events.filter(e => e.code === code);

  // 统计各类行为
  const actionCounts = new Map<ShareholderAction, { count: number; netShares: number }>();
  for (const e of codeEvents) {
    const existing = actionCounts.get(e.action) || { count: 0, netShares: 0 };
    existing.count++;
    existing.netShares += e.action === 'increase' || e.action === 'buyback' ? e.shares : -e.shares;
    actionCounts.set(e.action, existing);
  }

  const recentActions = [...actionCounts.entries()].map(([action, data]) => ({ action, ...data }));

  // 内部人情绪
  const increases = codeEvents.filter(e => e.action === 'increase').reduce((a, e) => a + e.shares, 0);
  const decreases = codeEvents.filter(e => e.action === 'decrease').reduce((a, e) => a + e.shares, 0);
  const totalShares = increases + decreases;
  const insiderSentiment = totalShares > 0 ? roundTo((increases - decreases) / totalShares, 2) : 0;

  // 质押风险
  const pledgeEvents = codeEvents.filter(e => e.action === 'pledge');
  const pledgeRisk = Math.min(1, pledgeEvents.reduce((a, e) => a + e.ratio, 0) / 0.5);

  // 回购信号
  const buybackEvents = codeEvents.filter(e => e.action === 'buyback');
  const buybackActive = buybackEvents.length > 0;
  const avgBuybackPrice = buybackActive
    ? buybackEvents.reduce((a, e) => a + (e.price || 0) * e.shares, 0) / buybackEvents.reduce((a, e) => a + e.shares, 0)
    : 0;

  // 关键洞察
  const keyInsights: string[] = [];
  if (increases > decreases * 2) keyInsights.push('内部人大幅净增持，看好后市');
  if (buybackActive) keyInsights.push('公司实施回购，估值有支撑');
  if (codeEvents.some(e => e.action === 'increase' && e.shareholderType === 'executive'))
    keyInsights.push('高管增持，信心充足');

  const riskFactors: string[] = [];
  if (decreases > increases * 2) riskFactors.push('大股东减持压力较大');
  if (pledgeRisk > 0.6) riskFactors.push('股权质押比例过高');
  if (codeEvents.some(e => e.action === 'freeze')) riskFactors.push('股权被冻结');

  let overallSignal: ShareholderBehaviorAnalysis['overallSignal'];
  if (insiderSentiment > 0.3 || buybackActive) overallSignal = 'bullish';
  else if (insiderSentiment < -0.3 || pledgeRisk > 0.6) overallSignal = 'bearish';
  else overallSignal = 'neutral';

  return {
    code,
    overallSignal,
    recentActions,
    insiderSentiment,
    pledgeRisk: roundTo(pledgeRisk, 2),
    buybackSignal: { active: buybackActive, avgPrice: roundTo(avgBuybackPrice, 2), progress: buybackActive ? 0.5 : 0 },
    keyInsights,
    riskFactors,
  };
}

// ── 回购分析 ──

export function analyzeBuyback(code: string, events: ShareholderEvent[], currentPrice: number): BuybackAnalysis {
  const buybackEvents = events.filter(e => e.code === code && e.action === 'buyback');
  const announced = buybackEvents.length > 0;

  const planAmount = announced ? buybackEvents.reduce((a, e) => a + (e.price || 0) * e.shares * 100, 0) : 0;
  const completedAmount = planAmount * 0.5;
  const progress = planAmount > 0 ? completedAmount / planAmount : 0;

  const avgBuybackPrice = announced
    ? buybackEvents.reduce((a, e) => a + (e.price || 0) * e.shares, 0) / Math.max(buybackEvents.reduce((a, e) => a + e.shares, 0), 1)
    : 0;

  const priceVsBuyback = avgBuybackPrice > 0 ? (currentPrice - avgBuybackPrice) / avgBuybackPrice : 0;
  const isAccretive = currentPrice < avgBuybackPrice;

  let signal: BuybackAnalysis['signal'];
  if (isAccretive && progress < 0.5) signal = 'strong_positive';
  else if (isAccretive) signal = 'positive';
  else if (priceVsBuyback > 0.3) signal = 'negative';
  else signal = 'neutral';

  return {
    code,
    announced,
    planAmount: roundTo(planAmount, 0),
    completedAmount: roundTo(completedAmount, 0),
    progress: roundTo(progress, 2),
    avgBuybackPrice: roundTo(avgBuybackPrice, 2),
    currentPrice,
    priceVsBuyback: roundTo(priceVsBuyback, 4),
    isAccretive,
    signal,
  };
}

// ── 质押分析 ──

export function analyzePledge(code: string, events: ShareholderEvent[]): PledgeAnalysis {
  const pledgeEvents = events.filter(e => e.code === code && e.action === 'pledge');
  const totalPledgedRatio = pledgeEvents.reduce((a, e) => a + e.ratio, 0);
  const majorPledge = pledgeEvents
    .filter(e => e.shareholderType === 'major')
    .reduce((a, e) => a + e.ratio, 0);

  let alertLevel: PledgeAnalysis['alertLevel'];
  if (totalPledgedRatio > 0.5) alertLevel = 'danger';
  else if (totalPledgedRatio > 0.3) alertLevel = 'warning';
  else alertLevel = 'normal';

  const marginCallRisk = Math.min(1, totalPledgedRatio * 1.5);
  const nearWarningLine = totalPledgedRatio > 0.4;

  return {
    code,
    totalPledgedRatio: roundTo(totalPledgedRatio, 4),
    majorShareholderPledge: roundTo(majorPledge, 4),
    alertLevel,
    marginCallRisk: roundTo(marginCallRisk, 2),
    nearWarningLine,
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
