import { describe, it, expect } from 'vitest';
import {
  getColorForValue,
  squarify,
  renderHeatmap,
  calculateSentiment,
  groupBySector,
  HeatmapConfig,
  HeatmapGroup,
} from '../utils/heatmapEngine';

describe('getColorForValue', () => {
  it('returns color for redGreen scheme', () => {
    const config = { colorScheme: 'redGreen' as const, minValue: -10, maxValue: 10 };
    const negColor = getColorForValue(-5, config);
    const posColor = getColorForValue(5, config);
    expect(negColor).not.toBe(posColor);
    expect(negColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(posColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns color for blueRed scheme', () => {
    const config = { colorScheme: 'blueRed' as const, minValue: 0, maxValue: 100 };
    expect(getColorForValue(0, config)).toMatch(/^#[0-9a-f]{6}$/);
    expect(getColorForValue(50, config)).toMatch(/^#[0-9a-f]{6}$/);
    expect(getColorForValue(100, config)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns color for monochrome', () => {
    const config = { colorScheme: 'monochrome' as const, minValue: 0, maxValue: 100 };
    const dark = getColorForValue(100, config);
    const light = getColorForValue(0, config);
    expect(dark).not.toBe(light);
  });

  it('clamps out-of-range values', () => {
    const config = { colorScheme: 'redGreen' as const, minValue: 0, maxValue: 100 };
    const below = getColorForValue(-50, config);
    const above = getColorForValue(150, config);
    expect(below).toMatch(/^#[0-9a-f]{6}$/);
    expect(above).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('squarify', () => {
  it('returns empty for empty cells', () => {
    expect(squarify([], 0, 0, 100, 100, 2)).toEqual([]);
  });

  it('positions single cell', () => {
    const result = squarify([{ id: 'a', label: 'A', value: 1, size: 100 }], 0, 0, 100, 100, 0);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('positions multiple cells', () => {
    const cells = [
      { id: 'a', label: 'A', value: 1, size: 50 },
      { id: 'b', label: 'B', value: 2, size: 30 },
      { id: 'c', label: 'C', value: 3, size: 20 },
    ];
    const result = squarify(cells, 0, 0, 200, 100, 0);
    expect(result).toHaveLength(3);
    expect(result.every(r => r.width > 0 && r.height > 0)).toBe(true);
  });

  it('applies padding', () => {
    const cells = [{ id: 'a', label: 'A', value: 1, size: 100 }];
    const result = squarify(cells, 0, 0, 100, 100, 5);
    expect(result[0].x).toBe(5);
    expect(result[0].y).toBe(5);
  });

  it('handles zero-size cells', () => {
    const cells = [
      { id: 'a', label: 'A', value: 1, size: 0 },
      { id: 'b', label: 'B', value: 2, size: 100 },
    ];
    const result = squarify(cells, 0, 0, 100, 100, 0);
    expect(result).toHaveLength(2);
  });
});

describe('renderHeatmap', () => {
  const config: HeatmapConfig = {
    metric: 'change',
    colorScheme: 'redGreen',
    minValue: -10,
    maxValue: 10,
    cellPadding: 2,
    borderRadius: 4,
    showLabels: true,
    showValues: true,
    animationDuration: 300,
  };

  const groups: HeatmapGroup[] = [
    {
      id: 'tech',
      label: 'Technology',
      cells: [
        { id: 'a', label: 'Stock A', value: 5, size: 100 },
        { id: 'b', label: 'Stock B', value: -3, size: 80 },
      ],
    },
  ];

  it('renders groups and cells', () => {
    const result = renderHeatmap(groups, config, 400, 300);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].cells).toHaveLength(2);
    expect(result.totalWidth).toBe(400);
    expect(result.totalHeight).toBe(300);
  });

  it('assigns colors to cells', () => {
    const result = renderHeatmap(groups, config, 400, 300);
    for (const cell of result.groups[0].cells) {
      expect(cell.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('generates legend', () => {
    const result = renderHeatmap(groups, config, 400, 300);
    expect(result.legend.length).toBeGreaterThan(0);
    expect(result.legend[0].color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles empty groups', () => {
    const result = renderHeatmap([], config, 400, 300);
    expect(result.groups).toHaveLength(0);
    expect(result.legend.length).toBeGreaterThan(0);
  });

  it('computes font sizes', () => {
    const result = renderHeatmap(groups, config, 400, 300);
    for (const cell of result.groups[0].cells) {
      expect(cell.fontSize).toBeGreaterThanOrEqual(8);
      expect(cell.fontSize).toBeLessThanOrEqual(14);
    }
  });
});

describe('calculateSentiment', () => {
  it('returns positive for more ups', () => {
    expect(calculateSentiment(100, 50, 10)).toBeGreaterThan(0);
  });

  it('returns negative for more downs', () => {
    expect(calculateSentiment(50, 100, 10)).toBeLessThan(0);
  });

  it('returns 0 for balanced', () => {
    expect(calculateSentiment(50, 50, 0)).toBe(0);
  });

  it('returns 0 for no data', () => {
    expect(calculateSentiment(0, 0, 0)).toBe(0);
  });

  it('returns 1 for all up', () => {
    expect(calculateSentiment(100, 0, 0)).toBe(1);
  });

  it('returns -1 for all down', () => {
    expect(calculateSentiment(0, 100, 0)).toBe(-1);
  });
});

describe('groupBySector', () => {
  it('groups items by sector', () => {
    const items = [
      { id: '1', name: 'A', sector: 'Tech', value: 5, weight: 100 },
      { id: '2', name: 'B', sector: 'Tech', value: 3, weight: 80 },
      { id: '3', name: 'C', sector: 'Finance', value: -2, weight: 120 },
    ];
    const groups = groupBySector(items);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.label === 'Tech')!.cells).toHaveLength(2);
    expect(groups.find(g => g.label === 'Finance')!.cells).toHaveLength(1);
  });

  it('generates IDs from sector names', () => {
    const items = [{ id: '1', name: 'A', sector: 'Health Care', value: 1, weight: 50 }];
    const groups = groupBySector(items);
    expect(groups[0].id).toBe('health-care');
  });
});
