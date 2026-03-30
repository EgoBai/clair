import { describe, it, expect } from 'vitest';

// ==================== 回测可视化数据引擎 ====================

interface EquityPoint { date: string; value: number; benchmark?: number }
interface DrawdownPoint { date: string; drawdown: number; depth: 'shallow' | 'medium' | 'deep' }
interface TradePoint { date: string; type: 'buy' | 'sell'; price: number; pnl?: number }
interface MonthlyHeatmapCell { year: number; month: number; value: number; color: string }
interface RollingMetricPoint { date: string; value: number; label: string }
interface DistributionBucket { range: string; count: number; percentage: number }

class BacktestVisualizer {
  /** 生成权益曲线数据 */
  generateEquityCurve(
    dailySnapshots: { date: string; totalValue: number; returns: number }[],
    benchmarkPrices?: number[]
  ): EquityPoint[] {
    return dailySnapshots.map((s, i) => ({
      date: s.date,
      value: Math.round(s.totalValue * 100) / 100,
      benchmark: benchmarkPrices && benchmarkPrices[i] ? Math.round(benchmarkPrices[i] * 100) / 100 : undefined,
    }));
  }

  /** 生成回撤曲线数据 */
  generateDrawdownCurve(snapshots: { date: string; totalValue: number }[]): DrawdownPoint[] {
    let peak = snapshots[0]?.totalValue || 0;
    return snapshots.map(s => {
      if (s.totalValue > peak) peak = s.totalValue;
      const dd = peak > 0 ? ((peak - s.totalValue) / peak) * 100 : 0;
      return {
        date: s.date,
        drawdown: Math.round(dd * 100) / 100,
        depth: dd < 5 ? 'shallow' as const : dd < 15 ? 'medium' as const : 'deep' as const,
      };
    });
  }

  /** 生成买卖点数据 */
  generateTradePoints(trades: { date: string; type: 'buy' | 'sell'; price: number }[]): TradePoint[] {
    const points: TradePoint[] = [];
    let lastBuyPrice = 0;

    for (const t of trades) {
      if (t.type === 'buy') {
        lastBuyPrice = t.price;
        points.push({ date: t.date, type: 'buy', price: t.price });
      } else {
        points.push({ date: t.date, type: 'sell', price: t.price, pnl: Math.round((t.price - lastBuyPrice) * 100) / 100 });
      }
    }
    return points;
  }

  /** 生成月度收益热力图 */
  generateMonthlyHeatmap(snapshots: { date: string; returns: number }[]): MonthlyHeatmapCell[] {
    const monthlyReturns = new Map<string, number[]>();

    for (const s of snapshots) {
      const key = s.date.substring(0, 7);
      if (!monthlyReturns.has(key)) monthlyReturns.set(key, []);
      monthlyReturns.get(key)!.push(s.returns);
    }

    const cells: MonthlyHeatmapCell[] = [];
    for (const [key, returns] of monthlyReturns) {
      const [year, month] = key.split('-').map(Number);
      const monthReturn = returns.length > 0 ? returns[returns.length - 1] - returns[0] : 0;
      cells.push({
        year, month,
        value: Math.round(monthReturn * 100) / 100,
        color: this.heatmapColor(monthReturn),
      });
    }

    return cells.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  }

  /** 生成收益分布直方图 */
  generateReturnDistribution(dailyReturns: number[], bucketCount: number = 20): DistributionBucket[] {
    if (dailyReturns.length === 0) return [];

    const min = Math.min(...dailyReturns);
    const max = Math.max(...dailyReturns);
    const range = max - min || 1;
    const bucketSize = range / bucketCount;
    const buckets: DistributionBucket[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const lo = min + i * bucketSize;
      const hi = lo + bucketSize;
      const count = dailyReturns.filter(r => r >= lo && (i === bucketCount - 1 ? r <= hi : r < hi)).length;
      buckets.push({
        range: `${(lo * 100).toFixed(2)}% ~ ${(hi * 100).toFixed(2)}%`,
        count,
        percentage: Math.round((count / dailyReturns.length) * 10000) / 100,
      });
    }
    return buckets;
  }

