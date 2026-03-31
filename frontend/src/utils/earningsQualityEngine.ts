/**
 * Earnings Quality Engine
 * 
 * 盈利质量分析引擎 - 分析公司盈利质量、可持续性、现金流匹配
 */

export interface EarningsData {
  quarter: string;
  revenue: number;
  netIncome: number;
  operatingCashFlow: number;
  capex: number;
  depreciation: number;
  accountsReceivable: number;
  inventory: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  oneTimeItems: number;
}

export interface EarningsQualityResult {
  score: number; // 0-100
  cashConversionRatio: number;
  accrualRatio: number;
  marginTrend: 'improving' | 'stable' | 'deteriorating';
  revenueQuality: 'high' | 'medium' | 'low';
  sustainabilityScore: number;
  redFlags: string[];
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

// ===== Cash Conversion =====

export function cashConversionRatio(
  netIncome: number,
  operatingCashFlow: number
): number {
  if (netIncome <= 0) return operatingCashFlow >= 0 ? 1 : -1;
  return operatingCashFlow / netIncome;
}

// ===== Accrual Ratio =====

export function accrualRatio(
  netIncome: number,
  operatingCashFlow: number,
  avgAssets: number
): number {
  if (avgAssets <= 0) return 0;
  return (netIncome - operatingCashFlow) / avgAssets;
}

// ===== Margin Analysis =====

export function analyzeMarginTrend(
  data: EarningsData[]
): 'improving' | 'stable' | 'deteriorating' {
  if (data.length < 2) return 'stable';

  const recent = data.slice(-4);
  const margins = recent.map((d) => d.netMargin);

  const avgFirst = margins.slice(0, Math.floor(margins.length / 2)).reduce((s, m) => s + m, 0) /
    Math.max(1, Math.floor(margins.length / 2));
  const avgSecond = margins.slice(Math.floor(margins.length / 2)).reduce((s, m) => s + m, 0) /
    Math.max(1, margins.length - Math.floor(margins.length / 2));

  const diff = avgSecond - avgFirst;

  if (diff > 0.01) return 'improving';
  if (diff < -0.01) return 'deteriorating';
  return 'stable';
}

// ===== Revenue Quality =====

export function assessRevenueQuality(data: EarningsData): 'high' | 'medium' | 'low' {
  const arRatio = data.accountsReceivable / data.revenue;
  const inventoryRatio = data.inventory / data.revenue;

  if (arRatio < 0.15 && inventoryRatio < 0.1) return 'high';
  if (arRatio < 0.3 && inventoryRatio < 0.2) return 'medium';
  return 'low';
}

// ===== Red Flag Detection =====

export function detectRedFlags(data: EarningsData[]): string[] {
  const flags: string[] = [];
  if (data.length === 0) return flags;

  const latest = data[data.length - 1];

  // Cash flow not matching earnings
  const ccr = cashConversionRatio(latest.netIncome, latest.operatingCashFlow);
  if (ccr < 0.5 && latest.netIncome > 0) flags.push('现金流与利润严重不匹配');

  // Large one-time items
  if (Math.abs(latest.oneTimeItems) > Math.abs(latest.netIncome) * 0.3) {
    flags.push('一次性损益占比过高');
  }

  // Inventory growing faster than revenue
  if (data.length >= 2) {
    const prev = data[data.length - 2];
    const invGrowth = (latest.inventory - prev.inventory) / prev.inventory;
    const revGrowth = (latest.revenue - prev.revenue) / prev.revenue;
    if (invGrowth > revGrowth * 1.5) flags.push('存货增速远超收入增速');
  }

  // Declining margins
  const trend = analyzeMarginTrend(data);
  if (trend === 'deteriorating') flags.push('利润率持续下降');

  return flags;
}

// ===== Full Quality Analysis =====

export function analyzeEarningsQuality(
  data: EarningsData[]
): EarningsQualityResult {
  if (data.length === 0) {
    return {
      score: 0,
      cashConversionRatio: 0,
      accrualRatio: 0,
      marginTrend: 'stable',
      revenueQuality: 'low',
      sustainabilityScore: 0,
      redFlags: ['无数据'],
      qualityGrade: 'F',
    };
  }

  const latest = data[data.length - 1];
  const avgAssets = (latest.accountsReceivable + latest.inventory) * 2;

  const ccr = cashConversionRatio(latest.netIncome, latest.operatingCashFlow);
  const ar = accrualRatio(latest.netIncome, latest.operatingCashFlow, avgAssets);
  const marginTrend = analyzeMarginTrend(data);
  const revenueQuality = assessRevenueQuality(latest);
  const redFlags = detectRedFlags(data);

  // Score calculation
  let score = 50;
  if (ccr > 1) score += 15;
  else if (ccr > 0.8) score += 10;
  else if (ccr < 0.5) score -= 15;

  if (marginTrend === 'improving') score += 10;
  if (marginTrend === 'deteriorating') score -= 10;

  if (revenueQuality === 'high') score += 10;
  if (revenueQuality === 'low') score -= 10;

  score -= redFlags.length * 8;
  score = Math.max(0, Math.min(100, score));

  // Sustainability score
  let sustainabilityScore = 70;
  if (Math.abs(ar) < 0.02) sustainabilityScore += 15;
  if (ccr > 0.9) sustainabilityScore += 15;
  sustainabilityScore = Math.max(0, Math.min(100, sustainabilityScore));

  // Grade
  let qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 85) qualityGrade = 'A';
  else if (score >= 70) qualityGrade = 'B';
  else if (score >= 50) qualityGrade = 'C';
  else if (score >= 30) qualityGrade = 'D';
  else qualityGrade = 'F';

  return {
    score,
    cashConversionRatio: Math.round(ccr * 100) / 100,
    accrualRatio: Math.round(ar * 10000) / 10000,
    marginTrend,
    revenueQuality,
    sustainabilityScore,
    redFlags,
    qualityGrade,
  };
}
