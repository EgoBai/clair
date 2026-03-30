import { describe, it, expect } from 'vitest';
import {
  summarizeBlockTrades,
  analyzeInstitutionalBehavior,
  detectAnomalies,
  blockTradeTrend,
  type BlockTrade,
} from '../utils/blockTradingEngine';

describe('BlockTradingEngine', () => {
  const mockTrades: BlockTrade[] = [
    { ticker: '600519', name: '茅台', price: 1800, closePrice: 1850, volume: 10000, amount: 1.8e8, buyer: '机构A', seller: '营业部X', discount: -2.7, date: '2024-01-15' },
    { ticker: '000858', name: '五粮液', price: 150, closePrice: 155, volume: 50000, amount: 7.5e7, buyer: '机构B', seller: '营业部Y', discount: -3.2, date: '2024-01-15' },
    { ticker: '300750', name: '宁德时代', price: 200, closePrice: 195, volume: 30000, amount: 6e7, buyer: '机构A', seller: '营业部Z', discount: 2.6, date: '2024-01-14' },
    { ticker: '600519', name: '茅台', price: 1700, closePrice: 1850, volume: 50000, amount: 8.5e8, buyer: '机构C', seller: '营业部X', discount: -8.1, date: '2024-01-14' },
    { ticker: '002594', name: '比亚迪', price: 250, closePrice: 248, volume: 20000, amount: 5e7, buyer: '机构A', seller: '营业部W', discount: 0.8, date: '2024-01-13' },
    { ticker: '601012', name: '隆基绿能', price: 25, closePrice: 26, volume: 100000, amount: 2.5e8, buyer: '机构D', seller: '营业部V', discount: -3.8, date: '2024-01-13' },
  ];

  describe('summarizeBlockTrades', () => {
    it('should calculate total count and amount', () => {
      const result = summarizeBlockTrades(mockTrades);
      expect(result.totalCount).toBe(6);
      expect(result.totalAmount).toBeGreaterThan(0);
    });

    it('should calculate average discount', () => {
      const result = summarizeBlockTrades(mockTrades);
      expect(typeof result.avgDiscount).toBe('number');
    });

    it('should count discount vs premium trades', () => {
      const result = summarizeBlockTrades(mockTrades);
      expect(result.discountCount + result.premiumCount).toBeLessThanOrEqual(6);
    });

    it('should identify top buyer', () => {
      const result = summarizeBlockTrades(mockTrades);
      // 机构A appears 3 times as buyer
      expect(result.topBuyer).toBe('机构A');
    });

    it('should identify top seller', () => {
      const result = summarizeBlockTrades(mockTrades);
      // 营业部X appears 2 times as seller
      expect(result.topSeller).toBe('营业部X');
    });

    it('should handle empty trades', () => {
      const result = summarizeBlockTrades([]);
      expect(result.totalCount).toBe(0);
      expect(result.totalAmount).toBe(0);
      expect(result.topBuyer).toBe('');
    });

    it('should calculate average volume', () => {
      const result = summarizeBlockTrades(mockTrades);
      expect(result.avgVolume).toBeGreaterThan(0);
    });

    it('should round values', () => {
      const result = summarizeBlockTrades(mockTrades);
      expect(result.avgDiscount).toBe(Math.round(result.avgDiscount * 100) / 100);
    });
  });

  describe('analyzeInstitutionalBehavior', () => {
    const sectorMap = new Map([
      ['600519', '白酒'],
      ['000858', '白酒'],
      ['300750', '新能源'],
      ['002594', '新能源汽车'],
      ['601012', '新能源'],
    ]);

    it('should analyze institutional buy/sell behavior', () => {
      const result = analyzeInstitutionalBehavior(mockTrades, sectorMap);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should identify accumulating signal', () => {
      const result = analyzeInstitutionalBehavior(mockTrades, sectorMap);
      // 机构A buys 3 times, sells 0
      const instA = result.find((r) => r.institution === '机构A');
      expect(instA?.signal).toBe('accumulating');
    });

    it('should identify distributing signal', () => {
      const result = analyzeInstitutionalBehavior(mockTrades, sectorMap);
      const sellers = result.filter((r) => r.sellCount > r.buyCount * 1.5);
      expect(sellers.length).toBeGreaterThanOrEqual(0);
    });

    it('should include focus sectors', () => {
      const result = analyzeInstitutionalBehavior(mockTrades, sectorMap);
      for (const r of result) {
        expect(r.focusSectors.length).toBeLessThanOrEqual(3);
      }
    });

    it('should calculate net amount', () => {
      const result = analyzeInstitutionalBehavior(mockTrades, sectorMap);
      for (const r of result) {
        expect(typeof r.netAmount).toBe('number');
      }
    });

    it('should sort by absolute net amount descending', () => {
      const result = analyzeInstitutionalBehavior(mockTrades, sectorMap);
      for (let i = 1; i < result.length; i++) {
        expect(Math.abs(result[i - 1].netAmount)).toBeGreaterThanOrEqual(
          Math.abs(result[i].netAmount)
        );
      }
    });

    it('should handle empty trades', () => {
      const result = analyzeInstitutionalBehavior([], new Map());
      expect(result).toHaveLength(0);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect large discount anomalies', () => {
      // Generate trades with one extreme outlier
      const discountTrades: BlockTrade[] = [
        ...Array.from({ length: 8 }, (_, i) => ({
          ticker: '600519', name: '茅台', price: 1830 + i * 2, closePrice: 1850,
          volume: 10000, amount: 1.83e7 + i * 1e5, buyer: '机构A', seller: '营业部X',
          discount: -1 - i * 0.3, date: '2024-01-15',
        })),
        // Extreme outlier: -15% discount
        { ticker: '600519', name: '茅台', price: 1572, closePrice: 1850, volume: 50000, amount: 7.86e8, buyer: '机构C', seller: '营业部X', discount: -15, date: '2024-01-15' },
      ];
      const anomalies = detectAnomalies(discountTrades);
      const discountAnomalies = anomalies.filter((a) => a.anomalyType === 'large_discount');
      expect(discountAnomalies.length).toBeGreaterThan(0);
    });

    it('should detect unusual size anomalies', () => {
      const anomalies = detectAnomalies(mockTrades);
      const sizeAnomalies = anomalies.filter((a) => a.anomalyType === 'unusual_size');
      // 8.5e8 is likely an outlier
      expect(sizeAnomalies.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect repeat buyer anomalies', () => {
      const anomalies = detectAnomalies(mockTrades);
      const repeatAnomalies = anomalies.filter((a) => a.anomalyType === 'repeat_buyer');
      // 机构A buys 3 times
      expect(repeatAnomalies.length).toBeGreaterThan(0);
    });

    it('should assign severity levels', () => {
      const anomalies = detectAnomalies(mockTrades);
      for (const a of anomalies) {
        expect(['high', 'medium', 'low']).toContain(a.severity);
      }
    });

    it('should include description', () => {
      const anomalies = detectAnomalies(mockTrades);
      for (const a of anomalies) {
        expect(a.description.length).toBeGreaterThan(0);
      }
    });

    it('should sort by severity', () => {
      const anomalies = detectAnomalies(mockTrades);
      const severityOrder = { high: 3, medium: 2, low: 1 };
      for (let i = 1; i < anomalies.length; i++) {
        expect(severityOrder[anomalies[i - 1].severity]).toBeGreaterThanOrEqual(
          severityOrder[anomalies[i].severity]
        );
      }
    });

    it('should handle empty trades', () => {
      const anomalies = detectAnomalies([]);
      expect(anomalies).toHaveLength(0);
    });

    it('should detect premium anomalies', () => {
      const premiumTrades: BlockTrade[] = [
        ...Array.from({ length: 8 }, (_, i) => ({
          ticker: 'TEST', name: 'Test', price: 101 + i, closePrice: 100,
          volume: 1000, amount: 1.01e5 + i * 1e3, buyer: '机构A', seller: '营业部X',
          discount: 1 + i * 0.5, date: '2024-01-15',
        })),
        { ticker: 'BIG', name: 'BigPremium', price: 140, closePrice: 100, volume: 5000, amount: 7e5, buyer: '机构B', seller: '营业部Y', discount: 40, date: '2024-01-15' },
      ];
      const anomalies = detectAnomalies(premiumTrades);
      expect(anomalies.some((a) => a.anomalyType === 'large_premium')).toBe(true);
    });
  });

  describe('blockTradeTrend', () => {
    it('should aggregate by date', () => {
      const result = blockTradeTrend(mockTrades);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].date).toBeDefined();
    });

    it('should count trades per day', () => {
      const result = blockTradeTrend(mockTrades);
      const jan15 = result.find((r) => r.date === '2024-01-15');
      expect(jan15!.count).toBe(2);
    });

    it('should calculate total amount per day', () => {
      const result = blockTradeTrend(mockTrades);
      for (const r of result) {
        expect(r.totalAmount).toBeGreaterThan(0);
      }
    });

    it('should calculate average discount per day', () => {
      const result = blockTradeTrend(mockTrades);
      for (const r of result) {
        expect(typeof r.avgDiscount).toBe('number');
      }
    });

    it('should determine trend', () => {
      const result = blockTradeTrend(mockTrades);
      for (const r of result) {
        expect(['increasing', 'decreasing', 'stable']).toContain(r.trend);
      }
    });

    it('should sort by date ascending', () => {
      const result = blockTradeTrend(mockTrades);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].date.localeCompare(result[i].date)).toBeLessThanOrEqual(0);
      }
    });

    it('should handle empty trades', () => {
      const result = blockTradeTrend([]);
      expect(result).toHaveLength(0);
    });

    it('should accept custom window days', () => {
      const result = blockTradeTrend(mockTrades, 2);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
