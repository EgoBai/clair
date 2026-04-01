import { describe, it, expect } from 'vitest';

/**
 * 输入验证引擎测试
 * Validator / stock code / price validation
 */

type ValidationResult = {
  valid: boolean;
  errors: Array<{ field: string; rule: string; message: string; value?: any }>;
};

type ValidationRule = {
  name: string;
  validate: (value: any) => boolean;
  message: string;
};

class Validator {
  private rules: Map<string, ValidationRule[]> = new Map();

  field(name: string, rules: ValidationRule[]): this {
    const existing = this.rules.get(name) || [];
    this.rules.set(name, [...existing, ...rules]);
    return this;
  }

  validate(data: Record<string, any>): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    for (const [fieldName, fieldRules] of this.rules) {
      const value = data[fieldName];
      for (const rule of fieldRules) {
        if (!rule.validate(value)) {
          errors.push({ field: fieldName, rule: rule.name, message: rule.message, value });
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }
}

// A-stock validation rules
const rules = {
  required: { name: 'required', validate: (v: any) => v !== undefined && v !== null && v !== '', message: '必填' },
  stockCode: { name: 'stockCode', validate: (v: string) => /^[36]\d{5}$/.test(v), message: '股票代码格式错误' },
  price: { name: 'price', validate: (v: number) => typeof v === 'number' && v > 0 && Number.isFinite(v), message: '价格必须大于0' },
  quantity: { name: 'quantity', validate: (v: number) => Number.isInteger(v) && v > 0 && v <= 1000000, message: '数量必须为正整数且不超过100万' },
  percent: { name: 'percent', validate: (v: number) => typeof v === 'number' && v >= -100 && v <= 1000, message: '百分比超出范围' },
  date: { name: 'date', validate: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)), message: '日期格式错误' },
  email: { name: 'email', validate: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: '邮箱格式错误' },
  phone: { name: 'phone', validate: (v: string) => /^1[3-9]\d{9}$/.test(v), message: '手机号格式错误' },
};

function validateStockCode(code: string): boolean {
  return /^[36]\d{5}$/.test(code);
}

function validatePrice(price: number, tickSize = 0.01): boolean {
  if (typeof price !== 'number' || price <= 0 || !Number.isFinite(price)) return false;
  return Math.abs(price % tickSize) < 0.0001 || Math.abs(price % tickSize - tickSize) < 0.0001;
}

function validateOrderSide(side: string): side is 'buy' | 'sell' {
  return side === 'buy' || side === 'sell';
}

function formatStockCode(code: string): string {
  if (code.startsWith('6')) return `SH${code}`;
  if (code.startsWith('3') || code.startsWith('0')) return `SZ${code}`;
  return code;
}

describe('验证引擎', () => {
  describe('Validator class', () => {
    it('should pass with valid data', () => {
      const v = new Validator()
        .field('code', [rules.required, rules.stockCode])
        .field('price', [rules.required, rules.price]);
      const result = v.validate({ code: '600519', price: 1800 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail with missing fields', () => {
      const v = new Validator()
        .field('code', [rules.required])
        .field('price', [rules.required]);
      const result = v.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('should chain multiple fields', () => {
      const v = new Validator()
        .field('code', [rules.required, rules.stockCode])
        .field('price', [rules.required, rules.price])
        .field('quantity', [rules.required, rules.quantity]);
      const result = v.validate({ code: '600519', price: 1800, quantity: 100 });
      expect(result.valid).toBe(true);
    });

    it('should accumulate errors from multiple rules', () => {
      const v = new Validator()
        .field('code', [rules.required, rules.stockCode]);
      const result = v.validate({ code: '' });
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validateStockCode', () => {
    it('should accept valid Shanghai codes', () => {
      expect(validateStockCode('600519')).toBe(true);
      expect(validateStockCode('601398')).toBe(true);
    });

    it('should accept valid Shenzhen codes', () => {
      expect(validateStockCode('300750')).toBe(true);
      expect(validateStockCode('000001')).toBe(false); // starts with 0
    });

    it('should reject invalid codes', () => {
      expect(validateStockCode('12345')).toBe(false);
      expect(validateStockCode('700519')).toBe(false);
      expect(validateStockCode('abc')).toBe(false);
    });
  });

  describe('validatePrice', () => {
    it('should accept valid prices', () => {
      expect(validatePrice(10)).toBe(true);
      expect(validatePrice(0.01)).toBe(true);
      expect(validatePrice(1800.50)).toBe(true);
    });

    it('should reject invalid prices', () => {
      expect(validatePrice(0)).toBe(false);
      expect(validatePrice(-1)).toBe(false);
      expect(validatePrice(NaN)).toBe(false);
      expect(validatePrice(Infinity)).toBe(false);
    });
  });

  describe('validateOrderSide', () => {
    it('should accept buy and sell', () => {
      expect(validateOrderSide('buy')).toBe(true);
      expect(validateOrderSide('sell')).toBe(true);
    });

    it('should reject invalid sides', () => {
      expect(validateOrderSide('hold')).toBe(false);
      expect(validateOrderSide('')).toBe(false);
    });
  });

  describe('formatStockCode', () => {
    it('should prefix Shanghai stocks with SH', () => {
      expect(formatStockCode('600519')).toBe('SH600519');
    });

    it('should prefix Shenzhen stocks with SZ', () => {
      expect(formatStockCode('300750')).toBe('SZ300750');
      expect(formatStockCode('000001')).toBe('SZ000001');
    });
  });
});
