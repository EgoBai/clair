/**
 * 组合归因引擎
 * Brinson-Hood-Beebower 业绩归因分析、风险归因、多因子归因
 */

export interface Holding {
  name: string;
  weight: number; // 组合权重
  benchmarkWeight: number; // 基准权重
  return: number; // 个股收益
  benchmarkReturn: number; // 基准中该资产收益
  sector?: string;
}

export interface SectorHolding {
  sector: string;
  portfolioWeight: number;
  benchmarkWeight: number;
  portfolioReturn: number;
  benchmarkReturn: number;
}

export interface BrinsonAttribution {
  allocationEffect: number; // 配置效应
  selectionEffect: number; // 选股效应
  interactionEffect: number; // 交互效应
  totalActiveReturn: number;
  attributionBySector: {
    sector: string;
    allocation: number;
    selection: number;
    interaction: number;
    total: number;
  }[];
}

export interface RiskAttribution {
  totalRisk: number;
  systematicRisk: number;
  idiosyncraticRisk: number;
  factorContributions: { factor: string; contribution: number; percentage: number }[];
  marginalRisk: Record<string, number>;
  componentRisk: Record<string, number>;
}

export interface FactorExposure {
  factor: string;
  portfolioExposure: number;
  benchmarkExposure: number;
  activeExposure: number;
  factorReturn: number;
  contribution: number;
}

export interface MultiFactorAttribution {
  factors: FactorExposure[];
  specificReturn: number;
  totalActiveReturn: number;
  rSquared: number;
}

export interface PerformanceSummary {
  portfolioReturn: number;
  benchmarkReturn: number;
  activeReturn: number;
  trackingError: number;
  informationRatio: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

/**
 * Brinson-Hood-Beebower 归因分析
 */
export function brinsonAttribution(holdings: SectorHolding[]): BrinsonAttribution {
  let totalAllocation = 0;
  let totalSelection = 0;
  let totalInteraction = 0;

  // 基准总收益
  const benchmarkReturn = holdings.reduce(
    (sum, h) => sum + h.benchmarkWeight * h.benchmarkReturn, 0
  );

  const attributionBySector = holdings.map(h => {
    const wp_i = h.portfolioWeight;
    const wb_i = h.benchmarkWeight;
    const rp_i = h.portfolioReturn;
    const rb_i = h.benchmarkReturn;

    // 配置效应: (wp_i - wb_i) × (rb_i - Rb)
    const allocation = (wp_i - wb_i) * (rb_i - benchmarkReturn);

    // 选股效应: wb_i × (rp_i - rb_i)
    const selection = wb_i * (rp_i - rb_i);

    // 交互效应: (wp_i - wb_i) × (rp_i - rb_i)
    const interaction = (wp_i - wb_i) * (rp_i - rb_i);

    totalAllocation += allocation;
    totalSelection += selection;
    totalInteraction += interaction;

    return {
      sector: h.sector,
      allocation: Math.round(allocation * 10000) / 10000,
      selection: Math.round(selection * 10000) / 10000,
      interaction: Math.round(interaction * 10000) / 10000,
      total: Math.round((allocation + selection + interaction) * 10000) / 10000,
    };
  });

  // 组合总收益
  const portfolioReturn = holdings.reduce(
    (sum, h) => sum + h.portfolioWeight * h.portfolioReturn, 0
  );

  return {
    allocationEffect: Math.round(totalAllocation * 10000) / 10000,
    selectionEffect: Math.round(totalSelection * 10000) / 10000,
    interactionEffect: Math.round(totalInteraction * 10000) / 10000,
    totalActiveReturn: Math.round((portfolioReturn - benchmarkReturn) * 10000) / 10000,
    attributionBySector,
  };
}

/**
 * 改进的 Brinson 归因（将交互效应分配到配置和选股）
 */
export function brinsonAttributionImproved(holdings: SectorHolding[]): {
  allocation: number;
  selection: number;
  total: number;
  bySector: { sector: string; allocation: number; selection: number }[];
} {
  const benchmarkReturn = holdings.reduce(
    (sum, h) => sum + h.benchmarkWeight * h.benchmarkReturn, 0
  );

  let totalAllocation = 0;
  let totalSelection = 0;

  const bySector = holdings.map(h => {
    const wp = h.portfolioWeight;
    const wb = h.benchmarkWeight;
    const rp = h.portfolioReturn;
    const rb = h.benchmarkReturn;

    // 改进: 交互效应平分
    const interaction = (wp - wb) * (rp - rb);
    const allocation = (wp - wb) * (rb - benchmarkReturn) + interaction / 2;
    const selection = wb * (rp - rb) + interaction / 2;

    totalAllocation += allocation;
    totalSelection += selection;

    return {
      sector: h.sector,
      allocation: Math.round(allocation * 10000) / 10000,
      selection: Math.round(selection * 10000) / 10000,
    };
  });

  const portfolioReturn = holdings.reduce(
    (sum, h) => sum + h.portfolioWeight * h.portfolioReturn, 0
  );

  return {
    allocation: Math.round(totalAllocation * 10000) / 10000,
    selection: Math.round(totalSelection * 10000) / 10000,
    total: Math.round((portfolioReturn - benchmarkReturn) * 10000) / 10000,
    bySector,
  };
}

/**
 * 风险归因分析
 */
export function riskAttribution(
  weights: number[],
  covarianceMatrix: number[][],
  factorLoadings: number[][], // [资产][因子]
  factorNames: string[]
): RiskAttribution {
  const n = weights.length;
  const k = factorNames.length;

  // 组合方差: w'Σw
  let totalVariance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      totalVariance += weights[i] * weights[j] * covarianceMatrix[i][j];
    }
  }
  const totalRisk = Math.sqrt(Math.max(0, totalVariance));

  // 因子协方差矩阵（简化为对角阵）
  const factorCov = Array.from({ length: k }, (_, i) => {
    let sum = 0;
    for (let a = 0; a < n; a++) {
      sum += weights[a] * factorLoadings[a][i];
    }
    return sum * sum; // 因子暴露的平方和
  });

  // 系统性风险
  const systematicVariance = factorCov.reduce((a, b) => a + b, 0);
  const systematicRisk = Math.sqrt(Math.max(0, systematicVariance));

  // 特质风险
  const idiosyncraticRisk = Math.sqrt(Math.max(0, totalVariance - systematicVariance));

  // 因子贡献
  const factorContributions = factorNames.map((name, i) => {
    const contribution = factorCov[i];
    const pct = totalVariance > 0 ? (contribution / totalVariance) * 100 : 0;
    return {
      factor: name,
      contribution: Math.round(contribution * 10000) / 10000,
      percentage: Math.round(pct * 100) / 100,
    };
  });

  // 边际风险贡献
  const marginalRisk: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    let marginal = 0;
    for (let j = 0; j < n; j++) {
      marginal += weights[j] * covarianceMatrix[i][j];
    }
    marginalRisk[`asset_${i}`] = totalRisk > 0 ? marginal / totalRisk : 0;
  }

  // 成分风险贡献
  const componentRisk: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    componentRisk[`asset_${i}`] = weights[i] * (marginalRisk[`asset_${i}`] || 0);
  }

  return {
    totalRisk: Math.round(totalRisk * 10000) / 10000,
    systematicRisk: Math.round(systematicRisk * 10000) / 10000,
    idiosyncraticRisk: Math.round(idiosyncraticRisk * 10000) / 10000,
    factorContributions,
    marginalRisk,
    componentRisk,
  };
}

