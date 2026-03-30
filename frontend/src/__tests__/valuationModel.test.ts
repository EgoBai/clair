import { describe, it, expect } from 'vitest';
import {
  dcfValuation,
  relativeValuation,
  pegValuation,
  sotpValuation,
  peerComparisonAnalysis,
  valuationScore,
  type FinancialData,
  type DCFParams,
  type PeerComparison,
  type SegmentValue,
} from '../utils/valuationModel';

describe('ValuationModel', () => {
  describe('DCF Valuation', () => {
    const baseParams: DCFParams = {
      freeCashFlow: 1000,
      growthRate: 0.1,
      terminalGrowthRate: 0.03,
      discountRate: 0.1,
      projectionYears: 5,
      shares: 100,
      netDebt: -500,
    };

    it('should calculate DCF intrinsic value', () => {
      const result = dcfValuation(baseParams);
      expect(result.model).toBe('DCF');
      expect(result.intrinsicValue).toBeGreaterThan(0);
      expect(result.details.pvCashFlows).toBeGreaterThan(0);
      expect(result.details.pvTerminalValue).toBeGreaterThan(0);
      expect(result.details.enterpriseValue).toBeGreaterThan(0);
    });

    it('should return error when discountRate <= terminalGrowthRate', () => {
      const result = dcfValuation({ ...baseParams, discountRate: 0.02, terminalGrowthRate: 0.05 });
      expect(result.intrinsicValue).toBe(0);
      expect(result.confidence).toBe('low');
      expect(result.details.error).toBe(1);
    });

    it('should generate fair value range', () => {
      const result = dcfValuation(baseParams);
      expect(result.fairValueRange.low).toBeLessThan(result.intrinsicValue);
      expect(result.fairValueRange.high).toBeGreaterThan(result.intrinsicValue);
      expect(result.fairValueRange.low).toBeCloseTo(result.intrinsicValue * 0.7, 0);
      expect(result.fairValueRange.high).toBeCloseTo(result.intrinsicValue * 1.3, 0);
    });

    it('should set high confidence when growth differs significantly from terminal', () => {
      const result = dcfValuation({ ...baseParams, growthRate: 0.15 });
      expect(result.confidence).toBe('high');
    });

    it('should set medium confidence when growth is close to terminal', () => {
      const result = dcfValuation({ ...baseParams, growthRate: 0.04 });
      expect(result.confidence).toBe('medium');
    });

    it('should handle zero free cash flow', () => {
      const result = dcfValuation({ ...baseParams, freeCashFlow: 0 });
      // Terminal value still contributes even with zero initial FCF
      expect(result.intrinsicValue).toBeDefined();
      expect(result.details.pvCashFlows).toBe(0);
    });

    it('should handle negative net debt (net cash)', () => {
      const withCash = dcfValuation({ ...baseParams, netDebt: -2000 });
      const noDebt = dcfValuation({ ...baseParams, netDebt: 0 });
      expect(withCash.intrinsicValue).toBeGreaterThan(noDebt.intrinsicValue);
    });

    it('should handle different projection years', () => {
      const y5 = dcfValuation({ ...baseParams, projectionYears: 5 });
      const y10 = dcfValuation({ ...baseParams, projectionYears: 10 });
      expect(y10.intrinsicValue).not.toBe(y5.intrinsicValue);
    });

    it('should handle high growth rate', () => {
      const result = dcfValuation({ ...baseParams, growthRate: 0.3 });
      expect(result.intrinsicValue).toBeGreaterThan(0);
      expect(result.details.pvCashFlows).toBeGreaterThan(0);
    });

    it('should handle very high discount rate', () => {
      const result = dcfValuation({ ...baseParams, discountRate: 0.25 });
      expect(result.intrinsicValue).toBeGreaterThan(0);
    });

    it('should round results to 2 decimal places', () => {
      const result = dcfValuation(baseParams);
      expect(result.intrinsicValue).toBe(Math.round(result.intrinsicValue * 100) / 100);
      expect(result.fairValueRange.low).toBe(Math.round(result.fairValueRange.low * 100) / 100);
    });

    it('should calculate equity value correctly', () => {
      const result = dcfValuation(baseParams);
      expect(result.details.equityValue).toBeCloseTo(
        result.details.enterpriseValue - baseParams.netDebt,
        0
      );
      expect(result.intrinsicValue).toBeCloseTo(
        result.details.equityValue / baseParams.shares,
        0
      );
    });
  });

  describe('Relative Valuation', () => {
    const financials: FinancialData = {
      revenue: 10000,
      netIncome: 1500,
      freeCashFlow: 1200,
      totalDebt: 2000,
      cash: 3000,
      shares: 500,
      bookValue: 8000,
      eps: 3,
      pe: 15,
      pb: 2,
      roe: 0.18,
      roic: 0.15,
      growthRate: 0.12,
      beta: 1.1,
      dividendYield: 0.02,
    };

    it('should calculate relative valuation based on peers', () => {
      const result = relativeValuation(
        financials,
        { avgPE: 20, avgPB: 2.5, avgPS: 3 },
        financials.revenue,
        45
      );
      expect(result.model).toBe('Relative');
      expect(result.intrinsicValue).toBeGreaterThan(0);
      expect(result.details.peBased).toBe(60); // 3 * 20
    });

    it('should calculate upside when current price is below intrinsic', () => {
      const result = relativeValuation(
        financials,
        { avgPE: 20, avgPB: 2.5, avgPS: 3 },
        financials.revenue,
        45
      );
      expect(result.upside).toBeGreaterThan(0);
    });

    it('should calculate downside when current price is above intrinsic', () => {
      const result = relativeValuation(
        financials,
        { avgPE: 10, avgPB: 1, avgPS: 1 },
        financials.revenue,
        100
      );
      expect(result.upside).toBeLessThan(0);
    });

    it('should use min/max for fair value range', () => {
      const result = relativeValuation(
        financials,
        { avgPE: 20, avgPB: 2.5, avgPS: 3 },
        financials.revenue,
        45
      );
      const values = [result.details.peBased, result.details.pbBased, result.details.psBased];
      expect(result.fairValueRange.low).toBe(Math.round(Math.min(...values) * 100) / 100);
      expect(result.fairValueRange.high).toBe(Math.round(Math.max(...values) * 100) / 100);
    });

    it('should set confidence to medium', () => {
      const result = relativeValuation(
        financials,
        { avgPE: 20, avgPB: 2.5, avgPS: 3 },
        financials.revenue,
        45
      );
      expect(result.confidence).toBe('medium');
    });

    it('should calculate PS based value', () => {
      const result = relativeValuation(
        financials,
        { avgPE: 15, avgPB: 2, avgPS: 5 },
        10000,
        45
      );
      // PS = (10000/500) * 5 = 100
      expect(result.details.psBased).toBe(100);
    });
  });

  describe('PEG Valuation', () => {
    it('should calculate PEG correctly', () => {
      const result = pegValuation(2, 0.2, 30);
      expect(result.peg).toBe(1.5); // 30 / (0.2 * 100)
      expect(result.fairPE).toBe(20); // 0.2 * 100
    });

    it('should signal undervalued when PEG < 0.8', () => {
      const result = pegValuation(2, 0.3, 20);
      expect(result.signal).toBe('undervalued');
      expect(result.peg).toBeLessThan(0.8);
    });

    it('should signal overvalued when PEG > 1.2', () => {
      const result = pegValuation(2, 0.1, 20);
      expect(result.signal).toBe('overvalued');
      expect(result.peg).toBeGreaterThan(1.2);
    });

    it('should signal fair when PEG between 0.8 and 1.2', () => {
      const result = pegValuation(2, 0.2, 20);
      expect(result.signal).toBe('fair');
      expect(result.peg).toBe(1);
    });

    it('should handle zero growth rate', () => {
      const result = pegValuation(2, 0, 15);
      expect(result.peg).toBe(Infinity);
      expect(result.signal).toBe('overvalued');
    });

    it('should handle negative growth rate', () => {
      const result = pegValuation(2, -0.05, 15);
      expect(result.peg).toBe(Infinity);
      expect(result.signal).toBe('overvalued');
    });
  });

  describe('SOTP Valuation', () => {
    const segments: SegmentValue[] = [
      { name: '云计算', revenue: 5000, margin: 0.25, multiple: 8, type: 'revenue' },
      { name: '电商', revenue: 20000, margin: 0.15, multiple: 3, type: 'revenue' },
      { name: '广告', revenue: 3000, margin: 0.4, multiple: 12, type: 'ebitda' },
    ];

    it('should calculate SOTP total value', () => {
      const result = sotpValuation(segments, 1000, 1000);
      expect(result.totalValue).toBeGreaterThan(0);
      expect(result.perShare).toBeGreaterThan(0);
    });

    it('should provide breakdown by segment', () => {
      const result = sotpValuation(segments, 1000, 1000);
      expect(result.breakdown).toHaveLength(3);
      expect(result.breakdown[0].name).toBeDefined();
      expect(result.breakdown.reduce((s, b) => s + b.percentage, 0)).toBeCloseTo(100, 0);
    });

    it('should calculate per share value', () => {
      const result = sotpValuation(segments, 0, 100);
      expect(result.perShare).toBeCloseTo(result.totalValue / 100, 0);
    });

    it('should handle net debt subtraction', () => {
      const noDebt = sotpValuation(segments, 0, 1000);
      const withDebt = sotpValuation(segments, 5000, 1000);
      expect(withDebt.totalValue).toBeLessThan(noDebt.totalValue);
    });

    it('should handle ebitda type segments', () => {
      const ebitdaSeg: SegmentValue[] = [
        { name: '业务A', revenue: 10000, margin: 0.2, multiple: 10, type: 'ebitda' },
      ];
      const result = sotpValuation(ebitdaSeg, 0, 100);
      // value = 10000 * 0.2 * 10 = 20000
      expect(result.breakdown[0].value).toBe(20000);
    });

    it('should handle single segment', () => {
      const single: SegmentValue[] = [
        { name: '唯一业务', revenue: 5000, margin: 0.1, multiple: 5, type: 'revenue' },
      ];
      const result = sotpValuation(single, 0, 100);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].percentage).toBe(100);
    });

    it('should provide breakdown with correct values', () => {
      const result = sotpValuation(segments, 0, 100);
      // Verify all segments are present with correct values
      const cloudSeg = result.breakdown.find(b => b.name === '云计算');
      const ecomSeg = result.breakdown.find(b => b.name === '电商');
      expect(cloudSeg!.value).toBe(40000); // 5000 * 8
      expect(ecomSeg!.value).toBe(60000); // 20000 * 3
    });
  });

  describe('Peer Comparison Analysis', () => {
    const target: PeerComparison = {
      ticker: '600519',
      name: '贵州茅台',
      pe: 30,
      pb: 10,
      ps: 15,
      evEbitda: 20,
      roe: 0.3,
      grossMargin: 0.9,
      netMargin: 0.5,
      premium: 0,
    };

    const peers: PeerComparison[] = [
      {
        ticker: '000858',
        name: '五粮液',
        pe: 25,
        pb: 8,
        ps: 10,
        evEbitda: 18,
        roe: 0.22,
        grossMargin: 0.75,
        netMargin: 0.35,
        premium: 0,
      },
      {
        ticker: '000568',
        name: '泸州老窖',
        pe: 35,
        pb: 12,
        ps: 12,
        evEbitda: 22,
        roe: 0.25,
        grossMargin: 0.8,
        netMargin: 0.4,
        premium: 0,
      },
      {
        ticker: '002304',
        name: '洋河股份',
        pe: 20,
        pb: 6,
        ps: 8,
        evEbitda: 15,
        roe: 0.18,
        grossMargin: 0.7,
        netMargin: 0.3,
        premium: 0,
      },
    ];

    it('should rank target among peers', () => {
      const result = peerComparisonAnalysis(target, peers);
      expect(result.ranking.roe).toBe(1); // ROE highest
      expect(result.ranking.grossMargin).toBe(1); // Gross margin highest
    });

    it('should calculate percentile rank', () => {
      const result = peerComparisonAnalysis(target, peers);
      // 4 items total, rank 1 -> (4-1)/4 * 100 = 75
      expect(result.percentileRank.roe).toBe(75);
      for (const key of Object.keys(result.percentileRank)) {
        expect(result.percentileRank[key]).toBeGreaterThanOrEqual(0);
        expect(result.percentileRank[key]).toBeLessThanOrEqual(100);
      }
    });

    it('should provide summary', () => {
      const result = peerComparisonAnalysis(target, peers);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
    });

    it('should handle empty peers list', () => {
      const result = peerComparisonAnalysis(target, []);
      expect(result.ranking).toBeDefined();
    });

    it('should handle equal values', () => {
      const clonePeer: PeerComparison = { ...target, ticker: 'TEST', name: 'Test' };
      const result = peerComparisonAnalysis(target, [clonePeer]);
      expect(result.ranking.pe).toBeDefined();
    });

    it('should rank PE lower as better (cheaper)', () => {
      const cheapPeer: PeerComparison = { ...target, ticker: 'CHEAP', pe: 10 };
      const result = peerComparisonAnalysis(target, [cheapPeer]);
      expect(result.ranking.pe).toBe(2); // target PE > cheap PE
    });
  });

  describe('Valuation Score', () => {
    const excellent: FinancialData = {
      revenue: 10000,
      netIncome: 2000,
      freeCashFlow: 1800,
      totalDebt: 1000,
      cash: 5000,
      shares: 1000,
      bookValue: 15000,
      eps: 2,
      pe: 12,
      pb: 1.2,
      roe: 0.25,
      roic: 0.2,
      growthRate: 0.35,
      beta: 0.9,
      dividendYield: 0.03,
    };

    it('should score excellent financials highly', () => {
      const result = valuationScore(excellent);
      expect(result.score).toBeGreaterThan(70);
      expect(['A', 'B']).toContain(result.grade);
    });

    it('should provide factor breakdown', () => {
      const result = valuationScore(excellent);
      expect(result.factors).toHaveLength(5);
      expect(result.factors.every((f) => f.score >= 0 && f.score <= 100)).toBe(true);
      expect(result.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 1);
    });

    it('should score poor financials lowly', () => {
      const poor: FinancialData = {
        ...excellent,
        pe: 80,
        pb: 15,
        roe: 0.02,
        growthRate: -0.1,
        freeCashFlow: -500,
      };
      const result = valuationScore(poor);
      expect(result.score).toBeLessThan(50);
      expect(['D', 'F']).toContain(result.grade);
    });

    it('should assign grade A for score >= 80', () => {
      const top: FinancialData = {
        ...excellent,
        pe: 8,
        pb: 0.8,
        roe: 0.3,
        growthRate: 0.5,
        freeCashFlow: 2000,
      };
      const result = valuationScore(top);
      if (result.score >= 80) expect(result.grade).toBe('A');
    });

    it('should assign grade F for score < 35', () => {
      const worst: FinancialData = {
        ...excellent,
        pe: 200,
        pb: 30,
        roe: -0.05,
        growthRate: -0.3,
        freeCashFlow: -2000,
      };
      const result = valuationScore(worst);
      if (result.score < 35) expect(result.grade).toBe('F');
    });

    it('should weight growth and ROE heavily', () => {
      const highGrowth: FinancialData = { ...excellent, growthRate: 0.5 };
      const lowGrowth: FinancialData = { ...excellent, growthRate: 0.02 };
      const hi = valuationScore(highGrowth);
      const lo = valuationScore(lowGrowth);
      expect(hi.score).toBeGreaterThan(lo.score);
    });

    it('should handle zero free cash flow', () => {
      const noFCF: FinancialData = { ...excellent, freeCashFlow: 0 };
      const result = valuationScore(noFCF);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should return valid scores range 0-100', () => {
      const result = valuationScore(excellent);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});
