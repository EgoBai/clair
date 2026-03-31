/**
 * 财报深度分析引擎
 * 财务质量评分/三表勾稽/异常检测/增长质量/预警信号
 */

export interface FinancialData {
  ticker: string;
  period: string;         // YYYY-Q1/Q2/Q3/Q4
  revenue: number;
  revenueGrowth: number;
  grossMargin: number;
  netProfit: number;
  netProfitGrowth: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  totalDebt: number;
  totalEquity: number;
  currentAssets: number;
  currentLiabilities: number;
  inventory: number;
  accountsReceivable: number;
  accountsPayable: number;
  capex: number;
  depreciation: number;
  interestExpense: number;
  investmentIncome: number;
  nonRecurringItems: number; // 非经常性损益
}

export interface QualityScore {
  ticker: string;
  overallScore: number;   // 0-100
  breakdown: {
    earningsQuality: number;
    cashFlowQuality: number;
    balanceSheetStrength: number;
    growthSustainability: number;
    operationalEfficiency: number;
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  redFlags: string[];
  highlights: string[];
}

export interface FinancialAnomaly {
  type: 'revenue_cfo_mismatch' | 'ar_surge' | 'inventory_buildup' | 'margin_compression'
    | 'cash_conversion_deterioration' | 'debt_spike' | 'non_recurring_dependent'
    | 'capex_surge' | 'related_party_concentration';
  severity: 'warning' | 'concern' | 'red_flag';
  description: string;
  metric: string;
  value: number;
  threshold: number;
}

export interface GrowthQuality {
  ticker: string;
  revenueGrowth: number;
  profitGrowth: number;
  cashFlowGrowth: number;
  organicGrowth: number;        // 剔除非经常性
  sustainableGrowthRate: number;
  growthQualityScore: number;   // 0-100
  quality: 'high' | 'medium' | 'low' | 'poor';
  concerns: string[];
}

export interface CashConversionCycle {
  ticker: string;
  dso: number;          // 应收账款周转天数
  dio: number;          // 存货周转天数
  dpo: number;          // 应付账款周转天数
  ccc: number;          // 现金转换周期
  cccTrend: 'improving' | 'stable' | 'deteriorating';
  industryAvg: number;
  vsIndustry: 'better' | 'average' | 'worse';
}

/**
 * 计算财务质量评分
 */
export function calculateQualityScore(
  data: FinancialData,
  prevData?: FinancialData
): QualityScore {
  const redFlags: string[] = [];
  const highlights: string[] = [];

  // 盈利质量
  let earningsQuality = 50;
  const cfoToProfit = data.netProfit > 0
    ? data.operatingCashFlow / data.netProfit
    : data.operatingCashFlow < 0 ? -1 : 1;

  if (cfoToProfit > 0.8) {
    earningsQuality += 20;
    highlights.push('经营现金流覆盖利润良好');
  } else if (cfoToProfit < 0.5) {
    earningsQuality -= 20;
    redFlags.push('经营现金流远低于利润');
  }

  // 非经常性损益占比
  const nonRecurringRatio = data.netProfit > 0
    ? Math.abs(data.nonRecurringItems) / data.netProfit
    : 0;
  if (nonRecurringRatio < 0.1) {
    earningsQuality += 15;
    highlights.push('盈利质量高，非经常性占比低');
  } else if (nonRecurringRatio > 0.3) {
    earningsQuality -= 15;
    redFlags.push('过度依赖非经常性损益');
  }

  // 现金流质量
  let cashFlowQuality = 50;
  if (data.freeCashFlow > 0) {
    cashFlowQuality += 20;
    highlights.push('自由现金流为正');
  } else if (data.freeCashFlow < 0 && data.operatingCashFlow > 0) {
    cashFlowQuality += 5;
  } else if (data.operatingCashFlow < 0) {
    cashFlowQuality -= 20;
    redFlags.push('经营现金流为负');
  }

  // Capex合理性
  if (data.capex > 0 && data.operatingCashFlow > 0) {
    const capexRatio = data.capex / data.operatingCashFlow;
    if (capexRatio < 0.5) cashFlowQuality += 10;
    else if (capexRatio > 1.5) {
      cashFlowQuality -= 10;
      redFlags.push('资本开支过高');
    }
  }

  // 资产负债表强度
  let balanceSheetStrength = 50;
  const debtToEquity = data.totalEquity > 0
    ? data.totalDebt / data.totalEquity
    : 999;
  if (debtToEquity < 0.5) {
    balanceSheetStrength += 20;
    highlights.push('资产负债率低');
  } else if (debtToEquity > 1.5) {
    balanceSheetStrength -= 20;
    redFlags.push('资产负债率过高');
  }

  const currentRatio = data.currentLiabilities > 0
    ? data.currentAssets / data.currentLiabilities
    : 999;
  if (currentRatio > 1.5) {
    balanceSheetStrength += 15;
  } else if (currentRatio < 1) {
    balanceSheetStrength -= 15;
    redFlags.push('流动比率低于1');
  }

  // 增长可持续性
  let growthSustainability = 50;
  if (data.revenueGrowth > 0 && data.netProfitGrowth > 0) {
    growthSustainability += 15;
    if (data.revenueGrowth > 20) {
      growthSustainability += 10;
      highlights.push('收入高增长');
    }
  }
  if (data.netProfitGrowth > data.revenueGrowth) {
    growthSustainability += 10;
    highlights.push('利润增速超收入增速(经营杠杆)');
  } else if (data.netProfitGrowth < 0 && data.revenueGrowth > 0) {
    growthSustainability -= 15;
    redFlags.push('增收不增利');
  }

  // 运营效率
  let operationalEfficiency = 50;
  if (data.grossMargin > 0.3) {
    operationalEfficiency += 15;
    highlights.push('毛利率较高');
  } else if (data.grossMargin < 0.1) {
    operationalEfficiency -= 10;
  }

  // 应收增长 vs 收入增长
  if (prevData) {
    const arGrowth = prevData.accountsReceivable > 0
      ? (data.accountsReceivable - prevData.accountsReceivable) / prevData.accountsReceivable
      : 0;
    if (arGrowth > data.revenueGrowth / 100 * 1.5 && data.revenueGrowth > 0) {
      operationalEfficiency -= 15;
      redFlags.push('应收账款增速远超收入增速');
    }

    const invGrowth = prevData.inventory > 0
      ? (data.inventory - prevData.inventory) / prevData.inventory
      : 0;
    if (invGrowth > data.revenueGrowth / 100 * 1.5 && data.revenueGrowth > 0) {
      operationalEfficiency -= 10;
      redFlags.push('存货增速远超收入增速');
    }
  }

  // 汇总
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const breakdown = {
    earningsQuality: clamp(earningsQuality),
    cashFlowQuality: clamp(cashFlowQuality),
    balanceSheetStrength: clamp(balanceSheetStrength),
    growthSustainability: clamp(growthSustainability),
    operationalEfficiency: clamp(operationalEfficiency),
  };

  const overallScore = Math.round(
    breakdown.earningsQuality * 0.25 +
    breakdown.cashFlowQuality * 0.25 +
    breakdown.balanceSheetStrength * 0.2 +
    breakdown.growthSustainability * 0.15 +
    breakdown.operationalEfficiency * 0.15
  );

  let grade: QualityScore['grade'];
  if (overallScore >= 80) grade = 'A';
  else if (overallScore >= 65) grade = 'B';
  else if (overallScore >= 50) grade = 'C';
  else if (overallScore >= 35) grade = 'D';
  else grade = 'F';

  return {
    ticker: data.ticker,
    overallScore,
    breakdown,
    grade,
    redFlags,
    highlights,
  };
}

/**
 * 增长质量分析
 */
export function analyzeGrowthQuality(
  data: FinancialData,
  prevData: FinancialData
): GrowthQuality {
  const organicProfit = data.netProfit - data.nonRecurringItems;
  const prevOrganicProfit = prevData.netProfit - prevData.nonRecurringItems;

  const organicGrowth = prevOrganicProfit > 0
    ? (organicProfit - prevOrganicProfit) / prevOrganicProfit
    : 0;

  const cashFlowGrowth = prevData.operatingCashFlow > 0
    ? (data.operatingCashFlow - prevData.operatingCashFlow) / prevData.operatingCashFlow
    : data.operatingCashFlow > 0 ? 1 : -1;

  // 可持续增长率 = ROE * 留存率 (简化)
  const roe = data.totalEquity > 0 ? data.netProfit / data.totalEquity : 0;
  const sustainableGrowthRate = roe * 0.7; // 假设30%分红

  // 质量评分
  let score = 50;
  const concerns: string[] = [];

  if (Math.abs(data.netProfitGrowth - data.revenueGrowth) < 5) {
    score += 15;
  } else if (data.netProfitGrowth < data.revenueGrowth - 10) {
    score -= 15;
    concerns.push('利润增速显著落后收入');
  }

  if (cashFlowGrowth > 0) score += 15;
  else {
    score -= 10;
    concerns.push('经营现金流下滑');
  }

  if (organicGrowth > data.netProfitGrowth * 0.8) {
    score += 10;
  } else {
    score -= 10;
    concerns.push('过度依赖非经常性损益');
  }

  score = Math.max(0, Math.min(100, score));

  let quality: GrowthQuality['quality'];
  if (score >= 75) quality = 'high';
  else if (score >= 55) quality = 'medium';
  else if (score >= 35) quality = 'low';
  else quality = 'poor';

  return {
    ticker: data.ticker,
    revenueGrowth: data.revenueGrowth,
    profitGrowth: data.netProfitGrowth,
    cashFlowGrowth,
    organicGrowth,
    sustainableGrowthRate,
    growthQualityScore: score,
    quality,
    concerns,
  };
}

/**
 * 现金转换周期
 */
export function calculateCCC(data: FinancialData): CashConversionCycle {
  const dailyRevenue = data.revenue / 365;
  const dailyCogs = (data.revenue * (1 - data.grossMargin)) / 365;

  const dso = dailyRevenue > 0 ? data.accountsReceivable / dailyRevenue : 0;
  const dio = dailyCogs > 0 ? data.inventory / dailyCogs : 0;
  const dpo = dailyCogs > 0 ? data.accountsPayable / dailyCogs : 0;
  const ccc = dso + dio - dpo;

  return {
    ticker: data.ticker,
    dso: Math.round(dso),
    dio: Math.round(dio),
    dpo: Math.round(dpo),
    ccc: Math.round(ccc),
    cccTrend: 'stable',
    industryAvg: 60,
    vsIndustry: ccc < 40 ? 'better' : ccc < 80 ? 'average' : 'worse',
  };
}

/**
 * 异常检测
 */
export function detectAnomalies(
  data: FinancialData,
  prevData?: FinancialData
): FinancialAnomaly[] {
  const anomalies: FinancialAnomaly[] = [];

  // 收入-现金流不匹配
  if (data.revenueGrowth > 10 && data.operatingCashFlow < 0) {
    anomalies.push({
      type: 'revenue_cfo_mismatch',
      severity: 'red_flag',
      description: '收入增长但经营现金流为负',
      metric: 'operatingCashFlow',
      value: data.operatingCashFlow,
      threshold: 0,
    });
  }

  // 应收账款激增
  if (prevData && prevData.accountsReceivable > 0) {
    const arGrowth = (data.accountsReceivable - prevData.accountsReceivable) / prevData.accountsReceivable;
    if (arGrowth > data.revenueGrowth / 100 * 1.5 && arGrowth > 0.2) {
      anomalies.push({
        type: 'ar_surge',
        severity: 'concern',
        description: `应收账款增长${(arGrowth * 100).toFixed(0)}%远超收入增长${(data.revenueGrowth).toFixed(0)}%`,
        metric: 'accountsReceivable',
        value: arGrowth,
        threshold: data.revenueGrowth * 1.5,
      });
    }
  }

  // 存货积压
  if (prevData && prevData.inventory > 0) {
    const invGrowth = (data.inventory - prevData.inventory) / prevData.inventory;
    if (invGrowth > 0.3 && data.revenueGrowth < 10) {
      anomalies.push({
        type: 'inventory_buildup',
        severity: 'concern',
        description: `存货增长${(invGrowth * 100).toFixed(0)}%但收入仅增长${data.revenueGrowth.toFixed(0)}%`,
        metric: 'inventory',
        value: invGrowth,
        threshold: 30,
      });
    }
  }

  // 毛利率压缩
  if (prevData && data.grossMargin < prevData.grossMargin - 0.03) {
    anomalies.push({
      type: 'margin_compression',
      severity: 'warning',
      description: `毛利率下降${((prevData.grossMargin - data.grossMargin) * 100).toFixed(1)}个百分点`,
      metric: 'grossMargin',
      value: data.grossMargin,
      threshold: prevData.grossMargin - 0.03,
    });
  }

  // 非经常性损益依赖
  if (data.netProfit > 0 && Math.abs(data.nonRecurringItems) / data.netProfit > 0.5) {
    anomalies.push({
      type: 'non_recurring_dependent',
      severity: 'red_flag',
      description: '利润主要来自非经常性损益',
      metric: 'nonRecurringItems',
      value: data.nonRecurringItems,
      threshold: data.netProfit * 0.5,
    });
  }

  return anomalies;
}
