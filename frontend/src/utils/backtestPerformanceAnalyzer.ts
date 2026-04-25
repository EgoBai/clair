/**
 * Backtest Performance Analyzer
 * 回测绩效分析引擎 - 全面的策略回测指标计算
 */

export interface TradeRecord {
  entryDate: string;
  exitDate: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  holdingDays: number;
  fees: number;
  tags?: string[];
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
  positions: number;
}

export interface BacktestConfig {
  initialCapital: number;
  commission: number;
  slippage: number;
  marginRequirement: number;
  riskFreeRate: number;
  benchmarkReturns?: number[];
}

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgWinLossRatio: number;
  expectancy: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  longTrades: number;
  shortTrades: number;
  avgHoldingDays: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  recoveryFactor: number;
  payoffRatio: number;
  riskRewardRatio: number;
  ulcerIndex: number;
  kappa: number;
  omegaRatio: number;
  tailRatio: number;
  cvar: number;
  bestTrade: number;
  worstTrade: number;
  bestMonth: string;
  worstMonth: string;
  profitPerDay: number;
  exposureTime: number;
  annualTurnover: number;
}

export interface MonthlyReturns {
  year: number;
  month: number;
  return: number;
  trades: number;
}

export interface DrawdownPeriod {
  startDate: string;
  endDate: string;
  recoveryDate: string | null;
  maxDrawdown: number;
  duration: number;
  recoveryDuration: number | null;
}

export interface TradeDistribution {
  byPnl: { range: string; count: number; totalPnl: number }[];
  byDuration: { range: string; count: number; avgPnl: number }[];
  byDayOfWeek: Record<string, { count: number; avgPnl: number }>;
  byMonth: Record<string, { count: number; avgPnl: number }>;
  bySymbol: Record<string, { count: number; totalPnl: number; winRate: number }>;
}

export function calculateEquityCurve(
  trades: TradeRecord[],
  initialCapital: number
): EquityPoint[] {
  const points: EquityPoint[] = [];
  let equity = initialCapital;
  let peak = initialCapital;

  const sortedTrades = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  const dateMap = new Map<string, number>();

  for (const trade of sortedTrades) {
    equity += trade.pnl - trade.fees;
    const prev = dateMap.get(trade.exitDate) ?? equity;
    dateMap.set(trade.exitDate, prev + (equity - prev));
  }

  let runningEquity = initialCapital;
  for (const trade of sortedTrades) {
    runningEquity += trade.pnl - trade.fees;
    if (runningEquity > peak) peak = runningEquity;
    const drawdown = peak - runningEquity;
    const drawdownPercent = peak > 0 ? drawdown / peak : 0;

    points.push({
      date: trade.exitDate,
      equity: runningEquity,
      drawdown,
      drawdownPercent,
      positions: 1,
    });
  }

  return points;
}

export function calculateMaxDrawdownDuration(equityCurve: EquityPoint[]): number {
  let maxDuration = 0;
  let peakDate = equityCurve[0]?.date;
  let peakEquity = equityCurve[0]?.equity ?? 0;

  for (const point of equityCurve) {
    if (point.equity > peakEquity) {
      peakEquity = point.equity;
      peakDate = point.date;
    }
    if (point.equity < peakEquity) {
      const days = Math.floor(
        (new Date(point.date).getTime() - new Date(peakDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      maxDuration = Math.max(maxDuration, days);
    }
  }

  return maxDuration;
}

export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0.03
): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualizedReturn = mean * 252;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  return volatility === 0 ? 0 : (annualizedReturn - riskFreeRate) / volatility;
}

export function calculateSortinoRatio(
  returns: number[],
  riskFreeRate: number = 0.03
): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualizedReturn = mean * 252;
  const downside = returns.filter(r => r < 0);
  if (downside.length === 0) return Infinity;
  const downsideVariance = downside.reduce((s, r) => s + r ** 2, 0) / downside.length;
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252);
  return downsideDeviation === 0 ? 0 : (annualizedReturn - riskFreeRate) / downsideDeviation;
}

export function calculateCalmarRatio(
  annualizedReturn: number,
  maxDrawdown: number
): number {
  return maxDrawdown === 0 ? Infinity : annualizedReturn / maxDrawdown;
}

export function calculateProfitFactor(trades: TradeRecord[]): number {
  const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  return grossLoss === 0 ? Infinity : grossProfit / grossLoss;
}

export function calculateExpectancy(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  return totalPnl / trades.length;
}

export function calculateWinRate(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0;
  return trades.filter(t => t.pnl > 0).length / trades.length;
}

