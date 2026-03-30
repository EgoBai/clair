/**
 * 预渲染配置测试
 */
import { describe, it, expect } from 'vitest';

describe('预渲染配置', () => {
  describe('模块导出', () => {
    it('导出所有配置', async () => {
      const mod = await import('../utils/prerenderConfig');
      expect(mod.prerenderRoutes).toBeDefined();
      expect(mod.generateSitemap).toBeDefined();
      expect(mod.generateRobotsTxt).toBeDefined();
      expect(mod.shouldPrerender).toBeDefined();
    });
  });

  describe('prerenderRoutes', () => {
    it('至少有 8 个预渲染路由', async () => {
      const { prerenderRoutes } = await import('../utils/prerenderConfig');
      expect(prerenderRoutes.length).toBeGreaterThanOrEqual(8);
    });

    it('首页优先级最高 (1.0)', async () => {
      const { prerenderRoutes } = await import('../utils/prerenderConfig');
      const home = prerenderRoutes.find(r => r.path === '/');
      expect(home).toBeDefined();
      expect(home?.priority).toBe(1.0);
    });

    it('所有路由都有 path/title/description', async () => {
      const { prerenderRoutes } = await import('../utils/prerenderConfig');
      prerenderRoutes.forEach(route => {
        expect(route.path).toBeTruthy();
        expect(route.title).toBeTruthy();
        expect(route.description).toBeTruthy();
      });
    });

    it('所有路由的 priority 在 0-1 之间', async () => {
      const { prerenderRoutes } = await import('../utils/prerenderConfig');
      prerenderRoutes.forEach(route => {
        expect(route.priority).toBeGreaterThanOrEqual(0);
        expect(route.priority).toBeLessThanOrEqual(1);
      });
    });

    it('所有路由的 changefreq 有效', async () => {
      const { prerenderRoutes } = await import('../utils/prerenderConfig');
      const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly'];
      prerenderRoutes.forEach(route => {
        expect(validFreqs).toContain(route.changefreq);
      });
    });

    it('包含 /stocks 路由', async () => {
      const { prerenderRoutes } = await import('../utils/prerenderConfig');
      expect(prerenderRoutes.some(r => r.path === '/stocks')).toBe(true);
    });

    it('包含 /market 路由', async () => {
      const { prerenderRoutes } = await import('../utils/prerenderConfig');
      expect(prerenderRoutes.some(r => r.path === '/market')).toBe(true);
    });

    it('包含 /screener 路由', async () => {
      const { prerenderRoutes } = await import('../utils/prerenderConfig');
      expect(prerenderRoutes.some(r => r.path === '/screener')).toBe(true);
    });
  });

  describe('generateSitemap', () => {
    it('返回有效的 XML', async () => {
      const { generateSitemap } = await import('../utils/prerenderConfig');
      const xml = generateSitemap('https://example.com');
      expect(xml).toContain('<?xml');
      expect(xml).toContain('<urlset');
      expect(xml).toContain('</urlset>');
    });

    it('包含指定的 base URL', async () => {
      const { generateSitemap } = await import('../utils/prerenderConfig');
      const xml = generateSitemap('https://astock.com');
      expect(xml).toContain('https://astock.com/');
    });

    it('包含所有预渲染路由', async () => {
      const { generateSitemap, prerenderRoutes } = await import('../utils/prerenderConfig');
      const xml = generateSitemap('https://example.com');
      prerenderRoutes.forEach(route => {
        expect(xml).toContain(`https://example.com${route.path}`);
      });
    });

    it('包含 changefreq 标签', async () => {
      const { generateSitemap } = await import('../utils/prerenderConfig');
      const xml = generateSitemap('https://example.com');
      expect(xml).toContain('<changefreq>');
    });

    it('包含 priority 标签', async () => {
      const { generateSitemap } = await import('../utils/prerenderConfig');
      const xml = generateSitemap('https://example.com');
      expect(xml).toContain('<priority>');
    });
  });

  describe('generateRobotsTxt', () => {
    it('包含 User-agent', async () => {
      const { generateRobotsTxt } = await import('../utils/prerenderConfig');
      const txt = generateRobotsTxt('https://example.com');
      expect(txt).toContain('User-agent: *');
    });

    it('禁止 API 路径', async () => {
      const { generateRobotsTxt } = await import('../utils/prerenderConfig');
      const txt = generateRobotsTxt('https://example.com');
      expect(txt).toContain('Disallow: /api/');
    });

    it('禁止 WebSocket 路径', async () => {
      const { generateRobotsTxt } = await import('../utils/prerenderConfig');
      const txt = generateRobotsTxt('https://example.com');
      expect(txt).toContain('Disallow: /ws/');
    });

    it('包含 sitemap 链接', async () => {
      const { generateRobotsTxt } = await import('../utils/prerenderConfig');
      const txt = generateRobotsTxt('https://example.com');
      expect(txt).toContain('Sitemap: https://example.com/sitemap.xml');
    });
  });

  describe('shouldPrerender', () => {
    it('首页应预渲染', async () => {
      const { shouldPrerender } = await import('../utils/prerenderConfig');
      expect(shouldPrerender('/')).toBe(true);
    });

    it('/stocks 应预渲染', async () => {
      const { shouldPrerender } = await import('../utils/prerenderConfig');
      expect(shouldPrerender('/stocks')).toBe(true);
    });

    it('未知路由不应预渲染', async () => {
      const { shouldPrerender } = await import('../utils/prerenderConfig');
      expect(shouldPrerender('/unknown')).toBe(false);
    });

    it('动态路由不应预渲染', async () => {
      const { shouldPrerender } = await import('../utils/prerenderConfig');
      expect(shouldPrerender('/stock/600000')).toBe(false);
    });
  });
});
