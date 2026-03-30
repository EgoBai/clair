/**
 * 回测绩效分析引擎
 * 深度分析策略回测绩效，包括风险调整收益、胜率分布、持仓分析等
 */

// ==================== 类型定义 ====================

export interface TradeRecord {
  date: string;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  commission: number;
  reason: string;
}

export interface DailySnapshot {
  date: string;
  cash: number;
  position: number;
  positionValue: number;
  totalValue: number;
  returns: number;
  dailyReturns: number;
}

export interface PerformanceMetrics {
  // 收益指标
  totalReturn: number;
  annualizedReturn: number;
  cagr: number;  // 复合年化增长率
  benchmarkReturn: number;
  excessReturn: number;  // 超额收益

  // 风险指标
  maxDrawdown: number;
  maxDrawdownDuration: number; // 最大回撤持续天数
  avgDrawdown: number;
  volatility: number;
  downsideVolatility: number;

  // 风险调整收益
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;  // 年化收益/最大回撤
  informationRatio: number;
  treynorRatio: number;
  omegaRatio: number;

  // 交易指标
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
  maxLoss: number;
  profitFactor: number;
  expectancy: number;  // 期望值
  payoffRatio: number; // 平均盈亏比

  // 持仓指标
  avgHoldingDays: number;
  maxHoldingDays: number;
  minHoldingDays: number;
  turnoverRate: number; // 换手率

  // 时间指标
  profitableDays: number;
  losingDays: number;
  flatDays: number;
  bestDay: number;
  worstDay: number;
  avgDailyReturn: number;
}

export interface HoldingPeriod {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  holdingDays: number;
}

export interface MonthlyReturns {
  year: number;
  month: number;
  return: number;
}

export interface DrawdownPeriod {
  startDate: string;
  endDate: string;
  peakDate: string;
  troughDate: string;
  drawdown: number;
  duration: number;
  recovery: number;
}

export interface RollingMetrics {
  date: string;
  rollingReturn: number;
  rollingVolatility: number;
  rollingSharpe: number;
  rollingMaxDrawdown: number;
}

// ==================== 绩效分析器 ====================

export class PerformanceAnalyzer {
  private dailySnapshots: DailySnapshot[];
  private trades: TradeRecord[];
  private riskFreeRate: number;

  constructor(
    dailySnapshots: DailySnapshot[],
    trades: TradeRecord[],
    riskFreeRate: number = 0.03 // 默认年化3%
  ) {
    this.dailySnapshots = [...dailySnapshots].sort((a, b) => a.date.localeCompare(b.date));
    this.trades = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    this.riskFreeRate = riskFreeRate;
  }

