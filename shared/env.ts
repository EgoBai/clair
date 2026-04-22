/**
 * 环境变量管理与验证
 * 
 * 统一管理前后端环境变量，提供类型安全的访问方式
 */

// ==================== 前端环境变量 ====================

export interface FrontendEnv {
  // API 配置
  VITE_API_URL: string;
  VITE_WS_URL: string;
  VITE_WS_BACKUP_URL?: string;

  // 功能开关
  VITE_ENABLE_MOCK?: string;
  VITE_ENABLE_SENTRY?: string;
  VITE_ENABLE_ANALYTICS?: string;

  // 应用信息
  VITE_APP_TITLE?: string;
  VITE_APP_VERSION?: string;
}

/**
 * 获取环境变量，带默认值
 */
export function getEnv(): FrontendEnv {
  return {
    VITE_API_URL: import.meta.env.VITE_API_URL || '/api',
    VITE_WS_URL: import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws',
    VITE_WS_BACKUP_URL: import.meta.env.VITE_WS_BACKUP_URL,
    VITE_ENABLE_MOCK: import.meta.env.VITE_ENABLE_MOCK || 'false',
    VITE_ENABLE_SENTRY: import.meta.env.VITE_ENABLE_SENTRY || 'false',
    VITE_ENABLE_ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS || 'false',
    VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE || 'A股行情分析',
    VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
  };
}

/**
 * 是否为开发环境
 */
export const isDev = import.meta.env.DEV;

/**
 * 是否为生产环境
 */
export const isProd = import.meta.env.PROD;

/**
 * 当前模式
 */
export const mode = import.meta.env.MODE;

// ==================== 后端环境变量 ====================

export interface BackendEnv {
  // 服务配置
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';

  // 数据库
  DATABASE_URL: string;
  DB_POOL_MIN: number;
  DB_POOL_MAX: number;

  // Redis
  REDIS_URL?: string;

  // JWT
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;

  // 数据源
  DATA_SOURCE: 'sina' | 'tencent' | 'eastmoney';

  // 日志
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';

  // CORS
  CORS_ORIGIN: string;
}

/**
 * 验证后端环境变量
 */
export function validateBackendEnv(): BackendEnv {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    PORT: parseInt(process.env.PORT || '3001'),
    NODE_ENV: (process.env.NODE_ENV as BackendEnv['NODE_ENV']) || 'development',
    DATABASE_URL: process.env.DATABASE_URL || '',
    DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2'),
    DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '10'),
    REDIS_URL: process.env.REDIS_URL || undefined,
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    DATA_SOURCE: (process.env.DATA_SOURCE as BackendEnv['DATA_SOURCE']) || 'sina',
    LOG_LEVEL: (process.env.LOG_LEVEL as BackendEnv['LOG_LEVEL']) || 'info',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  } as BackendEnv;
}

export default { getEnv, isDev, isProd, mode, validateBackendEnv };
