import { describe, it, expect } from 'vitest';

// Configuration Validation System
interface ConfigRule {
  key: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'url' | 'email' | 'port';
  default?: unknown;
  validate?: (value: unknown) => boolean;
  description?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: Record<string, unknown>;
}

function validateConfig(raw: Record<string, unknown>, rules: ConfigRule[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: Record<string, unknown> = {};

  for (const rule of rules) {
    const value = raw[rule.key];

    if (value === undefined || value === null || value === '') {
      if (rule.required) {
        if (rule.default !== undefined) {
          config[rule.key] = rule.default;
          warnings.push(`${rule.key}: using default value`);
        } else {
          errors.push(`${rule.key}: required but missing`);
        }
      } else if (rule.default !== undefined) {
        config[rule.key] = rule.default;
      }
      continue;
    }

    // Type validation
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${rule.key}: expected string, got ${typeof value}`);
          continue;
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${rule.key}: expected number, got ${typeof value}`);
          continue;
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${rule.key}: expected boolean, got ${typeof value}`);
          continue;
        }
        break;
      case 'url':
        if (typeof value !== 'string') {
          errors.push(`${rule.key}: expected URL string`);
          continue;
        }
        try {
          new URL(value);
        } catch {
          errors.push(`${rule.key}: invalid URL format`);
          continue;
        }
        break;
      case 'email':
        if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push(`${rule.key}: invalid email format`);
          continue;
        }
        break;
      case 'port':
        if (typeof value !== 'number' || value < 1 || value > 65535 || !Number.isInteger(value)) {
          errors.push(`${rule.key}: invalid port number (1-65535)`);
          continue;
        }
        break;
    }

    // Custom validation
    if (rule.validate && !rule.validate(value)) {
      errors.push(`${rule.key}: custom validation failed`);
      continue;
    }

    config[rule.key] = value;
  }

  return { valid: errors.length === 0, errors, warnings, config };
}

function mergeWithDefaults(config: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  return { ...defaults, ...config };
}

function maskSensitiveValues(config: Record<string, unknown>, sensitiveKeys: string[]): Record<string, unknown> {
  const masked = { ...config };
  for (const key of sensitiveKeys) {
    if (key in masked && typeof masked[key] === 'string') {
      const val = masked[key] as string;
      masked[key] = val.length > 4 ? `${'*'.repeat(val.length - 4)}${val.slice(-4)}` : '****';
    }
  }
  return masked;
}

describe('Configuration Validation', () => {
  const rules: ConfigRule[] = [
    { key: 'PORT', required: true, type: 'port', default: 3000 },
    { key: 'DATABASE_URL', required: true, type: 'url' },
    { key: 'NODE_ENV', required: false, type: 'string', default: 'development' },
    { key: 'MAX_CONNECTIONS', required: false, type: 'number', validate: (v) => (v as number) > 0 },
    { key: 'DEBUG', required: false, type: 'boolean', default: false },
    { key: 'ADMIN_EMAIL', required: false, type: 'email' },
  ];

  it('should validate correct config', () => {
    const result = validateConfig({
      PORT: 3000,
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
    }, rules);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should report missing required fields', () => {
    const result = validateConfig({ PORT: 3000 }, rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('DATABASE_URL'))).toBe(true);
  });

  it('should use defaults when values missing', () => {
    const result = validateConfig({ DATABASE_URL: 'postgresql://localhost/db' }, rules);
    expect(result.config.PORT).toBe(3000);
    expect(result.config.NODE_ENV).toBe('development');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should validate port range', () => {
    const result = validateConfig({ PORT: 70000, DATABASE_URL: 'http://x.com' }, rules);
    expect(result.valid).toBe(false);
  });

  it('should validate port is integer', () => {
    const result = validateConfig({ PORT: 3000.5, DATABASE_URL: 'http://x.com' }, rules);
    expect(result.valid).toBe(false);
  });

  it('should validate URL format', () => {
    const result = validateConfig({ DATABASE_URL: 'not-a-url' }, rules);
    expect(result.valid).toBe(false);
  });

  it('should validate email format', () => {
    const valid = validateConfig({ DATABASE_URL: 'http://x.com', ADMIN_EMAIL: 'admin@example.com' }, rules);
    expect(valid.config.ADMIN_EMAIL).toBe('admin@example.com');

    const invalid = validateConfig({ DATABASE_URL: 'http://x.com', ADMIN_EMAIL: 'not-email' }, rules);
    expect(invalid.valid).toBe(false);
  });

  it('should validate number type', () => {
    const result = validateConfig({ DATABASE_URL: 'http://x.com', MAX_CONNECTIONS: 'abc' }, rules);
    expect(result.valid).toBe(false);
  });

  it('should validate custom validators', () => {
    const result = validateConfig({ DATABASE_URL: 'http://x.com', MAX_CONNECTIONS: -1 }, rules);
    expect(result.valid).toBe(false);
  });

  it('should validate boolean type', () => {
    const result = validateConfig({ DATABASE_URL: 'http://x.com', DEBUG: 'yes' }, rules);
    expect(result.valid).toBe(false);
  });

  it('should merge with defaults', () => {
    const defaults = { PORT: 3000, DEBUG: false, LOG_LEVEL: 'info' };
    const config = { PORT: 8080, DEBUG: true };
    const merged = mergeWithDefaults(config, defaults);
    expect(merged.PORT).toBe(8080);
    expect(merged.DEBUG).toBe(true);
    expect(merged.LOG_LEVEL).toBe('info');
  });

  it('should mask sensitive values', () => {
    const config = { API_KEY: 'sk-1234567890abcdef', PORT: 3000, TOKEN: 'abc' };
    const masked = maskSensitiveValues(config, ['API_KEY', 'TOKEN']);
    expect(masked.API_KEY).toMatch(/^\*+cdef$/);
    expect(masked.TOKEN).toBe('****');
    expect(masked.PORT).toBe(3000);
  });

  it('should handle empty sensitive key', () => {
    const config = { KEY: 'value' };
    const masked = maskSensitiveValues(config, ['NONEXISTENT']);
    expect(masked.KEY).toBe('value');
  });

  it('should not mask non-string values', () => {
    const config = { COUNT: 42 };
    const masked = maskSensitiveValues(config, ['COUNT']);
    expect(masked.COUNT).toBe(42);
  });

  it('should handle empty config with defaults', () => {
    const result = validateConfig({}, [
      { key: 'X', required: false, type: 'string', default: 'default' },
    ]);
    expect(result.config.X).toBe('default');
  });

  it('should handle empty rules', () => {
    const result = validateConfig({ anything: 'goes' }, []);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.config)).toHaveLength(0);
  });

  it('should handle NaN number', () => {
    const result = validateConfig({ PORT: NaN, DATABASE_URL: 'http://x.com' }, rules);
    expect(result.valid).toBe(false);
  });
});
