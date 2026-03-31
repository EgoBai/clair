/**
 * 信用风险引擎
 * 信用风险评估: 违约概率、信用评分、Z-Score、Merton模型、信用利差分析
 */

export interface FinancialData {
  totalAssets: number;
  totalLiabilities: number;
  currentAssets: number;
  currentLiabilities: number;
  retainedEarnings: number;
  ebit: number;
  marketCap: number;
  revenue: number;
  netIncome: number;
  operatingCashFlow: number;
  interestExpense: number;
  totalDebt: number;
  equity: number;
}

export interface AltmanZScore {
  zScore: number;
  zone: 'safe' | 'grey' | 'distress';
  components: {
    workingCapitalRatio: number;
    retainedEarningsRatio: number;
    ebitRatio: number;
    marketCapToLiabilities: number;
    assetTurnover: number;
  };
  probabilities: {
    bankruptcy2Year: number;
    bankruptcy4Year: number;
  };
}

export interface MertonModel {
  assetValue: number;
  assetVolatility: number;
  equityValue: number;
  debtValue: number;
  distanceToDefault: number;
  defaultProbability: number;
  creditSpread: number;
}

export interface CreditScore {
  score: number; // 0-100
  grade: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'CC' | 'C' | 'D';
  factors: {
    profitability: number;
    leverage: number;
    liquidity: number;
    efficiency: number;
    growth: number;
    cashFlow: number;
  };
  trend: 'improving' | 'stable' | 'deteriorating';
}

export interface CreditSpreadAnalysis {
  currentSpread: number;
  historicalAvg: number;
  percentile: number;
  zScore: number;
  fairValue: number;
  isOverpriced: boolean;
}

export interface DefaultRiskMetrics {
  pd: number; // 违约概率
  lgd: number; // 违约损失率
  ead: number; // 违约风险暴露
  expectedLoss: number;
  unexpectedLoss: number;
  economicCapital: number;
}

/**
 * 计算 Altman Z-Score
 */
export function calculateAltmanZScore(data: FinancialData): AltmanZScore {
  const { totalAssets, totalLiabilities, currentAssets, currentLiabilities,
    retainedEarnings, ebit, marketCap, revenue } = data;

  if (totalAssets === 0) {
    return {
      zScore: 0, zone: 'distress',
      components: { workingCapitalRatio: 0, retainedEarningsRatio: 0, ebitRatio: 0, marketCapToLiabilities: 0, assetTurnover: 0 },
      probabilities: { bankruptcy2Year: 1, bankruptcy4Year: 1 },
    };
  }

  const X1 = (currentAssets - currentLiabilities) / totalAssets; // 营运资本/总资产
  const X2 = retainedEarnings / totalAssets; // 留存收益/总资产
  const X3 = ebit / totalAssets; // EBIT/总资产
  const X4 = totalLiabilities > 0 ? marketCap / totalLiabilities : 10; // 市值/总负债
  const X5 = revenue / totalAssets; // 资产周转率

  // Z-Score = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5
  const zScore = 1.2 * X1 + 1.4 * X2 + 3.3 * X3 + 0.6 * X4 + 1.0 * X5;

  let zone: AltmanZScore['zone'];
  if (zScore > 2.99) zone = 'safe';
  else if (zScore > 1.81) zone = 'grey';
  else zone = 'distress';

  // 破产概率（经验估计）
  const bankruptcy2Year = zScore > 2.99 ? 0.01 : zScore > 1.81 ? 0.1 : Math.min(0.9, 0.5 - zScore * 0.15);
  const bankruptcy4Year = Math.min(0.95, bankruptcy2Year * 1.5);

  return {
    zScore: Math.round(zScore * 100) / 100,
    zone,
    components: {
      workingCapitalRatio: Math.round(X1 * 10000) / 10000,
      retainedEarningsRatio: Math.round(X2 * 10000) / 10000,
      ebitRatio: Math.round(X3 * 10000) / 10000,
      marketCapToLiabilities: Math.round(X4 * 10000) / 10000,
      assetTurnover: Math.round(X5 * 10000) / 10000,
    },
    probabilities: {
      bankruptcy2Year: Math.round(bankruptcy2Year * 10000) / 10000,
      bankruptcy4Year: Math.round(bankruptcy4Year * 10000) / 10000,
    },
  };
}

