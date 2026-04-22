// 临时类型定义
export interface AdjustedKLine {
  close: number;
  [key: string]: any;
}

export interface KLineData {
  [key: string]: any;
}

export interface DailyQuote {
  [key: string]: any;
}

export interface StockData {
  [key: string]: any;
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
  [key: string]: any;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl?: number;
}