/**
 * 压缩配置测试
 */
import { describe, it, expect } from 'vitest';

describe('压缩配置', () => {
  describe('模块导出', () => {
    it('导出所有配置', async () => {
      const mod = await import('../utils/compressionConfig');
      expect(mod.compressionConfig).toBeDefined();
      expect(mod.COMPRESSIBLE_EXTENSIONS).toBeDefined();
      expect(mod.ALREADY_COMPRESSED_EXTENSIONS).toBeDefined();
      expect(mod.shouldCompress).toBeDefined();
      expect(mod.cdnCacheHeaders).toBeDefined();
    });
  });

  describe('compressionConfig', () => {
    it('gzip 配置正确', async () => {
      const { compressionConfig } = await import('../utils/compressionConfig');
      expect(compressionConfig.gzip.algorithm).toBe('gzip');
      expect(compressionConfig.gzip.ext).toBe('.gz');
      expect(compressionConfig.gzip.threshold).toBe(1024);
      expect(compressionConfig.gzip.compressionOptions.level).toBe(9);
    });

    it('brotli 配置正确', async () => {
      const { compressionConfig } = await import('../utils/compressionConfig');
      expect(compressionConfig.brotli.algorithm).toBe('brotliCompress');
      expect(compressionConfig.brotli.ext).toBe('.br');
      expect(compressionConfig.brotli.threshold).toBe(1024);
    });

    it('gzip 和 brotli 阈值相同', async () => {
      const { compressionConfig } = await import('../utils/compressionConfig');
      expect(compressionConfig.gzip.threshold).toBe(compressionConfig.brotli.threshold);
    });
  });

  describe('COMPRESSIBLE_EXTENSIONS', () => {
    it('包含 HTML', async () => {
      const { COMPRESSIBLE_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(COMPRESSIBLE_EXTENSIONS).toContain('.html');
    });

    it('包含 JS', async () => {
      const { COMPRESSIBLE_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(COMPRESSIBLE_EXTENSIONS).toContain('.js');
    });

    it('包含 CSS', async () => {
      const { COMPRESSIBLE_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(COMPRESSIBLE_EXTENSIONS).toContain('.css');
    });

    it('包含 JSON', async () => {
      const { COMPRESSIBLE_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(COMPRESSIBLE_EXTENSIONS).toContain('.json');
    });

    it('包含 SVG', async () => {
      const { COMPRESSIBLE_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(COMPRESSIBLE_EXTENSIONS).toContain('.svg');
    });
  });

  describe('ALREADY_COMPRESSED_EXTENSIONS', () => {
    it('包含 PNG（已压缩）', async () => {
      const { ALREADY_COMPRESSED_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(ALREADY_COMPRESSED_EXTENSIONS).toContain('.png');
    });

    it('包含 JPG（已压缩）', async () => {
      const { ALREADY_COMPRESSED_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(ALREADY_COMPRESSED_EXTENSIONS).toContain('.jpg');
    });

    it('包含 WOFF2（已压缩）', async () => {
      const { ALREADY_COMPRESSED_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(ALREADY_COMPRESSED_EXTENSIONS).toContain('.woff2');
    });

    it('包含 .gz（已压缩）', async () => {
      const { ALREADY_COMPRESSED_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(ALREADY_COMPRESSED_EXTENSIONS).toContain('.gz');
    });

    it('包含 .br（已压缩）', async () => {
      const { ALREADY_COMPRESSED_EXTENSIONS } = await import('../utils/compressionConfig');
      expect(ALREADY_COMPRESSED_EXTENSIONS).toContain('.br');
    });
  });

  describe('shouldCompress', () => {
    it('.js 应该压缩', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('app.js')).toBe(true);
    });

    it('.css 应该压缩', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('style.css')).toBe(true);
    });

    it('.html 应该压缩', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('index.html')).toBe(true);
    });

    it('.png 不应该压缩', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('logo.png')).toBe(false);
    });

    it('.jpg 不应该压缩', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('photo.jpg')).toBe(false);
    });

    it('.woff2 不应该压缩', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('font.woff2')).toBe(false);
    });

    it('.gz 不应该压缩', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('bundle.js.gz')).toBe(false);
    });

    it('.br 不应该压缩', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('bundle.js.br')).toBe(false);
    });

    it('大写扩展名也正确处理', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('APP.JS')).toBe(true);
      expect(shouldCompress('LOGO.PNG')).toBe(false);
    });

    it('路径中带目录也能正确处理', async () => {
      const { shouldCompress } = await import('../utils/compressionConfig');
      expect(shouldCompress('/assets/js/vendor.js')).toBe(true);
      expect(shouldCompress('/images/logo.png')).toBe(false);
    });
  });

  describe('cdnCacheHeaders', () => {
    it('immutable 缓存头包含长期缓存', async () => {
      const { cdnCacheHeaders } = await import('../utils/compressionConfig');
      expect(cdnCacheHeaders.immutable['Cache-Control']).toContain('immutable');
      expect(cdnCacheHeaders.immutable['Cache-Control']).toContain('max-age=31536000');
    });

    it('html 缓存头要求协商', async () => {
      const { cdnCacheHeaders } = await import('../utils/compressionConfig');
      expect(cdnCacheHeaders.html['Cache-Control']).toContain('must-revalidate');
    });

    it('api 缓存头禁止缓存', async () => {
      const { cdnCacheHeaders } = await import('../utils/compressionConfig');
      expect(cdnCacheHeaders.api['Cache-Control']).toContain('no-cache');
      expect(cdnCacheHeaders.api['Cache-Control']).toContain('no-store');
    });

    it('serviceWorker 缓存头禁止缓存', async () => {
      const { cdnCacheHeaders } = await import('../utils/compressionConfig');
      expect(cdnCacheHeaders.serviceWorker['Cache-Control']).toContain('no-cache');
      expect(cdnCacheHeaders.serviceWorker['Service-Worker-Allowed']).toBe('/');
    });

    it('font 缓存头包含 CORS', async () => {
      const { cdnCacheHeaders } = await import('../utils/compressionConfig');
      expect(cdnCacheHeaders.font['Access-Control-Allow-Origin']).toBe('*');
    });

    it('immutable 和 font 都包含 Vary: Accept-Encoding', async () => {
      const { cdnCacheHeaders } = await import('../utils/compressionConfig');
      expect(cdnCacheHeaders.immutable['Vary']).toBe('Accept-Encoding');
      expect(cdnCacheHeaders.font['Vary']).toBe('Accept-Encoding');
    });
  });
});
