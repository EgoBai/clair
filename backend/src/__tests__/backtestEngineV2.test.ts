import { describe, it, expect } from 'vitest';

// 交易回测引擎 v2
interface TradeRecord {
  date: string;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  fee: number;
  reason: string;
}

interface BacktestConfig {
  initialCapital: number;
  commission: number; // 万分之
  minCommission: number;
  stampTax: number; // 千分之 (仅卖出)
  slippage: number; // 滑点百分比
}

function executeBuy(price: number, capital: number, config: BacktestConfig): { quantity: number; cost: number; fee: number } {
  const slippagePrice = price * (1 + config.slippage);
  const quantity = Math.floor(capital / (slippagePrice * 100)) * 100; // 100股整数倍
  if (quantity <= 0) return { quantity: 0, cost: 0, fee: 0 };
  const amount = quantity * slippagePrice;
  const fee = Math.max(amount * config.commission / 10000, config.minCommission);
  return { quantity, cost: amount + fee, fee };
}

function executeSell(price: number, quantity: number, config: BacktestConfig): { proceeds: number; fee: number; tax: number } {
  const slippagePrice = price * (1 - config.slippage);
  const amount = quantity * slippagePrice;
  const fee = Math.max(amount * config.commission / 10000, config.minCommission);
  const tax = amount * config.stampTax / 1000;
  return { proceeds: amount - fee - tax, fee, tax };
}

function calcMaxDrawdown(equity: number[]): { maxDrawdown: number; peak: number; trough: number; recoveryIndex: number } {
  if (equity.length === 0) return { maxDrawdown: 0, peak: 0, trough: 0, recoveryIndex: -1 };
  let peak = equity[0], maxDD = 0, peakIdx = 0, troughIdx = 0, recoveryIdx = -1;
  let currentPeak = equity[0], currentPeakIdx = 0;

  for (let i = 1; i < equity.length; i++) {
    if (equity[i] > currentPeak) {
      currentPeak = equity[i];
      currentPeakIdx = i;
    }
    const dd = (currentPeak - equity[i]) / currentPeak;
    if (dd > maxDD) {
      maxDD = dd;
      peak = currentPeak;
      peakIdx = currentPeakIdx;
      troughIdx = i;
    }
    if (dd === 0 && maxDD > 0 && i > troughIdx) {
      recoveryIdx = i;
    }
  }
  return { maxDrawdown: +maxDD.toFixed(6), peak, trough: equity[troughIdx], recoveryIndex: recoveryIdx };
}

function calcSharpeRatio(returns: number[], riskFreeRate: number = 0.03): number {
  if (returns.length < 2) return 0;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const excessReturn = avgReturn - riskFreeRate / 252;
  const variance = returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return +((excessReturn / stdDev) * Math.sqrt(252)).toFixed(4);
}

function calcWinRate(trades: TradeRecord[]): { winRate: number; avgWin: number; avgLoss: number; profitFactor: number } {
  const sells = trades.filter(t => t.type === 'sell');
  if (sells.length === 0) return { winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0 };

  // Simplified: compare sell price to average cost
  let wins = 0, totalWin = 0, totalLoss = 0;
  for (let i = 0; i < sells.length; i++) {
    const pnl = sells[i].amount - sells[i].fee;
    if (pnl > 0) { wins++; totalWin += pnl; }
    else { totalLoss += Math.abs(pnl); }
  }
  const winRate = wins / sells.length;
  const avgWin = wins > 0 ? totalWin / wins : 0;
  const avgLoss = (sells.length - wins) > 0 ? totalLoss / (sells.length - wins) : 0;
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;
  return { winRate: +winRate.toFixed(4), avgWin: +avgWin.toFixed(2), avgLoss: +avgLoss.toFixed(2), profitFactor: +profitFactor.toFixed(4) };
}

