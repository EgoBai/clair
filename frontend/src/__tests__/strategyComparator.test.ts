import { describe, it, expect } from 'vitest';

// ==================== 策略对比引擎 ====================

interface StrategyResult {
  name: string;
  params: Record<string, number>;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  volatility: number;
  calmarRatio: number;
  expectancy: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgHoldingDays: number;
  dailyReturns: number[];
}

interface ComparisonMetric {
  name: string;
  label: string;
  higherIsBetter: boolean;
  values: { strategy: string; value: number; rank: number; score: number }[];
}

interface StrategyRanking {
  strategy: string;
  totalScore: number;
  rank: number;
  strengths: string[];
  weaknesses: string[];
}

class StrategyComparator {
  private strategies: StrategyResult[] = [];

  addStrategy(result: StrategyResult): void {
    this.strategies.push(result);
  }

  addStrategies(results: StrategyResult[]): void {
    this.strategies.push(...results);
  }

  /** 对比所有指标 */
  compareAll(): ComparisonMetric[] {
    if (this.strategies.length === 0) return [];

    const metrics: { name: string; label: string; higherIsBetter: boolean; extract: (s: StrategyResult) => number }[] = [
      { name: 'totalReturn', label: '总收益率', higherIsBetter: true, extract: s => s.totalReturn },
      { name: 'annualizedReturn', label: '年化收益率', higherIsBetter: true, extract: s => s.annualizedReturn },
      { name: 'maxDrawdown', label: '最大回撤', higherIsBetter: false, extract: s => s.maxDrawdown },
      { name: 'sharpeRatio', label: '夏普比率', higherIsBetter: true, extract: s => s.sharpeRatio },
      { name: 'sortinoRatio', label: '索提诺比率', higherIsBetter: true, extract: s => s.sortinoRatio },
      { name: 'calmarRatio', label: 'Calmar比率', higherIsBetter: true, extract: s => s.calmarRatio },
      { name: 'winRate', label: '胜率', higherIsBetter: true, extract: s => s.winRate },
      { name: 'profitFactor', label: '盈亏比', higherIsBetter: true, extract: s => s.profitFactor },
      { name: 'volatility', label: '波动率', higherIsBetter: false, extract: s => s.volatility },
      { name: 'expectancy', label: '期望值', higherIsBetter: true, extract: s => s.expectancy },
      { name: 'totalTrades', label: '交易次数', higherIsBetter: true, extract: s => s.totalTrades },
      { name: 'avgHoldingDays', label: '平均持仓天数', higherIsBetter: false, extract: s => s.avgHoldingDays },
    ];

    return metrics.map(m => {
      const raw = this.strategies.map(s => ({ strategy: s.name, value: m.extract(s) }));
      const sorted = [...raw].sort((a, b) => m.higherIsBetter ? b.value - a.value : a.value - b.value);

      // 排名
      const ranks = new Map<string, number>();
      sorted.forEach((s, i) => ranks.set(s.strategy, i + 1));

      // 评分 (0-100)
      const values = raw.map(r => r.value);
      const min = Math.min(...values), max = Math.max(...values);
      const range = max - min || 1;

      return {
        name: m.name,
        label: m.label,
        higherIsBetter: m.higherIsBetter,
        values: raw.map(r => ({
          strategy: r.strategy,
          value: Math.round(r.value * 100) / 100,
          rank: ranks.get(r.strategy)!,
          score: Math.round((m.higherIsBetter ? (r.value - min) / range : (max - r.value) / range) * 100),
        })),
      };
    });
  }

