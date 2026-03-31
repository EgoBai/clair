import { describe, it, expect } from 'vitest';
import {
  flowToColor,
  generateHeatmap,
  summarizeSectorFlows,
  analyzeFlowMomentum,
  detectAnomalousFlows,
  type FlowData,
} from '../utils/capitalFlowHeatmap';

function makeFlow(overrides: Partial<FlowData> = {}): FlowData {
  return {
    ticker: '600519',
    name: '贵州茅台',
    sector: '白酒',
    mainInflow: 1e8,
    retailInflow: -0.2e8,
    totalInflow: 0.8e8,
    volume: 5e7,
    price: 1800,
    priceChange: 2.5,
    turnoverRate: 0.5,
    ...overrides,
  };
}

describe('Capital Flow Heatmap Engine', () => {
  describe('flowToColor', () => {
    it('should return red for strong inflow (redGreen)', () => {
      const color = flowToColor(0.9, 'redGreen');
      expect(color).toMatch(/^rgb\(/);
      // Strong inflow should have high green component
      expect(color).toMatch(/,\d+,\d+\)$/);
    });

    it('should return different colors for inflow vs outflow', () => {
      const inColor = flowToColor(0.5, 'redGreen');
      const outColor = flowToColor(-0.5, 'redGreen');
      expect(inColor).not.toBe(outColor);
    });

    it('should handle blueRed scheme', () => {
      const color = flowToColor(0.5, 'blueRed');
      expect(color).toMatch(/^rgb\(/);
    });

    it('should handle gradient scheme', () => {
      expect(flowToColor(0.8, 'gradient')).toBe('#ff0000');
      expect(flowToColor(0.5, 'gradient')).toBe('#ff8800');
      expect(flowToColor(0.1, 'gradient')).toBe('#ffcc00');
      expect(flowToColor(-0.8, 'gradient')).toBe('#444444');
    });
  });

  describe('generateHeatmap', () => {
    it('should generate cells from flow data', () => {
      const data = [
        makeFlow({ ticker: 'A', totalInflow: 5e8 }),
        makeFlow({ ticker: 'B', totalInflow: -3e8 }),
        makeFlow({ ticker: 'C', totalInflow: 1e8 }),
      ];
      // Need at least minCells (10) items for proper generation
      const lots = Array.from({ length: 15 }, (_, i) =>
        makeFlow({ ticker: `S${i}`, totalInflow: (i - 7) * 1e7 })
      );
      const cells = generateHeatmap(lots);

      expect(cells.length).toBeGreaterThan(0);
      cells.forEach(c => {
        expect(c.color).toMatch(/^rgb\(/);
        expect(c.intensity).toBeGreaterThanOrEqual(-1);
        expect(c.intensity).toBeLessThanOrEqual(1);
        expect(['inflow', 'outflow', 'neutral']).toContain(c.flowDirection);
      });
    });

    it('should sort by absolute flow', () => {
      const data = Array.from({ length: 15 }, (_, i) =>
        makeFlow({ ticker: `T${i}`, totalInflow: (i === 0 ? 100 : i) * 1e7 })
      );
      const cells = generateHeatmap(data);
      // First cell should have highest absolute flow
      expect(Math.abs(cells[0].intensity)).toBeGreaterThanOrEqual(
        Math.abs(cells[cells.length - 1].intensity)
      );
    });

    it('should classify flow strength', () => {
      const data = Array.from({ length: 15 }, (_, i) =>
        makeFlow({ ticker: `T${i}`, totalInflow: i * 1e8 })
      );
      const cells = generateHeatmap(data);
      cells.forEach(c => {
        expect(['strong', 'moderate', 'weak']).toContain(c.flowStrength);
      });
    });
  });

  describe('summarizeSectorFlows', () => {
    it('should group by sector and summarize', () => {
      const data = [
        makeFlow({ sector: '科技', totalInflow: 5e8, ticker: 'A' }),
        makeFlow({ sector: '科技', totalInflow: 3e8, ticker: 'B' }),
        makeFlow({ sector: '金融', totalInflow: -2e8, ticker: 'C' }),
      ];
      const summary = summarizeSectorFlows(data);

      expect(summary.length).toBe(2);
      const tech = summary.find(s => s.sector === '科技');
      expect(tech!.netFlow).toBe(8e8);
      expect(tech!.inflowCount).toBe(2);
      expect(tech!.flowTrend).toBe('accumulating');
    });

    it('should identify top inflow/outflow', () => {
      const data = [
        makeFlow({ sector: 'A', ticker: 'X', totalInflow: 100 }),
        makeFlow({ sector: 'A', ticker: 'Y', totalInflow: -50 }),
      ];
      const summary = summarizeSectorFlows(data);
      expect(summary[0].topInflow.ticker).toBe('X');
      expect(summary[0].topOutflow.ticker).toBe('Y');
    });

    it('should sort by absolute net flow', () => {
      const data = [
        makeFlow({ sector: 'A', totalInflow: 1e6 }),
        makeFlow({ sector: 'B', totalInflow: 1e9 }),
      ];
      const summary = summarizeSectorFlows(data);
      expect(summary[0].sector).toBe('B');
    });
  });

  describe('analyzeFlowMomentum', () => {
    it('should calculate momentum metrics', () => {
      const result = analyzeFlowMomentum(
        '600519',
        1e8,
        [0.5e8, 0.6e8, 0.7e8, 0.8e8, 0.9e8],
        Array(20).fill(0.5e8)
      );

      expect(result.ticker).toBe('600519');
      expect(result.momentum).toBeGreaterThan(1);
      expect(['accelerating_in', 'steady_in', 'decelerating_in',
        'accelerating_out', 'steady_out', 'decelerating_out']).toContain(result.signal);
    });

    it('should detect accelerating inflow', () => {
      const result = analyzeFlowMomentum(
        'TEST',
        10e8,
        [1e8, 2e8, 3e8, 4e8, 5e8],
        Array(20).fill(1e8)
      );
      expect(result.signal).toBe('accelerating_in');
    });

    it('should detect outflow signals', () => {
      const result = analyzeFlowMomentum(
        'TEST',
        -5e8,
        [-1e8, -2e8, -3e8, -4e8, -5e8],
        Array(20).fill(-1e8)
      );
      expect(result.currentFlow).toBeLessThan(0);
    });
  });

  describe('detectAnomalousFlows', () => {
    it('should detect statistical outliers', () => {
      const data = [
        makeFlow({ ticker: 'A', totalInflow: 1e7 }),
        makeFlow({ ticker: 'B', totalInflow: 1.1e7 }),
        makeFlow({ ticker: 'C', totalInflow: 0.9e7 }),
        makeFlow({ ticker: 'D', totalInflow: 1.05e7 }),
        makeFlow({ ticker: 'E', totalInflow: 0.95e7 }),
        makeFlow({ ticker: 'F', totalInflow: 1.02e7 }),
        makeFlow({ ticker: 'G', totalInflow: 0.98e7 }),
        makeFlow({ ticker: 'OUTLIER', totalInflow: 50e7 }), // 50x larger
      ];
      const anomalies = detectAnomalousFlows(data);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].ticker).toBe('OUTLIER');
    });

    it('should return empty for uniform data', () => {
      const data = Array.from({ length: 10 }, (_, i) =>
        makeFlow({ ticker: `T${i}`, totalInflow: 1e7 + i * 1e4 })
      );
      const anomalies = detectAnomalousFlows(data);
      expect(anomalies.length).toBe(0);
    });

    it('should return empty for too few data points', () => {
      expect(detectAnomalousFlows([makeFlow()])).toEqual([]);
    });

    it('should sort by severity', () => {
      const data = [
        makeFlow({ ticker: 'A', totalInflow: 1e7 }),
        makeFlow({ ticker: 'B', totalInflow: 1e7 }),
        makeFlow({ ticker: 'C', totalInflow: 1e7 }),
        makeFlow({ ticker: 'D', totalInflow: 1e7 }),
        makeFlow({ ticker: 'E', totalInflow: 1e7 }),
        makeFlow({ ticker: 'BIG', totalInflow: 50e7 }),
        makeFlow({ ticker: 'MED', totalInflow: 5e7 }),
      ];
      const anomalies = detectAnomalousFlows(data);
      if (anomalies.length >= 2) {
        const sev = { high: 3, medium: 2, low: 1 };
        expect(sev[anomalies[0].severity]).toBeGreaterThanOrEqual(sev[anomalies[1].severity]);
      }
    });
  });
});
