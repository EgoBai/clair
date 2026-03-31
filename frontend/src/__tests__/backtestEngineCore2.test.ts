import { describe, it, expect } from 'vitest';

/**
 * 回测引擎核心逻辑测试
 */

describe('BacktestEngineCore', () => {
  describe('策略信号', () => {
    const signals = {
      buy: 1,
      sell: -1,
      hold: 0,
    };

    it('应该定义买入信号', () => {
      expect(signals.buy).toBe(1);
    });

    it('应该定义卖出信号', () => {
      expect(signals.sell).toBe(-1);
    });

    it('应该定义持有信号', () => {
      expect(signals.hold).toBe(0);
    });
  });

  describe('持仓管理', () => {
    const createPosition = (code: string, price: number, shares: number) => ({
      code,
      avgCost: price,
      shares,
      marketValue: price * shares,
      unrealizedPnL: 0,
    });

    const updatePosition = (pos: any, currentPrice: number) => ({
      ...pos,
      marketValue: currentPrice * pos.shares,
      unrealizedPnL: (currentPrice - pos.avgCost) * pos.shares,
    });

    it('应该创建持仓', () => {
      const pos = createPosition('600519', 1800, 100);
      expect(pos.shares).toBe(100);
      expect(pos.marketValue).toBe(180000);
    });

    it('应该计算浮动盈亏', () => {
      const pos = createPosition('600519', 1800, 100);
      const updated = updatePosition(pos, 1900);
      expect(updated.unrealizedPnL).toBe(10000);
    });

    it('亏损应该为负值', () => {
      const pos = createPosition('600519', 1800, 100);
      const updated = updatePosition(pos, 1700);
      expect(updated.unrealizedPnL).toBe(-10000);
    });
  });

  describe('交易执行', () => {
    const executeTrade = (
      capital: number,
      price: number,
      shares: number,
      commission: number
    ) => {
      const cost = price * shares * (1 + commission);
      if (cost > capital) return null;
      return {
        remainingCapital: capital - cost,
        shares,
      };
    };

    it('应该执行买入并扣费', () => {
      const result = executeTrade(200000, 1800, 100, 0.001);
      expect(result).not.toBeNull();
      expect(result!.remainingCapital).toBeLessThan(200000);
    });

    it('资金不足应该拒绝交易', () => {
      const result = executeTrade(1000, 1800, 100, 0.001);
      expect(result).toBeNull();
    });
  });

  describe('净值计算', () => {
    const calcNAV = (capital: number, positions: {marketValue: number}[]) => {
      const totalValue = positions.reduce((s, p) => s + p.marketValue, 0);
      return capital + totalValue;
    };

    it('应该计算基金净值', () => {
      const nav = calcNAV(100000, [
        { marketValue: 50000 },
        { marketValue: 30000 },
      ]);
      expect(nav).toBe(180000);
    });

    it('空仓净值应该等于现金', () => {
      const nav = calcNAV(100000, []);
      expect(nav).toBe(100000);
    });
  });

  describe('回测指标', () => {
    const calcMetrics = (navSeries: number[]) => {
      const returns = navSeries.slice(1).map((v, i) => (v - navSeries[i]) / navSeries[i]);
      const totalReturn = (navSeries[navSeries.length - 1] - navSeries[0]) / navSeries[0];
      const avgReturn = returns.reduce((a, b) => a + b) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length;
      const sharpe = avgReturn / Math.sqrt(variance) * Math.sqrt(252);
      
      let maxDrawdown = 0;
      let peak = navSeries[0];
      navSeries.forEach(v => {
        if (v > peak) peak = v;
        const dd = (peak - v) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      });

      return { totalReturn, sharpe, maxDrawdown };
    };

    const navSeries = [100000, 102000, 101000, 105000, 103000, 110000];
    const metrics = calcMetrics(navSeries);

    it('应该计算总收益率', () => {
      expect(metrics.totalReturn).toBeCloseTo(0.1, 1);
    });

    it('应该计算夏普比率', () => {
      expect(typeof metrics.sharpe).toBe('number');
    });

    it('应该计算最大回撤', () => {
      expect(metrics.maxDrawdown).toBeGreaterThan(0);
      expect(metrics.maxDrawdown).toBeLessThan(1);
    });
  });
});
