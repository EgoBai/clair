import { describe, it, expect } from 'vitest';
import { assessMacroSentiment, MacroIndicator } from '../services/macroSentimentEngine';

function makeInd(name: string, value: number, prev: number, weight: number, dir: MacroIndicator['direction']): MacroIndicator {
  return { name, value, prevValue: prev, weight, direction: dir };
}

describe('MacroSentimentEngine', () => {
  const indicators: MacroIndicator[] = [
    makeInd('利率', 3.5, 3.2, 0.3, 'negative'),
    makeInd('汇率', 6.8, 6.9, 0.2, 'positive'),
    makeInd('PMI', 52, 50, 0.25, 'positive'),
    makeInd('CPI', 2.1, 1.8, 0.15, 'negative'),
    makeInd('GDP', 5.5, 5.2, 0.1, 'positive'),
  ];

  it('returns null for empty indicators', () => {
    expect(assessMacroSentiment([])).toBeNull();
  });

  it('returns null when total weight is zero', () => {
    expect(assessMacroSentiment([makeInd('a', 1, 2, 0, 'neutral')])).toBeNull();
  });

  it('returns valid sentiment result', () => {
    const r = assessMacroSentiment(indicators);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.score).toBeGreaterThanOrEqual(-100);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('classifies bullish trend', () => {
    const bullish = [makeInd('g1', 10, 5, 0.5, 'positive'), makeInd('g2', 20, 10, 0.5, 'positive')];
    const r = assessMacroSentiment(bullish);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.trend).toBe('bullish');
  });

  it('classifies bearish trend', () => {
    const bearish = [makeInd('b1', 5, 10, 0.5, 'positive'), makeInd('b2', 3, 8, 0.5, 'positive')];
    const r = assessMacroSentiment(bearish);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.trend).toBe('bearish');
  });

  it('classifies neutral trend', () => {
    const neutral = [makeInd('n', 5, 5.001, 1, 'positive')];
    const r = assessMacroSentiment(neutral);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.trend).toBe('neutral');
  });

  it('confidence increases with indicator count', () => {
    const few = assessMacroSentiment([makeInd('a', 1, 2, 1, 'positive')]);
    const many = assessMacroSentiment(indicators);
    expect(few).not.toBeNull();
    expect(many).not.toBeNull();
    if (!few || !many) return;
    expect(many.confidence).toBeGreaterThan(few.confidence);
  });

  it('computes contributors', () => {
    const r = assessMacroSentiment(indicators);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(Object.keys(r.contributors).length).toBe(5);
  });

  it('risk level is high for extreme scores', () => {
    const extreme = [makeInd('e', 100, 10, 1, 'positive')];
    const r = assessMacroSentiment(extreme);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.riskLevel).toBe('high');
  });

  it('risk level is low for moderate scores', () => {
    const moderate = [makeInd('m', 5.1, 5, 1, 'positive')];
    const r = assessMacroSentiment(moderate);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.riskLevel).toBe('low');
  });

  it('negative direction reverses signal', () => {
    const neg = [makeInd('n', 10, 5, 1, 'negative')];
    const pos = [makeInd('p', 10, 5, 1, 'positive')];
    const rn = assessMacroSentiment(neg);
    const rp = assessMacroSentiment(pos);
    expect(rn).not.toBeNull();
    expect(rp).not.toBeNull();
    if (!rn || !rp) return;
    expect(rn.score).toBeLessThan(rp.score);
  });

  it('equal weights sum to 1', () => {
    const eq = [makeInd('a', 1, 2, 0.5, 'positive'), makeInd('b', 2, 1, 0.5, 'positive')];
    const r = assessMacroSentiment(eq);
    expect(r).not.toBeNull();
  });

  it('handles single indicator', () => {
    const r = assessMacroSentiment([makeInd('s', 5, 4, 1, 'positive')]);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.score).toBeGreaterThan(0);
  });

  it('handles neutral direction', () => {
    const r = assessMacroSentiment([makeInd('n', 5, 4, 1, 'neutral')]);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.score).toBe(0);
  });

  it('score is bounded', () => {
    const big = [makeInd('b', 1000, 1, 1, 'positive')];
    const r = assessMacroSentiment(big);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(-100);
  });
});
