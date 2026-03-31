/**
 * 用户模型
 * 定义用户账户和偏好的数据结构
 */

export interface User {
  id: number;
  username: string;
  email?: string;
  phone?: string;
  avatar?: string;
  nickname?: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: Date;
  loginCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'guest' | 'user' | 'vip' | 'admin';
export type UserStatus = 'active' | 'inactive' | 'banned' | 'pending';

export interface UserPreferences {
  id: number;
  userId: number;
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-CN' | 'en-US';
  timezone: string;
  defaultPage: string;
  refreshInterval: number;      // 刷新间隔(秒)
  showMarketSummary: boolean;
  showNotifications: boolean;
  enableSoundAlert: boolean;
  chartType: 'candlestick' | 'line' | 'bar';
  chartPeriod: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';
  favoriteIndices: string[];     // 关注的指数
  favoriteSectors: string[];     // 关注的板块
  hiddenFields: string[];        // 隐藏的字段
  createdAt: Date;
  updatedAt: Date;
}

export interface Watchlist {
  id: number;
  userId: number;
  name: string;
  description?: string;
  isDefault: boolean;
  sortOrder: number;
  stockCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistItem {
  id: number;
  watchlistId: number;
  stockId: number;
  stockSymbol: string;
  stockName: string;
  addedAt: Date;
  sortOrder: number;
  notes?: string;
  alertPrice?: number;
  alertEnabled: boolean;
}

export interface UserAlert {
  id: number;
  userId: number;
  stockId: number;
  stockSymbol: string;
  alertType: AlertType;
  condition: AlertCondition;
  value: number;
  isActive: boolean;
  triggeredAt?: Date;
  message?: string;
  createdAt: Date;
}

export type AlertType = 
  | 'price_above'      // 价格突破
  | 'price_below'      // 价格跌破
  | 'change_percent'   // 涨跌幅
  | 'volume_surge'     // 放量
  | 'turnover_surge'   // 换手率
  | 'macd_golden_cross' // MACD金叉
  | 'macd_death_cross' // MACD死叉
  | 'rsi_overbought'   // RSI超买
  | 'rsi_oversold'     // RSI超卖
  | 'limit_up'         // 涨停
  | 'limit_down';      // 跌停

export interface AlertCondition {
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
  duration?: number;  // 持续时间(分钟)
}

export interface UserSession {
  id: number;
  userId: number;
  token: string;
  device: string;
  ip: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
}

// 验证函数
export function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

export function getDefaultPreferences(userId: number): Omit<UserPreferences, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    userId,
    theme: 'auto',
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
    defaultPage: '/dashboard',
    refreshInterval: 5,
    showMarketSummary: true,
    showNotifications: true,
    enableSoundAlert: false,
    chartType: 'candlestick',
    chartPeriod: '1d',
    favoriteIndices: ['000001.SH', '399001.SZ', '399006.SZ'],
    favoriteSectors: [],
    hiddenFields: [],
  };
}
