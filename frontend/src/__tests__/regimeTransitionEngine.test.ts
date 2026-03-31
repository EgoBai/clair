import { describe, it, expect } from 'vitest';
import {
  detectRegimes,
  predictNextRegime,
  regimeDurationDistribution,
  regimeWarningSignals,
} from '../utils/regimeTransitionEngine';

function generateReturns(days: number, regimes: { prob: number; mean: number; std: number }[]): number[] {
  const returns: number[] = [];
  let currentRegime = 0;

  for (let i = 0; i < days; i++) {
    // 随机切换体制
    if (Math.random() < 0.02) {
      currentRegime = (currentRegime + 1) % regimes.length;
    }
    const r = regimes[currentRegime];
    returns.push(r.mean + (Math.random() - 0.5) * 2 * r.std);
  }
  return returns;
}

const bullBearReturns = generateReturns(500, [
  { prob: 0.5, mean: 0.0005, std: 0.01 },  // 牛市
  { prob: 0.3, mean: -0.001, std: 0.02 },   // 熊市
  { prob: 0.2, mean: 0, std: 0.005 },       // 震荡
]);

describe('市场体制转换引擎', () => {
  describe('detectRegimes', () => {
    it('should detect 3 regimes', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      expect(analysis.regimes.length).toBe(3);
    });

    it('should have valid regime stats', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      analysis.regimes.forEach(r => {
        expect(r.id).toBeGreaterThanOrEqual(0);
        expect(r.name).toBeTruthy();
        expect(r.frequency).toBeGreaterThanOrEqual(0);
        expect(r.frequency).toBeLessThanOrEqual(1);
        expect(r.avgDuration).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have valid transition matrix', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      expect(analysis.transitionMatrix.length).toBe(3);
      analysis.transitionMatrix.forEach(row => {
        expect(row.length).toBe(3);
        const sum = row.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 2);
      });
    });

    it('should have steady state distribution', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      expect(analysis.steadyState.length).toBe(3);
      const sum = analysis.steadyState.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('should have current state', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      expect(analysis.currentState.regime).toBeGreaterThanOrEqual(0);
      expect(analysis.currentState.regime).toBeLessThan(3);
      expect(analysis.currentState.duration).toBeGreaterThan(0);
    });

    it('should handle insufficient data', () => {
      const analysis = detectRegimes([0.01, 0.02, -0.01], 3, 20);
      expect(analysis.regimes.length).toBe(1);
      expect(analysis.regimes[0].name).toBe('未知');
    });
  });

  describe('predictNextRegime', () => {
    it('should predict future regimes', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      const predictions = predictNextRegime(
        analysis.currentState.regime,
        analysis.transitionMatrix,
        5
      );
      expect(predictions.length).toBe(5);
      predictions.forEach(step => {
        expect(step.length).toBe(3);
        const sum = step.reduce((a, p) => a + p.probability, 0);
        expect(sum).toBeCloseTo(1, 2);
      });
    });

    it('should have decreasing certainty over time', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      const predictions = predictNextRegime(
        analysis.currentState.regime,
        analysis.transitionMatrix,
        10
      );
      // 第一步最确定（直接从转移矩阵来）
      const maxProb1 = Math.max(...predictions[0].map(p => p.probability));
      const maxProb10 = Math.max(...predictions[9].map(p => p.probability));
      expect(maxProb1).toBeGreaterThanOrEqual(maxProb10);
    });
  });

  describe('regimeDurationDistribution', () => {
    it('should calculate duration stats', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      // Use the labels from regimeHistory
      const labels = bullBearReturns.slice(19).map((_, i) => analysis.regimeHistory[i]?.regime ?? 0);
      const dist = regimeDurationDistribution(labels, 3);

      for (let r = 0; r < 3; r++) {
        expect(dist[r]).toBeDefined();
        expect(dist[r].mean).toBeGreaterThanOrEqual(0);
        expect(dist[r].max).toBeGreaterThanOrEqual(dist[r].median);
      }
    });

    it('should handle uniform labels', () => {
      const labels = new Array(100).fill(0);
      const dist = regimeDurationDistribution(labels, 1);
      expect(dist[0].mean).toBe(100);
      expect(dist[0].max).toBe(100);
    });
  });

  describe('regimeWarningSignals', () => {
    it('should generate warning signals', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      const warning = regimeWarningSignals(bullBearReturns, analysis, 20);
      expect(warning.currentRegime).toBeGreaterThanOrEqual(0);
      expect(warning.regimeAge).toBeGreaterThan(0);
      expect(typeof warning.warning).toBe('string');
    });

    it('should calculate transition risks', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      const warning = regimeWarningSignals(bullBearReturns, analysis, 20);
      expect(Object.keys(warning.transitionRisk).length).toBeGreaterThan(0);
    });

    it('should have expected remaining days', () => {
      const analysis = detectRegimes(bullBearReturns, 3, 20);
      const warning = regimeWarningSignals(bullBearReturns, analysis, 20);
      expect(warning.expectedRemaining).toBeGreaterThanOrEqual(0);
    });
  });
});
