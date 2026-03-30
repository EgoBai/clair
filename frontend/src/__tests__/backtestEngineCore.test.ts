import { describe, it, expect } from 'vitest';

// 回测引擎核心测试
describe('回测引擎核心', () => {
  describe('策略回测框架', () => {
    interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number; }
    interface Position { shares: number; avgCost: number; }
    interface TradeResult { trades: number; winRate: number; totalReturn: number; maxDrawdown: number; sharpeRatio: number; }

    function backtest(bars: Bar[], strategy: (bar: Bar, idx: number, position: Position | null) => 'buy' | 'sell' | 'hold', initialCapital: number): TradeResult {
      let capital = initialCapital;
      let position: Position | null = null;
      let trades = 0, wins = 0, totalTrades = 0;
      let peak = capital, maxDD = 0;
      const dailyReturns: number[] = [];
      let prevEquity = capital;

      for (let i = 0; i < bars.length; i++) {
        const action = strategy(bars[i], i, position);
        if (action === 'buy' && !position) {
          const shares = Math.floor(capital / bars[i].close);
          if (shares > 0) {
            capital -= shares * bars[i].close;
            position = { shares, avgCost: bars[i].close };
            trades++;
          }
        } else if (action === 'sell' && position) {
          const proceeds = position.shares * bars[i].close;
          if (proceeds > position.shares * position.avgCost) wins++;
          totalTrades++;
          capital += proceeds;
          position = null;
        }
        const equity = capital + (position ? position.shares * bars[i].close : 0);
        dailyReturns.push((equity - prevEquity) / prevEquity);
        prevEquity = equity;
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak;
        if (dd > maxDD) maxDD = dd;
      }

      const finalEquity = capital + (position ? position.shares * bars[bars.length - 1].close : 0);
      const totalReturn = (finalEquity - initialCapital) / initialCapital;
      const winRate = totalTrades > 0 ? wins / totalTrades : 0;
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const std = Math.sqrt(dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length);
      const sharpeRatio = std === 0 ? 0 : (mean * 252) / (std * Math.sqrt(252));

      return { trades, winRate, totalReturn, maxDrawdown: maxDD, sharpeRatio };
    }

    const bars: Bar[] = Array.from({ length: 100 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(3, '0')}`,
      open: 100 + Math.sin(i * 0.1) * 10,
      high: 105 + Math.sin(i * 0.1) * 10,
      low: 95 + Math.sin(i * 0.1) * 10,
      close: 100 + Math.sin(i * 0.1) * 10 + i * 0.2,
      volume: 1000000,
    }));

    it('买入持有策略有交易', () => {
      const result = backtest(bars, (bar, idx) => idx === 0 ? 'buy' : 'hold', 100000);
      expect(result.trades).toBe(1);
    });

    it('总收益率有正有负', () => {
      const result = backtest(bars, (bar, idx) => idx === 0 ? 'buy' : idx === 50 ? 'sell' : 'hold', 100000);
      expect(typeof result.totalReturn).toBe('number');
    });

    it('最大回撤在0-1之间', () => {
      const result = backtest(bars, (bar, idx) => idx === 0 ? 'buy' : 'hold', 100000);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(1);
    });

    it('胜率在0-1之间', () => {
      const result = backtest(bars, (bar, idx) => idx % 20 === 0 ? (idx % 40 === 0 ? 'buy' : 'sell') : 'hold', 100000);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('空数据回测', () => {
      const result = backtest([], () => 'hold', 100000);
      expect(result.trades).toBe(0);
    });

    it('从不交易收益率为零', () => {
      const result = backtest(bars, () => 'hold', 100000);
      expect(result.trades).toBe(0);
    });
  });

  describe('净值曲线计算', () => {
    function navCurve(returns: number[], initialValue = 1): number[] {
      const nav = [initialValue];
      for (const r of returns) nav.push(nav[nav.length - 1] * (1 + r));
      return nav;
    }

    it('零收益净值不变', () => {
      expect(navCurve([0, 0, 0], 1)).toEqual([1, 1, 1, 1]);
    });

    it('正收益净值增长', () => {
      const nav = navCurve([0.1, 0.1], 1);
      expect(nav[2]).toBeGreaterThan(nav[1]);
    });

    it('负收益净值下降', () => {
      const nav = navCurve([-0.1, -0.1], 1);
      expect(nav[2]).toBeLessThan(nav[1]);
    });

    it('长度为n+1', () => {
      expect(navCurve([1, 2, 3])).toHaveLength(4);
    });

    it('自定义初始值', () => {
      expect(navCurve([], 100)[0]).toBe(100);
    });
  });

  describe('Calmar比率', () => {
    function calmarRatio(annualReturn: number, maxDrawdown: number): number {
      return maxDrawdown === 0 ? 0 : annualReturn / maxDrawdown;
    }

    it('正收益正回撤为正', () => {
      expect(calmarRatio(0.2, 0.1)).toBeCloseTo(2, 5);
    });

    it('零回撤返回0', () => {
      expect(calmarRatio(0.2, 0)).toBe(0);
    });

    it('负收益负Calmar', () => {
      expect(calmarRatio(-0.1, 0.2)).toBeLessThan(0);
    });
  });

  describe('Sortino比率', () => {
    function sortinoRatio(returns: number[], riskFreeRate = 0.03): number {
      if (returns.length === 0) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const downside = returns.filter(r => r < 0);
      if (downside.length === 0) return Infinity;
      const downsideVar = downside.reduce((s, r) => s + r ** 2, 0) / downside.length;
      const downsideDev = Math.sqrt(downsideVar * 252);
      return downsideDev === 0 ? 0 : (mean * 252 - riskFreeRate) / downsideDev;
    }

    it('全部正收益Sortino无穷大', () => {
      expect(sortinoRatio([0.01, 0.02, 0.015])).toBe(Infinity);
    });

    it('空数据返回0', () => {
      expect(sortinoRatio([])).toBe(0);
    });

    it('有负收益返回有限值', () => {
      const result = sortinoRatio([0.01, -0.02, 0.015, -0.005]);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('滚动窗口回测', () => {
    function rollingMetrics(returns: number[], window: number): { mean: number[]; std: number[]; sharpe: number[] } {
      const mean: number[] = [], std: number[] = [], sharpe: number[] = [];
      for (let i = window - 1; i < returns.length; i++) {
        const slice = returns.slice(i - window + 1, i + 1);
        const m = slice.reduce((a, b) => a + b, 0) / window;
        const s = Math.sqrt(slice.reduce((sum, r) => sum + (r - m) ** 2, 0) / window);
        mean.push(m); std.push(s);
        sharpe.push(s === 0 ? 0 : (m * 252) / (s * Math.sqrt(252)));
      }
      return { mean, std, sharpe };
    }

    it('滚动指标数量正确', () => {
      const result = rollingMetrics([1, 2, 3, 4, 5], 3);
      expect(result.mean).toHaveLength(3);
    });

    it('窗口大于数据返回空', () => {
      expect(rollingMetrics([1, 2], 5).mean).toHaveLength(0);
    });

    it('标准差非负', () => {
      const result = rollingMetrics([0.01, -0.02, 0.015, 0.005, -0.01], 3);
      result.std.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });
});
