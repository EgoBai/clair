/**
 * 财报质量评分引擎
 * - 收入质量分析
 * - 盈利持续性评估
 * - 现金流质量
 * - 资产质量评分
 * - 综合财务健康度
 */
export interface FinancialQualityData {
  revenue: number;
  netIncome: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  totalAssets: number;
  totalEquity: number;
  currentAssets: number;
  currentLiabilities: number;
  inventory: number;
  accountsReceivable: number;
  goodwill: number;
  totalDebt: number;
  interestExpense: number;
  capex: number;
  revenuePrior: number;
  netIncomePrior: number;
  operatingCFPrior: number;
}

export interface QualityScores {
  revenueQuality: number; // 0-100
  earningsQuality: number;
  cashFlowQuality: number;
  assetQuality: number;
  leverageScore: number;
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  strengths: string[];
  weaknesses: string[];
}

export function scoreFinancialQuality(data: FinancialQualityData): QualityScores {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // 收入质量 (增长率 + 收现比)
  const revGrowth = data.revenuePrior > 0 ? (data.revenue - data.revenuePrior) / data.revenuePrior : 0;
  const cashToRevenue = data.revenue > 0 ? data.operatingCashFlow / data.revenue : 0;
  let revenueQuality = 50;
  if (revGrowth > 0.1) { revenueQuality += 20; strengths.push('收入增长强劲'); }
  else if (revGrowth < -0.1) { revenueQuality -= 20; weaknesses.push('收入下滑'); }
  if (cashToRevenue > 0.1) { revenueQuality += 15; strengths.push('收现比良好'); }
  else if (cashToRevenue < 0) { revenueQuality -= 15; weaknesses.push('收现比为负'); }
  revenueQuality = Math.max(0, Math.min(100, revenueQuality));

  // 盈利质量 (净利增长 + 应计利润比)
  const niGrowth = data.netIncomePrior > 0 ? (data.netIncome - data.netIncomePrior) / data.netIncomePrior : 0;
  const accrualRatio = data.netIncome > 0 ? (data.netIncome - data.operatingCashFlow) / data.netIncome : 0;
  let earningsQuality = 50;
  if (niGrowth > 0.1) { earningsQuality += 20; strengths.push('盈利增长'); }
  else if (niGrowth < -0.2) { earningsQuality -= 20; weaknesses.push('盈利大幅下滑'); }
  if (Math.abs(accrualRatio) < 0.2) { earningsQuality += 15; strengths.push('应计利润占比合理'); }
  else if (accrualRatio > 0.5) { earningsQuality -= 15; weaknesses.push('应计利润占比过高'); }
  earningsQuality = Math.max(0, Math.min(100, earningsQuality));

  // 现金流质量
  let cashFlowQuality = 50;
  if (data.operatingCashFlow > 0) { cashFlowQuality += 15; }
  if (data.freeCashFlow > 0) { cashFlowQuality += 15; strengths.push('自由现金流为正'); }
  else { weaknesses.push('自由现金流为负'); }
  if (data.operatingCashFlow > data.netIncome) { cashFlowQuality += 10; strengths.push('经营现金流大于净利润'); }
  const cfGrowth = data.operatingCFPrior > 0 ? (data.operatingCashFlow - data.operatingCFPrior) / data.operatingCFPrior : 0;
  if (cfGrowth > 0.1) cashFlowQuality += 10;
  cashFlowQuality = Math.max(0, Math.min(100, cashFlowQuality));

  // 资产质量
  let assetQuality = 50;
  const goodwillRatio = data.totalAssets > 0 ? data.goodwill / data.totalAssets : 0;
  const arRatio = data.revenue > 0 ? data.accountsReceivable / data.revenue : 0;
  const inventoryRatio = data.revenue > 0 ? data.inventory / data.revenue : 0;
  if (goodwillRatio < 0.1) { assetQuality += 15; strengths.push('商誉占比低'); }
  else if (goodwillRatio > 0.3) { assetQuality -= 15; weaknesses.push('商誉占比过高'); }
  if (arRatio < 0.3) { assetQuality += 10; }
  else if (arRatio > 0.5) { assetQuality -= 10; weaknesses.push('应收账款占比过高'); }
  if (inventoryRatio < 0.2) { assetQuality += 10; }
  else if (inventoryRatio > 0.4) { assetQuality -= 10; }
  assetQuality = Math.max(0, Math.min(100, assetQuality));

  // 杠杆评分
  const debtToEquity = data.totalEquity > 0 ? data.totalDebt / data.totalEquity : 10;
  const currentRatio = data.currentLiabilities > 0 ? data.currentAssets / data.currentLiabilities : 0;
  const interestCoverage = data.interestExpense > 0 ? data.operatingCashFlow / data.interestExpense : 10;
  let leverageScore = 50;
  if (debtToEquity < 0.5) { leverageScore += 15; strengths.push('低杠杆'); }
  else if (debtToEquity > 2) { leverageScore -= 15; weaknesses.push('高杠杆'); }
  if (currentRatio > 1.5) { leverageScore += 15; strengths.push('流动性充足'); }
  else if (currentRatio < 1) { leverageScore -= 15; weaknesses.push('流动比率不足'); }
  if (interestCoverage > 3) leverageScore += 10;
  leverageScore = Math.max(0, Math.min(100, leverageScore));

  // 综合评分
  const overallScore = (revenueQuality * 0.2 + earningsQuality * 0.25 + cashFlowQuality * 0.25 + assetQuality * 0.15 + leverageScore * 0.15);

  // 评级
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (overallScore >= 80) grade = 'A';
  else if (overallScore >= 65) grade = 'B';
  else if (overallScore >= 50) grade = 'C';
  else if (overallScore >= 35) grade = 'D';
  else grade = 'F';

  return { revenueQuality, earningsQuality, cashFlowQuality, assetQuality, leverageScore, overallScore, grade, strengths, weaknesses };
}
