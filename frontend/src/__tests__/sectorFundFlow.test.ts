import { describe, it, expect } from 'vitest';
import {
  summarizeFundFlows,
  analyzeFlowTrend,
  detectFlowRotation,
  calculateSectorFlowMomentum,
  findSectorDivergence,
  calculateMainRetailRatio,
  generateSectorFlowReport,
  type SectorFundFlow,
} from '../utils/sectorFundFlow';

describe('SectorFundFlow', () => {
  const mockFlows: SectorFundFlow[] = [
    { sector: '银行', netInflow: 5e8, mainInflow: 3e8, retailInflow: 2e8, volume: 1e10, changePercent: 1.5, turnoverRate: 0.02 },
    { sector: '科技', netInflow: 8e8, mainInflow: 6e8, retailInflow: 2e8, volume: 2e10, changePercent: 2.8, turnoverRate: 0.05 },
    { sector: '地产', netInflow: -3e8, mainInflow: -2e8, retailInflow: -1e8, volume: 8e9, changePercent: -1.2, turnoverRate: 0.03 },
    { sector: '医药', netInflow: -6e8, mainInflow: -4e8, retailInflow: -2e8, volume: 1.2e10, changePercent: -2.5, turnoverRate: 0.04 },
    { sector: '消费', netInflow: 2e8, mainInflow: 1e8, retailInflow: 1e8, volume: 9e9, changePercent: 0.8, turnoverRate: 0.025 },
    { sector: '新能源', netInflow: 1e9, mainInflow: 7e8, retailInflow: 3e8, volume: 3e10, changePercent: 3.5, turnoverRate: 0.06 },
  ];

  describe('summarizeFundFlows', () => {
    it('should calculate total inflow and outflow', () => {
      const summary = summarizeFundFlows(mockFlows);
      expect(summary.totalInflow).toBeGreaterThan(0);
      expect(summary.totalOutflow).toBeGreaterThan(0);
    });

    it('should calculate net flow', () => {
      const summary = summarizeFundFlows(mockFlows);
      const expected = mockFlows.reduce((s, f) => s + f.netInflow, 0);
      expect(summary.netFlow).toBe(expected);
    });

    it('should identify top inflow sectors', () => {
      const summary = summarizeFundFlows(mockFlows);
      expect(summary.topInflowSectors.length).toBeLessThanOrEqual(5);
      expect(summary.topInflowSectors[0].sector).toBe('新能源');
    });

    it('should identify top outflow sectors', () => {
      const summary = summarizeFundFlows(mockFlows);
      expect(summary.topOutflowSectors.length).toBeLessThanOrEqual(5);
    });

    it('should calculate main and retail net inflow', () => {
      const summary = summarizeFundFlows(mockFlows);
      expect(summary.mainNetInflow).toBe(mockFlows.reduce((s, f) => s + f.mainInflow, 0));
      expect(summary.retailNetInflow).toBe(mockFlows.reduce((s, f) => s + f.retailInflow, 0));
    });

    it('should handle empty flows', () => {
      const summary = summarizeFundFlows([]);
      expect(summary.totalInflow).toBe(0);
      expect(summary.netFlow).toBe(0);
    });
  });

  describe('analyzeFlowTrend', () => {
    it('should count consecutive inflow days', () => {
      const history = [
        { date: '2024-01-01', netInflow: -1e8 },
        { date: '2024-01-02', netInflow: 2e8 },
        { date: '2024-01-03', netInflow: 3e8 },
        { date: '2024-01-04', netInflow: 1e8 },
      ];
      const trend = analyzeFlowTrend('科技', history);
      expect(trend.consecutiveInflowDays).toBe(3);
      expect(trend.trend).toBe('inflow');
    });

    it('should count consecutive outflow days', () => {
      const history = [
        { date: '2024-01-01', netInflow: 1e8 },
        { date: '2024-01-02', netInflow: -2e8 },
        { date: '2024-01-03', netInflow: -3e8 },
        { date: '2024-01-04', netInflow: -1e8 },
      ];
      const trend = analyzeFlowTrend('地产', history);
      expect(trend.consecutiveOutflowDays).toBe(3);
      expect(trend.trend).toBe('outflow');
    });

    it('should calculate average daily flow', () => {
      const history = [
        { date: '2024-01-01', netInflow: 1e8 },
        { date: '2024-01-02', netInflow: 2e8 },
      ];
      const trend = analyzeFlowTrend('银行', history);
      expect(trend.avgDailyFlow).toBeCloseTo(1.5e8, 0);
    });

    it('should calculate flow acceleration', () => {
      const history = [
        { date: '2024-01-01', netInflow: 1e8 },
        { date: '2024-01-02', netInflow: 2e8 },
        { date: '2024-01-03', netInflow: 4e8 },
      ];
      const trend = analyzeFlowTrend('科技', history);
      expect(trend.flowAcceleration).toBeGreaterThan(0);
    });

    it('should return neutral for short history', () => {
      const history = [{ date: '2024-01-01', netInflow: 1e8 }];
      const trend = analyzeFlowTrend('消费', history);
      expect(trend.trend).toBe('neutral');
    });

    it('should handle empty history', () => {
      const trend = analyzeFlowTrend('科技', []);
      expect(trend.trend).toBe('neutral');
      expect(trend.avgDailyFlow).toBe(0);
    });
  });

  describe('detectFlowRotation', () => {
    it('should detect rotation signals', () => {
      const prev: SectorFundFlow[] = [
        { sector: '银行', netInflow: 5e8, mainInflow: 3e8, retailInflow: 2e8, volume: 1e10, changePercent: 1, turnoverRate: 0.02 },
        { sector: '科技', netInflow: -3e8, mainInflow: -2e8, retailInflow: -1e8, volume: 2e10, changePercent: -1, turnoverRate: 0.05 },
      ];
      const curr: SectorFundFlow[] = [
        { sector: '银行', netInflow: -2e8, mainInflow: -1e8, retailInflow: -1e8, volume: 1e10, changePercent: -0.5, turnoverRate: 0.02 },
        { sector: '科技', netInflow: 6e8, mainInflow: 4e8, retailInflow: 2e8, volume: 2e10, changePercent: 2, turnoverRate: 0.05 },
      ];
      const signals = detectFlowRotation(curr, prev);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].fromSector).toBeDefined();
      expect(signals[0].toSector).toBeDefined();
    });

    it('should sort by strength', () => {
      const signals = detectFlowRotation(mockFlows, mockFlows.map(f => ({ ...f, netInflow: f.netInflow * 0.5 })));
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i - 1].strength).toBeGreaterThanOrEqual(signals[i].strength);
      }
    });

    it('should include confidence score', () => {
      const signals = detectFlowRotation(mockFlows, mockFlows.map(f => ({ ...f, netInflow: 0 })));
      for (const signal of signals) {
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include description', () => {
      const signals = detectFlowRotation(mockFlows, mockFlows.map(f => ({ ...f, netInflow: 0 })));
      for (const signal of signals) {
        expect(signal.description).toContain('资金');
      }
    });
  });

  describe('calculateSectorFlowMomentum', () => {
    it('should calculate momentum scores', () => {
      const momentum = calculateSectorFlowMomentum(mockFlows);
      expect(momentum.length).toBe(mockFlows.length);
    });

    it('should assign ranks', () => {
      const momentum = calculateSectorFlowMomentum(mockFlows);
      const ranks = momentum.map(m => m.rank).sort((a, b) => a - b);
      expect(ranks[0]).toBe(1);
    });

    it('should sort by momentum descending', () => {
      const momentum = calculateSectorFlowMomentum(mockFlows);
      for (let i = 1; i < momentum.length; i++) {
        expect(momentum[i - 1].momentum).toBeGreaterThanOrEqual(momentum[i].momentum);
      }
    });
  });

  describe('findSectorDivergence', () => {
    it('should detect price up flow down divergence', () => {
      const flows: SectorFundFlow[] = [
        { sector: '银行', netInflow: -5e8, mainInflow: -3e8, retailInflow: -2e8, volume: 1e10, changePercent: 3, turnoverRate: 0.02 },
      ];
      const divergences = findSectorDivergence(flows);
      expect(divergences.length).toBe(1);
      expect(divergences[0].type).toBe('price_up_flow_down');
    });

    it('should detect price down flow up divergence', () => {
      const flows: SectorFundFlow[] = [
        { sector: '地产', netInflow: 5e8, mainInflow: 3e8, retailInflow: 2e8, volume: 1e10, changePercent: -3, turnoverRate: 0.02 },
      ];
      const divergences = findSectorDivergence(flows);
      expect(divergences.length).toBe(1);
      expect(divergences[0].type).toBe('price_down_flow_up');
    });

    it('should return empty when no divergence', () => {
      const flows: SectorFundFlow[] = [
        { sector: '消费', netInflow: 2e8, mainInflow: 1e8, retailInflow: 1e8, volume: 9e9, changePercent: 1, turnoverRate: 0.025 },
      ];
      expect(findSectorDivergence(flows).length).toBe(0);
    });

    it('should sort by magnitude', () => {
      const divergences = findSectorDivergence(mockFlows);
      for (let i = 1; i < divergences.length; i++) {
        expect(divergences[i - 1].magnitude).toBeGreaterThanOrEqual(divergences[i].magnitude);
      }
    });
  });

  describe('calculateMainRetailRatio', () => {
    it('should calculate ratios', () => {
      const ratios = calculateMainRetailRatio(mockFlows);
      expect(ratios.length).toBe(mockFlows.length);
      for (const r of ratios) {
        expect(r.mainRatio + r.retailRatio).toBeCloseTo(1, 5);
      }
    });

    it('should classify dominant type', () => {
      const ratios = calculateMainRetailRatio(mockFlows);
      for (const r of ratios) {
        expect(['main_dominant', 'retail_dominant', 'balanced']).toContain(r.signal);
      }
    });

    it('should handle equal main and retail', () => {
      const flows: SectorFundFlow[] = [
        { sector: '测试', netInflow: 0, mainInflow: 1e8, retailInflow: 1e8, volume: 1e9, changePercent: 0, turnoverRate: 0.02 },
      ];
      const ratios = calculateMainRetailRatio(flows);
      expect(ratios[0].signal).toBe('balanced');
    });
  });

  describe('generateSectorFlowReport', () => {
    it('should generate complete report', () => {
      const report = generateSectorFlowReport(mockFlows);
      expect(report.summary).toBeDefined();
      expect(report.hotSectors).toBeDefined();
      expect(report.coldSectors).toBeDefined();
      expect(report.mainDrivenSectors).toBeDefined();
      expect(report.balanceScore).toBeGreaterThanOrEqual(0);
      expect(report.balanceScore).toBeLessThanOrEqual(100);
    });

    it('should identify hot sectors as those with positive flow and price', () => {
      const report = generateSectorFlowReport(mockFlows);
      for (const sector of report.hotSectors) {
        const flow = mockFlows.find(f => f.sector === sector)!;
        expect(flow.netInflow).toBeGreaterThan(0);
        expect(flow.changePercent).toBeGreaterThan(0);
      }
    });

    it('should identify cold sectors as those with negative flow and price', () => {
      const report = generateSectorFlowReport(mockFlows);
      for (const sector of report.coldSectors) {
        const flow = mockFlows.find(f => f.sector === sector)!;
        expect(flow.netInflow).toBeLessThan(0);
        expect(flow.changePercent).toBeLessThan(0);
      }
    });

    it('should handle empty flows', () => {
      const report = generateSectorFlowReport([]);
      expect(report.hotSectors.length).toBe(0);
      expect(report.coldSectors.length).toBe(0);
    });
  });
});
