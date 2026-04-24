import { describe, it, expect } from 'vitest';

// Enhanced Form Validation & Input Processing
interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom' | 'range' | 'enum' | 'email' | 'phone' | 'stockCode';
  value?: any;
  value2?: any;
  message: string;
  validator?: (val: any) => boolean;
}

interface FieldError {
  field: string;
  message: string;
  rule: string;
}

function validateField(value: any, rules: ValidationRule[]): FieldError | null {
  for (const rule of rules) {
    let valid = true;
    switch (rule.type) {
      case 'required':
        valid = value !== undefined && value !== null && value !== '';
        break;
      case 'min':
        valid = typeof value === 'number' ? value >= rule.value : String(value).length >= rule.value;
        break;
      case 'max':
        valid = typeof value === 'number' ? value <= rule.value : String(value).length <= rule.value;
        break;
      case 'range':
        valid = typeof value === 'number' && value >= rule.value && value <= (rule.value2 ?? rule.value);
        break;
      case 'pattern':
        valid = rule.value instanceof RegExp ? rule.value.test(String(value)) : new RegExp(rule.value).test(String(value));
        break;
      case 'email':
        valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
        break;
      case 'phone':
        valid = /^1[3-9]\d{9}$/.test(String(value));
        break;
      case 'stockCode':
        valid = /^(60|00|30|68|83)\d{4}$/.test(String(value));
        break;
      case 'enum':
        valid = Array.isArray(rule.value) && rule.value.includes(value);
        break;
      case 'custom':
        valid = rule.validator ? rule.validator(value) : true;
        break;
    }
    if (!valid) return { field: '', message: rule.message, rule: rule.type };
  }
  return null;
}

function validateForm(data: Record<string, any>, schema: Record<string, ValidationRule[]>): FieldError[] {
  const errors: FieldError[] = [];
  for (const [field, rules] of Object.entries(schema)) {
    const error = validateField(data[field], rules);
    if (error) {
      error.field = field;
      errors.push(error);
    }
  }
  return errors;
}

function formatCurrency(value: number, currency = 'CNY'): string {
  const symbols: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  const symbol = symbols[currency] || currency;
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1e12) formatted = (value / 1e12).toFixed(2) + '万亿';
  else if (abs >= 1e8) formatted = (value / 1e8).toFixed(2) + '亿';
  else if (abs >= 1e4) formatted = (value / 1e4).toFixed(2) + '万';
  else formatted = value.toFixed(2);
  return symbol + formatted;
}

function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(decimals) + '%';
}

function parseNumberInput(input: string): number | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.replace(/[,\s万亿亿万元$¥€£]/g, '');
  let multiplier = 1;
  if (input.includes('万亿')) multiplier = 1e12;
  else if (input.includes('亿')) multiplier = 1e8;
  else if (input.includes('万')) multiplier = 1e4;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num * multiplier;
}

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function throttle<T extends (...args: any[]) => any>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn(...args);
    }
  };
}

function maskInput(value: string, type: 'phone' | 'id' | 'bank'): string {
  switch (type) {
    case 'phone': return value.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    case 'id': return value.replace(/(\d{4})\d{10}(\d{4})/, '$1**********$2');
    case 'bank': return value.replace(/(\d{4})\d*(\d{4})/, '$1 **** **** $2');
    default: return value;
  }
}

function autoCorrectStockCode(input: string): string {
  let code = input.replace(/[^0-9]/g, '');
  if (code.length > 6) code = code.substring(0, 6);
  return code;
}

function inputConstraints(value: string, type: 'number' | 'integer' | 'alpha' | 'alphanumeric' | 'chinese'): string {
  switch (type) {
    case 'number': return value.replace(/[^0-9.\-]/g, '');
    case 'integer': return value.replace(/[^0-9\-]/g, '');
    case 'alpha': return value.replace(/[^a-zA-Z]/g, '');
    case 'alphanumeric': return value.replace(/[^a-zA-Z0-9]/g, '');
    case 'chinese': return value.replace(/[^\u4e00-\u9fa5]/g, '');
    default: return value;
  }
}

