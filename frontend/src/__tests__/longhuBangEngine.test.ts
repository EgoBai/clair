import { describe, it, expect } from 'vitest';
import {
  summarizeLongHuBang,
  analyzeSeats,
  generateLongHuBangSignals,
  type LongHuBangEntry,
} from '../utils/longhuBangEngine';

describe('LongHuBangEngine', () => {
  const mockEntries: LongHuBangEntry[] = [
    {
      ticker: '600519', name: '贵州茅台', date: '2024-01-15', reason: '日涨幅偏离值达7%',
      price: 1850, changePercent: 8, buyAmount: 5e8, sellAmount: 3e8, netAmount: 2e8,
      buyer席位: [
        { name: '机构专用1', amount: 3e8, is机构: true },
        { name: '东方财富拉萨', amount: 2e8, is机构: false },
      ],
      seller席位: [
        { name: '华泰深圳', amount: 2e8, is机构: false },
        { name: '机构专用2', amount: 1e8, is机构: true },
      ],
    },
    {
      ticker: '000858', name: '五粮液', date: '2024-01-15', reason: '日换手率达20%',
      price: 155, changePercent: -3, buyAmount: 2e8, sellAmount: 3e8, netAmount: -1e8,
      buyer席位: [
        { name: '国泰君安上海', amount: 1.5e8, is机构: false },
        { name: '东方财富拉萨', amount: 0.5e8, is机构: false },
      ],
      seller席位: [
        { name: '机构专用1', amount: 2e8, is机构: true },
        { name: '中信上海', amount: 1e8, is机构: false },
      ],
    },
  ];

  describe('summarizeLongHuBang', () => {
    it('should calculate total buy and sell', () => {
      const result = summarizeLongHuBang(mockEntries);
      expect(result.totalBuy).toBe(7e8);
      expect(result.totalSell).toBe(6e8);
    });

    it('should calculate net amount', () => {
      const result = summarizeLongHuBang(mockEntries);
      expect(result.netAmount).toBe(1e8);
    });

    it('should calculate institution net', () => {
      const result = summarizeLongHuBang(mockEntries);
      // 机构买入3e8, 卖出3e8 = 0
      expect(result.institutionNet).toBe(0);
    });

    it('should count unique seats', () => {
      const result = summarizeLongHuBang(mockEntries);
      expect(result.seatCount).toBeGreaterThan(0);
    });

    it('should handle empty entries', () => {
      const result = summarizeLongHuBang([]);
      expect(result.totalBuy).toBe(0);
      expect(result.netAmount).toBe(0);
    });

    it('should calculate average net per entry', () => {
      const result = summarizeLongHuBang(mockEntries);
      expect(result.avgNet).toBe(5e7); // 1e8 / 2
    });
  });

  describe('analyzeSeats', () => {
    it('should analyze each seat', () => {
      const result = analyzeSeats(mockEntries);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should classify seat types', () => {
      const result = analyzeSeats(mockEntries);
      for (const seat of result) {
        expect(['机构', '游资', '营业部']).toContain(seat.type);
      }
    });

    it('should calculate net amount per seat', () => {
      const result = analyzeSeats(mockEntries);
      for (const seat of result) {
        expect(seat.netAmount).toBe(seat.totalBuy - seat.totalSell);
      }
    });

    it('should assign signals', () => {
      const result = analyzeSeats(mockEntries);
      for (const seat of result) {
        expect(['bullish', 'bearish', 'neutral']).toContain(seat.signal);
      }
    });

    it('should sort by absolute net amount descending', () => {
      const result = analyzeSeats(mockEntries);
      for (let i = 1; i < result.length; i++) {
        expect(Math.abs(result[i - 1].netAmount)).toBeGreaterThanOrEqual(
          Math.abs(result[i].netAmount)
        );
      }
    });

    it('should handle empty entries', () => {
      const result = analyzeSeats([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('generateLongHuBangSignals', () => {
    it('should generate signals', () => {
      const signals = generateLongHuBangSignals(mockEntries);
      expect(signals.length).toBeGreaterThanOrEqual(1);
    });

    it('should assign signal types', () => {
      const signals = generateLongHuBangSignals(mockEntries);
      for (const s of signals) {
        expect(['bullish', 'bearish', 'neutral']).toContain(s.type);
      }
    });

    it('should assign strength 0-100', () => {
      const signals = generateLongHuBangSignals(mockEntries);
      for (const s of signals) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });

    it('should include message', () => {
      const signals = generateLongHuBangSignals(mockEntries);
      for (const s of signals) {
        expect(s.message.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty entries', () => {
      const signals = generateLongHuBangSignals([]);
      expect(signals.length).toBeGreaterThanOrEqual(1);
      expect(signals[0].type).toBe('neutral');
    });
  });
});
