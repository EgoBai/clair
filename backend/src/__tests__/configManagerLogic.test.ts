import { describe, it, expect } from 'vitest';

/**
 * 配置管理器逻辑测试
 * ConfigManager 环境/合并/验证逻辑
 */

type ConfigEnv = 'development' | 'staging' | 'production' | 'test';

interface ConfigEntry {
  key: string;
  value?: any;
  env?: ConfigEnv;
  required?: boolean;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  default?: any;
}

interface ConfigSchema {
  entries: ConfigEntry[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function deepMerge(target: any, source: any): any {
  if (source === null || source === undefined) return target;
  if (typeof target !== 'object' || typeof source !== 'object') return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (key in target && typeof target[key] === 'object' && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function mergeConfigs(
  base: Record<string, any>,
  env: Record<string, any>,
  overrides: Record<string, any>
): Record<string, any> {
  return deepMerge(deepMerge(base, env), overrides);
}

function validateType(value: any, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}

function validateConfig(
  config: Record<string, any>,
  schema: ConfigSchema
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const entry of schema.entries) {
    const value = config[entry.key];

    // Required check
    if (entry.required && (value === undefined || value === null)) {
      if (entry.default !== undefined) {
        warnings.push(`${entry.key}: using default value`);
      } else {
        errors.push(`${entry.key}: is required`);
      }
      continue;
    }

    // Type check
    if (value !== undefined && value !== null && !validateType(value, entry.type)) {
      errors.push(`${entry.key}: expected ${entry.type}, got ${typeof value}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function applyDefaults(
  config: Record<string, any>,
  schema: ConfigSchema
): Record<string, any> {
  const result = { ...config };
  for (const entry of schema.entries) {
    if ((result[entry.key] === undefined || result[entry.key] === null) && entry.default !== undefined) {
      result[entry.key] = entry.default;
    }
  }
  return result;
}

function filterByEnv(
  config: Record<string, any>,
  env: ConfigEnv
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null && '_env' in value) {
      if (value._env === env || value._env === undefined) {
        result[key] = value.value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): Record<string, any> {
  const result = JSON.parse(JSON.stringify(obj));
  const keys = path.split('.');
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

function flattenConfig(obj: Record<string, any>, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenConfig(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function diffConfigs(
  a: Record<string, any>,
  b: Record<string, any>
): { added: string[]; removed: string[]; changed: string[] } {
  const flatA = flattenConfig(a);
  const flatB = flattenConfig(b);
  const allKeys = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of allKeys) {
    if (!(key in flatA)) added.push(key);
    else if (!(key in flatB)) removed.push(key);
    else if (JSON.stringify(flatA[key]) !== JSON.stringify(flatB[key])) changed.push(key);
  }

  return { added, removed, changed };
}

describe('配置管理器逻辑', () => {
  describe('deepMerge', () => {
    it('should merge objects deeply', () => {
      const result = deepMerge(
        { a: 1, b: { c: 2, d: 3 } },
        { b: { c: 4, e: 5 } }
      );
      expect(result).toEqual({ a: 1, b: { c: 4, d: 3, e: 5 } });
    });

    it('should overwrite non-object values', () => {
      expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    it('should handle null source', () => {
      expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
    });

    it('should handle arrays', () => {
      expect(deepMerge({ a: [1] }, { a: [2, 3] })).toEqual({ a: [2, 3] });
    });

    it('should handle empty objects', () => {
      expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
    });
  });

  describe('mergeConfigs', () => {
    it('should merge base → env → overrides', () => {
      const result = mergeConfigs(
        { db: { host: 'localhost', port: 5432 } },
        { db: { host: 'staging-db' } },
        { db: { port: 3306 } }
      );
      expect(result.db.host).toBe('staging-db');
      expect(result.db.port).toBe(3306);
    });
  });

  describe('validateType', () => {
    it('should validate string', () => {
      expect(validateType('hello', 'string')).toBe(true);
      expect(validateType(42, 'string')).toBe(false);
    });

    it('should validate number', () => {
      expect(validateType(42, 'number')).toBe(true);
      expect(validateType(NaN, 'number')).toBe(false);
    });

    it('should validate boolean', () => {
      expect(validateType(true, 'boolean')).toBe(true);
      expect(validateType(1, 'boolean')).toBe(false);
    });

    it('should validate object', () => {
      expect(validateType({}, 'object')).toBe(true);
      expect(validateType(null, 'object')).toBe(false);
      expect(validateType([], 'object')).toBe(false);
    });

    it('should validate array', () => {
      expect(validateType([], 'array')).toBe(true);
      expect(validateType({}, 'array')).toBe(false);
    });
  });

  describe('validateConfig', () => {
    const schema: ConfigSchema = {
      entries: [
        { key: 'port', type: 'number', required: true, value: undefined },
        { key: 'host', type: 'string', required: true, default: 'localhost', value: undefined },
        { key: 'debug', type: 'boolean', required: false, value: undefined },
      ],
    };

    it('should pass valid config', () => {
      const result = validateConfig({ port: 3000, host: 'example.com' }, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail on missing required', () => {
      const result = validateConfig({ port: 3000 }, schema);
      expect(result.warnings.length).toBeGreaterThan(0); // host has default
    });

    it('should fail on wrong type', () => {
      const result = validateConfig({ port: 'abc', host: 'x' }, schema);
      expect(result.valid).toBe(false);
    });
  });

  describe('applyDefaults', () => {
    it('should apply default values', () => {
      const schema: ConfigSchema = {
        entries: [
          { key: 'port', type: 'number', required: true, default: 8080, value: undefined },
          { key: 'host', type: 'string', required: true, default: 'localhost', value: undefined },
        ],
      };
      const result = applyDefaults({}, schema);
      expect(result.port).toBe(8080);
      expect(result.host).toBe('localhost');
    });

    it('should not override existing values', () => {
      const schema: ConfigSchema = {
        entries: [{ key: 'port', type: 'number', required: true, default: 8080, value: undefined }],
      };
      const result = applyDefaults({ port: 3000 }, schema);
      expect(result.port).toBe(3000);
    });
  });

  describe('getNestedValue', () => {
    it('should get nested values', () => {
      const config = { db: { connection: { host: 'localhost' } } };
      expect(getNestedValue(config, 'db.connection.host')).toBe('localhost');
    });

    it('should return undefined for missing paths', () => {
      expect(getNestedValue({}, 'a.b.c')).toBeUndefined();
    });
  });

  describe('setNestedValue', () => {
    it('should set nested values', () => {
      const result = setNestedValue({}, 'db.host', 'localhost');
      expect(result.db.host).toBe('localhost');
    });

    it('should not mutate original', () => {
      const original = { a: 1 };
      setNestedValue(original, 'b.c', 2);
      expect(original).toEqual({ a: 1 });
    });
  });

  describe('flattenConfig', () => {
    it('should flatten nested objects', () => {
      const flat = flattenConfig({ db: { host: 'localhost', port: 5432 } });
      expect(flat).toEqual({ 'db.host': 'localhost', 'db.port': 5432 });
    });

    it('should handle arrays', () => {
      const flat = flattenConfig({ tags: ['a', 'b'] });
      expect(flat.tags).toEqual(['a', 'b']);
    });
  });

  describe('diffConfigs', () => {
    it('should detect added keys', () => {
      const diff = diffConfigs({ a: 1 }, { a: 1, b: 2 });
      expect(diff.added).toContain('b');
    });

    it('should detect removed keys', () => {
      const diff = diffConfigs({ a: 1, b: 2 }, { a: 1 });
      expect(diff.removed).toContain('b');
    });

    it('should detect changed values', () => {
      const diff = diffConfigs({ a: 1 }, { a: 2 });
      expect(diff.changed).toContain('a');
    });

    it('should handle nested changes', () => {
      const diff = diffConfigs(
        { db: { host: 'a' } },
        { db: { host: 'b' } }
      );
      expect(diff.changed).toContain('db.host');
    });
  });
});
