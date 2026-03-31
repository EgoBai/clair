/**
 * 现金流质量引擎
 * 经营现金流质量、自由现金流覆盖、现金流结构分析
 */

export interface CashFlowData {
  year: number;
  operatingCF: number;
  investingCF: number;
  financingCF: number;
  netIncome: number;
  depreciation: number;
  capex: number;
  dividends: number;
  revenue: number;
  totalAssets: number;
}

export interface CashFlowQuality {
  qualityScore: number;
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  cashConversion: number;
  fcfCoverage: number;
  fcf: number;
  capexIntensity: number;
  dividendCoverage: number;
  cashFlowStructure: {
    operatingPct: number;
    investingPct: number;
    financingPct: number;
  };
  sustainability: 'strong' | 'adequate' | 'weak' | 'critical';
  warnings: string[];
  trends: {
    operatingTrend: 'improving' | 'stable' | 'deteriorating';
    fcfTrend: 'improving' | 'stable' | 'deteriorating';
  };
}

/**
 * 分析现金流质量
 */
export function analyzeCashFlowQuality(data: CashFlowData[]): CashFlowQuality {
  if (data.length === 0) {
    return {
      qualityScore: 0, qualityGrade: 'F', cashConversion: 0, fcfCoverage: 0,
      fcf: 0, capexIntensity: 0, dividendCoverage: 0,
      cashFlowStructure: { operatingPct: 0, investingPct: 0, financingPct: 0 },
      sustainability: 'critical', warnings: [],
      trends: { operatingTrend: 'stable', fcfTrend: 'stable' },
    };
  }

  const sorted = [...data].sort((a, b) => a.year - b.year);
  const latest = sorted[sorted.length - 1];

  // 现金转换率
  const cashConversion = latest.netIncome !== 0 ? latest.operatingCF / latest.netIncome : 0;

  // 自由现金流
  const fcf = latest.operatingCF - latest.capex;

  // FCF覆盖
  const fcfCoverage = latest.netIncome !== 0 ? fcf / latest.netIncome : 0;

  // 资本开支强度
  const capexIntensity = latest.revenue !== 0 ? latest.capex / latest.revenue : 0;

  // 股息覆盖
  const dividendCoverage = latest.dividends !== 0 ? fcf / latest.dividends : Infinity;

  // 现金流结构
  const totalCF = Math.abs(latest.operatingCF) + Math.abs(latest.investingCF) + Math.abs(latest.financingCF);
  const cashFlowStructure = {
    operatingPct: totalCF > 0 ? Math.round(latest.operatingCF / totalCF * 100) : 0,
    investingPct: totalCF > 0 ? Math.round(latest.investingCF / totalCF * 100) : 0,
    financingPct: totalCF > 0 ? Math.round(latest.financingCF / totalCF * 100) : 0,
  };

  // 趋势
  const operatingTrend = sorted.length >= 2
    ? (latest.operatingCF > sorted[sorted.length - 2].operatingCF ? 'improving' : latest.operatingCF < sorted[sorted.length - 2].operatingCF ? 'deteriorating' : 'stable')
    : 'stable';

  const latestFcf = fcf;
  const prevFcf = sorted.length >= 2 ? sorted[sorted.length - 2].operatingCF - sorted[sorted.length - 2].capex : 0;
  const fcfTrend = latestFcf > prevFcf ? 'improving' : latestFcf < prevFcf ? 'deteriorating' : 'stable';

  // 警告
  const warnings: string[] = [];
  if (cashConversion < 0.5) warnings.push('现金转换率过低，利润质量差');
  if (cashConversion < 0) warnings.push('经营现金流为负，利润可能存在水分');
  if (fcf < 0) warnings.push('自由现金流为负');
  if (latest.investingCF > 0 && latest.operatingCF < 0) warnings.push('靠变卖资产维持运营');
  if (latest.financingCF > Math.abs(latest.operatingCF)) warnings.push('过度依赖融资');

  // 质量评分
  let qualityScore = 50;
  qualityScore += cashConversion > 1 ? 15 : cashConversion > 0.8 ? 10 : cashConversion > 0.5 ? 5 : -15;
  qualityScore += fcf > 0 ? 15 : -10;
  qualityScore += operatingTrend === 'improving' ? 10 : operatingTrend === 'deteriorating' ? -10 : 0;
  qualityScore += cashFlowStructure.operatingPct > 50 ? 10 : -5;
  qualityScore -= warnings.length * 5;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  const qualityGrade: CashFlowQuality['qualityGrade'] =
    qualityScore >= 80 ? 'A' : qualityScore >= 65 ? 'B' : qualityScore >= 50 ? 'C' : qualityScore >= 35 ? 'D' : 'F';

  const sustainability: CashFlowQuality['sustainability'] =
    qualityScore >= 70 ? 'strong' : qualityScore >= 50 ? 'adequate' : qualityScore >= 30 ? 'weak' : 'critical';

  return {
    qualityScore: Math.round(qualityScore * 10) / 10,
    qualityGrade,
    cashConversion: Math.round(cashConversion * 1000) / 1000,
    fcfCoverage: Math.round(fcfCoverage * 1000) / 1000,
    fcf: Math.round(fcf),
    capexIntensity: Math.round(capexIntensity * 10000) / 10000,
    dividendCoverage: dividendCoverage === Infinity ? 999 : Math.round(dividendCoverage * 100) / 100,
    cashFlowStructure,
    sustainability,
    warnings,
    trends: { operatingTrend, fcfTrend },
  };
}
