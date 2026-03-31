/**
 * 波动率期限结构引擎测试
 */
import { describe, it, expect } from 'vitest';
import { VolTermStructureEngine } from '../utils/volTermStructureEngine';

describe('VolTermStructureEngine', () => {
  const engine = new VolTermStructureEngine();

  describe('analyzeTermStructure', () => {
    it('应该分析期限结构', () => {
      const tenors = [7, 14, 30, 60, 90, 180, 365];
      const impliedVols = [0.18, 0.19, 0.20, 0.21, 0.22, 0.23, 0.24];
      const realizedVols = [0.17, 0.18, 0.19, 0.20, 0.20, 0.21, 0.22];

      const result = engine.analyzeTermStructure(tenors, impliedVols, realizedVols);

      expect(result.tenors.length).toBe(7);
      expect(result.volSpread.length).toBe(7);
      expect(result.termSlope).toBeGreaterThan(0); // contango
      expect(result.contango).toBe(true);
    });

    it('backwardation应被检测', () => {
      const tenors = [7, 30, 90];
      const impliedVols = [0.25, 0.22, 0.20];
      const realizedVols = [0.20, 0.20, 0.20];

      const result = engine.analyzeTermStructure(tenors, impliedVols, realizedVols);
      expect(result.contango).toBe(false);
      expect(result.termSlope).toBeLessThan(0);
    });

    it('不足数据应返回空', () => {
      const result = engine.analyzeTermStructure([7], [0.2], [0.18]);
      expect(result.tenors.length).toBe(0);
    });
  });

  describe('calculateVolSurface', () => {
    it('应该计算波动率曲面', () => {
      const result = engine.calculateVolSurface(100, [90, 95, 100, 105, 110], [30, 60, 90]);

      expect(result.length).toBe(15); // 5 strikes * 3 tenors
      expect(result[0].callIV).toBeGreaterThan(0);
      expect(result[0].putIV).toBeGreaterThan(0);
      expect(typeof result[0].skew).toBe('number');
      expect(typeof result[0].smile).toBe('number');
    });

    it('OTM期权应有更高波动率', () => {
      const result = engine.calculateVolSurface(100, [80, 100, 120], [30]);
      const otmPut = result.find(p => p.strike === 80);
      const atm = result.find(p => p.strike === 100);
      expect(otmPut).toBeDefined();
      expect(atm).toBeDefined();
      // OTM put smile应 > ATM
      expect(otmPut!.smile).toBeGreaterThan(atm!.smile);
    });
  });

  describe('detectVolRegime', () => {
    it('应该检测波动率体制', () => {
      const historical = Array.from({ length: 252 }, () => 0.15 + Math.random() * 0.15);
      const result = engine.detectVolRegime(0.25, historical);

      expect(['low', 'normal', 'elevated', 'high', 'extreme']).toContain(result.regime);
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
      expect(typeof result.zScore).toBe('number');
      expect(result.volOfVol).toBeGreaterThan(0);
      expect(result.longTermMean).toBeGreaterThan(0);
    });

    it('不足数据应返回normal', () => {
      const result = engine.detectVolRegime(0.2, [0.18, 0.20, 0.22]);
      expect(result.regime).toBe('normal');
      expect(result.percentile).toBe(50);
    });
  });

  describe('generateTradingSignal', () => {
    it('低波动率应产生买入信号', () => {
      const historical = Array.from({ length: 252 }, () => 0.15 + Math.random() * 0.15);
      const regime = engine.detectVolRegime(0.08, historical);
      const signal = engine.generateTradingSignal(0.08, historical, regime);

      expect(signal.signal).toBe('buy_vol');
      expect(signal.confidence).toBeGreaterThan(0.3);
      expect(signal.riskReward).toBeGreaterThan(0);
    });

    it('高波动率应产生卖出信号', () => {
      const historical = Array.from({ length: 252 }, () => 0.15 + Math.random() * 0.15);
      const regime = engine.detectVolRegime(0.45, historical);
      const signal = engine.generateTradingSignal(0.45, historical, regime);

      expect(signal.signal).toBe('sell_vol');
      expect(signal.strategy).toBeTruthy();
    });
  });

  describe('buildVolCone', () => {
    it('应该构建波动率锥', () => {
      const historical = new Map<string, number[]>();
      historical.set('7', Array.from({ length: 100 }, () => 0.15 + Math.random() * 0.1));
      historical.set('30', Array.from({ length: 100 }, () => 0.18 + Math.random() * 0.1));
      historical.set('90', Array.from({ length: 100 }, () => 0.20 + Math.random() * 0.1));

      const current = new Map([['7', 0.22], ['30', 0.25], ['90', 0.23]]);

      const result = engine.buildVolCone(historical, current);

      expect(result.tenors.length).toBe(3);
      expect(result.minVol.length).toBe(3);
      expect(result.medianVol.length).toBe(3);
      expect(result.maxVol.length).toBe(3);
      expect(result.currentVol.length).toBe(3);
      expect(result.currentPercentile.length).toBe(3);

      // min < p25 < median < p75 < max
      for (let i = 0; i < 3; i++) {
        expect(result.minVol[i]).toBeLessThanOrEqual(result.p25Vol[i]);
        expect(result.p25Vol[i]).toBeLessThanOrEqual(result.medianVol[i]);
        expect(result.medianVol[i]).toBeLessThanOrEqual(result.p75Vol[i]);
        expect(result.p75Vol[i]).toBeLessThanOrEqual(result.maxVol[i]);
      }
    });
  });
});