export function calculateConsecutiveStreaks(trades: TradeRecord[]): {
  maxWins: number;
  maxLosses: number;
} {
  let maxWins = 0;
  let maxLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of trades) {
    if (trade.pnl > 0) {
      currentWins++;
      currentLosses = 0;
      maxWins = Math.max(maxWins, currentWins);
    } else {
      currentLosses++;
      currentWins = 0;
      maxLosses = Math.max(maxLosses, currentLosses);
    }
  }

  return { maxWins, maxLosses };
}

export function calculateUlcerIndex(equityCurve: EquityPoint[]): number {
  if (equityCurve.length === 0) return 0;
  let peak = equityCurve[0].equity;
  const drawdowns: number[] = [];

  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    drawdowns.push(dd);
  }

  const meanSquaredDd = drawdowns.reduce((s, dd) => s + dd ** 2, 0) / drawdowns.length;
  return Math.sqrt(meanSquaredDd);
}

export function calculateOmegaRatio(returns: number[], threshold: number = 0): number {
  const gains = returns.filter(r => r > threshold).reduce((s, r) => s + (r - threshold), 0);
  const losses = returns.filter(r => r <= threshold).reduce((s, r) => s + (threshold - r), 0);
  return losses === 0 ? Infinity : gains / losses;
}

export function calculateCVaR(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoffIndex = Math.floor(sorted.length * (1 - confidence));
  const tail = sorted.slice(0, cutoffIndex + 1);
  return tail.length === 0 ? 0 : tail.reduce((a, b) => a + b, 0) / tail.length;
}

export function calculateTailRatio(returns: number[]): number {
  const sorted = [...returns].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p5 = sorted[Math.floor(sorted.length * 0.05)];
  return p5 === 0 ? Infinity : Math.abs(p95 / p5);
}

export function calculateKappa(returns: number[], threshold: number = 0, order: number = 2): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downside = returns.filter(r => r < threshold);
  if (downside.length === 0) return Infinity;
  const downsideMoment = downside.reduce((s, r) => s + (threshold - r) ** order, 0) / downside.length;
  const downsideDeviation = downsideMoment ** (1 / order);
  return downsideDeviation === 0 ? 0 : (mean - threshold) / downsideDeviation;
}

export function calculateRecoveryFactor(
  totalReturn: number,
  maxDrawdown: number
): number {
  return maxDrawdown === 0 ? Infinity : totalReturn / maxDrawdown;
}

export function groupTradesByMonth(trades: TradeRecord[]): MonthlyReturns[] {
  const monthly = new Map<string, { pnl: number; trades: number }>();

  for (const trade of trades) {
    const month = trade.exitDate.substring(0, 7);
    const existing = monthly.get(month) ?? { pnl: 0, trades: 0 };
    existing.pnl += trade.pnl;
    existing.trades++;
    monthly.set(month, existing);
  }

  return Array.from(monthly.entries())
    .map(([key, val]) => ({
      year: parseInt(key.split('-')[0], 10),
      month: parseInt(key.split('-')[1], 10),
      return: val.pnl,
      trades: val.trades,
    }))
    .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
}

export function calculateTradeDistribution(trades: TradeRecord[]): TradeDistribution {
  const pnlRanges = [
    { min: -Infinity, max: -10, label: '<-10%' },
    { min: -10, max: -5, label: '-10%~-5%' },
    { min: -5, max: -2, label: '-5%~-2%' },
    { min: -2, max: 0, label: '-2%~0%' },
    { min: 0, max: 2, label: '0%~2%' },
    { min: 2, max: 5, label: '2%~5%' },
    { min: 5, max: 10, label: '5%~10%' },
    { min: 10, max: Infinity, label: '>10%' },
  ];

  const byPnl = pnlRanges.map(range => ({
    range: range.label,
    count: trades.filter(t => t.pnlPercent >= range.min && t.pnlPercent < range.max).length,
    totalPnl: trades
      .filter(t => t.pnlPercent >= range.min && t.pnlPercent < range.max)
      .reduce((s, t) => s + t.pnl, 0),
  }));

  const durationRanges = [
    { min: 0, max: 1, label: '当天' },
    { min: 1, max: 5, label: '1-5天' },
    { min: 5, max: 20, label: '5-20天' },
    { min: 20, max: 60, label: '20-60天' },
    { min: 60, max: Infinity, label: '>60天' },
  ];

  const byDuration = durationRanges.map(range => {
    const filtered = trades.filter(t => t.holdingDays >= range.min && t.holdingDays < range.max);
    return {
      range: range.label,
      count: filtered.length,
      avgPnl: filtered.length > 0 ? filtered.reduce((s, t) => s + t.pnl, 0) / filtered.length : 0,
    };
  });

  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五'];
  const byDayOfWeek: Record<string, { count: number; avgPnl: number }> = {};
  for (const day of dayNames) {
    byDayOfWeek[day] = { count: 0, avgPnl: 0 };
  }
  for (const trade of trades) {
    const day = dayNames[new Date(trade.exitDate).getDay()];
    byDayOfWeek[day].count++;
    byDayOfWeek[day].avgPnl += trade.pnl;
  }
  for (const day of dayNames) {
    if (byDayOfWeek[day].count > 0) {
      byDayOfWeek[day].avgPnl /= byDayOfWeek[day].count;
    }
  }

  const byMonth: Record<string, { count: number; avgPnl: number }> = {};
  for (const trade of trades) {
    const month = trade.exitDate.substring(5, 7);
    if (!byMonth[month]) byMonth[month] = { count: 0, avgPnl: 0 };
    byMonth[month].count++;
    byMonth[month].avgPnl += trade.pnl;
  }
  for (const month of Object.keys(byMonth)) {
    if (byMonth[month].count > 0) {
      byMonth[month].avgPnl /= byMonth[month].count;
    }
  }

  const bySymbol: Record<string, { count: number; totalPnl: number; winRate: number }> = {};
  for (const trade of trades) {
    if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = { count: 0, totalPnl: 0, winRate: 0 };
    bySymbol[trade.symbol].count++;
    bySymbol[trade.symbol].totalPnl += trade.pnl;
  }
  for (const symbol of Object.keys(bySymbol)) {
    const symbolTrades = trades.filter(t => t.symbol === symbol);
    bySymbol[symbol].winRate = symbolTrades.filter(t => t.pnl > 0).length / symbolTrades.length;
  }

  return { byPnl, byDuration, byDayOfWeek, byMonth, bySymbol };
}