/**
 * 多因子归因分析
 */
export function multiFactorAttribution(
  portfolioReturns: number[],
  benchmarkReturns: number[],
  factorReturns: number[][], // [时间][因子]
  factorNames: string[]
): MultiFactorAttribution {
  const T = portfolioReturns.length;
  const k = factorNames.length;

  if (T < k + 1) {
    return {
      factors: factorNames.map(f => ({
        factor: f, portfolioExposure: 0, benchmarkExposure: 0,
        activeExposure: 0, factorReturn: 0, contribution: 0,
      })),
      specificReturn: 0, totalActiveReturn: 0, rSquared: 0,
    };
  }

  // Active returns
  const activeReturns = portfolioReturns.map((p, i) => p - benchmarkReturns[i]);

  // OLS 回归: activeReturn = β₁f₁ + β₂f₂ + ... + ε
  // 简化: 使用平均因子暴露
  const factorExposures: FactorExposure[] = [];
  let totalExplained = 0;

  for (let f = 0; f < k; f++) {
    const factorRet = factorReturns.map(fr => fr[f]);
    const avgFactorReturn = factorRet.reduce((a, b) => a + b, 0) / T;

    // 因子暴露 = 相关系数 × (active波动率 / 因子波动率)
    const activeStd = Math.sqrt(activeReturns.reduce((a, b) => a + b ** 2, 0) / T);
    const factorStd = Math.sqrt(factorRet.reduce((a, b) => a + b ** 2, 0) / T);

    let corr = 0;
    if (activeStd > 0 && factorStd > 0) {
      const avgActive = activeReturns.reduce((a, b) => a + b, 0) / T;
      let cov = 0;
      for (let t = 0; t < T; t++) {
        cov += (activeReturns[t] - avgActive) * (factorRet[t] - avgFactorReturn);
      }
      corr = cov / (T * activeStd * factorStd);
    }

    const portfolioExposure = corr * (activeStd / (factorStd || 1));
    const _benchmarkExposure = 0; // 基准暴露为0（active return框架）
    const contribution = portfolioExposure * avgFactorReturn;
    totalExplained += contribution;

    factorExposures.push({
      factor: factorNames[f],
      portfolioExposure: Math.round(portfolioExposure * 10000) / 10000,
      benchmarkExposure: 0,
      activeExposure: Math.round(portfolioExposure * 10000) / 10000,
      factorReturn: Math.round(avgFactorReturn * 10000) / 10000,
      contribution: Math.round(contribution * 10000) / 10000,
    });
  }

  const totalActiveReturn = activeReturns.reduce((a, b) => a + b, 0) / T;
  const specificReturn = totalActiveReturn - totalExplained;

  // R²
  const ssTotal = activeReturns.reduce((a, b) => a + b ** 2, 0);
  const ssExplained = activeReturns.map((ar, t) => {
    let predicted = 0;
    for (let f = 0; f < k; f++) {
      predicted += factorExposures[f].portfolioExposure * factorReturns[t][f];
    }
    return (predicted) ** 2;
  }).reduce((a, b) => a + b, 0);
  const rSquared = ssTotal > 0 ? Math.min(1, ssExplained / ssTotal) : 0;

  return {
    factors: factorExposures,
    specificReturn: Math.round(specificReturn * 10000) / 10000,
    totalActiveReturn: Math.round(totalActiveReturn * 10000) / 10000,
    rSquared: Math.round(rSquared * 10000) / 10000,
  };
}

