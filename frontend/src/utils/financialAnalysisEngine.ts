/**
 * 财务分析引擎
 * 财务报表分析、财务指标计算、杜邦分析
 */

export interface FinancialStatement {
  ticker: string;
  date: string;
  revenue: number;
  netIncome: number;
  grossProfit: number;
  operatingIncome: number;
  totalAssets: number;
  totalEquity: number;
  totalLiabilities: number;
  currentAssets: number;
  currentLiabilities: number;
  cash: number;
  inventory: number;
  accountsReceivable: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  capex: number;
  interestExpense: number;
  shares: number;
}

export interface FinancialRatios {
  // Profitability
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  roic: number;
  
  // Liquidity
  currentRatio: number;
  quickRatio: number;
  cashRatio: number;
  
  // Leverage
  debtToEquity: number;
  debtToAssets: number;
  interestCoverage: number;
  equityRatio: number;
  
  // Efficiency
  assetTurnover: number;
  inventoryTurnover: number;
  receivablesTurnover: number;
  cashConversionCycle: number;
  
  // Growth
  revenueGrowth: number;
  netIncomeGrowth: number;
  epsGrowth: number;
  
  // Per share
  eps: number;
  bookValuePerShare: number;
  fcfPerShare: number;
}

export interface DuPontAnalysis {
  netMargin: number;
  assetTurnover: number;
  equityMultiplier: number;
  roe: number;
  breakdown: {
    profitability: number;
    efficiency: number;
    leverage: number;
  };
}

export interface QualityScore {
  totalScore: number;
  profitabilityScore: number;
  growthScore: number;
  stabilityScore: number;
  cashFlowScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  flags: string[];
}

export function calculateRatios(stmt: FinancialStatement): FinancialRatios {
  const grossMargin = stmt.revenue !== 0 ? stmt.grossProfit / stmt.revenue : 0;
  const operatingMargin = stmt.revenue !== 0 ? stmt.operatingIncome / stmt.revenue : 0;
  const netMargin = stmt.revenue !== 0 ? stmt.netIncome / stmt.revenue : 0;
  const roe = stmt.totalEquity !== 0 ? stmt.netIncome / stmt.totalEquity : 0;
  const roa = stmt.totalAssets !== 0 ? stmt.netIncome / stmt.totalAssets : 0;
  const investedCapital = stmt.totalEquity + stmt.totalLiabilities - stmt.currentLiabilities;
  const roic = investedCapital !== 0 ? stmt.operatingIncome * 0.75 / investedCapital : 0;
  
  const currentRatio = stmt.currentLiabilities !== 0 ? stmt.currentAssets / stmt.currentLiabilities : 0;
  const quickRatio = stmt.currentLiabilities !== 0 ? (stmt.currentAssets - stmt.inventory) / stmt.currentLiabilities : 0;
  const cashRatio = stmt.currentLiabilities !== 0 ? stmt.cash / stmt.currentLiabilities : 0;
  
  const debtToEquity = stmt.totalEquity !== 0 ? stmt.totalLiabilities / stmt.totalEquity : 0;
  const debtToAssets = stmt.totalAssets !== 0 ? stmt.totalLiabilities / stmt.totalAssets : 0;
  const interestCoverage = stmt.interestExpense !== 0 ? stmt.operatingIncome / stmt.interestExpense : 0;
  const equityRatio = stmt.totalAssets !== 0 ? stmt.totalEquity / stmt.totalAssets : 0;
  
  const assetTurnover = stmt.totalAssets !== 0 ? stmt.revenue / stmt.totalAssets : 0;
  const inventoryTurnover = stmt.inventory !== 0 ? stmt.revenue / stmt.inventory : 0;
  const receivablesTurnover = stmt.accountsReceivable !== 0 ? stmt.revenue / stmt.accountsReceivable : 0;
  const cashConversionCycle = 0; // Simplified
  
  const eps = stmt.shares !== 0 ? stmt.netIncome / stmt.shares : 0;
  const bookValuePerShare = stmt.shares !== 0 ? stmt.totalEquity / stmt.shares : 0;
  const fcf = stmt.operatingCashFlow - stmt.capex;
  const fcfPerShare = stmt.shares !== 0 ? fcf / stmt.shares : 0;
  
  return {
    grossMargin, operatingMargin, netMargin, roe, roa, roic,
    currentRatio, quickRatio, cashRatio,
    debtToEquity, debtToAssets, interestCoverage, equityRatio,
    assetTurnover, inventoryTurnover, receivablesTurnover, cashConversionCycle,
    revenueGrowth: 0, netIncomeGrowth: 0, epsGrowth: 0,
    eps, bookValuePerShare, fcfPerShare,
  };
}

