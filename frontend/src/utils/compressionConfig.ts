/**
 * 资源压缩配置
 * Brotli + Gzip 双重压缩，CDN 友好的 content-encoding
 */

// Vite 插件接口（不依赖外部包，纯配置参考）
export interface CompressionConfig {
  gzip: {
    algorithm: 'gzip';
    ext: '.gz';
    threshold: number;      // 最小压缩字节数
    compressionOptions: { level: number };
  };
  brotli: {
    algorithm: 'brotliCompress';
    ext: '.br';
    threshold: number;
    compressionOptions: {
      params: {
        [key: number]: number;
      };
    };
  };
}

/**
 * 推荐的压缩配置
 * 用于 vite-plugin-compression2 或类似插件
 */
export const compressionConfig: CompressionConfig = {
  gzip: {
    algorithm: 'gzip',
    ext: '.gz',
    threshold: 1024,      // 1KB 以下不压缩
    compressionOptions: { level: 9 },
  },
  brotli: {
    algorithm: 'brotliCompress',
    ext: '.br',
    threshold: 1024,
    compressionOptions: {
      params: {
        1: 11,  // BROTLI_PARAM_QUALITY
        2: 2,   // BROTLI_PARAM_MODE (text)
      },
    },
  },
};

/**
 * 需要压缩的文件类型
 */
export const COMPRESSIBLE_EXTENSIONS = [
  '.html', '.js', '.mjs', '.css', '.json',
  '.svg', '.xml', '.txt', '.woff2',
];

/**
 * 不需要压缩的文件类型（已经压缩过）
 */
export const ALREADY_COMPRESSED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.woff2', '.woff', '.ttf', '.eot',
  '.gz', '.br', '.zip',
];

/**
 * 检查文件是否应该被压缩
 */
export function shouldCompress(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return COMPRESSIBLE_EXTENSIONS.includes(ext) &&
    !ALREADY_COMPRESSED_EXTENSIONS.includes(ext);
}

/**
 * CDN 缓存头配置
 * 用于 nginx / cloudflare / vercel 配置参考
 */
export const cdnCacheHeaders = {
  // 带 hash 的静态资源：长期缓存
  immutable: {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Vary': 'Accept-Encoding',
  },
  // HTML：短期缓存 + 协商
  html: {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vary': 'Accept-Encoding',
  },
  // API 响应：不缓存或短期缓存
  api: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  },
  // Service Worker：始终验证
  serviceWorker: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Service-Worker-Allowed': '/',
  },
  // 字体：长期缓存 + CORS
  font: {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'Vary': 'Accept-Encoding',
  },
};

export default {
  compressionConfig,
  COMPRESSIBLE_EXTENSIONS,
  ALREADY_COMPRESSED_EXTENSIONS,
  shouldCompress,
  cdnCacheHeaders,
};
