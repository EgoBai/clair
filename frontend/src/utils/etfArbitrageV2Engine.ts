/**
 * ETF套利引擎 V2 (ETF Arbitrage Engine V2)
 * - 实时溢价折价监控
* - 一二级市场套利
 * - 跨市场套利(LOF/ETF)
 * - 延迟套利窗口
 * - 套利成本精确计算
 */

export interface ETFQuote {
  code: string;
  name: string;
  marketPrice: number;
  nav: number;
  iopv: number;         // 实时估值
  totalShares: number;
  creationUnit: number; // 最小申购赎回单位
  updateTime: string;
}

export interface ArbitrageOpportunity {
  etf: string;
  type: 'premium_arb' | 'discount_arb' | 'cross_market';
  premium: number;       // 溢价率
  expectedProfit: number;
  netProfit: number;     // 扣费后
  cost: {
    commission: number;
    slippage: number;
    impact: number;
    stampDuty: number;
    total: number;
  };
  capitalRequired: number;
  timeWindow: number;    // 预计完成时间(分钟)
  riskLevel: 'low' | 'medium' | 'high';
  feasibility: number;   // 0-100
}

export interface ArbitrageMonitor {
  opportunities: ArbitrageOpportunity[];
  bestOpportunity: ArbitrageOpportunity | null;
  totalCandidates: number;
  avgPremium: number;
  marketStatus: 'open' | 'closed' | 'pre_market' | 'after_hours';
}

/**
 * 计算溢价率
 */
export function calculatePremium(etf: ETFQuote): number {
  if (etf.marketPrice <= 0 || etf.iopv <= 0) return 0;
  return (etf.marketPrice - etf.iopv) / etf.iopv * 100;
}

/**
 * 计算套利成本
 */
function calculateArbitrageCost(
  marketPrice: number,
  shares: number,
  isBuyFirst: boolean
): ArbitrageOpportunity['cost'] {
  const amount = marketPrice * shares;
  const commission = Math.max(amount * 0.0003, 5) * 2; // 双边佣金
  const slippage = amount * 0.001; // 0.1% 滑点
  const impact = amount * 0.0005;  // 0.05% 冲击成本
  const stampDuty = isBuyFirst ? amount * 0.001 : 0; // 卖出端印花税

  return {
    commission: Math.round(commission * 100) / 100,
    slippage: Math.round(slippage * 100) / 100,
    impact: Math.round(impact * 100) / 100,
    stampDuty: Math.round(stampDuty * 100) / 100,
    total: Math.round((commission + slippage + impact + stampDuty) * 100) / 100,
  };
}

/**
 * 分析套利机会
 */
export function analyzeArbitrageOpportunity(
  etf: ETFQuote,
  capitalLimit: number = 10000000
): ArbitrageOpportunity | null {
  const premium = calculatePremium(etf);

  // 最小套利阈值
  if (Math.abs(premium) < 0.3) return null;

  const isPremium = premium > 0;
  const type: ArbitrageOpportunity['type'] = isPremium ? 'premium_arb' : 'discount_arb';

  // 可申购/赎回的最大份数
  const maxCreationUnits = Math.floor(capitalLimit / (etf.marketPrice * etf.creationUnit));
  const units = Math.min(maxCreationUnits, 100); // 限制最大100个篮子
  const shares = units * etf.creationUnit;

  const cost = calculateArbitrageCost(etf.marketPrice, shares, !isPremium);
  const grossProfit = Math.abs(premium) / 100 * etf.marketPrice * shares;
  const netProfit = grossProfit - cost.total;
  const capitalRequired = etf.marketPrice * shares;

  // 可行性评分
  let feasibility = 50;
  if (netProfit > 0) feasibility += 20;
  if (Math.abs(premium) > 1) feasibility += 15;
  if (shares * etf.marketPrice < capitalLimit * 0.8) feasibility += 10;
  if (etf.totalShares > 100000000) feasibility += 5; // 流动性好

  // 风险
  let riskLevel: 'low' | 'medium' | 'high';
  if (Math.abs(premium) < 0.5) riskLevel = 'high'; // 利润薄
  else if (Math.abs(premium) > 2) riskLevel = 'low';
  else riskLevel = 'medium';

  return {
    etf: etf.code,
    type,
    premium: Math.round(premium * 10000) / 10000,
    expectedProfit: Math.round(grossProfit * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    cost,
    capitalRequired: Math.round(capitalRequired * 100) / 100,
    timeWindow: isPremium ? 15 : 20,
    riskLevel,
    feasibility: Math.min(100, feasibility),
  };
}

/**
 * 套利监控
 */
export function monitorArbitrage(
  etfs: ETFQuote[],
  capitalLimit: number = 10000000
): ArbitrageMonitor {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const etf of etfs) {
    const opp = analyzeArbitrageOpportunity(etf, capitalLimit);
    if (opp && opp.netProfit > 0) {
      opportunities.push(opp);
    }
  }

  opportunities.sort((a, b) => b.netProfit - a.netProfit);

  const premiums = etfs.map(e => calculatePremium(e));
  const avgPremium = premiums.reduce((a, b) => a + b, 0) / Math.max(premiums.length, 1);

  return {
    opportunities,
    bestOpportunity: opportunities[0] || null,
    totalCandidates: opportunities.length,
    avgPremium: Math.round(avgPremium * 10000) / 10000,
    marketStatus: 'open',
  };
}

/**
 * 跨市场套利检测
 */
export function detectCrossMarketArb(
  etfQuote: ETFQuote,
  lofPrice: number
): ArbitrageOpportunity | null {
  const spread = (etfQuote.marketPrice - lofPrice) / lofPrice * 100;

  if (Math.abs(spread) < 0.5) return null;

  const shares = etfQuote.creationUnit;
  const grossProfit = Math.abs(spread) / 100 * Math.min(etfQuote.marketPrice, lofPrice) * shares;
  const cost = calculateArbitrageCost(etfQuote.marketPrice, shares, spread > 0);
  const netProfit = grossProfit - cost.total;

  if (netProfit <= 0) return null;

  return {
    etf: etfQuote.code,
    type: 'cross_market',
    premium: Math.round(spread * 10000) / 10000,
    expectedProfit: Math.round(grossProfit * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    cost,
    capitalRequired: Math.round(etfQuote.marketPrice * shares * 100) / 100,
    timeWindow: 30,
    riskLevel: Math.abs(spread) > 2 ? 'low' : 'medium',
    feasibility: Math.min(100, Math.round(Math.abs(spread) * 30 + 20)),
  };
}
