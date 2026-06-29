/**
 * 风险管理引擎
 * 支持: VaR/CVaR实时计算、仓位管理、止损策略、压力测试、相关性风险
 */

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  sector: string;
}

export interface PortfolioRisk {
  totalValue: number;
  totalPnL: number;
  totalPnLPct: number;
  var95: number;
  var99: number;
  cvar95: number;
  maxDrawdown: number;
  currentDrawdown: number;
  beta: number;
  trackingError: number;
  concentrationRisk: number;
  sectorExposure: Map<string, number>;
  correlationRisk: number;
}

export interface StopLossConfig {
  type: 'fixed' | 'trailing' | 'atr' | 'time' | 'volatility';
  value: number; // 固定百分比/ATR倍数/天数
  trailingHigh?: number;
}

export interface PositionSizeConfig {
  method: 'fixed_pct' | 'kelly' | 'risk_parity' | 'volatility_target';
  maxPositionPct: number;
  riskPerTrade: number; // 单笔风险占总资金比例
  maxCorrelatedExposure: number;
}

export interface RiskLimit {
  maxDrawdown: number;
  maxDailyLoss: number;
  maxPositionSize: number;
  maxSectorExposure: number;
  maxCorrelation: number;
  maxLeverage: number;
}

export interface RiskAlert {
  level: 'warning' | 'critical';
  type: string;
  message: number;
  currentValue: number;
  limit: number;
  timestamp: Date;
}

/**
 * 计算组合风险指标
 */
export function calculatePortfolioRisk(
  positions: Position[],
  marketReturns: number[],
  portfolioReturns: number[],
  lookbackDays: number = 60
): PortfolioRisk {
  const totalValue = positions.reduce(
    (sum, p) => sum + p.quantity * p.currentPrice, 0
  );
  const totalCost = positions.reduce(
    (sum, p) => sum + p.quantity * p.avgCost, 0
  );
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? totalPnL / totalCost : 0;

  // VaR计算 (历史模拟法)
  const recentReturns = portfolioReturns.slice(-lookbackDays);
  const { var95, var99, cvar95 } = calculateVaR(recentReturns, totalValue);

  // 最大回撤
  const { maxDrawdown, currentDrawdown } = calculateDrawdown(portfolioReturns);

  // Beta
  const beta = calculateBeta(
    portfolioReturns.slice(-lookbackDays),
    marketReturns.slice(-lookbackDays)
  );

  // 跟踪误差
  const trackingError = calculateTrackingError(
    portfolioReturns.slice(-lookbackDays),
    marketReturns.slice(-lookbackDays)
  );

  // 集中度风险
  const concentrationRisk = calculateConcentrationRisk(positions);

  // 行业暴露
  const sectorExposure = calculateSectorExposure(positions);

  // 相关性风险
  const correlationRisk = calculateCorrelationRisk(positions, portfolioReturns);

  return {
    totalValue,
    totalPnL,
    totalPnLPct,
    var95,
    var99,
    cvar95,
    maxDrawdown,
    currentDrawdown,
    beta,
    trackingError,
    concentrationRisk,
    sectorExposure,
    correlationRisk
  };
}

/**
 * 止损价计算
 */
export function calculateStopLoss(
  entryPrice: number,
  currentPrice: number,
  highSinceEntry: number,
  atr: number,
  config: StopLossConfig
): number {
  switch (config.type) {
    case 'fixed':
      return entryPrice * (1 - config.value);
    case 'trailing': {
      const trailStop = highSinceEntry * (1 - config.value);
      return Math.max(trailStop, entryPrice * 0.5); // 最多回撤50%
    }
    case 'atr':
      return currentPrice - atr * config.value;
    case 'volatility':
      return entryPrice * (1 - config.value * atr / entryPrice);
    default:
      return entryPrice * (1 - 0.05);
  }
}

/**
 * 仓位大小计算
 */
export function calculatePositionSize(
  totalCapital: number,
  entryPrice: number,
  stopLossPrice: number,
  config: PositionSizeConfig,
  volatility?: number
): number {
  const riskAmount = totalCapital * config.riskPerTrade;
  const riskPerShare = Math.abs(entryPrice - stopLossPrice);

  if (riskPerShare <= 0) return 0;

  let shares: number;

  switch (config.method) {
    case 'fixed_pct':
      shares = Math.floor((totalCapital * config.maxPositionPct) / entryPrice);
      break;
    case 'risk_parity':
      shares = Math.floor(riskAmount / riskPerShare);
      break;
    case 'volatility_target': {
      const targetVol = config.riskPerTrade;
      const vol = volatility ?? 0.02;
      const volShares = Math.floor((totalCapital * targetVol) / (entryPrice * vol));
      shares = volShares;
      break;
    }
    case 'kelly': {
      // 简化Kelly: f = (p * b - q) / b, p=win rate, b=odds
      const winRate = 0.55; // 假设55%胜率
      const odds = riskPerShare > 0 ? (entryPrice * 0.1) / riskPerShare : 1; // 假设10%止盈
      const kelly = (winRate * odds - (1 - winRate)) / odds;
      const kellyFraction = Math.max(0, Math.min(kelly, 0.25)); // 最大25%
      shares = Math.floor((totalCapital * kellyFraction) / entryPrice);
      break;
    }
    default:
      shares = Math.floor(riskAmount / riskPerShare);
  }

  // 限制最大仓位
  const maxShares = Math.floor((totalCapital * config.maxPositionPct) / entryPrice);
  return Math.min(shares, maxShares);
}

