/**
 * 财务造假检测引擎
 * - Beneish M-Score模型
 * - 财务指标异常检测
 * - 应收账款异常分析
 * - 现金流与利润匹配度
 * - 关联交易风险
 */
export interface FinancialData {
  revenue: number;
  cogs: number; // 销售成本
  sga: number; // 销售管理费用
  depreciation: number;
  netIncome: number;
  accountsReceivable: number;
  currentAssets: number;
  totalAssets: number;
  ppe: number; // 固定资产
  currentLiabilities: number;
  totalDebt: number;
  cashFromOperations: number;
  revenuePrior: number;
  arPrior: number;
  cogsPrior: number;
  currentAssetsPrior: number;
  ppePrior: number;
  currentLiabilitiesPrior: number;
}

export interface MScoreResult {
  dsri: number; // 应收天数指数
  gmi: number; // 毛利率指数
  aqi: number; // 资产质量指数
  sgi: number; // 销售增长指数
  depi: number; // 折旧指数
  sgai: number; // 销管费用指数
  lvgi: number; // 杠杆指数
  tata: number; // 总应计/总资产
  mScore: number;
  manipulationProbability: 'low' | 'moderate' | 'high';
}

export interface FraudAnalysis {
  mScore: MScoreResult;
  cashFlowMismatch: number; // 现金流与利润偏差
  arTurnoverAnomaly: boolean;
  grossMarginAnomaly: boolean;
  relatedPartyRisk: number;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  redFlags: string[];
  confidence: number;
}

export function detectFraud(data: FinancialData): FraudAnalysis {
  // Beneish M-Score
  const mScore = computeMScore(data);

  // 现金流与利润匹配度
  const cashFlowMismatch = data.netIncome > 0
    ? (data.netIncome - data.cashFromOperations) / data.netIncome
    : 0;

  // 应收账款周转异常
  const arTurnover = data.revenue / ((data.accountsReceivable + data.arPrior) / 2);
  const arTurnoverAnomaly = arTurnover < 4; // 行业通常>6

  // 毛利率异常
  const grossMargin = (data.revenue - data.cogs) / data.revenue;
  const grossMarginPrior = (data.revenuePrior - data.cogsPrior) / data.revenuePrior;
  const grossMarginAnomaly = grossMargin - grossMarginPrior > 0.1; // 毛利率大幅提升

  // 关联交易风险 (简化)
  const relatedPartyRisk = data.sga / data.revenue > 0.3 ? 0.7 : 0.2;

  // 红旗
  const redFlags: string[] = [];
  if (mScore.mScore > -1.78) redFlags.push('M-Score超过阈值，存在操纵可能');
  if (cashFlowMismatch > 0.5) redFlags.push('经营现金流与净利润严重不匹配');
  if (arTurnoverAnomaly) redFlags.push('应收账款周转率偏低');
  if (grossMarginAnomaly) redFlags.push('毛利率异常提升');
  if (data.depreciation / data.ppe < 0.03) redFlags.push('折旧率偏低，可能少计提折旧');
  if (mScore.dsri > 1.3) redFlags.push('应收账款天数大幅增加');
  if (mScore.tata > 0.05) redFlags.push('总应计比例偏高');

  // 综合风险
  const riskScore = redFlags.length * 15 + (mScore.mScore > -1.78 ? 20 : 0) + Math.max(0, cashFlowMismatch) * 30;
  let overallRisk: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore > 60) overallRisk = 'critical';
  else if (riskScore > 40) overallRisk = 'high';
  else if (riskScore > 20) overallRisk = 'medium';
  else overallRisk = 'low';

  const confidence = Math.min(0.95, 0.5 + redFlags.length * 0.1);

  return { mScore, cashFlowMismatch, arTurnoverAnomaly, grossMarginAnomaly, relatedPartyRisk, overallRisk, redFlags, confidence };
}

function computeMScore(data: FinancialData): MScoreResult {
  const dsri = (data.accountsReceivable / data.revenue) / (data.arPrior / Math.max(data.revenuePrior, 1));
  const gmi = ((data.revenuePrior - data.cogsPrior) / Math.max(data.revenuePrior, 1))
    / ((data.revenue - data.cogs) / Math.max(data.revenue, 1));
  const aqi = 1 - (data.currentAssets + data.ppe) / data.totalAssets;
  const sgi = data.revenue / Math.max(data.revenuePrior, 1);
  const depi = (data.depreciation / Math.max(data.ppePrior, 1)) / (data.depreciation / Math.max(data.ppe, 1));
  const sgai = (data.sga / data.revenue) / (data.sga / Math.max(data.revenuePrior, 1));
  const lvgi = (data.currentLiabilities + data.totalDebt) / data.totalAssets
    / ((data.currentLiabilitiesPrior + data.totalDebt) / data.totalAssets);
  const tata = (data.netIncome - data.cashFromOperations) / data.totalAssets;

  const mScore = -4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi
    + 0.115 * depi - 0.172 * sgai + 4.679 * tata - 0.327 * lvgi;

  const manipulationProbability = mScore > -1.78 ? 'high' : mScore > -2.22 ? 'moderate' : 'low';

  return { dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata, mScore, manipulationProbability };
}