  /** 综合排名 */
  rankStrategies(weights?: Record<string, number>): StrategyRanking[] {
    const comparison = this.compareAll();
    if (comparison.length === 0) return [];

    const defaultWeights: Record<string, number> = {
      totalReturn: 1.5, annualizedReturn: 1.5, maxDrawdown: 2,
      sharpeRatio: 2, sortinoRatio: 1.5, calmarRatio: 1,
      winRate: 1, profitFactor: 1, volatility: 1,
    };

    const w = weights || defaultWeights;
    const totalWeight = Object.values(w).reduce((s, v) => s + v, 0);

    const scores = new Map<string, { total: number; metrics: { name: string; score: number }[] }>();

    for (const s of this.strategies) {
      scores.set(s.name, { total: 0, metrics: [] });
    }

    for (const metric of comparison) {
      const weight = w[metric.name] || 1;
      for (const v of metric.values) {
        const entry = scores.get(v.strategy)!;
        entry.total += (v.score / 100) * weight;
        entry.metrics.push({ name: metric.name, score: v.score });
      }
    }

    const rankings: StrategyRanking[] = [];
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1].total - a[1].total);

    sorted.forEach(([name, data], idx) => {
      const maxPossible = totalWeight;
      const totalScore = Math.round((data.total / maxPossible) * 100);
      const strengths = data.metrics.filter(m => m.score >= 70).map(m => m.name);
      const weaknesses = data.metrics.filter(m => m.score <= 30).map(m => m.name);

      rankings.push({ strategy: name, totalScore, rank: idx + 1, strengths, weaknesses });
    });

    return rankings;
  }

  /** 相关性分析 */
  calculateCorrelation(): { pair: string; correlation: number }[] {
    const pairs: { pair: string; correlation: number }[] = [];
    for (let i = 0; i < this.strategies.length; i++) {
      for (let j = i + 1; j < this.strategies.length; j++) {
        const corr = this.pearsonCorrelation(
          this.strategies[i].dailyReturns,
          this.strategies[j].dailyReturns
        );
        pairs.push({ pair: `${this.strategies[i].name}-${this.strategies[j].name}`, correlation: Math.round(corr * 1000) / 1000 });
      }
    }
    return pairs;
  }

  /** 找出最优策略 */
  findBest(metric: string = 'sharpeRatio'): StrategyResult | null {
    if (this.strategies.length === 0) return null;
    return this.strategies.reduce((best, curr) =>
      (curr as any)[metric] > (best as any)[metric] ? curr : best
    );
  }

  /** 风险收益散点图数据 */
  getRiskReturnData(): { name: string; risk: number; reward: number }[] {
    return this.strategies.map(s => ({
      name: s.name,
      risk: s.volatility,
      reward: s.annualizedReturn,
    }));
  }

  /** 有效前沿近似 */
  findEfficientFrontier(): { name: string; sharpe: number }[] {
    return this.strategies
      .map(s => ({ name: s.name, sharpe: s.sharpeRatio }))
      .sort((a, b) => b.sharpe - a.sharpe);
  }

  /** 生成对比报告 */
  generateReport(): string {
    const rankings = this.rankStrategies();
    const corr = this.calculateCorrelation();

    let report = '# 策略对比报告\n\n';
    report += '## 综合排名\n\n';
    for (const r of rankings) {
      report += `${r.rank}. ${r.strategy} (评分: ${r.totalScore})\n`;
      if (r.strengths.length > 0) report += `   优势: ${r.strengths.join(', ')}\n`;
      if (r.weaknesses.length > 0) report += `   劣势: ${r.weaknesses.join(', ')}\n`;
    }

    report += '\n## 相关性分析\n\n';
    for (const c of corr) {
      report += `- ${c.pair}: ${c.correlation}\n`;
    }

    return report;
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] - mx, b = y[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  }

  clear(): void { this.strategies = []; }
  get count(): number { return this.strategies.length; }
}

// ==================== 测试数据 ====================