/**
 * 风险限额检查
 */
export function checkRiskLimits(
  risk: PortfolioRisk,
  limits: RiskLimit,
  _positions: Position[]
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const now = new Date();

  if (risk.currentDrawdown > limits.maxDrawdown * 0.8) {
    alerts.push({
      level: risk.currentDrawdown > limits.maxDrawdown ? 'critical' : 'warning',
      type: 'drawdown',
      message: risk.currentDrawdown,
      currentValue: risk.currentDrawdown,
      limit: limits.maxDrawdown,
      timestamp: now
    });
  }

  if (risk.concentrationRisk > limits.maxPositionSize) {
    alerts.push({
      level: 'warning',
      type: 'concentration',
      message: risk.concentrationRisk,
      currentValue: risk.concentrationRisk,
      limit: limits.maxPositionSize,
      timestamp: now
    });
  }

  for (const [_sector, exposure] of risk.sectorExposure) {
    if (exposure > limits.maxSectorExposure) {
      alerts.push({
        level: 'warning',
        type: 'sector_exposure',
        message: exposure,
        currentValue: exposure,
        limit: limits.maxSectorExposure,
        timestamp: now
      });
    }
  }

  if (risk.correlationRisk > limits.maxCorrelation) {
    alerts.push({
      level: 'warning',
      type: 'correlation',
      message: risk.correlationRisk,
      currentValue: risk.correlationRisk,
      limit: limits.maxCorrelation,
      timestamp: now
    });
  }

  return alerts;
}

// ===== Internal Functions =====

function calculateVaR(
  returns: number[],
  portfolioValue: number
): { var95: number; var99: number; cvar95: number } {
  if (returns.length < 2) {
    return { var95: 0, var99: 0, cvar95: 0 };
  }

  const sorted = [...returns].sort((a, b) => a - b);
  const var95Idx = Math.floor(sorted.length * 0.05);
  const var99Idx = Math.floor(sorted.length * 0.01);

  const var95 = -sorted[var95Idx] * portfolioValue;
  const var99 = -sorted[var99Idx] * portfolioValue;
  const tail95 = sorted.slice(0, var95Idx + 1);
  const cvar95 = -(tail95.reduce((a, b) => a + b, 0) / tail95.length) * portfolioValue;

  return { var95, var99, cvar95 };
}

function calculateDrawdown(
  returns: number[]
): { maxDrawdown: number; currentDrawdown: number } {
  let peak = 1;
  let cumReturn = 1;
  let maxDD = 0;

  for (const r of returns) {
    cumReturn *= (1 + r);
    if (cumReturn > peak) peak = cumReturn;
    const dd = (peak - cumReturn) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  const currentDD = (peak - cumReturn) / peak;
  return { maxDrawdown: maxDD, currentDrawdown: currentDD };
}

function calculateBeta(portfolioReturns: number[], marketReturns: number[]): number {
  const n = Math.min(portfolioReturns.length, marketReturns.length);
  if (n < 2) return 1;

  let sumP = 0, sumM = 0, sumPM = 0, sumM2 = 0;
  for (let i = 0; i < n; i++) {
    sumP += portfolioReturns[i];
    sumM += marketReturns[i];
    sumPM += portfolioReturns[i] * marketReturns[i];
    sumM2 += marketReturns[i] * marketReturns[i];
  }

  const denom = n * sumM2 - sumM * sumM;
  return Math.abs(denom) > 1e-10 ? (n * sumPM - sumP * sumM) / denom : 1;
}

function calculateTrackingError(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;

  const diffs: number[] = [];
  for (let i = 0; i < n; i++) {
    diffs.push(portfolioReturns[i] - benchmarkReturns[i]);
  }

  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const variance = diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance * 252);
}

function calculateConcentrationRisk(positions: Position[]): number {
  const totalValue = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
  if (totalValue === 0) return 0;

  // HHI指数 (赫芬达尔指数)
  let hhi = 0;
  for (const p of positions) {
    const weight = (p.quantity * p.currentPrice) / totalValue;
    hhi += weight * weight;
  }

  return hhi;
}

function calculateSectorExposure(positions: Position[]): Map<string, number> {
  const totalValue = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
  const exposure = new Map<string, number>();

  for (const p of positions) {
    const current = exposure.get(p.sector) ?? 0;
    const weight = totalValue > 0 ? (p.quantity * p.currentPrice) / totalValue : 0;
    exposure.set(p.sector, current + weight);
  }

  return exposure;
}

function calculateCorrelationRisk(
  positions: Position[],
  _returns: number[]
): number {
  // 简化: 如果组合集中度高则相关性风险高
  if (positions.length <= 1) return 1;
  const concentration = calculateConcentrationRisk(positions);
  return concentration;
}