/**
 * 计算绩效汇总
 */
export function calculatePerformanceSummary(
  portfolioReturns: number[],
  benchmarkReturns: number[],
  riskFreeRate: number = 0.02 / 252
): PerformanceSummary {
  const n = portfolioReturns.length;
  if (n === 0) {
    return {
      portfolioReturn: 0, benchmarkReturn: 0, activeReturn: 0,
      trackingError: 0, informationRatio: 0, sharpeRatio: 0,
      sortinoRatio: 0, maxDrawdown: 0, calmarRatio: 0,
      winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
    };
  }

  // 收益率
  const portfolioReturn = portfolioReturns.reduce((a, b) => a + b, 0);
  const benchmarkReturn = benchmarkReturns.reduce((a, b) => a + b, 0);
  const activeReturn = portfolioReturn - benchmarkReturn;

  // 跟踪误差
  const activeReturns = portfolioReturns.map((p, i) => p - (benchmarkReturns[i] || 0));
  const avgActive = activeReturns.reduce((a, b) => a + b, 0) / n;
  const trackingError = Math.sqrt(
    activeReturns.reduce((a, b) => a + (b - avgActive) ** 2, 0) / n
  ) * Math.sqrt(252);

  // 信息比率
  const informationRatio = trackingError > 0 ? (activeReturn * 252) / (trackingError * Math.sqrt(252)) : 0;

  // Sharpe Ratio
  const avgReturn = portfolioReturns.reduce((a, b) => a + b, 0) / n;
  const stdReturn = Math.sqrt(
    portfolioReturns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / n
  );
  const sharpeRatio = stdReturn > 0 ? ((avgReturn - riskFreeRate) / stdReturn) * Math.sqrt(252) : 0;

  // Sortino Ratio
  const downsideReturns = portfolioReturns.filter(r => r < riskFreeRate);
  const downsideDev = downsideReturns.length > 0
    ? Math.sqrt(downsideReturns.reduce((a, r) => a + (r - riskFreeRate) ** 2, 0) / n)
    : stdReturn;
  const sortinoRatio = downsideDev > 0 ? ((avgReturn - riskFreeRate) / downsideDev) * Math.sqrt(252) : 0;

  // 最大回撤
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const ret of portfolioReturns) {
    cumulative += ret;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.min(maxDrawdown, cumulative - peak);
  }

  // Calmar Ratio
  const annualReturn = portfolioReturn * 252 / n;
  const calmarRatio = maxDrawdown < 0 ? annualReturn / Math.abs(maxDrawdown) : 0;

  // 胜率和盈亏比
  const wins = portfolioReturns.filter(r => r > 0);
  const losses = portfolioReturns.filter(r => r <= 0);
  const winRate = (wins.length / n) * 100;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  return {
    portfolioReturn: Math.round(portfolioReturn * 10000) / 10000,
    benchmarkReturn: Math.round(benchmarkReturn * 10000) / 10000,
    activeReturn: Math.round(activeReturn * 10000) / 10000,
    trackingError: Math.round(trackingError * 10000) / 10000,
    informationRatio: Math.round(informationRatio * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    winRate: Math.round(winRate * 10) / 10,
    avgWin: Math.round(avgWin * 10000) / 10000,
    avgLoss: Math.round(avgLoss * 10000) / 10000,
    profitFactor: Math.round(profitFactor * 100) / 100,
  };
}