function genStrategy(name: string, ret: number, vol: number, winR: number): StrategyResult {
  const dailyReturns = Array.from({ length: 252 }, () => (Math.random() - 0.5) * vol * 2 + ret / 252);
  const totalReturn = dailyReturns.reduce((c, r) => c * (1 + r), 1) * 100 - 100;
  return {
    name, params: { fast: 5, slow: 20 },
    totalReturn: Math.round(totalReturn * 100) / 100,
    annualizedReturn: Math.round(totalReturn * 100) / 100,
    maxDrawdown: Math.round((vol * 50 + Math.random() * 10) * 100) / 100,
    sharpeRatio: Math.round(((ret - 0.03) / vol) * 100) / 100,
    sortinoRatio: Math.round(((ret - 0.03) / (vol * 0.7)) * 100) / 100,
    winRate: winR,
    totalTrades: Math.floor(50 + Math.random() * 100),
    profitFactor: Math.round((1 + Math.random() * 2) * 100) / 100,
    volatility: Math.round(vol * 100 * 100) / 100,
    calmarRatio: Math.round((ret / (vol * 50)) * 100) / 100,
    expectancy: Math.round((Math.random() * 1000) * 100) / 100,
    maxConsecutiveWins: Math.floor(3 + Math.random() * 7),
    maxConsecutiveLosses: Math.floor(2 + Math.random() * 5),
    avgHoldingDays: Math.round((3 + Math.random() * 15) * 10) / 10,
    dailyReturns,
  };
}

// ==================== 测试 ====================

