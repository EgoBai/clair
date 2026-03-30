import { describe, it, expect } from 'vitest';

describe('表单验证引擎', () => {
  type Rule = { type: string; message: string; min?: number; max?: number; pattern?: RegExp; };
  type ValidationResult = { valid: boolean; errors: string[]; };

  function validate(value: any, rules: Rule[]): ValidationResult {
    const errors: string[] = [];
    for (const rule of rules) {
      switch (rule.type) {
        case 'required':
          if (value === undefined || value === null || value === '') errors.push(rule.message);
          break;
        case 'minLength':
          if (typeof value === 'string' && value.length < (rule.min || 0)) errors.push(rule.message);
          break;
        case 'maxLength':
          if (typeof value === 'string' && value.length > (rule.max || Infinity)) errors.push(rule.message);
          break;
        case 'pattern':
          if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) errors.push(rule.message);
          break;
        case 'min':
          if (typeof value === 'number' && value < (rule.min ?? -Infinity)) errors.push(rule.message);
          break;
        case 'max':
          if (typeof value === 'number' && value > (rule.max ?? Infinity)) errors.push(rule.message);
          break;
        case 'email':
          if (typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(rule.message);
          break;
        case 'stockCode':
          if (typeof value === 'string' && !/^[036]\d{5}$/.test(value)) errors.push(rule.message);
          break;
        case 'phone':
          if (typeof value === 'string' && !/^1[3-9]\d{9}$/.test(value)) errors.push(rule.message);
          break;
        case 'numeric':
          if (isNaN(Number(value))) errors.push(rule.message);
          break;
      }
    }
    return { valid: errors.length === 0, errors };
  }
  function validateForm(data: Record<string, any>, schema: Record<string, Rule[]>): Record<string, ValidationResult> {
    const results: Record<string, ValidationResult> = {};
    for (const [field, rules] of Object.entries(schema)) {
      results[field] = validate(data[field], rules);
    }
    return results;
  }
  function isFormValid(results: Record<string, ValidationResult>): boolean {
    return Object.values(results).every(r => r.valid);
  }
  function getPasswordStrength(pw: string): number {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pw)) score++;
    return Math.min(score, 5);
  }
  function sanitizeInput(input: string): string {
    return input.replace(/[<>]/g, '').trim();
  }

  const requiredRule: Rule = { type: 'required', message: '必填' };
  const emailRule: Rule = { type: 'email', message: '邮箱格式错误' };
  const stockCodeRule: Rule = { type: 'stockCode', message: '股票代码格式错误' };

  it('必填 - 空值', () => {
    expect(validate('', [requiredRule]).valid).toBe(false);
  });

  it('必填 - null', () => {
    expect(validate(null, [requiredRule]).valid).toBe(false);
  });

  it('必填 - undefined', () => {
    expect(validate(undefined, [requiredRule]).valid).toBe(false);
  });

  it('必填 - 有效值', () => {
    expect(validate('test', [requiredRule]).valid).toBe(true);
  });

  it('最小长度', () => {
    const r = validate('ab', [{ type: 'minLength', min: 3, message: '至少3字符' }]);
    expect(r.valid).toBe(false);
  });

  it('最大长度', () => {
    const r = validate('abcdef', [{ type: 'maxLength', max: 3, message: '最多3字符' }]);
    expect(r.valid).toBe(false);
  });

  it('正则匹配', () => {
    const r = validate('abc123', [{ type: 'pattern', pattern: /^[a-z]+$/, message: '仅字母' }]);
    expect(r.valid).toBe(false);
  });

  it('邮箱验证 - 有效', () => {
    expect(validate('test@example.com', [emailRule]).valid).toBe(true);
  });

  it('邮箱验证 - 无效', () => {
    expect(validate('not-an-email', [emailRule]).valid).toBe(false);
  });

  it('股票代码 - 有效上海', () => {
    expect(validate('600519', [stockCodeRule]).valid).toBe(true);
  });

  it('股票代码 - 有效深圳', () => {
    expect(validate('000858', [stockCodeRule]).valid).toBe(true);
  });

  it('股票代码 - 无效', () => {
    expect(validate('999999', [stockCodeRule]).valid).toBe(false);
  });

  it('手机号验证 - 有效', () => {
    expect(validate('13800138000', [{ type: 'phone', message: '手机号错误' }]).valid).toBe(true);
  });

  it('手机号验证 - 无效', () => {
    expect(validate('12345678901', [{ type: 'phone', message: '手机号错误' }]).valid).toBe(false);
  });

  it('数值范围 - 小于最小值', () => {
    const r = validate(5, [{ type: 'min', min: 10, message: '最小10' }]);
    expect(r.valid).toBe(false);
  });

  it('数值范围 - 大于最大值', () => {
    const r = validate(100, [{ type: 'max', max: 50, message: '最大50' }]);
    expect(r.valid).toBe(false);
  });

  it('数值验证', () => {
    expect(validate('abc', [{ type: 'numeric', message: '非数字' }]).valid).toBe(false);
    expect(validate('123', [{ type: 'numeric', message: '非数字' }]).valid).toBe(true);
  });

  it('表单验证 - 多字段', () => {
    const schema = { name: [requiredRule], email: [requiredRule, emailRule] };
    const results = validateForm({ name: 'test', email: 'bad' }, schema);
    expect(results.name.valid).toBe(true);
    expect(results.email.valid).toBe(false);
  });

  it('表单整体有效性', () => {
    const results = { name: { valid: true, errors: [] }, email: { valid: false, errors: ['err'] } };
    expect(isFormValid(results)).toBe(false);
  });

  it('密码强度 - 弱', () => {
    expect(getPasswordStrength('abc')).toBeLessThanOrEqual(1);
  });

  it('密码强度 - 强', () => {
    expect(getPasswordStrength('MyP@ss12345!')).toBeGreaterThanOrEqual(4);
  });

  it('密码强度 - 空', () => {
    expect(getPasswordStrength('')).toBe(0);
  });

  it('输入清理', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('输入清理 - trim', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('多规则组合', () => {
    const rules: Rule[] = [requiredRule, { type: 'minLength', min: 3, message: '短' }, emailRule];
    expect(validate('a@b', rules).valid).toBe(false); // email不合法
    expect(validate('test@example.com', rules).valid).toBe(true);
  });

  it('多错误收集', () => {
    const rules: Rule[] = [requiredRule, { type: 'minLength', min: 10, message: '太短' }];
    const r = validate('ab', rules);
    expect(r.errors).toHaveLength(1); // 只有minLength失败
  });
});
