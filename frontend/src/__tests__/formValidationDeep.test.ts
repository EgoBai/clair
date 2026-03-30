import { describe, it, expect } from 'vitest';

// Form validation logic tests
describe('Form Validation Logic', () => {
  // Field validators
  describe('Field Validators', () => {
    type Validator = (value: string) => string | null;

    const required: Validator = (v) => v.trim() ? null : '此字段为必填';
    const minLength = (min: number): Validator => (v) => v.length >= min ? null : `至少${min}个字符`;
    const maxLength = (max: number): Validator => (v) => v.length <= max ? null : `最多${max}个字符`;
    const pattern = (regex: RegExp, msg: string): Validator => (v) => regex.test(v) ? null : msg;
    const stockCode: Validator = pattern(/^[036]\d{5}$/, '请输入正确的股票代码');
    const email: Validator = pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '请输入正确的邮箱');
    const number = (min?: number, max?: number): Validator => (v) => {
      const n = parseFloat(v);
      if (isNaN(n)) return '请输入数字';
      if (min !== undefined && n < min) return `不能小于${min}`;
      if (max !== undefined && n > max) return `不能大于${max}`;
      return null;
    };

    it('should validate required', () => {
      expect(required('hello')).toBeNull();
      expect(required('')).toBe('此字段为必填');
      expect(required('  ')).toBe('此字段为必填');
    });

    it('should validate minLength', () => {
      const v = minLength(3);
      expect(v('abc')).toBeNull();
      expect(v('ab')).toBe('至少3个字符');
    });

    it('should validate maxLength', () => {
      const v = maxLength(5);
      expect(v('hello')).toBeNull();
      expect(v('hello!')).toBe('最多5个字符');
    });

    it('should validate stock code', () => {
      expect(stockCode('600519')).toBeNull();
      expect(stockCode('000001')).toBeNull();
      expect(stockCode('300750')).toBeNull();
      expect(stockCode('999999')).toBe('请输入正确的股票代码');
      expect(stockCode('abc')).toBe('请输入正确的股票代码');
    });

    it('should validate email', () => {
      expect(email('test@example.com')).toBeNull();
      expect(email('invalid')).toBe('请输入正确的邮箱');
      expect(email('@example.com')).toBe('请输入正确的邮箱');
    });

    it('should validate number range', () => {
      const v = number(0, 100);
      expect(v('50')).toBeNull();
      expect(v('-1')).toBe('不能小于0');
      expect(v('101')).toBe('不能大于100');
      expect(v('abc')).toBe('请输入数字');
    });
  });

  // Form validation
  describe('Form Validation', () => {
    type FieldConfig = {
      name: string;
      validators: ((v: string) => string | null)[];
    };

    function validateForm(data: Record<string, string>, fields: FieldConfig[]): Record<string, string[]> {
      const errors: Record<string, string[]> = {};
      for (const field of fields) {
        const value = data[field.name] || '';
        const fieldErrors = field.validators
          .map(v => v(value))
          .filter((e): e is string => e !== null);
        if (fieldErrors.length > 0) errors[field.name] = fieldErrors;
      }
      return errors;
    }

    const fields: FieldConfig[] = [
      { name: 'code', validators: [(v) => v ? null : '必填', (v) => /^[036]\d{5}$/.test(v) ? null : '格式错误'] },
      { name: 'price', validators: [(v) => v ? null : '必填', (v) => !isNaN(parseFloat(v)) ? null : '数字'] },
    ];

    it('should return no errors for valid form', () => {
      const errors = validateForm({ code: '600519', price: '100' }, fields);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('should return errors for invalid form', () => {
      const errors = validateForm({ code: '', price: 'abc' }, fields);
      expect(errors.code).toBeDefined();
      expect(errors.price).toBeDefined();
    });

    it('should return multiple errors per field', () => {
      const config: FieldConfig[] = [
        { name: 'x', validators: [
          (v) => v ? null : '必填',
          (v) => v.length > 2 ? null : '太短',
        ] },
      ];
      const errors = validateForm({ x: '' }, config);
      expect(errors.x).toHaveLength(2);
    });

    it('should handle missing fields', () => {
      const errors = validateForm({}, fields);
      expect(errors.code).toBeDefined();
      expect(errors.price).toBeDefined();
    });
  });

  // Password strength
  describe('Password Strength', () => {
    function passwordStrength(pw: string): { score: number; label: string } {
      let score = 0;
      if (pw.length >= 8) score++;
      if (pw.length >= 12) score++;
      if (/[a-z]/.test(pw)) score++;
      if (/[A-Z]/.test(pw)) score++;
      if (/\d/.test(pw)) score++;
      if (/[^a-zA-Z0-9]/.test(pw)) score++;

      const labels = ['很弱', '弱', '一般', '强', '很强'];
      return { score, label: labels[Math.min(Math.floor(score / 1.5), 4)] };
    }

    it('should score weak password low', () => {
      const result = passwordStrength('123');
      expect(result.score).toBeLessThanOrEqual(2);
    });

    it('should score strong password high', () => {
      const result = passwordStrength('MyP@ssw0rd!2024');
      expect(result.score).toBeGreaterThanOrEqual(5);
    });

    it('should handle empty password', () => {
      const result = passwordStrength('');
      expect(result.score).toBe(0);
    });

    it('should detect special characters', () => {
      const withSpecial = passwordStrength('abc!123');
      const without = passwordStrength('abc123');
      expect(withSpecial.score).toBeGreaterThan(without.score);
    });
  });
});
