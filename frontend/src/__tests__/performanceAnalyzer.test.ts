import { describe, it, expect } from 'vitest';

// ==================== 内联类型 ====================

interface DailySnapshot {
  date: string;
  cash: number;
  position: number;
  positionValue: number;
  totalValue: number;
  returns: number;
  dailyReturns: number;
}

interface TradeRecord {
  date: string;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  commission: number;
  reason: string;
}

// ==================== 绩效分析引擎内联实现 ====================

class PerformanceAnalyzer {
  private dailySnapshots: DailySnapshot[];
  private trades: TradeRecord[];
  private riskFreeRate: number;

  constructor(snapshots: DailySnapshot[], trades: TradeRecord[], riskFreeRate = 0.03) {
    this.dailySnapshots = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    this.trades = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    this.riskFreeRate = riskFreeRate;
  }

  calculateMetrics(benchmarkReturns?: number[]) {
    const dailyReturns = this.dailySnapshots.map(s => s.dailyReturns);
    const totalDays = this.dailySnapshots.length;
    const initialCapital = this.dailySnapshots[0]?.totalValue || 0;
    const finalValue = this.dailySnapshots[totalDays - 1]?.totalValue || 0;
    const totalReturn = initialCapital > 0 ? ((finalValue - initialCapital) / initialCapital) * 100 : 0;
    const years = totalDays / 252;
    const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : 0;
    const benchmarkReturn = benchmarkReturns ? this.calcBenchmarkReturn(benchmarkReturns) : this.calcBuyHoldReturn();
    const excessReturn = totalReturn - benchmarkReturn;
    const { maxDrawdown, maxDrawdownDuration, avgDrawdown } = this.calcDrawdownMetrics();
    const volatility = this.calcVolatility(dailyReturns);
    const downsideVolatility = this.calcDownsideVolatility(dailyReturns);
    const sharpeRatio = volatility > 0 ? (annualizedReturn - this.riskFreeRate * 100) / volatility : 0;
    const sortinoRatio = downsideVolatility > 0 ? (annualizedReturn - this.riskFreeRate * 100) / downsideVolatility : 0;
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;
    const omegaRatio = this.calcOmega(dailyReturns);
    const tradeMetrics = this.calcTradeMetrics();
    const holdingMetrics = this.calcHoldingMetrics();
    const timeMetrics = this.calcTimeMetrics(dailyReturns);
    return {
      totalReturn: this.r2(totalReturn), annualizedReturn: this.r2(annualizedReturn),
      cagr: this.r2(annualizedReturn), benchmarkReturn: this.r2(benchmarkReturn),
      excessReturn: this.r2(excessReturn), maxDrawdown: this.r2(maxDrawdown),
      maxDrawdownDuration, avgDrawdown: this.r2(avgDrawdown),
      volatility: this.r2(volatility), downsideVolatility: this.r2(downsideVolatility),
      sharpeRatio: this.r2(sharpeRatio), sortinoRatio: this.r2(sortinoRatio),
      calmarRatio: this.r2(calmarRatio), omegaRatio: this.r2(omegaRatio),
      ...tradeMetrics, ...holdingMetrics, ...timeMetrics,
    };
  }

