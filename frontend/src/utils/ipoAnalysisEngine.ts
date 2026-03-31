/**
 * IPO分析引擎
 * 新股上市分析/打新收益率/破发风险/估值对比/锁定期分析
 */

// ── 类型定义 ──

export interface IPOInfo {
  code: string;
  name: string;
  issuePrice: number;         // 发行价
  issuePE: number;            // 发行市盈率
  industryPE: number;         // 行业平均市盈率
  issueDate: string;          // 上市日期
  totalShares: number;        // 发行总股数(万股)
  onlineSubscriptionRatio: number; // 网上中签率
  offlineSubscriptionRatio: number; // 网下配售比例
  overSubscriptionRatio: number;   // 超额认购倍数
  leadUnderwriter: string;    // 主承销商
  industry: string;
  market: 'main' | 'gem' | 'star' | 'bse'; // 主板/创业板/科创板/北交所
  profitability: boolean;     // 是否盈利
  revenue: number;            // 最近一年营收(亿)
  netProfit: number;          // 最近一年净利润(亿)
  useOfProceeds: string[];    // 募集资金用途
}

export interface IPOReturnAnalysis {
  code: string;
  firstDayReturn: number;     // 首日涨跌幅
  firstDayHigh: number;       // 首日最高价
  firstDayLow: number;        // 首日最低价
  firstDayVolume: number;     // 首日成交量
  firstDayTurnover: number;   // 首日换手率
  daysToBreak: number;        // 破发天数 (-1表示未破发)
  currentVsIssue: number;     // 当前价相对发行价涨跌
  maxDrawdown: number;        // 最大回撤
  bestReturn: number;         // 最佳收益(首日最高卖出)
}

export interface IPOValuation {
  code: string;
  issuePE: number;
  industryPE: number;
  pePremium: number;          // 发行PE相对行业溢价
  priceToBook: number;        // 市净率
  priceToSales: number;       // 市销率
  valuationRating: 'underpriced' | 'fair' | 'overpriced' | 'bubble';
  comparableCompanies: { name: string; pe: number; similarity: number }[];
  fairValueRange: { low: number; high: number };
}

export interface SubscriptionAnalysis {
  code: string;
  subscriptionRate: number;    // 中签率
  expectedReturn: number;      // 预期收益
  capitalEfficiency: number;   // 资金利用效率
  riskAdjustedReturn: number;  // 风险调整收益
  recommendation: 'strong_apply' | 'apply' | 'neutral' | 'skip';
  reasoning: string;
}

export interface IPOBreakAnalysis {
  code: string;
  breakProbability: number;    // 破发概率
  breakFactors: string[];
  protectionFactors: string[];
  historicalSimilarCases: number;
  riskScore: number;           // 0-100
}

