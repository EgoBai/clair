/**
 * 科创板分析引擎
 * 注册制特点/特殊估值(PS/PEG)/研发投入分析/限售解禁/做市商
 */

export interface STARStock {
  ticker: string;
  name: string;
  ipoDate: string;
  industry: string;
  revenue: number;
  revenueGrowth: number;
  netProfit: number;
  rdExpense: number;
  rdRatio: number;          // 研发费用率
  patentCount: number;
  grossMargin: number;
  marketCap: number;
  psRatio: number;
  price: number;
  ipoPrice: number;
  ipoPremium: number;       // 首日涨幅
  lockUpShares: number;     // 限售股
  totalShares: number;
  lockUpExpiry: string;
  hasMarketMaker: boolean;
  isProfitable: boolean;
}

export interface STARValuation {
  ticker: string;
  ps: number;
  psPercentile: number;
  peg: number;
  rdEfficiency: number;     // 研发效率(营收/研发)
  innovationScore: number;  // 0-100
  valuationMethod: 'ps' | 'peg' | 'dcf' | 'ev_revenue';
  fairValue: number;
  currentPrice: number;
  upside: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface LockUpAnalysis {
  ticker: string;
  expiryDate: string;
  daysUntilExpiry: number;
  lockUpRatio: number;      // 限售股占总股本比
  estimatedPressure: number; // 预估抛压(0-100)
  historicalImpact: {
    avgDrop: number;
    maxDrop: number;
    recoveryDays: number;
  };
  risk: 'low' | 'medium' | 'high';
}

export interface RDAnalysis {
  ticker: string;
  rdExpense: number;
  rdRatio: number;
  rdGrowth: number;
  rdEfficiency: number;
  patentDensity: number;    // 专利/研发比
  rdSustainability: number; // 现金流能否支撑研发
  comparison: {
    industryAvg: number;
    vsIndustry: 'above' | 'average' | 'below';
  };
}

/**
 * 科创板估值
 */
export function valueSTARStock(stock: STARStock): STARValuation {
  let valuationMethod: STARValuation['valuationMethod'];
  let fairValue: number;

  if (stock.isProfitable && stock.netProfit > 0) {
    // 盈利公司: PEG
    valuationMethod = 'peg';
    const pe = stock.marketCap / stock.netProfit;
    const _peg = stock.revenueGrowth > 0 ? pe / stock.revenueGrowth : pe;
    fairValue = stock.price; // 简化
  } else {
    // 未盈利: PS
    valuationMethod = 'ps';
    const targetPS = stock.grossMargin > 0.5 ? 15 : stock.grossMargin > 0.3 ? 8 : 4;
    fairValue = (stock.revenue * targetPS) / stock.totalShares;
  }

  const upside = fairValue > 0 ? (fairValue - stock.price) / stock.price : 0;

  // PS百分位 (简化)
  const psPercentile = stock.psRatio > 20 ? 90 : stock.psRatio > 10 ? 70 : stock.psRatio > 5 ? 50 : 30;

  // PEG
  const pe = stock.netProfit > 0 ? stock.marketCap / stock.netProfit : 999;
  const peg = stock.revenueGrowth > 0 ? pe / stock.revenueGrowth : 999;

  // 研发效率
  const rdEfficiency = stock.rdExpense > 0 ? stock.revenue / stock.rdExpense : 0;

  // 创新评分
  let innovationScore = 50;
  if (stock.rdRatio > 0.15) innovationScore += 20;
  else if (stock.rdRatio > 0.1) innovationScore += 10;
  if (stock.patentCount > 100) innovationScore += 15;
  else if (stock.patentCount > 50) innovationScore += 8;
  if (stock.grossMargin > 0.4) innovationScore += 10;

  let riskLevel: STARValuation['riskLevel'];
  if (psPercentile > 80 || !stock.isProfitable) riskLevel = 'high';
  else if (psPercentile > 50) riskLevel = 'medium';
  else riskLevel = 'low';

  return {
    ticker: stock.ticker,
    ps: stock.psRatio,
    psPercentile,
    peg,
    rdEfficiency,
    innovationScore: Math.min(100, innovationScore),
    valuationMethod,
    fairValue,
    currentPrice: stock.price,
    upside,
    riskLevel,
  };
}

/**
 * 限售解禁分析
 */
export function analyzeLockUp(stock: STARStock): LockUpAnalysis {
  const now = new Date();
  const expiry = new Date(stock.lockUpExpiry);
  const daysUntilExpiry = Math.max(0, Math.round(
    (expiry.getTime() - now.getTime()) / 86400000
  ));

  const lockUpRatio = stock.totalShares > 0
    ? stock.lockUpShares / stock.totalShares
    : 0;

  // 抛压估计
  let pressure = lockUpRatio * 50;
  if (stock.price > stock.ipoPrice * 3) pressure += 20; // 大幅获利
  else if (stock.price > stock.ipoPrice * 1.5) pressure += 10;
  if (daysUntilExpiry < 30) pressure += 15;
  pressure = Math.min(100, pressure);

  let risk: LockUpAnalysis['risk'];
  if (pressure > 70) risk = 'high';
  else if (pressure > 40) risk = 'medium';
  else risk = 'low';

  return {
    ticker: stock.ticker,
    expiryDate: stock.lockUpExpiry,
    daysUntilExpiry,
    lockUpRatio,
    estimatedPressure: pressure,
    historicalImpact: {
      avgDrop: -3.5,
      maxDrop: -12,
      recoveryDays: 15,
    },
    risk,
  };
}

/**
 * 研发投入分析
 */
export function analyzeRD(
  stock: STARStock,
  industryAvgRDRatio: number = 0.1
): RDAnalysis {
  const rdRatio = stock.rdRatio;
  const rdEfficiency = stock.rdExpense > 0 ? stock.revenue / stock.rdExpense : 0;
  const patentDensity = stock.rdExpense > 0 ? stock.patentCount / (stock.rdExpense / 1e8) : 0;

  let rdSustainability = 50;
  if (stock.rdExpense < stock.revenue * 0.3) rdSustainability += 20;
  if (stock.grossMargin > 0.3) rdSustainability += 15;

  return {
    ticker: stock.ticker,
    rdExpense: stock.rdExpense,
    rdRatio,
    rdGrowth: 0,
    rdEfficiency,
    patentDensity,
    rdSustainability: Math.min(100, rdSustainability),
    comparison: {
      industryAvg: industryAvgRDRatio,
      vsIndustry: rdRatio > industryAvgRDRatio * 1.2 ? 'above' :
        rdRatio > industryAvgRDRatio * 0.8 ? 'average' : 'below',
    },
  };
}

/**
 * 科创板选股策略
 */
export function selectSTARStocks(
  stocks: STARStock[],
  strategy: 'growth' | 'innovation' | 'value'
): { ticker: string; score: number; reasons: string[] }[] {
  return stocks.map(stock => {
    let score = 0;
    const reasons: string[] = [];

    if (strategy === 'growth') {
      score += stock.revenueGrowth * 2;
      if (stock.revenueGrowth > 30) reasons.push('收入高增长');
      if (stock.grossMargin > 0.4) { score += 10; reasons.push('高毛利'); }
      if (stock.isProfitable) { score += 15; reasons.push('已盈利'); }
    } else if (strategy === 'innovation') {
      score += stock.rdRatio * 100;
      if (stock.rdRatio > 0.15) reasons.push('高研发投入');
      score += Math.min(20, stock.patentCount / 10);
      if (stock.patentCount > 50) reasons.push('专利丰富');
    } else {
      const ps = stock.psRatio;
      score += Math.max(0, 30 - ps * 2);
      if (ps < 5) reasons.push('低PS估值');
      if (stock.isProfitable) { score += 20; reasons.push('已盈利'); }
    }

    return { ticker: stock.ticker, score, reasons };
  }).sort((a, b) => b.score - a.score);
}