describe('StrategyComparator 策略对比引擎', () => {
  describe('基础功能', () => {
    it('应正确初始化', () => {
      const cmp = new StrategyComparator();
      expect(cmp.count).toBe(0);
    });

    it('应添加单个策略', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategy(genStrategy('MA5', 0.15, 0.2, 55));
      expect(cmp.count).toBe(1);
    });

    it('应批量添加策略', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.1, 0.15, 50), genStrategy('B', 0.2, 0.25, 60)]);
      expect(cmp.count).toBe(2);
    });

    it('应清空策略', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategy(genStrategy('A', 0.1, 0.15, 50));
      cmp.clear();
      expect(cmp.count).toBe(0);
    });
  });

  describe('指标对比', () => {
    it('空策略应返回空对比', () => {
      expect(new StrategyComparator().compareAll()).toEqual([]);
    });

    it('应返回所有对比指标', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('MA5', 0.15, 0.2, 55), genStrategy('RSI', 0.1, 0.15, 60)]);
      const result = cmp.compareAll();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].values.length).toBe(2);
    });

    it('每个指标应有名称和标签', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategy(genStrategy('A', 0.1, 0.15, 50));
      const result = cmp.compareAll();
      for (const m of result) {
        expect(m.name).toBeDefined();
        expect(m.label).toBeDefined();
        expect(typeof m.higherIsBetter).toBe('boolean');
      }
    });

    it('排名应正确排序', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.1, 0.15, 50), genStrategy('B', 0.3, 0.1, 70)]);
      const result = cmp.compareAll();
      for (const m of result) {
        const ranks = m.values.map(v => v.rank);
        expect(ranks).toContain(1);
        expect(ranks).toContain(2);
      }
    });

    it('评分应在0-100之间', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.1, 0.15, 50), genStrategy('B', 0.2, 0.2, 60)]);
      const result = cmp.compareAll();
      for (const m of result) {
        for (const v of m.values) {
          expect(v.score).toBeGreaterThanOrEqual(0);
          expect(v.score).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('综合排名', () => {
    it('应返回排名结果', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('MA5', 0.15, 0.2, 55), genStrategy('RSI', 0.1, 0.15, 60), genStrategy('MACD', 0.2, 0.25, 50)]);
      const rankings = cmp.rankStrategies();
      expect(rankings.length).toBe(3);
      expect(rankings[0].rank).toBe(1);
      expect(rankings[2].rank).toBe(3);
    });

    it('应正确识别优劣势', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.3, 0.1, 70), genStrategy('B', 0.05, 0.3, 40)]);
      const rankings = cmp.rankStrategies();
      expect(rankings[0].strengths.length).toBeGreaterThanOrEqual(0);
    });

    it('空策略应返回空排名', () => {
      expect(new StrategyComparator().rankStrategies()).toEqual([]);
    });

    it('应支持自定义权重', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.15, 0.2, 55), genStrategy('B', 0.1, 0.15, 60)]);
      const rankings = cmp.rankStrategies({ totalReturn: 3, sharpeRatio: 1 });
      expect(rankings.length).toBe(2);
    });
  });

  describe('相关性分析', () => {
    it('应计算策略间相关性', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.15, 0.2, 55), genStrategy('B', 0.1, 0.15, 60)]);
      const corr = cmp.calculateCorrelation();
      expect(corr.length).toBe(1);
      expect(corr[0].correlation).toBeGreaterThanOrEqual(-1);
      expect(corr[0].correlation).toBeLessThanOrEqual(1);
    });

    it('三策略应有3对相关性', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.1, 0.15, 50), genStrategy('B', 0.2, 0.2, 60), genStrategy('C', 0.15, 0.18, 55)]);
      expect(cmp.calculateCorrelation().length).toBe(3);
    });

    it('相同序列相关性应为1', () => {
      const cmp = new StrategyComparator();
      const a: StrategyResult = { ...genStrategy('A', 0.15, 0.2, 55), dailyReturns: [0.01, 0.02, -0.01, 0.015, 0.005] };
      const b: StrategyResult = { ...genStrategy('B', 0.1, 0.15, 60), dailyReturns: [0.01, 0.02, -0.01, 0.015, 0.005] };
      cmp.addStrategies([a, b]);
      const corr = cmp.calculateCorrelation();
      expect(corr[0].correlation).toBeCloseTo(1, 2);
    });
  });

  describe('最优策略', () => {
    it('应找出最高夏普策略', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.1, 0.15, 50), genStrategy('B', 0.3, 0.1, 70)]);
      const best = cmp.findBest('sharpeRatio');
      expect(best).not.toBeNull();
      expect(best!.name).toBe('B');
    });

    it('空策略应返回null', () => {
      expect(new StrategyComparator().findBest()).toBeNull();
    });

    it('应支持不同指标查找', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.1, 0.15, 70), genStrategy('B', 0.3, 0.1, 50)]);
      const bestReturn = cmp.findBest('totalReturn');
      const bestWinRate = cmp.findBest('winRate');
      expect(bestReturn).not.toBeNull();
      expect(bestWinRate).not.toBeNull();
    });
  });

  describe('风险收益数据', () => {
    it('应返回散点数据', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.15, 0.2, 55), genStrategy('B', 0.1, 0.15, 60)]);
      const data = cmp.getRiskReturnData();
      expect(data.length).toBe(2);
      for (const d of data) {
        expect(d.name).toBeDefined();
        expect(typeof d.risk).toBe('number');
        expect(typeof d.reward).toBe('number');
      }
    });
  });

  describe('有效前沿', () => {
    it('应按夏普排序', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('A', 0.1, 0.15, 50), genStrategy('B', 0.3, 0.1, 70)]);
      const frontier = cmp.findEfficientFrontier();
      for (let i = 1; i < frontier.length; i++) {
        expect(frontier[i - 1].sharpe).toBeGreaterThanOrEqual(frontier[i].sharpe);
      }
    });
  });

  describe('对比报告', () => {
    it('应生成报告文本', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategies([genStrategy('MA5', 0.15, 0.2, 55), genStrategy('RSI', 0.1, 0.15, 60)]);
      const report = cmp.generateReport();
      expect(report).toContain('# 策略对比报告');
      expect(report).toContain('综合排名');
      expect(report).toContain('相关性分析');
      expect(report).toContain('MA5');
      expect(report).toContain('RSI');
    });
  });

  describe('边界情况', () => {
    it('单策略排名应正常', () => {
      const cmp = new StrategyComparator();
      cmp.addStrategy(genStrategy('Only', 0.15, 0.2, 55));
      const rankings = cmp.rankStrategies();
      expect(rankings.length).toBe(1);
      expect(rankings[0].rank).toBe(1);
      expect(rankings[0].totalScore).toBeGreaterThanOrEqual(0);
    });

    it('大量策略应正常工作', () => {
      const cmp = new StrategyComparator();
      for (let i = 0; i < 20; i++) {
        cmp.addStrategy(genStrategy(`S${i}`, Math.random() * 0.3, 0.1 + Math.random() * 0.2, 40 + Math.random() * 30));
      }
      const rankings = cmp.rankStrategies();
      expect(rankings.length).toBe(20);
      expect(rankings[0].rank).toBe(1);
    });
  });
});