  private calcDrawdownMetrics() {
    const values = this.dailySnapshots.map(s => s.totalValue);
    if (values.length === 0) return { maxDrawdown: 0, maxDrawdownDuration: 0, avgDrawdown: 0 };
    let peak = values[0], maxDD = 0, maxDDDuration = 0, curDuration = 0;
    const allDD: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] > peak) { peak = values[i]; curDuration = 0; }
      else { curDuration++; const dd = ((peak - values[i]) / peak) * 100; allDD.push(dd); if (dd > maxDD) { maxDD = dd; maxDDDuration = curDuration; } }
    }
    return { maxDrawdown: maxDD, maxDrawdownDuration: maxDDDuration, avgDrawdown: allDD.length > 0 ? allDD.reduce((s, d) => s + d, 0) / allDD.length : 0 };
  }

  private calcVolatility(dailyReturns: number[]): number {
    if (dailyReturns.length < 2) return 0;
    const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  private calcDownsideVolatility(dailyReturns: number[]): number {
    const dailyRf = this.riskFreeRate / 252;
    const downside = dailyReturns.filter(r => r < dailyRf);
    if (downside.length < 2) return 0;
    const variance = downside.reduce((s, r) => s + Math.pow(r - dailyRf, 2), 0) / downside.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  private calcOmega(dailyReturns: number[], threshold = 0): number {
    let gains = 0, losses = 0;
    for (const r of dailyReturns) { if (r > threshold) gains += r - threshold; else losses += threshold - r; }
    return losses > 0 ? gains / losses : gains > 0 ? Infinity : 1;
  }

  private calcBuyHoldReturn(): number {
    if (this.dailySnapshots.length < 2) return 0;
    const prices = this.dailySnapshots.map(s => s.positionValue / Math.max(s.position, 1));
    return prices[0] > 0 ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100 : 0;
  }

  private calcBenchmarkReturn(returns: number[]): number {
    return returns.reduce((c, r) => c * (1 + r), 1) * 100 - 100;
  }

  private calcTradeMetrics() {
    const buys = this.trades.filter(t => t.type === 'buy');
    const sells = this.trades.filter(t => t.type === 'sell');
    const total = Math.min(buys.length, sells.length);
    if (total === 0) return { totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, avgWin: 0, avgLoss: 0, maxWin: 0, maxLoss: 0, profitFactor: 0, expectancy: 0, payoffRatio: 0 };
    const pnls = [];
    for (let i = 0; i < total; i++) pnls.push((sells[i].price - buys[i].price) * buys[i].quantity - buys[i].commission - sells[i].commission);
    const wins = pnls.filter(p => p > 0), losses = pnls.filter(p => p <= 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, w) => s + w, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, l) => s + l, 0) / losses.length) : 0;
    const totalWin = wins.reduce((s, w) => s + w, 0);
    const totalLossAbs = Math.abs(losses.reduce((s, l) => s + l, 0));
    return {
      totalTrades: total, winningTrades: wins.length, losingTrades: losses.length,
      winRate: this.r2((wins.length / total) * 100), avgWin: this.r2(avgWin), avgLoss: this.r2(avgLoss),
      maxWin: wins.length > 0 ? this.r2(Math.max(...wins)) : 0, maxLoss: losses.length > 0 ? this.r2(Math.abs(Math.min(...losses))) : 0,
      profitFactor: this.r2(totalLossAbs > 0 ? totalWin / totalLossAbs : totalWin > 0 ? Infinity : 0),
      expectancy: this.r2(pnls.reduce((s, p) => s + p, 0) / total),
      payoffRatio: this.r2(avgLoss > 0 ? avgWin / avgLoss : 0),
    };
  }

  private calcHoldingMetrics() {
    const periods = this.extractHoldingPeriods();
    if (periods.length === 0) return { avgHoldingDays: 0, maxHoldingDays: 0, minHoldingDays: 0, turnoverRate: 0 };
    const days = periods.map(p => p.holdingDays);
    return {
      avgHoldingDays: this.r2(days.reduce((s, d) => s + d, 0) / days.length),
      maxHoldingDays: Math.max(...days), minHoldingDays: Math.min(...days),
      turnoverRate: this.r2((this.trades.length / this.dailySnapshots.length) * 100),
    };
  }

  private calcTimeMetrics(dailyReturns: number[]) {
    if (dailyReturns.length === 0) return { profitableDays: 0, losingDays: 0, flatDays: 0, bestDay: 0, worstDay: 0, avgDailyReturn: 0 };
    return {
      profitableDays: dailyReturns.filter(r => r > 0).length, losingDays: dailyReturns.filter(r => r < 0).length, flatDays: dailyReturns.filter(r => r === 0).length,
      bestDay: this.r2(Math.max(...dailyReturns) * 100), worstDay: this.r2(Math.min(...dailyReturns) * 100),
      avgDailyReturn: Math.round((dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length) * 10000) / 10000,
    };
  }

  extractHoldingPeriods() {
    const buys = this.trades.filter(t => t.type === 'buy');
    const sells = this.trades.filter(t => t.type === 'sell');
    return Array.from({ length: Math.min(buys.length, sells.length) }, (_, i) => {
      const buy = buys[i], sell = sells[i];
      const eIdx = this.dailySnapshots.findIndex(s => s.date === buy.date);
      const xIdx = this.dailySnapshots.findIndex(s => s.date === sell.date);
      return {
        entryDate: buy.date, exitDate: sell.date, entryPrice: buy.price, exitPrice: sell.price,
        quantity: buy.quantity, pnl: this.r2((sell.price - buy.price) * buy.quantity - buy.commission - sell.commission),
        pnlPercent: this.r2(buy.price > 0 ? ((sell.price - buy.price) / buy.price) * 100 : 0),
        holdingDays: xIdx >= 0 && eIdx >= 0 ? xIdx - eIdx : 0,
      };
    });
  }

  calculateMonthlyReturns() {
    const grouped = new Map<string, DailySnapshot[]>();
    for (const s of this.dailySnapshots) { const k = s.date.substring(0, 7); if (!grouped.has(k)) grouped.set(k, []); grouped.get(k)!.push(s); }
    return Array.from(grouped.entries()).map(([k, snaps]) => {
      const [y, m] = k.split('-').map(Number);
      return { year: y, month: m, return: this.r2(snaps[snaps.length - 1].returns - snaps[0].returns) };
    }).sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  }

  calculateRollingMetrics(windowDays = 30) {
    const dr = this.dailySnapshots.map(s => s.dailyReturns);
    const results = [];
    for (let i = windowDays; i < this.dailySnapshots.length; i++) {
      const w = dr.slice(i - windowDays, i);
      const cumRet = w.reduce((c, r) => c * (1 + r), 1) - 1;
      const mean = w.reduce((s, r) => s + r, 0) / w.length;
      const vol = Math.sqrt(w.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (w.length - 1)) * Math.sqrt(252) * 100;
      let peak = w[0], maxDD = 0;
      for (const r of w) { if (r > peak) peak = r; const dd = ((peak - r) / peak) * 100; if (dd > maxDD) maxDD = dd; }
      results.push({
        date: this.dailySnapshots[i].date,
        rollingReturn: this.r2(cumRet * 100), rollingVolatility: this.r2(vol),
        rollingSharpe: this.r2(vol > 0 ? (cumRet * 252 / windowDays - this.riskFreeRate * 100) / vol : 0),
        rollingMaxDrawdown: this.r2(maxDD),
      });
    }
    return results;
  }

  calculateTrackingError(benchmarkReturns: number[]): number {
    const pr = this.dailySnapshots.map(s => s.dailyReturns);
    const min = Math.min(pr.length, benchmarkReturns.length);
    if (min < 2) return 0;
    const diffs = Array.from({ length: min }, (_, i) => pr[i] - benchmarkReturns[i]);
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    return Math.sqrt(diffs.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / (diffs.length - 1)) * Math.sqrt(252) * 100;
  }

  calculateRating(metrics: any) {
    const breakdown = {
      return: Math.min(25, Math.max(0, (metrics.annualizedReturn + 10) * 1.25)),
      risk: Math.min(25, Math.max(0, (100 - metrics.maxDrawdown) / 4)),
      sharpe: Math.min(25, Math.max(0, (metrics.sharpeRatio + 1) * 8.33)),
      winRate: Math.min(25, Math.max(0, metrics.winRate / 4)),
    };
    const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
    let grade = 'F';
    if (score >= 90) grade = 'A+'; else if (score >= 80) grade = 'A'; else if (score >= 70) grade = 'B+';
    else if (score >= 60) grade = 'B'; else if (score >= 50) grade = 'C'; else if (score >= 40) grade = 'D';
    return { score: this.r2(score), grade, breakdown };
  }

  private r2(n: number) { return Math.round(n * 100) / 100; }
}