export interface LockupAnalysis {
  code: string;
  lockupShares: number;        // 限售股数量(万股)
  lockupRatio: number;         // 占总股本比例
  unlockDate: string;          // 解禁日期
  daysToUnlock: number;
  expectedPressure: number;    // 预期抛压(0-1)
  priceVsIssue: number;        // 当前价vs发行价
  profitMultiple: number;      // 获利倍数
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

export interface IPOMarketSentiment {
  period: string;
  totalIPOs: number;
  avgFirstDayReturn: number;
  breakRate: number;           // 破发率
  oversubscriptionAvg: number; // 平均超额认购倍数
  marketSentiment: 'hot' | 'warm' | 'cold' | 'frozen';
  bestSector: string;
  worstSector: string;
}

// ── 打新收益率分析 ──

export function analyzeIPOReturns(ipo: IPOInfo, marketData: {
  firstDayClose: number;
  firstDayHigh: number;
  firstDayLow: number;
  firstDayVolume: number;
  totalShares: number;
  currentPrice: number;
  breakDay: number;
  maxDrawdown: number;
}): IPOReturnAnalysis {
  const firstDayReturn = (marketData.firstDayClose - ipo.issuePrice) / ipo.issuePrice;
  const currentVsIssue = (marketData.currentPrice - ipo.issuePrice) / ipo.issuePrice;
  const firstDayTurnover = marketData.firstDayVolume / (marketData.totalShares * 10000);

  return {
    code: ipo.code,
    firstDayReturn: roundTo(firstDayReturn, 4),
    firstDayHigh: roundTo(marketData.firstDayHigh, 2),
    firstDayLow: roundTo(marketData.firstDayLow, 2),
    firstDayVolume: marketData.firstDayVolume,
    firstDayTurnover: roundTo(firstDayTurnover, 4),
    daysToBreak: marketData.breakDay,
    currentVsIssue: roundTo(currentVsIssue, 4),
    maxDrawdown: roundTo(marketData.maxDrawdown, 4),
    bestReturn: roundTo((marketData.firstDayHigh - ipo.issuePrice) / ipo.issuePrice, 4),
  };
}

// ── 估值分析 ──

export function analyzeIPOValuation(ipo: IPOInfo, comparableCompanies: { name: string; pe: number }[]): IPOValuation {
  const pePremium = (ipo.issuePE - ipo.industryPE) / ipo.industryPE;
  const avgCompPE = comparableCompanies.length > 0
    ? comparableCompanies.reduce((a, c) => a + c.pe, 0) / comparableCompanies.length
    : ipo.industryPE;

  let valuationRating: IPOValuation['valuationRating'];
  if (pePremium < -0.2) valuationRating = 'underpriced';
  else if (pePremium < 0.2) valuationRating = 'fair';
  else if (pePremium < 0.5) valuationRating = 'overpriced';
  else valuationRating = 'bubble';

  const priceToSales = ipo.revenue > 0
    ? (ipo.issuePrice * ipo.totalShares * 10000) / (ipo.revenue * 1e8) : 0;

  const fairLow = ipo.issuePrice * 0.8;
  const fairHigh = ipo.issuePrice * (1 + Math.max(0, pePremium) * 0.5 + 0.2);

  const comparables = comparableCompanies.map(c => ({
    ...c,
    similarity: 1 - Math.abs(c.pe - ipo.issuePE) / Math.max(c.pe, ipo.issuePE),
  }));

  return {
    code: ipo.code,
    issuePE: ipo.issuePE,
    industryPE: ipo.industryPE,
    pePremium: roundTo(pePremium, 4),
    priceToBook: roundTo(ipo.issuePE / avgCompPE, 2),
    priceToSales: roundTo(priceToSales, 2),
    valuationRating,
    comparableCompanies: comparables,
    fairValueRange: { low: roundTo(fairLow, 2), high: roundTo(fairHigh, 2) },
  };
}

// ── 打新申购分析 ──

export function analyzeSubscription(ipo: IPOInfo, historicalBreakRate: number): SubscriptionAnalysis {
  // 预期首日收益 (基于发行PE折价)
  const peDiscount = Math.max(0, (ipo.industryPE - ipo.issuePE) / ipo.issuePE);
  const expectedFirstDayReturn = Math.min(peDiscount, 1) * 0.6; // 打折系数

  // 预期收益 = 中签率 * 每签利润
  const lotSize = ipo.market === 'bse' ? 100 : 500;
  const profitPerLot = ipo.issuePrice * lotSize * expectedFirstDayReturn;
  const expectedReturn = ipo.onlineSubscriptionRatio * profitPerLot;

  // 资金利用效率 (冻结资金约1周)
  const frozenCapital = ipo.issuePrice * lotSize;
  const capitalEfficiency = expectedReturn / (frozenCapital * 7 / 365);

  // 风险调整收益
  const breakRisk = historicalBreakRate * (ipo.issuePE > ipo.industryPE ? 1.5 : 0.5);
  const riskAdjustedReturn = expectedReturn * (1 - breakRisk);

  let recommendation: SubscriptionAnalysis['recommendation'];
  let reasoning: string;

  if (riskAdjustedReturn > 5000 && breakRisk < 0.2) {
    recommendation = 'strong_apply';
    reasoning = `预期收益${(expectedReturn / 10000).toFixed(2)}万，破发风险低(${(breakRisk * 100).toFixed(0)}%)`;
  } else if (riskAdjustedReturn > 2000) {
    recommendation = 'apply';
    reasoning = `预期收益${(expectedReturn / 10000).toFixed(2)}万，可积极参与`;
  } else if (riskAdjustedReturn > 0) {
    recommendation = 'neutral';
    reasoning = `预期收益有限，破发概率${(breakRisk * 100).toFixed(0)}%，谨慎参与`;
  } else {
    recommendation = 'skip';
    reasoning = `发行估值偏高，破发概率${(breakRisk * 100).toFixed(0)}%，建议放弃`;
  }

  return {
    code: ipo.code,
    subscriptionRate: ipo.onlineSubscriptionRatio,
    expectedReturn: roundTo(expectedReturn, 2),
    capitalEfficiency: roundTo(capitalEfficiency, 4),
    riskAdjustedReturn: roundTo(riskAdjustedReturn, 2),
    recommendation,
    reasoning,
  };
}

// ── 破发风险分析 ──

export function analyzeBreakRisk(ipo: IPOInfo, historicalData: {
  similarIPOs: number;
  similarBreakRate: number;
}): IPOBreakAnalysis {
  const breakFactors: string[] = [];
  const protectionFactors: string[] = [];

  // 破发因素
  if (ipo.issuePE > ipo.industryPE * 1.3) {
    breakFactors.push(`发行PE(${ipo.issuePE.toFixed(1)})显著高于行业均值(${ipo.industryPE.toFixed(1)})`);
  }
  if (!ipo.profitability) {
    breakFactors.push('未盈利企业，市场定价分歧大');
  }
  if (ipo.market === 'star' || ipo.market === 'gem') {
    breakFactors.push('注册制板块，市场化定价破发率较高');
  }
  if (ipo.overSubscriptionRatio < 100) {
    breakFactors.push(`超额认购仅${ipo.overSubscriptionRatio.toFixed(0)}倍，热度不足`);
  }
  if (ipo.revenue < 5) {
    breakFactors.push('营收规模较小，抗风险能力弱');
  }

  // 保护因素
  if (ipo.issuePE < ipo.industryPE * 0.8) {
    protectionFactors.push(`发行PE折价${((1 - ipo.issuePE / ipo.industryPE) * 100).toFixed(0)}%`);
  }
  if (ipo.netProfit > 1) {
    protectionFactors.push(`盈利能力强，净利润${ipo.netProfit.toFixed(2)}亿`);
  }
  if (ipo.overSubscriptionRatio > 500) {
    protectionFactors.push(`超额认购${ipo.overSubscriptionRatio.toFixed(0)}倍，市场需求旺盛`);
  }
  if (ipo.market === 'main') {
    protectionFactors.push('主板发行，23倍PE窗口指导');
  }

  // 破发概率计算
  let breakProb = historicalData.similarBreakRate;
  if (ipo.issuePE > ipo.industryPE) breakProb += 0.15;
  if (!ipo.profitability) breakProb += 0.1;
  if (breakFactors.length > protectionFactors.length) breakProb += 0.1;
  breakProb = Math.min(0.95, Math.max(0.05, breakProb));

  const riskScore = Math.round(breakProb * 100);

  return {
    code: ipo.code,
    breakProbability: roundTo(breakProb, 2),
    breakFactors,
    protectionFactors,
    historicalSimilarCases: historicalData.similarIPOs,
    riskScore,
  };
}

// ── 限售解禁分析 ──

export function analyzeLockup(ipo: IPOInfo, lockupData: {
  lockupShares: number;
  totalShares: number;
  unlockDate: string;
  currentPrice: number;
}): LockupAnalysis {
  const daysToUnlock = Math.ceil(
    (new Date(lockupData.unlockDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const lockupRatio = lockupData.lockupShares / lockupData.totalShares;
  const priceVsIssue = (lockupData.currentPrice - ipo.issuePrice) / ipo.issuePrice;
  const profitMultiple = lockupData.currentPrice / ipo.issuePrice;

  let pressure = lockupRatio * 0.5;
  if (profitMultiple > 2) pressure += 0.2;
  if (profitMultiple > 3) pressure += 0.1;
  if (daysToUnlock < 30) pressure += 0.1;
  pressure = Math.min(1, pressure);

  let riskLevel: LockupAnalysis['riskLevel'];
  if (pressure > 0.7) riskLevel = 'critical';
  else if (pressure > 0.5) riskLevel = 'high';
  else if (pressure > 0.3) riskLevel = 'medium';
  else riskLevel = 'low';

  let recommendation = '';
  if (riskLevel === 'critical') {
    recommendation = `解禁股占比${(lockupRatio * 100).toFixed(0)}%，获利${profitMultiple.toFixed(1)}倍，抛压极大，建议提前回避`;
  } else if (riskLevel === 'high') {
    recommendation = '解禁压力较大，关注解禁日前后股价表现';
  } else if (riskLevel === 'medium') {
    recommendation = '适量关注，解禁影响可控';
  } else {
    recommendation = '解禁压力较小';
  }

  return {
    code: ipo.code,
    lockupShares: lockupData.lockupShares,
    lockupRatio: roundTo(lockupRatio, 4),
    unlockDate: lockupData.unlockDate,
    daysToUnlock: Math.max(0, daysToUnlock),
    expectedPressure: roundTo(pressure, 2),
    priceVsIssue: roundTo(priceVsIssue, 4),
    profitMultiple: roundTo(profitMultiple, 2),
    riskLevel,
    recommendation,
  };
}

// ── IPO市场情绪分析 ──

export function analyzeIPOMarketSentiment(ipoRecords: {
  firstDayReturn: number;
  oversubscription: number;
  industry: string;
  breakDay: number;
}[]): IPOMarketSentiment {
  if (ipoRecords.length === 0) {
    return {
      period: '当前',
      totalIPOs: 0,
      avgFirstDayReturn: 0,
      breakRate: 0,
      oversubscriptionAvg: 0,
      marketSentiment: 'frozen',
      bestSector: '-',
      worstSector: '-',
    };
  }

  const avgFirstDayReturn = ipoRecords.reduce((a, r) => a + r.firstDayReturn, 0) / ipoRecords.length;
  const breakCount = ipoRecords.filter(r => r.breakDay >= 0).length;
  const breakRate = breakCount / ipoRecords.length;
  const oversubscriptionAvg = ipoRecords.reduce((a, r) => a + r.oversubscription, 0) / ipoRecords.length;

  // 行业统计
  const industryReturns = new Map<string, number[]>();
  for (const r of ipoRecords) {
    if (!industryReturns.has(r.industry)) industryReturns.set(r.industry, []);
    industryReturns.get(r.industry)!.push(r.firstDayReturn);
  }

  let bestSector = '-';
  let worstSector = '-';
  let bestAvg = -Infinity;
  let worstAvg = Infinity;

  for (const [industry, returns] of industryReturns) {
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    if (avg > bestAvg) { bestAvg = avg; bestSector = industry; }
    if (avg < worstAvg) { worstAvg = avg; worstSector = industry; }
  }

  let sentiment: IPOMarketSentiment['marketSentiment'];
  if (breakRate < 0.1 && avgFirstDayReturn > 0.5) sentiment = 'hot';
  else if (breakRate < 0.3 && avgFirstDayReturn > 0.2) sentiment = 'warm';
  else if (breakRate < 0.5) sentiment = 'cold';
  else sentiment = 'frozen';

  return {
    period: '近期',
    totalIPOs: ipoRecords.length,
    avgFirstDayReturn: roundTo(avgFirstDayReturn, 4),
    breakRate: roundTo(breakRate, 4),
    oversubscriptionAvg: roundTo(oversubscriptionAvg, 0),
    marketSentiment: sentiment,
    bestSector,
    worstSector,
  };
}

// ── 综合IPO评分 ──

export function calculateIPOScore(
  valuation: IPOValuation,
  breakAnalysis: IPOBreakAnalysis,
  subscription: SubscriptionAnalysis
): { score: number; grade: string; highlights: string[] } {
  let score = 50; // 基础分
  const highlights: string[] = [];

  // 估值分
  if (valuation.valuationRating === 'underpriced') { score += 20; highlights.push('折价发行'); }
  else if (valuation.valuationRating === 'fair') { score += 10; highlights.push('合理估值'); }
  else if (valuation.valuationRating === 'overpriced') { score -= 10; highlights.push('估值偏高'); }
  else { score -= 25; highlights.push('估值泡沫'); }

  // 破发风险分
  if (breakAnalysis.riskScore < 20) { score += 15; highlights.push('破发风险低'); }
  else if (breakAnalysis.riskScore < 40) { score += 5; }
  else if (breakAnalysis.riskScore > 60) { score -= 15; highlights.push('破发风险高'); }

  // 打新收益分
  if (subscription.riskAdjustedReturn > 5000) { score += 15; highlights.push('打新收益可观'); }
  else if (subscription.riskAdjustedReturn > 2000) { score += 5; }
  else if (subscription.riskAdjustedReturn < 0) { score -= 10; }

  score = Math.min(100, Math.max(0, score));

  let grade = '';
  if (score >= 85) grade = 'A+';
  else if (score >= 75) grade = 'A';
  else if (score >= 65) grade = 'B+';
  else if (score >= 55) grade = 'B';
  else if (score >= 45) grade = 'C';
  else if (score >= 35) grade = 'D';
  else grade = 'F';

  return { score, grade, highlights };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
