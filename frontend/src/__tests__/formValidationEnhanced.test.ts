import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent } from '../utils/bloombergExportEngine';
import { debounce, throttle } from '../utils/debounceThrottle';
import { maskPhone, maskIDCard, maskBankCard } from '../utils/securityEngine';
import { sanitizeStockCode } from '../utils/validation';

// ===== 影子测试迁移：增强表单校验 + 货币/百分比格式化 =====
// 绑定真源（生产实现）：
// - formatCurrency    → frontend/src/utils/bloombergExportEngine.ts:129（符号表 ¥/$/€/£/¥ + CNY 万亿/亿/万压缩 + null/NaN → '-'）
// - formatPercent     → frontend/src/utils/bloombergExportEngine.ts:122（入参为比率，内部 ×100）
// - debounce          → frontend/src/utils/debounceThrottle.ts:6
// - throttle          → frontend/src/utils/debounceThrottle.ts:141
// - maskPhone         → frontend/src/utils/securityEngine.ts:291
// - maskIDCard        → frontend/src/utils/securityEngine.ts:315
// - maskBankCard      → frontend/src/utils/securityEngine.ts:323
// - sanitizeStockCode → frontend/src/utils/validation.ts:118
//
// 三套货币/百分比口径的选择（按测试意图取 bloombergExportEngine）：
// - formatters.ts:99 formatCurrency 走 Intl.NumberFormat('zh-CN')：1000 → '¥1,000.00'（千分位、无万/亿压缩），与用例不符。
// - exportEngine.ts:96 formatCurrency 仅 CNY 压缩：非 CNY 返回 'USD 1000.00'（无 $ 符号），与 USD/EUR 用例不符。
// - bloombergExportEngine.ts:129 同时满足货币符号与万/亿压缩，故选用。
// - formatPercent：三处生产实现（formatters.ts:60 / exportEngine.ts:86 / bloombergExportEngine.ts:122）均按比率 ×100，
//   自抄实现把入参当百分数并加 '+' 号；绑定后统一换算入参。
//
// 旧断言订正（旧值 → 生产值 + file:line）：
// - formatPercent(5.2) '+5.20%' → formatPercent(0.052) '5.20%'（生产无 '+' 号且入参是比率；bloombergExportEngine.ts:122-127）
// - formatPercent(0) '+0.00%' → formatPercent(0) '0.00%'（无 '+' 号）
// - formatPercent(-3.1) '-3.10%' → formatPercent(-0.031) '-3.10%'（仅入参换算，输出一致）
// - formatPercent(5.123, 3) '+5.123%' → formatPercent(0.05123, 3) '5.123%'（无 '+' 号）
// - maskInput('6222021234567890', 'bank') '6222 **** **** 7890' → maskBankCard('6222021234567890') '************7890'
//   （securityEngine.ts:323-326 仅保留后四位，不复用前四位）
// - formatCurrency 4 条、maskPhone、maskIDCard、sanitizeStockCode、debounce/throttle 断言与生产一致，未改写。
//
// 未迁移·生产缺口（保留内联 helper）：
// - validateField / validateForm：生产无同契约规则引擎导出；securityEngine.validateEmail/validatePhone/validateStockCode
//   返回 ValidationResult，且 validateStockCode 接受任意 6 位数字（'999999' 合法），与本文件「市场前缀 + 6 位」口径不同，内联保留。
// - parseNumberInput：frontend/backend/shared 均无「万/亿/万亿后缀 + 货币符号」解析导出，内联保留。
// - inputConstraints：生产无 number/integer/alpha/alphanumeric/chinese 逐字符过滤导出，内联保留。

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

    it('should return dash for null/undefined', () => {
      expect(formatCurrency(null)).toBe('-');
      expect(formatCurrency(undefined)).toBe('-');
    });
  });

  describe('Percent Formatting', () => {
    it('should format positive ratio without plus sign', () => {
      expect(formatPercent(0.052)).toBe('5.20%');
      expect(formatPercent(0)).toBe('0.00%');
    });

    it('should keep - sign for negative', () => {
      expect(formatPercent(-0.031)).toBe('-3.10%');
    });

    it('should respect decimals', () => {
      expect(formatPercent(0.05123, 3)).toBe('5.123%');
    });

    it('should return dash for null/undefined', () => {
      expect(formatPercent(null)).toBe('-');
      expect(formatPercent(undefined)).toBe('-');
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
      expect(maskPhone('13800138000')).toBe('138****8000');
    });

    it('should mask ID', () => {
      expect(maskIDCard('110101199001011234')).toBe('1101**********1234');
    });

    it('should mask bank card', () => {
      expect(maskBankCard('6222021234567890')).toBe('************7890');
    });
  });

  describe('Stock Code Auto-Correct', () => {
    it('should strip non-numeric', () => {
      expect(sanitizeStockCode('sh600000')).toBe('600000');
    });

    it('should truncate to 6 digits', () => {
      expect(sanitizeStockCode('600000123')).toBe('600000');
    });

    it('should handle empty', () => {
      expect(sanitizeStockCode('')).toBe('');
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
