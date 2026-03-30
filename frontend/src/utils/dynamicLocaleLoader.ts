/**
 * 动态语言包加载器
 * 支持按需加载翻译资源，减少初始包体积
 */

import { Locale } from '../i18n';

/** 语言包加载状态 */
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface LoadedLocale {
  status: LoadStatus;
  messages: Record<string, any>;
  error?: Error;
}

/** 缓存已加载的语言包 */
const localeCache = new Map<Locale, LoadedLocale>();

/** 语言包动态导入映射 */
const LOCALE_IMPORTERS: Record<Locale, () => Promise<{ default: Record<string, any> }>> = {
  'zh-CN': () => import('../i18n/locales/zh-CN').catch(() => ({ default: {} })),
  'en-US': () => import('../i18n/locales/en-US').catch(() => ({ default: {} })),
  'ja-JP': () => import('../i18n/locales/ja-JP').catch(() => ({ default: {} })),
  'ko-KR': () => import('../i18n/locales/ko-KR').catch(() => ({ default: {} })),
};

/** 预加载语言包 */
export async function preloadLocale(locale: Locale): Promise<LoadedLocale> {
  if (localeCache.has(locale)) {
    return localeCache.get(locale)!;
  }

  const entry: LoadedLocale = { status: 'loading', messages: {} };
  localeCache.set(locale, entry);

  try {
    const importer = LOCALE_IMPORTERS[locale];
    if (!importer) {
      throw new Error(`Unknown locale: ${locale}`);
    }
    const module = await importer();
    entry.status = 'loaded';
    entry.messages = module.default || {};
  } catch (error) {
    entry.status = 'error';
    entry.error = error as Error;
  }

  return entry;
}

/** 获取已加载的语言包 */
export function getLoadedLocale(locale: Locale): LoadedLocale | undefined {
  return localeCache.get(locale);
}

/** 批量预加载 */
export async function preloadLocales(locales: Locale[]): Promise<void> {
  await Promise.allSettled(locales.map(l => preloadLocale(l)));
}

/** 清除缓存 */
export function clearLocaleCache(locale?: Locale): void {
  if (locale) {
    localeCache.delete(locale);
  } else {
    localeCache.clear();
  }
}

/** 获取缓存统计 */
export function getCacheStats(): { total: number; loaded: number; loading: number; error: number } {
  let loaded = 0, loading = 0, error = 0;
  localeCache.forEach(entry => {
    if (entry.status === 'loaded') loaded++;
    else if (entry.status === 'loading') loading++;
    else if (entry.status === 'error') error++;
  });
  return { total: localeCache.size, loaded, loading, error };
}

export default {
  preloadLocale,
  preloadLocales,
  getLoadedLocale,
  clearLocaleCache,
  getCacheStats,
};
