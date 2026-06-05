import { describe, it, expect } from 'vitest';
import {
  crossSectionalScore, momentumDecile, sectorNeutralMomentum, momentumReversalSignal,
  StockReturn
} from '../services/crossSectionalMomentumEngine';

function makeStock(code: string, baseReturn: number): StockReturn {
  return { code, returns: Array.from({ length: 20 }, (_, i) => baseReturn + Math.sin(i) * 0.01) };
}

describe('crossSectionalMomentumEngine', () => {
  it('assigns scores in [-1, 1]', () => {
    const stocks = [makeStock('A', 0.02), makeStock('B', -0.01), makeStock('C', 0.01)];
    const scores = crossSectionalScore(stocks);
    expect(scores.size).toBe(3);
    scores.forEach(v => { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); });
  });
  it('higher return gets higher score', () => {
    const stocks = [makeStock('LOW', 0.001), makeStock('HIGH', 0.05)];
    const scores = crossSectionalScore(stocks);
    expect(scores.get('HIGH')!).toBeGreaterThan(scores.get('LOW')!);
  });
  it('empty input returns empty map', () => {
    expect(crossSectionalScore([]).size).toBe(0);
  });
  it('single stock gets score -1', () => {
    const scores = crossSectionalScore([makeStock('X', 0.02)]);
    expect(scores.get('X')).toBe(-1);
  });
  it('momentumDecile returns top decile', () => {
    const stocks = Array.from({ length: 20 }, (_, i) => makeStock(`S${i}`, i * 0.01));
    const top = momentumDecile(stocks, 1);
    expect(top.length).toBeGreaterThanOrEqual(1);
    expect(top[0]).toMatch(/^S\d+$/);
  });
  it('momentumDecile bottom decile', () => {
    const stocks = Array.from({ length: 20 }, (_, i) => makeStock(`S${i}`, i * 0.01));
    const bottom = momentumDecile(stocks, 10);
    expect(bottom.length).toBeGreaterThanOrEqual(1);
  });
  it('sector neutral gives within-sector ranks', () => {
    const stocks = [makeStock('A1', 0.03), makeStock('A2', 0.01), makeStock('B1', 0.02), makeStock('B2', -0.01)];
    const secMap = new Map([['A1', 'Tech'], ['A2', 'Tech'], ['B1', 'Finance'], ['B2', 'Finance']]);
    const scores = sectorNeutralMomentum(stocks, secMap);
    expect(scores.get('A1')!).toBeGreaterThan(scores.get('A2')!);
    expect(scores.get('B1')!).toBeGreaterThan(scores.get('B2')!);
  });
  it('sector neutral with unknown sector', () => {
    const stocks = [makeStock('X', 0.02)];
    const scores = sectorNeutralMomentum(stocks, new Map());
    expect(scores.has('X')).toBe(true);
  });
  it('momentumReversalSignal positive for recent uptick', () => {
    const returns = [...Array(30).fill(-0.01), ...Array(5).fill(0.03)];
    expect(momentumReversalSignal(returns, 5, 10)).toBeGreaterThan(0);
  });
  it('momentumReversalSignal zero for short series', () => {
    expect(momentumReversalSignal([0.01, 0.02], 5, 10)).toBe(0);
  });
  it('decile covers all stocks', () => {
    const stocks = Array.from({ length: 15 }, (_, i) => makeStock(`S${i}`, i * 0.01));
    const allDeciles = [];
    for (let d = 1; d <= 10; d++) allDeciles.push(...momentumDecile(stocks, d));
    expect(allDeciles.length).toBe(15);
  });
  it('two identical stocks get symmetric scores', () => {
    const stocks = [makeStock('A', 0.02), makeStock('B', 0.02)];
    const scores = crossSectionalScore(stocks);
    expect(scores.get('A')).toBe(scores.get('B'));
  });
  it('sector neutral with all same sector', () => {
    const stocks = [makeStock('A', 0.03), makeStock('B', 0.01)];
    const secMap = new Map([['A', 'Tech'], ['B', 'Tech']]);
    const scores = sectorNeutralMomentum(stocks, secMap);
    expect(scores.get('A')!).toBeGreaterThan(scores.get('B')!);
  });
  it('handles negative returns correctly', () => {
    const stocks = [makeStock('A', -0.05), makeStock('B', -0.01)];
    const scores = crossSectionalScore(stocks);
    expect(scores.get('B')!).toBeGreaterThan(scores.get('A')!);
  });
  it('momentumReversalSignal with exact length', () => {
    const returns = Array(15).fill(0.01);
    expect(typeof momentumReversalSignal(returns, 5, 10)).toBe('number');
  });
  it('large stock universe', () => {
    const stocks = Array.from({ length: 100 }, (_, i) => makeStock(`S${i}`, Math.random() * 0.1));
    const scores = crossSectionalScore(stocks);
    expect(scores.size).toBe(100);
  });
  it('momentumDecile with 11 stocks', () => {
    const stocks = Array.from({ length: 11 }, (_, i) => makeStock(`S${i}`, i * 0.01));
    const top = momentumDecile(stocks, 1);
    expect(top.length).toBeGreaterThanOrEqual(1);
  });
  it('sector neutral preserves total count', () => {
    const stocks = [makeStock('A', 0.02), makeStock('B', 0.01), makeStock('C', 0.03)];
    const secMap = new Map([['A', 'X'], ['B', 'Y'], ['C', 'X']]);
    const scores = sectorNeutralMomentum(stocks, secMap);
    expect(scores.size).toBe(3);
  });
});
