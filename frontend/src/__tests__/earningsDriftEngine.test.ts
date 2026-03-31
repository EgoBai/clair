import { describe, it, expect } from 'vitest';
import { EarningsDriftEngine } from '../utils/earningsDriftEngine';

describe('Earnings Drift Engine', () => {
  const engine = new EarningsDriftEngine();

  describe('calcSurprise', () => {
    it('应计算正超预期', () => {
      const result = engine.calcSurprise('TEST', 1.5, 1.0);
      expect(result.surprisePct).toBe(0.5);
      expect(result.direction).toBe('positive');
      expect(result.magnitude).toBe('massive');
    });

    it('应计算负超预期', () => {
      const result = engine.calcSurprise('TEST', 0.5, 1.0);
      expect(result.surprisePct).toBe(-0.5);
      expect(result.direction).toBe('negative');
    });

    it('应判断超预期幅度', () => {
      expect(engine.calcSurprise('T', 1.01, 1.0).magnitude).toBe('small');
      expect(engine.calcSurprise('T', 1.06, 1.0).magnitude).toBe('medium');
      expect(engine.calcSurprise('T', 1.15, 1.0).magnitude).toBe('large');
      expect(engine.calcSurprise('T', 1.3, 1.0).magnitude).toBe('massive');
    });
  });

  describe('generateDriftSignal', () => {
    it('应生成漂移信号', () => {
      const surprise = engine.calcSurprise('TEST', 1.2, 1.0);
      const signal = engine.generateDriftSignal(surprise, []);
      expect(['long', 'short', 'neutral']).toContain(signal.direction);
      expect(signal.expectedDrift).toBeGreaterThan(0);
      expect(signal.optimalHoldDays).toBeGreaterThan(0);
    });

    it('置信度应在0-1之间', () => {
      const surprise = engine.calcSurprise('TEST', 1.1, 1.0);
      const signal = engine.generateDriftSignal(surprise, []);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('calcDriftDecay', () => {
    it('应计算衰减曲线', () => {
      const drifts = Array.from({ length: 10 }, () =>
        Array.from({ length: 20 }, () => (Math.random() - 0.3) * 0.01)
      );
      const decay = engine.calcDriftDecay(drifts);
      expect(decay.length).toBe(10);
      expect(decay[0].day).toBe(1);
      expect(decay[0].signalStrength).toBeGreaterThan(decay[decay.length - 1].signalStrength);
    });

    it('胜率应在0-1之间', () => {
      const drifts = Array.from({ length: 5 }, () =>
        Array.from({ length: 10 }, () => (Math.random() - 0.5) * 0.01)
      );
      const decay = engine.calcDriftDecay(drifts);
      for (const d of decay) {
        expect(d.winRate).toBeGreaterThanOrEqual(0);
        expect(d.winRate).toBeLessThanOrEqual(1);
      }
    });

    it('空数据应返回空', () => {
      const decay = engine.calcDriftDecay([]);
      expect(decay).toEqual([]);
    });
  });

  describe('analyzeIndustryContagion', () => {
    it('应分析传染效应', () => {
      const result = engine.analyzeIndustryContagion(
        '科技',
        { A: [0.01], B: [0.02] },
        { A: 0.7, B: 0.6, C: 0.1 },
      );
      expect(result.sector).toBe('科技');
      expect(result.contagionScore).toBeGreaterThan(0);
      expect(result.relatedTickers.length).toBe(2);
    });
  });

  describe('generateReport', () => {
    it('应生成完整报告', () => {
      const drifts = Array.from({ length: 10 }, () =>
        Array.from({ length: 20 }, () => (Math.random() - 0.3) * 0.01)
      );
      const report = engine.generateReport('TEST', 1.2, 1.0, drifts);
      expect(report.surprise).toBeDefined();
      expect(report.signal).toBeDefined();
      expect(report.decayCurve.length).toBeGreaterThan(0);
      expect(['strong_play', 'play', 'monitor', 'avoid']).toContain(report.recommendation);
    });

    it('历史准确率应在0-1之间', () => {
      const drifts = Array.from({ length: 5 }, () =>
        Array.from({ length: 10 }, () => (Math.random() - 0.5) * 0.01)
      );
      const report = engine.generateReport('TEST', 1.1, 1.0, drifts);
      expect(report.historicalAccuracy).toBeGreaterThanOrEqual(0);
      expect(report.historicalAccuracy).toBeLessThanOrEqual(1);
    });
  });
});
