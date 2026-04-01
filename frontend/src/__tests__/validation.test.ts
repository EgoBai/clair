import { describe, it, expect } from 'vitest';
import {
  validate,
  isValidStockCode,
  validateStockCode,
  isValidPrice,
  validatePrice,
  isValidQuantity,
  validateQuantity,
  isValidPercent,
  isValidTradeDate,
  validateOrder,
  isInRange,
  sanitizeStockCode,
  sanitizePrice,
  sanitizeQuantity,
  ValidationResult,
} from '../utils/validation';

describe('validation', () => {
  describe('validate', () => {
    it('should return valid when all rules pass', () => {
      const rules = [
        { name: 'required', validate: (v: unknown) => v !== '', message: '不能为空' },
      ];
      const result = validate('hello', rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors when rules fail', () => {
      const rules = [
        { name: 'required', validate: (v: unknown) => v !== '', message: '不能为空' },
        { name: 'minLen', validate: (v: unknown) => String(v).length >= 3, message: '至少3个字符' },
      ];
      const result = validate('ab', rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('至少3个字符');
    });

    it('should collect all failing rules', () => {
      const rules = [
        { name: 'a', validate: () => false, message: '错误A' },
        { name: 'b', validate: () => false, message: '错误B' },
        { name: 'c', validate: () => true, message: '错误C' },
      ];
      const result = validate(null, rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('isValidStockCode', () => {
    it('should accept valid 6-digit codes', () => {
      expect(isValidStockCode('000001')).toBe(true);
      expect(isValidStockCode('600519')).toBe(true);
      expect(isValidStockCode('300750')).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(isValidStockCode('')).toBe(false);
      expect(isValidStockCode('12345')).toBe(false);
      expect(isValidStockCode('1234567')).toBe(false);
      expect(isValidStockCode('ABCDEF')).toBe(false);
      expect(isValidStockCode('00001A')).toBe(false);
    });
  });

  describe('validateStockCode', () => {
    it('should return valid for correct code', () => {
      const result = validateStockCode('600036');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty code', () => {
      const result = validateStockCode('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('股票代码不能为空');
    });

    it('should reject wrong format', () => {
      const result = validateStockCode('12345');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('股票代码必须是6位数字');
    });
  });

  describe('isValidPrice', () => {
    it('should accept valid prices', () => {
      expect(isValidPrice(0)).toBe(true);
      expect(isValidPrice(100.5)).toBe(true);
      expect(isValidPrice(99999)).toBe(true);
    });

    it('should reject invalid prices', () => {
      expect(isValidPrice(-1)).toBe(false);
      expect(isValidPrice(NaN)).toBe(false);
      expect(isValidPrice(100001)).toBe(false);
    });
  });

  describe('validatePrice', () => {
    it('should validate correct price', () => {
      const result = validatePrice(99.5);
      expect(result.valid).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(validatePrice(null).valid).toBe(false);
      expect(validatePrice(undefined).valid).toBe(false);
    });

    it('should reject NaN', () => {
      expect(validatePrice('abc').valid).toBe(false);
    });

    it('should reject negative', () => {
      const result = validatePrice(-10);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('价格不能为负数');
    });

    it('should reject too large', () => {
      expect(validatePrice(200000).valid).toBe(false);
    });
  });

  describe('isValidQuantity', () => {
    it('should accept valid lot multiples', () => {
      expect(isValidQuantity(100)).toBe(true);
      expect(isValidQuantity(500)).toBe(true);
      expect(isValidQuantity(1000)).toBe(true);
    });

    it('should reject non-lot multiples', () => {
      expect(isValidQuantity(50)).toBe(false);
      expect(isValidQuantity(150)).toBe(false);
    });

    it('should reject zero and negative', () => {
      expect(isValidQuantity(0)).toBe(false);
      expect(isValidQuantity(-100)).toBe(false);
    });

    it('should reject too large', () => {
      expect(isValidQuantity(1000100)).toBe(false);
    });
  });

  describe('validateQuantity', () => {
    it('should validate correct quantity', () => {
      const result = validateQuantity(200);
      expect(result.valid).toBe(true);
    });

    it('should reject non-integer', () => {
      const result = validateQuantity(100.5);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('数量必须是整数');
    });

    it('should reject non-lot size', () => {
      const result = validateQuantity(150);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('A股数量必须是100的整数倍');
    });
  });

  describe('isValidPercent', () => {
    it('should accept valid percentages', () => {
      expect(isValidPercent(0)).toBe(true);
      expect(isValidPercent(50)).toBe(true);
      expect(isValidPercent(-50)).toBe(true);
      expect(isValidPercent(100)).toBe(true);
      expect(isValidPercent(-100)).toBe(true);
    });

    it('should reject out of range', () => {
      expect(isValidPercent(101)).toBe(false);
      expect(isValidPercent(-101)).toBe(false);
      expect(isValidPercent(NaN)).toBe(false);
    });
  });

  describe('isValidTradeDate', () => {
    it('should accept valid dates', () => {
      expect(isValidTradeDate('2024-01-15')).toBe(true);
      expect(isValidTradeDate('2024-12-31')).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(isValidTradeDate('2024/01/15')).toBe(false);
      expect(isValidTradeDate('24-01-15')).toBe(false);
      expect(isValidTradeDate('')).toBe(false);
    });

    it('should reject invalid month', () => {
      expect(isValidTradeDate('2024-13-01')).toBe(false);
      expect(isValidTradeDate('2024-00-01')).toBe(false);
    });

    it('should reject invalid day', () => {
      expect(isValidTradeDate('2024-01-32')).toBe(false);
      expect(isValidTradeDate('2024-01-00')).toBe(false);
    });
  });

  describe('validateOrder', () => {
    it('should validate correct buy order', () => {
      const result = validateOrder({
        stockCode: '000001',
        price: 10.5,
        quantity: 100,
        side: 'buy',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate correct sell order', () => {
      const result = validateOrder({
        stockCode: '600519',
        price: 1800,
        quantity: 200,
        side: 'sell',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid side', () => {
      const result = validateOrder({
        stockCode: '000001',
        price: 10,
        quantity: 100,
        side: 'hold' as any,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('交易方向必须是买入或卖出');
    });

    it('should collect all field errors', () => {
      const result = validateOrder({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('isInRange', () => {
    it('should return true within range', () => {
      expect(isInRange(5, 0, 10)).toBe(true);
      expect(isInRange(0, 0, 10)).toBe(true);
      expect(isInRange(10, 0, 10)).toBe(true);
    });

    it('should return false outside range', () => {
      expect(isInRange(-1, 0, 10)).toBe(false);
      expect(isInRange(11, 0, 10)).toBe(false);
    });

    it('should reject NaN', () => {
      expect(isInRange(NaN, 0, 10)).toBe(false);
    });
  });

  describe('sanitizeStockCode', () => {
    it('should extract digits only', () => {
      expect(sanitizeStockCode('600036')).toBe('600036');
      expect(sanitizeStockCode('sh600036')).toBe('600036');
      expect(sanitizeStockCode('00-00-01')).toBe('000001');
    });

    it('should limit to 6 digits', () => {
      expect(sanitizeStockCode('1234567890')).toBe('123456');
    });

    it('should handle empty input', () => {
      expect(sanitizeStockCode('')).toBe('');
      expect(sanitizeStockCode('abc')).toBe('');
    });
  });

  describe('sanitizePrice', () => {
    it('should parse price string', () => {
      expect(sanitizePrice('99.5')).toBe(99.5);
      expect(sanitizePrice('¥100.00')).toBe(100);
    });

    it('should round to 2 decimal places', () => {
      expect(sanitizePrice('99.999')).toBe(100);
      expect(sanitizePrice('10.124')).toBe(10.12);
    });

    it('should return null for invalid input', () => {
      expect(sanitizePrice('')).toBeNull();
      expect(sanitizePrice('abc')).toBeNull();
    });
  });

  describe('sanitizeQuantity', () => {
    it('should round down to nearest 100', () => {
      expect(sanitizeQuantity('250')).toBe(200);
      expect(sanitizeQuantity('300')).toBe(300);
      expect(sanitizeQuantity('399')).toBe(300);
    });

    it('should return null for invalid', () => {
      expect(sanitizeQuantity('')).toBeNull();
      expect(sanitizeQuantity('abc')).toBeNull();
    });
  });
});
