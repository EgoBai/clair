/**
 * 盈利挤压分析引擎
 * - 毛利率变动分析
 * - 费用率挤压
 * - 成本压力识别
 * - 提价能力评估
 * - 盈利弹性分析
 */
export interface EarningsSqueezeData {
  periods: {
    period: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    sellingExpense: number;
    adminExpense: number;
    rdExpense: number;
    financeExpense: number;
    netProfit: number;
    operatingCashFlow: number;
  }[];
  rawMaterialCostChange: number; // 原材料成本变动率
  laborCostChange: number; // 人工成本变动率
  priceChange: number; // 产品售价变动率
  volumeChange: number; // 销量变动率
}

export interface EarningsSqueezeResult {
  grossMarginTrend: 'expanding' | 'stable' | 'compressing';
  grossMarginChange: number;
  expensePressure: 'low' | 'moderate' | 'high';
  costPressureSource: string[];
  pricingPower: 'strong' | 'moderate' | 'weak';
  earningsElasticity: number; // 盈利弹性
  marginSqueezeScore: number; // 0-100(越高越健康)
  warningFlags: string[];
  profitabilityGrade: 'A' | 'B' | 'C' | 'D';
  cashConversionCycle: number; // 现金转化周期
}

export function analyzeEarningsSqueeze(data: EarningsSqueezeData): EarningsSqueezeResult {
  const periods = data.periods;
  if (periods.length < 2) throw new Error('至少需要2个期间数据');

  const warningFlags: string[] = [];

  // 毛利率趋势
  const grossMargins = periods.map(p => p.grossProfit / Math.max(p.revenue, 1));
  const recentGM = grossMargins[grossMargins.length - 1];
  const olderGM = grossMargins[0];
  const grossMarginChange = recentGM - olderGM;

  let grossMarginTrend: EarningsSqueezeResult['grossMarginTrend'];
  if (grossMarginChange > 0.02) grossMarginTrend = 'expanding';
  else if (grossMarginChange < -0.02) {
    grossMarginTrend = 'compressing';
    warningFlags.push('毛利率持续压缩');
  } else grossMarginTrend = 'stable';

  // 费用率压力
  const recent = periods[periods.length - 1];
  const revenue = recent.revenue;
  const totalExpenseRatio = (recent.sellingExpense + recent.adminExpense + recent.rdExpense + recent.financeExpense) / Math.max(revenue, 1);
  const prevRevenue = periods[periods.length - 2]?.revenue || revenue;
  const revenueGrowth = (revenue - prevRevenue) / Math.max(prevRevenue, 1);

  let expensePressure: EarningsSqueezeResult['expensePressure'];
  if (totalExpenseRatio > 0.3) { expensePressure = 'high'; warningFlags.push('费用率偏高'); }
  else if (totalExpenseRatio > 0.2) expensePressure = 'moderate';
  else expensePressure = 'low';

  // 成本压力来源
  const costPressureSource: string[] = [];
  if (data.rawMaterialCostChange > 0.05) costPressureSource.push('原材料成本上涨');
  if (data.laborCostChange > 0.05) costPressureSource.push('人工成本上涨');

  // 提价能力
  let pricingPower: EarningsSqueezeResult['pricingPower'];
  if (data.priceChange > 0 && data.priceChange >= data.rawMaterialCostChange) pricingPower = 'strong';
  else if (data.priceChange > -0.02) pricingPower = 'moderate';
  else { pricingPower = 'weak'; warningFlags.push('提价能力不足'); }

  // 盈利弹性 = 净利润变动率 / 收入变动率
  const recentNP = recent.netProfit;
  const prevNP = periods[periods.length - 2]?.netProfit || recentNP;
  const npGrowth = prevNP !== 0 ? (recentNP - prevNP) / Math.abs(prevNP) : 0;
  const earningsElasticity = revenueGrowth !== 0 ? npGrowth / revenueGrowth : 0;

  // 挤压评分
  let score = 100;
  if (grossMarginTrend === 'compressing') score -= 30;
  else if (grossMarginTrend === 'stable') score -= 10;
  if (expensePressure === 'high') score -= 20;
  if (pricingPower === 'weak') score -= 20;
  if (costPressureSource.length > 0) score -= 10 * costPressureSource.length;
  score = Math.max(0, Math.min(100, score));

  // 盈利等级
  let profitabilityGrade: EarningsSqueezeResult['profitabilityGrade'];
  if (score >= 80) profitabilityGrade = 'A';
  else if (score >= 60) profitabilityGrade = 'B';
  else if (score >= 40) profitabilityGrade = 'C';
  else profitabilityGrade = 'D';

  // 现金转化周期
  const cashConversionCycle = recent.operatingCashFlow > 0
    ? Math.round(365 * recent.netProfit / recent.operatingCashFlow)
    : 365;

  return {
    grossMarginTrend,
    grossMarginChange: Math.round(grossMarginChange * 10000) / 10000,
    expensePressure,
    costPressureSource,
    pricingPower,
    earningsElasticity: Math.round(earningsElasticity * 100) / 100,
    marginSqueezeScore: score,
    warningFlags,
    profitabilityGrade,
    cashConversionCycle,
  };
}
