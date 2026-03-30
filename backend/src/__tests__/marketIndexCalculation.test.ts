import { describe, it, expect } from 'vitest';

// 市场指数计算测试
describe('市场指数计算', () => {
  // 等权指数
  interface IndexComponent {
    symbol: string;
    price: number;
    prevClose: number;
    marketCap: number;
    freeFloat: number;
  }

  function calculateEqualWeightIndex(components: IndexComponent[], baseIndex: number = 1000): number {
    if (components.length === 0) return baseIndex;
    const totalChange = components.reduce((sum, c) => {
      return sum + (c.price / c.prevClose - 1);
    }, 0);
    return baseIndex * (1 + totalChange / components.length);
  }

  function calculateCapWeightedIndex(components: IndexComponent[], baseIndex: number = 1000): number {
    if (components.length === 0) return baseIndex;
    let totalWeight = 0;
    let weightedChange = 0;
    for (const c of components) {
      const weight = c.marketCap * c.freeFloat;
      totalWeight += weight;
      weightedChange += (c.price / c.prevClose - 1) * weight;
    }
    if (totalWeight === 0) return baseIndex;
    return baseIndex * (1 + weightedChange / totalWeight);
  }

  describe('等权指数', () => {
    it('所有股票不涨不跌应该保持原值', () => {
      const components: IndexComponent[] = [
        { symbol: 'A', price: 10, prevClose: 10, marketCap: 100, freeFloat: 1 },
        { symbol: 'B', price: 20, prevClose: 20, marketCap: 200, freeFloat: 1 },
      ];
      expect(calculateEqualWeightIndex(components)).toBe(1000);
    });

    it('一半涨一半跌相同幅度应该持平', () => {
      const components: IndexComponent[] = [
        { symbol: 'A', price: 11, prevClose: 10, marketCap: 100, freeFloat: 1 },
        { symbol: 'B', price: 9, prevClose: 10, marketCap: 100, freeFloat: 1 },
      ];
      expect(calculateEqualWeightIndex(components)).toBe(1000);
    });

    it('全部上涨应该增加', () => {
      const components: IndexComponent[] = [
        { symbol: 'A', price: 11, prevClose: 10, marketCap: 100, freeFloat: 1 },
        { symbol: 'B', price: 11, prevClose: 10, marketCap: 200, freeFloat: 1 },
      ];
      expect(calculateEqualWeightIndex(components)).toBe(1100);
    });

    it('全部下跌应该减少', () => {
      const components: IndexComponent[] = [
        { symbol: 'A', price: 9, prevClose: 10, marketCap: 100, freeFloat: 1 },
        { symbol: 'B', price: 9, prevClose: 10, marketCap: 200, freeFloat: 1 },
      ];
      expect(calculateEqualWeightIndex(components)).toBe(900);
    });

    it('空成分应该返回基准值', () => {
      expect(calculateEqualWeightIndex([])).toBe(1000);
    });

    it('应该支持自定义基准值', () => {
      const components: IndexComponent[] = [
        { symbol: 'A', price: 11, prevClose: 10, marketCap: 100, freeFloat: 1 },
      ];
      expect(calculateEqualWeightIndex(components, 500)).toBe(550);
    });

    it('大盘股和小盘股涨跌对等权影响相同', () => {
      const withBigCap: IndexComponent[] = [
        { symbol: 'A', price: 11, prevClose: 10, marketCap: 10000, freeFloat: 1 },
        { symbol: 'B', price: 10, prevClose: 10, marketCap: 100, freeFloat: 1 },
      ];
      const withSmallCap: IndexComponent[] = [
        { symbol: 'A', price: 10, prevClose: 10, marketCap: 10000, freeFloat: 1 },
        { symbol: 'B', price: 11, prevClose: 10, marketCap: 100, freeFloat: 1 },
      ];
      expect(calculateEqualWeightIndex(withBigCap)).toBe(calculateEqualWeightIndex(withSmallCap));
    });
  });

  describe('市值加权指数', () => {
    it('大市值股票涨跌影响更大', () => {
      const bigCapUp: IndexComponent[] = [
        { symbol: 'A', price: 11, prevClose: 10, marketCap: 10000, freeFloat: 1 },
        { symbol: 'B', price: 10, prevClose: 10, marketCap: 100, freeFloat: 1 },
      ];
      const smallCapUp: IndexComponent[] = [
        { symbol: 'A', price: 10, prevClose: 10, marketCap: 10000, freeFloat: 1 },
        { symbol: 'B', price: 11, prevClose: 10, marketCap: 100, freeFloat: 1 },
      ];
      expect(calculateCapWeightedIndex(bigCapUp)).toBeGreaterThan(calculateCapWeightedIndex(smallCapUp));
    });

    it('自由流通比例影响权重', () => {
      const highFloat: IndexComponent[] = [
        { symbol: 'A', price: 11, prevClose: 10, marketCap: 1000, freeFloat: 0.9 },
        { symbol: 'B', price: 10, prevClose: 10, marketCap: 1000, freeFloat: 0.1 },
      ];
      const lowFloat: IndexComponent[] = [
        { symbol: 'A', price: 10, prevClose: 10, marketCap: 1000, freeFloat: 0.9 },
        { symbol: 'B', price: 11, prevClose: 10, marketCap: 1000, freeFloat: 0.1 },
      ];
      // 高自由流通比例股票涨跌影响更大
      expect(calculateCapWeightedIndex(highFloat)).toBeGreaterThan(calculateCapWeightedIndex(lowFloat));
    });

    it('所有股票不涨不跌应该保持原值', () => {
      const components: IndexComponent[] = [
        { symbol: 'A', price: 10, prevClose: 10, marketCap: 1000, freeFloat: 0.5 },
        { symbol: 'B', price: 20, prevClose: 20, marketCap: 2000, freeFloat: 0.8 },
      ];
      expect(calculateCapWeightedIndex(components)).toBe(1000);
    });

    it('空成分应该返回基准值', () => {
      expect(calculateCapWeightedIndex([])).toBe(1000);
    });
  });

  // 涨跌家数统计
  describe('涨跌家数统计', () => {
    interface StockQuote {
      symbol: string;
      price: number;
      prevClose: number;
    }

    function countMarketStats(quotes: StockQuote[]) {
      let up = 0, down = 0, flat = 0, limitUp = 0, limitDown = 0;
      for (const q of quotes) {
        const change = (q.price - q.prevClose) / q.prevClose;
        if (change > 0) up++;
        else if (change < 0) down++;
        else flat++;
        if (change >= 0.1) limitUp++;
        if (change <= -0.1) limitDown++;
      }
      return { up, down, flat, limitUp, limitDown, total: quotes.length };
    }

    it('应该正确统计涨跌家数', () => {
      const quotes: StockQuote[] = [
        { symbol: 'A', price: 11, prevClose: 10 },
        { symbol: 'B', price: 9, prevClose: 10 },
        { symbol: 'C', price: 10, prevClose: 10 },
        { symbol: 'D', price: 12, prevClose: 10 },
      ];
      const stats = countMarketStats(quotes);
      expect(stats.up).toBe(2);
      expect(stats.down).toBe(1);
      expect(stats.flat).toBe(1);
      expect(stats.total).toBe(4);
    });

    it('应该正确识别涨停', () => {
      const quotes: StockQuote[] = [
        { symbol: 'A', price: 11, prevClose: 10 },
        { symbol: 'B', price: 10.5, prevClose: 10 },
      ];
      const stats = countMarketStats(quotes);
      expect(stats.limitUp).toBe(1);
    });

    it('应该正确识别跌停', () => {
      const quotes: StockQuote[] = [
        { symbol: 'A', price: 9, prevClose: 10 },
        { symbol: 'B', price: 9.5, prevClose: 10 },
      ];
      const stats = countMarketStats(quotes);
      expect(stats.limitDown).toBe(1);
    });

    it('空数据应该全部为零', () => {
      const stats = countMarketStats([]);
      expect(stats.up).toBe(0);
      expect(stats.down).toBe(0);
      expect(stats.flat).toBe(0);
      expect(stats.total).toBe(0);
    });

    it('涨跌家数加总应该等于总数', () => {
      const quotes: StockQuote[] = [
        { symbol: 'A', price: 11, prevClose: 10 },
        { symbol: 'B', price: 9, prevClose: 10 },
        { symbol: 'C', price: 10, prevClose: 10 },
        { symbol: 'D', price: 11, prevClose: 10 },
        { symbol: 'E', price: 9, prevClose: 10 },
      ];
      const stats = countMarketStats(quotes);
      expect(stats.up + stats.down + stats.flat).toBe(stats.total);
    });
  });

  // 涨跌比计算
  describe('涨跌比与情绪指标', () => {
    function calculateAdvanceDeclineRatio(up: number, down: number): number {
      if (down === 0) return up > 0 ? Infinity : 1;
      return up / down;
    }

    function getMarketSentiment(adRatio: number): 'extreme_bullish' | 'bullish' | 'neutral' | 'bearish' | 'extreme_bearish' {
      if (adRatio >= 3) return 'extreme_bullish';
      if (adRatio >= 1.5) return 'bullish';
      if (adRatio >= 0.67) return 'neutral';
      if (adRatio >= 0.33) return 'bearish';
      return 'extreme_bearish';
    }

    it('涨跌相等应该比值为1', () => {
      expect(calculateAdvanceDeclineRatio(100, 100)).toBe(1);
    });

    it('全涨应该比值为Infinity', () => {
      expect(calculateAdvanceDeclineRatio(100, 0)).toBe(Infinity);
    });

    it('全跌应该比值为0', () => {
      expect(calculateAdvanceDeclineRatio(0, 100)).toBe(0);
    });

    it('涨多跌少应该比值大于1', () => {
      expect(calculateAdvanceDeclineRatio(200, 100)).toBe(2);
    });

    it('极端看涨情绪应该正确判断', () => {
      expect(getMarketSentiment(3)).toBe('extreme_bullish');
      expect(getMarketSentiment(10)).toBe('extreme_bullish');
    });

    it('中性情绪应该正确判断', () => {
      expect(getMarketSentiment(1)).toBe('neutral');
      expect(getMarketSentiment(0.8)).toBe('neutral');
    });

    it('极端看跌情绪应该正确判断', () => {
      expect(getMarketSentiment(0.1)).toBe('extreme_bearish');
    });

    it('看涨情绪应该正确判断', () => {
      expect(getMarketSentiment(1.5)).toBe('bullish');
      expect(getMarketSentiment(2)).toBe('bullish');
    });

    it('看跌情绪应该正确判断', () => {
      expect(getMarketSentiment(0.5)).toBe('bearish');
      expect(getMarketSentiment(0.33)).toBe('bearish');
    });
  });

  // 板块轮动评分
  describe('板块动量评分', () => {
    interface SectorData {
      name: string;
      changePercent: number;
      volumeRatio: number; // 量比
      fundFlow: number; // 资金净流入(亿)
    }

    function calculateSectorMomentum(sector: SectorData): number {
      const priceScore = Math.min(100, Math.max(0, (sector.changePercent + 10) * 5));
      const volumeScore = Math.min(100, Math.max(0, sector.volumeRatio * 40));
      const flowScore = Math.min(100, Math.max(0, (sector.fundFlow + 50) * 1));
      return priceScore * 0.4 + volumeScore * 0.3 + flowScore * 0.3;
    }

    it('强势板块应该有高分', () => {
      const sector: SectorData = { name: '强势', changePercent: 5, volumeRatio: 2, fundFlow: 30 };
      const score = calculateSectorMomentum(sector);
      expect(score).toBeGreaterThan(70);
    });

    it('弱势板块应该有低分', () => {
      const sector: SectorData = { name: '弱势', changePercent: -5, volumeRatio: 0.5, fundFlow: -30 };
      const score = calculateSectorMomentum(sector);
      expect(score).toBeLessThan(50);
    });

    it('中性板块应该分数适中', () => {
      const sector: SectorData = { name: '中性', changePercent: 0, volumeRatio: 1, fundFlow: 0 };
      const score = calculateSectorMomentum(sector);
      expect(score).toBeGreaterThan(30);
      expect(score).toBeLessThan(70);
    });

    it('评分应该在0-100范围内', () => {
      const extreme: SectorData = { name: '极端', changePercent: -10, volumeRatio: 0, fundFlow: -50 };
      const score = calculateSectorMomentum(extreme);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('排序应该正确反映强弱', () => {
      const sectors: SectorData[] = [
        { name: 'A', changePercent: 3, volumeRatio: 1.5, fundFlow: 10 },
        { name: 'B', changePercent: -2, volumeRatio: 0.8, fundFlow: -10 },
        { name: 'C', changePercent: 5, volumeRatio: 2, fundFlow: 20 },
      ];
      const scored = sectors.map(s => ({ name: s.name, score: calculateSectorMomentum(s) }));
      scored.sort((a, b) => b.score - a.score);
      expect(scored[0].name).toBe('C');
      expect(scored[2].name).toBe('B');
    });
  });
});
