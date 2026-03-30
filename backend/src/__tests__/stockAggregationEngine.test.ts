import { describe, it, expect } from 'vitest';

describe('股票数据聚合引擎', () => {
  // 市场宽度计算
  interface StockQuote {
    code: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    amount: number;
    high: number;
    low: number;
    open: number;
    preClose: number;
  }

  const calcMarketBreadth = (quotes: StockQuote[]) => {
    const advancing = quotes.filter(q => q.changePercent > 0).length;
    const declining = quotes.filter(q => q.changePercent < 0).length;
    const unchanged = quotes.filter(q => q.changePercent === 0).length;
    const limitUp = quotes.filter(q => q.changePercent >= 9.9).length;
    const limitDown = quotes.filter(q => q.changePercent <= -9.9).length;
    const totalAmount = quotes.reduce((sum, q) => sum + q.amount, 0);
    const avgChange = quotes.reduce((sum, q) => sum + q.changePercent, 0) / quotes.length;
    return { advancing, declining, unchanged, limitUp, limitDown, totalAmount, avgChange, total: quotes.length };
  };

  const genQuote = (changePercent: number): StockQuote => ({
    code: '000001', price: 10 + changePercent / 10, change: changePercent / 10,
    changePercent, volume: 1000000, amount: 10000000, high: 11, low: 9, open: 10, preClose: 10,
  });

  describe('市场宽度', () => {
    it('全涨', () => {
      const quotes = [genQuote(5), genQuote(3), genQuote(1)];
      const breadth = calcMarketBreadth(quotes);
      expect(breadth.advancing).toBe(3);
      expect(breadth.declining).toBe(0);
    });
    it('全跌', () => {
      const quotes = [genQuote(-5), genQuote(-3), genQuote(-1)];
      const breadth = calcMarketBreadth(quotes);
      expect(breadth.advancing).toBe(0);
      expect(breadth.declining).toBe(3);
    });
    it('涨跌各半', () => {
      const quotes = [genQuote(5), genQuote(-5), genQuote(3), genQuote(-3)];
      const breadth = calcMarketBreadth(quotes);
      expect(breadth.advancing).toBe(2);
      expect(breadth.declining).toBe(2);
    });
    it('涨停检测', () => {
      const quotes = [genQuote(10), genQuote(9.9), genQuote(5)];
      const breadth = calcMarketBreadth(quotes);
      expect(breadth.limitUp).toBe(2);
    });
    it('跌停检测', () => {
      const quotes = [genQuote(-10), genQuote(-9.9), genQuote(-5)];
      const breadth = calcMarketBreadth(quotes);
      expect(breadth.limitDown).toBe(2);
    });
    it('空市场', () => {
      const breadth = calcMarketBreadth([]);
      expect(breadth.total).toBe(0);
      expect(isNaN(breadth.avgChange)).toBe(true);
    });
    it('平均涨跌幅', () => {
      const quotes = [genQuote(10), genQuote(-10)];
      const breadth = calcMarketBreadth(quotes);
      expect(breadth.avgChange).toBeCloseTo(0);
    });
  });

  // 行业指数计算
  interface IndustryStock {
    code: string;
    name: string;
    changePercent: number;
    weight: number;
    volume: number;
  }

  const calcIndustryIndex = (stocks: IndustryStock[], method: 'equal' | 'weight' | 'volume' = 'equal') => {
    if (stocks.length === 0) return 0;
    if (method === 'equal') {
      return stocks.reduce((sum, s) => sum + s.changePercent, 0) / stocks.length;
    }
    if (method === 'weight') {
      const totalWeight = stocks.reduce((sum, s) => sum + s.weight, 0);
      if (totalWeight === 0) return 0;
      return stocks.reduce((sum, s) => sum + s.changePercent * (s.weight / totalWeight), 0);
    }
    // volume weighted
    const totalVol = stocks.reduce((sum, s) => sum + s.volume, 0);
    if (totalVol === 0) return 0;
    return stocks.reduce((sum, s) => sum + s.changePercent * (s.volume / totalVol), 0);
  };

  describe('行业指数计算', () => {
    const stocks: IndustryStock[] = [
      { code: '1', name: 'A', changePercent: 5, weight: 30, volume: 1000 },
      { code: '2', name: 'B', changePercent: -2, weight: 50, volume: 2000 },
      { code: '3', name: 'C', changePercent: 8, weight: 20, volume: 500 },
    ];

    it('等权指数', () => {
      const idx = calcIndustryIndex(stocks, 'equal');
      expect(idx).toBeCloseTo(3.667, 1);
    });
    it('加权指数', () => {
      const idx = calcIndustryIndex(stocks, 'weight');
      expect(idx).toBeCloseTo(2.1, 1);
    });
    it('成交量加权', () => {
      const idx = calcIndustryIndex(stocks, 'volume');
      expect(idx).toBeCloseTo(1.429, 1);
    });
    it('空行业', () => {
      expect(calcIndustryIndex([])).toBe(0);
    });
    it('单股票', () => {
      expect(calcIndustryIndex([{ code: '1', name: 'A', changePercent: 5, weight: 100, volume: 1000 }])).toBe(5);
    });
    it('零权重', () => {
      const zeroWeight = stocks.map(s => ({ ...s, weight: 0 }));
      expect(calcIndustryIndex(zeroWeight, 'weight')).toBe(0);
    });
    it('零成交量', () => {
      const zeroVol = stocks.map(s => ({ ...s, volume: 0 }));
      expect(calcIndustryIndex(zeroVol, 'volume')).toBe(0);
    });
  });

  // 量价分析
  const analyzeVolumePrice = (quotes: StockQuote[]) => {
    const results = [];
    for (let i = 1; i < quotes.length; i++) {
      const prev = quotes[i - 1];
      const curr = quotes[i];
      const volumeChange = (curr.volume - prev.volume) / prev.volume;
      const priceChange = curr.changePercent;
      let signal = 'neutral';
      if (priceChange > 0 && volumeChange > 0.5) signal = 'bullish_volume_up';
      else if (priceChange > 0 && volumeChange < -0.3) signal = 'bullish_volume_down';
      else if (priceChange < 0 && volumeChange > 0.5) signal = 'bearish_volume_up';
      else if (priceChange < 0 && volumeChange < -0.3) signal = 'bearish_volume_down';
      results.push({ index: i, signal, volumeChange, priceChange });
    }
    return results;
  };

  describe('量价分析', () => {
    it('价涨量增', () => {
      const quotes = [
        { ...genQuote(0), volume: 1000000 },
        { ...genQuote(5), volume: 2000000 },
      ];
      const signals = analyzeVolumePrice(quotes);
      expect(signals[0].signal).toBe('bullish_volume_up');
    });
    it('价涨量缩', () => {
      const quotes = [
        { ...genQuote(0), volume: 2000000 },
        { ...genQuote(5), volume: 1000000 },
      ];
      const signals = analyzeVolumePrice(quotes);
      expect(signals[0].signal).toBe('bullish_volume_down');
    });
    it('价跌量增', () => {
      const quotes = [
        { ...genQuote(0), volume: 1000000 },
        { ...genQuote(-5), volume: 2000000 },
      ];
      const signals = analyzeVolumePrice(quotes);
      expect(signals[0].signal).toBe('bearish_volume_up');
    });
    it('价跌量缩', () => {
      const quotes = [
        { ...genQuote(0), volume: 2000000 },
        { ...genQuote(-5), volume: 1000000 },
      ];
      const signals = analyzeVolumePrice(quotes);
      expect(signals[0].signal).toBe('bearish_volume_down');
    });
    it('中性信号', () => {
      const quotes = [
        { ...genQuote(0), volume: 1000000 },
        { ...genQuote(0.5), volume: 1100000 },
      ];
      const signals = analyzeVolumePrice(quotes);
      expect(signals[0].signal).toBe('neutral');
    });
    it('多日分析', () => {
      const quotes = [
        { ...genQuote(0), volume: 1000000 },
        { ...genQuote(5), volume: 2000000 },
        { ...genQuote(-3), volume: 500000 },
      ];
      const signals = analyzeVolumePrice(quotes);
      expect(signals.length).toBe(2);
    });
    it('单日无信号', () => {
      const signals = analyzeVolumePrice([genQuote(5)]);
      expect(signals.length).toBe(0);
    });
  });

  // 涨跌分布统计
  const calcChangeDistribution = (quotes: StockQuote[]) => {
    const buckets = {
      limitUp: 0, strongUp: 0, up: 0, flat: 0,
      down: 0, strongDown: 0, limitDown: 0,
    };
    for (const q of quotes) {
      const p = q.changePercent;
      if (p >= 9.9) buckets.limitUp++;
      else if (p >= 5) buckets.strongUp++;
      else if (p > 0) buckets.up++;
      else if (p === 0) buckets.flat++;
      else if (p > -5) buckets.down++;
      else if (p > -9.9) buckets.strongDown++;
      else buckets.limitDown++;
    }
    return buckets;
  };

  describe('涨跌分布', () => {
    it('各区间统计', () => {
      const quotes = [
        genQuote(10), genQuote(7), genQuote(3), genQuote(0),
        genQuote(-3), genQuote(-7), genQuote(-10),
      ];
      const dist = calcChangeDistribution(quotes);
      expect(dist.limitUp).toBe(1);
      expect(dist.strongUp).toBe(1);
      expect(dist.up).toBe(1);
      expect(dist.flat).toBe(1);
      expect(dist.down).toBe(1);
      expect(dist.strongDown).toBe(1);
      expect(dist.limitDown).toBe(1);
    });
    it('全部涨停', () => {
      const quotes = [genQuote(10), genQuote(10), genQuote(10)];
      const dist = calcChangeDistribution(quotes);
      expect(dist.limitUp).toBe(3);
    });
    it('空列表', () => {
      const dist = calcChangeDistribution([]);
      expect(Object.values(dist).every(v => v === 0)).toBe(true);
    });
    it('边界值', () => {
      const quotes = [genQuote(9.9), genQuote(5), genQuote(4.9)];
      const dist = calcChangeDistribution(quotes);
      expect(dist.limitUp).toBe(1);
      expect(dist.strongUp).toBe(1);
      expect(dist.up).toBe(1);
    });
    it('总数正确', () => {
      const quotes = [genQuote(1), genQuote(-1), genQuote(0), genQuote(5), genQuote(-5)];
      const dist = calcChangeDistribution(quotes);
      const total = Object.values(dist).reduce((a, b) => a + b, 0);
      expect(total).toBe(5);
    });
  });

  // 换手率分层
  const classifyTurnover = (rate: number): string => {
    if (rate >= 15) return 'extreme_high';
    if (rate >= 10) return 'very_high';
    if (rate >= 5) return 'high';
    if (rate >= 2) return 'normal';
    if (rate >= 0.5) return 'low';
    return 'very_low';
  };

  describe('换手率分层', () => {
    it('极高换手', () => expect(classifyTurnover(20)).toBe('extreme_high'));
    it('很高换手', () => expect(classifyTurnover(12)).toBe('very_high'));
    it('高换手', () => expect(classifyTurnover(7)).toBe('high'));
    it('正常换手', () => expect(classifyTurnover(3)).toBe('normal'));
    it('低换手', () => expect(classifyTurnover(1)).toBe('low'));
    it('极低换手', () => expect(classifyTurnover(0.1)).toBe('very_low'));
    it('边界值', () => expect(classifyTurnover(5)).toBe('high'));
    it('零换手', () => expect(classifyTurnover(0)).toBe('very_low'));
  });

  // 板块联动分析
  const analyzeSectorCorrelation = (sectorReturns: Record<string, number[]>) => {
    const sectors = Object.keys(sectorReturns);
    const correlations: { pair: string; correlation: number }[] = [];
    for (let i = 0; i < sectors.length; i++) {
      for (let j = i + 1; j < sectors.length; j++) {
        const a = sectorReturns[sectors[i]];
        const b = sectorReturns[sectors[j]];
        if (a.length !== b.length || a.length === 0) continue;
        const meanA = a.reduce((s, v) => s + v, 0) / a.length;
        const meanB = b.reduce((s, v) => s + v, 0) / b.length;
        let num = 0, denA = 0, denB = 0;
        for (let k = 0; k < a.length; k++) {
          num += (a[k] - meanA) * (b[k] - meanB);
          denA += (a[k] - meanA) ** 2;
          denB += (b[k] - meanB) ** 2;
        }
        const corr = denA === 0 || denB === 0 ? 0 : num / Math.sqrt(denA * denB);
        correlations.push({ pair: `${sectors[i]}-${sectors[j]}`, correlation: corr });
      }
    }
    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  };

  describe('板块联动分析', () => {
    it('完全正相关', () => {
      const result = analyzeSectorCorrelation({
        A: [1, 2, 3],
        B: [1, 2, 3],
      });
      expect(result[0].correlation).toBeCloseTo(1);
    });
    it('完全负相关', () => {
      const result = analyzeSectorCorrelation({
        A: [1, 2, 3],
        B: [3, 2, 1],
      });
      expect(result[0].correlation).toBeCloseTo(-1);
    });
    it('无相关', () => {
      const result = analyzeSectorCorrelation({
        A: [1, 1, 1],
        B: [2, 3, 4],
      });
      expect(result[0].correlation).toBe(0);
    });
    it('多板块', () => {
      const result = analyzeSectorCorrelation({
        A: [1, 2, 3],
        B: [2, 4, 6],
        C: [3, 2, 1],
      });
      expect(result.length).toBe(3); // C(3,2)
    });
    it('空数据', () => {
      expect(analyzeSectorCorrelation({})).toEqual([]);
    });
    it('单板块', () => {
      expect(analyzeSectorCorrelation({ A: [1, 2, 3] })).toEqual([]);
    });
    it('相关性范围', () => {
      const result = analyzeSectorCorrelation({
        A: [1, 5, 3, 8, 2],
        B: [4, 2, 6, 1, 9],
      });
      result.forEach(r => {
        expect(r.correlation).toBeGreaterThanOrEqual(-1);
        expect(r.correlation).toBeLessThanOrEqual(1);
      });
    });
  });
});
