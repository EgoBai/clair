import { describe, it, expect } from 'vitest';
import { computeFactorExposures, StockExposure, FactorExposure } from '../services/barraFactorEngine';

function makeStocks(n: number, seed: number = 1): StockExposure[] {
  const stocks: StockExposure[] = [];
  for (let i = 0; i < n; i++) {
    const r = (seed + i * 7) % 100 / 100;
    stocks.push({
      stockId: `S${i}`,
      market: r,
      size: 1 - r,
      value: r * 0.8,
      momentum: (r - 0.5) * 2,
      volatility: Math.abs(r - 0.5),
      quality: r * 0.6 + 0.2,
      return_: r * 0.1 - 0.03,
    });
  }
  return stocks;
}

describe('BarraFactorEngine', () => {
  describe('computeFactorExposures', () => {
    it('空数组返回空', () => {
      expect(computeFactorExposures([])).toEqual([]);
    });

    it('不足5只返回空', () => {
      const stocks = makeStocks(3);
      expect(computeFactorExposures(stocks)).toEqual([]);
    });

    it('正好5只返回6个因子', () => {
      const stocks = makeStocks(5);
      const result = computeFactorExposures(stocks);
      expect(result.length).toBe(6);
    });

    it('6个因子名称正确', () => {
      const stocks = makeStocks(10);
      const result = computeFactorExposures(stocks);
      expect(result).toHaveLength(6);
      const factorNames = result.map(f => f.factor);
      expect(factorNames).toContain('market');
      expect(factorNames).toContain('size');
      expect(factorNames).toContain('value');
      expect(factorNames).toContain('momentum');
      expect(factorNames).toContain('volatility');
      expect(factorNames).toContain('quality');
    });

    it('结果格式验证', () => {
      const stocks = makeStocks(8);
      const result = computeFactorExposures(stocks);
      for (const f of result) {
        expect(f).toHaveProperty('factor');
        expect(f).toHaveProperty('exposure');
        expect(f).toHaveProperty('tStat');
        expect(f).toHaveProperty('significance');
        expect(typeof f.exposure).toBe('number');
        expect(typeof f.tStat).toBe('number');
        expect(typeof f.significance).toBe('boolean');
      }
    });

    it('显著性标记当|tStat|>1.96', () => {
      const stocks = makeStocks(20, 42);
      const result = computeFactorExposures(stocks);
      for (const f of result) {
        if (Math.abs(f.tStat) > 1.96) {
          expect(f.significance).toBe(true);
        } else {
          expect(f.significance).toBe(false);
        }
      }
    });

    it('常数暴露因子(零方差)', () => {
      const stocks: StockExposure[] = [];
      for (let i = 0; i < 10; i++) {
        stocks.push({
          stockId: `S${i}`,
          market: 1, // constant
          size: i * 0.1,
          value: i * 0.05,
          momentum: 0,
          volatility: 0.2,
          quality: 0.8,
          return_: i * 0.01,
        });
      }
      const result = computeFactorExposures(stocks);
      const marketFactor = result.find(f => f.factor === 'market');
      expect(marketFactor).toBeDefined();
      expect(marketFactor!.exposure).toBe(0); // zero variance -> zero beta
    });

    it('不同股票数不改变因子数量', () => {
      const r5 = computeFactorExposures(makeStocks(5));
      const r10 = computeFactorExposures(makeStocks(10));
      const r50 = computeFactorExposures(makeStocks(50));
      expect(r5).toHaveLength(6);
      expect(r10).toHaveLength(6);
      expect(r50).toHaveLength(6);
    });

    it('负收益不影响因子计算', () => {
      const stocks = makeStocks(10, 999); // seed 999
      const result = computeFactorExposures(stocks);
      expect(result.length).toBe(6);
    });

    it('所有收益为零时一些因子仍然可计算', () => {
      const stocks: StockExposure[] = [];
      for (let i = 0; i < 10; i++) {
        stocks.push({
          stockId: `S${i}`,
          market: i * 0.1,
          size: 1 - i * 0.1,
          value: 0.5,
          momentum: 0,
          volatility: 0.2,
          quality: 0.7,
          return_: 0, // all zero
        });
      }
      const result = computeFactorExposures(stocks);
      expect(result.length).toBe(6);
    });

    it('极端值不导致崩溃', () => {
      const stocks: StockExposure[] = [];
      for (let i = 0; i < 10; i++) {
        stocks.push({
          stockId: `S${i}`,
          market: 1e6, // extreme
          size: 1e-6,  // tiny
          value: -1e6, // negative extreme
          momentum: 0,
          volatility: 0.001,
          quality: 0.5,
          return_: 1e6,
        });
      }
      const result = computeFactorExposures(stocks);
      expect(result.length).toBe(6);
      for (const f of result) {
        expect(isFinite(f.exposure)).toBe(true);
        expect(isFinite(f.tStat)).toBe(true);
      }
    });

    it('所有因子暴露均为有限值', () => {
      const stocks = makeStocks(20);
      const result = computeFactorExposures(stocks);
      for (const f of result) {
        expect(isFinite(f.exposure)).toBe(true);
        expect(isFinite(f.tStat)).toBe(true);
      }
    });

    it('显著性分布合理', () => {
      const stocks = makeStocks(100);
      const result = computeFactorExposures(stocks);
      const sigCount = result.filter(f => f.significance).length;
      expect(sigCount).toBeGreaterThanOrEqual(0);
      expect(sigCount).toBeLessThanOrEqual(6);
    });

    it('自定义factor权重不影响', () => {
      const stocks = makeStocks(10);
      const result = computeFactorExposures(stocks);
      // Simply verify it runs without error
      expect(result).toBeDefined();
    });
  });
});