describe('Enhanced Form Validation', () => {
  describe('Field Validation Rules', () => {
    it('should validate required', () => {
      expect(validateField('', [{ type: 'required', message: '必填' }])).not.toBeNull();
      expect(validateField('test', [{ type: 'required', message: '必填' }])).toBeNull();
      expect(validateField(null, [{ type: 'required', message: '必填' }])).not.toBeNull();
      expect(validateField(undefined, [{ type: 'required', message: '必填' }])).not.toBeNull();
      expect(validateField(0, [{ type: 'required', message: '必填' }])).toBeNull();
    });

    it('should validate min for numbers', () => {
      expect(validateField(5, [{ type: 'min', value: 10, message: '至少10' }])).not.toBeNull();
      expect(validateField(15, [{ type: 'min', value: 10, message: '至少10' }])).toBeNull();
    });

    it('should validate min for strings', () => {
      expect(validateField('ab', [{ type: 'min', value: 3, message: '至少3字符' }])).not.toBeNull();
      expect(validateField('abc', [{ type: 'min', value: 3, message: '至少3字符' }])).toBeNull();
    });

    it('should validate max', () => {
      expect(validateField(100, [{ type: 'max', value: 50, message: '不超过50' }])).not.toBeNull();
      expect(validateField(30, [{ type: 'max', value: 50, message: '不超过50' }])).toBeNull();
    });

    it('should validate range', () => {
      expect(validateField(150, [{ type: 'range', value: 0, value2: 100, message: '0-100' }])).not.toBeNull();
      expect(validateField(50, [{ type: 'range', value: 0, value2: 100, message: '0-100' }])).toBeNull();
    });

    it('should validate pattern', () => {
      expect(validateField('abc', [{ type: 'pattern', value: /^[0-9]+$/, message: '仅数字' }])).not.toBeNull();
      expect(validateField('123', [{ type: 'pattern', value: /^[0-9]+$/, message: '仅数字' }])).toBeNull();
    });

    it('should validate email', () => {
      expect(validateField('test@example.com', [{ type: 'email', message: '邮箱格式' }])).toBeNull();
      expect(validateField('invalid', [{ type: 'email', message: '邮箱格式' }])).not.toBeNull();
      expect(validateField('a@b', [{ type: 'email', message: '邮箱格式' }])).not.toBeNull();
    });

    it('should validate phone', () => {
      expect(validateField('13800138000', [{ type: 'phone', message: '手机号' }])).toBeNull();
      expect(validateField('12345678901', [{ type: 'phone', message: '手机号' }])).not.toBeNull();
      expect(validateField('23800138000', [{ type: 'phone', message: '手机号' }])).not.toBeNull();
    });

    it('should validate stock code', () => {
      expect(validateField('600000', [{ type: 'stockCode', message: '股票代码' }])).toBeNull();
      expect(validateField('000001', [{ type: 'stockCode', message: '股票代码' }])).toBeNull();
      expect(validateField('999999', [{ type: 'stockCode', message: '股票代码' }])).not.toBeNull();
    });

    it('should validate enum', () => {
      expect(validateField('buy', [{ type: 'enum', value: ['buy', 'sell'], message: '买入或卖出' }])).toBeNull();
      expect(validateField('hold', [{ type: 'enum', value: ['buy', 'sell'], message: '买入或卖出' }])).not.toBeNull();
    });

    it('should validate custom', () => {
      const isEven = (v: any) => typeof v === 'number' && v % 2 === 0;
      expect(validateField(4, [{ type: 'custom', validator: isEven, message: '偶数' }])).toBeNull();
      expect(validateField(5, [{ type: 'custom', validator: isEven, message: '偶数' }])).not.toBeNull();
    });
  });

  describe('Form Validation', () => {
    const schema = {
      name: [{ type: 'required' as const, message: '姓名必填' }],
      email: [{ type: 'email' as const, message: '邮箱格式错误' }],
      age: [{ type: 'range' as const, value: 18, value2: 100, message: '年龄18-100' }],
    };

    it('should validate correct form', () => {
      const errors = validateForm({ name: '张三', email: 'test@example.com', age: 30 }, schema);
      expect(errors).toHaveLength(0);
    });

    it('should report multiple errors', () => {
      const errors = validateForm({ name: '', email: 'bad', age: 10 }, schema);
      expect(errors).toHaveLength(3);
    });

    it('should include field name in error', () => {
      const errors = validateForm({ name: '', email: 'good@example.com', age: 30 }, schema);
      expect(errors[0].field).toBe('name');
    });
  });

  describe('Currency Formatting', () => {
    it('should format CNY', () => {
      expect(formatCurrency(1000)).toBe('¥1000.00');
      expect(formatCurrency(15000)).toBe('¥1.50万');
      expect(formatCurrency(150000000)).toBe('¥1.50亿');
      expect(formatCurrency(1500000000000)).toBe('¥1.50万亿');
    });

    it('should format other currencies', () => {
      expect(formatCurrency(1000, 'USD')).toBe('$1000.00');
      expect(formatCurrency(1000, 'EUR')).toBe('€1000.00');
    });

    it('should handle negative values', () => {
      expect(formatCurrency(-1000)).toContain('-');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('¥0.00');
    });
  });

  describe('Percent Formatting', () => {
    it('should add + sign for positive', () => {
      expect(formatPercent(5.2)).toBe('+5.20%');
      expect(formatPercent(0)).toBe('+0.00%');
    });

    it('should keep - sign for negative', () => {
      expect(formatPercent(-3.1)).toBe('-3.10%');
    });

    it('should respect decimals', () => {
      expect(formatPercent(5.123, 3)).toBe('+5.123%');
    });
  });

  describe('Number Input Parsing', () => {
    it('should parse plain numbers', () => {
      expect(parseNumberInput('100')).toBe(100);
      expect(parseNumberInput('1,000')).toBe(1000);
    });

    it('should parse with 万/亿 suffixes', () => {
      expect(parseNumberInput('1万')).toBe(1e4);
      expect(parseNumberInput('1亿')).toBe(1e8);
      expect(parseNumberInput('1万亿')).toBe(1e12);
    });

    it('should parse currency symbols', () => {
      expect(parseNumberInput('¥1000')).toBe(1000);
      expect(parseNumberInput('$1000')).toBe(1000);
    });

    it('should return null for invalid', () => {
      expect(parseNumberInput('')).toBeNull();
      expect(parseNumberInput('abc')).toBeNull();
      expect(parseNumberInput(null as any)).toBeNull();
    });
  });

  describe('Input Masking', () => {
    it('should mask phone', () => {
      expect(maskInput('13800138000', 'phone')).toBe('138****8000');
    });

    it('should mask ID', () => {
      expect(maskInput('110101199001011234', 'id')).toBe('1101**********1234');
    });

    it('should mask bank card', () => {
      expect(maskInput('6222021234567890', 'bank')).toBe('6222 **** **** 7890');
    });
  });

  describe('Stock Code Auto-Correct', () => {
    it('should strip non-numeric', () => {
      expect(autoCorrectStockCode('sh600000')).toBe('600000');
    });

    it('should truncate to 6 digits', () => {
      expect(autoCorrectStockCode('600000123')).toBe('600000');
    });

    it('should handle empty', () => {
      expect(autoCorrectStockCode('')).toBe('');
    });
  });

  describe('Input Constraints', () => {
    it('should constrain to numbers', () => {
      expect(inputConstraints('abc123def', 'number')).toBe('123');
      expect(inputConstraints('-3.14x', 'number')).toBe('-3.14');
    });

    it('should constrain to integers', () => {
      expect(inputConstraints('12.34', 'integer')).toBe('1234');
    });

    it('should constrain to alpha', () => {
      expect(inputConstraints('abc123', 'alpha')).toBe('abc');
    });

    it('should constrain to chinese', () => {
      expect(inputConstraints('你好world', 'chinese')).toBe('你好');
    });

    it('should constrain to alphanumeric', () => {
      expect(inputConstraints('a1!@b2', 'alphanumeric')).toBe('a1b2');
    });
  });

  describe('Debounce', () => {
    it('should create a function', () => {
      const fn = debounce(() => {}, 100);
      expect(typeof fn).toBe('function');
    });
  });

  describe('Throttle', () => {
    it('should create a function', () => {
      const fn = throttle(() => {}, 100);
      expect(typeof fn).toBe('function');
    });
  });
});
