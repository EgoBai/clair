import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runStressTest,
  crisisScenarios,
  calculateTailRisk,
  monteCarloSimulation,
  generateCorrelatedScenarios,
  type Scenario,
  type StressTestResult
} from '../utils/riskScenarioEngine';

/**
 * 风险场景引擎测试（导入真实模块）
 */
describe('RiskScenarioEngine (real module)', () => {
  describe('runStressTest', () => {
    const portfolio = { equity: 0.6, bond: 0.4 };

    it('should return one result per scenario', () => {
      const scenarios: Scenario[] = [
        { name: 'Crash', description: '', shocks: { equity: -0.5, bond: 0.1 }, probability: 0.02 },
        { name: 'Boom', description: '', shocks: { equity: 0.2, bond: -0.05 }, probability: 0.1 },
      ];
      const results = runStressTest(portfolio, scenarios);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.scenario)).toEqual(['Crash', 'Boom']);
    });

    it('should compute portfolio impact as weighted shock sum', () => {
      const scenarios: Scenario[] = [
        { name: 'Crash', description: '', shocks: { equity: -0.5, bond: 0.1 }, probability: 0.02 },
      ];
      const r: StressTestResult = runStressTest(portfolio, scenarios)[0];
      expect(r.portfolioImpact).toBeCloseTo(0.6 * -0.5 + 0.4 * 0.1, 10); // -0.26
    });

    it('should identify worst and best positions', () => {
      const scenarios: Scenario[] = [
        { name: 'Crash', description: '', shocks: { equity: -0.5, bond: 0.1 }, probability: 0.02 },
      ];
      const r = runStressTest(portfolio, scenarios)[0];
      expect(r.worstPosition.symbol).toBe('equity');
      expect(r.worstPosition.loss).toBeCloseTo(-0.3, 10);
      expect(r.bestPosition.symbol).toBe('bond');
      expect(r.bestPosition.gain).toBeCloseTo(0.04, 10);
    });

    it('should report maxDrawdown and margin call threshold', () => {
      const mild: Scenario[] = [
        { name: 'Mild', description: '', shocks: { equity: -0.5, bond: 0.1 }, probability: 0.02 },
      ];
      const severe: Scenario[] = [
        { name: 'Severe', description: '', shocks: { equity: -0.8, bond: 0 }, probability: 0.01 },
      ];
      expect(runStressTest(portfolio, mild)[0].marginCall).toBe(false);
      expect(runStressTest(portfolio, mild)[0].maxDrawdown).toBeCloseTo(0.26, 10);
      expect(runStressTest(portfolio, severe)[0].marginCall).toBe(true);
    });
  });

  describe('crisisScenarios', () => {
    it('should provide 6 predefined crisis scenarios', () => {
      const sc = crisisScenarios();
      expect(sc).toHaveLength(6);
      const names = sc.map(s => s.name);
      expect(new Set(names).size).toBe(names.length);
      sc.forEach(s => {
        expect(s.shocks).toBeDefined();
        expect(typeof s.probability).toBe('number');
      });
    });
  });

  describe('calculateTailRisk', () => {
    it('should return zeroed metrics for fewer than 10 returns', () => {
      const m = calculateTailRisk([0.01, -0.02, 0.03]);
      expect(m.var95).toBe(0);
      expect(m.var99).toBe(0);
      expect(m.maxDrawdown).toBe(0);
      expect(m.tailRiskRatio).toBe(0);
    });

    it('should compute VaR, ES and tail metrics', () => {
      const returns = [
        -0.2, -0.15, -0.1, -0.05, 0, 0.01, 0.02, 0.03, 0.04, 0.05,
        0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.14, 0.15,
      ];
      const m = calculateTailRisk(returns);
      expect(m.var95).toBeCloseTo(0.15, 10);
      expect(m.var99).toBeCloseTo(0.2, 10);
      expect(m.var99).toBeGreaterThanOrEqual(m.var95);
      expect(m.expectedShortfall95).toBeCloseTo(0.175, 10);
      expect(m.expectedShortfall99).toBeCloseTo(0.2, 10);
      expect(m.conditionalVar).toBeCloseTo(0.175, 10);
      expect(m.tailRiskRatio).toBeCloseTo(0.175 / 0.15, 5);
      expect(m.maxDrawdown).toBeGreaterThanOrEqual(0);
    });
  });

  describe('monteCarloSimulation', () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      // Make the simulation deterministic: z becomes 0 for every step
      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });
    afterEach(() => {
      randomSpy.mockRestore();
    });

    it('should return deterministic invariant structure', () => {
      const r = monteCarloSimulation(1000, 0.1, 0.2, 5, 10);
      expect(r.paths).toHaveLength(10);
      expect(r.paths[0]).toHaveLength(6); // days + 1
      expect(r.percentiles.p5).toHaveLength(6);
      expect(r.percentiles.p95).toHaveLength(6);
      expect(r.probabilityOfLoss).toBeGreaterThanOrEqual(0);
      expect(r.probabilityOfLoss).toBeLessThanOrEqual(1);
      expect(r.worstCase).toBeLessThanOrEqual(r.bestCase);
      expect(r.expectedReturn).toBeGreaterThan(0); // meanReturn > 0 with deterministic up-drift
    });

    it('should cap returned paths to 100', () => {
      const r = monteCarloSimulation(1000, 0.05, 0.1, 3, 500);
      expect(r.paths.length).toBeLessThanOrEqual(100);
    });
  });

  describe('generateCorrelatedScenarios', () => {
    it('should build severity-graded correlated scenarios', () => {
      const sc = generateCorrelatedScenarios('A', ['B', 'C'], [0.5, 0.8], 1);
      expect(sc).toHaveLength(4); // Mild, Moderate, Severe, Extreme
      expect(sc[0].name).toBe('A Mild Shock');
      expect(sc[0].shocks.A).toBeCloseTo(-0.1, 10);
      expect(sc[0].shocks.B).toBeCloseTo(-0.05, 10);
      expect(sc[0].shocks.C).toBeCloseTo(-0.08, 10);
      expect(sc[0].probability).toBe(0.1);
      expect(sc[3].shocks.A).toBeCloseTo(-0.5, 10);
    });

    it('should scale by severity factor', () => {
      const sc = generateCorrelatedScenarios('A', ['B'], [1], 2);
      expect(sc[0].shocks.A).toBeCloseTo(-0.2, 10);
    });
  });
});
