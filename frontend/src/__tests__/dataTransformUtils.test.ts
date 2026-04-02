import { describe, it, expect } from 'vitest';
import {
  formatAmount, formatVolume, formatMarketCap, formatChange, formatChangePercent,
  transformStock, transformBatch, aggregateSector, sortByField,
  filterByChangeRange, computePercentileRank, RawStockData,
} from '../utils/dataTransformUtils';

const mockStock: RawStockData = {
  code: '600519', name: '贵州茅台', price: 1800.50, change: 45.50,
  changePercent: 2.59, volume: 50000, amount: 900000000, high: 1820,
  low: 1780, open: 1790, preClose: 1755, turnover: 0.35,
  pe: 35.5, pb: 12.3, marketCap: 2.26e12,
};

const mockStocks: RawStockData[] = [
  mockStock,
  { ...mockStock, code: '000858', name: '五粮液', price: 150, change: -3, changePercent: -1.96 },
  { ...mockStock, code: '000568', name: '泸州老窖', price: 200, change: 0, changePercent: 0 },
];

describe('DataTransformUtils', () => {
  describe('formatAmount', () => {
    it('should format in 万亿', () => {
      expect(formatAmount(1.5e12)).toContain('万亿');
    });
    it('should format in 亿', () => {
      expect(formatAmount(5e8)).toContain('亿');
    });
    it('should format in 万', () => {
      expect(formatAmount(5e4)).toContain('万');
    });
  });

  describe('formatVolume', () => {
    it('should format volume with unit', () => {
      expect(formatVolume(1.5e8)).toContain('亿手');
      expect(formatVolume(5e4)).toContain('万手');
      expect(formatVolume(500)).toContain('手');
    });
  });

  describe('formatMarketCap', () => {
    it('should format market cap', () => {
      expect(formatMarketCap(2.26e12)).toContain('万亿');
    });
  });

  describe('formatChange / formatChangePercent', () => {
    it('should add + sign for positive', () => {
      expect(formatChange(5.5)).toBe('+5.50');
      expect(formatChangePercent(2.5)).toBe('+2.50%');
    });
    it('should handle negative', () => {
      expect(formatChange(-3.2)).toBe('-3.20');
      expect(formatChangePercent(-1.5)).toBe('-1.50%');
    });
  });

  describe('transformStock', () => {
    it('should add formatted fields', () => {
      const result = transformStock(mockStock);
      expect(result.priceFormatted).toBe('1800.50');
      expect(result.color).toBe('red');
      expect(result.amplitude).toBeGreaterThan(0);
      expect(result.volumeFormatted).toContain('万手');
    });

    it('should detect green color for negative', () => {
      const result = transformStock({ ...mockStock, change: -5 });
      expect(result.color).toBe('green');
    });

    it('should detect gray for zero change', () => {
      const result = transformStock({ ...mockStock, change: 0, changePercent: 0 });
      expect(result.color).toBe('gray');
    });
  });

  describe('transformBatch', () => {
    it('should transform array', () => {
      const results = transformBatch(mockStocks);
      expect(results).toHaveLength(3);
    });
  });

  describe('aggregateSector', () => {
    it('should aggregate sector data', () => {
      const result = aggregateSector('白酒', mockStocks);
      expect(result.sectorName).toBe('白酒');
      expect(result.stockCount).toBe(3);
      expect(result.topStock?.name).toBe('贵州茅台');
      expect(result.bottomStock?.name).toBe('五粮液');
    });

    it('should handle empty sector', () => {
      const result = aggregateSector('空', []);
      expect(result.stockCount).toBe(0);
    });
  });

  describe('sortByField', () => {
    it('should sort descending by default', () => {
      const sorted = sortByField(mockStocks, 'changePercent');
      expect(sorted[0].changePercent).toBeGreaterThanOrEqual(sorted[1].changePercent);
    });
    it('should sort ascending', () => {
      const sorted = sortByField(mockStocks, 'changePercent', 'asc');
      expect(sorted[0].changePercent).toBeLessThanOrEqual(sorted[1].changePercent);
    });
  });

  describe('filterByChangeRange', () => {
    it('should filter by range', () => {
      const result = filterByChangeRange(mockStocks, -2, 3);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('computePercentileRank', () => {
    it('should compute rank', () => {
      expect(computePercentileRank(50, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(45);
    });
    it('should handle empty array', () => {
      expect(computePercentileRank(5, [])).toBe(0);
    });
  });
});
