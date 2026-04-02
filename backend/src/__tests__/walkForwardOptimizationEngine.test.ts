import { describe, it, expect } from 'vitest';
import { generateWindows, walkForwardScore, efficiencyRatio, WindowConfig } from '../services/walkForwardOptimizationEngine';

const cfg: WindowConfig = { trainSize: 60, testSize: 20, stepSize: 20 };

describe('walkForwardOptimizationEngine', () => {
  it('generates correct number of windows', () => {
    const wins = generateWindows(200, cfg);
    expect(wins.length).toBeGreaterThan(0);
  });
  it('windows do not overlap test sets by step', () => {
    const wins = generateWindows(200, cfg);
    for (let i = 1; i < wins.length; i++) {
      expect(wins[i].testStart).toBeGreaterThanOrEqual(wins[i - 1].testEnd - (cfg.stepSize < cfg.testSize ? cfg.testSize - cfg.stepSize : 0));
    }
  });
  it('total too short returns empty', () => {
    expect(generateWindows(50, cfg).length).toBe(0);
  });
  it('exact boundary generates one window', () => {
    const wins = generateWindows(80, cfg);
    expect(wins.length).toBe(1);
  });
  it('train end equals test start', () => {
    const wins = generateWindows(200, cfg);
    wins.forEach(w => { expect(w.trainEnd).toBe(w.testStart); });
  });
  it('walkForwardScore returns number', () => {
    const perf = Array.from({ length: 200 }, () => Math.random() * 0.02 - 0.005);
    const score = walkForwardScore(perf, cfg);
    expect(typeof score).toBe('number');
  });
  it('walkForwardScore with short series', () => {
    expect(walkForwardScore([0.01, 0.02], cfg)).toBe(0);
  });
  it('walkForwardScore positive for all positive returns', () => {
    const perf = Array(200).fill(0.01);
    expect(walkForwardScore(perf, cfg)).toBeGreaterThan(0);
  });
  it('efficiencyRatio > 1 when test outperforms', () => {
    expect(efficiencyRatio([0.01], [0.02])).toBeCloseTo(2);
  });
  it('efficiencyRatio < 1 when test underperforms', () => {
    expect(efficiencyRatio([0.02], [0.01])).toBeCloseTo(0.5);
  });
  it('efficiencyRatio = 1 for same performance', () => {
    expect(efficiencyRatio([0.01, 0.02], [0.01, 0.02])).toBe(1);
  });
  it('efficiencyRatio with zero train', () => {
    expect(efficiencyRatio([0, 0], [0.01])).toBe(0);
  });
  it('efficiencyRatio train zero test zero', () => {
    expect(efficiencyRatio([0, 0], [0, 0])).toBe(1);
  });
  it('generateWindows with step = train', () => {
    const wins = generateWindows(300, { trainSize: 100, testSize: 50, stepSize: 100 });
    expect(wins.length).toBe(2);
  });
  it('generateWindows step < test', () => {
    const wins = generateWindows(200, { trainSize: 60, testSize: 30, stepSize: 10 });
    expect(wins.length).toBeGreaterThan(2);
  });
  it('walkForwardScore negative for all negative', () => {
    const perf = Array(200).fill(-0.01);
    expect(walkForwardScore(perf, cfg)).toBeLessThan(0);
  });
  it('efficiencyRatio handles large values', () => {
    expect(efficiencyRatio([0.001], [1.0])).toBe(1000);
  });
  it('generateWindows with large total', () => {
    const wins = generateWindows(10000, cfg);
    expect(wins.length).toBeGreaterThan(100);
  });
  it('walkForwardScore mixed returns', () => {
    const perf = Array.from({ length: 200 }, (_, i) => i % 2 === 0 ? 0.01 : -0.01);
    const score = walkForwardScore(perf, cfg);
    expect(typeof score).toBe('number');
  });
  it('efficiencyRatio both negative', () => {
    expect(efficiencyRatio([-0.02], [-0.01])).toBeCloseTo(0.5);
  });
});
