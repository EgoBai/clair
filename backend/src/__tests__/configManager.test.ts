import { describe, it, expect } from 'vitest';
import { ConfigManager } from '../services/configManager';

describe('ConfigManager', () => {
  it('should set and get values', () => {
    const mgr = new ConfigManager();
    mgr.set('port', 3000);
    expect(mgr.get('port')).toBe(3000);
  });

  it('should return fallback for missing keys', () => {
    const mgr = new ConfigManager();
    expect(mgr.get('missing', 'default')).toBe('default');
  });

  it('should batch set values', () => {
    const mgr = new ConfigManager();
    mgr.setAll({ a: 1, b: 2, c: 3 });
    expect(mgr.get('a')).toBe(1);
    expect(mgr.get('b')).toBe(2);
  });

  it('should override values per environment', () => {
    const mgr = new ConfigManager('production');
    mgr.set('db', 'localhost');
    mgr.setEnvOverride('production', 'db', 'prod-db.example.com');
    expect(mgr.get('db')).toBe('prod-db.example.com');
  });

  it('should not apply wrong env override', () => {
    const mgr = new ConfigManager('development');
    mgr.set('db', 'localhost');
    mgr.setEnvOverride('production', 'db', 'prod-db');
    expect(mgr.get('db')).toBe('localhost');
  });

  it('should switch environment', () => {
    const mgr = new ConfigManager('development');
    mgr.set('debug', true);
    mgr.setEnvOverride('production', 'debug', false);
    expect(mgr.get('debug')).toBe(true);
    mgr.setEnvironment('production');
    expect(mgr.get('debug')).toBe(false);
  });

  it('should get all config merged', () => {
    const mgr = new ConfigManager('production');
    mgr.set('a', 1);
    mgr.set('b', 2);
    mgr.setEnvOverride('production', 'b', 20);
    const all = mgr.getAll();
    expect(all.a).toBe(1);
    expect(all.b).toBe(20);
  });

  it('should define and validate schema', () => {
    const mgr = new ConfigManager();
    mgr.defineSchema({
      port: { type: 'number', required: true },
      host: { type: 'string', default: 'localhost' },
    });
    mgr.set('port', 3000);
    const result = mgr.validate();
    expect(result.valid).toBe(true);
  });

  it('should catch missing required fields', () => {
    const mgr = new ConfigManager();
    mgr.defineSchema({
      port: { type: 'number', required: true },
    });
    const result = mgr.validate();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('port is required');
  });

  it('should catch wrong types', () => {
    const mgr = new ConfigManager();
    mgr.defineSchema({
      port: { type: 'number' },
    });
    mgr.set('port', 'not a number');
    const result = mgr.validate();
    expect(result.valid).toBe(false);
  });

  it('should delete config', () => {
    const mgr = new ConfigManager();
    mgr.set('key', 'value');
    mgr.delete('key');
    expect(mgr.has('key')).toBe(false);
  });

  it('should check existence', () => {
    const mgr = new ConfigManager();
    mgr.set('exists', 1);
    expect(mgr.has('exists')).toBe(true);
    expect(mgr.has('nope')).toBe(false);
  });

  it('should export to JSON', () => {
    const mgr = new ConfigManager();
    mgr.set('key', 'value');
    const json = mgr.toJSON();
    expect(JSON.parse(json)).toEqual({ key: 'value' });
  });

  it('should track environment', () => {
    const mgr = new ConfigManager('staging');
    expect(mgr.getEnvironment()).toBe('staging');
  });
});
