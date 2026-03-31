import { describe, it, expect } from 'vitest';
import {
  validatePriceRelation,
  validateChangePercent,
  validateVolume,
  validateTurnover,
  validateQuote,
  validateQuotes,
  DEFAULT_CONFIG,
} from '../services/quoteValidationEngine';

/**
 * 行情数据验证引擎测试
 */

describe('QuoteValidationEngine', () => {
  const validQuote = {
    symbol: '600519',
    open: 100,
    close: 105,
    high: 110,
    low: 95,
    volume: 1000000,
    turnover: 105000000,
    preClose: 99,
    change: 6,
    changePercent: 6.06,
  };

  describe('DEFAULT_CONFIG', () => {
    it('应该有合理的默认值', () => {
      expect(DEFAULT_CONFIG.maxChangePercent).toBe(20);
      expect(DEFAULT_CONFIG.stMaxChangePercent).toBe(5);
      expect(DEFAULT_CONFIG.checkPriceRelation).toBe(true);
      expect(DEFAULT_CONFIG.checkVolumePrice).toBe(true);
    });
  });

  describe('validatePriceRelation', () => {
    it('正常数据应通过验证', () => {
      const results = validatePriceRelation(validQuote);
      const errors = results.filter(r => !r.valid);
      expect(errors).toHaveLength(0);
    });

    it('最高价低于开盘价应报错', () => {
      const data = { ...validQuote, high: 90 };
      const results = validatePriceRelation(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(r => r.field === 'high')).toBe(true);
    });

    it('最高价低于收盘价应报错', () => {
      const data = { ...validQuote, high: 100 };
      const results = validatePriceRelation(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.some(r => r.message.includes('收盘价'))).toBe(true);
    });

    it('最低价高于开盘价应报错', () => {
      const data = { ...validQuote, low: 105 };
      const results = validatePriceRelation(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.some(r => r.field === 'low')).toBe(true);
    });

    it('最低价高于收盘价应报错', () => {
      const data = { ...validQuote, low: 108 };
      const results = validatePriceRelation(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.some(r => r.message.includes('收盘价'))).toBe(true);
    });

    it('最高价低于最低价应报错', () => {
      const data = { ...validQuote, high: 90, low: 100 };
      const results = validatePriceRelation(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.some(r => r.message.includes('最低价'))).toBe(true);
    });

    it('十字星（开盘=收盘）应通过', () => {
      const data = { ...validQuote, open: 100, close: 100, high: 105, low: 95 };
      const results = validatePriceRelation(data);
      const errors = results.filter(r => !r.valid);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateChangePercent', () => {
    it('正常涨跌幅应通过', () => {
      const results = validateChangePercent(validQuote);
      const errors = results.filter(r => !r.valid);
      expect(errors).toHaveLength(0);
    });

    it('超过涨跌幅限制应报错', () => {
      const data = { ...validQuote, preClose: 100, close: 130, changePercent: 30 };
      const results = validateChangePercent(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('ST股超过5%应报错', () => {
      const data = { ...validQuote, symbol: '600519-ST', preClose: 100, close: 108 };
      const results = validateChangePercent(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('涨跌额不一致应警告', () => {
      const data = { ...validQuote, preClose: 100, close: 105, change: 10 };
      const results = validateChangePercent(data);
      const warnings = results.filter(r => r.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('无昨收应跳过验证', () => {
      const { preClose, change, changePercent, ...data } = validQuote;
      const results = validateChangePercent(data);
      expect(results).toHaveLength(0);
    });

    it('跌停应通过验证', () => {
      const data = { ...validQuote, preClose: 100, close: 90, change: -10, changePercent: -10 };
      const results = validateChangePercent(data);
      const errors = results.filter(r => !r.valid);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateVolume', () => {
    it('正常成交量应通过', () => {
      const results = validateVolume(validQuote);
      const errors = results.filter(r => !r.valid);
      expect(errors).toHaveLength(0);
    });

    it('非整数成交量应警告', () => {
      const data = { ...validQuote, volume: 1000.5 };
      const results = validateVolume(data);
      const warnings = results.filter(r => r.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('超过最大成交量应报错', () => {
      const data = { ...validQuote, volume: 99999999999 };
      const results = validateVolume(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateTurnover', () => {
    it('正常成交额应通过', () => {
      const results = validateTurnover(validQuote);
      const errors = results.filter(r => !r.valid);
      expect(errors).toHaveLength(0);
    });

    it('负成交额应报错', () => {
      const data = { ...validQuote, turnover: -100 };
      const results = validateTurnover(data);
      const errors = results.filter(r => !r.valid);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('量价严重不匹配应警告', () => {
      const data = { ...validQuote, volume: 1000000, turnover: 1000 };
      const results = validateTurnover(data);
      const warnings = results.filter(r => r.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateQuote', () => {
    it('完整正常数据应返回valid=true', () => {
      const result = validateQuote(validQuote);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('包含错误应返回valid=false', () => {
      const data = { ...validQuote, high: 90, low: 100 };
      const result = validateQuote(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('应汇总所有验证结果', () => {
      const result = validateQuote(validQuote);
      expect(result.all.length).toBeGreaterThan(0);
    });
  });

  describe('validateQuotes', () => {
    it('应正确统计有效和无效数据', () => {
      const data = [
        validQuote,
        { ...validQuote, symbol: '000002', high: 90 },
      ];
      const result = validateQuotes(data);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(1);
    });

    it('空数组应返回零', () => {
      const result = validateQuotes([]);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(0);
    });

    it('全有效数据应全部通过', () => {
      const data = [
        validQuote,
        { ...validQuote, symbol: '000002' },
        { ...validQuote, symbol: '000003' },
      ];
      const result = validateQuotes(data);
      expect(result.validCount).toBe(3);
      expect(result.invalidCount).toBe(0);
    });
  });

  describe('ValidationResult 结构', () => {
    it('应包含必要字段', () => {
      const results = validatePriceRelation(validQuote);
      results.forEach(r => {
        expect(r).toHaveProperty('valid');
        expect(r).toHaveProperty('field');
        expect(r).toHaveProperty('message');
        expect(r).toHaveProperty('severity');
        expect(['error', 'warning', 'info']).toContain(r.severity);
      });
    });
  });
});