/**
 * Merton 模型计算违约概率
 */
export function calculateMertonModel(
  equityValue: number,
  equityVolatility: number,
  debtValue: number,
  riskFreeRate: number,
  timeToMaturity: number = 1
): MertonModel {
  if (equityValue <= 0 || equityVolatility <= 0 || debtValue <= 0) {
    return {
      assetValue: equityValue + debtValue,
      assetVolatility: equityVolatility,
      equityValue, debtValue,
      distanceToDefault: 0, defaultProbability: 1, creditSpread: 0,
    };
  }

  // 近似: 资产价值 ≈ 股权价值 + 债务价值
  const assetValue = equityValue + debtValue;

  // 资产波动率 ≈ 股权波动率 × (股权价值 / 资产价值)
  const assetVolatility = equityVolatility * (equityValue / assetValue);

  // 违约点
  const defaultPoint = debtValue * 0.5; // 短期债务 + 0.5×长期债务（简化）

  // 距离违约
  const distanceToDefault = (Math.log(assetValue / defaultPoint) + (riskFreeRate + assetVolatility ** 2 / 2) * timeToMaturity)
    / (assetVolatility * Math.sqrt(timeToMaturity));

  // 违约概率 (正态分布 CDF)
  const defaultProbability = normalCDF(-distanceToDefault);

  // 信用利差
  const creditSpread = defaultProbability > 0 && defaultProbability < 1
    ? -Math.log(1 - defaultProbability) / timeToMaturity - riskFreeRate
    : 0;

  return {
    assetValue: Math.round(assetValue),
    assetVolatility: Math.round(assetVolatility * 10000) / 10000,
    equityValue: Math.round(equityValue),
    debtValue: Math.round(debtValue),
    distanceToDefault: Math.round(distanceToDefault * 100) / 100,
    defaultProbability: Math.round(defaultProbability * 10000) / 10000,
    creditSpread: Math.round(creditSpread * 10000) / 10000,
  };
}

/**
 * 标准正态分布 CDF（近似）
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * 计算信用评分
 */
export function calculateCreditScore(data: FinancialData, prevData?: FinancialData): CreditScore {
  const factors = {
    profitability: 0,
    leverage: 0,
    liquidity: 0,
    efficiency: 0,
    growth: 0,
    cashFlow: 0,
  };

  // 盈利能力 (0-100)
  if (data.revenue > 0) {
    const netMargin = data.netIncome / data.revenue;
    factors.profitability = Math.max(0, Math.min(100, 50 + netMargin * 200));
  }
  if (data.totalAssets > 0) {
    const roa = data.netIncome / data.totalAssets;
    factors.profitability = (factors.profitability + Math.max(0, Math.min(100, 50 + roa * 500))) / 2;
  }

  // 杠杆 (0-100, 越高越好)
  if (data.totalAssets > 0) {
    const debtRatio = data.totalLiabilities / data.totalAssets;
    factors.leverage = Math.max(0, Math.min(100, 100 - debtRatio * 150));
  }

  // 流动性 (0-100)
  if (data.currentLiabilities > 0) {
    const currentRatio = data.currentAssets / data.currentLiabilities;
    factors.liquidity = Math.max(0, Math.min(100, currentRatio * 40));
  }

  // 效率 (0-100)
  if (data.totalAssets > 0) {
    const assetTurnover = data.revenue / data.totalAssets;
    factors.efficiency = Math.max(0, Math.min(100, assetTurnover * 50));
  }

  // 增长 (0-100)
  if (prevData) {
    if (prevData.revenue > 0) {
      const revenueGrowth = (data.revenue - prevData.revenue) / prevData.revenue;
      factors.growth = Math.max(0, Math.min(100, 50 + revenueGrowth * 100));
    }
  } else {
    factors.growth = 50;
  }

  // 现金流 (0-100)
  if (data.totalAssets > 0) {
    const cfoRatio = data.operatingCashFlow / data.totalAssets;
    factors.cashFlow = Math.max(0, Math.min(100, 50 + cfoRatio * 300));
  }
  if (data.interestExpense > 0) {
    const interestCoverage = data.ebit / data.interestExpense;
    factors.cashFlow = (factors.cashFlow + Math.max(0, Math.min(100, interestCoverage * 10))) / 2;
  }

  // 综合评分
  const score = Math.round(
    factors.profitability * 0.25 +
    factors.leverage * 0.2 +
    factors.liquidity * 0.15 +
    factors.efficiency * 0.15 +
    factors.growth * 0.1 +
    factors.cashFlow * 0.15
  );

  // 评级
  let grade: CreditScore['grade'];
  if (score >= 90) grade = 'AAA';
  else if (score >= 80) grade = 'AA';
  else if (score >= 70) grade = 'A';
  else if (score >= 60) grade = 'BBB';
  else if (score >= 50) grade = 'BB';
  else if (score >= 40) grade = 'B';
  else if (score >= 30) grade = 'CCC';
  else if (score >= 20) grade = 'CC';
  else if (score >= 10) grade = 'C';
  else grade = 'D';

  // 趋势
  let trend: CreditScore['trend'] = 'stable';
  if (prevData) {
    const prevScore = calculateCreditScore(prevData).score;
    if (score > prevScore + 5) trend = 'improving';
    else if (score < prevScore - 5) trend = 'deteriorating';
  }

  return {
    score,
    grade,
    factors: {
      profitability: Math.round(factors.profitability * 10) / 10,
      leverage: Math.round(factors.leverage * 10) / 10,
      liquidity: Math.round(factors.liquidity * 10) / 10,
      efficiency: Math.round(factors.efficiency * 10) / 10,
      growth: Math.round(factors.growth * 10) / 10,
      cashFlow: Math.round(factors.cashFlow * 10) / 10,
    },
    trend,
  };
}