  /** 计算完整绩效指标 */
  calculateMetrics(benchmarkReturns?: number[]): PerformanceMetrics {
    const dailyReturns = this.dailySnapshots.map(s => s.dailyReturns);
    const totalDays = this.dailySnapshots.length;

    // 收益指标
    const initialCapital = this.dailySnapshots[0]?.totalValue || 0;
    const finalValue = this.dailySnapshots[totalDays - 1]?.totalValue || 0;
    const totalReturn = initialCapital > 0 ? ((finalValue - initialCapital) / initialCapital) * 100 : 0;
    const years = totalDays / 252;
    const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : 0;
    const cagr = annualizedReturn;
    const benchmarkReturn = benchmarkReturns
      ? this.calcBenchmarkReturn(benchmarkReturns)
      : this.calcBuyHoldReturn();
    const excessReturn = totalReturn - benchmarkReturn;

    // 风险指标
    const { maxDrawdown, maxDrawdownDuration, avgDrawdown, drawdowns } = this.calcDrawdownMetrics();
    const volatility = this.calcVolatility(dailyReturns);
    const downsideVolatility = this.calcDownsideVolatility(dailyReturns);

    // 风险调整收益
    const sharpeRatio = this.calcSharpe(annualizedReturn, volatility);
    const sortinoRatio = this.calcSortino(annualizedReturn, downsideVolatility);
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;
    const informationRatio = volatility > 0 ? excessReturn / volatility : 0;
    const treynorRatio = this.calcTreynor(annualizedReturn, dailyReturns);
    const omegaRatio = this.calcOmega(dailyReturns);

    // 交易指标
    const tradeMetrics = this.calcTradeMetrics();

    // 持仓指标
    const holdingMetrics = this.calcHoldingMetrics();

    // 时间指标
    const timeMetrics = this.calcTimeMetrics(dailyReturns);

    return {
      totalReturn: this.round2(totalReturn),
      annualizedReturn: this.round2(annualizedReturn),
      cagr: this.round2(cagr),
      benchmarkReturn: this.round2(benchmarkReturn),
      excessReturn: this.round2(excessReturn),
      maxDrawdown: this.round2(maxDrawdown),
      maxDrawdownDuration,
      avgDrawdown: this.round2(avgDrawdown),
      volatility: this.round2(volatility),
      downsideVolatility: this.round2(downsideVolatility),
      sharpeRatio: this.round2(sharpeRatio),
      sortinoRatio: this.round2(sortinoRatio),
      calmarRatio: this.round2(calmarRatio),
      informationRatio: this.round2(informationRatio),
      treynorRatio: this.round2(treynorRatio),
      omegaRatio: this.round2(omegaRatio),
      ...tradeMetrics,
      ...holdingMetrics,
      ...timeMetrics,
    };
  }

  /** 计算回撤指标 */
  private calcDrawdownMetrics() {
    const values = this.dailySnapshots.map(s => s.totalValue);
    if (values.length === 0) {
      return { maxDrawdown: 0, maxDrawdownDuration: 0, avgDrawdown: 0, drawdowns: [] as DrawdownPeriod[] };
    }

    let peak = values[0];
    const drawdowns: DrawdownPeriod[] = [];
    let currentDrawdownStart: string | null = null;
    let currentPeakDate = this.dailySnapshots[0].date;
    let maxDrawdown = 0;
    let maxDrawdownDuration = 0;
    let currentDuration = 0;
    const allDrawdowns: number[] = [];

    for (let i = 0; i < values.length; i++) {
      if (values[i] > peak) {
        if (currentDrawdownStart) {
          // 回撤结束
          const dd = ((peak - values[i]) / peak) * 100;
          drawdowns.push({
            startDate: currentPeakDate,
            endDate: this.dailySnapshots[i].date,
            peakDate: currentPeakDate,
            troughDate: this.dailySnapshots[i - 1]?.date || currentPeakDate,
            drawdown: Math.abs(dd),
            duration: currentDuration,
            recovery: i - Math.max(0, this.findPeakIndex(values, currentPeakDate)),
          });
          currentDrawdownStart = null;
        }
        peak = values[i];
        currentPeakDate = this.dailySnapshots[i].date;
        currentDuration = 0;
      } else {
        if (!currentDrawdownStart) {
          currentDrawdownStart = this.dailySnapshots[i].date;
        }
        currentDuration++;
        const dd = ((peak - values[i]) / peak) * 100;
        allDrawdowns.push(dd);
        if (dd > maxDrawdown) {
          maxDrawdown = dd;
          maxDrawdownDuration = currentDuration;
        }
      }
    }

    const avgDrawdown = allDrawdowns.length > 0
      ? allDrawdowns.reduce((s, d) => s + d, 0) / allDrawdowns.length
      : 0;

    return { maxDrawdown, maxDrawdownDuration, avgDrawdown, drawdowns };
  }

