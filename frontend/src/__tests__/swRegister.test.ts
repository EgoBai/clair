import { describe, it, expect } from 'vitest';

describe('Service Worker 注册工具', () => {
  describe('模块导出', () => {
    it('应该导出 registerServiceWorker 函数', async () => {
      const mod = await import('../utils/swRegister');
      expect(typeof mod.registerServiceWorker).toBe('function');
    });

    it('应该导出 unregisterServiceWorker 函数', async () => {
      const mod = await import('../utils/swRegister');
      expect(typeof mod.unregisterServiceWorker).toBe('function');
    });

    it('应该导出 skipWaiting 函数', async () => {
      const mod = await import('../utils/swRegister');
      expect(typeof mod.skipWaiting).toBe('function');
    });

    it('应该导出 isOffline 函数', async () => {
      const mod = await import('../utils/swRegister');
      expect(typeof mod.isOffline).toBe('function');
    });
  });

  describe('isOffline 逻辑', () => {
    it('应该返回布尔值', async () => {
      const { isOffline } = await import('../utils/swRegister');
      // 在 jsdom 环境中 navigator.onLine 默认 true
      expect(typeof isOffline()).toBe('boolean');
    });
  });

  describe('unregisterServiceWorker', () => {
    it('应该返回 Promise', async () => {
      const { unregisterServiceWorker } = await import('../utils/swRegister');
      const result = unregisterServiceWorker();
      expect(result).toBeInstanceOf(Promise);
      // 没有 serviceWorker 支持时应该 resolve false
      const resolved = await result;
      expect(typeof resolved).toBe('boolean');
    });
  });

  describe('Service Worker 配置', () => {
    it('配置应该可选', async () => {
      const { registerServiceWorker } = await import('../utils/swRegister');
      // 不传配置应该不抛错
      expect(() => registerServiceWorker()).not.toThrow();
    });

    it('带配置应该不抛错', async () => {
      const { registerServiceWorker } = await import('../utils/swRegister');
      expect(() => registerServiceWorker({
        onUpdate: () => { ,
        onOffline: () => { ,
        onOnline: () => { ,
        scope: '/app/',
      })).not.toThrow();
    });
  });
});
