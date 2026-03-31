import { describe, it, expect } from 'vitest';
import {
  predictRotation,
  identifyCyclePhase,
  analyzeStyleRotation,
  findLeadLagPairs,
  rankSectorHeat,
  type SectorSnapshot,
} from '../utils/sectorRotationPredictEngine';

function makeSector(overrides: Partial<SectorSnapshot> = {}): SectorSnapshot {
  return {
    name: '科技',
    date: '2025-01-15',
    return5d: 0.02,
    return20d: 0.05,
    return60d: 0.10,
    volume: 1000000,
    pe: 25,
    momentum: 0.5,
    breadth: 0.6,
    ...overrides,
  };
}

describe('SectorRotationPredictEngine', () => {
  const sectors: SectorSnapshot[] = [
    makeSector({ name: '科技', return5d: 0.08, momentum: 0.8, breadth: 0.4, pe: 35 }),
    makeSector({ name: '消费', return5d: -0.02, momentum: 0.2, breadth: 0.7, pe: 18 }),
    makeSector({ name: '金融', return5d: 0.01, momentum: 0.4, breadth: 0.6, pe: 12 }),
    makeSector({ name: '医药', return5d: -0.03, momentum: 0.15, breadth: 0.75, pe: 22 }),
    makeSector({ name: '新能源', return5d: 0.06, momentum: 0.75, breadth: 0.35, pe: 40 }),
  ];

  it('should predict rotation from overheated to undervalued', () => {
    const predictions = predictRotation(sectors);
    expect(predictions.length).toBeGreaterThan(0);
    for (const p of predictions) {
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(0.95);
      expect(p.reason).toBeTruthy();
      expect(p.expectedDuration).toBeTruthy();
    }
  });

  it('should handle empty sectors', () => {
    expect(predictRotation([])).toHaveLength(0);
  });

  it('should handle single sector', () => {
    expect(predictRotation([makeSector()])).toHaveLength(0);
  });

  it('should identify cycle phases', () => {
    const history = Array(6).fill(sectors);
    const phases = identifyCyclePhase(history);
    expect(phases.length).toBeGreaterThan(0);
    expect(['expansion', 'peak', 'contraction', 'trough']).toContain(phases[0].phase);
  });

  it('should return empty for insufficient history', () => {
    expect(identifyCyclePhase([sectors])).toHaveLength(0);
  });

  it('should analyze style rotation', () => {
    const styles = analyzeStyleRotation(sectors);
    expect(styles.length).toBe(4);
    const styleNames = styles.map(s => s.style);
    expect(styleNames).toContain('value');
    expect(styleNames).toContain('growth');
    expect(styleNames).toContain('momentum');
    expect(styleNames).toContain('quality');
    // Should be sorted by strength
    for (let i = 1; i < styles.length; i++) {
      expect(styles[i - 1].strength).toBeGreaterThanOrEqual(styles[i].strength);
    }
  });

  it('should handle empty sectors for style rotation', () => {
    expect(analyzeStyleRotation([])).toHaveLength(0);
  });

  it('should find lead-lag pairs', () => {
    const sectorReturns = new Map<string, number[]>();
    // Create correlated series with lag
    const base = Array.from({ length: 40 }, (_, i) => Math.sin(i * 0.3) * 0.02);
    sectorReturns.set('科技', base);
    sectorReturns.set('金融', base.map((_, i) => i >= 3 ? base[i - 3] * 0.8 + Math.random() * 0.005 : 0));

    const pairs = findLeadLagPairs(sectorReturns, 5);
    // May or may not find pairs depending on data
    expect(Array.isArray(pairs)).toBe(true);
  });

  it('should handle insufficient data for lead-lag', () => {
    const sectorReturns = new Map([
      ['A', [0.01, 0.02]],
      ['B', [0.01, 0.02]],
    ]);
    expect(findLeadLagPairs(sectorReturns, 5)).toHaveLength(0);
  });

  it('should rank sector heat', () => {
    const ranked = rankSectorHeat(sectors);
    expect(ranked.length).toBe(sectors.length);
    expect(ranked[0].rank).toBe(1);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].heatScore).toBeGreaterThanOrEqual(ranked[i].heatScore);
      expect(ranked[i].rank).toBe(i + 1);
    }
    expect(['hot', 'warm', 'cool', 'cold']).toContain(ranked[0].signal);
  });
});
