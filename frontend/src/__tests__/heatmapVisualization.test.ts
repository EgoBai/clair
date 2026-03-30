import { describe, it, expect } from 'vitest';

// Heatmap & Sector Visualization Utilities
interface SectorData {
  name: string;
  code: string;
  changePercent: number;
  turnover: number;
  volume: number;
  stockCount: number;
  leaderStock: string;
  leaderChange: number;
}

interface HeatmapCell {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  color: string;
  label: string;
}

function getHeatColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgb(128, 128, 128)';
  const normalized = (value - min) / (max - min);
  if (normalized < 0.5) {
    const t = normalized * 2;
    const r = Math.round(0 + t * 128);
    const g = Math.round(80 + t * 80);
    const b = Math.round(30 + t * 98);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (normalized - 0.5) * 2;
    const r = Math.round(128 + t * 127);
    const g = Math.round(160 - t * 100);
    const b = Math.round(128 - t * 98);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function getChangeColor(changePercent: number): string {
  if (changePercent > 0) {
    const intensity = Math.min(changePercent / 10, 1);
    const r = Math.round(200 + 55 * intensity);
    const g = Math.round(50 + 30 * intensity);
    const b = Math.round(50 + 20 * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (changePercent < 0) {
    const intensity = Math.min(Math.abs(changePercent) / 10, 1);
    const r = Math.round(50 + 30 * intensity);
    const g = Math.round(150 + 50 * intensity);
    const b = Math.round(50 + 50 * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return 'rgb(128, 128, 128)';
}

function treemapLayout(items: { value: number; label: string }[], width: number, height: number): HeatmapCell[] {
  if (items.length === 0) return [];
  const total = items.reduce((s, i) => s + Math.abs(i.value), 0);
  if (total === 0) return items.map((item, i) => ({ x: 0, y: 0, width: 0, height: 0, value: 0, color: 'gray', label: item.label }));

  const sorted = [...items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const cells: HeatmapCell[] = [];
  let x = 0, y = 0, remainingW = width, remainingH = height;
  const isHorizontal = width >= height;

  for (let i = 0; i < sorted.length && (remainingW > 0 && remainingH > 0); i++) {
    const ratio = Math.abs(sorted[i].value) / total;
    if (isHorizontal) {
      const cellW = Math.max(1, remainingW * ratio * sorted.length / (sorted.length - i));
      cells.push({
        x, y,
        width: Math.min(cellW, remainingW),
        height: remainingH,
        value: sorted[i].value,
        color: getChangeColor(sorted[i].value),
        label: sorted[i].label,
      });
      x += cellW;
      remainingW -= cellW;
    } else {
      const cellH = Math.max(1, remainingH * ratio * sorted.length / (sorted.length - i));
      cells.push({
        x, y,
        width: remainingW,
        height: Math.min(cellH, remainingH),
        value: sorted[i].value,
        color: getChangeColor(sorted[i].value),
        label: sorted[i].label,
      });
      y += cellH;
      remainingH -= cellH;
    }
  }
  return cells;
}

function rankSectors(sectors: SectorData[], sortBy: keyof SectorData = 'changePercent', desc = true): SectorData[] {
  return [...sectors].sort((a, b) => {
    const va = a[sortBy] as number, vb = b[sortBy] as number;
    return desc ? vb - va : va - vb;
  });
}

function sectorSummary(sectors: SectorData[]): {
  totalSectors: number;
  avgChange: number;
  upSectors: number;
  downSectors: number;
  flatSectors: number;
  hotSector: string;
  coldSector: string;
  totalTurnover: number;
} {
  if (sectors.length === 0) {
    return { totalSectors: 0, avgChange: 0, upSectors: 0, downSectors: 0, flatSectors: 0, hotSector: '', coldSector: '', totalTurnover: 0 };
  }
  const sorted = rankSectors(sectors);
  return {
    totalSectors: sectors.length,
    avgChange: Math.round(sectors.reduce((s, x) => s + x.changePercent, 0) / sectors.length * 100) / 100,
    upSectors: sectors.filter(s => s.changePercent > 0).length,
    downSectors: sectors.filter(s => s.changePercent < 0).length,
    flatSectors: sectors.filter(s => s.changePercent === 0).length,
    hotSector: sorted[0].name,
    coldSector: sorted[sorted.length - 1].name,
    totalTurnover: sectors.reduce((s, x) => s + x.turnover, 0),
  };
}

function calculateSectorCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den > 0 ? Math.round(num / den * 1000) / 1000 : 0;
}

function momentumScore(changes: number[]): number {
  if (changes.length === 0) return 50;
  const recent = changes.slice(-5);
  const older = changes.slice(-10, -5);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
  const acc = recentAvg - olderAvg;
  return Math.max(0, Math.min(100, Math.round(50 + acc * 10)));
}

function sectorRotation(current: SectorData[], previous: SectorData[]): { name: string; flow: 'in' | 'out'; delta: number }[] {
  const currentMap = new Map(current.map(s => [s.code, s]));
  const previousMap = new Map(previous.map(s => [s.code, s]));
  const result = [];
  for (const [code, curr] of currentMap) {
    const prev = previousMap.get(code);
    if (prev) {
      const delta = curr.turnover - prev.turnover;
      if (Math.abs(delta) > prev.turnover * 0.1) {
        result.push({ name: curr.name, flow: delta > 0 ? 'in' as const : 'out' as const, delta: Math.round(delta) });
      }
    }
  }
  return result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

const sampleSectors: SectorData[] = [
  { name: '白酒', code: 'BK0897', changePercent: 3.5, turnover: 5e10, volume: 2e9, stockCount: 20, leaderStock: '600519', leaderChange: 4.2 },
  { name: '新能源', code: 'BK0478', changePercent: -2.1, turnover: 8e10, volume: 5e9, stockCount: 80, leaderStock: '300750', leaderChange: -3.5 },
  { name: '银行', code: 'BK0475', changePercent: 0.8, turnover: 3e10, volume: 3e9, stockCount: 40, leaderStock: '600036', leaderChange: 1.2 },
  { name: '半导体', code: 'BK0536', changePercent: 5.2, turnover: 6e10, volume: 3e9, stockCount: 60, leaderStock: '688981', leaderChange: 8.0 },
  { name: '医药', code: 'BK0465', changePercent: -0.5, turnover: 4e10, volume: 2e9, stockCount: 100, leaderStock: '600276', leaderChange: -1.0 },
  { name: '地产', code: 'BK0451', changePercent: -3.8, turnover: 2e10, volume: 4e9, stockCount: 50, leaderStock: '001979', leaderChange: -5.0 },
  { name: '军工', code: 'BK0481', changePercent: 1.5, turnover: 3.5e10, volume: 2.5e9, stockCount: 45, leaderStock: '600760', leaderChange: 2.0 },
  { name: '消费', code: 'BK0438', changePercent: 0, turnover: 2.5e10, volume: 1.5e9, stockCount: 30, leaderStock: '000858', leaderChange: 0.2 },
];

describe('Heatmap & Sector Visualization', () => {
  describe('Heat Color', () => {
    it('should generate red for high values', () => {
      const color = getHeatColor(10, 0, 10);
      expect(color).toContain('rgb');
      expect(color).toMatch(/rgb\(25[0-5],/);
    });

    it('should generate green for low values', () => {
      const color = getHeatColor(0, 0, 10);
      expect(color).toContain('rgb');
    });

    it('should generate gray for equal min/max', () => {
      expect(getHeatColor(5, 5, 5)).toBe('rgb(128, 128, 128)');
    });

    it('should generate mid color for midpoint', () => {
      const color = getHeatColor(5, 0, 10);
      expect(color).toContain('rgb');
    });
  });

  describe('Change Color', () => {
    it('should return red for positive change', () => {
      const color = getChangeColor(5);
      expect(color).toMatch(/rgb\(2[0-5][0-9],/);
    });

    it('should return green for negative change', () => {
      const color = getChangeColor(-5);
      expect(color).toContain('rgb');
    });

    it('should return gray for zero', () => {
      expect(getChangeColor(0)).toBe('rgb(128, 128, 128)');
    });

    it('should cap at +/-10%', () => {
      const extreme = getChangeColor(100);
      const capped = getChangeColor(10);
      expect(extreme).toBe(capped);
    });
  });

  describe('Treemap Layout', () => {
    it('should create cells for items', () => {
      const items = [{ value: 10, label: 'A' }, { value: 5, label: 'B' }, { value: 3, label: 'C' }];
      const cells = treemapLayout(items, 100, 100);
      expect(cells.length).toBeGreaterThan(0);
    });

    it('should handle empty items', () => {
      expect(treemapLayout([], 100, 100)).toHaveLength(0);
    });

    it('should handle zero total value', () => {
      const items = [{ value: 0, label: 'A' }];
      const cells = treemapLayout(items, 100, 100);
      expect(cells).toHaveLength(1);
    });

    it('should include color in cells', () => {
      const items = [{ value: 10, label: 'A' }, { value: -5, label: 'B' }];
      const cells = treemapLayout(items, 100, 100);
      expect(cells.every(c => typeof c.color === 'string')).toBe(true);
    });
  });

  describe('Sector Ranking', () => {
    it('should rank by change descending', () => {
      const ranked = rankSectors(sampleSectors, 'changePercent', true);
      expect(ranked[0].changePercent).toBeGreaterThanOrEqual(ranked[1].changePercent);
    });

    it('should rank by turnover ascending', () => {
      const ranked = rankSectors(sampleSectors, 'turnover', false);
      expect(ranked[0].turnover).toBeLessThanOrEqual(ranked[1].turnover);
    });

    it('should rank by volume', () => {
      const ranked = rankSectors(sampleSectors, 'volume', true);
      expect(ranked[0].volume).toBeGreaterThanOrEqual(ranked[1].volume);
    });
  });

  describe('Sector Summary', () => {
    it('should compute correct summary', () => {
      const summary = sectorSummary(sampleSectors);
      expect(summary.totalSectors).toBe(8);
      expect(summary.upSectors).toBeGreaterThan(0);
      expect(summary.downSectors).toBeGreaterThan(0);
      expect(summary.hotSector).toBe('半导体');
      expect(summary.coldSector).toBe('地产');
      expect(summary.totalTurnover).toBeGreaterThan(0);
    });

    it('should handle empty sectors', () => {
      const summary = sectorSummary([]);
      expect(summary.totalSectors).toBe(0);
      expect(summary.hotSector).toBe('');
    });

    it('should compute average change', () => {
      const summary = sectorSummary(sampleSectors);
      const manualAvg = sampleSectors.reduce((s, x) => s + x.changePercent, 0) / sampleSectors.length;
      expect(summary.avgChange).toBeCloseTo(manualAvg, 1);
    });
  });

  describe('Sector Correlation', () => {
    it('should calculate correlation', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [2, 4, 6, 8, 10];
      expect(calculateSectorCorrelation(a, b)).toBe(1);
    });

    it('should return -1 for inverse', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [5, 4, 3, 2, 1];
      expect(calculateSectorCorrelation(a, b)).toBe(-1);
    });

    it('should return 0 for mismatched lengths', () => {
      expect(calculateSectorCorrelation([1, 2], [1])).toBe(0);
    });

    it('should return 0 for empty arrays', () => {
      expect(calculateSectorCorrelation([], [])).toBe(0);
    });

    it('should handle identical arrays', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(calculateSectorCorrelation(arr, arr)).toBe(1);
    });
  });

  describe('Momentum Score', () => {
    it('should score positive momentum high', () => {
      const changes = [1, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const score = momentumScore(changes);
      expect(score).toBeGreaterThan(50);
    });

    it('should score negative momentum low', () => {
      const changes = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
      const score = momentumScore(changes);
      expect(score).toBeLessThan(50);
    });

    it('should return 50 for empty', () => {
      expect(momentumScore([])).toBe(50);
    });

    it('should clamp to 0-100', () => {
      const score = momentumScore(Array.from({ length: 10 }, () => -100));
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Sector Rotation', () => {
    it('should detect fund inflows', () => {
      const prev: SectorData[] = [
        { name: '白酒', code: 'BK0897', changePercent: 1, turnover: 1e10, volume: 1e9, stockCount: 20, leaderStock: '', leaderChange: 0 },
      ];
      const curr: SectorData[] = [
        { name: '白酒', code: 'BK0897', changePercent: 3, turnover: 2e10, volume: 2e9, stockCount: 20, leaderStock: '', leaderChange: 0 },
      ];
      const rotation = sectorRotation(curr, prev);
      expect(rotation.length).toBeGreaterThan(0);
      expect(rotation[0].flow).toBe('in');
    });

    it('should detect fund outflows', () => {
      const prev: SectorData[] = [
        { name: '地产', code: 'BK0451', changePercent: -1, turnover: 5e10, volume: 1e9, stockCount: 20, leaderStock: '', leaderChange: 0 },
      ];
      const curr: SectorData[] = [
        { name: '地产', code: 'BK0451', changePercent: -3, turnover: 1e10, volume: 1e9, stockCount: 20, leaderStock: '', leaderChange: 0 },
      ];
      const rotation = sectorRotation(curr, prev);
      expect(rotation.length).toBeGreaterThan(0);
      expect(rotation[0].flow).toBe('out');
    });

    it('should ignore small changes', () => {
      const prev: SectorData[] = [
        { name: 'A', code: 'A', changePercent: 1, turnover: 1e10, volume: 1e9, stockCount: 10, leaderStock: '', leaderChange: 0 },
      ];
      const curr: SectorData[] = [
        { name: 'A', code: 'A', changePercent: 1, turnover: 1.05e10, volume: 1e9, stockCount: 10, leaderStock: '', leaderChange: 0 },
      ];
      expect(sectorRotation(curr, prev)).toHaveLength(0);
    });
  });
});
