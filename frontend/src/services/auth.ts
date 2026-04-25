/**
 * 用户认证服务
 * Token管理、自动刷新、请求拦截
 */

import { apiService } from './api';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface User {
  id: string;
  email: string;
  phone?: string;
  nickname: string;
  avatar?: string;
  emailVerified: boolean;
  settings: UserSettings;
  createdAt: string;
}

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'zh-CN' | 'en-US';
  notifications: {
    email: boolean;
    push: boolean;
    priceAlert: boolean;
    newsAlert: boolean;
    weeklyReport: boolean;
  };
  display: {
    defaultPageSize: number;
    chartType: 'candlestick' | 'line';
    showVolume: boolean;
    klineDefaultPeriod: string;
  };
}

class AuthService {
  private tokens: AuthTokens | null = null;
  private refreshPromise: Promise<void> | null = null;
  private listeners: Set<(user: User | null) => void> = new Set();

  constructor() {
    this.loadTokens();
  }

  /**
   * 从 localStorage 加载 token
   */
  private loadTokens(): void {
    try {
      const stored = localStorage.getItem('auth_tokens');
      if (stored) {
        this.tokens = JSON.parse(stored);
        if (this.tokens) {
          apiService.setAuthToken(this.tokens.accessToken);
          if (Date.now() / 1000 > this.tokens.expiresAt - 60) {
            this.refreshTokens();
          }
        }
      }
    } catch {
      this.tokens = null;
    }
  }

  /**
   * 保存 token
   */
  private saveTokens(tokens: AuthTokens): void {
    this.tokens = tokens;
    apiService.setAuthToken(tokens.accessToken);
    localStorage.setItem('auth_tokens', JSON.stringify(tokens));
  }

  /**
   * 清除 token
   */
  private clearTokens(): void {
    this.tokens = null;
    apiService.setAuthToken(null);
    localStorage.removeItem('auth_tokens');
    localStorage.removeItem('user_info');
  }

  /**
   * 获取当前 access token
   */
  getAccessToken(): string | null {
    return this.tokens?.accessToken || null;
  }

  /**
   * 是否已登录
   */
  isLoggedIn(): boolean {
    return !!this.tokens?.accessToken;
  }

  /**
   * token 是否即将过期
   */
  isTokenExpiring(): boolean {
    if (!this.tokens) return false;
    return Date.now() / 1000 > this.tokens.expiresAt - 300; // 5分钟内过期
  }

  /**
   * 注册
   */
  async register(data: { email: string; password: string; nickname: string }): Promise<{ user: User; token: string }> {
    const res = await apiService.post<{ user: User; token: string }>('/user/register', data as Record<string, unknown>);
    this.saveTokens({
      accessToken: res.data.token,
      refreshToken: res.data.token,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    localStorage.setItem('user_info', JSON.stringify(res.data.user));
    return res.data;
  }

  /**
   * 登录
   */
  async login(data: { email: string; password: string; rememberMe?: boolean }): Promise<{ user: User; token: string }> {
    const res = await apiService.post<{ user: User; token: string }>('/user/login', data as Record<string, unknown>);
    const expiry = data.rememberMe ? 30 * 24 * 3600 : 3600;
    this.saveTokens({
      accessToken: res.data.token,
      refreshToken: res.data.token,
      expiresAt: Math.floor(Date.now() / 1000) + expiry,
    });
    localStorage.setItem('user_info', JSON.stringify(res.data.user));
    this.notifyListeners(res.data.user);
    return res.data;
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    try {
      await apiService.post('/user/logout');
    } catch {
      // 忽略网络错误
    }
    this.clearTokens();
    this.notifyListeners(null);
  }

  /**
   * 请求密码重置
   */
  async requestPasswordReset(email: string): Promise<void> {
    await apiService.post('/user/password-reset/request', { email });
  }

  /**
   * 重置密码
   */
  async resetPassword(token: string, password: string): Promise<void> {
    await apiService.post('/user/password-reset/confirm', { token, password });
  }

  /**
   * 发送邮箱验证
   */
  async sendVerificationEmail(): Promise<void> {
    await apiService.post('/user/verify-email/send');
  }

  /**
   * 验证邮箱
   */
  async verifyEmail(token: string): Promise<void> {
    await apiService.post('/user/verify-email/confirm', { token });
  }

  /**
   * 刷新 token
   */
  private async refreshTokens(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    // 当前实现使用简单 token，生产环境应调用 refresh endpoint
    this.clearTokens();
    this.notifyListeners(null);
  }

  /**
   * 获取用户信息
   */
  getStoredUser(): User | null {
    try {
      const stored = localStorage.getItem('user_info');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * 更新用户设置
   */
  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const res = await apiService.put<UserSettings>('/user/settings', settings as Record<string, unknown>);
    return res.data;
  }

  /**
   * 带 token 的 fetch（保留向后兼容，所有新代码应直接使用 apiService）
   */
  async authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (this.isTokenExpiring()) {
      await this.refreshTokens();
    }
    const headers = new Headers(options.headers);
    if (this.tokens) {
      headers.set('Authorization', `Bearer ${this.tokens.accessToken}`);
    }
    return fetch(url, { ...options, headers });
  }

  /**
   * 监听登录状态变化
   */
  subscribe(listener: (user: User | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(user: User | null): void {
    this.listeners.forEach(l => l(user));
  }
}

export const authService = new AuthService();
export type { User, UserSettings, AuthTokens };
