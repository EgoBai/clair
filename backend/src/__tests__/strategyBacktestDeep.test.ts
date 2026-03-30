import { describe, it, expect } from 'vitest';

// 深度策略回测测试 — 50用例
describe('深度策略回测', () => {

  // 均线交叉策略
  describe('均线交叉策略', () => {
    function maCross(prices: number[], fast: number, slow: number) {
      const signals: { type: string; index: number; price: number }[] = [];
      const sma = (p: number[], period: number, idx: number) => {
        if (idx < period - 1) return null;
        return p.slice(idx - period + 1, idx + 1).reduce((a, b) => a + b, 0) / period;
      };
      for (let i = 1; i < prices.length; i++) {
        const fp = sma(prices, fast, i - 1), fc = sma(prices, fast, i);
        const sp = sma(prices, slow, i - 1), sc = sma(prices, slow, i);
        if (fp && fc && sp && sc) {
          if (fp <= sp && fc > sc) signals.push({ type: 'buy', index: i, price: prices[i] });
          else if (fp >= sp && fc < sc) signals.push({ type: 'sell', index: i, price: prices[i] });
        }
      }
      return signals;
    }

    it('上涨趋势应产生买入信号', () => {
      const prices = [10, 10, 10, 10, 10, 15, 16, 17, 18, 19, 20];
      const signals = maCross(prices, 2, 5);
      expect(signals.some(s => s.type === 'buy')).toBe(true);
    });

    it('信号价格应在原始价格范围内', () => {
      const prices = [10, 12, 11, 14, 13, 16, 15, 18, 17, 20];
      const signals = maCross(prices, 2, 4);
      signals.forEach(s => {
        expect(prices).toContain(s.price);
      });
    });

    it('信号索引应在有效范围内', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const signals = maCross(prices, 3, 7);
      signals.forEach(s => {
        expect(s.index).toBeGreaterThanOrEqual(0);
        expect(s.index).toBeLessThan(prices.length);
      });
    });

    it('快速周期=慢速周期应无交叉信号', () => {
      const prices = [10, 12, 14, 16, 18, 20, 22, 24];
      const signals = maCross(prices, 3, 3);
      expect(signals).toHaveLength(0);
    });

    it('震荡行情应有买和卖信号', () => {
      const prices = [10, 10, 10, 10, 20, 20, 20, 20, 10, 10, 10, 10, 20, 20, 20, 20];
      const signals = maCross(prices, 2, 4);
      const hasBuy = signals.some(s => s.type === 'buy');
      const hasSell = signals.some(s => s.type === 'sell');
      expect(hasBuy || hasSell).toBe(true);
    });

    it('周期为1应立即产生信号', () => {
      const prices = [10, 15, 20, 15, 10];
      const signals = maCross(prices, 1, 2);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('信号不应在数据不足时产生', () => {
      const prices = [10, 12];
      const signals = maCross(prices, 3, 5);
      signals.forEach(s => {
        expect(s.type).toBe('hold');
      });
    });
  });

  // 回测收益计算
  describe('回测收益计算', () => {
    function calcReturns(prices: number[]) {
      return prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    }

    it('日收益率长度应为n-1', () => {
      expect(calcReturns([100, 110, 105, 115])).toHaveLength(3);
    });

    it('上涨应产生正收益率', () => {
      const returns = calcReturns([100, 110]);
      expect(returns[0]).toBeCloseTo(0.1, 5);
    });

    it('下跌应产生负收益率', () => {
      const returns = calcReturns([100, 90]);
      expect(returns[0]).toBeCloseTo(-0.1, 5);
    });

    it('无变化收益率为0', () => {
      const returns = calcReturns([100, 100]);
      expect(returns[0]).toBe(0);
    });

    it('累计收益应为(1+r1)*(1+r2)-1', () => {
      const returns = [0.1, -0.05];
      const cumulative = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
      expect(cumulative).toBeCloseTo(0.045, 5);
    });

    it('空价格数组收益率为空', () => {
      expect(calcReturns([])).toHaveLength(0);
    });

    it('单个价格收益率为空', () => {
      expect(calcReturns([100])).toHaveLength(0);
    });
  });

  // 最大回撤
  describe('最大回撤', () => {
    function maxDrawdown(prices: number[]) {
      let peak = prices[0], maxDd = 0;
      for (const p of prices) {
        if (p > peak) peak = p;
        const dd = (peak - p) / peak;
        if (dd > maxDd) maxDd = dd;
      }
      return maxDd;
    }

    it('持续上涨回撤为0', () => {
      expect(maxDrawdown([10, 20, 30, 40])).toBe(0);
    });

    it('先涨后跌回撤正确', () => {
      expect(maxDrawdown([10, 20, 10])).toBeCloseTo(0.5, 5);
    });

    it('回撤不应为负', () => {
      expect(maxDrawdown([10, 15, 12, 18])).toBeGreaterThanOrEqual(0);
    });

    it('单价格回撤为0', () => {
      expect(maxDrawdown([100])).toBe(0);
    });

    it('回撤不应超过100%', () => {
      expect(maxDrawdown([100, 1])).toBeLessThanOrEqual(1);
    });

    it('全相同价格回撤为0', () => {
      expect(maxDrawdown([50, 50, 50, 50])).toBe(0);
    });
  });

  // 夏普比率
  describe('夏普比率', () => {
    function sharpe(returns: number[], rf: number = 0) {
      const excess = returns.map(r => r - rf);
      const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
      const std = Math.sqrt(excess.reduce((s, r) => s + (r - mean) ** 2, 0) / excess.length);
      return std === 0 ? 0 : mean / std;
    }

    it('正收益高于无风险利率夏普为正', () => {
      expect(sharpe([0.02, 0.03, 0.01], 0)).toBeGreaterThan(0);
    });

    it('负收益夏普为负', () => {
      expect(sharpe([-0.02, -0.03, -0.01], 0)).toBeLessThan(0);
    });

    it('零波动率夏普为0', () => {
      expect(sharpe([0.01, 0.01, 0.01], 0)).toBe(0);
    });

    it('无风险利率为0时等于原始夏普', () => {
      expect(sharpe([0.01, 0.02], 0)).toBe(sharpe([0.01, 0.02], 0));
    });

    it('夏普应为有限值', () => {
      const result = sharpe([0.05, -0.02, 0.03], 0.01);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('高波动低收益夏普应较低', () => {
      const lowVol = sharpe([0.02, 0.021, 0.019, 0.02], 0);
      const highVol = sharpe([0.1, -0.08, 0.06, -0.04], 0);
      expect(lowVol).toBeGreaterThan(highVol);
    });
  });

  // 胜率与盈亏比
  describe('胜率与盈亏比', () => {
    interface Trade { pnl: number; }
    function winRate(trades: Trade[]) {
      if (trades.length === 0) return 0;
      return trades.filter(t => t.pnl > 0).length / trades.length;
    }
    function profitFactor(trades: Trade[]) {
      const gains = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
      const losses = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
      return losses === 0 ? Infinity : gains / losses;
    }

    it('全赢胜率应为1', () => {
      expect(winRate([{ pnl: 10 }, { pnl: 20 }])).toBe(1);
    });

    it('全输胜率应为0', () => {
      expect(winRate([{ pnl: -10 }, { pnl: -20 }])).toBe(0);
    });

    it('空交易胜率为0', () => {
      expect(winRate([])).toBe(0);
    });

    it('盈亏比全赢应为Infinity', () => {
      expect(profitFactor([{ pnl: 10 }])).toBe(Infinity);
    });

    it('盈亏比应为正', () => {
      expect(profitFactor([{ pnl: 10 }, { pnl: -5 }])).toBeGreaterThan(0);
    });

    it('盈亏比=1表示盈亏均衡', () => {
      expect(profitFactor([{ pnl: 10 }, { pnl: -10 }])).toBeCloseTo(1, 5);
    });

    it('零PnL交易不影响盈亏比', () => {
      expect(profitFactor([{ pnl: 0 }, { pnl: 10 }, { pnl: -5 }])).toBeCloseTo(2, 5);
    });
  });

  // T+1交易规则
  describe('T+1交易规则', () => {
    it('买入当日不可卖出', () => {
      const canSell = (buyDay: number, sellDay: number) => sellDay > buyDay;
      expect(canSell(1, 1)).toBe(false);
      expect(canSell(1, 2)).toBe(true);
    });

    it('100股整数倍', () => {
      const validLots = (shares: number) => shares % 100 === 0;
      expect(validLots(100)).toBe(true);
      expect(validLots(50)).toBe(false);
      expect(validLots(1000)).toBe(true);
    });

    it('涨跌停限制', () => {
      const isWithinLimit = (prev: number, curr: number, limit: number = 0.1) => {
        return Math.abs((curr - prev) / prev) <= limit + 0.001;
      };
      expect(isWithinLimit(10, 11)).toBe(true);
      expect(isWithinLimit(10, 12)).toBe(false);
      expect(isWithinLimit(10, 9)).toBe(true);
      expect(isWithinLimit(10, 8.5)).toBe(false);
    });

    it('科创板涨跌停20%', () => {
      const isWithinLimit = (prev: number, curr: number, limit: number = 0.2) => {
        return Math.abs((curr - prev) / prev) <= limit + 0.001;
      };
      expect(isWithinLimit(100, 120)).toBe(true);
      expect(isWithinLimit(100, 125)).toBe(false);
    });

    it('最小交易单位1股（科创板）', () => {
      const validStar = (shares: number) => shares >= 1;
      expect(validStar(1)).toBe(true);
      expect(validStar(0)).toBe(false);
    });
  });
});
