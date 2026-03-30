/**
 * 用户认证服务
 * Token管理、自动刷新、请求拦截
 */

const API_BASE = '/api';

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
        if (this.tokens && Date.now() / 1000 > this.tokens.expiresAt - 60) {
          this.refreshTokens();
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
    localStorage.setItem('auth_tokens', JSON.stringify(tokens));
  }

  /**
   * 清除 token
   */
  private clearTokens(): void {
    this.tokens = null;
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
    const res = await fetch(`${API_BASE}/user/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    this.saveTokens({
      accessToken: json.data.token,
      refreshToken: json.data.token,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    localStorage.setItem('user_info', JSON.stringify(json.data.user));
    return json.data;
  }

  /**
   * 登录
   */
  async login(data: { email: string; password: string; rememberMe?: boolean }): Promise<{ user: User; token: string }> {
    const res = await fetch(`${API_BASE}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    const expiry = data.rememberMe ? 30 * 24 * 3600 : 3600;
    this.saveTokens({
      accessToken: json.data.token,
      refreshToken: json.data.token,
      expiresAt: Math.floor(Date.now() / 1000) + expiry,
    });
    localStorage.setItem('user_info', JSON.stringify(json.data.user));
    this.notifyListeners(json.data.user);
    return json.data;
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/user/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.tokens?.accessToken}` },
      });
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
    const res = await fetch(`${API_BASE}/user/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
  }

  /**
   * 重置密码
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const res = await fetch(`${API_BASE}/user/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
  }

  /**
   * 发送邮箱验证
   */
  async sendVerificationEmail(): Promise<void> {
    const res = await fetch(`${API_BASE}/user/verify-email/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.tokens?.accessToken}` },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
  }

  /**
   * 验证邮箱
   */
  async verifyEmail(token: string): Promise<void> {
    const res = await fetch(`${API_BASE}/user/verify-email/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
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
    const res = await fetch(`${API_BASE}/user/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.tokens?.accessToken}`,
      },
      body: JSON.stringify(settings),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    return json.data;
  }

  /**
   * 带 token 的 fetch
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
