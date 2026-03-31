import { describe, it, expect, beforeEach } from 'vitest';
import { VolatilityEngine } from '../utils/volatilityEngine';

describe('VolatilityEngine', () => {
  let engine: VolatilityEngine;

  const generateReturns = (count: number, mean: number = 0, std: number = 0.02): number[] =>
    Array.from({ length: count }, () => mean + (Math.random() - 0.5) * 2 * std);

  beforeEach(() => {
    engine = new VolatilityEngine();
  });

  describe('历史波动率', () => {
    it('应该计算日波动率', () => {
      const returns = generateReturns(30);
      const result = engine.historicalVolatility(returns, 20);
      expect(result.daily).toBeGreaterThan(0);
      expect(result.annualized).toBeGreaterThan(result.daily);
    });

    it('应该计算年化波动率', () => {
      const returns = generateReturns(30, 0, 0.01);
      const result = engine.historicalVolatility(returns, 20);
      expect(result.annualized).toBeCloseTo(result.daily * Math.sqrt(252), 1);
    });

    it('应该计算滚动波动率', () => {
      const returns = generateReturns(30);
      const result = engine.historicalVolatility(returns, 10);
      expect(result.rolling.length).toBeGreaterThan(0);
    });

    it('数据不足时返回零', () => {
      const result = engine.historicalVolatility([0.01, 0.02], 20);
      expect(result.daily).toBe(0);
    });

    it('应该判断波动率区间', () => {
      const lowReturns = generateReturns(50, 0, 0.005);
      const low = engine.historicalVolatility(lowReturns, 20);
      expect(['low', 'normal', 'high', 'extreme']).toContain(low.regime);
    });

    it('应该计算百分位数', () => {
      const returns = generateReturns(50);
      const result = engine.historicalVolatility(returns, 10);
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
    });
  });

  describe('EWMA波动率', () => {
    it('应该计算EWMA波动率序列', () => {
      const returns = generateReturns(20);
      const result = engine.ewmaVolatility(returns);
      expect(result.length).toBe(returns.length);
      expect(result.every(v => v >= 0)).toBe(true);
    });

    it('数据不足时返回空数组', () => {
      expect(engine.ewmaVolatility([0.01])).toHaveLength(0);
    });

    it('应该支持自定义lambda', () => {
      const returns = generateReturns(20);
      const r1 = engine.ewmaVolatility(returns, 0.9);
      const r2 = engine.ewmaVolatility(returns, 0.98);
      // 不同lambda应产生不同结果
      expect(r1[r1.length - 1]).not.toBe(r2[r2.length - 1]);
    });
  });

  describe('GARCH波动率', () => {
    it('应该计算GARCH(1,1)波动率', () => {
      const returns = generateReturns(50);
      const result = engine.garchVolatility(returns);
      expect(result.length).toBe(returns.length);
      expect(result.every(v => v >= 0)).toBe(true);
    });

    it('应该支持自定义参数', () => {
      const returns = generateReturns(30);
      const result = engine.garchVolatility(returns, {
        omega: 0.0001,
        alpha: 0.15,
        beta: 0.8,
      });
      expect(result.length).toBe(returns.length);
    });

    it('数据不足时返回空数组', () => {
      expect(engine.garchVolatility([0.01])).toHaveLength(0);
    });
  });

  describe('Parkinson波动率', () => {
    it('应该基于高低价计算波动率', () => {
      const highs = Array.from({ length: 20 }, () => 10 + Math.random() * 2);
      const lows = highs.map(h => h - Math.random() * 0.5);
      const result = engine.parkinsonVolatility(highs, lows);
      expect(result).toBeGreaterThan(0);
    });

    it('数据不足时返回0', () => {
      expect(engine.parkinsonVolatility([10], [9])).toBe(0);
    });

    it('高低相等时应为0', () => {
      const result = engine.parkinsonVolatility([10, 10, 10], [10, 10, 10]);
      expect(result).toBe(0);
    });
  });

  describe('波动率锥', () => {
    it('应该计算波动率锥', () => {
      const returns = generateReturns(300);
      const cone = engine.volatilityCone(returns);
      expect(cone.length).toBeGreaterThan(0);
      for (const level of cone) {
        expect(level.min).toBeLessThanOrEqual(level.max);
        expect(level.q25).toBeLessThanOrEqual(level.median);
        expect(level.median).toBeLessThanOrEqual(level.q75);
      }
    });

    it('数据不足的周期应跳过', () => {
      const returns = generateReturns(10);
      const cone = engine.volatilityCone(returns);
      expect(cone.every(c => c.period <= returns.length)).toBe(true);
    });
  });
});
