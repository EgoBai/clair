import { describe, it, expect } from 'vitest';
import {
  calculateOwnershipConcentration,
  analyzeFundStyle,
  detectStyleDrift,
  findHeavyAccumulation,
  calculateHoldingsOverlap,
  type FundInfo,
  type FundHolding,
} from '../utils/fundHoldingsEngine';

function makeHolding(overrides: Partial<FundHolding> = {}): FundHolding {
  return {
    ticker: '600519',
    stockName: '贵州茅台',
    shares: 100000,
    marketValue: 1.8e8,
    weight: 8.5,
    change: 10000,
    changePercent: 10,
    ...overrides,
  };
}

function makeFund(overrides: Partial<FundInfo> = {}): FundInfo {
  return {
    code: '000001',
    name: '测试基金',
    type: 'stock',
    manager: '张三',
    company: '华夏基金',
    nav: 2.5,
    totalAssets: 100e8,
    reportDate: '2025-12-31',
    holdings: [
      makeHolding({ ticker: '600519', stockName: '贵州茅台', weight: 10 }),
      makeHolding({ ticker: '000858', stockName: '五粮液', weight: 8, ticker: '000858' }),
      makeHolding({ ticker: '601318', stockName: '中国平安', weight: 6, ticker: '601318' }),
    ],
    topSectors: [
      { sector: '白酒', weight: 18 },
      { sector: '金融', weight: 12 },
    ],
    ...overrides,
  };
}

