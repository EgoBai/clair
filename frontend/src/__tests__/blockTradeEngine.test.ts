import { describe, it, expect } from 'vitest';
import { analyzeBlockTrades, BlockTrade } from '../utils/blockTradeEngine';

describe('大宗交易分析引擎', () => {
  const trades: BlockTrade[] = [
    { date: '2026-03-31', stockCode: '000001', stockName: '平安银行', price: 11.5, volume: 500000, amount: 5750000, closePrice: 12, buyer: '机构A', seller: '营业部B', is机构Buy: true, is机构Sell: false },
    { date: '2026-03-31', stockCode: '000002', stockName: '万科A', price: 19.5, volume: 300000, amount: 5850000, closePrice: 19, buyer: '营业部C', seller: '机构D', is机构Buy: false, is机构Sell: true },
    { date: '2026-03-31', stockCode: '000001', stockName: '平安银行', price: 12.5, volume: 200000, amount: 2500000, closePrice: 12, buyer: '机构E', seller: '营业部F', is机构Buy: true, is机构Sell: false },
  ];

  describe('analyzeBlockTrades', () => {
    it('should calculate total amount', () => {
      const result = analyzeBlockTrades(trades);
      expect(result.totalAmount).toBe(14100000);
      expect(result.tradeCount).toBe(3);
    });

    it('should calculate average discount', () => {
      const result = analyzeBlockTrades(trades);
      expect(typeof result.avgDiscount).toBe('number');
    });

    it('should count discount and premium trades', () => {
      const result = analyzeBlockTrades(trades);
      expect(result.discountTrades + result.premiumTrades).toBeLessThanOrEqual(3);
    });

    it('should calculate institution net', () => {
      const result = analyzeBlockTrades(trades);
      expect(typeof result.institutionNet).toBe('number');
    });

    it('should rank top stocks', () => {
      const result = analyzeBlockTrades(trades);
      expect(result.topStocks.length).toBeGreaterThan(0);
      if (result.topStocks.length > 1) {
        expect(result.topStocks[0].amount).toBeGreaterThanOrEqual(result.topStocks[1].amount);
      }
    });

    it('should generate signals', () => {
      const result = analyzeBlockTrades(trades);
      expect(Array.isArray(result.signals)).toBe(true);
    });

    it('should build buyer profile', () => {
      const result = analyzeBlockTrades(trades);
      expect(result.buyerProfile.length).toBeGreaterThan(0);
    });

    it('should handle empty input', () => {
      const result = analyzeBlockTrades([]);
      expect(result.totalAmount).toBe(0);
      expect(result.tradeCount).toBe(0);
    });

    it('should detect anomaly trades', () => {
      const withAnomaly: BlockTrade[] = [
        ...trades,
        { date: '2026-03-31', stockCode: '000001', stockName: '平安银行', price: 10, volume: 10000000, amount: 100000000, closePrice: 12, buyer: '巨鲸', seller: '营业部X', is机构Buy: true, is机构Sell: false },
      ];
      const result = analyzeBlockTrades(withAnomaly);
      expect(result.anomalyTrades.length).toBeGreaterThan(0);
    });
  });
});
