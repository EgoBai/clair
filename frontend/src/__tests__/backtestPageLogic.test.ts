/**
 * 回测页面逻辑测试
 * 覆盖策略参数验证、收益计算、最大回撤、夏普比率
 */

import { describe, it, expect } from 'vitest';

describe('回测页面逻辑', () => {
  describe('策略参数验证', () => {
    interface StrategyParams {
      symbol: string;
      startDate: string;
      endDate: string;
      initialCapital: number;
      commission: number;
    }

    function validateParams(params: StrategyParams): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      if (!params.symbol || params.symbol.length < 6) errors.push('股票代码无效');
      if (!params.startDate || !params.endDate) errors.push('日期不能为空');
      if (params.startDate >= params.endDate) errors.push('开始日期须早于结束日期');
      if (params.initialCapital <= 0) errors.push('初始资金须大于0');
      if (params.commission < 0) errors.push('佣金不能为负');
      return { valid: errors.length === 0, errors };
    }

    it('有效参数应通过验证', () => {
      const result = validateParams({
        symbol: '600519', startDate: '2023-01-01', endDate: '2024-01-01',
        initialCapital: 100000, commission: 0.0003,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('空代码应报错', () => {
      const result = validateParams({
        symbol: '', startDate: '2023-01-01', endDate: '2024-01-01',
        initialCapital: 100000, commission: 0.0003,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('股票代码无效');
    });

    it('日期顺序错误应报错', () => {
      const result = validateParams({
        symbol: '600519', startDate: '2024-01-01', endDate: '2023-01-01',
        initialCapital: 100000, commission: 0.0003,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('开始日期须早于结束日期');
    });
  });

  describe('收益率计算', () => {
    function calcReturns(prices: number[]): number[] {
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      return returns;
    }

    function calcTotalReturn(startValue: number, endValue: number): number {
      return Math.round(((endValue - startValue) / startValue) * 10000) / 100;
    }

    it('应正确计算每日收益率', () => {
      const returns = calcReturns([100, 110, 105, 115]);
      expect(returns[0]).toBeCloseTo(0.1, 5);
      expect(returns[1]).toBeCloseTo(-0.04545, 3);
      expect(returns[2]).toBeCloseTo(0.09524, 3);
    });

    it('总收益率应正确', () => {
      expect(calcTotalReturn(100000, 120000)).toBe(20);
      expect(calcTotalReturn(100000, 80000)).toBe(-20);
    });

    it('单日数据返回空数组', () => {
      expect(calcReturns([100])).toEqual([]);
    });
  });

  describe('最大回撤计算', () => {
    function calcMaxDrawdown(values: number[]): { maxDrawdown: number; peakIndex: number; troughIndex: number } {
      let peak = values[0];
      let peakIndex = 0;
      let maxDrawdown = 0;
      let maxPeakIndex = 0;
      let maxTroughIndex = 0;

      for (let i = 1; i < values.length; i++) {
        if (values[i] > peak) {
          peak = values[i];
          peakIndex = i;
        }
        const drawdown = (peak - values[i]) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          maxPeakIndex = peakIndex;
          maxTroughIndex = i;
        }
      }
      return { maxDrawdown: Math.round(maxDrawdown * 10000) / 100, peakIndex: maxPeakIndex, troughIndex: maxTroughIndex };
    }

    it('应正确计算最大回撤', () => {
      const values = [100, 120, 110, 90, 95, 115];
      const result = calcMaxDrawdown(values);
      expect(result.maxDrawdown).toBe(25); // (120-90)/120 = 25%
      expect(result.peakIndex).toBe(1);
      expect(result.troughIndex).toBe(3);
    });

    it('单边上行应无回撤', () => {
      const result = calcMaxDrawdown([100, 110, 120, 130]);
      expect(result.maxDrawdown).toBe(0);
    });

    it('单边下行回撤为总跌幅', () => {
      const result = calcMaxDrawdown([100, 80, 60, 40]);
      expect(result.maxDrawdown).toBe(60);
    });
  });

  describe('夏普比率计算', () => {
    function calcSharpeRatio(returns: number[], riskFreeRate: number = 0.03 / 252): number {
      if (returns.length < 2) return 0;
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
      const std = Math.sqrt(variance);
      if (std < 1e-10) return 0;
      return Math.round(((mean - riskFreeRate) / std) * Math.sqrt(252) * 100) / 100;
    }

    it('应正确计算夏普比率', () => {
      const returns = Array.from({ length: 252 }, (_, i) => 0.001 + (Math.random() - 0.5) * 0.01);
      const sharpe = calcSharpeRatio(returns);
      expect(typeof sharpe).toBe('number');
      expect(isFinite(sharpe)).toBe(true);
    });

    it('恒定收益率标准差接近0时夏普为0', () => {
      const returns = Array(100).fill(0.001);
      expect(calcSharpeRatio(returns)).toBe(0);
    });

    it('不足两个数据点返回0', () => {
      expect(calcSharpeRatio([0.01])).toBe(0);
    });
  });

  describe('胜率统计', () => {
    interface Trade {
      entryPrice: number;
      exitPrice: number;
      quantity: number;
    }

    function calcWinRate(trades: Trade[]): { winRate: number; avgWin: number; avgLoss: number; profitFactor: number } {
      let wins = 0, totalWin = 0, totalLoss = 0;
      for (const t of trades) {
        const pnl = (t.exitPrice - t.entryPrice) * t.quantity;
        if (pnl > 0) { wins++; totalWin += pnl; }
        else { totalLoss += Math.abs(pnl); }
      }
      const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0;
      const avgWin = wins > 0 ? Math.round(totalWin / wins) : 0;
      const avgLoss = (trades.length - wins) > 0 ? Math.round(totalLoss / (trades.length - wins)) : 0;
      const profitFactor = totalLoss > 0 ? Math.round((totalWin / totalLoss) * 100) / 100 : totalWin > 0 ? Infinity : 0;
      return { winRate, avgWin, avgLoss, profitFactor };
    }

    it('应正确统计胜率', () => {
      const trades: Trade[] = [
        { entryPrice: 10, exitPrice: 12, quantity: 100 },
        { entryPrice: 12, exitPrice: 11, quantity: 100 },
        { entryPrice: 11, exitPrice: 13, quantity: 100 },
      ];
      const result = calcWinRate(trades);
      expect(result.winRate).toBe(67);
      expect(result.profitFactor).toBeGreaterThan(1);
    });

    it('空交易列表', () => {
      const result = calcWinRate([]);
      expect(result.winRate).toBe(0);
      expect(result.profitFactor).toBe(0);
    });
  });

  describe('年化收益转换', () => {
    function toAnnualizedReturn(totalReturn: number, days: number): number {
      if (days <= 0) return 0;
      const years = days / 365;
      return Math.round((Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 10000) / 100;
    }

    it('应正确年化', () => {
      const annualized = toAnnualizedReturn(20, 365);
      expect(annualized).toBe(20);
    });

    it('半年20%收益年化约44%', () => {
      const annualized = toAnnualizedReturn(20, 182);
      expect(annualized).toBeCloseTo(44, 0);
    });
  });
});
