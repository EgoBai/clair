/**
 * 配置管理器
 * Configuration Manager
 *
 * 层级配置、环境覆盖、动态重载、配置校验
 */

export type Environment = 'development' | 'staging' | 'production' | 'test';

export interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object';
    required?: boolean;
    default?: any;
    validate?: (value: any) => boolean;
  };
}

/**
 * 配置管理器
 */
export class ConfigManager {
  private configs: Map<string, any> = new Map();
  private envOverrides: Map<Environment, Map<string, any>> = new Map();
  private currentEnv: Environment = 'development';
  private schema: ConfigSchema | null = null;

  constructor(env?: Environment) {
    if (env) this.currentEnv = env;
  }

  /**
   * 设置环境
   */
  setEnvironment(env: Environment): void {
    this.currentEnv = env;
  }

  /**
   * 获取当前环境
   */
  getEnvironment(): Environment {
    return this.currentEnv;
  }

  /**
   * 设置基础配置
   */
  set(key: string, value: any): void {
    this.configs.set(key, value);
  }

  /**
   * 批量设置
   */
  setAll(values: Record<string, any>): void {
    for (const [k, v] of Object.entries(values)) {
      this.configs.set(k, v);
    }
  }

  /**
   * 设置环境特定配置
   */
  setEnvOverride(env: Environment, key: string, value: any): void {
    if (!this.envOverrides.has(env)) {
      this.envOverrides.set(env, new Map());
    }
    this.envOverrides.get(env)!.set(key, value);
  }

  /**
   * 获取配置（优先环境覆盖）
   */
  get<T = any>(key: string, fallback?: T): T {
    const envConfig = this.envOverrides.get(this.currentEnv);
    if (envConfig?.has(key)) return envConfig.get(key);
    if (this.configs.has(key)) return this.configs.get(key);
    if (this.schema?.[key]?.default !== undefined) return this.schema[key].default;
    return fallback as T;
  }

  /**
   * 获取所有配置（合并环境覆盖）
   */
  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, v] of this.configs) {
      result[k] = v;
    }
    const envConfig = this.envOverrides.get(this.currentEnv);
    if (envConfig) {
      for (const [k, v] of envConfig) {
        result[k] = v;
      }
    }
    return result;
  }

  /**
   * 定义配置Schema
   */
  defineSchema(schema: ConfigSchema): void {
    this.schema = schema;
  }

  /**
   * 校验配置
   */
  validate(): { valid: boolean; errors: string[] } {
    if (!this.schema) return { valid: true, errors: [] };
    const errors: string[] = [];
    const all = this.getAll();

    for (const [key, rule] of Object.entries(this.schema)) {
      const value = all[key];
      if (rule.required && (value === undefined || value === null)) {
        errors.push(`${key} is required`);
        continue;
      }
      if (value !== undefined && typeof value !== rule.type && rule.type !== 'object') {
        errors.push(`${key} should be ${rule.type}, got ${typeof value}`);
      }
      if (rule.validate && !rule.validate(value)) {
        errors.push(`${key} validation failed`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * 删除配置
   */
  delete(key: string): void {
    this.configs.delete(key);
  }

  /**
   * 检查是否存在
   */
  has(key: string): boolean {
    const envConfig = this.envOverrides.get(this.currentEnv);
    return (envConfig?.has(key) ?? false) || this.configs.has(key);
  }

  /**
   * 导出为JSON
   */
  toJSON(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }
}
