/**
 * 财务预警雷达引擎
 * 多维度财务健康检测、Z-Score模型、风险预警
 */

export interface FinancialData {
  totalAssets: number;
  totalLiabilities: number;
  currentAssets: number;
  currentLiabilities: number;
  retainedEarnings: number;
  ebit: number;
  marketCap: number;
  sales: number;
  netIncome: number;
  operatingCashFlow: number;
  revenue: number;
  grossProfit: number;
  inventory: number;
  receivables: number;
  previousRevenue?: number;
  previousNetIncome?: number;
}

export interface WarningResult {
  zScore: number;
  zScoreZone: 'safe' | 'grey' | 'distress';
  altmanGrade: string;
  warnings: { category: string; level: 'info' | 'warning' | 'danger'; message: string }[];
  healthScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: {
    liquidity: number;
    leverage: number;
    profitability: number;
    efficiency: number;
    growth: number;
  };
}

/**
 * Altman Z-Score
 */
export function altmanZScore(d: FinancialData): number {
  const x1 = (d.currentAssets - d.currentLiabilities) / Math.max(1, d.totalAssets);
  const x2 = d.retainedEarnings / Math.max(1, d.totalAssets);
  const x3 = d.ebit / Math.max(1, d.totalAssets);
  const x4 = d.marketCap / Math.max(1, d.totalLiabilities);
  const x5 = d.sales / Math.max(1, d.totalAssets);
  return 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
}

/**
 * 财务预警分析
 */
export function financialWarningAnalysis(data: FinancialData): WarningResult {
  const zScore = altmanZScore(data);
  const zScoreZone = zScore > 2.99 ? 'safe' : zScore > 1.81 ? 'grey' : 'distress';
  const altmanGrade = zScore > 3 ? 'A' : zScore > 2.5 ? 'B' : zScore > 1.8 ? 'C' : zScore > 1.0 ? 'D' : 'F';

  const warnings: WarningResult['warnings'] = [];

  // 流动性
  const currentRatio = data.currentAssets / Math.max(1, data.currentLiabilities);
  const liquidity = Math.min(100, currentRatio * 50);
  if (currentRatio < 1) warnings.push({ category: '流动性', level: 'danger', message: `流动比率 ${currentRatio.toFixed(2)} < 1` });
  else if (currentRatio < 1.5) warnings.push({ category: '流动性', level: 'warning', message: `流动比率偏低 ${currentRatio.toFixed(2)}` });

  // 杠杆
  const debtRatio = data.totalLiabilities / Math.max(1, data.totalAssets);
  const leverage = Math.max(0, 100 - debtRatio * 100);
  if (debtRatio > 0.7) warnings.push({ category: '杠杆', level: 'danger', message: `资产负债率 ${(debtRatio * 100).toFixed(1)}%` });
  else if (debtRatio > 0.5) warnings.push({ category: '杠杆', level: 'warning', message: `资产负债率偏高 ${(debtRatio * 100).toFixed(1)}%` });

  // 盈利能力
  const netMargin = data.netIncome / Math.max(1, data.revenue);
  const profitability = Math.min(100, Math.max(0, netMargin * 500 + 50));
  if (netMargin < 0) warnings.push({ category: '盈利', level: 'danger', message: '净利润为负' });
  else if (netMargin < 0.03) warnings.push({ category: '盈利', level: 'warning', message: `净利率偏低 ${(netMargin * 100).toFixed(1)}%` });

  // 效率
  const assetTurnover = data.sales / Math.max(1, data.totalAssets);
  const efficiency = Math.min(100, assetTurnover * 50);

  // 增长
  const revenueGrowth = data.previousRevenue ? (data.revenue - data.previousRevenue) / Math.abs(data.previousRevenue) : 0;
  const growth = Math.min(100, Math.max(0, revenueGrowth * 200 + 50));
  if (revenueGrowth < -0.1) warnings.push({ category: '增长', level: 'warning', message: `营收下降 ${(Math.abs(revenueGrowth) * 100).toFixed(1)}%` });

  // 现金流
  if (data.operatingCashFlow < 0) warnings.push({ category: '现金流', level: 'danger', message: '经营现金流为负' });
  const cashConversion = data.netIncome > 0 ? data.operatingCashFlow / data.netIncome : 0;
  if (cashConversion < 0.5 && data.netIncome > 0) warnings.push({ category: '现金流', level: 'warning', message: `现金转换率偏低 ${(cashConversion * 100).toFixed(0)}%` });

  // 健康评分
  const healthScore = Math.round((liquidity * 0.2 + leverage * 0.25 + profitability * 0.25 + efficiency * 0.15 + growth * 0.15) * 10) / 10;

  const dangerCount = warnings.filter(w => w.level === 'danger').length;
  const riskLevel: WarningResult['riskLevel'] = dangerCount >= 3 ? 'critical' : dangerCount >= 2 ? 'high' : dangerCount >= 1 ? 'medium' : 'low';

  return {
    zScore: Math.round(zScore * 100) / 100,
    zScoreZone,
    altmanGrade,
    warnings,
    healthScore,
    riskLevel,
    details: {
      liquidity: Math.round(liquidity * 10) / 10,
      leverage: Math.round(leverage * 10) / 10,
      profitability: Math.round(profitability * 10) / 10,
      efficiency: Math.round(efficiency * 10) / 10,
      growth: Math.round(growth * 10) / 10,
    },
  };
}
