/**
 * 商誉减值预警引擎
 * 商誉占比分析、减值风险评估、减值冲击估算
 */

export interface GoodwillData {
  symbol: string;
  name: string;
  totalAssets: number;
  totalEquity: number;
  goodwill: number;
  netIncome: number;
  prevGoodwill?: number;
  acquisitionCount: number;
  acquiredRevenue: number;
  acquiredNetIncome: number;
}

export interface GoodwillWarning {
  symbol: string;
  name: string;
  goodwillRatio: number;
  goodwillToEquity: number;
  impairmentRisk: 'low' | 'moderate' | 'high' | 'critical';
  riskScore: number;
  potentialImpairment: number;
  impairmentImpactOnEarnings: number;
  warnings: string[];
  details: {
    hasPremium: boolean;
    premiumRatio: number;
    acquisitionROI: number;
    yoyChange: number;
  };
}

/**
 * 商誉减值预警分析
 */
export function analyzeGoodwillRisk(data: GoodwillData): GoodwillWarning {
  const { symbol, name, totalAssets, totalEquity, goodwill, netIncome, prevGoodwill, acquiredRevenue, acquiredNetIncome } = data;

  const goodwillRatio = totalAssets > 0 ? goodwill / totalAssets : 0;
  const goodwillToEquity = totalEquity > 0 ? goodwill / totalEquity : 0;

  // 收购溢价
  const hasPremium = goodwill > 0 && acquiredRevenue > 0;
  const premiumRatio = hasPremium ? goodwill / acquiredRevenue : 0;

  // 收购ROI
  const acquisitionROI = goodwill > 0 ? acquiredNetIncome / goodwill : 0;

  // 同比变化
  const yoyChange = prevGoodwill ? (goodwill - prevGoodwill) / Math.abs(prevGoodwill) : 0;

  // 风险评分
  let riskScore = 0;
  riskScore += goodwillRatio > 0.3 ? 30 : goodwillRatio > 0.2 ? 20 : goodwillRatio > 0.1 ? 10 : 0;
  riskScore += goodwillToEquity > 0.5 ? 25 : goodwillToEquity > 0.3 ? 15 : 0;
  riskScore += acquisitionROI < 0 ? 20 : acquisitionROI < 0.05 ? 10 : 0;
  riskScore += premiumRatio > 3 ? 15 : premiumRatio > 2 ? 10 : 0;
  riskScore += yoyChange > 0.3 ? 10 : 0;
  riskScore = Math.min(100, riskScore);

  const impairmentRisk: GoodwillWarning['impairmentRisk'] =
    riskScore >= 70 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'moderate' : 'low';

  // 潜在减值金额
  const potentialImpairment = riskScore >= 50 ? goodwill * 0.3 : riskScore >= 25 ? goodwill * 0.1 : 0;
  const impairmentImpactOnEarnings = netIncome !== 0 ? potentialImpairment / Math.abs(netIncome) : 0;

  // 警告
  const warnings: string[] = [];
  if (goodwillRatio > 0.2) warnings.push(`商誉占总资产 ${(goodwillRatio * 100).toFixed(1)}%，占比偏高`);
  if (goodwillToEquity > 0.5) warnings.push(`商誉占净资产 ${(goodwillToEquity * 100).toFixed(1)}%，减值风险大`);
  if (acquisitionROI < 0) warnings.push('收购标的盈利为负');
  if (premiumRatio > 3) warnings.push('收购溢价过高');
  if (potentialImpairment > netIncome) warnings.push('潜在减值金额超过净利润');

  return {
    symbol, name,
    goodwillRatio: Math.round(goodwillRatio * 10000) / 10000,
    goodwillToEquity: Math.round(goodwillToEquity * 10000) / 10000,
    impairmentRisk,
    riskScore: Math.round(riskScore * 10) / 10,
    potentialImpairment: Math.round(potentialImpairment),
    impairmentImpactOnEarnings: Math.round(impairmentImpactOnEarnings * 100) / 100,
    warnings,
    details: { hasPremium, premiumRatio: Math.round(premiumRatio * 100) / 100, acquisitionROI: Math.round(acquisitionROI * 10000) / 10000, yoyChange: Math.round(yoyChange * 10000) / 10000 },
  };
}
