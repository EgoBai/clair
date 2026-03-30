/**
 * 资源提示管理器测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('资源提示管理器', () => {
  describe('模块导出', () => {
    it('导出所有资源提示函数', async () => {
      const mod = await import('../utils/resourceHints');
      expect(mod.initResourceHints).toBeDefined();
      expect(mod.prefetchRouteChunk).toBeDefined();
      expect(mod.useRoutePrefetch).toBeDefined();
      expect(mod.addPreconnect).toBeDefined();
      expect(mod.addDnsPrefetch).toBeDefined();
      expect(mod.addModulePreload).toBeDefined();
      expect(mod.addPrefetch).toBeDefined();
    });

    it('默认导出包含所有函数', async () => {
      const mod = await import('../utils/resourceHints');
      expect(mod.default.initResourceHints).toBeDefined();
      expect(mod.default.prefetchRouteChunk).toBeDefined();
      expect(mod.default.useRoutePrefetch).toBeDefined();
    });
  });

  describe('函数类型检查', () => {
    it('initResourceHints 是函数', async () => {
      const mod = await import('../utils/resourceHints');
      expect(typeof mod.initResourceHints).toBe('function');
    });

    it('prefetchRouteChunk 是函数', async () => {
      const mod = await import('../utils/resourceHints');
      expect(typeof mod.prefetchRouteChunk).toBe('function');
    });

    it('addPreconnect 是函数', async () => {
      const mod = await import('../utils/resourceHints');
      expect(typeof mod.addPreconnect).toBe('function');
    });

    it('addDnsPrefetch 是函数', async () => {
      const mod = await import('../utils/resourceHints');
      expect(typeof mod.addDnsPrefetch).toBe('function');
    });

    it('addModulePreload 是函数', async () => {
      const mod = await import('../utils/resourceHints');
      expect(typeof mod.addModulePreload).toBe('function');
    });

    it('addPrefetch 是函数', async () => {
      const mod = await import('../utils/resourceHints');
      expect(typeof mod.addPrefetch).toBe('function');
    });

    it('useRoutePrefetch 返回对象', async () => {
      const mod = await import('../utils/resourceHints');
      const hooks = mod.useRoutePrefetch();
      expect(typeof hooks).toBe('object');
      expect(typeof hooks.onMouseEnter).toBe('function');
      expect(typeof hooks.onFocus).toBe('function');
    });
  });

  describe('prefetchRouteChunk 路由映射', () => {
    it('支持 /stocks 路由', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.prefetchRouteChunk('/stocks')).not.toThrow();
    });

    it('支持 /market 路由', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.prefetchRouteChunk('/market')).not.toThrow();
    });

    it('支持 /watchlist 路由', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.prefetchRouteChunk('/watchlist')).not.toThrow();
    });

    it('支持 /dashboard 路由', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.prefetchRouteChunk('/dashboard')).not.toThrow();
    });

    it('支持 /screener 路由', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.prefetchRouteChunk('/screener')).not.toThrow();
    });

    it('未知路由不抛错', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.prefetchRouteChunk('/unknown')).not.toThrow();
    });
  });

  describe('initResourceHints 配置', () => {
    it('默认配置初始化不抛错', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.initResourceHints()).not.toThrow();
    });

    it('禁用 preconnect 不抛错', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.initResourceHints({ preconnect: false })).not.toThrow();
    });

    it('自定义 origins 不抛错', async () => {
      const mod = await import('../utils/resourceHints');
      expect(() => mod.initResourceHints({
        origins: ['https://custom.api.com'],
      })).not.toThrow();
    });
  });
});
