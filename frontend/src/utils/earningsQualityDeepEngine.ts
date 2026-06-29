/**
 * 盈利质量深度分析引擎
 * - 应计利润分析
 * - 收入质量(现金回收率)
 * - 利润操纵预警
 * - 持续性评估
 * - 盈利真实性评分
 */
export interface EarningsQualityData {
  netProfit: number;
  operatingCashFlow: number;
  revenue: number;
  accountsReceivable: number;
  inventory: number;
  totalAssets: number;
  depreciation: number;
  nonRecurringItems: number; // 非经常性损益
  accruals: number; // 应计利润
  grossProfit: number;
  cogs: number;
  sellingExpense: number;
  adminExpense: number;
  rdExpense: number;
  prevNetProfit: number;
  prevRevenue: number;
  prevOperatingCashFlow: number;
}

export interface EarningsQualityResult {
  cashConversionRatio: number; // 现金转化率
  accrualRatio: number; // 应计比率
  earningsManipulationRisk: 'low' | 'medium' | 'high';
  revenueQuality: 'excellent' | 'good' | 'concerning' | 'poor';
  recurringRatio: number; // 经常性利润占比
  earningsSustainability: number; // 可持续性评分 0-100
  qualityScore: number; // 质量评分 0-100
  qualityGrade: 'A' | 'B' | 'C' | 'D';
  redFlags: string[];
  beneishMScore: number; // Beneish M-score
}

export function analyzeEarningsQuality(data: EarningsQualityData): EarningsQualityResult {
  const redFlags: string[] = [];

  // 现金转化率
  const cashConversionRatio = data.netProfit !== 0
    ? data.operatingCashFlow / data.netProfit
    : 0;
  if (cashConversionRatio < 0.8) redFlags.push('经营现金流显著低于净利润');

  // 应计比率
  const avgAssets = data.totalAssets;
  const accrualRatio = data.accruals / Math.max(avgAssets, 1);
  if (Math.abs(accrualRatio) > 0.1) redFlags.push('应计利润比率偏高');

  // 收入质量
  let revenueQuality: EarningsQualityResult['revenueQuality'];
  const arGrowth = data.accountsReceivable / Math.max(data.revenue, 1);
  const revGrowth = (data.revenue - data.prevRevenue) / Math.max(data.prevRevenue, 1);
  const _cashFlowGrowth = (data.operatingCashFlow - data.prevOperatingCashFlow) / Math.max(data.prevOperatingCashFlow, 1);

  if (cashConversionRatio > 1.0 && arGrowth < 0.2) revenueQuality = 'excellent';
  else if (cashConversionRatio > 0.8 && arGrowth < 0.3) revenueQuality = 'good';
  else if (cashConversionRatio > 0.5) { revenueQuality = 'concerning'; redFlags.push('收入质量存疑'); }
  else { revenueQuality = 'poor'; redFlags.push('收入质量极差'); }

  // 应收账款增长率 vs 收入增长率
  if (data.prevRevenue > 0) {
    const arGrowthRate = data.accountsReceivable / Math.max(data.revenue * 0.8, 1); // 简化比较
    if (arGrowthRate > 0.3 && revGrowth > 0) redFlags.push('应收账款增速快于收入');
  }

  // 操纵风险
  let manipulationRisk: EarningsQualityResult['earningsManipulationRisk'];
  if (redFlags.length >= 3) manipulationRisk = 'high';
  else if (redFlags.length >= 1) manipulationRisk = 'medium';
  else manipulationRisk = 'low';

  // 经常性利润占比
  const recurringRatio = data.netProfit !== 0
    ? (data.netProfit - data.nonRecurringItems) / data.netProfit
    : 0;
  if (recurringRatio < 0.7) redFlags.push('非经常性损益占比过高');

  // Beneish M-score (简化版)
  const dsri = data.accountsReceivable / Math.max(data.revenue, 1) / Math.max(0.15, 0.15);
  const gmi = ((data.prevRevenue - (data.prevRevenue * (1 - (data.grossProfit / Math.max(data.revenue, 1))))) /
    Math.max(data.prevRevenue, 1)) || 1;
  const aqi = data.totalAssets / Math.max(data.totalAssets * 0.95, 1);
  const sgi = data.revenue / Math.max(data.prevRevenue, 1);
  const depi = 1; // 简化
  const tata = data.accruals / Math.max(data.totalAssets, 1);
  const lvgi = 1; // 简化
  const beneishMScore = -4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi +
    0.115 * depi - 0.172 * tata + 4.679 * tata * tata - 0.327 * lvgi;

  // 可持续性评分
  let sustainability = 100;
  if (cashConversionRatio < 0.5) sustainability -= 30;
  else if (cashConversionRatio < 0.8) sustainability -= 15;
  if (recurringRatio < 0.5) sustainability -= 25;
  else if (recurringRatio < 0.7) sustainability -= 10;
  if (revGrowth < 0) sustainability -= 15;
  sustainability = Math.max(0, Math.min(100, sustainability));

  // 质量评分
  let qualityScore = 100;
  if (cashConversionRatio < 0.5) qualityScore -= 30;
  else if (cashConversionRatio < 0.8) qualityScore -= 15;
  qualityScore -= redFlags.length * 10;
  qualityScore += Math.min(20, recurringRatio * 20);
  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

  let qualityGrade: EarningsQualityResult['qualityGrade'];
  if (qualityScore >= 80) qualityGrade = 'A';
  else if (qualityScore >= 60) qualityGrade = 'B';
  else if (qualityScore >= 40) qualityGrade = 'C';
  else qualityGrade = 'D';

  return {
    cashConversionRatio: Math.round(cashConversionRatio * 100) / 100,
    accrualRatio: Math.round(accrualRatio * 10000) / 10000,
    earningsManipulationRisk: manipulationRisk,
    revenueQuality,
    recurringRatio: Math.round(recurringRatio * 100) / 100,
    earningsSustainability: sustainability,
    qualityScore,
    qualityGrade,
    redFlags,
    beneishMScore: Math.round(beneishMScore * 100) / 100,
  };
}
