import { describe, it, expect } from 'vitest';

// ETF分析引擎测试
describe('ETF分析引擎', () => {
  describe('ETF净值计算', () => {
    function calcNAV(componentValues: number[], divisor: number): number {
      if (divisor === 0) return 0;
      return componentValues.reduce((a, b) => a + b, 0) / divisor;
    }

    it('正确计算NAV', () => {
      expect(calcNAV([100, 200, 300], 10)).toBe(60);
    });

    it('除数为零返回零', () => {
      expect(calcNAV([100, 200], 0)).toBe(0);
    });

    it('空成分返回零', () => {
      expect(calcNAV([], 10)).toBe(0);
    });
  });

  describe('折溢价率', () => {
    function discountPremium(price: number, nav: number): { rate: number; status: string } {
      if (nav === 0) return { rate: 0, status: 'N/A' };
      const rate = (price - nav) / nav;
      return {
        rate,
        status: rate > 0.005 ? '溢价' : rate < -0.005 ? '折价' : '平价',
      };
    }

    it('价格高于NAV为溢价', () => {
      expect(discountPremium(105, 100).status).toBe('溢价');
    });

    it('价格低于NAV为折价', () => {
      expect(discountPremium(95, 100).status).toBe('折价');
    });

    it('接近NAV为平价', () => {
      expect(discountPremium(100.2, 100).status).toBe('平价');
    });

    it('NAV为零返回N/A', () => {
      expect(discountPremium(100, 0).status).toBe('N/A');
    });

    it('计算折溢价率', () => {
      expect(discountPremium(110, 100).rate).toBeCloseTo(0.1, 5);
    });
  });

  describe('ETF跟踪误差', () => {
    function trackingError(etfReturns: number[], benchmarkReturns: number[]): number {
      if (etfReturns.length !== benchmarkReturns.length || etfReturns.length === 0) return 0;
      const diffs = etfReturns.map((r, i) => r - benchmarkReturns[i]);
      const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const variance = diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / diffs.length;
      return Math.sqrt(variance * 252);
    }

    it('完全跟踪误差为零', () => {
      const returns = [0.01, 0.02, -0.01];
      expect(trackingError(returns, returns)).toBeCloseTo(0, 5);
    });

    it('跟踪误差非负', () => {
      expect(trackingError([0.01, 0.02], [0.015, 0.018])).toBeGreaterThanOrEqual(0);
    });

    it('空数据返回零', () => {
      expect(trackingError([], [])).toBe(0);
    });
  });

  describe('ETF流动性评分', () => {
    function liquidityScore(avgVolume: number, avgSpread: number, marketCap: number): { score: number; level: string } {
      const volScore = Math.min(avgVolume / 1e8, 1) * 40;
      const spreadScore = Math.max(0, (1 - avgSpread / 0.01)) * 30;
      const capScore = Math.min(marketCap / 1e10, 1) * 30;
      const score = volScore + spreadScore + capScore;
      let level = '差';
      if (score > 70) level = '优';
      else if (score > 50) level = '良';
      else if (score > 30) level = '中';
      return { score, level };
    }

    it('高成交量高评分', () => {
      const high = liquidityScore(5e8, 0.001, 5e10);
      const low = liquidityScore(1e6, 0.001, 5e10);
      expect(high.score).toBeGreaterThan(low.score);
    });

    it('窄价差高评分', () => {
      const narrow = liquidityScore(1e7, 0.0001, 1e10);
      const wide = liquidityScore(1e7, 0.01, 1e10);
      expect(narrow.score).toBeGreaterThan(wide.score);
    });

    it('评分在0-100之间', () => {
      const result = liquidityScore(1e7, 0.005, 1e10);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('ETF分红再投资', () => {
    function reinvestDividends(shares: number, nav: number, dividend: number): { newShares: number; totalValue: number } {
      if (nav === 0) return { newShares: shares, totalValue: 0 };
      const divAmount = shares * dividend;
      const newShares = divAmount / nav;
      const totalShares = shares + newShares;
      return { newShares: totalShares, totalValue: totalShares * nav };
    }

    it('分红再投资增加份额', () => {
      const result = reinvestDividends(1000, 10, 0.5);
      expect(result.newShares).toBe(1050);
    });

    it('零分红份额不变', () => {
      const result = reinvestDividends(1000, 10, 0);
      expect(result.newShares).toBe(1000);
    });

    it('NAV为零返回原份额', () => {
      const result = reinvestDividends(1000, 0, 0.5);
      expect(result.newShares).toBe(1000);
    });

    it('总价值=份额×NAV', () => {
      const result = reinvestDividends(1000, 10, 0.5);
      expect(result.totalValue).toBeCloseTo(result.newShares * 10, 5);
    });
  });

  describe('ETF申赎清单', () => {
    interface Component { symbol: string; shares: number; price: number; cash替代: number; }

    function creationUnit(components: Component[], unitSize: number): { totalValue: number; cashComponent: number; stockValue: number } {
      const stockValue = components.reduce((s, c) => s + c.shares * c.price, 0);
      const cashComponent = components.reduce((s, c) => s + c['cash替代'], 0);
      return { totalValue: stockValue + cashComponent, cashComponent, stockValue };
    }

    it('总值=股票市值+现金替代', () => {
      const components: Component[] = [
        { symbol: '000001', shares: 100, price: 10, 'cash替代': 0 },
        { symbol: '000002', shares: 200, price: 20, 'cash替代': 500 },
      ];
      const result = creationUnit(components, 100);
      expect(result.totalValue).toBe(100 * 10 + 200 * 20 + 500);
    });

    it('空成分返回零', () => {
      const result = creationUnit([], 100);
      expect(result.totalValue).toBe(0);
    });
  });
});
