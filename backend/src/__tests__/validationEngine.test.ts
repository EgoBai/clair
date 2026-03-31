import { describe, it, expect } from 'vitest';
import {
  Validator,
  required, isNumber, isString, min, max, minLength, maxLength,
  pattern, isEmail, oneOf, arrayMinLength,
  stockCode, stockCodeLoose, price, volume, tradingDate, marketType,
  validateStockCode, validateEmail, safeParseNumber, safeParseInt,
} from '../services/validationEngine';

describe('Validator', () => {
  it('should pass valid data', () => {
    const v = new Validator()
      .field('name', [required(), isString()])
      .field('age', [required(), isNumber(), min(0), max(150)]);

    const result = v.validate({ name: 'test', age: 25 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should catch missing required fields', () => {
    const v = new Validator().field('name', [required()]);
    const result = v.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('name');
    expect(result.errors[0].rule).toBe('required');
  });

  it('should catch multiple errors', () => {
    const v = new Validator()
      .field('name', [required(), minLength(3)])
      .field('age', [required(), isNumber()]);

    const result = v.validate({ name: 'ab', age: 'not a number' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('should chain multiple fields', () => {
    const v = new Validator()
      .field('a', [required()])
      .field('b', [required()])
      .field('c', [required()]);

    expect(v.validate({ a: 1, b: 2, c: 3 }).valid).toBe(true);
  });
});

describe('Built-in Rules', () => {
  it('required: rejects null, undefined, empty string', () => {
    const rule = required();
    expect(rule.validate(undefined)).toBe(false);
    expect(rule.validate(null)).toBe(false);
    expect(rule.validate('')).toBe(false);
    expect(rule.validate('x')).toBe(true);
    expect(rule.validate(0)).toBe(true);
    expect(rule.validate(false)).toBe(true);
  });

  it('isNumber: accepts only numbers', () => {
    const rule = isNumber();
    expect(rule.validate(42)).toBe(true);
    expect(rule.validate(0)).toBe(true);
    expect(rule.validate(-1)).toBe(true);
    expect(rule.validate(NaN)).toBe(false);
    expect(rule.validate('42')).toBe(false);
  });

  it('isString: accepts only strings', () => {
    const rule = isString();
    expect(rule.validate('hello')).toBe(true);
    expect(rule.validate('')).toBe(true);
    expect(rule.validate(42)).toBe(false);
  });

  it('min: enforces minimum', () => {
    const rule = min(10);
    expect(rule.validate(10)).toBe(true);
    expect(rule.validate(11)).toBe(true);
    expect(rule.validate(9)).toBe(false);
  });

  it('max: enforces maximum', () => {
    const rule = max(100);
    expect(rule.validate(100)).toBe(true);
    expect(rule.validate(99)).toBe(true);
    expect(rule.validate(101)).toBe(false);
  });

  it('minLength: enforces min string length', () => {
    const rule = minLength(3);
    expect(rule.validate('abc')).toBe(true);
    expect(rule.validate('abcd')).toBe(true);
    expect(rule.validate('ab')).toBe(false);
  });

  it('maxLength: enforces max string length', () => {
    const rule = maxLength(5);
    expect(rule.validate('hello')).toBe(true);
    expect(rule.validate('hello!')).toBe(false);
  });

  it('pattern: matches regex', () => {
    const rule = pattern(/^\d+$/);
    expect(rule.validate('123')).toBe(true);
    expect(rule.validate('abc')).toBe(false);
  });

  it('isEmail: validates email', () => {
    const rule = isEmail();
    expect(rule.validate('user@example.com')).toBe(true);
    expect(rule.validate('invalid')).toBe(false);
    expect(rule.validate('@bad.com')).toBe(false);
  });

  it('oneOf: validates against list', () => {
    const rule = oneOf(['a', 'b', 'c']);
    expect(rule.validate('a')).toBe(true);
    expect(rule.validate('d')).toBe(false);
  });

  it('arrayMinLength: validates array length', () => {
    const rule = arrayMinLength(2);
    expect(rule.validate([1, 2])).toBe(true);
    expect(rule.validate([1])).toBe(false);
    expect(rule.validate('not array')).toBe(false);
  });
});

describe('A-Share Rules', () => {
  it('stockCode: validates prefixed codes', () => {
    const rule = stockCode();
    expect(rule.validate('sh600000')).toBe(true);
    expect(rule.validate('sz000001')).toBe(true);
    expect(rule.validate('bj430000')).toBe(true);
    expect(rule.validate('600000')).toBe(false);
    expect(rule.validate('sh60000')).toBe(false);
  });

  it('stockCodeLoose: validates 6-digit codes', () => {
    const rule = stockCodeLoose();
    expect(rule.validate('600000')).toBe(true);
    expect(rule.validate('000001')).toBe(true);
    expect(rule.validate('12345')).toBe(false);
    expect(rule.validate('abcdef')).toBe(false);
  });

  it('price: validates price format', () => {
    const rule = price();
    expect(rule.validate(10.50)).toBe(true);
    expect(rule.validate(0.01)).toBe(true);
    expect(rule.validate(0)).toBe(false);
    expect(rule.validate(-1)).toBe(false);
    expect(rule.validate(10.123)).toBe(false); // too many decimals
  });

  it('volume: validates volume', () => {
    const rule = volume();
    expect(rule.validate(100)).toBe(true);
    expect(rule.validate(100.5)).toBe(false);
    expect(rule.validate(0)).toBe(false);
    expect(rule.validate(-1)).toBe(false);
  });

  it('tradingDate: validates date format', () => {
    const rule = tradingDate();
    expect(rule.validate('2024-01-15')).toBe(true);
    expect(rule.validate('2024/01/15')).toBe(false);
    expect(rule.validate('not-a-date')).toBe(false);
  });

  it('marketType: validates market', () => {
    const rule = marketType();
    expect(rule.validate('sh')).toBe(true);
    expect(rule.validate('sz')).toBe(true);
    expect(rule.validate('bj')).toBe(true);
    expect(rule.validate('hk')).toBe(false);
  });
});

describe('Quick validation functions', () => {
  it('validateStockCode: works correctly', () => {
    expect(validateStockCode('600000')).toBe(true);
    expect(validateStockCode('000001')).toBe(true);
    expect(validateStockCode('12345')).toBe(false);
  });

  it('validateEmail: works correctly', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('bad')).toBe(false);
  });

  it('safeParseNumber: returns fallback on invalid', () => {
    expect(safeParseNumber('42')).toBe(42);
    expect(safeParseNumber('abc', 10)).toBe(10);
    expect(safeParseNumber(null)).toBe(0); // Number(null) = 0
    expect(safeParseNumber(undefined)).toBe(0);
    expect(safeParseNumber(NaN, 5)).toBe(5);
  });

  it('safeParseInt: returns fallback on invalid', () => {
    expect(safeParseInt('42')).toBe(42);
    expect(safeParseInt('abc', 10)).toBe(10);
    expect(safeParseInt(3.14)).toBe(3);
  });
});
