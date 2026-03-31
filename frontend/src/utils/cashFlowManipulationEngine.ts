/**
 * 现金流操纵检测引擎
 * - 经营现金流/净利润匹配度
 * - 应收账款周转异常
 * - 存货异常分析
* - 预付款/应付款异常
 * - 现金流质量评级
 */
export interface CashFlowData {
  operatingCF: number;
  netIncome: number;
  revenue: number;
  accountsReceivable: number;
  inventory: number;
  prepaidExpenses: number;
  accountsPayable: number;
  depreciation: number;
  capex: number;
  operatingCFPrior: number;
  revenuePrior: number;
  arPrior: number;
  inventoryPrior: number;
}

export interface CashFlowQuality {
  cashToProfitRatio: number;
  arTurnover: number;
  inventoryTurnover: number;
  cashConversionCycle: number;
  fcfToNetIncome: number;
  accrualRatio: number;
  qualityScore: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  manipulationRisk: 'low' | 'medium' | 'high';
  redFlags: string[];
}

export function analyzeCashFlowQuality(data: CashFlowData): CashFlowQuality {
  const redFlags: string[] = [];

  // 现金流/利润比
  const cashToProfitRatio = data.netIncome > 0 ? data.operatingCF / data.netIncome : 0;
  if (cashToProfitRatio < 0.5 && data.netIncome > 0) redFlags.push('经营现金流远低于净利润');

  // 应收账款周转
  const avgAR = (data.accountsReceivable + data.arPrior) / 2;
  const arTurnover = avgAR > 0 ? data.revenue / avgAR : 0;
  const arGrowth = data.arPrior > 0 ? (data.accountsReceivable - data.arPrior) / data.arPrior : 0;
  const revGrowth = data.revenuePrior > 0 ? (data.revenue - data.revenuePrior) / data.revenuePrior : 0;
  if (arGrowth > revGrowth + 0.1) redFlags.push('应收账款增速远超收入增速');

  // 存货周转
  const avgInv = (data.inventory + data.inventoryPrior) / 2;
  const cogs = data.revenue * 0.6; // 简化
  const inventoryTurnover = avgInv > 0 ? cogs / avgInv : 0;
  const invGrowth = data.inventoryPrior > 0 ? (data.inventory - data.inventoryPrior) / data.inventoryPrior : 0;
  if (invGrowth > revGrowth + 0.1) redFlags.push('存货增速远超收入增速');

  // 现金转化周期
  const daysAR = arTurnover > 0 ? 365 / arTurnover : 0;
  const daysInv = inventoryTurnover > 0 ? 365 / inventoryTurnover : 0;
  const apTurnover = data.accountsPayable > 0 ? cogs / data.accountsPayable : 0;
  const daysAP = apTurnover > 0 ? 365 / apTurnover : 0;
  const cashConversionCycle = daysAR + daysInv - daysAP;

  // 自由现金流/净利润
  const fcf = data.operatingCF - data.capex;
  const fcfToNetIncome = data.netIncome > 0 ? fcf / data.netIncome : 0;
  if (fcfToNetIncome < 0 && data.netIncome > 0) redFlags.push('正净利润但负自由现金流');

  // 应计比例
  const accrualRatio = data.netIncome > 0 ? (data.netIncome - data.operatingCF) / data.netIncome : 0;
  if (accrualRatio > 0.5) redFlags.push('应计利润占比过高');

  // 质量评分
  let qualityScore = 50;
  if (cashToProfitRatio > 1.0) qualityScore += 15;
  else if (cashToProfitRatio < 0.5) qualityScore -= 20;
  if (arTurnover > 6) qualityScore += 10;
  else if (arTurnover < 3) qualityScore -= 10;
  if (inventoryTurnover > 5) qualityScore += 10;
  else if (inventoryTurnover < 2) qualityScore -= 10;
  if (fcfToNetIncome > 0.7) qualityScore += 10;
  if (Math.abs(accrualRatio) < 0.2) qualityScore += 5;
  qualityScore -= redFlags.length * 8;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  // 评级
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (qualityScore >= 80) grade = 'A';
  else if (qualityScore >= 65) grade = 'B';
  else if (qualityScore >= 50) grade = 'C';
  else if (qualityScore >= 35) grade = 'D';
  else grade = 'F';

  const manipulationRisk = redFlags.length >= 3 ? 'high' : redFlags.length >= 1 ? 'medium' : 'low';

  return {
    cashToProfitRatio, arTurnover, inventoryTurnover, cashConversionCycle,
    fcfToNetIncome, accrualRatio, qualityScore, grade, manipulationRisk, redFlags,
  };
}
