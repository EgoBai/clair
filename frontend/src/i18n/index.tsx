/**
 * i18n 国际化框架
 * 支持中文/英文/日文/韩文切换
 * 数字、日期格式本地化
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

import zhCN from './locales/zh-CN';
import enUS from './locales/en-US';
import jaJP from './locales/ja-JP';
import koKR from './locales/ko-KR';

// ==================== 翻译资源 ====================

export type Locale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

export interface I18nMessages {
  [key: string]: string | I18nMessages;
}

const messages: Record<Locale, I18nMessages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR,
};

// ==================== 数字/日期格式化 ====================

export const formatters = {
  number: (value: number, locale: Locale): string => {
    const localeMap: Record<Locale, string> = {
      'zh-CN': 'zh-CN',
      'en-US': 'en-US',
      'ja-JP': 'ja-JP',
      'ko-KR': 'ko-KR',
    };
    return value.toLocaleString(localeMap[locale] || 'en-US');
  },

  currency: (value: number, locale: Locale): string => {
    if (locale === 'zh-CN') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
      return value.toFixed(2);
    }
    if (locale === 'ja-JP') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}兆`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}億`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
      return `¥${value.toLocaleString('ja-JP', { minimumFractionDigits: 2 })}`;
    }
    if (locale === 'ko-KR') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}조`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}억`;
      return `₩${value.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}`;
    }
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  },

  percent: (value: number, _locale: Locale): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  },

  date: (value: string | Date, locale: Locale): string => {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (locale === 'zh-CN') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    if (locale === 'ja-JP') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    if (locale === 'ko-KR') {
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  time: (value: string | Date, locale: Locale): string => {
    const d = typeof value === 'string' ? new Date(value) : value;
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (locale === 'zh-CN' || locale === 'ja-JP' || locale === 'ko-KR') {
      return `${hh}:${mm}`;
    }
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  },

  volume: (value: number, locale: Locale): string => {
    if (locale === 'zh-CN') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿手`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万手`;
      return `${value}手`;
    }
    if (locale === 'ja-JP') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}億株`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万株`;
      return `${value}株`;
    }
    if (locale === 'ko-KR') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}억주`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}만주`;
      return `${value}주`;
    }
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toLocaleString('en-US');
  },
};

// ==================== Context ====================

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
  format: typeof formatters;
  locales: Locale[];
}

const I18nContext = createContext<I18nContextType | null>(null);

/**
 * 从嵌套对象中获取翻译
 */
function getNestedValue(obj: I18nMessages, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path; // 返回原始 key 作为 fallback
    }
  }
  return typeof current === 'string' ? current : path;
}

/** 支持的所有语言 */
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];

/** 语言显示名称 */
export const LOCALE_NAMES: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
};

interface I18nProviderProps {
  children: ReactNode;
  defaultLocale?: Locale;
}

export function I18nProvider({ children, defaultLocale = 'zh-CN' }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('locale') as Locale;
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
    // 自动检测浏览器语言
    const browserLang = navigator.language;
    if (browserLang.startsWith('zh')) return 'zh-CN';
    if (browserLang.startsWith('ja')) return 'ja-JP';
    if (browserLang.startsWith('ko')) return 'ko-KR';
    return defaultLocale;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    let result = getNestedValue(messages[locale], key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{{${k}}}`, 'g'), v);
      });
    }
    return result;
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, format: formatters, locales: SUPPORTED_LOCALES }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * 使用国际化
 */
export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

/**
 * 快捷翻译函数 (无 Context 版本)
 */
export function createTranslator(locale: Locale) {
  return (key: string, params?: Record<string, string>): string => {
    let result = getNestedValue(messages[locale], key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{{${k}}}`, 'g'), v);
      });
    }
    return result;
  };
}

export { messages };
export default I18nProvider;
