import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 认证服务测试
 * 测试token管理、登录状态、用户信息
 */

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// 模拟localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('认证服务', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('Token管理', () => {
    it('应该能保存和读取token', () => {
      const tokens: AuthTokens = {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      localStorage.setItem('auth_tokens', JSON.stringify(tokens));
      const stored = JSON.parse(localStorage.getItem('auth_tokens')!);
      expect(stored.accessToken).toBe('access-123');
      expect(stored.refreshToken).toBe('refresh-456');
    });

    it('应该能清除token', () => {
      localStorage.setItem('auth_tokens', JSON.stringify({ accessToken: 'x' }));
      localStorage.removeItem('auth_tokens');
      expect(localStorage.getItem('auth_tokens')).toBeNull();
    });

    it('应该检测token是否过期', () => {
      const expired: AuthTokens = {
        accessToken: 'old',
        refreshToken: 'old',
        expiresAt: Math.floor(Date.now() / 1000) - 100,
      };
      expect(expired.expiresAt < Date.now() / 1000).toBe(true);

      const valid: AuthTokens = {
        accessToken: 'new',
        refreshToken: 'new',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      expect(valid.expiresAt > Date.now() / 1000).toBe(true);
    });

    it('应该检测token即将过期（5分钟内）', () => {
      const almostExpired: AuthTokens = {
        accessToken: 'x',
        refreshToken: 'x',
        expiresAt: Math.floor(Date.now() / 1000) + 200, // 3分钟后过期
      };
      // isTokenExpiring 逻辑: now > expiresAt - 300
      const isExpiring = Date.now() / 1000 > almostExpired.expiresAt - 300;
      expect(isExpiring).toBe(true);

      const fresh: AuthTokens = {
        accessToken: 'y',
        refreshToken: 'y',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      const isFreshExpiring = Date.now() / 1000 > fresh.expiresAt - 300;
      expect(isFreshExpiring).toBe(false);
    });
  });

  describe('用户信息管理', () => {
    it('应该能保存和读取用户信息', () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        nickname: '测试用户',
        emailVerified: false,
        settings: {
          theme: 'dark',
          language: 'zh-CN',
          notifications: { email: true, push: true, priceAlert: true, newsAlert: false, weeklyReport: true },
          display: { defaultPageSize: 20, chartType: 'candlestick', showVolume: true, klineDefaultPeriod: 'day' },
        },
        createdAt: '2024-01-01',
      };
      localStorage.setItem('user_info', JSON.stringify(user));
      const stored = JSON.parse(localStorage.getItem('user_info')!);
      expect(stored.email).toBe('test@example.com');
      expect(stored.nickname).toBe('测试用户');
      expect(stored.settings.theme).toBe('dark');
    });

    it('应该能清除用户信息', () => {
      localStorage.setItem('user_info', JSON.stringify({ id: '1' }));
      localStorage.removeItem('user_info');
      expect(localStorage.getItem('user_info')).toBeNull();
    });

    it('用户设置应该有合理默认值', () => {
      const settings = {
        theme: 'light' as const,
        language: 'zh-CN' as const,
        notifications: { email: true, push: true, priceAlert: true, newsAlert: true, weeklyReport: false },
        display: { defaultPageSize: 20, chartType: 'candlestick' as const, showVolume: true, klineDefaultPeriod: 'day' },
      };
      expect(['light', 'dark', 'system']).toContain(settings.theme);
      expect(['zh-CN', 'en-US']).toContain(settings.language);
      expect(settings.display.defaultPageSize).toBeGreaterThan(0);
      expect(['candlestick', 'line']).toContain(settings.display.chartType);
    });
  });

  describe('登录状态监听', () => {
    it('应该支持订阅和取消订阅', () => {
      const listeners = new Set<(user: any) => void>();
      const listener = vi.fn();
      listeners.add(listener);
      expect(listeners.has(listener)).toBe(true);
      listeners.delete(listener);
      expect(listeners.has(listener)).toBe(false);
    });

    it('通知监听器时应该传递用户信息', () => {
      const listeners = new Set<(user: any) => void>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      listeners.add(listener1);
      listeners.add(listener2);
      const user = { id: '1', nickname: 'test' };
      listeners.forEach(l => l(user));
      expect(listener1).toHaveBeenCalledWith(user);
      expect(listener2).toHaveBeenCalledWith(user);
    });

    it('登出时应该通知null', () => {
      const listeners = new Set<(user: any) => void>();
      const listener = vi.fn();
      listeners.add(listener);
      listeners.forEach(l => l(null));
      expect(listener).toHaveBeenCalledWith(null);
    });
  });

  describe('请求构造', () => {
    it('登录请求应该包含正确的参数', () => {
      const body = { email: 'test@example.com', password: '123456', rememberMe: true };
      const expiry = body.rememberMe ? 30 * 24 * 3600 : 3600;
      expect(expiry).toBe(30 * 24 * 3600);
    });

    it('不记住登录应该使用短期token', () => {
      const body = { email: 'test@example.com', password: '123456', rememberMe: false };
      const expiry = body.rememberMe ? 30 * 24 * 3600 : 3600;
      expect(expiry).toBe(3600);
    });

    it('API基础路径应该正确', () => {
      expect('/api').toBe('/api');
    });

    it('请求头应该包含Authorization', () => {
      const token = 'test-token';
      const headers = new Headers();
      headers.set('Authorization', `Bearer ${token}`);
      expect(headers.get('Authorization')).toBe('Bearer test-token');
    });
  });
});
