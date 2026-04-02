import { describe, it, expect } from 'vitest';
import { earningsStability, accrualRatio, roeStability, growthQuality, compositeQuality, QualityMetrics } from '../services/qualityFactorEngine';

const m: QualityMetrics = {
  code: 'A',
  earnings: [10, 11, 12, 13, 14],
  revenues: [100, 110, 120, 130, 140],
  cashFlows: [9, 10, 11, 12, 13],
  roes: [0.15, 0.16, 0.14, 0.17, 0.15],
};

describe('qualityFactorEngine', () => {
  it('earningsStability high for steady growth', () => { expect(earningsStability(m.earnings)).toBeGreaterThan(0.5); });
  it('earningsStability low for volatile', () => { expect(earningsStability([10, 20, 5, 30, 1])).toBeLessThan(0.5); });
  it('earningsStability single', () => { expect(earningsStability([10])).toBe(0); });
  it('earningsStability constant', () => { expect(earningsStability([10, 10, 10, 10])).toBe(1); });
  it('accrualRatio near zero for matching', () => { expect(Math.abs(accrualRatio(m.earnings, m.cashFlows))).toBeLessThan(0.2); });
  it('accrualRatio empty', () => { expect(accrualRatio([], [])).toBe(0); });
  it('accrualRatio zero earnings', () => { expect(accrualRatio([0, 0], [1, 2])).toBe(0); });
  it('roeStability high for stable ROE', () => { expect(roeStability([0.15, 0.15, 0.15])).toBeGreaterThan(0); });
  it('roeStability single', () => { expect(roeStability([0.15])).toBe(0); });
  it('roeStability zero mean', () => { expect(roeStability([0, 0, 0])).toBe(0); });
  it('growthQuality positive for growing', () => { expect(growthQuality(m.revenues, m.earnings)).toBeGreaterThan(0); });
  it('growthQuality short', () => { expect(growthQuality([1], [2])).toBe(0); });
  it('compositeQuality in [0, 1]', () => {
    const q = compositeQuality(m);
    expect(q).toBeGreaterThanOrEqual(0);
    expect(q).toBeLessThanOrEqual(1);
  });
  it('compositeQuality positive for good metrics', () => {
    const good: QualityMetrics = { code: 'G', earnings: [10,12,14,16,18], revenues: [100,120,140,160,180], cashFlows: [9,11,13,15,17], roes: [0.2,0.2,0.2,0.2,0.2] };
    expect(compositeQuality(good)).toBeGreaterThan(0);
  });
  it('earningsStability with zero base', () => {
    const s = earningsStability([0, 1, 2, 3]);
    expect(typeof s).toBe('number');
  });
  it('accrualRatio with higher cash flow', () => {
    expect(accrualRatio([10, 10], [15, 15])).toBeLessThan(0);
  });
  it('roeStability negative mean', () => {
    const s = roeStability([-0.1, -0.1, -0.1]);
    expect(typeof s).toBe('number');
  });
  it('growthQuality declining', () => {
    expect(growthQuality([100, 90, 80], [50, 45, 40])).toBeLessThan(0);
  });
  it('compositeQuality with defaults', () => {
    const q = compositeQuality(m);
    expect(typeof q).toBe('number');
  });
  it('earningsStability identical growth', () => {
    expect(earningsStability([100, 110, 121, 133.1])).toBeGreaterThan(0.8);
  });
});
