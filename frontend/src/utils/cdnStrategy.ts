/**
 * CDN 策略配置
 * 静态资源 CDN 分发 + 版本管理
 */

export interface CDNConfig {
  baseUrl: string;
  assetsUrl: string;
  imageUrl: string;
  fontUrl: string;
  version: string;
}

/**
 * 默认 CDN 配置（开发环境使用相对路径）
 */
export function getCDNConfig(env: 'development' | 'production' | 'staging'): CDNConfig {
  switch (env) {
    case 'production':
      return {
        baseUrl: 'https://cdn.example.com',
        assetsUrl: 'https://cdn.example.com/assets',
        imageUrl: 'https://img.example.com',
        fontUrl: 'https://fonts.example.com',
        version: 'v1',
      };
    case 'staging':
      return {
        baseUrl: 'https://staging-cdn.example.com',
        assetsUrl: 'https://staging-cdn.example.com/assets',
        imageUrl: 'https://staging-img.example.com',
        fontUrl: 'https://staging-fonts.example.com',
        version: 'v1',
      };
    default:
      return {
        baseUrl: '',
        assetsUrl: '',
        imageUrl: '',
        fontUrl: '',
        version: '',
      };
  }
}

/**
 * 生成带版本号的 CDN URL
 */
export function cdnUrl(path: string, config: CDNConfig): string {
  const base = config.assetsUrl || '';
  const version = config.version ? `?v=${config.version}` : '';
  return `${base}${path}${version}`;
}

/**
 * 生成图片 CDN URL
 */
export function imageUrl(path: string, config: CDNConfig): string {
  const base = config.imageUrl || '';
  return `${base}${path}`;
}

/**
 * 判断是否应该使用 CDN
 */
export function shouldUseCDN(env: string): boolean {
  return env === 'production' || env === 'staging';
}

/**
 * Vite 配置中 CDN 相关选项
 */
export const viteCDNOptions = {
  // base 路径（生产环境指向 CDN）
  production: {
    base: 'https://cdn.example.com/',
  },
  // 预加载关键 chunk
  modulePreload: {
    polyfill: true,
  },
  // CSS 代码分割
  cssCodeSplit: true,
  // 静态资源内联阈值（4KB 以下内联）
  assetsInlineLimit: 4 * 1024,
};

export default {
  getCDNConfig,
  cdnUrl,
  imageUrl,
  shouldUseCDN,
  viteCDNOptions,
};