export function calculateGrowthRates(
  current: FinancialStatement,
  previous: FinancialStatement
): { revenueGrowth: number; netIncomeGrowth: number; epsGrowth: number } {
  const revenueGrowth = previous.revenue !== 0 ? (current.revenue - previous.revenue) / Math.abs(previous.revenue) : 0;
  const netIncomeGrowth = previous.netIncome !== 0 ? (current.netIncome - previous.netIncome) / Math.abs(previous.netIncome) : 0;
  
  const currentEps = current.shares !== 0 ? current.netIncome / current.shares : 0;
  const prevEps = previous.shares !== 0 ? previous.netIncome / previous.shares : 0;
  const epsGrowth = prevEps !== 0 ? (currentEps - prevEps) / Math.abs(prevEps) : 0;
  
  return { revenueGrowth, netIncomeGrowth, epsGrowth };
}

export function performDuPontAnalysis(stmt: FinancialStatement): DuPontAnalysis {
  const netMargin = stmt.revenue !== 0 ? stmt.netIncome / stmt.revenue : 0;
  const assetTurnover = stmt.totalAssets !== 0 ? stmt.revenue / stmt.totalAssets : 0;
  const equityMultiplier = stmt.totalEquity !== 0 ? stmt.totalAssets / stmt.totalEquity : 1;
  const roe = netMargin * assetTurnover * equityMultiplier;
  
  return {
    netMargin,
    assetTurnover,
    equityMultiplier,
    roe,
    breakdown: {
      profitability: netMargin,
      efficiency: assetTurnover,
      leverage: equityMultiplier,
    },
  };
}

export function calculateQualityScore(
  stmt: FinancialStatement,
  prevStmt?: FinancialStatement
): QualityScore {
  const ratios = calculateRatios(stmt);
  const flags: string[] = [];
  
  // Profitability (0-25)
  let profitabilityScore = 0;
  if (ratios.grossMargin > 0.4) profitabilityScore += 8;
  else if (ratios.grossMargin > 0.2) profitabilityScore += 5;
  else if (ratios.grossMargin > 0) profitabilityScore += 2;
  else flags.push('毛利率为负');
  
  if (ratios.roe > 0.15) profitabilityScore += 9;
  else if (ratios.roe > 0.1) profitabilityScore += 6;
  else if (ratios.roe > 0.05) profitabilityScore += 3;
  else flags.push('ROE偏低');
  
  if (ratios.roa > 0.08) profitabilityScore += 8;
  else if (ratios.roa > 0.04) profitabilityScore += 4;
  
  // Growth (0-25)
  let growthScore = 12; // Default neutral
  if (prevStmt) {
    const growth = calculateGrowthRates(stmt, prevStmt);
    if (growth.revenueGrowth > 0.2) growthScore += 8;
    else if (growth.revenueGrowth > 0.1) growthScore += 5;
    else if (growth.revenueGrowth > 0) growthScore += 2;
    else flags.push('营收负增长');
    
    if (growth.netIncomeGrowth > 0.2) growthScore += 7;
    else if (growth.netIncomeGrowth > 0.1) growthScore += 4;
    else if (growth.netIncomeGrowth > 0) growthScore += 1;
    else flags.push('净利润负增长');
  }
  
  // Stability (0-25)
  let stabilityScore = 0;
  if (ratios.currentRatio > 1.5) stabilityScore += 8;
  else if (ratios.currentRatio > 1) stabilityScore += 4;
  else flags.push('流动比率过低');
  
  if (ratios.debtToEquity < 0.5) stabilityScore += 9;
  else if (ratios.debtToEquity < 1) stabilityScore += 6;
  else if (ratios.debtToEquity < 2) stabilityScore += 3;
  else flags.push('负债率过高');
  
  if (ratios.interestCoverage > 5) stabilityScore += 8;
  else if (ratios.interestCoverage > 2) stabilityScore += 4;
  else flags.push('利息覆盖不足');
  
  // Cash flow (0-25)
  let cashFlowScore = 0;
  const fcf = stmt.operatingCashFlow - stmt.capex;
  if (fcf > 0) cashFlowScore += 10;
  else flags.push('自由现金流为负');
  
  if (stmt.operatingCashFlow > stmt.netIncome * 0.8) cashFlowScore += 8;
  else if (stmt.operatingCashFlow > 0) cashFlowScore += 4;
  else flags.push('经营现金流为负');
  
  if (stmt.cash > stmt.currentLiabilities * 0.2) cashFlowScore += 7;
  else cashFlowScore += 2;
  
  const totalScore = Math.min(100, profitabilityScore + growthScore + stabilityScore + cashFlowScore);
  
  let grade: QualityScore['grade'];
  if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 60) grade = 'B';
  else if (totalScore >= 40) grade = 'C';
  else if (totalScore >= 20) grade = 'D';
  else grade = 'F';
  
  return { totalScore, profitabilityScore, growthScore, stabilityScore, cashFlowScore, grade, flags };
}

