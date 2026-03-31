/**
 * DragonTiger 模型测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateDragonTigerReason,
  getSeatTypeLabel,
  calculateBuySellRatio,
  type DragonTiger,
  type DragonTigerDetail,
  type DragonTigerSummary,
  type SeatActivity,
  type DragonTigerStats,
  type DragonTigerReason,
  type SeatType,
} from '../../models/DragonTiger';

describe('DragonTiger Model', () => {
  describe('validateDragonTigerReason', () => {
    it('should validate correct reasons', () => {
      expect(validateDragonTigerReason('daily_change')).toBe(true);
      expect(validateDragonTigerReason('daily_amplitude')).toBe(true);
      expect(validateDragonTigerReason('daily_turnover')).toBe(true);
    });

    it('should reject invalid reasons', () => {
      expect(validateDragonTigerReason('invalid_reason')).toBe(false);
      expect(validateDragonTigerReason('')).toBe(false);
    });
  });

  describe('getSeatTypeLabel', () => {
    it('should return correct Chinese labels', () => {
      expect(getSeatTypeLabel('institution')).toBe('机构');
      expect(getSeatTypeLabel('hot_money')).toBe('游资');
      expect(getSeatTypeLabel('north_bound')).toBe('北向');
      expect(getSeatTypeLabel('securities')).toBe('券商');
      expect(getSeatTypeLabel('unknown')).toBe('未知');
    });
  });

  describe('calculateBuySellRatio', () => {
    it('should calculate ratio correctly', () => {
      expect(calculateBuySellRatio(100, 50)).toBe(2);
      expect(calculateBuySellRatio(50, 100)).toBe(0.5);
      expect(calculateBuySellRatio(100, 100)).toBe(1);
    });

    it('should handle zero sell', () => {
      expect(calculateBuySellRatio(100, 0)).toBe(Infinity);
      expect(calculateBuySellRatio(0, 0)).toBe(0);
    });

    it('should handle zero buy', () => {
      expect(calculateBuySellRatio(0, 100)).toBe(0);
    });
  });

  describe('Type interfaces', () => {
    it('should allow DragonTiger creation', () => {
      const dt: DragonTiger = {
        id: 1,
        stockId: 1,
        stockSymbol: '000001.SZ',
        stockName: '平安银行',
        tradeDate: new Date(),
        reason: 'daily_change',
        closePrice: 12.5,
        changePercent: 7.2,
        turnover: 500000000,
        volume: 40000000,
        netBuy: 50000000,
        netSell: 30000000,
        buySellRatio: 1.67,
        createdAt: new Date(),
      };
      expect(dt.stockName).toBe('平安银行');
    });

    it('should allow DragonTigerDetail creation', () => {
      const detail: DragonTigerDetail = {
        id: 1,
        dragonTigerId: 1,
        rank: 1,
        seatName: '华泰证券深圳益田路荣超商务中心证券营业部',
        seatType: 'hot_money',
        buyAmount: 50000000,
        sellAmount: 10000000,
        netAmount: 40000000,
        buyTurnover: 10,
        sellTurnover: 2,
        createdAt: new Date(),
      };
      expect(detail.rank).toBe(1);
    });

    it('should allow SeatActivity creation', () => {
      const activity: SeatActivity = {
        seatName: '知名游资席位',
        seatType: 'hot_money',
        appearanceCount: 15,
        totalBuy: 500000000,
        totalSell: 300000000,
        netAmount: 200000000,
        winRate: 65.5,
        avgReturn: 8.2,
        recentStocks: ['000001.SZ', '600036.SH'],
      };
      expect(activity.winRate).toBe(65.5);
    });
  });

  describe('Seat types', () => {
    it('should support all seat types', () => {
      const types: SeatType[] = ['institution', 'hot_money', 'north_bound', 'securities', 'unknown'];
      types.forEach(type => {
        const label = getSeatTypeLabel(type);
        expect(label).toBeTruthy();
        expect(typeof label).toBe('string');
      });
    });
  });

  describe('DragonTigerReason types', () => {
    it('should support main reasons', () => {
      const reasons: DragonTigerReason[] = ['daily_change', 'daily_amplitude', 'daily_turnover'];
      reasons.forEach(reason => {
        expect(validateDragonTigerReason(reason)).toBe(true);
      });
    });
  });
});
