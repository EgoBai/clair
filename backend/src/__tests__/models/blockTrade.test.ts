/**
 * BlockTrade 模型测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateBlockTradeParty,
  calculatePremiumRate,
  classifyPremium,
  formatBlockTradeAmount,
  type BlockTrade,
  type BlockTradeSummary,
  type IndustryBlockTrade,
  type BlockTradeAlert,
  type BlockTradeStats,
  type BlockTradeParty,
  type BlockTradeAlertType,
} from '../../models/BlockTrade';

describe('BlockTrade Model', () => {
  describe('validateBlockTradeParty', () => {
    it('should validate correct parties', () => {
      expect(validateBlockTradeParty('institution')).toBe(true);
      expect(validateBlockTradeParty('securities')).toBe(true);
      expect(validateBlockTradeParty('fund')).toBe(true);
      expect(validateBlockTradeParty('insurance')).toBe(true);
      expect(validateBlockTradeParty('qfii')).toBe(true);
      expect(validateBlockTradeParty('hot_money')).toBe(true);
      expect(validateBlockTradeParty('unknown')).toBe(true);
    });

    it('should reject invalid parties', () => {
      expect(validateBlockTradeParty('invalid')).toBe(false);
      expect(validateBlockTradeParty('')).toBe(false);
      expect(validateBlockTradeParty('retail')).toBe(false);
    });
  });

  describe('calculatePremiumRate', () => {
    it('should calculate positive premium', () => {
      expect(calculatePremiumRate(11, 10)).toBe(10);
      expect(calculatePremiumRate(10.5, 10)).toBe(5);
    });

    it('should calculate negative premium (discount)', () => {
      expect(calculatePremiumRate(9, 10)).toBe(-10);
      expect(calculatePremiumRate(9.5, 10)).toBe(-5);
    });

    it('should return 0 for same price', () => {
      expect(calculatePremiumRate(10, 10)).toBe(0);
    });

    it('should handle zero close price', () => {
      expect(calculatePremiumRate(10, 0)).toBe(0);
    });
  });

  describe('classifyPremium', () => {
    it('should classify premium', () => {
      expect(classifyPremium(1.5)).toBe('premium');
      expect(classifyPremium(5)).toBe('premium');
    });

    it('should classify discount', () => {
      expect(classifyPremium(-1.5)).toBe('discount');
      expect(classifyPremium(-5)).toBe('discount');
    });

    it('should classify flat', () => {
      expect(classifyPremium(0)).toBe('flat');
      expect(classifyPremium(0.3)).toBe('flat');
      expect(classifyPremium(-0.3)).toBe('flat');
    });
  });

  describe('formatBlockTradeAmount', () => {
    it('should format amounts in 亿', () => {
      expect(formatBlockTradeAmount(150000000)).toBe('1.50亿');
      expect(formatBlockTradeAmount(500000000)).toBe('5.00亿');
    });

    it('should format amounts in 万', () => {
      expect(formatBlockTradeAmount(500000)).toBe('50.00万');
      expect(formatBlockTradeAmount(10000)).toBe('1.00万');
    });

    it('should format small amounts directly', () => {
      expect(formatBlockTradeAmount(500)).toBe('500.00');
    });
  });

  describe('Type interfaces', () => {
    it('should allow BlockTrade creation', () => {
      const trade: BlockTrade = {
        id: 1,
        stockId: 1,
        stockSymbol: '000001.SZ',
        stockName: '平安银行',
        tradeDate: new Date(),
        tradePrice: 12.5,
        closePrice: 12.3,
        premiumRate: 1.63,
        volume: 1000000,
        turnover: 12500000,
        buyerSeat: '机构专用',
        sellerSeat: '某证券营业部',
        buyerType: 'institution',
        sellerType: 'securities',
        createdAt: new Date(),
      };
      expect(trade.premiumRate).toBe(1.63);
    });

    it('should allow BlockTradeSummary creation', () => {
      const summary: BlockTradeSummary = {
        date: new Date(),
        totalTrades: 50,
        totalTurnover: 2000000000,
        avgPremiumRate: 2.5,
        positivePremiumCount: 30,
        negativePremiumCount: 20,
        topByTurnover: [],
        topByPremium: [],
        byIndustry: [],
      };
      expect(summary.totalTrades).toBe(50);
    });

    it('should allow BlockTradeStats creation', () => {
      const stats: BlockTradeStats = {
        stockSymbol: '000001.SZ',
        stockName: '平安银行',
        totalTrades30d: 5,
        totalTurnover30d: 100000000,
        avgPremiumRate30d: 2.1,
        lastTradeDate: new Date(),
        trend: 'increasing',
      };
      expect(stats.trend).toBe('increasing');
    });
  });

  describe('BlockTradeParty types', () => {
    it('should support all party types', () => {
      const parties: BlockTradeParty[] = [
        'institution', 'securities', 'fund', 'insurance',
        'qfii', 'hot_money', 'unknown'
      ];
      parties.forEach(party => {
        expect(validateBlockTradeParty(party)).toBe(true);
      });
    });
  });

  describe('BlockTradeAlertType', () => {
    it('should support all alert types', () => {
      const types: BlockTradeAlertType[] = [
        'large_turnover', 'high_premium', 'high_discount',
        'institution_buy', 'consecutive_trades'
      ];
      types.forEach(type => {
        const alert: BlockTradeAlert = {
          id: 1,
          stockId: 1,
          stockSymbol: '000001.SZ',
          alertType: type,
          threshold: 100000000,
          currentValue: 150000000,
          triggeredAt: new Date(),
          isRead: false,
        };
        expect(alert.alertType).toBe(type);
      });
    });
  });
});
