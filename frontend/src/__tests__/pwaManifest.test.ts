/**
 * PWA Manifest 配置测试
 */
import { describe, it, expect } from 'vitest';

describe('PWA Manifest 配置', () => {
  describe('模块导出', () => {
    it('导出配置和生成函数', async () => {
      const mod = await import('../utils/pwaManifest');
      expect(mod.pwaConfig).toBeDefined();
      expect(mod.generateManifest).toBeDefined();
    });
  });

  describe('pwaConfig 基础字段', () => {
    it('应用名称正确', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.name).toBe('A股行情分析');
    });

    it('短名称正确', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.shortName).toBe('A股分析');
    });

    it('主题色为蓝色', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.themeColor).toBe('#1890ff');
    });

    it('背景色为白色', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.backgroundColor).toBe('#ffffff');
    });

    it('显示模式为 standalone', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.display).toBe('standalone');
    });

    it('起始路径为 /', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.startUrl).toBe('/');
    });

    it('作用域为 /', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.scope).toBe('/');
    });
  });

  describe('pwaConfig 图标', () => {
    it('至少有 8 个图标尺寸', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.icons.length).toBeGreaterThanOrEqual(8);
    });

    it('包含 192x192 图标', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      const icon192 = pwaConfig.icons.find(i => i.sizes === '192x192');
      expect(icon192).toBeDefined();
    });

    it('包含 512x512 图标', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      const icon512 = pwaConfig.icons.find(i => i.sizes === '512x512');
      expect(icon512).toBeDefined();
    });

    it('所有图标类型为 image/png', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      pwaConfig.icons.forEach(icon => {
        expect(icon.type).toBe('image/png');
      });
    });

    it('图标路径以 /icons/ 开头', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      pwaConfig.icons.forEach(icon => {
        expect(icon.src).toMatch(/^\/icons\//);
      });
    });
  });

  describe('pwaConfig 快捷方式', () => {
    it('至少有 4 个快捷方式', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      expect(pwaConfig.shortcuts.length).toBeGreaterThanOrEqual(4);
    });

    it('包含自选股快捷方式', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      const shortcut = pwaConfig.shortcuts.find(s => s.name === '自选股');
      expect(shortcut).toBeDefined();
      expect(shortcut?.url).toBe('/watchlist');
    });

    it('包含选股器快捷方式', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      const shortcut = pwaConfig.shortcuts.find(s => s.name === '选股器');
      expect(shortcut).toBeDefined();
      expect(shortcut?.url).toBe('/screener');
    });

    it('所有快捷方式都有 name/url', async () => {
      const { pwaConfig } = await import('../utils/pwaManifest');
      pwaConfig.shortcuts.forEach(s => {
        expect(s.name).toBeTruthy();
        expect(s.url).toBeTruthy();
      });
    });
  });

  describe('generateManifest', () => {
    it('返回有效的 JSON', async () => {
      const { generateManifest } = await import('../utils/pwaManifest');
      const json = generateManifest();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('JSON 包含 name 字段', async () => {
      const { generateManifest } = await import('../utils/pwaManifest');
      const manifest = JSON.parse(generateManifest());
      expect(manifest.name).toBe('A股行情分析');
    });

    it('JSON 包含 lang: zh-CN', async () => {
      const { generateManifest } = await import('../utils/pwaManifest');
      const manifest = JSON.parse(generateManifest());
      expect(manifest.lang).toBe('zh-CN');
    });

    it('JSON 包含 categories', async () => {
      const { generateManifest } = await import('../utils/pwaManifest');
      const manifest = JSON.parse(generateManifest());
      expect(manifest.categories).toContain('finance');
    });

    it('JSON 包含 shortcuts 数组', async () => {
      const { generateManifest } = await import('../utils/pwaManifest');
      const manifest = JSON.parse(generateManifest());
      expect(Array.isArray(manifest.shortcuts)).toBe(true);
      expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(4);
    });

    it('JSON 包含 icons 数组', async () => {
      const { generateManifest } = await import('../utils/pwaManifest');
      const manifest = JSON.parse(generateManifest());
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(8);
    });
  });
});
