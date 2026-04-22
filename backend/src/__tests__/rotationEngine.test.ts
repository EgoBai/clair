import { describe, it, expect } from 'vitest';
import { RotationEngine, RotationAsset } from '../services/rotationEngine';

describe('Rotation Engine', () => {
  const engine = new RotationEngine();

  /** Deterministic return generator — avoids flaky Math.random() tests */
  const generateReturns = (n: number, bias: number = 0): number[] => {
    const result: number[] = [];
    for (let i = 0; i < n; i++) {
      // Deterministic wave: base 0.005 + bias + slight oscillation
      result.push(0.005 + bias + Math.sin(i * 0.3) * 0.003);
    }
    return result;
  };

  const createAsset = (symbol: string, n: number = 100, bias: number = 0): RotationAsset => {
    const returns = generateReturns(n, bias);
    const prices: number[] = [100];
    for (const r of returns) prices.push(prices[prices.length - 1] * (1 + r));
    return { symbol, name: symbol, returns, prices: prices.slice(1), sector: 'default' };
  };

  describe('momentumRotation', () => {
    it('should rank assets by momentum', () => {
      const assets = [
        createAsset('A', 50, 0.01),
        createAsset('B', 50, -0.01),
        createAsset('C', 50, 0.005),
      ];
      const signals = engine.momentumRotation(assets, 20, 2);
      expect(signals.length).toBe(3);
      expect(signals[0].rank).toBe(1);
    });

    it('should assign actions', () => {
      const assets = [createAsset('A', 50, 0.02)];
      const signals = engine.momentumRotation(assets, 20);
      for (const s of signals) {
        expect(['overweight', 'underweight', 'neutral']).toContain(s.action);
      }
    });

    it('should include composite score', () => {
      const assets = [createAsset('A', 50)];
      const signals = engine.momentumRotation(assets, 20);
      expect(signals[0].composite).toBeTypeOf('number');
    });

    it('should skip assets with insufficient data', () => {
      const assets = [createAsset('A', 5), createAsset('B', 50)];
      const signals = engine.momentumRotation(assets, 20);
      expect(signals.length).toBe(1);
    });
  });

  describe('sectorRelativeStrength', () => {
    it('should calculate relative strength', () => {
      const sectors = [createAsset('Tech', 100, 0.01), createAsset('Finance', 100, -0.005)];
      const benchmark = generateReturns(100);
      const signals = engine.sectorRelativeStrength(sectors, benchmark);
      expect(signals.length).toBe(2);
    });

    it('should rank by composite', () => {
      const sectors = [createAsset('A', 100, 0.01), createAsset('B', 100, 0.02)];
      const benchmark = generateReturns(100);
      const signals = engine.sectorRelativeStrength(sectors, benchmark);
      expect(signals[0].rank).toBe(1);
    });
  });

  describe('analyzeStyleRotation', () => {
    it('should analyze styles', () => {
      const styles = engine.analyzeStyleRotation(
        generateReturns(100, 0.01),
        generateReturns(100),
        generateReturns(100, -0.005),
        generateReturns(100, 0.008),
        generateReturns(100, 0.002)
      );
      expect(styles.length).toBe(5);
      for (const s of styles) {
        expect(['bullish', 'bearish', 'neutral']).toContain(s.currentSignal);
        expect(s.trend).toBeGreaterThanOrEqual(0);
        expect(s.trend).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('buildRotationPortfolio', () => {
    it('should build portfolio', () => {
      const assets = [
        createAsset('A', 100, 0.01),
        createAsset('B', 100, 0.02),
        createAsset('C', 100, 0.005),
      ];
      const portfolio = engine.buildRotationPortfolio(assets, 1000000);
      expect(portfolio.allocations.length).toBeGreaterThan(0);
      expect(portfolio.sharpeRatio).toBeTypeOf('number');
    });

    it('should normalize weights', () => {
      const assets = [createAsset('A', 100, 0.02), createAsset('B', 100, 0.01)];
      const portfolio = engine.buildRotationPortfolio(assets, 1000000);
      const totalWeight = portfolio.allocations.reduce((s, a) => s + a.weight, 0);
      if (totalWeight > 0) {
        expect(totalWeight).toBeCloseTo(1, 1);
      }
    });

    it('should return empty for no good assets', () => {
      const assets = [createAsset('A', 5)]; // too short
      const portfolio = engine.buildRotationPortfolio(assets, 1000000);
      expect(portfolio.allocations.length).toBe(0);
    });
  });

  describe('backtestRotation', () => {
    it('should run backtest', () => {
      const assets = [createAsset('A', 200), createAsset('B', 200), createAsset('C', 200)];
      const result = engine.backtestRotation(assets, 20, 60, 2);
      expect(result.totalReturn).toBeTypeOf('number');
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('should have periods', () => {
      const assets = [createAsset('A', 200)];
      const result = engine.backtestRotation(assets, 20, 60, 1);
      expect(result.periods.length).toBeGreaterThan(0);
    });

    it('should handle empty assets', () => {
      const result = engine.backtestRotation([], 20, 60, 3);
      expect(result.totalReturn).toBe(0);
    });
  });
});
