/**
 * 财报分析引擎 (Financial Report Analysis Engine)
 * - 三大报表关键指标提取
 * - 同比/环比增长分析
 * - 财务健康评分
 * - 杜邦分析
 * - 行业对比
 * - 预警信号
 */

export interface FinancialReport {
  period: string;         // YYYY-Q1/Q2/Q3/Q4
  revenue: number;
  netProfit: number;
  grossProfit: number;
  operatingProfit: number;
  totalAssets: number;
  totalEquity: number;
  totalDebt: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  currentAssets: number;
  currentLiabilities: number;
  inventory: number;
  accountsReceivable: number;
  eps: number;
  roe: number;
  roa: number;
}

export interface GrowthAnalysis {
  metric: string;
  currentValue: number;
  yoyGrowth: number;    // 同比
  qoqGrowth: number;    // 环比
  cagr: number;         // 年复合增长率
  trend: 'accelerating' | 'steady' | 'decelerating' | 'declining';
}

export interface DuPontAnalysis {
  roe: number;
  netProfitMargin: number;   // 净利率
  assetTurnover: number;     // 总资产周转率
  equityMultiplier: number;  // 权益乘数
  primaryDriver: 'profitability' | 'efficiency' | 'leverage';
  interpretation: string;
}

export interface FinancialHealth {
  score: number;         // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  liquidity: {
    currentRatio: number;
    quickRatio: number;
    score: number;
  };
  solvency: {
    debtToEquity: number;
    interestCoverage: number;
    score: number;
  };
  profitability: {
    grossMargin: number;
    netMargin: number;
    roe: number;
    score: number;
  };
  efficiency: {
    receivableTurnover: number;
    inventoryTurnover: number;
    score: number;
  };
}

export interface WarningSignal {
  type: 'revenue_decline' | 'margin_compression' | 'cash_flow_mismatch'
    | 'high_leverage' | 'receivable_surge' | 'inventory_buildup'
    | 'profit_without_cash' | 'capex_surge';
  severity: 'high' | 'medium' | 'low';
  description: string;
  value: number;
  threshold: number;
}

/**
 * 计算同比增长率
 */
export function calculateYoYGrowth(current: number, previousYear: number): number {
  if (previousYear === 0) return current > 0 ? 100 : 0;
  return ((current - previousYear) / Math.abs(previousYear)) * 100;
}

/**
 * 计算环比增长率
 */
export function calculateQoQGrowth(current: number, previousQuarter: number): number {
  if (previousQuarter === 0) return current > 0 ? 100 : 0;
  return ((current - previousQuarter) / Math.abs(previousQuarter)) * 100;
}

/**
 * 增长分析
 */
export function analyzeGrowth(
  reports: FinancialReport[]
): GrowthAnalysis[] {
  if (reports.length < 2) return [];

  const latest = reports[reports.length - 1];
  const prev = reports.length >= 2 ? reports[reports.length - 2] : latest;
  const yearAgo = reports.length >= 4 ? reports[reports.length - 4] : latest;

  const metrics: [string, keyof FinancialReport][] = [
    ['营业收入', 'revenue'],
    ['净利润', 'netProfit'],
    ['毛利率', 'grossProfit'],
    ['经营现金流', 'operatingCashFlow'],
    ['EPS', 'eps'],
  ];

  return metrics.map(([name, key]) => {
    const current = latest[key] as number;
    const prevQ = prev[key] as number;
    const prevY = yearAgo[key] as number;

    const yoyGrowth = calculateYoYGrowth(current, prevY);
    const qoqGrowth = calculateQoQGrowth(current, prevQ);

    // CAGR (如果数据够多)
    const cagr = reports.length >= 4 && prevY !== 0
      ? (Math.pow(Math.abs(current / prevY), 4 / reports.length) - 1) * 100
      : yoyGrowth;

    let trend: GrowthAnalysis['trend'];
    if (yoyGrowth > 20 && qoqGrowth > 5) trend = 'accelerating';
    else if (yoyGrowth > 0) trend = 'steady';
    else if (yoyGrowth > -10) trend = 'decelerating';
    else trend = 'declining';

    return { metric: name, currentValue: current, yoyGrowth, qoqGrowth, cagr, trend };
  });
}

