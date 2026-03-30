import { describe, it, expect } from 'vitest';
import {
  validate, isValidStockCode, validateStockCode,
  isValidPrice, validatePrice,
  isValidQuantity, validateQuantity,
  isValidPercent, isValidTradeDate,
  validateOrder,
  isInRange,
  sanitizeStockCode, sanitizePrice, sanitizeQuantity,
} from '../utils/validation';

describe('validate', () => {
  it('should pass when all rules pass', () => {
    const result = validate(42, [
      { name: 'positive', validate: v => v > 0, message: 'must be positive' },
      { name: 'small', validate: v => v < 100, message: 'must be small' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when rules fail', () => {
    const result = validate(-1, [
      { name: 'positive', validate: v => v > 0, message: 'must be positive' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('must be positive');
  });
});

describe('isValidStockCode', () => {
  it('should accept valid 6-digit codes', () => {
    expect(isValidStockCode('000001')).toBe(true);
    expect(isValidStockCode('600519')).toBe(true);
    expect(isValidStockCode('300750')).toBe(true);
  });

  it('should reject invalid codes', () => {
    expect(isValidStockCode('001')).toBe(false);
    expect(isValidStockCode('ABCDEF')).toBe(false);
    expect(isValidStockCode('')).toBe(false);
    expect(isValidStockCode('0000001')).toBe(false);
  });
});

describe('validateStockCode', () => {
  it('should validate correct code', () => {
    const result = validateStockCode('000001');
    expect(result.valid).toBe(true);
  });

  it('should reject empty code', () => {
    const result = validateStockCode('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject invalid format', () => {
    const result = validateStockCode('ABC');
    expect(result.valid).toBe(false);
  });
});

describe('isValidPrice', () => {
  it('should accept valid prices', () => {
    expect(isValidPrice(10.50)).toBe(true);
    expect(isValidPrice(0)).toBe(true);
    expect(isValidPrice(100000)).toBe(true);
  });

  it('should reject invalid prices', () => {
    expect(isValidPrice(-1)).toBe(false);
    expect(isValidPrice(NaN)).toBe(false);
    expect(isValidPrice(100001)).toBe(false);
  });
});

describe('validatePrice', () => {
  it('should validate correct price', () => {
    expect(validatePrice(100).valid).toBe(true);
  });

  it('should reject null', () => {
    expect(validatePrice(null).valid).toBe(false);
  });

  it('should reject NaN', () => {
    expect(validatePrice('abc').valid).toBe(false);
  });

  it('should reject negative', () => {
    expect(validatePrice(-10).valid).toBe(false);
  });

  it('should reject too large', () => {
    expect(validatePrice(999999).valid).toBe(false);
  });
});

describe('isValidQuantity', () => {
  it('should accept valid quantities', () => {
    expect(isValidQuantity(100)).toBe(true);
    expect(isValidQuantity(500)).toBe(true);
  });

  it('should reject non-multiples of 100', () => {
    expect(isValidQuantity(150)).toBe(false);
  });

  it('should reject zero and negative', () => {
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(-100)).toBe(false);
  });
});

describe('validateQuantity', () => {
  it('should validate correct quantity', () => {
    expect(validateQuantity(200).valid).toBe(true);
  });

  it('should reject non-multiples of 100', () => {
    expect(validateQuantity(150).valid).toBe(false);
  });

  it('should reject non-numeric', () => {
    expect(validateQuantity('abc').valid).toBe(false);
  });
});

describe('isValidPercent', () => {
  it('should accept valid percentages', () => {
    expect(isValidPercent(50)).toBe(true);
    expect(isValidPercent(-50)).toBe(true);
    expect(isValidPercent(0)).toBe(true);
  });

  it('should reject out of range', () => {
    expect(isValidPercent(101)).toBe(false);
    expect(isValidPercent(-101)).toBe(false);
  });
});

describe('isValidTradeDate', () => {
  it('should accept valid dates', () => {
    expect(isValidTradeDate('2024-01-15')).toBe(true);
    expect(isValidTradeDate('2024-12-31')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(isValidTradeDate('01/15/2024')).toBe(false);
    expect(isValidTradeDate('invalid')).toBe(false);
  });

  it('should reject invalid dates', () => {
    expect(isValidTradeDate('2024-13-01')).toBe(false);
    expect(isValidTradeDate('2024-02-30')).toBe(false);
  });
});

describe('validateOrder', () => {
  it('should validate correct order', () => {
    const result = validateOrder({
      stockCode: '000001',
      price: 10.50,
      quantity: 200,
      side: 'buy',
    });
    expect(result.valid).toBe(true);
  });

  it('should reject incomplete order', () => {
    const result = validateOrder({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject invalid side', () => {
    const result = validateOrder({
      stockCode: '000001',
      price: 10,
      quantity: 100,
      side: 'hold' as any,
    });
    expect(result.valid).toBe(false);
  });
});

describe('isInRange', () => {
  it('should check range', () => {
    expect(isInRange(5, 0, 10)).toBe(true);
    expect(isInRange(0, 0, 10)).toBe(true);
    expect(isInRange(10, 0, 10)).toBe(true);
    expect(isInRange(-1, 0, 10)).toBe(false);
    expect(isInRange(11, 0, 10)).toBe(false);
    expect(isInRange(NaN, 0, 10)).toBe(false);
  });
});

describe('sanitizeStockCode', () => {
  it('should extract digits only', () => {
    expect(sanitizeStockCode('sh600519')).toBe('600519');
    expect(sanitizeStockCode('000001abc')).toBe('000001');
  });

  it('should limit to 6 digits', () => {
    expect(sanitizeStockCode('123456789')).toBe('123456');
  });
});

describe('sanitizePrice', () => {
  it('should parse valid price string', () => {
    expect(sanitizePrice('10.50')).toBe(10.50);
    expect(sanitizePrice('¥100.00')).toBe(100);
  });

  it('should return null for invalid', () => {
    expect(sanitizePrice('abc')).toBeNull();
  });

  it('should round to 2 decimals', () => {
    expect(sanitizePrice('10.555')).toBe(10.56);
  });
});

describe('sanitizeQuantity', () => {
  it('should round down to nearest 100', () => {
    expect(sanitizeQuantity('250')).toBe(200);
    expect(sanitizeQuantity('300')).toBe(300);
  });

  it('should return null for invalid', () => {
    expect(sanitizeQuantity('abc')).toBeNull();
  });
});