// ==================== 测试数据 ====================

function genSnapshots(count: number, startValue = 100000, trend = 0.001): DailySnapshot[] {
  const snaps: DailySnapshot[] = [];
  let value = startValue;
  const start = new Date('2024-01-01');
  for (let i = 0; i < count; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dr = trend + Math.sin(i * 0.1) * 0.01;
    value *= (1 + dr);
    snaps.push({ date: d.toISOString().split('T')[0], cash: startValue * 0.3, position: 100, positionValue: value * 0.7, totalValue: value, returns: ((value - startValue) / startValue) * 100, dailyReturns: dr });
  }
  return snaps;
}

function genTrades(count: number): TradeRecord[] {
  const trades: TradeRecord[] = [];
  const start = new Date('2024-01-01');
  for (let i = 0; i < count; i++) {
    const bd = new Date(start); bd.setDate(bd.getDate() + i * 10);
    const sd = new Date(bd); sd.setDate(sd.getDate() + 5);
    const bp = 10 + Math.random() * 5, sp = bp * (0.95 + Math.random() * 0.15), q = 100;
    trades.push({ date: bd.toISOString().split('T')[0], type: 'buy', price: bp, quantity: q, amount: bp * q, commission: bp * q * 0.0003, reason: '信号' });
    trades.push({ date: sd.toISOString().split('T')[0], type: 'sell', price: sp, quantity: q, amount: sp * q, commission: sp * q * 0.0003, reason: '信号' });
  }
  return trades;
}