/**
 * 杜邦分析
 */
export function performDuPontAnalysis(report: FinancialReport): DuPontAnalysis {
  const netProfitMargin = report.revenue > 0 ? report.netProfit / report.revenue : 0;
  const assetTurnover = report.totalAssets > 0 ? report.revenue / report.totalAssets : 0;
  const equityMultiplier = report.totalEquity > 0 ? report.totalAssets / report.totalEquity : 1;
  const roe = netProfitMargin * assetTurnover * equityMultiplier;

  const profitContribution = Math.abs(netProfitMargin);
  const efficiencyContribution = Math.abs(assetTurnover);
  const leverageContribution = Math.abs(equityMultiplier - 1);

  let primaryDriver: DuPontAnalysis['primaryDriver'];
  let interpretation: string;

  if (profitContribution >= efficiencyContribution && profitContribution >= leverageContribution) {
    primaryDriver = 'profitability';
    interpretation = 'ROE主要由高利润率驱动，关注毛利率趋势和定价能力';
  } else if (efficiencyContribution >= leverageContribution) {
    primaryDriver = 'efficiency';
    interpretation = 'ROE主要由资产周转率驱动，关注运营效率和资产管理';
  } else {
    primaryDriver = 'leverage';
    interpretation = 'ROE主要由杠杆驱动，需关注偿债能力和财务风险';
  }

  return {
    roe: Math.round(roe * 10000) / 100,
    netProfitMargin: Math.round(netProfitMargin * 10000) / 100,
    assetTurnover: Math.round(assetTurnover * 100) / 100,
    equityMultiplier: Math.round(equityMultiplier * 100) / 100,
    primaryDriver,
    interpretation,
  };
}

/**
 * 财务健康评分
 */
export function evaluateFinancialHealth(report: FinancialReport): FinancialHealth {
  // 流动性
  const currentRatio = report.currentLiabilities > 0 ? report.currentAssets / report.currentLiabilities : 0;
  const quickRatio = report.currentLiabilities > 0
    ? (report.currentAssets - report.inventory) / report.currentLiabilities : 0;
  const liquidityScore = Math.min(100, Math.round(
    (currentRatio > 1.5 ? 50 : currentRatio * 33) +
    (quickRatio > 1 ? 50 : quickRatio * 50)
  ));

  // 偿债能力
  const debtToEquity = report.totalEquity > 0 ? report.totalDebt / report.totalEquity : 0;
  const interestCoverage = report.operatingProfit > 0 ? report.operatingProfit / (report.totalDebt * 0.05) : 0;
  const solvencyScore = Math.min(100, Math.round(
    (debtToEquity < 1 ? 50 : debtToEquity < 2 ? 30 : 10) +
    (interestCoverage > 5 ? 50 : interestCoverage > 2 ? 30 : 10)
  ));

  // 盈利能力
  const grossMargin = report.revenue > 0 ? report.grossProfit / report.revenue : 0;
  const netMargin = report.revenue > 0 ? report.netProfit / report.revenue : 0;
  const profitabilityScore = Math.min(100, Math.round(
    (grossMargin > 0.3 ? 35 : grossMargin * 100) +
    (netMargin > 0.1 ? 35 : netMargin * 350) +
    (report.roe > 15 ? 30 : report.roe * 2)
  ));

  // 运营效率
  const receivableTurnover = report.accountsReceivable > 0 ? report.revenue / report.accountsReceivable : 0;
  const inventoryTurnover = report.inventory > 0 ? report.revenue / report.inventory : 0;
  const efficiencyScore = Math.min(100, Math.round(
    (receivableTurnover > 5 ? 50 : receivableTurnover * 10) +
    (inventoryTurnover > 5 ? 50 : inventoryTurnover * 10)
  ));

  const totalScore = Math.round((liquidityScore + solvencyScore + profitabilityScore + efficiencyScore) / 4);

  let grade: FinancialHealth['grade'];
  if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 65) grade = 'B';
  else if (totalScore >= 50) grade = 'C';
  else if (totalScore >= 35) grade = 'D';
  else grade = 'F';

  return {
    score: totalScore,
    grade,
    liquidity: { currentRatio, quickRatio, score: liquidityScore },
    solvency: { debtToEquity, interestCoverage, score: solvencyScore },
    profitability: { grossMargin, netMargin, roe: report.roe, score: profitabilityScore },
    efficiency: { receivableTurnover, inventoryTurnover, score: efficiencyScore },
  };
}

