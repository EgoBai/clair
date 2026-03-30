import { describe, it, expect } from 'vitest';

// ==================== 选股回测集成引擎 ====================

interface SelectionRule {
  name: string;
  conditions: { field: string; operator: '>' | '<' | '>=' | '<=' | '='; value: number }[];
  ranking: { field: string; order: 'asc' | 'desc' }[];
  topN: number;
  rebalanceDays: number;
}

interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
  commission: number;
  slippage: number;
  rules: SelectionRule;
}

interface BacktestSnapshot {
  date: string;
  portfolio: { symbol: string; weight: number; price: number }[];
  totalValue: number;
  dailyReturn: number;
}

interface SelectionBacktestResult {
  config: BacktestConfig;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  totalRebalances: number;
  snapshots: BacktestSnapshot[];
  turnoverHistory: number[];
}

class SelectionBacktestEngine {
  /** 运行选股回测 */
  run(config: BacktestConfig, stockUniverse: Record<string, { date: string; close: number; [key: string]: number }[]>): SelectionBacktestResult {
    const allDates = this.getTradingDates(config.startDate, config.endDate);
    const snapshots: BacktestSnapshot[] = [];
    const turnoverHistory: number[] = [];
    let capital = config.initialCapital;
    let holdings: Map<string, number> = new Map(); // symbol -> shares
    let lastRebalance = 0;
    let totalRebalances = 0;

    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];

      // 更新持仓市值
      let portfolioValue = capital;
      const portfolio: { symbol: string; weight: number; price: number }[] = [];

      for (const [symbol, shares] of holdings) {
        const dayData = stockUniverse[symbol]?.find(d => d.date === date);
        if (dayData) {
          const value = shares * dayData.close;
          portfolioValue += value;
          portfolio.push({ symbol, weight: 0, price: dayData.close });
        }
      }

      // 归一化权重
      for (const p of portfolio) {
        p.weight = portfolioValue > 0 ? Math.round((p.weight * 0 + (holdings.get(p.symbol)! * p.price) / portfolioValue) * 10000) / 10000 : 0;
      }

      // 再平衡检查
      if (i - lastRebalance >= config.rules.rebalanceDays) {
        const selected = this.selectStocks(config.rules, stockUniverse, date);
        if (selected.length > 0) {
          // 卖出全部
          for (const [symbol, shares] of holdings) {
            const dayData = stockUniverse[symbol]?.find(d => d.date === date);
            if (dayData) {
              capital += shares * dayData.close * (1 - config.commission - config.slippage);
            }
          }
          holdings.clear();

          // 买入新组合
          const weight = 1 / selected.length;
          for (const symbol of selected) {
            const dayData = stockUniverse[symbol]?.find(d => d.date === date);
            if (dayData && dayData.close > 0) {
              const amount = capital * weight;
              const shares = Math.floor(amount / dayData.close / 100) * 100; // 整手
              if (shares > 0) {
                const cost = shares * dayData.close * (1 + config.commission + config.slippage);
                capital -= cost;
                holdings.set(symbol, shares);
              }
            }
          }

          totalRebalances++;
          turnoverHistory.push(1); // 全换仓
          lastRebalance = i;
        }
      }

