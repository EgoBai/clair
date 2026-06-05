import { describe, it, expect } from 'vitest';
import {
  validatePriceRelation,
  validateChangePercent,
  validateVolume,
  validateTurnover,
  validateQuote,
  validateQuotes,
  DEFAULT_CONFIG,
  QuoteData,
  ValidationConfig,
} from '../services/quoteValidationEngine';

const validQuote: QuoteData = {
  symbol: 'sh600000',
  open: 10.00,
  close: 10.50,
  high: 10.80,
  low: 9.80,
  volume: 1000000,
  turnover: 10400000,
  preClose: 10.00,
  change: 0.50,
  changePercent: 5.0,
};

describe('quoteValidationEngine', () => {
  describe('validatePriceRelation', () => {
    it('should pass for valid OHLC data', () => {
      const results = validatePriceRelation(validQuote);
      const infoResult = results.find(r => r.severity === 'info' && r.valid);
      expect(infoResult).toBeDefined();
      expect(infoResult?.message).toBe('价格关系正确');
    });

    it('should fail when high < open', () => {
      const data = { ...validQuote, high: 9.00 };
      const results = validatePriceRelation(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('最高价低于开盘价'))).toBe(true);
    });

    it('should fail when high < close', () => {
      const data = { ...validQuote, high: 10.00, close: 10.50 };
      const results = validatePriceRelation(data);
      expect(results.some(r => !r.valid && r.message.includes('最高价低于收盘价'))).toBe(true);
    });

    it('should fail when low > open', () => {
      const data = { ...validQuote, low: 11.00, open: 10.00 };
      const results = validatePriceRelation(data);
      expect(results.some(r => !r.valid && r.message.includes('最低价高于开盘价'))).toBe(true);
    });

    it('should fail when low > close', () => {
      const data = { ...validQuote, low: 11.00, close: 10.50 };
      const results = validatePriceRelation(data);
      expect(results.some(r => !r.valid && r.message.includes('最低价高于收盘价'))).toBe(true);
    });

    it('should fail when high < low', () => {
      const data = { ...validQuote, high: 9.00, low: 11.00 };
      const results = validatePriceRelation(data);
      expect(results.some(r => !r.valid && r.message.includes('最高价低于最低价'))).toBe(true);
    });

    it('should pass when high equals open and close', () => {
      const data = { ...validQuote, open: 10.00, close: 10.00, high: 10.00, low: 9.00 };
      const results = validatePriceRelation(data);
      expect(results.some(r => r.valid && r.severity === 'info')).toBe(true);
    });

    it('should pass when low equals open and close', () => {
      const data = { ...validQuote, open: 10.00, close: 10.00, high: 11.00, low: 10.00 };
      const results = validatePriceRelation(data);
      expect(results.some(r => r.valid && r.severity === 'info')).toBe(true);
    });
  });

  describe('validateChangePercent', () => {
    it('should pass for normal change percent', () => {
      const results = validateChangePercent(validQuote);
      expect(results.some(r => r.valid)).toBe(true);
    });

    it('should fail when change percent exceeds limit', () => {
      const data = { ...validQuote, preClose: 10.00, close: 13.00 };
      const results = validateChangePercent(data);
      expect(results.some(r => !r.valid && r.severity === 'error')).toBe(true);
    });

    it('should use ST limit for ST stocks', () => {
      const data: QuoteData = {
        ...validQuote,
        symbol: 'sh600000_ST',
        preClose: 10.00,
        close: 10.60,
      };
      const results = validateChangePercent(data);
      expect(results.some(r => !r.valid)).toBe(true);
    });

    it('should pass ST stock within limit', () => {
      const data: QuoteData = {
        ...validQuote,
        symbol: 'sh600000_ST',
        preClose: 10.00,
        close: 10.04,
        change: 0.04,
        changePercent: 0.4,
      };
      const results = validateChangePercent(data);
      expect(results.some(r => r.valid)).toBe(true);
    });

    it('should check change field consistency', () => {
      const data = { ...validQuote, preClose: 10.00, close: 10.50, change: 2.0 };
      const results = validateChangePercent(data);
      expect(results.some(r => !r.valid && r.field === 'change')).toBe(true);
    });

    it('should return empty when preClose is missing', () => {
      const { preClose, ...noPreClose } = validQuote;
      const results = validateChangePercent(noPreClose as QuoteData);
      expect(results.length).toBe(0);
    });

    it('should allow floating point tolerance', () => {
      const data = { ...validQuote, preClose: 10.00, close: 12.00, change: 2.00005 };
      const results = validateChangePercent(data);
      // within 0.001 tolerance
      expect(results.every(r => r.field !== 'change' || r.valid)).toBe(true);
    });
  });

  describe('validateVolume', () => {
    it('should pass for valid volume', () => {
      const results = validateVolume(validQuote);
      expect(results.some(r => r.valid)).toBe(true);
    });

    it('should warn when volume is below minimum', () => {
      const config: ValidationConfig = { ...DEFAULT_CONFIG, minVolume: 100 };
      const data = { ...validQuote, volume: 50 };
      const results = validateVolume(data, config);
      expect(results.some(r => !r.valid && r.severity === 'warning')).toBe(true);
    });

    it('should error when volume exceeds maximum', () => {
      const data = { ...validQuote, volume: 99999999999 };
      const results = validateVolume(data);
      expect(results.some(r => !r.valid && r.severity === 'error')).toBe(true);
    });

    it('should warn when volume is not integer', () => {
      const data = { ...validQuote, volume: 1000.5 };
      const results = validateVolume(data);
      expect(results.some(r => !r.valid && r.message.includes('整数'))).toBe(true);
    });

    it('should pass for zero volume with default config', () => {
      const data = { ...validQuote, volume: 0 };
      const results = validateVolume(data);
      // zero is integer and >= minVolume(0)
      expect(results.some(r => r.valid)).toBe(true);
    });
  });

  describe('validateTurnover', () => {
    it('should pass for valid turnover', () => {
      const results = validateTurnover(validQuote);
      expect(results.some(r => r.valid)).toBe(true);
    });

    it('should error when turnover is negative', () => {
      const data = { ...validQuote, turnover: -100 };
      const results = validateTurnover(data);
      expect(results.some(r => !r.valid && r.severity === 'error')).toBe(true);
    });

    it('should warn when avg price is outside price range', () => {
      const data = { ...validQuote, volume: 100, turnover: 5000, low: 10.00, high: 11.00 };
      // avgPrice = 50, way outside [10, 11]
      const results = validateTurnover(data);
      expect(results.some(r => !r.valid && r.message.includes('不匹配'))).toBe(true);
    });

    it('should pass when volume or turnover is zero', () => {
      const data = { ...validQuote, volume: 0, turnover: 0 };
      const results = validateTurnover(data);
      expect(results.some(r => r.valid)).toBe(true);
    });
  });

  describe('validateQuote', () => {
    it('should return valid for correct data', () => {
      const result = validateQuote(validQuote);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect multiple errors', () => {
      const bad: QuoteData = {
        symbol: 'sh600000',
        open: 15.00,
        close: 10.00,
        high: 8.00,
        low: 12.00,
        volume: -100,
        turnover: -1000,
      };
      const result = validateQuote(bad);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should use custom config', () => {
      const config: ValidationConfig = {
        maxChangePercent: 10,
        stMaxChangePercent: 5,
        minVolume: 0,
        maxVolume: 1000000,
        checkPriceRelation: true,
        checkVolumePrice: true,
      };
      const data = { ...validQuote, preClose: 10.00, close: 11.50 };
      const result = validateQuote(data, config);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateQuotes', () => {
    it('should validate multiple quotes', () => {
      const quotes = [
        validQuote,
        { ...validQuote, symbol: 'sz000001', close: 10.50 },
      ];
      const batch = validateQuotes(quotes);
      expect(batch.validCount).toBe(2);
      expect(batch.invalidCount).toBe(0);
      expect(batch.results.length).toBe(2);
    });

    it('should count invalid quotes correctly', () => {
      const quotes = [
        validQuote,
        { ...validQuote, symbol: 'sz000001', high: 5.00 },
      ];
      const batch = validateQuotes(quotes);
      expect(batch.validCount).toBe(1);
      expect(batch.invalidCount).toBe(1);
    });

    it('should handle empty array', () => {
      const batch = validateQuotes([]);
      expect(batch.validCount).toBe(0);
      expect(batch.invalidCount).toBe(0);
      expect(batch.results.length).toBe(0);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have expected defaults', () => {
      expect(DEFAULT_CONFIG.maxChangePercent).toBe(20);
      expect(DEFAULT_CONFIG.stMaxChangePercent).toBe(5);
      expect(DEFAULT_CONFIG.checkPriceRelation).toBe(true);
      expect(DEFAULT_CONFIG.checkVolumePrice).toBe(true);
    });
  });
});