/**
 * 财务预警信号检测
 */
export function detectWarningSignals(
  current: FinancialReport,
  previous?: FinancialReport
): WarningSignal[] {
  const signals: WarningSignal[] = [];

  // 收入下降
  if (previous && current.revenue < previous.revenue * 0.9) {
    signals.push({
      type: 'revenue_decline',
      severity: current.revenue < previous.revenue * 0.8 ? 'high' : 'medium',
      description: `营业收入同比下降${((1 - current.revenue / previous.revenue) * 100).toFixed(1)}%`,
      value: current.revenue,
      threshold: previous.revenue * 0.9,
    });
  }

  // 利润率压缩
  const currentMargin = current.revenue > 0 ? current.netProfit / current.revenue : 0;
  const prevMargin = previous && previous.revenue > 0 ? previous.netProfit / previous.revenue : 0;
  if (prevMargin > 0 && currentMargin < prevMargin * 0.8) {
    signals.push({
      type: 'margin_compression',
      severity: currentMargin < prevMargin * 0.5 ? 'high' : 'medium',
      description: `净利润率从${(prevMargin * 100).toFixed(1)}%下降至${(currentMargin * 100).toFixed(1)}%`,
      value: currentMargin * 100,
      threshold: prevMargin * 80,
    });
  }

  // 经营现金流与利润不匹配
  if (current.netProfit > 0 && current.operatingCashFlow < current.netProfit * 0.5) {
    signals.push({
      type: 'cash_flow_mismatch',
      severity: current.operatingCashFlow < 0 ? 'high' : 'medium',
      description: `经营现金流(${current.operatingCashFlow})显著低于净利润(${current.netProfit})`,
      value: current.operatingCashFlow / Math.max(current.netProfit, 1),
      threshold: 0.5,
    });
  }

  // 高杠杆
  const dte = current.totalEquity > 0 ? current.totalDebt / current.totalEquity : 0;
  if (dte > 2) {
    signals.push({
      type: 'high_leverage',
      severity: dte > 3 ? 'high' : 'medium',
      description: `资产负债率过高，负债/权益=${dte.toFixed(2)}`,
      value: dte,
      threshold: 2,
    });
  }

  // 应收账款激增
  if (previous && current.accountsReceivable > previous.accountsReceivable * 1.5) {
    signals.push({
      type: 'receivable_surge',
      severity: 'medium',
      description: `应收账款增长${((current.accountsReceivable / previous.accountsReceivable - 1) * 100).toFixed(0)}%`,
      value: current.accountsReceivable,
      threshold: previous.accountsReceivable * 1.5,
    });
  }

  // 存货积压
  if (previous && current.inventory > previous.inventory * 1.3 && current.revenue < previous.revenue) {
    signals.push({
      type: 'inventory_buildup',
      severity: 'medium',
      description: '存货增长但收入下降，可能存在滞销风险',
      value: current.inventory,
      threshold: previous.inventory * 1.3,
    });
  }

  // 利润无现金流支撑
  if (current.netProfit > 0 && current.operatingCashFlow < 0) {
    signals.push({
      type: 'profit_without_cash',
      severity: 'high',
      description: '有利润但经营现金流为负，盈利质量堪忧',
      value: current.operatingCashFlow,
      threshold: 0,
    });
  }

  return signals.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}