      // 记录快照
      const prevValue = snapshots.length > 0 ? snapshots[snapshots.length - 1].totalValue : config.initialCapital;
      const dailyReturn = prevValue > 0 ? (portfolioValue - prevValue) / prevValue : 0;
      snapshots.push({ date, portfolio, totalValue: Math.round(portfolioValue * 100) / 100, dailyReturn: Math.round(dailyReturn * 10000) / 10000 });
    }

    const returns = snapshots.map(s => s.dailyReturn);
    const totalReturn = ((snapshots[snapshots.length - 1]?.totalValue || config.initialCapital) - config.initialCapital) / config.initialCapital * 100;
    const years = allDates.length / 252;
    const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : 0;
    const maxDrawdown = this.calcMaxDrawdown(snapshots.map(s => s.totalValue));
    const sharpeRatio = this.calcSharpe(returns);
    const winRate = returns.filter(r => r > 0).length / (returns.length || 1) * 100;

    return {
      config,
      totalReturn: Math.round(totalReturn * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      totalRebalances,
      snapshots,
      turnoverHistory,
    };
  }

  /** 比较多规则回测 */
  compareRules(
    configs: BacktestConfig[],
    stockUniverse: Record<string, { date: string; close: number; [key: string]: number }[]>
  ): { rule: string; result: SelectionBacktestResult }[] {
    return configs.map(config => ({
      rule: config.rules.name,
      result: this.run(config, stockUniverse),
    })).sort((a, b) => b.result.sharpeRatio - a.result.sharpeRatio);
  }

  /** 敏感性分析 */
  sensitivityToTopN(
    baseConfig: BacktestConfig,
    stockUniverse: Record<string, { date: string; close: number; [key: string]: number }[]>
  ): { topN: number; result: { totalReturn: number; sharpeRatio: number; maxDrawdown: number } }[] {
    const results = [];
    for (const topN of [3, 5, 10, 15, 20]) {
      const config = { ...baseConfig, rules: { ...baseConfig.rules, topN } };
      const result = this.run(config, stockUniverse);
      results.push({
        topN,
        result: { totalReturn: result.totalReturn, sharpeRatio: result.sharpeRatio, maxDrawdown: result.maxDrawdown },
      });
    }
    return results;
  }

  // ==================== 私有方法 ====================

  private getTradingDates(start: string, end: string): string[] {
    const dates: string[] = [];
    const s = new Date(start), e = new Date(end);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }

  private selectStocks(rules: SelectionRule, universe: Record<string, any[]>, date: string): string[] {
    const candidates: { symbol: string; score: number }[] = [];

    for (const [symbol, data] of Object.entries(universe)) {
      const dayData = data.find((d: any) => d.date === date);
      if (!dayData) continue;

      let pass = true;
      for (const cond of rules.conditions) {
        const val = dayData[cond.field];
        if (val === undefined) { pass = false; break; }
        switch (cond.operator) {
          case '>': if (!(val > cond.value)) pass = false; break;
          case '<': if (!(val < cond.value)) pass = false; break;
          case '>=': if (!(val >= cond.value)) pass = false; break;
          case '<=': if (!(val <= cond.value)) pass = false; break;
          case '=': if (!(val === cond.value)) pass = false; break;
        }
        if (!pass) break;
      }

      if (pass) {
        let score = 0;
        for (const r of rules.ranking) {
          const val = dayData[r.field] || 0;
          score += r.order === 'desc' ? val : -val;
        }
        candidates.push({ symbol, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, rules.topN).map(c => c.symbol);
  }

  private calcMaxDrawdown(values: number[]): number {
    let peak = values[0] || 0, maxDD = 0;
    for (const v of values) {
      if (v > peak) peak = v;
      const dd = peak > 0 ? ((peak - v) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }

  private calcSharpe(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1));
    return std > 0 ? (mean * 252 - 0.03) / (std * Math.sqrt(252)) : 0;
  }
}

// ==================== 测试数据 ====================

function genUniverse(count: number, days: number): Record<string, { date: string; close: number; [key: string]: number }[]> {
  const universe: Record<string, { date: string; close: number; [key: string]: number }[]> = {};
  const start = new Date('2024-01-01');

  for (let i = 0; i < count; i++) {
    const symbol = `STOCK${i}`;
    let price = 10 + Math.random() * 20;
    const data = [];

    for (let d = 0; d < days; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      price *= (1 + (Math.random() - 0.48) * 0.03);
      data.push({
        date: date.toISOString().split('T')[0],
        close: Math.round(price * 100) / 100,
        pe: 5 + Math.random() * 40,
        roe: Math.random() * 30,
        revenueGrowth: -10 + Math.random() * 50,
        momentum: -20 + Math.random() * 40,
      });
    }
    universe[symbol] = data;
  }
  return universe;
}

// ==================== 测试 ====================

describe('SelectionBacktestEngine 选股回测集成', () => {
  const engine = new SelectionBacktestEngine();
  const universe = genUniverse(30, 60);

  const baseConfig: BacktestConfig = {
    startDate: '2024-01-01', endDate: '2024-03-01',
    initialCapital: 100000, commission: 0.0003, slippage: 0.001,
    rules: {
      name: 'ROE选股',
      conditions: [{ field: 'roe', operator: '>', value: 10 }],
      ranking: [{ field: 'roe', order: 'desc' }],
      topN: 5, rebalanceDays: 10,
    },
  };

  describe('回测执行', () => {
    it('应执行回测', () => {
      const result = engine.run(baseConfig, universe);
      expect(result.totalReturn).toBeDefined();
      expect(result.snapshots.length).toBeGreaterThan(0);
      expect(result.totalRebalances).toBeGreaterThan(0);
    });

    it('应计算所有指标', () => {
      const result = engine.run(baseConfig, universe);
      expect(typeof result.totalReturn).toBe('number');
      expect(typeof result.annualizedReturn).toBe('number');
      expect(typeof result.maxDrawdown).toBe('number');
      expect(typeof result.sharpeRatio).toBe('number');
      expect(typeof result.winRate).toBe('number');
    });

    it('最大回撤应>=0', () => {
      const result = engine.run(baseConfig, universe);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('胜率应在0-100之间', () => {
      const result = engine.run(baseConfig, universe);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it('应记录换手历史', () => {
      const result = engine.run(baseConfig, universe);
      expect(result.turnoverHistory.length).toBe(result.totalRebalances);
    });
  });

  describe('多规则对比', () => {
    it('应比较多个规则', () => {
      const configs = [
        baseConfig,
        { ...baseConfig, rules: { ...baseConfig.rules, name: 'PE选股', conditions: [{ field: 'pe', operator: '<', value: 20 }], ranking: [{ field: 'pe', order: 'asc' }] } },
      ];
      const comparison = engine.compareRules(configs, universe);
      expect(comparison.length).toBe(2);
      expect(comparison[0].result.sharpeRatio).toBeGreaterThanOrEqual(comparison[1].result.sharpeRatio);
    });
  });

  describe('TopN敏感性', () => {
    it('应返回不同N的结果', () => {
      const results = engine.sensitivityToTopN(baseConfig, universe);
      expect(results.length).toBe(5);
      for (const r of results) {
        expect(r.topN).toBeDefined();
        expect(r.result.totalReturn).toBeDefined();
      }
    });
  });

  describe('快照数据', () => {
    it('快照应包含每日数据', () => {
      const result = engine.run(baseConfig, universe);
      for (const snap of result.snapshots) {
        expect(snap.date).toBeDefined();
        expect(snap.totalValue).toBeGreaterThan(0);
        expect(typeof snap.dailyReturn).toBe('number');
      }
    });
  });
});
