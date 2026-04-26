// 共享类型定义 — 从 shared/types 导入
// NOTE: KLineData requires: tradeDate, open, close, high, low, volume, turnover
export type { KLineData, DailyQuote } from '../../../shared/types';

// 本地后端特有类型
export interface StockData {
  [key: string]: unknown;
}

export interface User {
  id: string | number;
  userId?: string | number;
  email?: string;
  phone?: string;
  displayName?: string;
  avatarUrl?: string;
  role?: string;
  roles?: string[];
  attributes?: Record<string, unknown>;
  settings?: {
    theme?: string;
    language?: string;
    notifications?: Record<string, boolean>;
    display?: Record<string, unknown>;
  };
  [key: string]: unknown; // Allow additional properties
}

export interface Permission {
  [key: string]: unknown;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl?: number;
}
