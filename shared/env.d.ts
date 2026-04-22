/**
 * 环境变量管理与验证
 *
 * 统一管理前后端环境变量，提供类型安全的访问方式
 */
export interface FrontendEnv {
    VITE_API_URL: string;
    VITE_WS_URL: string;
    VITE_WS_BACKUP_URL?: string;
    VITE_ENABLE_MOCK?: string;
    VITE_ENABLE_SENTRY?: string;
    VITE_ENABLE_ANALYTICS?: string;
    VITE_APP_TITLE?: string;
    VITE_APP_VERSION?: string;
}
/**
 * 获取环境变量，带默认值
 */
export declare function getEnv(): FrontendEnv;
/**
 * 是否为开发环境
 */
export declare const isDev: any;
/**
 * 是否为生产环境
 */
export declare const isProd: any;
/**
 * 当前模式
 */
export declare const mode: any;
export interface BackendEnv {
    PORT: number;
    NODE_ENV: 'development' | 'production' | 'test';
    DATABASE_URL: string;
    DB_POOL_MIN: number;
    DB_POOL_MAX: number;
    REDIS_URL?: string;
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    DATA_SOURCE: 'sina' | 'tencent' | 'eastmoney';
    LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
    CORS_ORIGIN: string;
}
/**
 * 验证后端环境变量
 */
export declare function validateBackendEnv(): BackendEnv;
declare const _default: {
    getEnv: typeof getEnv;
    isDev: any;
    isProd: any;
    mode: any;
    validateBackendEnv: typeof validateBackendEnv;
};
export default _default;