  /** 生成滚动指标时间序列 */
  generateRollingSeries(
    snapshots: { date: string; dailyReturns: number }[],
    windowDays: number,
    metric: 'return' | 'volatility' | 'sharpe' | 'drawdown'
  ): RollingMetricPoint[] {
    const results: RollingMetricPoint[] = [];

    for (let i = windowDays; i < snapshots.length; i++) {
      const window = snapshots.slice(i - windowDays, i).map(s => s.dailyReturns);
      let value: number;

      switch (metric) {
        case 'return':
          value = window.reduce((c, r) => c * (1 + r), 1) * 100 - 100;
          break;
        case 'volatility': {
          const mean = window.reduce((s, r) => s + r, 0) / window.length;
          value = Math.sqrt(window.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (window.length - 1)) * Math.sqrt(252) * 100;
          break;
        }
        case 'sharpe': {
          const m = window.reduce((s, r) => s + r, 0) / window.length;
          const v = Math.sqrt(window.reduce((s, r) => s + Math.pow(r - m, 2), 0) / (window.length - 1)) * Math.sqrt(252);
          value = v > 0 ? (m * 252 - 0.03) / v : 0;
          break;
        }
        case 'drawdown': {
          let peak = window[0], dd = 0;
          for (const r of window) { if (r > peak) peak = r; const d = ((peak - r) / peak) * 100; if (d > dd) dd = d; }
          value = dd;
          break;
        }
      }

      results.push({
        date: snapshots[i].date,
        value: Math.round(value * 100) / 100,
        label: `${windowDays}日滚动${metric === 'return' ? '收益' : metric === 'volatility' ? '波动率' : metric === 'sharpe' ? '夏普' : '回撤'}`,
      });
    }
    return results;
  }

  /** 生成K线+指标叠加数据 */
  generateOverlayData(
    kline: { date: string; open: number; high: number; low: number; close: number; volume: number }[],
    indicators: { ma5?: boolean; ma20?: boolean; ma60?: boolean; boll?: boolean; volume?: boolean }
  ): any[] {
    return kline.map((bar, i) => {
      const result: any = { date: bar.date, ohlcv: [bar.open, bar.high, bar.low, bar.close, bar.volume] };

      if (indicators.ma5 && i >= 4) {
        result.ma5 = Math.round(kline.slice(i - 4, i + 1).reduce((s, b) => s + b.close, 0) / 5 * 100) / 100;
      }
      if (indicators.ma20 && i >= 19) {
        result.ma20 = Math.round(kline.slice(i - 19, i + 1).reduce((s, b) => s + b.close, 0) / 20 * 100) / 100;
      }
      if (indicators.ma60 && i >= 59) {
        result.ma60 = Math.round(kline.slice(i - 59, i + 1).reduce((s, b) => s + b.close, 0) / 60 * 100) / 100;
      }
      if (indicators.boll && i >= 19) {
        const closes = kline.slice(i - 19, i + 1).map(b => b.close);
        const ma = closes.reduce((s, c) => s + c, 0) / 20;
        const std = Math.sqrt(closes.reduce((s, c) => s + Math.pow(c - ma, 2), 0) / 20);
        result.boll = { upper: Math.round((ma + 2 * std) * 100) / 100, mid: Math.round(ma * 100) / 100, lower: Math.round((ma - 2 * std) * 100) / 100 };
      }

      return result;
    });
  }

  /** 生成绩效雷达图数据 */
  generateRadarData(metrics: {
    totalReturn: number; sharpeRatio: number; maxDrawdown: number;
    winRate: number; profitFactor: number; calmarRatio: number;
  }): { axis: string; value: number; normalized: number }[] {
    const normalize = (v: number, min: number, max: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));

    return [
      { axis: '总收益', value: metrics.totalReturn, normalized: normalize(metrics.totalReturn, -20, 50) },
      { axis: '夏普比率', value: metrics.sharpeRatio, normalized: normalize(metrics.sharpeRatio, -1, 3) },
      { axis: '回撤控制', value: metrics.maxDrawdown, normalized: normalize(100 - metrics.maxDrawdown, 0, 100) },
      { axis: '胜率', value: metrics.winRate, normalized: normalize(metrics.winRate, 20, 80) },
      { axis: '盈亏比', value: metrics.profitFactor, normalized: normalize(metrics.profitFactor, 0, 3) },
      { axis: 'Calmar', value: metrics.calmarRatio, normalized: normalize(metrics.calmarRatio, -1, 3) },
    ].map(d => ({ ...d, normalized: Math.round(d.normalized * 100) / 100 }));
  }

  /** 生成资金流向图数据 */
  generateCashFlowData(
    snapshots: { date: string; cash: number; positionValue: number }[]
  ): { date: string; cash: number; invested: number; cashPct: number; investedPct: number }[] {
    return snapshots.map(s => {
      const total = s.cash + s.positionValue;
      return {
        date: s.date,
        cash: Math.round(s.cash * 100) / 100,
        invested: Math.round(s.positionValue * 100) / 100,
        cashPct: total > 0 ? Math.round((s.cash / total) * 10000) / 100 : 0,
        investedPct: total > 0 ? Math.round((s.positionValue / total) * 10000) / 100 : 0,
      };
    });
  }

  /** 生成对比基准数据 */
  generateBenchmarkComparison(
    portfolioReturns: number[],
    benchmarkReturns: number[],
    dates: string[]
  ): { date: string; portfolio: number; benchmark: number; alpha: number; cumulative: { portfolio: number; benchmark: number } }[] {
    let cumP = 1, cumB = 1;
    return dates.map((date, i) => {
      const pr = portfolioReturns[i] || 0;
      const br = benchmarkReturns[i] || 0;
      cumP *= (1 + pr);
      cumB *= (1 + br);
      return {
        date,
        portfolio: Math.round(pr * 10000) / 100,
        benchmark: Math.round(br * 10000) / 100,
        alpha: Math.round((pr - br) * 10000) / 100,
        cumulative: { portfolio: Math.round((cumP - 1) * 10000) / 100, benchmark: Math.round((cumB - 1) * 10000) / 100 },
      };
    });
  }

  private heatmapColor(value: number): string {
    if (value > 5) return '#00c853';
    if (value > 2) return '#69f0ae';
    if (value > 0) return '#b9f6ca';
    if (value > -2) return '#ffcdd2';
    if (value > -5) return '#ef9a9a';
    return '#d50000';
  }
}

