import { describe, it, expect } from 'vitest';

/**
 * 高级筛选器 - 技术指标筛选测试
 */

interface TechnicalCriteria {
  rsi?: { min?: number; max?: number };
  macd?: { signal: 'bullish' | 'bearish' | 'any' };
  bollinger?: { position: 'upper' | 'middle' | 'lower' | 'any' };
  ma?: { above?: number; below?: number }; // MA period
  volume?: { minRatio?: number }; // volume / avgVolume
  kdj?: { signal: 'golden' | 'death' | 'any' };
}

interface StockTechnicalData {
  code: string;
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  bollinger: { upper: number; middle: number; lower: number; price: number };
  ma: Record<number, number>;
  volume: number;
  avgVolume: number;
  kdj: { k: number; d: number; j: number };
  price: number;
}

function filterByTechnical(data: StockTechnicalData[], criteria: TechnicalCriteria): StockTechnicalData[] {
  return data.filter(stock => {
    if (criteria.rsi) {
      if (criteria.rsi.min !== undefined && stock.rsi < criteria.rsi.min) return false;
      if (criteria.rsi.max !== undefined && stock.rsi > criteria.rsi.max) return false;
    }

    if (criteria.macd && criteria.macd.signal !== 'any') {
      if (criteria.macd.signal === 'bullish' && stock.macd.histogram <= 0) return false;
      if (criteria.macd.signal === 'bearish' && stock.macd.histogram >= 0) return false;
    }

    if (criteria.bollinger && criteria.bollinger.position !== 'any') {
      const { price, upper, middle, lower } = stock.bollinger;
      if (criteria.bollinger.position === 'upper' && price < middle) return false;
      if (criteria.bollinger.position === 'lower' && price > middle) return false;
      if (criteria.bollinger.position === 'middle' && (price < lower || price > upper)) return false;
    }

    if (criteria.ma) {
      if (criteria.ma.above !== undefined) {
        const maVal = stock.ma[criteria.ma.above];
        if (maVal !== undefined && stock.price <= maVal) return false;
      }
      if (criteria.ma.below !== undefined) {
        const maVal = stock.ma[criteria.ma.below];
        if (maVal !== undefined && stock.price >= maVal) return false;
      }
    }

    if (criteria.volume) {
      const ratio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 0;
      if (criteria.volume.minRatio !== undefined && ratio < criteria.volume.minRatio) return false;
    }

    if (criteria.kdj && criteria.kdj.signal !== 'any') {
      if (criteria.kdj.signal === 'golden' && stock.kdj.k <= stock.kdj.d) return false;
      if (criteria.kdj.signal === 'death' && stock.kdj.k >= stock.kdj.d) return false;
    }

    return true;
  });
}

function calcRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function calcMACD(prices: number[]): { value: number; signal: number; histogram: number } {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const dif = ema12 - ema26;
  const dea = dif * 0.2 + (prices.length > 1 ? calcMACD(prices.slice(0, -1)).signal * 0.8 : dif);
  return { value: dif, signal: dea, histogram: dif - dea };
}

function calcEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

describe('Advanced Screener - Technical', () => {
  const stocks: StockTechnicalData[] = [
    {
      code: '000001', rsi: 70, price: 12.5,
      macd: { value: 0.5, signal: 0.3, histogram: 0.2 },
      bollinger: { upper: 13, middle: 12, lower: 11, price: 12.5 },
      ma: { 5: 12.3, 10: 12.0, 20: 11.5, 60: 10.0 },
      volume: 5000000, avgVolume: 3000000,
      kdj: { k: 80, d: 70, j: 90 },
    },
    {
      code: '600519', rsi: 30, price: 1800,
      macd: { value: -5, signal: -3, histogram: -2 },
      bollinger: { upper: 1850, middle: 1800, lower: 1750, price: 1780 },
      ma: { 5: 1810, 10: 1820, 20: 1830, 60: 1850 },
      volume: 800000, avgVolume: 1000000,
      kdj: { k: 20, d: 30, j: 10 },
    },
    {
      code: '300750', rsi: 50, price: 200,
      macd: { value: 2, signal: 2, histogram: 0 },
      bollinger: { upper: 210, middle: 200, lower: 190, price: 200 },
      ma: { 5: 200, 10: 198, 20: 195, 60: 190 },
      volume: 2000000, avgVolume: 2000000,
      kdj: { k: 50, d: 50, j: 50 },
    },
  ];

  describe('RSI筛选', () => {
    it('应该筛选超买股票', () => {
      const result = filterByTechnical(stocks, { rsi: { min: 70 } });
      expect(result.length).toBe(1);
      expect(result[0].code).toBe('000001');
    });

    it('应该筛选超卖股票', () => {
      const result = filterByTechnical(stocks, { rsi: { max: 30 } });
      expect(result.length).toBe(1);
      expect(result[0].code).toBe('600519');
    });

    it('应该筛选RSI区间', () => {
      const result = filterByTechnical(stocks, { rsi: { min: 25, max: 55 } });
      expect(result.length).toBe(2);
    });
  });

  describe('MACD筛选', () => {
    it('应该筛选金叉股票', () => {
      const result = filterByTechnical(stocks, { macd: { signal: 'bullish' } });
      expect(result.some(s => s.code === '000001')).toBe(true);
    });

    it('应该筛选死叉股票', () => {
      const result = filterByTechnical(stocks, { macd: { signal: 'bearish' } });
      expect(result.some(s => s.code === '600519')).toBe(true);
    });
  });

  describe('布林带筛选', () => {
    it('应该筛选上轨附近股票', () => {
      const result = filterByTechnical(stocks, { bollinger: { position: 'upper' } });
      expect(result.some(s => s.code === '000001')).toBe(true);
    });

    it('应该筛选下轨附近股票', () => {
      const result = filterByTechnical(stocks, { bollinger: { position: 'lower' } });
      expect(result.some(s => s.code === '600519')).toBe(true);
    });
  });

  describe('均线筛选', () => {
    it('应该筛选站上MA5的股票', () => {
      const result = filterByTechnical(stocks, { ma: { above: 5 } });
      expect(result.some(s => s.code === '000001')).toBe(true);
    });

    it('应该筛选跌破MA20的股票', () => {
      const result = filterByTechnical(stocks, { ma: { below: 20 } });
      expect(result.some(s => s.code === '600519')).toBe(true);
    });
  });

  describe('成交量筛选', () => {
    it('应该筛选放量股票', () => {
      const result = filterByTechnical(stocks, { volume: { minRatio: 1.5 } });
      expect(result.length).toBe(1);
      expect(result[0].code).toBe('000001');
    });
  });

  describe('KDJ筛选', () => {
    it('应该筛选金叉股票', () => {
      const result = filterByTechnical(stocks, { kdj: { signal: 'golden' } });
      expect(result.some(s => s.code === '000001')).toBe(true);
    });

    it('应该筛选死叉股票', () => {
      const result = filterByTechnical(stocks, { kdj: { signal: 'death' } });
      expect(result.some(s => s.code === '600519')).toBe(true);
    });
  });

  describe('RSI计算', () => {
    it('应该计算RSI值', () => {
      const prices = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20];
      const rsi = calcRSI(prices, 14);
      expect(rsi).toBeGreaterThan(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('全部上涨应该RSI接近100', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i + 1);
      const rsi = calcRSI(prices, 14);
      expect(rsi).toBe(100);
    });
  });
});