export class BacktestAnalyzer {
  private trades: TradeRecord[] = [];
  private config: BacktestConfig;
  private equityCurve: EquityPoint[] = [];

  constructor(config: BacktestConfig) {
    this.config = config;
  }

  addTrades(trades: TradeRecord[]): void {
    this.trades.push(...trades);
    this.trades.sort((a, b) => a.exitDate.localeCompare(b.exitDate));
    this.equityCurve = calculateEquityCurve(this.trades, this.config.initialCapital);
  }

  getMetrics(): BacktestMetrics {
    if (this.trades.length === 0) {
      return this.getEmptyMetrics();
    }

    const returns = this.trades.map(t => t.pnlPercent / 100);
    const totalReturn = this.equityCurve.length > 0
      ? (this.equityCurve[this.equityCurve.length - 1].equity - this.config.initialCapital) / this.config.initialCapital
      : 0;

    const tradingDays = this.equityCurve.length > 1
      ? Math.floor(
          (new Date(this.equityCurve[this.equityCurve.length - 1].date).getTime() -
            new Date(this.equityCurve[0].date).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 1;
    const years = tradingDays / 365;
    const annualizedReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : totalReturn;

    const maxDrawdown = this.equityCurve.length > 0
      ? Math.max(...this.equityCurve.map(p => p.drawdownPercent))
      : 0;

    const maxDrawdownDuration = calculateMaxDrawdownDuration(this.equityCurve);

    const winningTrades = this.trades.filter(t => t.pnl > 0);
    const losingTrades = this.trades.filter(t => t.pnl <= 0);
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length)
      : 0;

    const streaks = calculateConsecutiveStreaks(this.trades);

    return {
      totalReturn,
      annualizedReturn,
      volatility: returns.length > 1
        ? Math.sqrt(returns.reduce((s, r) => s + (r - returns.reduce((a, b) => a + b, 0) / returns.length) ** 2, 0) / (returns.length - 1)) * Math.sqrt(252)
        : 0,
      sharpeRatio: calculateSharpeRatio(returns, this.config.riskFreeRate),
      sortinoRatio: calculateSortinoRatio(returns, this.config.riskFreeRate),
      calmarRatio: calculateCalmarRatio(annualizedReturn, maxDrawdown),
      maxDrawdown,
      maxDrawdownDuration,
      winRate: calculateWinRate(this.trades),
      profitFactor: calculateProfitFactor(this.trades),
      avgWin,
      avgLoss,
      avgWinLossRatio: avgLoss > 0 ? avgWin / avgLoss : Infinity,
      expectancy: calculateExpectancy(this.trades),
      totalTrades: this.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      longTrades: this.trades.filter(t => t.direction === 'long').length,
      shortTrades: this.trades.filter(t => t.direction === 'short').length,
      avgHoldingDays: this.trades.reduce((s, t) => s + t.holdingDays, 0) / this.trades.length,
      maxConsecutiveWins: streaks.maxWins,
      maxConsecutiveLosses: streaks.maxLosses,
      recoveryFactor: calculateRecoveryFactor(totalReturn, maxDrawdown),
      payoffRatio: avgLoss > 0 ? avgWin / avgLoss : Infinity,
      riskRewardRatio: avgLoss > 0 ? avgWin / avgLoss : 0,
      ulcerIndex: calculateUlcerIndex(this.equityCurve),
      kappa: calculateKappa(returns),
      omegaRatio: calculateOmegaRatio(returns),
      tailRatio: calculateTailRatio(returns),
      cvar: calculateCVaR(returns),
      bestTrade: Math.max(...this.trades.map(t => t.pnlPercent), 0),
      worstTrade: Math.min(...this.trades.map(t => t.pnlPercent), 0),
      bestMonth: '',
      worstMonth: '',
      profitPerDay: tradingDays > 0 ? (this.equityCurve[this.equityCurve.length - 1]?.equity - this.config.initialCapital) / tradingDays : 0,
      exposureTime: this.trades.reduce((s, t) => s + t.holdingDays, 0) / Math.max(tradingDays, 1),
      annualTurnover: years > 0 ? this.trades.length / years : this.trades.length,
    };
  }

  getMonthlyReturns(): MonthlyReturns[] {
    return groupTradesByMonth(this.trades);
  }

  getTradeDistribution(): TradeDistribution {
    return calculateTradeDistribution(this.trades);
  }

  getEquityCurve(): EquityPoint[] {
    return this.equityCurve;
  }

  getDrawdownPeriods(): DrawdownPeriod[] {
    const periods: DrawdownPeriod[] = [];
    let inDrawdown = false;
    let peak = this.equityCurve[0]?.equity ?? 0;
    let peakDate = this.equityCurve[0]?.date ?? '';
    let maxDd = 0;

    for (const point of this.equityCurve) {
      if (point.equity > peak) {
        if (inDrawdown) {
          periods.push({
            startDate: peakDate,
            endDate: point.date,
            recoveryDate: point.date,
            maxDrawdown: maxDd,
            duration: Math.floor(
              (new Date(point.date).getTime() - new Date(peakDate).getTime()) / (1000 * 60 * 60 * 24)
            ),
            recoveryDuration: 0,
          });
          inDrawdown = false;
          maxDd = 0;
        }
        peak = point.equity;
        peakDate = point.date;
      } else {
        inDrawdown = true;
        maxDd = Math.max(maxDd, point.drawdownPercent);
      }
    }

    return periods;
  }

  compareWithBenchmark(benchmarkReturns: number[]): {
    alpha: number;
    beta: number;
    informationRatio: number;
    trackingError: number;
  } {
    const returns = this.trades.map(t => t.pnlPercent / 100);
    const n = Math.min(returns.length, benchmarkReturns.length);

    if (n < 2) {
      return { alpha: 0, beta: 1, informationRatio: 0, trackingError: 0 };
    }

    const portReturns = returns.slice(0, n);
    const benchReturns = benchmarkReturns.slice(0, n);

    const meanPort = portReturns.reduce((a, b) => a + b, 0) / n;
    const meanBench = benchReturns.reduce((a, b) => a + b, 0) / n;

    let cov = 0;
    let benchVar = 0;
    for (let i = 0; i < n; i++) {
      cov += (portReturns[i] - meanPort) * (benchReturns[i] - meanBench);
      benchVar += (benchReturns[i] - meanBench) ** 2;
    }
    cov /= n - 1;
    benchVar /= n - 1;

    const beta = benchVar === 0 ? 1 : cov / benchVar;
    const alpha = meanPort - beta * meanBench;

    const excessReturns = portReturns.map((r, i) => r - benchReturns[i]);
    const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / n;
    const trackingError = Math.sqrt(
      excessReturns.reduce((s, r) => s + (r - meanExcess) ** 2, 0) / (n - 1)
    );
    const informationRatio = trackingError === 0 ? 0 : meanExcess / trackingError;

    return { alpha: alpha * 252, beta, informationRatio, trackingError: trackingError * Math.sqrt(252) };
  }

  private getEmptyMetrics(): BacktestMetrics {
    return {
      totalReturn: 0, annualizedReturn: 0, volatility: 0, sharpeRatio: 0, sortinoRatio: 0,
      calmarRatio: 0, maxDrawdown: 0, maxDrawdownDuration: 0, winRate: 0, profitFactor: 0,
      avgWin: 0, avgLoss: 0, avgWinLossRatio: 0, expectancy: 0, totalTrades: 0,
      winningTrades: 0, losingTrades: 0, longTrades: 0, shortTrades: 0, avgHoldingDays: 0,
      maxConsecutiveWins: 0, maxConsecutiveLosses: 0, recoveryFactor: 0, payoffRatio: 0,
      riskRewardRatio: 0, ulcerIndex: 0, kappa: 0, omegaRatio: 0, tailRatio: 0, cvar: 0,
      bestTrade: 0, worstTrade: 0, bestMonth: '', worstMonth: '', profitPerDay: 0,
      exposureTime: 0, annualTurnover: 0,
    };
  }
}
