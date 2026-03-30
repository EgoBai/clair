import { describe, it, expect } from 'vitest';

// Form Validation Logic
interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'range' | 'custom' | 'email' | 'stockCode' | 'phone';
  value?: unknown;
  message: string;
  validator?: (val: unknown) => boolean;
}

interface FieldValidationResult {
  valid: boolean;
  errors: string[];
}

function validateField(value: unknown, rules: ValidationRule[]): FieldValidationResult {
  const errors: string[] = [];

  for (const rule of rules) {
    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          errors.push(rule.message);
        }
        break;
      case 'minLength':
        if (typeof value === 'string' && value.length < (rule.value as number)) {
          errors.push(rule.message);
        }
        break;
      case 'maxLength':
        if (typeof value === 'string' && value.length > (rule.value as number)) {
          errors.push(rule.message);
        }
        break;
      case 'pattern':
        if (typeof value === 'string' && !(rule.value as RegExp).test(value)) {
          errors.push(rule.message);
        }
        break;
      case 'range': {
        const [min, max] = rule.value as [number, number];
        const num = Number(value);
        if (!isNaN(num) && (num < min || num > max)) {
          errors.push(rule.message);
        }
        break;
      }
      case 'email':
        if (typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push(rule.message);
        }
        break;
      case 'stockCode':
        if (typeof value === 'string' && !/^[36]\d{5}$/.test(value)) {
          errors.push(rule.message);
        }
        break;
      case 'phone':
        if (typeof value === 'string' && !/^1[3-9]\d{9}$/.test(value)) {
          errors.push(rule.message);
        }
        break;
      case 'custom':
        if (rule.validator && !rule.validator(value)) {
          errors.push(rule.message);
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateForm(data: Record<string, unknown>, schema: Record<string, ValidationRule[]>): {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
} {
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, rules] of Object.entries(schema)) {
    const result = validateField(data[field], rules);
    if (!result.valid) {
      fieldErrors[field] = result.errors;
    }
  }
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}

function getPasswordStrength(password: string): {
  score: number;
  level: 'weak' | 'fair' | 'medium' | 'strong' | 'very-strong';
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('至少8个字符');

  if (password.length >= 12) score += 1;

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('需要小写字母');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('需要大写字母');

  if (/\d/.test(password)) score += 1;
  else feedback.push('需要数字');

  if (/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) score += 1;
  else feedback.push('需要特殊字符');

  const levels: Array<'weak' | 'fair' | 'medium' | 'strong' | 'very-strong'> = ['weak', 'fair', 'medium', 'strong', 'very-strong'];
  const levelIndex = Math.min(Math.floor(score / 1.2), 4);

  return { score, level: levels[levelIndex], feedback };
}

function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function formatValidationErrors(errors: Record<string, string[]>): string {
  return Object.entries(errors)
    .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
    .join('\n');
}

