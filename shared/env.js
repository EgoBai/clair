/**
 * 环境变量管理与验证
 *
 * 统一管理前后端环境变量，提供类型安全的访问方式
 */
/**
 * 获取环境变量，带默认值
 */
export function getEnv() {
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
/**
 * 验证后端环境变量
 */
export function validateBackendEnv() {
    const required = ['DATABASE_URL', 'JWT_SECRET'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    return {
        PORT: parseInt(process.env.PORT || '3001'),
        NODE_ENV: process.env.NODE_ENV || 'development',
        DATABASE_URL: process.env.DATABASE_URL || '',
        DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2'),
        DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '10'),
        REDIS_URL: process.env.REDIS_URL,
        JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
        DATA_SOURCE: process.env.DATA_SOURCE || 'sina',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
        CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    };
}
export default { getEnv, isDev, isProd, mode, validateBackendEnv };
