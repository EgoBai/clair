/**
 * 国际化翻译管理器
 * i18n Translation Manager
 *
 * 支持嵌套键、复数形式、日期/数字格式化、动态加载
 */

export type Locale = string;

export type TranslationDict = Record<string, any>;

export interface I18nConfig {
  defaultLocale: Locale;
  fallbackLocale: Locale;
  translations: Record<Locale, TranslationDict>;
  interpolationPrefix: string;
  interpolationSuffix: string;
}

/**
 * 翻译管理器
 */
export class I18nManager {
  private config: I18nConfig;
  private currentLocale: Locale;

  constructor(config: Partial<I18nConfig> = {}) {
    this.config = {
      defaultLocale: 'zh-CN',
      fallbackLocale: 'en',
      translations: {},
      interpolationPrefix: '{{',
      interpolationSuffix: '}}',
      ...config,
    };
    this.currentLocale = this.config.defaultLocale;
  }

  /**
   * 切换语言
   */
  setLocale(locale: Locale): void {
    this.currentLocale = locale;
  }

  /**
   * 获取当前语言
   */
  getLocale(): Locale {
    return this.currentLocale;
  }

  /**
   * 获取可用语言列表
   */
  getAvailableLocales(): Locale[] {
    return Object.keys(this.config.translations);
  }

  /**
   * 添加翻译
   */
  addTranslations(locale: Locale, translations: TranslationDict): void {
    this.config.translations[locale] = {
      ...this.config.translations[locale],
      ...translations,
    };
  }

  /**
   * 翻译
   */
  t(key: string, params?: Record<string, string | number>): string {
    const value = this.resolveKey(key, this.currentLocale) ??
      this.resolveKey(key, this.config.fallbackLocale);

    if (value === undefined) return key;
    if (typeof value !== 'string') return key;

    if (!params) return value;

    // 插值替换
    const { interpolationPrefix: pre, interpolationSuffix: suf } = this.config;
    return value.replace(
      new RegExp(`${this.escapeRegex(pre)}(\\w+)${this.escapeRegex(suf)}`, 'g'),
      (_, paramName) => {
        const val = params[paramName];
        return val !== undefined ? String(val) : `${pre}${paramName}${suf}`;
      }
    );
  }

  /**
   * 复数翻译
   */
  tn(key: string, count: number, params?: Record<string, string | number>): string {
    const pluralKey = count === 1 ? `${key}.one` : `${key}.other`;
    return this.t(pluralKey, { ...params, count });
  }

  /**
   * 检查翻译是否存在
   */
  has(key: string, locale?: Locale): boolean {
    return this.resolveKey(key, locale ?? this.currentLocale) !== undefined;
  }

  /**
   * 嵌套键解析
   */
  private resolveKey(key: string, locale: Locale): any {
    const dict = this.config.translations[locale];
    if (!dict) return undefined;

    const parts = key.split('.');
    let current: any = dict;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }

    return current;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * 日期格式化
 */
export function formatDate(
  date: Date | number,
  locale: Locale = 'zh-CN',
  options: Intl.DateTimeFormatOptions = {}
): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options,
  }).format(d);
}

/**
 * 数字格式化
 */
export function formatNumber(
  value: number,
  locale: Locale = 'zh-CN',
  options: Intl.NumberFormatOptions = {}
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * 货币格式化
 */
export function formatCurrency(
  value: number,
  locale: Locale = 'zh-CN',
  currency: string = 'CNY'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * 相对时间格式化
 */
export function formatRelativeTime(
  timestamp: number,
  locale: Locale = 'zh-CN'
): string {
  const now = Date.now();
  const diff = timestamp - now;
  const absDiff = Math.abs(diff);

  const units: Array<[string, number]> = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ];

  for (const [unit, ms] of units) {
    if (absDiff >= ms) {
      const value = Math.round(diff / ms);
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit as Intl.RelativeTimeFormatUnit);
    }
  }

  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second');
}