export function calculateAltmanZScore(stmt: FinancialStatement): {
  zScore: number;
  zone: 'safe' | 'grey' | 'distress';
} {
  const totalAssets = stmt.totalAssets || 1;
  
  const x1 = (stmt.currentAssets - stmt.currentLiabilities) / totalAssets;
  const x2 = stmt.totalEquity / totalAssets; // Retained earnings proxy
  const x3 = stmt.operatingIncome / totalAssets;
  const x4 = stmt.totalLiabilities !== 0 ? stmt.totalEquity / stmt.totalLiabilities : 0;
  const x5 = stmt.revenue / totalAssets;
  
  // Z-Score for manufacturing
  const zScore = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
  
  let zone: 'safe' | 'grey' | 'distress';
  if (zScore > 2.99) zone = 'safe';
  else if (zScore > 1.81) zone = 'grey';
  else zone = 'distress';
  
  return { zScore, zone };
}

export function calculatePiotroskiScore(
  stmt: FinancialStatement,
  prevStmt: FinancialStatement
): { score: number; criteria: { name: string; passed: boolean }[] } {
  const criteria: { name: string; passed: boolean }[] = [];
  
  // 1. Positive ROA
  criteria.push({ name: '正ROA', passed: stmt.netIncome > 0 && stmt.totalAssets > 0 });
  // 2. Positive operating cash flow
  criteria.push({ name: '正经营现金流', passed: stmt.operatingCashFlow > 0 });
  // 3. Increasing ROA
  const currentROA = stmt.totalAssets !== 0 ? stmt.netIncome / stmt.totalAssets : 0;
  const prevROA = prevStmt.totalAssets !== 0 ? prevStmt.netIncome / prevStmt.totalAssets : 0;
  criteria.push({ name: 'ROA改善', passed: currentROA > prevROA });
  // 4. Cash flow > Net income (accrual quality)
  criteria.push({ name: '现金流>利润', passed: stmt.operatingCashFlow > stmt.netIncome });
  // 5. Decreasing debt ratio
  const currentDAR = stmt.totalAssets !== 0 ? stmt.totalLiabilities / stmt.totalAssets : 0;
  const prevDAR = prevStmt.totalAssets !== 0 ? prevStmt.totalLiabilities / prevStmt.totalAssets : 0;
  criteria.push({ name: '负债率下降', passed: currentDAR < prevDAR });
  // 6. Increasing current ratio
  const currentCR = stmt.currentLiabilities !== 0 ? stmt.currentAssets / stmt.currentLiabilities : 0;
  const prevCR = prevStmt.currentLiabilities !== 0 ? prevStmt.currentAssets / prevStmt.currentLiabilities : 0;
  criteria.push({ name: '流动比率改善', passed: currentCR > prevCR });
  // 7. No dilution
  criteria.push({ name: '股本未稀释', passed: stmt.shares <= prevStmt.shares });
  // 8. Increasing gross margin
  const currentGM = stmt.revenue !== 0 ? stmt.grossProfit / stmt.revenue : 0;
  const prevGM = prevStmt.revenue !== 0 ? prevStmt.grossProfit / prevStmt.revenue : 0;
  criteria.push({ name: '毛利率改善', passed: currentGM > prevGM });
  // 9. Increasing asset turnover
  const currentAT = stmt.totalAssets !== 0 ? stmt.revenue / stmt.totalAssets : 0;
  const prevAT = prevStmt.totalAssets !== 0 ? prevStmt.revenue / prevStmt.totalAssets : 0;
  criteria.push({ name: '资产周转率提升', passed: currentAT > prevAT });
  
  const score = criteria.filter(c => c.passed).length;
  return { score, criteria };
}

export function calculateGrahamIntrinsicValue(
  eps: number,
  growthRate: number,
  aaaYield: number = 4.4
): number {
  if (eps <= 0 || aaaYield <= 0) return 0;
  return eps * (8.5 + 2 * growthRate * 100) * 4.4 / aaaYield;
}

export function calculateFCFE(stmt: FinancialStatement): number {
  return stmt.operatingCashFlow - stmt.capex + stmt.financingCashFlow - stmt.interestExpense * 0.75;
}

export function calculateWACC(
  equityWeight: number,
  costOfEquity: number,
  debtWeight: number,
  costOfDebt: number,
  taxRate: number = 0.25
): number {
  return equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate);
}