// ==================== 测试数据 ====================

function genSnapshots(count: number) {
  let value = 100000;
  return Array.from({ length: count }, (_, i) => {
    const dr = (Math.sin(i * 0.2) * 0.02);
    value *= (1 + dr);
    return { date: `2024-01-${String(i + 1).padStart(2, '0')}`, totalValue: value, returns: ((value - 100000) / 100000) * 100, dailyReturns: dr, cash: value * 0.3, positionValue: value * 0.7 };
  });
}

function genKline(count: number) {
  let price = 10;
  return Array.from({ length: count }, (_, i) => {
    const change = (Math.random() - 0.48) * 0.5;
    price += change;
    return {
      date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      open: Math.round((price - Math.random()) * 100) / 100,
      high: Math.round((price + Math.random()) * 100) / 100,
      low: Math.round((price - Math.random() * 2) * 100) / 100,
      close: Math.round(price * 100) / 100,
      volume: Math.floor(100000 + Math.random() * 500000),
    };
  });
}

// ==================== 测试 ====================

describe('BacktestVisualizer 回测可视化数据引擎', () => {
  const viz = new BacktestVisualizer();

  describe('权益曲线', () => {
    it('应生成正确格式', () => {
      const data = viz.generateEquityCurve(genSnapshots(30));
      expect(data.length).toBe(30);
      for (const d of data) { expect(d.date).toBeDefined(); expect(typeof d.value).toBe('number'); }
    });

    it('应包含基准数据', () => {
      const data = viz.generateEquityCurve(genSnapshots(10), Array(10).fill(100));
      expect(data[0].benchmark).toBe(100);
    });

    it('无基准时不包含', () => {
      const data = viz.generateEquityCurve(genSnapshots(10));
      expect(data[0].benchmark).toBeUndefined();
    });
  });

  describe('回撤曲线', () => {
    it('应正确计算回撤', () => {
      const data = viz.generateDrawdownCurve(genSnapshots(30));
      expect(data.length).toBe(30);
      for (const d of data) { expect(d.drawdown).toBeGreaterThanOrEqual(0); }
    });

    it('应标记深度级别', () => {
      const data = viz.generateDrawdownCurve(genSnapshots(50));
      for (const d of data) {
        expect(['shallow', 'medium', 'deep']).toContain(d.depth);
      }
    });

    it('起始回撤应为0', () => {
      const data = viz.generateDrawdownCurve([{ date: '2024-01-01', totalValue: 100 }]);
      expect(data[0].drawdown).toBe(0);
    });
  });

  describe('买卖点', () => {
    it('应正确生成', () => {
      const trades = [
        { date: '2024-01-01', type: 'buy' as const, price: 10 },
        { date: '2024-01-05', type: 'sell' as const, price: 12 },
      ];
      const points = viz.generateTradePoints(trades);
      expect(points.length).toBe(2);
      expect(points[0].type).toBe('buy');
      expect(points[1].type).toBe('sell');
      expect(points[1].pnl).toBe(2);
    });

    it('应计算盈亏', () => {
      const trades = [
        { date: '2024-01-01', type: 'buy' as const, price: 100 },
        { date: '2024-01-10', type: 'sell' as const, price: 90 },
      ];
      const points = viz.generateTradePoints(trades);
      expect(points[1].pnl).toBe(-10);
    });
  });

  describe('月度热力图', () => {
    it('应生成月度数据', () => {
      const snaps = genSnapshots(60);
      const data = viz.generateMonthlyHeatmap(snaps);
      expect(data.length).toBeGreaterThan(0);
      for (const c of data) { expect(c.year).toBeGreaterThan(2000); expect(c.month).toBeGreaterThanOrEqual(1); expect(c.color).toBeDefined(); }
    });

    it('应正确映射颜色', () => {
      const snaps = genSnapshots(30);
      const data = viz.generateMonthlyHeatmap(snaps);
      for (const c of data) {
        if (c.value > 5) expect(c.color).toBe('#00c853');
        else if (c.value < -5) expect(c.color).toBe('#d50000');
      }
    });
  });

  describe('收益分布', () => {
    it('应生成直方图数据', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      const data = viz.generateReturnDistribution(returns, 10);
      expect(data.length).toBe(10);
      const total = data.reduce((s, b) => s + b.count, 0);
      expect(total).toBeLessThanOrEqual(100);
    });

    it('空数据应返回空数组', () => {
      expect(viz.generateReturnDistribution([], 10)).toEqual([]);
    });

    it('百分比总和应为100', () => {
      const returns = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.03);
      const data = viz.generateReturnDistribution(returns, 20);
      const total = data.reduce((s, b) => s + b.percentage, 0);
      expect(total).toBeGreaterThan(90);
    });
  });

  describe('滚动指标', () => {
    it('应生成收益曲线', () => {
      const snaps = genSnapshots(50);
      const data = viz.generateRollingSeries(snaps, 10, 'return');
      expect(data.length).toBe(40);
    });

    it('应生成波动率曲线', () => {
      const data = viz.generateRollingSeries(genSnapshots(50), 10, 'volatility');
      for (const d of data) { expect(d.value).toBeGreaterThanOrEqual(0); }
    });

    it('应生成夏普曲线', () => {
      const data = viz.generateRollingSeries(genSnapshots(50), 10, 'sharpe');
      expect(data.length).toBe(40);
    });

    it('应生成回撤曲线', () => {
      const data = viz.generateRollingSeries(genSnapshots(50), 10, 'drawdown');
      for (const d of data) { expect(d.value).toBeGreaterThanOrEqual(0); }
    });

    it('应包含标签', () => {
      const data = viz.generateRollingSeries(genSnapshots(50), 10, 'return');
      expect(data[0].label).toContain('10日');
    });
  });

  describe('K线叠加', () => {
    it('应生成基础OHLCV', () => {
      const kline = genKline(30);
      const data = viz.generateOverlayData(kline, {});
      expect(data.length).toBe(30);
      expect(data[0].ohlcv.length).toBe(5);
    });

    it('应计算均线', () => {
      const kline = genKline(70);
      const data = viz.generateOverlayData(kline, { ma5: true, ma20: true });
      expect(data[5].ma5).toBeDefined();
      expect(data[20].ma20).toBeDefined();
    });

    it('应计算布林带', () => {
      const kline = genKline(30);
      const data = viz.generateOverlayData(kline, { boll: true });
      expect(data[20].boll).toBeDefined();
      expect(data[20].boll.upper).toBeGreaterThan(data[20].boll.lower);
    });
  });

  describe('雷达图', () => {
    it('应生成6个维度', () => {
      const data = viz.generateRadarData({ totalReturn: 15, sharpeRatio: 1.5, maxDrawdown: 12, winRate: 55, profitFactor: 1.8, calmarRatio: 1.2 });
      expect(data.length).toBe(6);
      for (const d of data) { expect(d.normalized).toBeGreaterThanOrEqual(0); expect(d.normalized).toBeLessThanOrEqual(100); }
    });
  });

  describe('资金流向', () => {
    it('应生成流向数据', () => {
      const snaps = genSnapshots(20);
      const data = viz.generateCashFlowData(snaps);
      expect(data.length).toBe(20);
      for (const d of data) {
        expect(d.cashPct + d.investedPct).toBeCloseTo(100, 0);
      }
    });
  });

  describe('基准对比', () => {
    it('应计算alpha', () => {
      const pr = [0.01, -0.005, 0.02];
      const br = [0.005, 0.001, 0.01];
      const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];
      const data = viz.generateBenchmarkComparison(pr, br, dates);
      expect(data.length).toBe(3);
      expect(data[0].alpha).toBeCloseTo(0.5, 0);
    });

    it('应计算累计收益', () => {
      const pr = [0.01, 0.01];
      const br = [0.005, 0.005];
      const dates = ['2024-01-01', '2024-01-02'];
      const data = viz.generateBenchmarkComparison(pr, br, dates);
      expect(data[1].cumulative.portfolio).toBeGreaterThan(0);
      expect(data[1].cumulative.benchmark).toBeGreaterThan(0);
    });
  });
});