describe('Form Validation Logic', () => {
  describe('validateField', () => {
    it('should pass required when value present', () => {
      const result = validateField('test', [{ type: 'required', message: 'required' }]);
      expect(result.valid).toBe(true);
    });

    it('should fail required when empty', () => {
      const result = validateField('', [{ type: 'required', message: 'required' }]);
      expect(result.valid).toBe(false);
    });

    it('should fail required when null', () => {
      const result = validateField(null, [{ type: 'required', message: 'required' }]);
      expect(result.valid).toBe(false);
    });

    it('should validate minLength', () => {
      expect(validateField('ab', [{ type: 'minLength', value: 3, message: 'too short' }]).valid).toBe(false);
      expect(validateField('abc', [{ type: 'minLength', value: 3, message: 'too short' }]).valid).toBe(true);
    });

    it('should validate maxLength', () => {
      expect(validateField('abcd', [{ type: 'maxLength', value: 3, message: 'too long' }]).valid).toBe(false);
      expect(validateField('abc', [{ type: 'maxLength', value: 3, message: 'too long' }]).valid).toBe(true);
    });

    it('should validate pattern', () => {
      const rules: ValidationRule[] = [{ type: 'pattern', value: /^\d+$/, message: 'digits only' }];
      expect(validateField('123', rules).valid).toBe(true);
      expect(validateField('abc', rules).valid).toBe(false);
    });

    it('should validate range', () => {
      const rules: ValidationRule[] = [{ type: 'range', value: [1, 100] as [number, number], message: 'out of range' }];
      expect(validateField(50, rules).valid).toBe(true);
      expect(validateField(0, rules).valid).toBe(false);
      expect(validateField(101, rules).valid).toBe(false);
    });

    it('should validate email', () => {
      const rules: ValidationRule[] = [{ type: 'email', message: 'invalid email' }];
      expect(validateField('user@example.com', rules).valid).toBe(true);
      expect(validateField('invalid', rules).valid).toBe(false);
    });

    it('should validate stock code (6 digits starting with 3 or 6)', () => {
      const rules: ValidationRule[] = [{ type: 'stockCode', message: 'invalid code' }];
      expect(validateField('600519', rules).valid).toBe(true);
      expect(validateField('300750', rules).valid).toBe(true);
      expect(validateField('000001', rules).valid).toBe(false);
    });

    it('should validate phone number', () => {
      const rules: ValidationRule[] = [{ type: 'phone', message: 'invalid phone' }];
      expect(validateField('13812345678', rules).valid).toBe(true);
      expect(validateField('12345678901', rules).valid).toBe(false);
    });

    it('should validate custom rules', () => {
      const rules: ValidationRule[] = [{
        type: 'custom',
        message: 'must be even',
        validator: (v) => typeof v === 'number' && v % 2 === 0,
      }];
      expect(validateField(4, rules).valid).toBe(true);
      expect(validateField(3, rules).valid).toBe(false);
    });

    it('should collect multiple errors', () => {
      const rules: ValidationRule[] = [
        { type: 'required', message: 'required' },
        { type: 'minLength', value: 5, message: 'too short' },
      ];
      const result = validateField('ab', rules);
      expect(result.errors).toHaveLength(1); // passes required, fails minLength
    });
  });

  describe('validateForm', () => {
    it('should validate complete form', () => {
      const schema = {
        username: [{ type: 'required', message: 'required' }],
        email: [{ type: 'email', message: 'invalid' }],
      };
      const result = validateForm({ username: 'test', email: 'a@b.com' }, schema);
      expect(result.valid).toBe(true);
    });

    it('should report field errors', () => {
      const schema = {
        username: [{ type: 'required', message: 'required' }],
      };
      const result = validateForm({ username: '' }, schema);
      expect(result.valid).toBe(false);
      expect(result.fieldErrors.username).toBeDefined();
    });
  });

  describe('getPasswordStrength', () => {
    it('should score weak passwords low', () => {
      const result = getPasswordStrength('abc');
      expect(result.score).toBeLessThan(3);
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should score strong passwords high', () => {
      const result = getPasswordStrength('MyP@ssw0rd!2024');
      expect(result.score).toBeGreaterThanOrEqual(4);
    });

    it('should provide feedback for missing requirements', () => {
      const result = getPasswordStrength('abcdefgh');
      expect(result.feedback).toContain('需要大写字母');
      expect(result.feedback).toContain('需要数字');
      expect(result.feedback).toContain('需要特殊字符');
    });

    it('should score empty password as weak', () => {
      const result = getPasswordStrength('');
      expect(result.level).toBe('weak');
    });

    it('should give extra points for length >= 12', () => {
      const short = getPasswordStrength('Abc@1234');      // 8 chars → no length bonus
      const long = getPasswordStrength('Abc@12345678');   // 12 chars → length bonus
      expect(long.score).toBeGreaterThan(short.score);
    });
  });

  describe('sanitizeInput', () => {
    it('should escape HTML entities', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).not.toContain('<script>');
    });

    it('should escape quotes', () => {
      expect(sanitizeInput('"hello"')).toContain('&quot;');
      expect(sanitizeInput("'hello'")).toContain('&#x27;');
    });

    it('should escape ampersand', () => {
      expect(sanitizeInput('a & b')).toBe('a &amp; b');
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('formatValidationErrors', () => {
    it('should format errors as readable string', () => {
      const errors = { email: ['invalid format', 'required'], name: ['too short'] };
      const formatted = formatValidationErrors(errors);
      expect(formatted).toContain('email');
      expect(formatted).toContain('invalid format');
      expect(formatted).toContain('name');
    });

    it('should handle empty errors', () => {
      expect(formatValidationErrors({})).toBe('');
    });
  });
});