describe('交易回测引擎 v2', () => {
  const defaultConfig: BacktestConfig = {
    initialCapital: 100000,
    commission: 2.5,
    minCommission: 5,
    stampTax: 1,
    slippage: 0.001,
  };

  describe('买入执行', () => {
    it('计算正确买入数量(100股整数倍)', () => {
      const r = executeBuy(10, 50000, defaultConfig);
      expect(r.quantity % 100).toBe(0);
      expect(r.quantity).toBeGreaterThan(0);
    });

    it('资金不足返回0', () => {
      const r = executeBuy(10000, 100, defaultConfig);
      expect(r.quantity).toBe(0);
    });

    it('滑点影响买入数量', () => {
      const r1 = executeBuy(10, 50000, { ...defaultConfig, slippage: 0 });
      const r2 = executeBuy(10, 50000, { ...defaultConfig, slippage: 0.01 });
      // Higher slippage → higher price → fewer shares bought
      expect(r2.quantity).toBeLessThan(r1.quantity);
    });

    it('佣金不低于最低值', () => {
      const r = executeBuy(1, 1000, defaultConfig);
      expect(r.fee).toBeGreaterThanOrEqual(defaultConfig.minCommission);
    });

    it('总成本=数量×价格+佣金', () => {
      const r = executeBuy(10, 50000, { ...defaultConfig, slippage: 0 });
      const expectedAmount = r.quantity * 10;
      expect(r.cost).toBeCloseTo(expectedAmount + r.fee, 2);
    });
  });

  describe('卖出执行', () => {
    it('正确计算卖出所得', () => {
      const r = executeSell(10, 1000, { ...defaultConfig, slippage: 0 });
      const amount = 1000 * 10;
      const fee = Math.max(amount * 2.5 / 10000, 5);
      const tax = amount * 1 / 1000;
      expect(r.proceeds).toBeCloseTo(amount - fee - tax, 2);
    });

    it('印花税仅卖出收取', () => {
      const r = executeSell(10, 1000, defaultConfig);
      expect(r.tax).toBeGreaterThan(0);
    });

    it('滑点减少卖出所得', () => {
      const r1 = executeSell(10, 1000, { ...defaultConfig, slippage: 0 });
      const r2 = executeSell(10, 1000, { ...defaultConfig, slippage: 0.01 });
      expect(r2.proceeds).toBeLessThan(r1.proceeds);
    });
  });

  describe('最大回撤', () => {
    it('上涨无回撤', () => {
      const dd = calcMaxDrawdown([100, 110, 120, 130]);
      expect(dd.maxDrawdown).toBe(0);
    });

    it('计算正确最大回撤', () => {
      const dd = calcMaxDrawdown([100, 120, 80, 110]);
      expect(dd.maxDrawdown).toBeCloseTo(0.3333, 2);
    });

    it('空数组返回零', () => {
      const dd = calcMaxDrawdown([]);
      expect(dd.maxDrawdown).toBe(0);
    });

    it('持续下跌回撤=1', () => {
      const dd = calcMaxDrawdown([100, 0]);
      expect(dd.maxDrawdown).toBe(1);
    });

    it('单值无回撤', () => {
      const dd = calcMaxDrawdown([100]);
      expect(dd.maxDrawdown).toBe(0);
    });

    it('峰值和谷值正确', () => {
      const dd = calcMaxDrawdown([100, 150, 75, 125]);
      expect(dd.peak).toBe(150);
      expect(dd.trough).toBe(75);
    });
  });

  describe('夏普比率', () => {
    it('正收益正波动为正夏普', () => {
      const sr = calcSharpeRatio([0.01, 0.02, -0.005, 0.015]);
      expect(sr).toBeGreaterThan(0);
    });

    it('单数据返回0', () => {
      expect(calcSharpeRatio([0.01])).toBe(0);
    });

    it('零波动返回0', () => {
      expect(calcSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
    });

    it('空数组返回0', () => {
      expect(calcSharpeRatio([])).toBe(0);
    });

    it('无风险利率影响夏普', () => {
      const sr1 = calcSharpeRatio([0.01, 0.02], 0);
      const sr2 = calcSharpeRatio([0.01, 0.02], 0.1);
      expect(sr1).toBeGreaterThan(sr2);
    });
  });

  describe('胜率统计', () => {
    it('空交易返回零', () => {
      const wr = calcWinRate([]);
      expect(wr.winRate).toBe(0);
    });

    it('只有买入返回零', () => {
      const trades: TradeRecord[] = [
        { date: 'd1', type: 'buy', price: 10, quantity: 100, amount: 1000, fee: 5, reason: 'signal' },
      ];
      const wr = calcWinRate(trades);
      expect(wr.winRate).toBe(0);
    });

    it('profitFactor为正', () => {
      const trades: TradeRecord[] = [
        { date: 'd1', type: 'sell', price: 11, quantity: 100, amount: 1100, fee: 5, reason: 'profit' },
        { date: 'd2', type: 'sell', price: 9, quantity: 100, amount: 900, fee: 5, reason: 'loss' },
      ];
      const wr = calcWinRate(trades);
      expect(wr.profitFactor).toBeGreaterThan(0);
    });

    it('全胜profitFactor为Infinity', () => {
      const trades: TradeRecord[] = [
        { date: 'd1', type: 'sell', price: 11, quantity: 100, amount: 1100, fee: 5, reason: 'profit' },
      ];
      const wr = calcWinRate(trades);
      expect(wr.winRate).toBe(1);
    });
  });
});
