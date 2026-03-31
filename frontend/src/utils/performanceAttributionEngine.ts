/**
 * 绩效归因分析引擎
 * Brinson归因/风险归因/风格归因/择时选股能力分解
 */

export interface PortfolioReturn {
  date: string;
  portfolioReturn: number;
  benchmarkReturn: number;
  holdings: { code: string; weight: number; return: number; sector: string }[];
}

export interface BrinsonAttribution {
  allocationEffect: number;   // 资产配置效应
  selectionEffect: number;    // 选股效应
  interactionEffect: number;  // 交互效应
  totalActiveReturn: number;
  sectorBreakdown: {
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
  specificRisk: number;
  beta: number;
  trackingError: number;
  informationRatio: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
}

export interface TimingSkill {
  timingScore: number;       // 择时能力 0-100
  stockPickingScore: number; // 选股能力 0-100
  upCapture: number;         // 上涨捕获率
  downCapture: number;       // 下跌捕获率
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  consistency: number;       // 月度正收益比例
}

export interface StyleAttribution {
  sizeExposure: number;      // 市值因子暴露
  valueExposure: number;     // 价值因子暴露
  momentumExposure: number;  // 动量因子暴露
  qualityExposure: number;   // 质量因子暴露
  lowVolExposure: number;    // 低波因子暴露
  dominantStyle: string;
  styleReturns: { factor: string; contribution: number }[];
}

// ── Brinson归因 ──

export function brinsonAttribution(
  portfolioHoldings: { sector: string; weight: number; return: number }[],
  benchmarkHoldings: { sector: string; weight: number; return: number }[]
): BrinsonAttribution {
  const sectors = new Set([
    ...portfolioHoldings.map(h => h.sector),
    ...benchmarkHoldings.map(h => h.sector),
  ]);

  let totalAllocation = 0, totalSelection = 0, totalInteraction = 0;
  const sectorBreakdown: BrinsonAttribution['sectorBreakdown'] = [];

  for (const sector of sectors) {
    const wp = portfolioHoldings.find(h => h.sector === sector)?.weight || 0;
    const wb = benchmarkHoldings.find(h => h.sector === sector)?.weight || 0;
    const rp = portfolioHoldings.find(h => h.sector === sector)?.return || 0;
    const rb = benchmarkHoldings.find(h => h.sector === sector)?.return || 0;

    const rbAvg = benchmarkHoldings.reduce((a, h) => a + h.weight * h.return, 0);

    const allocation = (wp - wb) * (rb - rbAvg);
    const selection = wb * (rp - rb);
    const interaction = (wp - wb) * (rp - rb);

    totalAllocation += allocation;
    totalSelection += selection;
    totalInteraction += interaction;

    sectorBreakdown.push({
      sector,
      allocation: roundTo(allocation, 6),
      selection: roundTo(selection, 6),
      interaction: roundTo(interaction, 6),
      total: roundTo(allocation + selection + interaction, 6),
    });
  }

  return {
    allocationEffect: roundTo(totalAllocation, 6),
    selectionEffect: roundTo(totalSelection, 6),
    interactionEffect: roundTo(totalInteraction, 6),
    totalActiveReturn: roundTo(totalAllocation + totalSelection + totalInteraction, 6),
    sectorBreakdown: sectorBreakdown.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
  };
}

// ── 风险指标 ──

export function calculateRiskMetrics(
  returns: number[],
  benchmarkReturns: number[],
  riskFreeRate: number = 0.02 / 252
): RiskAttribution {
  const n = returns.length;
  if (n < 2) {
    return { totalRisk: 0, systematicRisk: 0, specificRisk: 0, beta: 1, trackingError: 0,
      informationRatio: 0, sharpeRatio: 0, sortinoRatio: 0, maxDrawdown: 0, calmarRatio: 0 };
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / n;
  const avgBench = benchmarkReturns.reduce((a, b) => a + b, 0) / n;
  const totalRisk = Math.sqrt(returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (n - 1)) * Math.sqrt(252);

  // Beta
  const covariance = returns.reduce((a, r, i) => a + (r - avgReturn) * (benchmarkReturns[i] - avgBench), 0) / (n - 1);
  const benchVariance = benchmarkReturns.reduce((a, r) => a + (r - avgBench) ** 2, 0) / (n - 1);
  const beta = benchVariance > 0 ? covariance / benchVariance : 1;

  const systematicRisk = Math.abs(beta) * Math.sqrt(benchVariance) * Math.sqrt(252);
  const specificRisk = Math.sqrt(Math.max(0, totalRisk ** 2 - systematicRisk ** 2));

  // Tracking error
  const activeReturns = returns.map((r, i) => r - benchmarkReturns[i]);
  const avgActive = activeReturns.reduce((a, b) => a + b, 0) / n;
  const trackingError = Math.sqrt(activeReturns.reduce((a, r) => a + (r - avgActive) ** 2, 0) / (n - 1)) * Math.sqrt(252);

  const informationRatio = trackingError > 0 ? (avgReturn - avgBench) * 252 / trackingError : 0;
  const sharpeRatio = totalRisk > 0 ? (avgReturn * 252 - riskFreeRate * 252) / totalRisk : 0;

  // Sortino
  const downsideReturns = returns.filter(r => r < 0);
  const downsideRisk = downsideReturns.length > 0
    ? Math.sqrt(downsideReturns.reduce((a, r) => a + r ** 2, 0) / downsideReturns.length) * Math.sqrt(252)
    : 0.001;
  const sortinoRatio = (avgReturn * 252 - riskFreeRate * 252) / downsideRisk;

  // Max drawdown
  let cumReturn = 1, peak = 1, maxDD = 0;
  for (const r of returns) {
    cumReturn *= (1 + r);
    peak = Math.max(peak, cumReturn);
    maxDD = Math.max(maxDD, (peak - cumReturn) / peak);
  }

  const annualReturn = avgReturn * 252;
  const calmarRatio = maxDD > 0 ? annualReturn / maxDD : 0;

  return {
    totalRisk: roundTo(totalRisk, 4),
    systematicRisk: roundTo(systematicRisk, 4),
    specificRisk: roundTo(specificRisk, 4),
    beta: roundTo(beta, 4),
    trackingError: roundTo(trackingError, 4),
    informationRatio: roundTo(informationRatio, 4),
    sharpeRatio: roundTo(sharpeRatio, 4),
    sortinoRatio: roundTo(sortinoRatio, 4),
    maxDrawdown: roundTo(maxDD, 4),
    calmarRatio: roundTo(calmarRatio, 4),
  };
}

// ── 择时选股能力 ──

export function analyzeTimingSkill(returns: number[], benchmarkReturns: number[]): TimingSkill {
  const n = returns.length;
  if (n < 2) {
    return { timingScore: 50, stockPickingScore: 50, upCapture: 1, downCapture: 1,
      winRate: 0.5, avgWin: 0, avgLoss: 0, profitFactor: 1, consistency: 0.5 };
  }

  // 涨跌捕获
  const upReturns = benchmarkReturns.filter(r => r > 0);
  const downReturns = benchmarkReturns.filter(r => r < 0);

  const upPortfolioReturns = returns.filter((r, i) => benchmarkReturns[i] > 0);
  const downPortfolioReturns = returns.filter((r, i) => benchmarkReturns[i] < 0);

  const upCapture = upReturns.length > 0
    ? (upPortfolioReturns.reduce((a, b) => a + b, 0) / upPortfolioReturns.length) /
      (upReturns.reduce((a, b) => a + b, 0) / upReturns.length)
    : 1;
  const downCapture = downReturns.length > 0
    ? (downPortfolioReturns.reduce((a, b) => a + b, 0) / downPortfolioReturns.length) /
      (downReturns.reduce((a, b) => a + b, 0) / downReturns.length)
    : 1;

  // 胜率
  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r <= 0);
  const winRate = wins.length / n;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0.001;
  const profitFactor = (avgWin * wins.length) / (avgLoss * Math.max(losses.length, 1));

  // 择时评分
  const timingScore = Math.min(100, Math.max(0,
    50 + (upCapture - 1) * 50 - (downCapture - 1) * 30
  ));

  // 选股评分
  const stockPickingScore = Math.min(100, Math.max(0,
    50 + profitFactor * 10 + winRate * 20 - 15
  ));

  // 一致性
  const monthlyReturns: number[] = [];
  for (let i = 0; i < n; i += 21) {
    const chunk = returns.slice(i, i + 21);
    monthlyReturns.push(chunk.reduce((a, b) => a + b, 0));
  }
  const consistency = monthlyReturns.filter(r => r > 0).length / Math.max(monthlyReturns.length, 1);

  return {
    timingScore: roundTo(timingScore, 1),
    stockPickingScore: roundTo(stockPickingScore, 1),
    upCapture: roundTo(upCapture, 4),
    downCapture: roundTo(downCapture, 4),
    winRate: roundTo(winRate, 4),
    avgWin: roundTo(avgWin, 4),
    avgLoss: roundTo(avgLoss, 4),
    profitFactor: roundTo(profitFactor, 2),
    consistency: roundTo(consistency, 4),
  };
}

// ── 风格归因 ──

export function analyzeStyleAttribution(
  holdings: { code: string; weight: number; return: number; marketCap: number; pe: number; momentum: number }[]
): StyleAttribution {
  const totalWeight = holdings.reduce((a, h) => a + h.weight, 0) || 1;

  // 简化的因子暴露计算
  const sizeExposure = holdings.reduce((a, h) => a + h.weight * Math.log(h.marketCap), 0) / totalWeight;
  const valueExposure = holdings.reduce((a, h) => a + h.weight * (1 / Math.max(h.pe, 1)), 0) / totalWeight;
  const momentumExposure = holdings.reduce((a, h) => a + h.weight * h.momentum, 0) / totalWeight;

  const exposures = [
    { factor: '市值', value: sizeExposure },
    { factor: '价值', value: valueExposure },
    { factor: '动量', value: momentumExposure },
  ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return {
    sizeExposure: roundTo(sizeExposure, 4),
    valueExposure: roundTo(valueExposure, 4),
    momentumExposure: roundTo(momentumExposure, 4),
    qualityExposure: 0,
    lowVolExposure: 0,
    dominantStyle: exposures[0]?.factor || '均衡',
    styleReturns: exposures.map(e => ({ factor: e.factor, contribution: roundTo(e.value * 0.02, 6) })),
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
