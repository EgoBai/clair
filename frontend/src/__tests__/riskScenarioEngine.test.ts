import { describe, it, expect } from 'vitest';
import {
  runStressTest,
  crisisScenarios,
  calculateTailRisk,
  monteCarloSimulation,
  generateCorrelatedScenarios,
} from '../utils/riskScenarioEngine';

describe('Risk Scenario Engine', () => {
  describe('runStressTest', () => {
    it('should run stress tests', () => {
      const portfolio = { equity: 0.6, bond: 0.3, commodity: 0.1 };
      const scenarios = crisisScenarios();
      const results = runStressTest(portfolio, scenarios);

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r).toHaveProperty('scenario');
        expect(r).toHaveProperty('portfolioImpact');
        expect(r).toHaveProperty('worstPosition');
        expect(r).toHaveProperty('bestPosition');
        expect(r).toHaveProperty('maxDrawdown');
        expect(typeof r.marginCall).toBe('boolean');
      }
    });

    it('should identify worst position', () => {
      const portfolio = { A: 0.5, B: 0.5 };
      const scenarios = [{
        name: 'test',
        description: 'test',
        shocks: { A: -0.30, B: -0.10 },
        probability: 0.1,
      }];

      const results = runStressTest(portfolio, scenarios);
      expect(results[0].worstPosition.symbol).toBe('A');
    });

    it('should detect margin calls', () => {
      const portfolio = { equity: 1.0 };
      const scenarios = [{
        name: 'crash',
        description: 'big crash',
        shocks: { equity: -0.50 },
        probability: 0.01,
      }];

      const results = runStressTest(portfolio, scenarios);
      expect(results[0].marginCall).toBe(true);
    });
  });

  describe('crisisScenarios', () => {
    it('should return predefined scenarios', () => {
      const scenarios = crisisScenarios();
      expect(scenarios.length).toBeGreaterThan(0);
      for (const s of scenarios) {
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('description');
        expect(s).toHaveProperty('shocks');
        expect(s).toHaveProperty('probability');
        expect(s.probability).toBeGreaterThan(0);
        expect(s.probability).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('calculateTailRisk', () => {
    it('should calculate tail risk metrics', () => {
      const returns = Array(500).fill(0).map(() => (Math.random() - 0.5) * 0.04);
      const metrics = calculateTailRisk(returns);

      expect(metrics.var95).toBeGreaterThanOrEqual(0);
      expect(metrics.var99).toBeGreaterThanOrEqual(metrics.var95);
      expect(metrics.expectedShortfall95).toBeGreaterThanOrEqual(metrics.var95);
      expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(metrics.tailRiskRatio).toBeGreaterThanOrEqual(1);
    });

    it('should handle short data', () => {
      const metrics = calculateTailRisk([0.01, -0.02, 0.01]);
      expect(metrics.var95).toBe(0);
    });

    it('should handle all positive returns', () => {
      const returns = Array(100).fill(0.01);
      const metrics = calculateTailRisk(returns);
      // All positive returns means no loss risk
      expect(metrics.maxDrawdown).toBe(0);
    });
  });

  describe('monteCarloSimulation', () => {
    it('should simulate portfolio paths', () => {
      const result = monteCarloSimulation(100000, 0.08, 0.15, 252, 500);

      expect(result.paths.length).toBeLessThanOrEqual(100);
      expect(result.probabilityOfLoss).toBeGreaterThanOrEqual(0);
      expect(result.probabilityOfLoss).toBeLessThanOrEqual(1);
      expect(typeof result.expectedReturn).toBe('number');
      expect(result.worstCase).toBeLessThanOrEqual(result.bestCase);
      expect(result.percentiles.p50.length).toBe(253); // days + 1
    });

    it('should have reasonable percentiles', () => {
      const result = monteCarloSimulation(100000, 0.08, 0.15, 100, 1000);

      for (let i = 0; i < 101; i++) {
        expect(result.percentiles.p5[i]).toBeLessThanOrEqual(result.percentiles.p50[i]);
        expect(result.percentiles.p50[i]).toBeLessThanOrEqual(result.percentiles.p95[i]);
      }
    });

    it('should show higher probability of loss with negative drift', () => {
      const posResult = monteCarloSimulation(100000, 0.15, 0.15, 60, 1000);
      const negResult = monteCarloSimulation(100000, -0.15, 0.15, 60, 1000);

      expect(negResult.probabilityOfLoss).toBeGreaterThan(posResult.probabilityOfLoss);
    });
  });

  describe('generateCorrelatedScenarios', () => {
    it('should generate scenarios', () => {
      const scenarios = generateCorrelatedScenarios(
        'SH',
        ['HK', 'US'],
        [0.8, 0.5],
        1
      );

      expect(scenarios.length).toBeGreaterThan(0);
      for (const s of scenarios) {
        expect(s.shocks).toHaveProperty('SH');
        expect(s.shocks).toHaveProperty('HK');
        expect(s.shocks).toHaveProperty('US');
        // Correlated markets should have smaller shocks
        expect(Math.abs(s.shocks['HK'])).toBeLessThanOrEqual(Math.abs(s.shocks['SH']));
      }
    });

    it('should scale with severity', () => {
      const mild = generateCorrelatedScenarios('A', ['B'], [0.5], 0.5);
      const severe = generateCorrelatedScenarios('A', ['B'], [0.5], 2);

      const mildExtreme = mild.find(s => s.name.includes('Extreme'));
      const severeExtreme = severe.find(s => s.name.includes('Extreme'));

      if (mildExtreme && severeExtreme) {
        expect(Math.abs(severeExtreme.shocks['A'])).toBeGreaterThan(
          Math.abs(mildExtreme.shocks['A'])
        );
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty portfolio', () => {
      const results = runStressTest({}, crisisScenarios());
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.portfolioImpact).toBe(0);
      }
    });

    it('should handle portfolio with missing shock', () => {
      const portfolio = { UNKNOWN: 1.0 };
      const scenarios = [{ name: 'test', description: '', shocks: { equity: -0.20 }, probability: 0.1 }];
      const results = runStressTest(portfolio, scenarios);
      expect(results[0].portfolioImpact).toBe(0);
    });
  });
});
