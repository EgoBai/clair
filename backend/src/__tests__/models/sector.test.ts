/**
 * Sector 模型测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateSectorCode,
  getSectorTypeLabel,
  calculateSectorHeatmap,
  SW_L1_INDUSTRIES,
  HOT_CONCEPTS,
  type Sector,
  type SectorQuote,
  type SectorStock,
  type SectorHeatmap,
  type SectorRotation,
  type SectorPerformance,
  type SectorStreak,
  type SectorType,
} from '../../models/Sector';

describe('Sector Model', () => {
  describe('validateSectorCode', () => {
    it('should validate correct sector codes', () => {
      expect(validateSectorCode('BK0001')).toBe(true);
      expect(validateSectorCode('SWL1001')).toBe(true);
      expect(validateSectorCode('GN001')).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(validateSectorCode('')).toBe(false);
      expect(validateSectorCode('a')).toBe(false);
      expect(validateSectorCode('INVALID_CODE_TOO_LONG')).toBe(false);
    });
  });

  describe('getSectorTypeLabel', () => {
    it('should return correct Chinese labels', () => {
      expect(getSectorTypeLabel('industry')).toBe('行业板块');
      expect(getSectorTypeLabel('concept')).toBe('概念板块');
      expect(getSectorTypeLabel('region')).toBe('地域板块');
      expect(getSectorTypeLabel('style')).toBe('风格板块');
    });
  });

  describe('calculateSectorHeatmap', () => {
    it('should calculate heatmap from quotes', () => {
      const quotes: SectorQuote[] = [
        {
          id: 1,
          sectorId: 1,
          tradeDate: new Date(),
          changePercent: 2.5,
          turnoverRate: 3.2,
          volume: 1000000,
          turnover: 50000000,
          inflow: 30000000,
          outflow: 20000000,
          netInflow: 10000000,
          risingCount: 8,
          fallingCount: 2,
          createdAt: new Date(),
        },
      ];

      const heatmap = calculateSectorHeatmap(quotes);
      expect(heatmap).toHaveLength(1);
      expect(heatmap[0].changePercent).toBe(2.5);
      expect(heatmap[0].risingRatio).toBe(0.8);
    });

    it('should handle zero counts', () => {
      const quotes: SectorQuote[] = [
        {
          id: 1,
          sectorId: 1,
          tradeDate: new Date(),
          changePercent: 0,
          turnoverRate: 0,
          volume: 0,
          turnover: 0,
          inflow: 0,
          outflow: 0,
          netInflow: 0,
          risingCount: 0,
          fallingCount: 0,
          createdAt: new Date(),
        },
      ];

      const heatmap = calculateSectorHeatmap(quotes);
      expect(heatmap[0].risingRatio).toBe(0);
    });
  });

  describe('SW_L1_INDUSTRIES', () => {
    it('should contain major industries', () => {
      expect(SW_L1_INDUSTRIES).toContain('银行');
      expect(SW_L1_INDUSTRIES).toContain('电子');
      expect(SW_L1_INDUSTRIES).toContain('医药生物');
      expect(SW_L1_INDUSTRIES).toContain('计算机');
      expect(SW_L1_INDUSTRIES).toContain('食品饮料');
    });

    it('should have 31 industries', () => {
      expect(SW_L1_INDUSTRIES).toHaveLength(31);
    });
  });

  describe('HOT_CONCEPTS', () => {
    it('should contain current hot concepts', () => {
      expect(HOT_CONCEPTS).toContain('人工智能');
      expect(HOT_CONCEPTS).toContain('芯片');
      expect(HOT_CONCEPTS).toContain('新能源汽车');
      expect(HOT_CONCEPTS).toContain('机器人');
    });
  });

  describe('Type interfaces', () => {
    it('should allow Sector creation', () => {
      const sector: Sector = {
        id: 1,
        code: 'BK0001',
        name: '银行',
        type: 'industry',
        level: 1,
        stockCount: 42,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(sector.name).toBe('银行');
    });

    it('should allow SectorRotation creation', () => {
      const rotation: SectorRotation = {
        date: new Date(),
        hotSectors: [],
        coldSectors: [],
        consecutiveRising: [],
        consecutiveFalling: [],
      };
      expect(rotation.hotSectors).toHaveLength(0);
    });

    it('should allow SectorPerformance creation', () => {
      const perf: SectorPerformance = {
        sectorId: 1,
        sectorName: '银行',
        changePercent: 2.5,
        turnover: 100000000,
        netInflow: 50000000,
        leadingStock: {
          symbol: '000001.SZ',
          name: '平安银行',
          changePercent: 5.2,
        },
      };
      expect(perf.leadingStock.symbol).toBe('000001.SZ');
    });

    it('should allow SectorStreak creation', () => {
      const streak: SectorStreak = {
        sectorId: 1,
        sectorName: '人工智能',
        days: 5,
        totalChange: 15.3,
      };
      expect(streak.days).toBe(5);
    });
  });
});
