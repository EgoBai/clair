import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 认证服务测试
 * 测试 token 管理、登录状态、用户信息、订阅
 * (Rewritten to import the real authService singleton; the api dependency is stubbed.)
 */

vi.mock('../services/api', () => {
  const mockUser = {
    id: '1',
    email: 'test@example.com',
    nickname: '测试用户',
    emailVerified: false,
    settings: {
      theme: 'dark' as const,
      language: 'zh-CN' as const,
      notifications: { email: true, push: true, priceAlert: true, newsAlert: false, weeklyReport: true },
      display: { defaultPageSize: 20, chartType: 'candlestick' as const, showVolume: true, klineDefaultPeriod: 'day' },
    },
    createdAt: '2024-01-01',
  };
  return {
    apiService: {
      setAuthToken: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: { token: 'tok-123', user: mockUser } }),
      put: vi.fn().mockResolvedValue({ data: { theme: 'dark' } }),
    },
  };
});

import { authService } from '../services/auth';
import { apiService as mockedApi } from '../services/api';

const nowSec = () => Math.floor(Date.now() / 1000);

describe('认证服务', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    // 重置为未登录状态：logout 会清除内存中的 tokens 与 localStorage
    await authService.logout();
  });

  describe('初始状态', () => {
    it('未登录时 accessToken 为 null 且 isLoggedIn 为 false', () => {
      expect(authService.getAccessToken()).toBeNull();
      expect(authService.isLoggedIn()).toBe(false);
      expect(authService.getStoredUser()).toBeNull();
    });
  });

  describe('登录', () => {
    it('登录后保存 token 与用户信息并通知监听器', async () => {
      const listener = vi.fn();
      authService.subscribe(listener);

      const result = await authService.login({ email: 'test@example.com', password: '123456', rememberMe: true });

      expect(authService.isLoggedIn()).toBe(true);
      expect(authService.getAccessToken()).toBe('tok-123');

      const stored = JSON.parse(localStorage.getItem('auth_tokens')!);
      expect(stored.accessToken).toBe('tok-123');
      expect(stored.refreshToken).toBe('tok-123');
      // rememberMe -> ~30天有效期
      expect(stored.expiresAt).toBeGreaterThan(nowSec() + 3600 * 24);

      const storedUser = authService.getStoredUser();
      expect(storedUser?.email).toBe('test@example.com');
      expect(storedUser?.nickname).toBe('测试用户');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
      expect(result.token).toBe('tok-123');
    });

    it('不记住登录时使用短期 token（~1小时）', async () => {
      await authService.login({ email: 'test@example.com', password: '123456', rememberMe: false });
      const stored = JSON.parse(localStorage.getItem('auth_tokens')!);
      expect(stored.expiresAt - nowSec()).toBeGreaterThan(3600 - 5);
      expect(stored.expiresAt - nowSec()).toBeLessThanOrEqual(3600 + 5);
    });
  });

  describe('token 过期检测', () => {
    it('即将过期（5分钟内）时 isTokenExpiring 为 true', () => {
      (authService as unknown as { tokens: unknown }).tokens = {
        accessToken: 'a', refreshToken: 'r', expiresAt: nowSec() + 200,
      };
      expect(authService.isTokenExpiring()).toBe(true);
    });

    it('远期 token 不被视为即将过期', () => {
      (authService as unknown as { tokens: unknown }).tokens = {
        accessToken: 'a', refreshToken: 'r', expiresAt: nowSec() + 86400,
      };
      expect(authService.isTokenExpiring()).toBe(false);
    });
  });

  describe('登出', () => {
    it('登出清除 token 与用户信息并通知 null', async () => {
      await authService.login({ email: 'test@example.com', password: '123456' });
      const listener = vi.fn();
      authService.subscribe(listener);

      await authService.logout();

      expect(authService.isLoggedIn()).toBe(false);
      expect(localStorage.getItem('auth_tokens')).toBeNull();
      expect(localStorage.getItem('user_info')).toBeNull();
      expect(listener).toHaveBeenCalledWith(null);
    });
  });

  describe('注册', () => {
    it('注册后保存 token 与用户信息', async () => {
      await authService.register({ email: 'test@example.com', password: '123456', nickname: '新用户' });
      expect(authService.isLoggedIn()).toBe(true);
      expect(authService.getAccessToken()).toBe('tok-123');
      expect(authService.getStoredUser()?.email).toBe('test@example.com');
    });
  });

  describe('订阅管理', () => {
    it('subscribe 返回可取消订阅的函数', () => {
      const listener = vi.fn();
      const unsub = authService.subscribe(listener);
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('登出时通知所有监听器 null', async () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      authService.subscribe(l1);
      authService.subscribe(l2);
      await authService.logout();
      expect(l1).toHaveBeenCalledWith(null);
      expect(l2).toHaveBeenCalledWith(null);
    });
  });

  describe('更新设置', () => {
    it('调用 api put 更新设置', async () => {
      await authService.updateSettings({ theme: 'dark' });
      expect(mockedApi.put).toHaveBeenCalledWith('/user/settings', { theme: 'dark' });
    });
  });

  describe('authFetch', () => {
    it('为请求注入 Authorization 头', async () => {
      await authService.login({ email: 'test@example.com', password: '123456' });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      await authService.authFetch('/api/protected');

      expect(fetchMock).toHaveBeenCalled();
      const [, opts] = fetchMock.mock.calls[0];
      expect((opts.headers as Headers).get('Authorization')).toBe('Bearer tok-123');

      vi.unstubAllGlobals();
    });
  });
});
