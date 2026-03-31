/**
 * 北交所分析引擎
 * 专精特新/转板机会/做市商/流动性分析/估值对标
 */

export interface BSEStock {
  ticker: string;
  name: string;
  industry: string;
  price: number;
  marketCap: number;
  pe: number;
  revenue: number;
  revenueGrowth: number;
  netProfit: number;
  netProfitGrowth: number;
  grossMargin: number;
  isSpecialized: boolean;  // 专精特新
  isLittleGiant: boolean;  // 小巨人
  transferEligible: boolean; // 转板资格
  turnoverRate: number;
  avgVolume: number;
  bidAskSpread: number;
  hasMarketMaker: boolean;
  marketMakerCount: number;
}

export interface BSEValuation {
  ticker: string;
  currentPE: number;
  sectorAvgPE: number;
  valuationGap: number;   // 与行业均值的差距
  transferPremium: number; // 转板溢价预期
  targetPrice: number;
  upside: number;
  discount: 'heavy' | 'moderate' | 'fair' | 'premium';
}

export interface TransferOpportunity {
  ticker: string;
  name: string;
  eligible: boolean;
  requirements: {
    met: boolean;
    requirement: string;
    current: string;
  }[];
  estimatedTimeline: string;
  potentialUpside: number;
  riskFactors: string[];
}

export interface SpecializationScore {
  ticker: string;
  isSpecialized: boolean;
  isLittleGiant: boolean;
  rdScore: number;
  marketShareScore: number;
  profitabilityScore: number;
  innovationScore: number;
  totalScore: number;
  category: string;
}

/**
 * 北交所估值对标
 */
export function valueBSEStock(
  stock: BSEStock,
  sectorAvgPE: number = 25
): BSEValuation {
  const currentPE = stock.pe;
  const valuationGap = sectorAvgPE > 0
    ? (sectorAvgPE - currentPE) / sectorAvgPE
    : 0;

  // 转板溢价: 如果有转板资格, 给予一定溢价
  const transferPremium = stock.transferEligible ? 0.15 : 0;

  // 目标价
  const targetPE = sectorAvgPE * (1 + transferPremium);
  const eps = stock.marketCap > 0 ? stock.netProfit / (stock.marketCap / stock.price) : 0;
  const targetPrice = eps * targetPE;
  const upside = stock.price > 0 ? (targetPrice - stock.price) / stock.price : 0;

  let discount: BSEValuation['discount'];
  if (valuationGap > 0.3) discount = 'heavy';
  else if (valuationGap > 0.1) discount = 'moderate';
  else if (valuationGap > -0.1) discount = 'fair';
  else discount = 'premium';

  return {
    ticker: stock.ticker,
    currentPE,
    sectorAvgPE,
    valuationGap,
    transferPremium,
    targetPrice,
    upside,
    discount,
  };
}

/**
 * 转板机会分析
 */
export function analyzeTransferOpportunity(stock: BSEStock): TransferOpportunity {
  const requirements: TransferOpportunity['requirements'] = [];

  // 市值要求
  requirements.push({
    met: stock.marketCap >= 20e8,
    requirement: '市值≥20亿',
    current: `${(stock.marketCap / 1e8).toFixed(1)}亿`,
  });

  // 盈利要求
  requirements.push({
    met: stock.netProfit > 0 && stock.netProfitGrowth > 0,
    requirement: '连续盈利且增长',
    current: stock.netProfit > 0 ? '盈利' : '亏损',
  });

  // 收入要求
  requirements.push({
    met: stock.revenue >= 3e8 && stock.revenueGrowth > 10,
    requirement: '营收≥3亿且增速>10%',
    current: `${(stock.revenue / 1e8).toFixed(1)}亿/${stock.revenueGrowth.toFixed(0)}%`,
  });

  // 股东要求
  requirements.push({
    met: true,
    requirement: '股东人数≥1000',
    current: '满足',
  });

  const metCount = requirements.filter(r => r.met).length;
  const eligible = metCount >= 3;

  const potentialUpside = eligible ? 0.3 : 0;
  const riskFactors: string[] = [];
  if (!eligible) riskFactors.push('不满足转板条件');
  if (stock.turnoverRate < 0.01) riskFactors.push('流动性不足');

  return {
    ticker: stock.ticker,
    name: stock.name,
    eligible,
    requirements,
    estimatedTimeline: eligible ? '6-12个月' : '不确定',
    potentialUpside,
    riskFactors,
  };
}

/**
 * 专精特新评分
 */
export function scoreSpecialization(stock: BSEStock): SpecializationScore {
  let rdScore = 50;
  let marketShareScore = 50;
  let profitabilityScore = 50;
  let innovationScore = 50;

  if (stock.isSpecialized) rdScore += 20;
  if (stock.isLittleGiant) { rdScore += 15; innovationScore += 15; }
  if (stock.grossMargin > 0.4) profitabilityScore += 20;
  if (stock.revenueGrowth > 20) marketShareScore += 15;

  const totalScore = Math.round(
    (rdScore + marketShareScore + profitabilityScore + innovationScore) / 4
  );

  let category = '普通企业';
  if (stock.isLittleGiant) category = '专精特新小巨人';
  else if (stock.isSpecialized) category = '专精特新企业';

  return {
    ticker: stock.ticker,
    isSpecialized: stock.isSpecialized,
    isLittleGiant: stock.isLittleGiant,
    rdScore: Math.min(100, rdScore),
    marketShareScore: Math.min(100, marketShareScore),
    profitabilityScore: Math.min(100, profitabilityScore),
    innovationScore: Math.min(100, innovationScore),
    totalScore: Math.min(100, totalScore),
    category,
  };
}

/**
 * 北交所流动性分析
 */
export function analyzeBSELiquidity(stock: BSEStock): {
  ticker: string;
  liquidityScore: number;
  tier: 'good' | 'moderate' | 'poor';
  marketMakerImpact: number;
  canAbsorb: number; // 可吸收金额(万)
} {
  let score = 30; // 北交所基础分较低

  score += stock.turnoverRate > 0.02 ? 20 : stock.turnoverRate > 0.01 ? 10 : 0;
  score += stock.bidAskSpread < 0.005 ? 15 : stock.bidAskSpread < 0.01 ? 5 : -10;
  score += stock.hasMarketMaker ? 15 : -10;
  score += stock.marketMakerCount > 2 ? 10 : 0;

  score = Math.max(0, Math.min(100, score));

  let tier: 'good' | 'moderate' | 'poor';
  if (score >= 60) tier = 'good';
  else if (score >= 40) tier = 'moderate';
  else tier = 'poor';

  const marketMakerImpact = stock.hasMarketMaker ? 15 : 0;
  const canAbsorb = stock.avgVolume * stock.price / 1e4 * 0.1; // 10%的日成交量

  return {
    ticker: stock.ticker,
    liquidityScore: score,
    tier,
    marketMakerImpact,
    canAbsorb,
  };
}
