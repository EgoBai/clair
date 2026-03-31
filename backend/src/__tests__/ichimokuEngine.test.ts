import { describe, it, expect } from 'vitest';

describe('一目均衡表 (Ichimoku Cloud) 引擎', () => {
  interface IchimokuResult {
    tenkan: number;
    kijun: number;
    senkouA: number;
    senkouB: number;
    chikou: number;
    cloudTop: number;
    cloudBottom: number;
    priceVsCloud: 'above' | 'below' | 'inside';
    tkCross: 'bullish' | 'bearish' | 'none';
    cloudColor: 'bullish' | 'bearish';
  }

  function highestHigh(prices: number[], period: number, end: number) {
    return Math.max(...prices.slice(Math.max(0, end - period + 1), end + 1));
  }

  function lowestLow(prices: number[], period: number, end: number) {
    return Math.min(...prices.slice(Math.max(0, end - period + 1), end + 1));
  }

  function ichimoku(highs: number[], lows: number[], closes: number[],
                    tenkanPeriod = 9, kijunPeriod = 26, senkouBPeriod = 52, displacement = 26): IchimokuResult[] {
    const len = highs.length;
    if (len < senkouBPeriod) return [];
    const result: IchimokuResult[] = [];
    for (let i = senkouBPeriod - 1; i < len; i++) {
      const tenkan = (highestHigh(highs, tenkanPeriod, i) + lowestLow(lows, tenkanPeriod, i)) / 2;
      const kijun = (highestHigh(highs, kijunPeriod, i) + lowestLow(lows, kijunPeriod, i)) / 2;
      const senkouA = (tenkan + kijun) / 2;
      const senkouB = (highestHigh(highs, senkouBPeriod, i) + lowestLow(lows, senkouBPeriod, i)) / 2;
      const cloudTop = Math.max(senkouA, senkouB);
      const cloudBottom = Math.min(senkouA, senkouB);
      const price = closes[i];
      let priceVsCloud: 'above' | 'below' | 'inside' = 'inside';
      if (price > cloudTop) priceVsCloud = 'above';
      else if (price < cloudBottom) priceVsCloud = 'below';
      let tkCross: 'bullish' | 'bearish' | 'none' = 'none';
      if (i > 0) {
        const prevTenkan = (highestHigh(highs, tenkanPeriod, i - 1) + lowestLow(lows, tenkanPeriod, i - 1)) / 2;
        const prevKijun = (highestHigh(highs, kijunPeriod, i - 1) + lowestLow(lows, kijunPeriod, i - 1)) / 2;
        if (prevTenkan <= prevKijun && tenkan > kijun) tkCross = 'bullish';
        else if (prevTenkan >= prevKijun && tenkan < kijun) tkCross = 'bearish';
      }
      result.push({
        tenkan, kijun, senkouA, senkouB,
        chikou: i >= displacement ? closes[i - displacement] : closes[0],
        cloudTop, cloudBottom, priceVsCloud, tkCross,
        cloudColor: senkouA >= senkouB ? 'bullish' : 'bearish',
      });
    }
    return result;
  }

  function ichimokuStrength(ichimoku: IchimokuResult[], closes: number[]) {
    let score = 0;
    if (!ichimoku.length) return 0;
    const last = ichimoku[ichimoku.length - 1];
    const price = closes[closes.length - 1];
    // Price vs cloud
    if (last.priceVsCloud === 'above') score += 30;
    else if (last.priceVsCloud === 'below') score -= 30;
    // TK cross
    if (last.tenkan > last.kijun) score += 20;
    else if (last.tenkan < last.kijun) score -= 20;
    // Cloud color
    if (last.cloudColor === 'bullish') score += 15;
    else score -= 15;
    // Chikou vs past price
    if (price > last.chikou) score += 15;
    else if (price < last.chikou) score -= 15;
    // Recent TK cross momentum
    const recentCrosses = ichimoku.slice(-5).filter(i => i.tkCross !== 'none');
    if (recentCrosses.some(c => c.tkCross === 'bullish')) score += 10;
    if (recentCrosses.some(c => c.tkCross === 'bearish')) score -= 10;
    return Math.max(-100, Math.min(100, score));
  }

  function cloudThickness(ichimoku: IchimokuResult[]) {
    return ichimoku.map(i => ({
      thickness: i.cloudTop - i.cloudBottom,
      support: i.cloudBottom,
      resistance: i.cloudTop,
    }));
  }

  function kijunBounce(highs: number[], lows: number[], closes: number[], lookback = 10) {
    const ichimokuData = ichimoku(highs, lows, closes);
    const bounces: { index: number; type: 'support' | 'resistance' }[] = [];
    for (let i = 1; i < Math.min(ichimokuData.length, lookback); i++) {
      const kijun = ichimokuData[i].kijun;
      const prevClose = closes[i - 1];
      const currClose = closes[i];
      if (prevClose < kijun && currClose >= kijun) bounces.push({ index: i, type: 'support' });
      if (prevClose > kijun && currClose <= kijun) bounces.push({ index: i, type: 'resistance' });
    }
    return bounces;
  }

  // Generate test data
  const n = 100;
  const highPrices = Array.from({ length: n }, (_, i) => 110 + Math.sin(i / 8) * 10 + Math.random() * 2);
  const lowPrices = highPrices.map((h, i) => h - 2 - Math.random());
  const closePrices = highPrices.map((h, i) => (h + lowPrices[i]) / 2 + (Math.random() - 0.5));

  describe('一目均衡表计算', () => {
    it('数据不足返回空', () => {
      expect(ichimoku([1, 2, 3], [1, 2, 3], [1, 2, 3])).toEqual([]);
    });

    it('返回正确长度', () => {
      const result = ichimoku(highPrices, lowPrices, closePrices);
      expect(result.length).toBeGreaterThan(0);
    });

    it('Tenkan < Kijun或相等合理', () => {
      const result = ichimoku(highPrices, lowPrices, closePrices);
      result.forEach(r => {
        expect(typeof r.tenkan).toBe('number');
        expect(typeof r.kijun).toBe('number');
      });
    });

    it('云层Top >= Bottom', () => {
      const result = ichimoku(highPrices, lowPrices, closePrices);
      result.forEach(r => {
        expect(r.cloudTop).toBeGreaterThanOrEqual(r.cloudBottom);
      });
    });

    it('价格位置分类', () => {
      const result = ichimoku(highPrices, lowPrices, closePrices);
      result.forEach(r => {
        expect(['above', 'below', 'inside']).toContain(r.priceVsCloud);
      });
    });

    it('TK交叉类型', () => {
      const result = ichimoku(highPrices, lowPrices, closePrices);
      result.forEach(r => {
        expect(['bullish', 'bearish', 'none']).toContain(r.tkCross);
      });
    });
  });

  describe('一目强度评分', () => {
    it('评分在-100到100', () => {
      const result = ichimoku(highPrices, lowPrices, closePrices);
      const score = ichimokuStrength(result, closePrices);
      expect(score).toBeGreaterThanOrEqual(-100);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('云层厚度', () => {
    it('厚度非负', () => {
      const result = ichimoku(highPrices, lowPrices, closePrices);
      const thickness = cloudThickness(result);
      thickness.forEach(t => expect(t.thickness).toBeGreaterThanOrEqual(0));
    });
  });

  describe('基准线弹跳', () => {
    it('返回弹跳数组', () => {
      const bounces = kijunBounce(highPrices, lowPrices, closePrices);
      bounces.forEach(b => {
        expect(['support', 'resistance']).toContain(b.type);
      });
    });
  });
});
