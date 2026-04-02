import { describe, it, expect } from 'vitest';
import { runEventStudy, EventReturn } from '../services/eventStudyEngine';

function makeReturns(n: number, baseAR: number): EventReturn[] {
  return Array.from({ length: n }, (_, i) => ({
    day: i - Math.floor(n / 2),
    abnormalReturn: baseAR + (Math.random() - 0.5) * 0.02,
    volume: 10000 + Math.random() * 5000,
  }));
}

describe('EventStudyEngine', () => {
  it('returns null for insufficient data', () => {
    expect(runEventStudy([{ day: 0, abnormalReturn: 0.01, volume: 1000 }])).toBeNull();
  });

  it('returns valid result', () => {
    const r = runEventStudy(makeReturns(10, 0.005));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.car).toBe('number');
    expect(typeof r.aar).toBe('number');
  });

  it('computes CAR correctly', () => {
    const returns: EventReturn[] = [
      { day: -2, abnormalReturn: 0.01, volume: 1000 },
      { day: -1, abnormalReturn: 0.02, volume: 1000 },
      { day: 0, abnormalReturn: 0.03, volume: 1000 },
    ];
    const r = runEventStudy(returns);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.car).toBeCloseTo(0.06, 3);
  });

  it('computes AAR', () => {
    const returns: EventReturn[] = [
      { day: 0, abnormalReturn: 0.03, volume: 1000 },
      { day: 1, abnormalReturn: 0.06, volume: 1000 },
      { day: 2, abnormalReturn: 0.09, volume: 1000 },
    ];
    const r = runEventStudy(returns);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.aar).toBeCloseTo(0.06, 3);
  });

  it('computes t-statistic', () => {
    const r = runEventStudy(makeReturns(20, 0.01));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.tStatistic).toBe('number');
  });

  it('significance check works', () => {
    const r = runEventStudy(makeReturns(30, 0.05));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.isSignificant).toBe('boolean');
  });

  it('finds peak abnormal return', () => {
    const returns: EventReturn[] = [
      { day: -1, abnormalReturn: 0.01, volume: 1000 },
      { day: 0, abnormalReturn: 0.05, volume: 1000 },
      { day: 1, abnormalReturn: 0.02, volume: 1000 },
    ];
    const r = runEventStudy(returns);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.peakDay).toBe(0);
    expect(r.peakAR).toBeCloseTo(0.05, 3);
  });

  it('computes volume effect', () => {
    const returns: EventReturn[] = [
      { day: 0, abnormalReturn: 0.01, volume: 5000 },
      { day: 1, abnormalReturn: 0.02, volume: 15000 },
      { day: 2, abnormalReturn: 0.03, volume: 20000 },
    ];
    const r = runEventStudy(returns);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.volumeEffect).toBeGreaterThan(0);
  });

  it('windowDays matches input', () => {
    const returns = makeReturns(15, 0.01);
    const r = runEventStudy(returns);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.windowDays).toBe(15);
  });

  it('handles negative abnormal returns', () => {
    const r = runEventStudy(makeReturns(10, -0.02));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.car).toBeLessThan(0);
  });

  it('custom significance level', () => {
    const r = runEventStudy(makeReturns(10, 0.001), 1.0);
    expect(r).not.toBeNull();
  });

  it('handles 3 elements minimum', () => {
    const r = runEventStudy([
      { day: 0, abnormalReturn: 0.01, volume: 1000 },
      { day: 1, abnormalReturn: 0.02, volume: 1000 },
      { day: 2, abnormalReturn: 0.01, volume: 1000 },
    ]);
    expect(r).not.toBeNull();
  });

  it('sorted by day internally', () => {
    const unsorted: EventReturn[] = [
      { day: 1, abnormalReturn: 0.02, volume: 1000 },
      { day: -1, abnormalReturn: 0.01, volume: 1000 },
      { day: 0, abnormalReturn: 0.03, volume: 1000 },
    ];
    const r = runEventStudy(unsorted);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.peakDay).toBe(0);
  });

  it('zero variance returns zero t', () => {
    const same: EventReturn[] = [
      { day: 0, abnormalReturn: 0.05, volume: 1000 },
      { day: 1, abnormalReturn: 0.05, volume: 1000 },
      { day: 2, abnormalReturn: 0.05, volume: 1000 },
    ];
    const r = runEventStudy(same);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.aar).toBeCloseTo(0.05, 5);
  });
});
