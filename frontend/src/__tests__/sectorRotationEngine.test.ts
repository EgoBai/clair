import { describe, it, expect } from 'vitest';
import {
  calculateSectorMomentum,
  detectRotationSignals,
  calculateCapitalFlows,
  calculateRelativeStrength,
  SectorSnapshot,
} from '../utils/sectorRotationEngine';

function makeSnap(overrides: Partial<SectorSnapshot> = {}): SectorSnapshot {
  return {
    sector: 'Tech',
    timestamp: Date.now(),
    change: 1.5,
    volume: 1000000,
    turnover: 500000,
    upCount: 30,
    downCount: 10,
    leadingStocks: [],
    ...overrides,
  };
}

describe('calculateSectorMomentum', () => {
  it('calculates composite momentum', () => {
    const history = [
      makeSnap({ sector: 'Tech', timestamp: 3, change: 2 }),
      makeSnap({ sector: 'Tech', timestamp: 2, change: 1 }),
      makeSnap({ sector: 'Tech', timestamp: 1, change: -1 }),
      makeSnap({ sector: 'Finance', timestamp: 3, change: -2 }),
      makeSnap({ sector: 'Finance', timestamp: 2, change: -1 }),
      makeSnap({ sector: 'Finance', timestamp: 1, change: 0 }),
    ];
    const momentum = calculateSectorMomentum(history);
    expect(momentum).toHaveLength(2);
    expect(momentum[0].rank).toBe(1);
    expect(momentum.find(m => m.sector === 'Tech')!.trend).toBe('up');
  });

  it('handles single snapshot', () => {
    const history = [makeSnap({ sector: 'A', change: 5 })];
    const momentum = calculateSectorMomentum(history);
    expect(momentum).toHaveLength(1);
    expect(momentum[0].momentum1D).toBe(5);
  });
});

describe('detectRotationSignals', () => {
  it('detects rotation from laggard to leader', () => {
    const momentum = [
      { sector: 'Tech', momentum1D: 3, momentum5D: 2, momentum20D: 1, compositeMomentum: 2.5, rank: 1, trend: 'up' as const },
      { sector: 'Energy', momentum1D: -3, momentum5D: -2, momentum20D: -1, compositeMomentum: -2.5, rank: 2, trend: 'down' as const },
    ];
    const signals = detectRotationSignals(momentum);
    expect(signals).toHaveLength(1);
    expect(signals[0].fromSector).toBe('Energy');
    expect(signals[0].toSector).toBe('Tech');
  });

  it('returns empty for no rotation', () => {
    const momentum = [
      { sector: 'A', momentum1D: 0, momentum5D: 0, momentum20D: 0, compositeMomentum: 0, rank: 1, trend: 'sideways' as const },
    ];
    expect(detectRotationSignals(momentum)).toHaveLength(0);
  });

  it('detects early phase', () => {
    const momentum = [
      { sector: 'A', momentum1D: 5, momentum5D: 2, momentum20D: 1, compositeMomentum: 3, rank: 1, trend: 'up' as const },
      { sector: 'B', momentum1D: -5, momentum5D: -2, momentum20D: -1, compositeMomentum: -3, rank: 2, trend: 'down' as const },
    ];
    const signals = detectRotationSignals(momentum);
    expect(signals[0].phase).toBe('early');
  });
});

describe('calculateCapitalFlows', () => {
  it('calculates net flow', () => {
    const snapshots = [
      makeSnap({ sector: 'Tech', timestamp: 1, change: 2, turnover: 100 }),
      makeSnap({ sector: 'Tech', timestamp: 2, change: -1, turnover: 50 }),
    ];
    const flows = calculateCapitalFlows(snapshots);
    expect(flows).toHaveLength(1);
    expect(flows[0].netFlow).toBeGreaterThan(0); // more inflow than outflow
  });

  it('ranks by net flow', () => {
    const snapshots = [
      makeSnap({ sector: 'A', timestamp: 1, change: 5, turnover: 1000 }),
      makeSnap({ sector: 'B', timestamp: 1, change: -5, turnover: 1000 }),
    ];
    const flows = calculateCapitalFlows(snapshots);
    expect(flows[0].sector).toBe('A');
  });
});

describe('calculateRelativeStrength', () => {
  it('calculates RS for outperforming sector', () => {
    const rs = calculateRelativeStrength([110, 100], [105, 100]);
    expect(rs).toBeGreaterThan(0);
  });

  it('calculates RS for underperforming sector', () => {
    const rs = calculateRelativeStrength([95, 100], [105, 100]);
    expect(rs).toBeLessThan(0);
  });

  it('returns 0 for insufficient data', () => {
    expect(calculateRelativeStrength([100], [100])).toBe(0);
  });
});
