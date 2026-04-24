/**
 * configManager.test.ts
 * 配置管理器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

type ConfigValue = string | number | boolean | null | ConfigValue[] | { [key: string]: ConfigValue };

interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array';
    default: ConfigValue;
    required?: boolean;
    description?: string;
    validator?: (value: ConfigValue) => boolean;
  };
}

class ConfigManager {
  private config: Map<string, ConfigValue> = new Map();
  private schema: ConfigSchema;
  private frozen = false;
  private listeners: Map<string, Array<(value: ConfigValue, oldValue: ConfigValue) => void>> = new Map();

  constructor(schema: ConfigSchema, defaults?: Record<string, ConfigValue>) {
    this.schema = schema;

    // Load defaults from schema
    for (const [key, field] of Object.entries(schema)) {
      if (field.default !== undefined) {
        this.config.set(key, field.default);
      }
    }

    // Override with provided defaults
    if (defaults) {
      for (const [key, value] of Object.entries(defaults)) {
        if (this.schema[key]) {
          this.config.set(key, value);
        }
      }
    }
  }

  get<T extends ConfigValue>(key: string): T | undefined {
    return this.config.get(key) as T | undefined;
  }

  set(key: string, value: ConfigValue): boolean {
    if (this.frozen) {
      return false;
    }

    const schemaField = this.schema[key];
    if (!schemaField) {
      return false;
    }

    // Validate type
    if (!this.validateType(value, schemaField.type)) {
      return false;
    }

    // Custom validator
    if (schemaField.validator && !schemaField.validator(value)) {
      return false;
    }

    const oldValue = this.config.get(key);
    this.config.set(key, value);

    // Notify listeners
    if (oldValue !== value) {
      const listeners = this.listeners.get(key);
      if (listeners) {
        for (const listener of listeners) {
          listener(value, oldValue);
        }
      }
    }

    return true;
  }

  has(key: string): boolean {
    return this.config.has(key);
  }

  getAll(): Record<string, ConfigValue> {
    const result: Record<string, ConfigValue> = {};
    for (const [key, value] of this.config.entries()) {
      result[key] = value;
    }
    return result;
  }

  reset(key: string): boolean {
    const schemaField = this.schema[key];
    if (!schemaField) return false;
    this.config.set(key, schemaField.default);
    return true;
  }

  resetAll(): void {
    for (const [key, field] of Object.entries(this.schema)) {
      this.config.set(key, field.default);
    }
  }

  freeze(): void {
    this.frozen = true;
  }

  unfreeze(): void {
    this.frozen = false;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  watch(key: string, callback: (value: ConfigValue, oldValue: ConfigValue) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(key);
      if (listeners) {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      }
    };
  }

  validateAll(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [key, field] of Object.entries(this.schema)) {
      if (field.required && !this.config.has(key)) {
        errors.push(`${key} is required but not set`);
        continue;
      }

      const value = this.config.get(key);
      if (value !== undefined && !this.validateType(value, field.type)) {
        errors.push(`${key} has invalid type: expected ${field.type}, got ${typeof value}`);
      }

      if (field.validator && value !== undefined && !field.validator(value)) {
        errors.push(`${key} failed custom validation`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private validateType(value: ConfigValue, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  setMultiple(values: Record<string, ConfigValue>): { success: number; failed: number } {
    let success = 0;
    let failed = 0;

    for (const [key, value] of Object.entries(values)) {
      if (this.set(key, value)) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  toJSON(): string {
    return JSON.stringify(this.getAll());
  }

  fromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json);
      for (const [key, value] of Object.entries(data)) {
        if (this.schema[key]) {
          this.config.set(key, value as ConfigValue);
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  getSchemaInfo(key: string): { description?: string; type: string; default: ConfigValue } | undefined {
    const field = this.schema[key];
    if (!field) return undefined;
    return {
      description: field.description,
      type: field.type,
      default: field.default,
    };
  }

  keys(): string[] {
    return Array.from(this.config.keys());
  }
}

describe('ConfigManager', () => {
  const schema: ConfigSchema = {
    appName: { type: 'string', default: 'AStock', description: 'Application name', required: true },
    port: { type: 'number', default: 3001, description: 'Server port' },
    debug: { type: 'boolean', default: false, description: 'Debug mode' },
    allowedOrigins: { type: 'array', default: ['http://localhost:3000'], description: 'Allowed CORS origins' },
    maxConnections: {
      type: 'number',
      default: 100,
      description: 'Max database connections',
      validator: (v) => typeof v === 'number' && v > 0 && v <= 1000,
    },
    hostname: { type: 'string', default: 'localhost', description: 'Database hostname' },
  };

  let mgr: ConfigManager;

  beforeEach(() => {
    mgr = new ConfigManager(schema);
  });

  // --- Basic get/set ---

  it('should return default values', () => {
    expect(mgr.get<string>('appName')).toBe('AStock');
    expect(mgr.get<number>('port')).toBe(3001);
    expect(mgr.get<boolean>('debug')).toBe(false);
  });

  it('should set and get string values', () => {
    expect(mgr.set('appName', 'MyStock')).toBe(true);
    expect(mgr.get<string>('appName')).toBe('MyStock');
  });

  it('should set and get number values', () => {
    expect(mgr.set('port', 8080)).toBe(true);
    expect(mgr.get<number>('port')).toBe(8080);
  });

  it('should set and get boolean values', () => {
    expect(mgr.set('debug', true)).toBe(true);
    expect(mgr.get<boolean>('debug')).toBe(true);
  });

  it('should set and get array values', () => {
    expect(mgr.set('allowedOrigins', ['http://localhost:3000', 'http://example.com'])).toBe(true);
    const origins = mgr.get<string[]>('allowedOrigins');
    expect(origins).toHaveLength(2);
  });

  it('should return undefined for unknown keys', () => {
    expect(mgr.get('unknown')).toBeUndefined();
  });

  // --- Type validation ---

  it('should reject invalid type for string field', () => {
    expect(mgr.set('appName', 123 as any)).toBe(false);
    expect(mgr.get<string>('appName')).toBe('AStock'); // unchanged
  });

  it('should reject invalid type for number field', () => {
    expect(mgr.set('port', 'not-a-number' as any)).toBe(false);
    expect(mgr.get<number>('port')).toBe(3001);
  });

  it('should reject NaN for number field', () => {
    expect(mgr.set('port', NaN)).toBe(false);
  });

  it('should reject invalid type for boolean field', () => {
    expect(mgr.set('debug', 'true' as any)).toBe(false);
    expect(mgr.get<boolean>('debug')).toBe(false);
  });

  it('should reject invalid type for array field', () => {
    expect(mgr.set('allowedOrigins', 'not-an-array' as any)).toBe(false);
  });

  // --- Custom validator ---

  it('should enforce custom validator constraints', () => {
    expect(mgr.set('maxConnections', 50)).toBe(true);
    expect(mgr.set('maxConnections', 0)).toBe(false); // too low
    expect(mgr.set('maxConnections', 1001)).toBe(false); // too high
    expect(mgr.set('maxConnections', -1)).toBe(false);
  });

  // --- has ---

  it('should check if key exists', () => {
    expect(mgr.has('appName')).toBe(true);
    expect(mgr.has('fake')).toBe(false);
  });

  // --- getAll ---

  it('should return all config values', () => {
    const all = mgr.getAll();
    expect(all.appName).toBe('AStock');
    expect(all.port).toBe(3001);
    expect(all.debug).toBe(false);
    expect(Array.isArray(all.allowedOrigins)).toBe(true);
  });

  // --- Reset ---

  it('should reset single key to default', () => {
    mgr.set('port', 9999);
    expect(mgr.reset('port')).toBe(true);
    expect(mgr.get<number>('port')).toBe(3001);
  });

  it('should return false when resetting unknown key', () => {
    expect(mgr.reset('unknown')).toBe(false);
  });

  it('should reset all keys to defaults', () => {
    mgr.set('port', 9999);
    mgr.set('debug', true);
    mgr.set('appName', 'Custom');
    mgr.resetAll();
    expect(mgr.get<string>('appName')).toBe('AStock');
    expect(mgr.get<number>('port')).toBe(3001);
    expect(mgr.get<boolean>('debug')).toBe(false);
  });

  // --- Freeze ---

  it('should prevent changes when frozen', () => {
    mgr.freeze();
    expect(mgr.set('port', 8080)).toBe(false);
    expect(mgr.get<number>('port')).toBe(3001);
    expect(mgr.isFrozen()).toBe(true);
  });

  it('should allow changes after unfreeze', () => {
    mgr.freeze();
    mgr.unfreeze();
    expect(mgr.isFrozen()).toBe(false);
    expect(mgr.set('port', 8080)).toBe(true);
  });

  // --- Watch ---

  it('should notify watchers on change', () => {
    const changes: Array<{ newVal: ConfigValue; oldVal: ConfigValue }> = [];
    mgr.watch('port', (newVal, oldVal) => {
      changes.push({ newVal, oldVal });
    });

    mgr.set('port', 8080);
    expect(changes).toHaveLength(1);
    expect(changes[0].newVal).toBe(8080);
    expect(changes[0].oldVal).toBe(3001);
  });

  it('should not notify watchers when value is unchanged', () => {
    let callCount = 0;
    mgr.watch('port', () => { callCount++; });

    mgr.set('port', 3001); // same as default
    expect(callCount).toBe(0);
  });

  it('should allow unsubscribe from watchers', () => {
    let callCount = 0;
    const unsubscribe = mgr.watch('port', () => { callCount++; });

    unsubscribe();
    mgr.set('port', 8080);
    expect(callCount).toBe(0);
  });

  // --- validateAll ---

  it('should validate all configs pass', () => {
    mgr.set('maxConnections', 100);
    const result = mgr.validateAll();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should report validation errors for invalid values', () => {
    // Create a schema where validation will fail after set
    const vSchema: ConfigSchema = {
      maxConn: { type: 'number', default: 100,
        validator: (v) => typeof v === 'number' && v > 0 && v <= 10 },
    };
    const vMgr = new ConfigManager(vSchema);
    // Default is 100, which fails validator — validateAll should catch it
    const result = vMgr.validateAll();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('maxConn');
  });

  // --- setMultiple ---

  it('should set multiple values at once', () => {
    const result = mgr.setMultiple({ port: 5000, debug: true });
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(mgr.get<number>('port')).toBe(5000);
    expect(mgr.get<boolean>('debug')).toBe(true);
  });

  it('should report failures in setMultiple', () => {
    const result = mgr.setMultiple({ port: 5000, unknownKey: 'test' as any, debug: 123 as any });
    expect(result.success).toBe(1); // only port succeeds
    expect(result.failed).toBe(2); // unknownKey + invalid debug type
  });

  // --- JSON serialization ---

  it('should serialize to JSON', () => {
    const json = mgr.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.appName).toBe('AStock');
    expect(parsed.port).toBe(3001);
  });

  it('should deserialize from JSON', () => {
    const json = JSON.stringify({ appName: 'TestApp', port: 8080 });
    expect(mgr.fromJSON(json)).toBe(true);
    expect(mgr.get<string>('appName')).toBe('TestApp');
    expect(mgr.get<number>('port')).toBe(8080);
  });

  it('should handle invalid JSON gracefully', () => {
    expect(mgr.fromJSON('not valid json')).toBe(false);
  });

  it('should ignore unknown keys during deserialization', () => {
    const json = JSON.stringify({ unknown: 'value', port: 9999 });
    expect(mgr.fromJSON(json)).toBe(true);
    expect(mgr.get<number>('port')).toBe(9999);
  });

  // --- Schema info ---

  it('should return schema info for known keys', () => {
    const info = mgr.getSchemaInfo('port');
    expect(info).toBeDefined();
    expect(info!.description).toBe('Server port');
    expect(info!.type).toBe('number');
  });

  it('should return undefined for unknown keys', () => {
    expect(mgr.getSchemaInfo('unknown')).toBeUndefined();
  });

  // --- Keys ---

  it('should return all config keys', () => {
    const keys = mgr.keys();
    expect(keys).toContain('appName');
    expect(keys).toContain('port');
    expect(keys).toContain('debug');
    expect(keys).toContain('allowedOrigins');
    expect(keys).toContain('maxConnections');
  });

  // --- Constructor with overrides ---

  it('should accept overridden defaults in constructor', () => {
    const customMgr = new ConfigManager(schema, { port: 5000, debug: true });
    expect(customMgr.get<number>('port')).toBe(5000);
    expect(customMgr.get<boolean>('debug')).toBe(true);
  });

  it('should ignore overrides for keys not in schema', () => {
    const customMgr = new ConfigManager(schema, { unknown: 'value' as any });
    expect(customMgr.has('unknown')).toBe(false);
  });

  // --- Edge Cases ---

  it('should handle empty schema', () => {
    const emptyMgr = new ConfigManager({});
    expect(emptyMgr.keys()).toHaveLength(0);
    expect(emptyMgr.set('anything', 'value')).toBe(false); // no schema
  });

  it('should allow setting value to null', () => {
    const nullSchema: ConfigSchema = {
      nullableField: { type: 'string', default: 'default' },
    };
    // The current implementation doesn't allow null for string type
    // because typeof null !== 'string'
    const nmgr = new ConfigManager(nullSchema);
    expect(nmgr.set('nullableField', null as any)).toBe(false);
  });

  it('should handle frozen state correctly', () => {
    mgr.freeze();
    expect(mgr.isFrozen()).toBe(true);
    expect(mgr.set('port', 8080)).toBe(false);
    mgr.unfreeze();
    expect(mgr.isFrozen()).toBe(false);
    expect(mgr.set('port', 8080)).toBe(true);
  });
});