// ==================== 测试 ====================

describe('PerformanceAnalyzer 绩效分析引擎', () => {
  describe('基础初始化', () => {
    it('应正确创建分析器实例', () => {
      const a = new PerformanceAnalyzer([], [], 0.03);
      expect(a).toBeInstanceOf(PerformanceAnalyzer);
    });
    it('空数据应返回零值指标', () => {
      const m = new PerformanceAnalyzer([], []).calculateMetrics();
      expect(m.totalReturn).toBe(0);
      expect(m.annualizedReturn).toBe(0);
      expect(m.maxDrawdown).toBe(0);
      expect(m.totalTrades).toBe(0);
      expect(m.winRate).toBe(0);
    });
    it('应支持自定义无风险利率', () => {
      const m = new PerformanceAnalyzer(genSnapshots(50), [], 0.05).calculateMetrics();
      expect(typeof m.sharpeRatio).toBe('number');
    });
  });

  describe('收益指标', () => {
    const m = new PerformanceAnalyzer(genSnapshots(100, 100000, 0.002), []).calculateMetrics();
    it('总收益率应不为0', () => { expect(m.totalReturn).not.toBe(0); });
    it('年化收益率应为数字', () => { expect(typeof m.annualizedReturn).toBe('number'); });
    it('CAGR应等于年化收益率', () => { expect(m.cagr).toBe(m.annualizedReturn); });
    it('超额收益 = 总收益 - 基准收益', () => { expect(m.excessReturn).toBeCloseTo(m.totalReturn - m.benchmarkReturn, 2); });
  });

  describe('风险指标', () => {
    it('最大回撤>=0', () => { expect(new PerformanceAnalyzer(genSnapshots(100), []).calculateMetrics().maxDrawdown).toBeGreaterThanOrEqual(0); });
    it('波动率>=0', () => { expect(new PerformanceAnalyzer(genSnapshots(100), []).calculateMetrics().volatility).toBeGreaterThanOrEqual(0); });
    it('下行波动率<=总波动率', () => { const m = new PerformanceAnalyzer(genSnapshots(100), []).calculateMetrics(); expect(m.downsideVolatility).toBeLessThanOrEqual(m.volatility + 0.01); });
    it('单日波动率为0', () => { expect(new PerformanceAnalyzer(genSnapshots(1), []).calculateMetrics().volatility).toBe(0); });
    it('最大回撤持续天数>=0', () => { const m = new PerformanceAnalyzer(genSnapshots(100), []).calculateMetrics(); expect(m.maxDrawdownDuration).toBeGreaterThanOrEqual(0); expect(Number.isInteger(m.maxDrawdownDuration)).toBe(true); });
  });

  describe('风险调整收益', () => {
    const m = new PerformanceAnalyzer(genSnapshots(100, 100000, 0.001), [], 0.03).calculateMetrics();
    it('夏普比率有限', () => { expect(isFinite(m.sharpeRatio)).toBe(true); });
    it('索提诺比率有限', () => { expect(isFinite(m.sortinoRatio)).toBe(true); });
    it('Calmar比率正确', () => { if (m.maxDrawdown > 0) expect(m.calmarRatio).toBeCloseTo(m.annualizedReturn / m.maxDrawdown, 2); });
    it('Omega比率>=0', () => { expect(m.omegaRatio).toBeGreaterThanOrEqual(0); });
  });

  describe('交易指标', () => {
    const m = new PerformanceAnalyzer(genSnapshots(200), genTrades(10)).calculateMetrics();
    it('交易次数正确', () => { expect(m.totalTrades).toBe(10); });
    it('胜率在0-100之间', () => { expect(m.winRate).toBeGreaterThanOrEqual(0); expect(m.winRate).toBeLessThanOrEqual(100); });
    it('胜+负=总', () => { expect(m.winningTrades + m.losingTrades).toBe(m.totalTrades); });
    it('盈亏比>=0', () => { expect(m.profitFactor).toBeGreaterThanOrEqual(0); });
    it('期望值有限', () => { expect(isFinite(m.expectancy)).toBe(true); });
    it('平均盈利>=0', () => { expect(m.avgWin).toBeGreaterThanOrEqual(0); });
    it('平均亏损>=0', () => { expect(m.avgLoss).toBeGreaterThanOrEqual(0); });
  });

  describe('持仓指标', () => {
    const m = new PerformanceAnalyzer(genSnapshots(200), genTrades(5)).calculateMetrics();
    it('平均持仓天数>=0', () => { expect(m.avgHoldingDays).toBeGreaterThanOrEqual(0); });
    it('最大>=平均', () => { expect(m.maxHoldingDays).toBeGreaterThanOrEqual(m.avgHoldingDays); });
    it('最小<=平均', () => { expect(m.minHoldingDays).toBeLessThanOrEqual(m.avgHoldingDays); });
    it('换手率>=0', () => { expect(m.turnoverRate).toBeGreaterThanOrEqual(0); });
  });

  describe('时间指标', () => {
    const snaps = genSnapshots(100);
    const m = new PerformanceAnalyzer(snaps, []).calculateMetrics();
    it('天数之和正确', () => { expect(m.profitableDays + m.losingDays + m.flatDays).toBe(snaps.length); });
    it('最佳>=最差', () => { expect(m.bestDay).toBeGreaterThanOrEqual(m.worstDay); });
    it('平均日收益有限', () => { expect(isFinite(m.avgDailyReturn)).toBe(true); });
  });

  describe('月度收益', () => {
    it('返回月度数组', () => {
      const monthly = new PerformanceAnalyzer(genSnapshots(100), []).calculateMonthlyReturns();
      expect(Array.isArray(monthly)).toBe(true);
      expect(monthly.length).toBeGreaterThan(0);
      for (const m of monthly) { expect(m.year).toBeGreaterThan(2000); expect(m.month).toBeGreaterThanOrEqual(1); expect(m.month).toBeLessThanOrEqual(12); }
    });
  });

  describe('持仓周期提取', () => {
    it('正确提取周期', () => {
      const periods = new PerformanceAnalyzer(genSnapshots(200), genTrades(5)).extractHoldingPeriods();
      expect(periods.length).toBe(5);
      for (const p of periods) { expect(p.entryDate).toBeDefined(); expect(p.exitDate).toBeDefined(); expect(p.entryPrice).toBeGreaterThan(0); expect(p.exitPrice).toBeGreaterThan(0); expect(p.holdingDays).toBeGreaterThanOrEqual(0); }
    });
    it('无交易返回空数组', () => { expect(new PerformanceAnalyzer(genSnapshots(50), []).extractHoldingPeriods()).toEqual([]); });
  });

  describe('滚动指标', () => {
    it('返回正确数量', () => {
      const snaps = genSnapshots(100);
      const rolling = new PerformanceAnalyzer(snaps, []).calculateRollingMetrics(30);
      expect(rolling.length).toBe(snaps.length - 30);
      for (const r of rolling) { expect(r.date).toBeDefined(); expect(typeof r.rollingReturn).toBe('number'); expect(typeof r.rollingVolatility).toBe('number'); }
    });
    it('不同窗口返回不同数量', () => {
      const a = new PerformanceAnalyzer(genSnapshots(100), []);
      expect(a.calculateRollingMetrics(20).length).toBeGreaterThan(a.calculateRollingMetrics(50).length);
    });
  });

  describe('跟踪误差', () => {
    it('正确计算', () => { expect(new PerformanceAnalyzer(genSnapshots(100), []).calculateTrackingError(Array(100).fill(0.0003))).toBeGreaterThanOrEqual(0); });
    it('数据不足返回0', () => { expect(new PerformanceAnalyzer([], []).calculateTrackingError([])).toBe(0); });
  });

  describe('绩效评级', () => {
    it('返回评分和等级', () => {
      const a = new PerformanceAnalyzer(genSnapshots(100, 100000, 0.002), []);
      const m = a.calculateMetrics(), r = a.calculateRating(m);
      expect(r.score).toBeGreaterThanOrEqual(0); expect(r.score).toBeLessThanOrEqual(100);
      expect(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']).toContain(r.grade);
    });
    it('差策略低评级', () => {
      const a = new PerformanceAnalyzer(genSnapshots(100, 100000, -0.003), []);
      const r = a.calculateRating(a.calculateMetrics());
      expect(r.score).toBeLessThan(60);
    });
  });

  describe('乱序数据', () => {
    it('应处理乱序', () => {
      const snaps = genSnapshots(50).reverse();
      expect(new PerformanceAnalyzer(snaps, []).calculateMetrics().totalReturn).toBeDefined();
    });
  });
});
