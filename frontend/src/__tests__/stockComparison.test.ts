/**
 * 股票对比分析逻辑测试
 */
import { describe, it, expect } from 'vitest';

interface StockMetrics {
  symbol: string;
  name: string;
  pe: number;
  pb: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  revenueGrowth: number;
  debtRatio: number;
  dividendYield: number;
  price: number;
  changePercent: number;
}

function normalizeMetric(stocks: StockMetrics[], metric: keyof StockMetrics, higherIsBetter = true): Map<string, number> {
  const values = stocks.map(s => ({ symbol: s.symbol, value: s[metric] as number }));
  const vals = values.map(v => v.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  const result = new Map<string, number>();
  for (const v of values) {
    const normalized = range === 0 ? 50 : ((v.value - min) / range) * 100;
    result.set(v.symbol, higherIsBetter ? normalized : 100 - normalized);
  }
  return result;
}

function calculateRadarScores(stocks: StockMetrics[]): Map<string, Record<string, number>> {
  const dimensions: { key: keyof StockMetrics; higherIsBetter: boolean }[] = [
    { key: 'roe', higherIsBetter: true },
    { key: 'grossMargin', higherIsBetter: true },
    { key: 'revenueGrowth', higherIsBetter: true },
    { key: 'pe', higherIsBetter: false },
    { key: 'pb', higherIsBetter: false },
    { key: 'debtRatio', higherIsBetter: false },
  ];
  const result = new Map<string, Record<string, number>>();
  for (const stock of stocks) {
    result.set(stock.symbol, {});
  }
  for (const dim of dimensions) {
    const normalized = normalizeMetric(stocks, dim.key, dim.higherIsBetter);
    for (const [symbol, score] of normalized) {
      result.get(symbol)![dim.key as string] = score;
    }
  }
  return result;
}

function rankStocks(stocks: StockMetrics[]): { symbol: string; totalScore: number; rank: number }[] {
  const radarScores = calculateRadarScores(stocks);
  const withScores = stocks.map(s => {
    const scores = radarScores.get(s.symbol)!;
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
    return { symbol: s.symbol, totalScore };
  });
  withScores.sort((a, b) => b.totalScore - a.totalScore);
  return withScores.map((s, i) => ({ ...s, rank: i + 1 }));
}

function detectRelativeAdvantages(stocks: StockMetrics[]): Record<string, string[]> {
  const advantages: Record<string, string[]> = {};
  for (const s of stocks) advantages[s.symbol] = [];
  const metrics: { key: keyof StockMetrics; label: string; higherIsBetter: boolean }[] = [
    { key: 'pe', label: 'PE最低', higherIsBetter: false },
    { key: 'pb', label: 'PB最低', higherIsBetter: false },
    { key: 'roe', label: 'ROE最高', higherIsBetter: true },
    { key: 'grossMargin', label: '毛利率最高', higherIsBetter: true },
    { key: 'revenueGrowth', label: '增长最快', higherIsBetter: true },
    { key: 'dividendYield', label: '股息率最高', higherIsBetter: true },
  ];
  for (const m of metrics) {
    const vals = stocks.map(s => ({ symbol: s.symbol, value: s[m.key] as number }));
    const best = m.higherIsBetter
      ? vals.reduce((a, b) => a.value > b.value ? a : b)
      : vals.reduce((a, b) => a.value < b.value ? a : b);
    advantages[best.symbol].push(m.label);
  }
  return advantages;
}

describe('股票对比分析', () => {
  const stocks: StockMetrics[] = [
    { symbol: '600519', name: '贵州茅台', pe: 35, pb: 12, roe: 30, grossMargin: 91, netMargin: 50, revenueGrowth: 15, debtRatio: 20, dividendYield: 1.5, price: 1800, changePercent: 2.5 },
    { symbol: '000858', name: '五粮液', pe: 28, pb: 8, roe: 25, grossMargin: 75, netMargin: 35, revenueGrowth: 12, debtRatio: 25, dividendYield: 2.0, price: 168, changePercent: -1.2 },
    { symbol: '300750', name: '宁德时代', pe: 45, pb: 6, roe: 18, grossMargin: 28, netMargin: 12, revenueGrowth: 50, debtRatio: 55, dividendYield: 0.5, price: 210, changePercent: 5.0 },
  ];

  describe('指标归一化', () => {
    it('值域0-100', () => {
      const normalized = normalizeMetric(stocks, 'roe');
      for (const [, score] of normalized) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('最高值得到100', () => {
      const normalized = normalizeMetric(stocks, 'roe', true);
      expect(normalized.get('600519')).toBe(100);
    });

    it('最低值得到0', () => {
      const normalized = normalizeMetric(stocks, 'roe', true);
      expect(normalized.get('300750')).toBe(0);
    });

    it('反向指标反转', () => {
      const normalized = normalizeMetric(stocks, 'pe', false);
      expect(normalized.get('000858')).toBe(100); // PE最低
    });

    it('所有值相同得50', () => {
      const sameStocks = stocks.map(s => ({ ...s, roe: 20 }));
      const normalized = normalizeMetric(sameStocks, 'roe');
      for (const [, score] of normalized) {
        expect(score).toBe(50);
      }
    });
  });

  describe('雷达图评分', () => {
    it('每个股票6个维度', () => {
      const scores = calculateRadarScores(stocks);
      for (const [, dims] of scores) {
        expect(Object.keys(dims)).toHaveLength(6);
      }
    });

    it('分数在0-100之间', () => {
      const scores = calculateRadarScores(stocks);
      for (const [, dims] of scores) {
        for (const score of Object.values(dims)) {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('综合排名', () => {
    it('排名递增', () => {
      const ranking = rankStocks(stocks);
      for (let i = 1; i < ranking.length; i++) {
        expect(ranking[i].rank).toBe(ranking[i - 1].rank + 1);
      }
    });

    it('分数递减', () => {
      const ranking = rankStocks(stocks);
      for (let i = 1; i < ranking.length; i++) {
        expect(ranking[i].totalScore).toBeLessThanOrEqual(ranking[i - 1].totalScore);
      }
    });

    it('所有股票都有排名', () => {
      const ranking = rankStocks(stocks);
      expect(ranking).toHaveLength(3);
    });
  });

  describe('相对优势', () => {
    it('每个维度有胜出者', () => {
      const adv = detectRelativeAdvantages(stocks);
      const totalAdvantages = Object.values(adv).reduce((s, arr) => s + arr.length, 0);
      expect(totalAdvantages).toBe(6);
    });

    it('茅台ROE最高', () => {
      const adv = detectRelativeAdvantages(stocks);
      expect(adv['600519']).toContain('ROE最高');
    });

    it('宁德增长最快', () => {
      const adv = detectRelativeAdvantages(stocks);
      expect(adv['300750']).toContain('增长最快');
    });
  });
});
