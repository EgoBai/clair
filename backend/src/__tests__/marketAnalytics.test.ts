/**
 * 市场分析引擎测试
 */
import { describe, it, expect } from 'vitest';

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  marketCap: number;
  pe: number;
  industry: string;
}

function calcChange(q: StockQuote): number {
  return ((q.price - q.prevClose) / q.prevClose) * 100;
}

function calcAmplitude(q: StockQuote): number {
  return ((q.high - q.low) / q.prevClose) * 100;
}

function identifyLimitUp(q: StockQuote): boolean {
  const isST = q.name.includes('ST');
  return Math.abs(calcChange(q)) >= (isST ? 5 : 10) - 0.01;
}

function calcMarketBreadth(quotes: StockQuote[]): {
  advance: number;
  decline: number;
  unchanged: number;
  breadth: number;
} {
  let advance = 0, decline = 0, unchanged = 0;
  for (const q of quotes) {
    const change = calcChange(q);
    if (change > 0.01) advance++;
    else if (change < -0.01) decline++;
    else unchanged++;
  }
  return {
    advance,
    decline,
    unchanged,
    breadth: advance / Math.max(decline, 1),
  };
}

function calcTurnoverWeightedPrice(quotes: StockQuote[]): number {
  const totalTurnover = quotes.reduce((s, q) => s + q.turnover, 0);
  if (totalTurnover === 0) return 0;
  return quotes.reduce((s, q) => s + q.price * q.turnover, 0) / totalTurnover;
}

function rankByMetric(quotes: StockQuote[], metric: keyof StockQuote, ascending = false): StockQuote[] {
  return [...quotes].sort((a, b) => {
    const va = a[metric] as number;
    const vb = b[metric] as number;
    return ascending ? va - vb : vb - va;
  });
}

describe('市场分析引擎', () => {
  const mockQuotes: StockQuote[] = [
    { symbol: '600519', name: '贵州茅台', price: 1800, prevClose: 1750, volume: 50000, turnover: 90000000, high: 1820, low: 1740, marketCap: 22600, pe: 35, industry: '白酒' },
    { symbol: '000858', name: '五粮液', price: 168, prevClose: 170, volume: 80000, turnover: 13440000, high: 172, low: 165, marketCap: 6500, pe: 28, industry: '白酒' },
    { symbol: '300750', name: '宁德时代', price: 210, prevClose: 200, volume: 120000, turnover: 25200000, high: 215, low: 198, marketCap: 9800, pe: 45, industry: '新能源' },
    { symbol: '601318', name: '中国平安', price: 45.5, prevClose: 45.5, volume: 60000, turnover: 2730000, high: 46, low: 45, marketCap: 8900, pe: 8, industry: '金融' },
    { symbol: '002714', name: '牧原股份', price: 38, prevClose: 40, volume: 90000, turnover: 3420000, high: 40.5, low: 37.5, marketCap: 2100, pe: -15, industry: '农业' },
  ];

  describe('涨跌幅计算', () => {
    it('上涨股票涨跌幅为正', () => {
      expect(calcChange(mockQuotes[0])).toBeCloseTo(2.857, 1);
    });

    it('下跌股票涨跌幅为负', () => {
      expect(calcChange(mockQuotes[1])).toBeCloseTo(-1.176, 1);
    });

    it('平盘股票涨跌幅为0', () => {
      expect(calcChange(mockQuotes[3])).toBe(0);
    });

    it('涨停股票涨跌幅>=9.99', () => {
      const limitUp = { ...mockQuotes[0], price: 1925, prevClose: 1750 };
      expect(calcChange(limitUp)).toBeCloseTo(10);
      expect(identifyLimitUp(limitUp)).toBe(true);
    });

    it('ST股票涨停>=4.99', () => {
      const stStock = { ...mockQuotes[0], name: 'ST明科', price: 5.25, prevClose: 5.0 };
      expect(identifyLimitUp(stStock)).toBe(true);
    });

    it('振幅计算', () => {
      const amp = calcAmplitude(mockQuotes[0]);
      expect(amp).toBeCloseTo(4.57, 1);
    });

    it('振幅非负', () => {
      for (const q of mockQuotes) {
        expect(calcAmplitude(q)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('市场宽度', () => {
    it('涨跌家数正确统计', () => {
      const breadth = calcMarketBreadth(mockQuotes);
      expect(breadth.advance).toBe(2);
      expect(breadth.decline).toBe(2);
      expect(breadth.unchanged).toBe(1);
    });

    it('涨跌比计算', () => {
      const breadth = calcMarketBreadth(mockQuotes);
      expect(breadth.breadth).toBe(1);
    });

    it('全涨市场', () => {
      const allUp = mockQuotes.map(q => ({ ...q, price: q.prevClose + 10 }));
      const breadth = calcMarketBreadth(allUp);
      expect(breadth.advance).toBe(5);
      expect(breadth.decline).toBe(0);
      expect(breadth.breadth).toBe(5);
    });

    it('全跌市场', () => {
      const allDown = mockQuotes.map(q => ({ ...q, price: q.prevClose - 10 }));
      const breadth = calcMarketBreadth(allDown);
      expect(breadth.advance).toBe(0);
      expect(breadth.decline).toBe(5);
    });

    it('空市场', () => {
      const breadth = calcMarketBreadth([]);
      expect(breadth.advance).toBe(0);
      expect(breadth.breadth).toBe(0);
    });
  });

  describe('成交额加权均价', () => {
    it('计算加权均价', () => {
      const twap = calcTurnoverWeightedPrice(mockQuotes);
      expect(twap).toBeGreaterThan(0);
    });

    it('空数组返回0', () => {
      expect(calcTurnoverWeightedPrice([])).toBe(0);
    });

    it('零成交额返回0', () => {
      const zeroTurnover = mockQuotes.map(q => ({ ...q, turnover: 0 }));
      expect(calcTurnoverWeightedPrice(zeroTurnover)).toBe(0);
    });

    it('单股票加权均价等于其价格', () => {
      const twap = calcTurnoverWeightedPrice([mockQuotes[0]]);
      expect(twap).toBe(1800);
    });
  });

  describe('排名', () => {
    it('按市值降序排名', () => {
      const ranked = rankByMetric(mockQuotes, 'marketCap');
      expect(ranked[0].symbol).toBe('600519');
    });

    it('按PE升序排名', () => {
      const ranked = rankByMetric(mockQuotes, 'pe', true);
      expect(ranked[0].pe).toBe(-15);
    });

    it('按成交量降序排名', () => {
      const ranked = rankByMetric(mockQuotes, 'volume');
      expect(ranked[0].symbol).toBe('300750');
    });

    it('排名不修改原数组', () => {
      const original = [...mockQuotes];
      rankByMetric(mockQuotes, 'marketCap');
      expect(mockQuotes[0].symbol).toBe(original[0].symbol);
    });

    it('空数组排名', () => {
      expect(rankByMetric([], 'marketCap')).toEqual([]);
    });
  });
});
