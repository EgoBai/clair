/**
 * 债务重组分析引擎
 * - 债务结构分析(短期/长期/有息/无息)
 * - 偿债能力评估
 * - 债务重组风险评分
 * - 违约预警
 * - 再融资压力测试
 */
export interface DebtStructure {
  totalDebt: number;
  shortTermDebt: number;
  longTermDebt: number;
  interestBearingDebt: number;
  cash: number;
  ebitda: number;
  interestExpense: number;
  operatingCashFlow: number;
  totalAssets: number;
  netAssets: number;
  totalRevenue: number;
  currentAssets: number;
  currentLiabilities: number;
}

export interface DebtRestructuringResult {
  leverageRatio: number;
  debtToEquity: number;
  interestCoverage: number;
  currentRatio: number;
  cashFlowCoverage: number;
  debtMaturityPressure: number;
  debtStructureScore: number; // 0-100
  restructuringRisk: 'low' | 'medium' | 'high' | 'critical';
  warningSignals: string[];
  debtHealthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  refinancingPressure: number;
  recommendedActions: string[];
}

export function analyzeDebtRestructuring(ds: DebtStructure): DebtRestructuringResult {
  if (ds.totalAssets <= 0) throw new Error('总资产必须大于0');

  const leverageRatio = ds.totalDebt / ds.totalAssets;
  const debtToEquity = ds.totalDebt / Math.max(ds.netAssets, 1);
  const interestCoverage = ds.ebitda / Math.max(ds.interestExpense, 1);
  const currentRatio = ds.currentAssets / Math.max(ds.currentLiabilities, 1);
  const cashFlowCoverage = ds.operatingCashFlow / Math.max(ds.interestExpense, 1);
  const debtMaturityPressure = ds.shortTermDebt / Math.max(ds.totalDebt, 1);

  let score = 100;
  const warnings: string[] = [];

  // 杠杆率评估
  if (leverageRatio > 0.7) { score -= 30; warnings.push('资产负债率超过70%，杠杆极高'); }
  else if (leverageRatio > 0.6) { score -= 20; warnings.push('资产负债率超过60%，杠杆偏高'); }
  else if (leverageRatio > 0.5) { score -= 10; }

  // 利息覆盖
  if (interestCoverage < 1) { score -= 25; warnings.push('EBITDA不足以覆盖利息支出'); }
  else if (interestCoverage < 2) { score -= 15; warnings.push('利息覆盖率偏低'); }

  // 流动性
  if (currentRatio < 1) { score -= 20; warnings.push('流动比率小于1，短期偿债压力大'); }
  else if (currentRatio < 1.5) { score -= 10; }

  // 现金流覆盖
  if (cashFlowCoverage < 1) { score -= 20; warnings.push('经营现金流不足以支付利息'); }
  else if (cashFlowCoverage < 2) { score -= 10; }

  // 债务到期压力
  if (debtMaturityPressure > 0.6) { score -= 15; warnings.push('短期债务占比过高，再融资压力大'); }

  // 现金储备
  const cashToShortDebt = ds.cash / Math.max(ds.shortTermDebt, 1);
  if (cashToShortDebt < 0.5) { score -= 10; warnings.push('现金不足以覆盖短期债务'); }

  score = Math.max(0, Math.min(100, score));

  let risk: DebtRestructuringResult['restructuringRisk'];
  if (score >= 80) risk = 'low';
  else if (score >= 60) risk = 'medium';
  else if (score >= 40) risk = 'high';
  else risk = 'critical';

  let grade: DebtRestructuringResult['debtHealthGrade'];
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  const refinancingPressure = debtMaturityPressure * (1 - cashToShortDebt * 0.5);

  const actions: string[] = [];
  if (leverageRatio > 0.6) actions.push('建议降低杠杆率，考虑资产处置或增发');
  if (interestCoverage < 2) actions.push('建议优化债务结构，以长换短，以低换高');
  if (debtMaturityPressure > 0.5) actions.push('建议提前安排再融资计划');
  if (cashToShortDebt < 0.8) actions.push('建议增加现金储备或银行授信额度');

  return {
    leverageRatio: Math.round(leverageRatio * 10000) / 10000,
    debtToEquity: Math.round(debtToEquity * 100) / 100,
    interestCoverage: Math.round(interestCoverage * 100) / 100,
    currentRatio: Math.round(currentRatio * 100) / 100,
    cashFlowCoverage: Math.round(cashFlowCoverage * 100) / 100,
    debtMaturityPressure: Math.round(debtMaturityPressure * 10000) / 10000,
    debtStructureScore: score,
    restructuringRisk: risk,
    warningSignals: warnings,
    debtHealthGrade: grade,
    refinancingPressure: Math.round(refinancingPressure * 100) / 100,
    recommendedActions: actions,
  };
}