  /** 计算波动率 */
  private calcVolatility(dailyReturns: number[]): number {
    if (dailyReturns.length < 2) return 0;
    const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252) * 100; // 年化
  }

  /** 计算下行波动率 */
  private calcDownsideVolatility(dailyReturns: number[]): number {
    const dailyRf = this.riskFreeRate / 252;
    const downside = dailyReturns.filter(r => r < dailyRf);
    if (downside.length < 2) return 0;
    const variance = downside.reduce((s, r) => s + Math.pow(r - dailyRf, 2), 0) / downside.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  /** 夏普比率 */
  private calcSharpe(annualizedReturn: number, volatility: number): number {
    return volatility > 0 ? (annualizedReturn - this.riskFreeRate * 100) / volatility : 0;
  }

  /** 索提诺比率 */
  private calcSortino(annualizedReturn: number, downsideVolatility: number): number {
    return downsideVolatility > 0 ? (annualizedReturn - this.riskFreeRate * 100) / downsideVolatility : 0;
  }

  /** 特雷诺比率 */
  private calcTreynor(annualizedReturn: number, dailyReturns: number[]): number {
    const beta = this.calcBeta(dailyReturns);
    return beta !== 0 ? (annualizedReturn - this.riskFreeRate * 100) / beta : 0;
  }

  /** Beta (假设市场日收益均值为0.03%) */
  private calcBeta(dailyReturns: number[]): number {
    if (dailyReturns.length < 2) return 1;
    const marketReturn = 0.0003; // 简化
    const meanPortfolio = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
    let covariance = 0;
    let marketVariance = 0;
    for (const r of dailyReturns) {
      covariance += (r - meanPortfolio) * (marketReturn - 0.0003);
      marketVariance += Math.pow(marketReturn - 0.0003, 2);
    }
    covariance /= dailyReturns.length - 1;
    marketVariance /= dailyReturns.length - 1;
    return marketVariance > 0 ? covariance / marketVariance : 1;
  }

  /** Omega比率 */
  private calcOmega(dailyReturns: number[], threshold: number = 0): number {
    let gains = 0, losses = 0;
    for (const r of dailyReturns) {
      if (r > threshold) gains += r - threshold;
      else losses += threshold - r;
    }
    return losses > 0 ? gains / losses : gains > 0 ? Infinity : 1;
  }

  /** 买入持有基准收益 */
  private calcBuyHoldReturn(): number {
    if (this.dailySnapshots.length < 2) return 0;
    const first = this.dailySnapshots[0];
    const last = this.dailySnapshots[this.dailySnapshots.length - 1];
    const prices = this.dailySnapshots.map(s => s.positionValue / Math.max(s.position, 1));
    if (prices[0] === 0) return 0;
    return ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
  }

  /** 基准收益计算 */
  private calcBenchmarkReturn(benchmarkReturns: number[]): number {
    let cumulative = 1;
    for (const r of benchmarkReturns) {
      cumulative *= (1 + r);
    }
    return (cumulative - 1) * 100;
  }

  /** 交易指标 */
  private calcTradeMetrics() {
    const buyTrades = this.trades.filter(t => t.type === 'buy');
    const sellTrades = this.trades.filter(t => t.type === 'sell');
    const totalTrades = Math.min(buyTrades.length, sellTrades.length);

    if (totalTrades === 0) {
      return {
        totalTrades: 0, winningTrades: 0, losingTrades: 0,
        winRate: 0, avgWin: 0, avgLoss: 0, maxWin: 0, maxLoss: 0,
        profitFactor: 0, expectancy: 0, payoffRatio: 0,
      };
    }

    const pnls: number[] = [];
    for (let i = 0; i < totalTrades; i++) {
      const buy = buyTrades[i];
      const sell = sellTrades[i];
      const pnl = (sell.price - buy.price) * buy.quantity - buy.commission - sell.commission;
      pnls.push(pnl);
    }

    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p <= 0);
    const winningTrades = wins.length;
    const losingTrades = losses.length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, w) => s + w, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, l) => s + l, 0) / losses.length) : 0;
    const maxWin = wins.length > 0 ? Math.max(...wins) : 0;
    const maxLoss = losses.length > 0 ? Math.abs(Math.min(...losses)) : 0;
    const totalWin = wins.reduce((s, w) => s + w, 0);
    const totalLossAbs = Math.abs(losses.reduce((s, l) => s + l, 0));
    const profitFactor = totalLossAbs > 0 ? totalWin / totalLossAbs : totalWin > 0 ? Infinity : 0;
    const expectancy = totalTrades > 0 ? pnls.reduce((s, p) => s + p, 0) / totalTrades : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    return {
      totalTrades, winningTrades, losingTrades,
      winRate: this.round2(winRate),
      avgWin: this.round2(avgWin),
      avgLoss: this.round2(avgLoss),
      maxWin: this.round2(maxWin),
      maxLoss: this.round2(maxLoss),
      profitFactor: this.round2(profitFactor),
      expectancy: this.round2(expectancy),
      payoffRatio: this.round2(payoffRatio),
    };
  }

  /** 持仓周期分析 */
  private calcHoldingMetrics() {
    const periods = this.extractHoldingPeriods();
    if (periods.length === 0) {
      return { avgHoldingDays: 0, maxHoldingDays: 0, minHoldingDays: 0, turnoverRate: 0 };
    }
    const days = periods.map(p => p.holdingDays);
    const avgHoldingDays = days.reduce((s, d) => s + d, 0) / days.length;
    const maxHoldingDays = Math.max(...days);
    const minHoldingDays = Math.min(...days);

    // 换手率 = 交易次数 / 平均持仓天数
    const turnoverRate = avgHoldingDays > 0 ? (this.trades.length / this.dailySnapshots.length) * 100 : 0;

    return {
      avgHoldingDays: this.round2(avgHoldingDays),
      maxHoldingDays,
      minHoldingDays,
      turnoverRate: this.round2(turnoverRate),
    };
  }

  /** 提取持仓周期 */
  extractHoldingPeriods(): HoldingPeriod[] {
    const periods: HoldingPeriod[] = [];
    const buyTrades = this.trades.filter(t => t.type === 'buy');
    const sellTrades = this.trades.filter(t => t.type === 'sell');

    for (let i = 0; i < Math.min(buyTrades.length, sellTrades.length); i++) {
      const buy = buyTrades[i];
      const sell = sellTrades[i];
      const entryIdx = this.dailySnapshots.findIndex(s => s.date === buy.date);
      const exitIdx = this.dailySnapshots.findIndex(s => s.date === sell.date);
      const holdingDays = exitIdx >= 0 && entryIdx >= 0 ? exitIdx - entryIdx : 0;
      const pnl = (sell.price - buy.price) * buy.quantity - buy.commission - sell.commission;
      const pnlPercent = buy.price > 0 ? ((sell.price - buy.price) / buy.price) * 100 : 0;

      periods.push({
        entryDate: buy.date,
        exitDate: sell.date,
        entryPrice: buy.price,
        exitPrice: sell.price,
        quantity: buy.quantity,
        pnl: this.round2(pnl),
        pnlPercent: this.round2(pnlPercent),
        holdingDays,
      });
    }
    return periods;
  }

  /** 日收益指标 */
  private calcTimeMetrics(dailyReturns: number[]) {
    if (dailyReturns.length === 0) {
      return {
        profitableDays: 0, losingDays: 0, flatDays: 0,
        bestDay: 0, worstDay: 0, avgDailyReturn: 0,
      };
    }
    const profitableDays = dailyReturns.filter(r => r > 0).length;
    const losingDays = dailyReturns.filter(r => r < 0).length;
    const flatDays = dailyReturns.filter(r => r === 0).length;
    const bestDay = Math.max(...dailyReturns) * 100;
    const worstDay = Math.min(...dailyReturns) * 100;
    const avgDailyReturn = (dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length) * 100;

    return {
      profitableDays, losingDays, flatDays,
      bestDay: this.round2(bestDay),
      worstDay: this.round2(worstDay),
      avgDailyReturn: this.round4(avgDailyReturn),
    };
  }

  /** 月度收益矩阵 */
  calculateMonthlyReturns(): MonthlyReturns[] {
    const monthly: MonthlyReturns[] = [];
    const grouped = new Map<string, DailySnapshot[]>();

    for (const snap of this.dailySnapshots) {
      const key = snap.date.substring(0, 7); // YYYY-MM
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(snap);
    }

    for (const [key, snaps] of grouped) {
      const [year, month] = key.split('-').map(Number);
      const firstReturn = snaps[0].returns;
      const lastReturn = snaps[snaps.length - 1].returns;
      const monthReturn = lastReturn - firstReturn;
      monthly.push({ year, month, return: this.round2(monthReturn) });
    }

    return monthly.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  }

  /** 回撤区间列表 */
  calculateDrawdownPeriods(): DrawdownPeriod[] {
    const { drawdowns } = this.calcDrawdownMetrics();
    return drawdowns;
  }

  /** 滚动指标 */
  calculateRollingMetrics(windowDays: number = 30): RollingMetrics[] {
    const results: RollingMetrics[] = [];
    const dailyReturns = this.dailySnapshots.map(s => s.dailyReturns);

    for (let i = windowDays; i < this.dailySnapshots.length; i++) {
      const window = dailyReturns.slice(i - windowDays, i);
      const cumReturn = window.reduce((c, r) => c * (1 + r), 1) - 1;
      const mean = window.reduce((s, r) => s + r, 0) / window.length;
      const variance = window.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (window.length - 1);
      const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
      const sharpe = vol > 0 ? (cumReturn * 252 / windowDays - this.riskFreeRate * 100) / vol : 0;

      // 滚动最大回撤
      let peak = window[0];
      let maxDD = 0;
      for (const r of window) {
        if (r > peak) peak = r;
        const dd = ((peak - r) / peak) * 100;
        if (dd > maxDD) maxDD = dd;
      }

      results.push({
        date: this.dailySnapshots[i].date,
        rollingReturn: this.round2(cumReturn * 100),
        rollingVolatility: this.round2(vol),
        rollingSharpe: this.round2(sharpe),
        rollingMaxDrawdown: this.round2(maxDD),
      });
    }

    return results;
  }

  /** 计算信息比率 (与基准的跟踪误差) */
  calculateTrackingError(benchmarkReturns: number[]): number {
    const portfolioReturns = this.dailySnapshots.map(s => s.dailyReturns);
    const minLength = Math.min(portfolioReturns.length, benchmarkReturns.length);
    if (minLength < 2) return 0;

    const diffs: number[] = [];
    for (let i = 0; i < minLength; i++) {
      diffs.push(portfolioReturns[i] - benchmarkReturns[i]);
    }
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    const variance = diffs.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / (diffs.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  /** 绩效评级 */
  calculateRating(metrics: PerformanceMetrics): { score: number; grade: string; breakdown: Record<string, number> } {
    const breakdown: Record<string, number> = {};

    // 收益评分 (0-25)
    breakdown.return = Math.min(25, Math.max(0, (metrics.annualizedReturn + 10) * 1.25));

    // 风险评分 (0-25) - 回撤越小越好
    breakdown.risk = Math.min(25, Math.max(0, (100 - metrics.maxDrawdown) / 4));

    // 夏普评分 (0-25)
    breakdown.sharpe = Math.min(25, Math.max(0, (metrics.sharpeRatio + 1) * 8.33));

    // 胜率评分 (0-25)
    breakdown.winRate = Math.min(25, Math.max(0, metrics.winRate / 4));

    const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
    let grade: string;
    if (score >= 90) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B+';
    else if (score >= 60) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'F';

    return { score: this.round2(score), grade, breakdown };
  }

  private findPeakIndex(values: number[], date: string): number {
    const idx = this.dailySnapshots.findIndex(s => s.date === date);
    return idx >= 0 ? idx : 0;
  }

  private round2(n: number): number { return Math.round(n * 100) / 100; }
  private round4(n: number): number { return Math.round(n * 10000) / 10000; }
}

export function createPerformanceAnalyzer(
  snapshots: DailySnapshot[],
  trades: TradeRecord[],
  riskFreeRate?: number
): PerformanceAnalyzer {
  return new PerformanceAnalyzer(snapshots, trades, riskFreeRate);
}
