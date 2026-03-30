/**
 * CDN 策略配置测试
 */
import { describe, it, expect } from 'vitest';

describe('CDN 策略配置', () => {
  describe('模块导出', () => {
    it('导出所有函数', async () => {
      const mod = await import('../utils/cdnStrategy');
      expect(mod.getCDNConfig).toBeDefined();
      expect(mod.cdnUrl).toBeDefined();
      expect(mod.imageUrl).toBeDefined();
      expect(mod.shouldUseCDN).toBeDefined();
      expect(mod.viteCDNOptions).toBeDefined();
    });
  });

  describe('getCDNConfig', () => {
    it('开发环境使用空路径', async () => {
      const { getCDNConfig } = await import('../utils/cdnStrategy');
      const config = getCDNConfig('development');
      expect(config.baseUrl).toBe('');
      expect(config.assetsUrl).toBe('');
    });

    it('生产环境使用 CDN 域名', async () => {
      const { getCDNConfig } = await import('../utils/cdnStrategy');
      const config = getCDNConfig('production');
      expect(config.baseUrl).toContain('cdn.example.com');
      expect(config.assetsUrl).toContain('cdn.example.com');
      expect(config.imageUrl).toContain('img.example.com');
    });

    it('预发布环境使用 staging CDN', async () => {
      const { getCDNConfig } = await import('../utils/cdnStrategy');
      const config = getCDNConfig('staging');
      expect(config.baseUrl).toContain('staging-cdn');
      expect(config.assetsUrl).toContain('staging-cdn');
    });

    it('所有环境配置都有 fontUrl', async () => {
      const { getCDNConfig } = await import('../utils/cdnStrategy');
      ['development', 'production', 'staging'].forEach(env => {
        const config = getCDNConfig(env as any);
        expect(config).toHaveProperty('fontUrl');
      });
    });

    it('所有环境配置都有 version', async () => {
      const { getCDNConfig } = await import('../utils/cdnStrategy');
      ['development', 'production', 'staging'].forEach(env => {
        const config = getCDNConfig(env as any);
        expect(config).toHaveProperty('version');
      });
    });
  });

  describe('cdnUrl', () => {
    it('开发环境返回相对路径', async () => {
      const { getCDNConfig, cdnUrl } = await import('../utils/cdnStrategy');
      const config = getCDNConfig('development');
      expect(cdnUrl('/js/app.js', config)).toBe('/js/app.js');
    });

    it('生产环境返回 CDN 路径', async () => {
      const { getCDNConfig, cdnUrl } = await import('../utils/cdnStrategy');
      const config = getCDNConfig('production');
      const url = cdnUrl('/js/app.js', config);
      expect(url).toContain('cdn.example.com');
      expect(url).toContain('/js/app.js');
    });

    it('生产环境 URL 带版本号', async () => {
      const { getCDNConfig, cdnUrl } = await import('../utils/cdnStrategy');
      const config = getCDNConfig('production');
      const url = cdnUrl('/js/app.js', config);
      expect(url).toContain('?v=');
    });
  });

  describe('imageUrl', () => {
    it('开发环境返回相对路径', async () => {
      const { getCDNConfig, imageUrl } = await import('../utils/cdnStrategy');
      const config = getCDNConfig('development');
      expect(imageUrl('/logo.png', config)).toBe('/logo.png');
    });

    it('生产环境返回图片 CDN 路径', async () => {
      const { getCDNConfig, imageUrl } = await import('../utils/cdnStrategy');
      const config = getCDNConfig('production');
      const url = imageUrl('/logo.png', config);
      expect(url).toContain('img.example.com');
      expect(url).toContain('/logo.png');
    });
  });

  describe('shouldUseCDN', () => {
    it('生产环境应使用 CDN', async () => {
      const { shouldUseCDN } = await import('../utils/cdnStrategy');
      expect(shouldUseCDN('production')).toBe(true);
    });

    it('预发布环境应使用 CDN', async () => {
      const { shouldUseCDN } = await import('../utils/cdnStrategy');
      expect(shouldUseCDN('staging')).toBe(true);
    });

    it('开发环境不应使用 CDN', async () => {
      const { shouldUseCDN } = await import('../utils/cdnStrategy');
      expect(shouldUseCDN('development')).toBe(false);
    });

    it('测试环境不应使用 CDN', async () => {
      const { shouldUseCDN } = await import('../utils/cdnStrategy');
      expect(shouldUseCDN('test')).toBe(false);
    });
  });

  describe('viteCDNOptions', () => {
    it('production base 指向 CDN', async () => {
      const { viteCDNOptions } = await import('../utils/cdnStrategy');
      expect(viteCDNOptions.production.base).toContain('cdn.example.com');
    });

    it('内联阈值为 4KB', async () => {
      const { viteCDNOptions } = await import('../utils/cdnStrategy');
      expect(viteCDNOptions.assetsInlineLimit).toBe(4 * 1024);
    });

    it('启用 CSS 代码分割', async () => {
      const { viteCDNOptions } = await import('../utils/cdnStrategy');
      expect(viteCDNOptions.cssCodeSplit).toBe(true);
    });

    it('启用 modulePreload polyfill', async () => {
      const { viteCDNOptions } = await import('../utils/cdnStrategy');
      expect(viteCDNOptions.modulePreload.polyfill).toBe(true);
    });
  });
});