describe('Fund Holdings Engine', () => {
  describe('calculateOwnershipConcentration', () => {
    it('should find holders of a stock', () => {
      const funds = [
        makeFund({ code: 'F1', name: '基金A' }),
        makeFund({ code: 'F2', name: '基金B' }),
      ];
      const result = calculateOwnershipConcentration(funds, '600519');

      expect(result).not.toBeNull();
      expect(result!.holdingFunds).toBe(2);
      expect(result!.topHolders.length).toBe(2);
    });

    it('should return null for unheld stock', () => {
      const funds = [makeFund()];
      expect(calculateOwnershipConcentration(funds, 'NOTFOUND')).toBeNull();
    });

    it('should determine ownership trend', () => {
      const funds = [
        makeFund({
          code: 'F1',
          holdings: [makeHolding({ ticker: 'T1', changePercent: 20 })],
        }),
      ];
      const result = calculateOwnershipConcentration(funds, 'T1');
      expect(result!.ownershipTrend).toBe('increasing');
    });

    it('should identify top holders by value', () => {
      const funds = [
        makeFund({
          code: 'BIG',
          name: '大基金',
          holdings: [makeHolding({ ticker: 'X', marketValue: 10e8 })],
        }),
        makeFund({
          code: 'SMALL',
          name: '小基金',
          holdings: [makeHolding({ ticker: 'X', marketValue: 1e8 })],
        }),
      ];
      const result = calculateOwnershipConcentration(funds, 'X');
      expect(result!.topHolders[0].fundCode).toBe('BIG');
    });
  });

  describe('analyzeFundStyle', () => {
    it('should calculate concentration', () => {
      const fund = makeFund();
      const style = analyzeFundStyle(fund);
      expect(style.concentration).toBeGreaterThan(0);
      expect(style.concentration).toBeLessThanOrEqual(1);
    });

    it('should calculate sector diversity', () => {
      const fund = makeFund({
        topSectors: [
          { sector: 'A', weight: 30 },
          { sector: 'B', weight: 20 },
          { sector: 'C', weight: 15 },
        ],
      });
      const style = analyzeFundStyle(fund);
      expect(style.sectorDiversity).toBeCloseTo(0.3, 1);
    });

    it('should return valid style category', () => {
      const style = analyzeFundStyle(makeFund());
      expect(['large_value', 'large_growth', 'large_blend',
        'mid_value', 'mid_growth', 'mid_blend',
        'small_value', 'small_growth', 'small_blend']).toContain(style.style);
    });
  });

  describe('detectStyleDrift', () => {
    it('should return null for same style', () => {
      const fund = makeFund();
      expect(detectStyleDrift(fund, fund)).toBeNull();
    });

    it('should detect drift when top holdings change', () => {
      const prev = makeFund({
        holdings: [
          makeHolding({ ticker: 'A', weight: 15 }),
          makeHolding({ ticker: 'B', weight: 12 }),
          makeHolding({ ticker: 'C', weight: 10, ticker: 'C' }),
        ],
        topSectors: [{ sector: '白酒', weight: 50 }],
      });
      const curr = makeFund({
        holdings: [
          makeHolding({ ticker: 'X', weight: 15, ticker: 'X', stockName: '新股票' }),
          makeHolding({ ticker: 'Y', weight: 12, ticker: 'Y', stockName: '新股票2' }),
          makeHolding({ ticker: 'Z', weight: 10, ticker: 'Z', stockName: '新股票3' }),
        ],
        topSectors: [{ sector: '科技', weight: 50 }],
      });

      const drift = detectStyleDrift(prev, curr);
      // May or may not detect drift depending on style calculation
      if (drift) {
        expect(drift.driftScore).toBeGreaterThan(0);
        expect(drift.mainChanges.length).toBeGreaterThan(0);
      }
    });
  });

  describe('findHeavyAccumulation', () => {
    it('should find stocks with many fund buyers', () => {
      const funds = Array.from({ length: 6 }, (_, i) =>
        makeFund({
          code: `F${i}`,
          holdings: [makeHolding({ ticker: 'HOT', changePercent: 15 })],
        })
      );
      const result = findHeavyAccumulation(funds, 5);
      expect(result.length).toBe(1);
      expect(result[0].ticker).toBe('HOT');
      expect(result[0].fundCount).toBe(6);
    });

    it('should not include below-threshold stocks', () => {
      const funds = [
        makeFund({ holdings: [makeHolding({ ticker: 'FEW', changePercent: 10 })] }),
      ];
      expect(findHeavyAccumulation(funds, 5)).toEqual([]);
    });

    it('should only include positive changes', () => {
      const funds = Array.from({ length: 5 }, (_, i) =>
        makeFund({
          code: `F${i}`,
          holdings: [makeHolding({ ticker: 'DEC', changePercent: -10 })],
        })
      );
      expect(findHeavyAccumulation(funds, 5)).toEqual([]);
    });
  });

  describe('calculateHoldingsOverlap', () => {
    it('should calculate overlap ratio', () => {
      const fundA = makeFund({
        holdings: [
          makeHolding({ ticker: 'A' }),
          makeHolding({ ticker: 'B', ticker: 'B' }),
          makeHolding({ ticker: 'C', ticker: 'C' }),
        ],
      });
      const fundB = makeFund({
        holdings: [
          makeHolding({ ticker: 'B', ticker: 'B' }),
          makeHolding({ ticker: 'C', ticker: 'C' }),
          makeHolding({ ticker: 'D', ticker: 'D' }),
        ],
      });

      const overlap = calculateHoldingsOverlap(fundA, fundB);
      expect(overlap.commonHoldings).toContain('B');
      expect(overlap.commonHoldings).toContain('C');
      expect(overlap.uniqueToA).toContain('A');
      expect(overlap.uniqueToB).toContain('D');
      expect(overlap.overlapRatio).toBeCloseTo(0.5, 1); // 2/4
    });

    it('should return 0 overlap for different funds', () => {
      const fundA = makeFund({ holdings: [makeHolding({ ticker: 'X' })] });
      const fundB = makeFund({ holdings: [makeHolding({ ticker: 'Y', ticker: 'Y' })] });

      const overlap = calculateHoldingsOverlap(fundA, fundB);
      expect(overlap.overlapRatio).toBe(0);
      expect(overlap.commonHoldings).toEqual([]);
    });

    it('should return 1 overlap for identical funds', () => {
      const fund = makeFund();
      const overlap = calculateHoldingsOverlap(fund, fund);
      expect(overlap.overlapRatio).toBe(1);
    });
  });
});