/**
 * 分析信用利差
 */
export function analyzeCreditSpread(
  currentSpread: number,
  historicalSpreads: number[]
): CreditSpreadAnalysis {
  if (historicalSpreads.length === 0) {
    return {
      currentSpread, historicalAvg: currentSpread, percentile: 50,
      zScore: 0, fairValue: currentSpread, isOverpriced: false,
    };
  }

  const sorted = [...historicalSpreads].sort((a, b) => a - b);
  const historicalAvg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const std = Math.sqrt(sorted.reduce((a, b) => a + (b - historicalAvg) ** 2, 0) / sorted.length);

  const idx = sorted.findIndex(s => s >= currentSpread);
  const percentile = idx >= 0 ? (idx / sorted.length) * 100 : 100;
  const zScore = std > 0 ? (currentSpread - historicalAvg) / std : 0;

  // 公允价值: 历史均值 + 正常波动
  const fairValue = historicalAvg + std * 0.5;
  const isOverpriced = currentSpread > fairValue;

  return {
    currentSpread: Math.round(currentSpread * 10000) / 10000,
    historicalAvg: Math.round(historicalAvg * 10000) / 10000,
    percentile: Math.round(percentile * 10) / 10,
    zScore: Math.round(zScore * 100) / 100,
    fairValue: Math.round(fairValue * 10000) / 10000,
    isOverpriced,
  };
}

/**
 * 计算违约风险指标
 */
export function calculateDefaultRisk(
  pd: number, // 违约概率
  lgd: number, // 违约损失率 (0-1)
  ead: number, // 违约风险暴露
  confidenceLevel: number = 0.99
): DefaultRiskMetrics {
  const expectedLoss = pd * lgd * ead;

  // 非预期损失: 基于二项分布
  const variance = pd * (1 - pd) * lgd ** 2 * ead ** 2;
  const unexpectedLoss = Math.sqrt(variance);

  // 经济资本（简化：UL × z-score）
  const zAlpha = confidenceLevel === 0.99 ? 2.33 : confidenceLevel === 0.95 ? 1.65 : 1.28;
  const economicCapital = unexpectedLoss * zAlpha - expectedLoss;

  return {
    pd: Math.round(pd * 10000) / 10000,
    lgd: Math.round(lgd * 10000) / 10000,
    ead: Math.round(ead),
    expectedLoss: Math.round(expectedLoss),
    unexpectedLoss: Math.round(unexpectedLoss),
    economicCapital: Math.round(Math.max(0, economicCapital)),
  };
}

/**
 * 行业相对信用风险排名
 */
export function rankCreditRisk(
  companies: { name: string; data: FinancialData }[]
): { name: string; score: number; grade: string; rank: number }[] {
  const scored = companies.map(c => ({
    name: c.name,
    score: calculateCreditScore(c.data).score,
    grade: calculateCreditScore(c.data).grade,
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}
