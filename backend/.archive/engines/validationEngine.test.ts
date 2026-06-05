import { describe, it, expect, beforeEach } from 'vitest';
import {
  Validator,
  required,
  isNumber,
  isString,
  min,
  max,
  minLength,
  maxLength,
  pattern,
  isEmail,
  oneOf,
  arrayMinLength,
  stockCode,
  stockCodeLoose,
  price,
  volume,
  tradingDate,
  marketType,
  validateStockCode,
  validateEmail,
  safeParseNumber,
  safeParseInt,
} from '../services/validationEngine';

describe('validationEngine', () => {
  describe('Validator', () => {
    let validator: Validator;

    beforeEach(() => {
      validator = new Validator();
    });

    it('should return valid when all rules pass', () => {
      validator.field('name', [required()]).field('age', [isNumber()]);
      const result = validator.validate({ name: 'test', age: 25 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors when rules fail', () => {
      validator.field('name', [required()]);
      const result = validator.validate({ name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('name');
    });

    it('should support chaining', () => {
      const v = validator
        .field('a', [required()])
        .field('b', [required()]);
      expect(v).toBe(validator);
    });

    it('should accumulate rules for same field', () => {
      validator.field('x', [required()]).field('x', [isNumber()]);
      const result = validator.validate({ x: undefined });
      expect(result.errors.length).toBe(2);
    });

    it('should pass value in error', () => {
      validator.field('x', [min(10)]);
      const result = validator.validate({ x: 5 });
      expect(result.errors[0].value).toBe(5);
    });
  });

  describe('required', () => {
    it('should pass for defined values', () => {
      const rule = required();
      expect(rule.validate('hello')).toBe(true);
      expect(rule.validate(0)).toBe(true);
      expect(rule.validate(false)).toBe(true);
    });

    it('should fail for null/undefined/empty', () => {
      const rule = required();
      expect(rule.validate(null)).toBe(false);
      expect(rule.validate(undefined)).toBe(false);
      expect(rule.validate('')).toBe(false);
    });

    it('should use custom message', () => {
      const rule = required('请输入名称');
      expect(rule.message).toBe('请输入名称');
    });
  });

  describe('isNumber', () => {
    it('should pass for valid numbers', () => {
      const rule = isNumber();
      expect(rule.validate(42)).toBe(true);
      expect(rule.validate(0)).toBe(true);
      expect(rule.validate(-3.14)).toBe(true);
    });

    it('should fail for non-numbers', () => {
      const rule = isNumber();
      expect(rule.validate('42')).toBe(false);
      expect(rule.validate(NaN)).toBe(false);
      expect(rule.validate(null)).toBe(false);
    });
  });

  describe('isString', () => {
    it('should pass for strings', () => {
      const rule = isString();
      expect(rule.validate('hello')).toBe(true);
      expect(rule.validate('')).toBe(true);
    });

    it('should fail for non-strings', () => {
      const rule = isString();
      expect(rule.validate(42)).toBe(false);
      expect(rule.validate(null)).toBe(false);
    });
  });

  describe('min', () => {
    it('should pass when value >= min', () => {
      const rule = min(10);
      expect(rule.validate(10)).toBe(true);
      expect(rule.validate(15)).toBe(true);
    });

    it('should fail when value < min', () => {
      const rule = min(10);
      expect(rule.validate(5)).toBe(false);
    });

    it('should use custom message', () => {
      const rule = min(100, '至少100');
      expect(rule.message).toBe('至少100');
    });
  });

  describe('max', () => {
    it('should pass when value <= max', () => {
      const rule = max(100);
      expect(rule.validate(100)).toBe(true);
      expect(rule.validate(50)).toBe(true);
    });

    it('should fail when value > max', () => {
      const rule = max(100);
      expect(rule.validate(150)).toBe(false);
    });
  });

  describe('minLength', () => {
    it('should pass for strings with enough chars', () => {
      const rule = minLength(3);
      expect(rule.validate('abc')).toBe(true);
      expect(rule.validate('abcd')).toBe(true);
    });

    it('should fail for short strings', () => {
      const rule = minLength(3);
      expect(rule.validate('ab')).toBe(false);
    });

    it('should fail for non-strings', () => {
      const rule = minLength(1);
      expect(rule.validate(123)).toBe(false);
    });
  });

  describe('maxLength', () => {
    it('should pass for strings within limit', () => {
      const rule = maxLength(5);
      expect(rule.validate('abc')).toBe(true);
      expect(rule.validate('abcde')).toBe(true);
    });

    it('should fail for too long strings', () => {
      const rule = maxLength(3);
      expect(rule.validate('abcd')).toBe(false);
    });
  });

  describe('pattern', () => {
    it('should pass for matching patterns', () => {
      const rule = pattern(/^\d{6}$/, '必须6位数字');
      expect(rule.validate('123456')).toBe(true);
    });

    it('should fail for non-matching patterns', () => {
      const rule = pattern(/^\d{6}$/);
      expect(rule.validate('12345')).toBe(false);
      expect(rule.validate('abcdef')).toBe(false);
    });

    it('should fail for non-strings', () => {
      const rule = pattern(/\d+/);
      expect(rule.validate(123)).toBe(false);
    });
  });

  describe('isEmail', () => {
    it('should pass for valid emails', () => {
      const rule = isEmail();
      expect(rule.validate('test@example.com')).toBe(true);
      expect(rule.validate('user.name+tag@domain.org')).toBe(true);
    });

    it('should fail for invalid emails', () => {
      const rule = isEmail();
      expect(rule.validate('not-email')).toBe(false);
      expect(rule.validate('@example.com')).toBe(false);
      expect(rule.validate('test@')).toBe(false);
    });
  });

  describe('oneOf', () => {
    it('should pass for allowed values', () => {
      const rule = oneOf(['a', 'b', 'c']);
      expect(rule.validate('b')).toBe(true);
    });

    it('should fail for disallowed values', () => {
      const rule = oneOf(['a', 'b']);
      expect(rule.validate('c')).toBe(false);
    });

    it('should use custom message', () => {
      const rule = oneOf([1, 2], '选择1或2');
      expect(rule.message).toBe('选择1或2');
    });
  });

  describe('arrayMinLength', () => {
    it('should pass for arrays with enough items', () => {
      const rule = arrayMinLength(2);
      expect(rule.validate([1, 2, 3])).toBe(true);
      expect(rule.validate([1, 2])).toBe(true);
    });

    it('should fail for short arrays', () => {
      const rule = arrayMinLength(2);
      expect(rule.validate([1])).toBe(false);
    });

    it('should fail for non-arrays', () => {
      const rule = arrayMinLength(1);
      expect(rule.validate('abc')).toBe(false);
    });
  });

  describe('stockCode', () => {
    it('should pass for valid stock codes', () => {
      const rule = stockCode();
      expect(rule.validate('sh600000')).toBe(true);
      expect(rule.validate('sz000001')).toBe(true);
      expect(rule.validate('bj830001')).toBe(true);
    });

    it('should fail for invalid stock codes', () => {
      const rule = stockCode();
      expect(rule.validate('600000')).toBe(false);
      expect(rule.validate('sh60000')).toBe(false);
      expect(rule.validate('xx600000')).toBe(false);
    });
  });

  describe('stockCodeLoose', () => {
    it('should pass for 6-digit codes', () => {
      const rule = stockCodeLoose();
      expect(rule.validate('600000')).toBe(true);
      expect(rule.validate('000001')).toBe(true);
    });

    it('should fail for non-6-digit codes', () => {
      const rule = stockCodeLoose();
      expect(rule.validate('60000')).toBe(false);
      expect(rule.validate('sh600000')).toBe(false);
    });
  });

  describe('price', () => {
    it('should pass for valid prices', () => {
      const rule = price();
      expect(rule.validate(10.50)).toBe(true);
      expect(rule.validate(0.01)).toBe(true);
    });

    it('should fail for invalid prices', () => {
      const rule = price();
      expect(rule.validate(0)).toBe(false);
      expect(rule.validate(-10)).toBe(false);
      expect(rule.validate(10.123)).toBe(false);
      expect(rule.validate(Infinity)).toBe(false);
    });
  });

  describe('volume', () => {
    it('should pass for positive integers', () => {
      const rule = volume();
      expect(rule.validate(100)).toBe(true);
      expect(rule.validate(1)).toBe(true);
    });

    it('should fail for non-integers or non-positive', () => {
      const rule = volume();
      expect(rule.validate(0)).toBe(false);
      expect(rule.validate(-100)).toBe(false);
      expect(rule.validate(100.5)).toBe(false);
    });
  });

  describe('tradingDate', () => {
    it('should pass for valid dates', () => {
      const rule = tradingDate();
      expect(rule.validate('2024-01-15')).toBe(true);
    });

    it('should fail for invalid dates', () => {
      const rule = tradingDate();
      expect(rule.validate('2024/01/15')).toBe(false);
      expect(rule.validate('2024-13-01')).toBe(false);
      expect(rule.validate('not-a-date')).toBe(false);
    });
  });

  describe('marketType', () => {
    it('should pass for valid markets', () => {
      const rule = marketType();
      expect(rule.validate('sh')).toBe(true);
      expect(rule.validate('sz')).toBe(true);
      expect(rule.validate('bj')).toBe(true);
    });

    it('should fail for invalid markets', () => {
      const rule = marketType();
      expect(rule.validate('hk')).toBe(false);
      expect(rule.validate('us')).toBe(false);
    });
  });

  describe('validateStockCode', () => {
    it('should validate 6-digit codes', () => {
      expect(validateStockCode('600000')).toBe(true);
      expect(validateStockCode('000001')).toBe(true);
      expect(validateStockCode('12345')).toBe(false);
      expect(validateStockCode('abcdef')).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should validate email format', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('invalid')).toBe(false);
    });
  });

  describe('safeParseNumber', () => {
    it('should parse valid numbers', () => {
      expect(safeParseNumber('42')).toBe(42);
      expect(safeParseNumber(3.14)).toBe(3.14);
    });

    it('should return fallback for invalid', () => {
      expect(safeParseNumber('abc')).toBe(0);
      expect(safeParseNumber(NaN)).toBe(0);
      expect(safeParseNumber('abc', 99)).toBe(99);
    });
  });

  describe('safeParseInt', () => {
    it('should parse valid integers', () => {
      expect(safeParseInt('42')).toBe(42);
      expect(safeParseInt(3.7)).toBe(3);
    });

    it('should return fallback for invalid', () => {
      expect(safeParseInt('abc')).toBe(0);
      expect(safeParseInt(undefined, -1)).toBe(-1);
    });
  });
});
