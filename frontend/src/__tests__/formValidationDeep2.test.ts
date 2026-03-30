import { describe, it, expect } from 'vitest';

// 深度表单验证逻辑测试
describe('深度表单验证', () => {
  type Validator = (value: unknown) => string | null;

  const validators: Record<string, Validator> = {
    required: (v) => (v === undefined || v === null || v === '' ? '必填项' : null),
    stockCode: (v) => {
      if (typeof v !== 'string') return '必须是字符串';
      if (!/^[036]\d{5}$/.test(v)) return '股票代码格式错误';
      return null;
    },
    phone: (v) => {
      if (typeof v !== 'string') return '必须是字符串';
      if (!/^1[3-9]\d{9}$/.test(v)) return '手机号格式错误';
      return null;
    },
    email: (v) => {
      if (typeof v !== 'string') return '必须是字符串';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return '邮箱格式错误';
      return null;
    },
    positiveNumber: (v) => {
      if (typeof v !== 'number') return '必须是数字';
      if (v <= 0) return '必须大于0';
      return null;
    },
    range: (min: number, max: number): Validator => (v) => {
      if (typeof v !== 'number') return '必须是数字';
      if (v < min || v > max) return `必须在 ${min}-${max} 之间`;
      return null;
    },
    minLength: (min: number): Validator => (v) => {
      if (typeof v !== 'string') return '必须是字符串';
      if (v.length < min) return `至少 ${min} 个字符`;
      return null;
    },
    maxLength: (max: number): Validator => (v) => {
      if (typeof v !== 'string') return '必须是字符串';
      if (v.length > max) return `最多 ${max} 个字符`;
      return null;
    },
    amount: (v) => {
      if (typeof v !== 'number') return '必须是数字';
      if (v <= 0) return '金额必须大于0';
      if (v > 1e12) return '金额超出范围';
      if (!Number.isFinite(v)) return '金额无效';
      return null;
    },
    percent: (v) => {
      if (typeof v !== 'number') return '必须是数字';
      if (v < -100 || v > 100) return '百分比超出范围';
      if (!Number.isFinite(v)) return '百分比无效';
      return null;
    },
  };

  function validateForm(data: Record<string, unknown>, rules: Record<string, Validator[]>): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    for (const [field, fieldValidators] of Object.entries(rules)) {
      const fieldErrors: string[] = [];
      for (const validator of fieldValidators) {
        const error = validator(data[field]);
        if (error) fieldErrors.push(error);
      }
      if (fieldErrors.length > 0) errors[field] = fieldErrors;
    }
    return errors;
  }

  describe('必填验证', () => {
    it('undefined应该失败', () => {
      expect(validators.required(undefined)).toBe('必填项');
    });

    it('null应该失败', () => {
      expect(validators.required(null)).toBe('必填项');
    });

    it('空字符串应该失败', () => {
      expect(validators.required('')).toBe('必填项');
    });

    it('零应该通过', () => {
      expect(validators.required(0)).toBeNull();
    });

    it('false应该通过', () => {
      expect(validators.required(false)).toBeNull();
    });

    it('非空字符串应该通过', () => {
      expect(validators.required('hello')).toBeNull();
    });
  });

  describe('股票代码验证', () => {
    it('600519应该通过(沪市)', () => {
      expect(validators.stockCode('600519')).toBeNull();
    });

    it('000001应该通过(深市)', () => {
      expect(validators.stockCode('000001')).toBeNull();
    });

    it('300750应该通过(创业板)', () => {
      expect(validators.stockCode('300750')).toBeNull();
    });

    it('6位数字但首位错误应该失败', () => {
      expect(validators.stockCode('160519')).not.toBeNull();
    });

    it('5位数字应该失败', () => {
      expect(validators.stockCode('60051')).not.toBeNull();
    });

    it('7位数字应该失败', () => {
      expect(validators.stockCode('6005190')).not.toBeNull();
    });

    it('包含字母应该失败', () => {
      expect(validators.stockCode('60051A')).not.toBeNull();
    });

    it('非字符串应该失败', () => {
      expect(validators.stockCode(600519)).not.toBeNull();
    });
  });

  describe('手机号验证', () => {
    it('合法手机号应该通过', () => {
      expect(validators.phone('13800138000')).toBeNull();
    });

    it('18开头应该通过', () => {
      expect(validators.phone('18612345678')).toBeNull();
    });

    it('19开头应该通过', () => {
      expect(validators.phone('19912345678')).toBeNull();
    });

    it('12开头应该失败', () => {
      expect(validators.phone('12345678901')).not.toBeNull();
    });

    it('10位应该失败', () => {
      expect(validators.phone('1380013800')).not.toBeNull();
    });

    it('12位应该失败', () => {
      expect(validators.phone('138001380000')).not.toBeNull();
    });

    it('非字符串应该失败', () => {
      expect(validators.phone(13800138000)).not.toBeNull();
    });
  });

  describe('邮箱验证', () => {
    it('合法邮箱应该通过', () => {
      expect(validators.email('test@example.com')).toBeNull();
    });

    it('带+号应该通过', () => {
      expect(validators.email('test+tag@example.com')).toBeNull();
    });

    it('缺少@应该失败', () => {
      expect(validators.email('testexample.com')).not.toBeNull();
    });

    it('缺少域名应该失败', () => {
      expect(validators.email('test@')).not.toBeNull();
    });

    it('缺少顶级域名应该失败', () => {
      expect(validators.email('test@example')).not.toBeNull();
    });

    it('包含空格应该失败', () => {
      expect(validators.email('test @example.com')).not.toBeNull();
    });
  });

  describe('数值范围验证', () => {
    const rangeValidator = validators.range(0, 100);

    it('范围内值应该通过', () => {
      expect(rangeValidator(50)).toBeNull();
    });

    it('边界值应该通过', () => {
      expect(rangeValidator(0)).toBeNull();
      expect(rangeValidator(100)).toBeNull();
    });

    it('超出范围应该失败', () => {
      expect(rangeValidator(-1)).not.toBeNull();
      expect(rangeValidator(101)).not.toBeNull();
    });

    it('非数字应该失败', () => {
      expect(rangeValidator('50')).not.toBeNull();
    });
  });

  describe('金额验证', () => {
    it('正数金额应该通过', () => {
      expect(validators.amount(100)).toBeNull();
    });

    it('零应该失败', () => {
      expect(validators.amount(0)).not.toBeNull();
    });

    it('负数应该失败', () => {
      expect(validators.amount(-1)).not.toBeNull();
    });

    it('极大值应该失败', () => {
      expect(validators.amount(1e13)).not.toBeNull();
    });

    it('Infinity应该失败', () => {
      expect(validators.amount(Infinity)).not.toBeNull();
    });

    it('NaN应该失败', () => {
      expect(validators.amount(NaN)).not.toBeNull();
    });
  });

  describe('百分比验证', () => {
    it('范围内百分比应该通过', () => {
      expect(validators.percent(50)).toBeNull();
      expect(validators.percent(-50)).toBeNull();
    });

    it('边界值应该通过', () => {
      expect(validators.percent(100)).toBeNull();
      expect(validators.percent(-100)).toBeNull();
    });

    it('超出范围应该失败', () => {
      expect(validators.percent(101)).not.toBeNull();
      expect(validators.percent(-101)).not.toBeNull();
    });

    it('Infinity应该失败', () => {
      expect(validators.percent(Infinity)).not.toBeNull();
    });
  });

  describe('组合表单验证', () => {
    it('有效数据应该无错误', () => {
      const data = {
        code: '600519',
        name: '贵州茅台',
        price: 1800,
        quantity: 100,
      };
      const rules = {
        code: [validators.required, validators.stockCode],
        name: [validators.required, validators.minLength(2), validators.maxLength(20)],
        price: [validators.required, validators.positiveNumber],
        quantity: [validators.required, validators.positiveNumber],
      };
      const errors = validateForm(data, rules);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('无效数据应该收集所有错误', () => {
      const data = {
        code: 'invalid',
        name: '',
        price: -1,
        quantity: 'abc',
      };
      const rules = {
        code: [validators.required, validators.stockCode],
        name: [validators.required],
        price: [validators.required, validators.positiveNumber],
        quantity: [validators.required, validators.positiveNumber],
      };
      const errors = validateForm(data, rules);
      expect(Object.keys(errors).length).toBeGreaterThan(0);
      expect(errors.code).toBeDefined();
      expect(errors.name).toBeDefined();
      expect(errors.price).toBeDefined();
      expect(errors.quantity).toBeDefined();
    });

    it('单个字段多个验证器应该都执行', () => {
      const data = { name: '' };
      const rules = {
        name: [validators.required, validators.minLength(2), validators.maxLength(20)],
      };
      const errors = validateForm(data, rules);
      expect(errors.name.length).toBeGreaterThan(0);
    });

    it('应该支持链式验证', () => {
      const data = { code: '600519', name: '茅台', price: 1800 };
      const rules = {
        code: [validators.required, validators.stockCode],
        name: [validators.required, validators.minLength(1), validators.maxLength(10)],
        price: [validators.required, validators.positiveNumber, validators.range(1, 100000)],
      };
      const errors = validateForm(data, rules);
      expect(Object.keys(errors)).toHaveLength(0);
    });
  });

  // 字符串净化
  describe('输入净化', () => {
    function sanitizeInput(input: string): string {
      return input
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim();
    }

    it('正常输入应该不变', () => {
      expect(sanitizeInput('hello world')).toBe('hello world');
    });

    it('HTML标签应该被移除', () => {
      expect(sanitizeInput('hello<script>world')).toBe('helloscriptworld');
    });

    it('javascript:协议应该被移除', () => {
      expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
    });

    it('事件处理器应该被移除', () => {
      expect(sanitizeInput('onclick=alert(1)')).toBe('alert(1)');
    });

    it('首尾空格应该被移除', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
    });
  });
});
