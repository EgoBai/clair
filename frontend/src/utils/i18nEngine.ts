/**
 * 国际化数据本地化引擎
 * 支持多语言翻译、数字/日期/货币格式化、时区处理、A股专用术语
 */

// ==================== 类型定义 ====================

export type Locale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR';

export interface TranslationMessages {
  [key: string]: string | TranslationMessages;
}

export interface LocaleConfig {
  locale: Locale;
  numberFormat: {
    decimal: string;
    thousand: string;
    precision: number;
  };
  dateFormat: {
    date: string;
    time: string;
    datetime: string;
    weekday: string[];
    month: string[];
  };
  currency: {
    code: string;
    symbol: string;
    position: 'before' | 'after';
  };
}

export interface PluralRule {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

// ==================== 本地化配置 ====================

const LOCALE_CONFIGS: Record<Locale, LocaleConfig> = {
  'zh-CN': {
    locale: 'zh-CN',
    numberFormat: { decimal: '.', thousand: ',', precision: 2 },
    dateFormat: {
      date: 'YYYY年MM月DD日',
      time: 'HH:mm:ss',
      datetime: 'YYYY年MM月DD日 HH:mm:ss',
      weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
      month: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    },
    currency: { code: 'CNY', symbol: '¥', position: 'before' },
  },
  'zh-TW': {
    locale: 'zh-TW',
    numberFormat: { decimal: '.', thousand: ',', precision: 2 },
    dateFormat: {
      date: 'YYYY年MM月DD日',
      time: 'HH:mm:ss',
      datetime: 'YYYY年MM月DD日 HH:mm:ss',
      weekday: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
      month: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    },
    currency: { code: 'TWD', symbol: 'NT$', position: 'before' },
  },
  'en-US': {
    locale: 'en-US',
    numberFormat: { decimal: '.', thousand: ',', precision: 2 },
    dateFormat: {
      date: 'MM/DD/YYYY',
      time: 'HH:mm:ss',
      datetime: 'MM/DD/YYYY HH:mm:ss',
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    },
    currency: { code: 'USD', symbol: '$', position: 'before' },
  },
  'ja-JP': {
    locale: 'ja-JP',
    numberFormat: { decimal: '.', thousand: ',', precision: 2 },
    dateFormat: {
      date: 'YYYY年MM月DD日',
      time: 'HH:mm:ss',
      datetime: 'YYYY年MM月DD日 HH:mm:ss',
      weekday: ['日', '月', '火', '水', '木', '金', '土'],
      month: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    },
    currency: { code: 'JPY', symbol: '¥', position: 'before' },
  },
  'ko-KR': {
    locale: 'ko-KR',
    numberFormat: { decimal: '.', thousand: ',', precision: 2 },
    dateFormat: {
      date: 'YYYY년 MM월 DD일',
      time: 'HH:mm:ss',
      datetime: 'YYYY년 MM월 DD일 HH:mm:ss',
      weekday: ['일', '월', '화', '수', '목', '금', '토'],
      month: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
    },
    currency: { code: 'KRW', symbol: '₩', position: 'before' },
  },
};

// ==================== A股专用翻译 ====================

const STOCK_TRANSLATIONS: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    'stock.price': '最新价',
    'stock.change': '涨跌幅',
    'stock.volume': '成交量',
    'stock.turnover': '成交额',
    'stock.marketCap': '市值',
    'stock.pe': '市盈率',
    'stock.pb': '市净率',
    'stock.dividend': '股息率',
    'stock.rising': '上涨',
    'stock.falling': '下跌',
    'stock.flat': '平盘',
    'stock.limitUp': '涨停',
    'stock.limitDown': '跌停',
    'stock.northbound': '北向资金',
    'stock.southbound': '南向资金',
    'stock.mainForce': '主力资金',
    'stock.retail': '散户资金',
    'stock.sector': '板块',
    'stock.industry': '行业',
    'market.open': '开盘',
    'market.close': '收盘',
    'market.high': '最高',
    'market.low': '最低',
    'market.preClose': '昨收',
    'market.suspended': '停牌',
    'market.delisted': '退市',
  },
  'zh-TW': {
    'stock.price': '最新價',
    'stock.change': '漲跌幅',
    'stock.volume': '成交量',
    'stock.turnover': '成交額',
    'stock.marketCap': '市值',
    'stock.rising': '上漲',
    'stock.falling': '下跌',
    'stock.limitUp': '漲停',
    'stock.limitDown': '跌停',
    'stock.northbound': '北向資金',
    'market.open': '開盤',
    'market.close': '收盤',
  },
  'en-US': {
    'stock.price': 'Price',
    'stock.change': 'Change',
    'stock.volume': 'Volume',
    'stock.turnover': 'Turnover',
    'stock.marketCap': 'Market Cap',
    'stock.pe': 'P/E Ratio',
    'stock.pb': 'P/B Ratio',
    'stock.dividend': 'Dividend Yield',
    'stock.rising': 'Rising',
    'stock.falling': 'Falling',
    'stock.flat': 'Flat',
    'stock.limitUp': 'Limit Up',
    'stock.limitDown': 'Limit Down',
    'stock.northbound': 'Northbound',
    'stock.southbound': 'Southbound',
    'stock.mainForce': 'Main Force',
    'stock.retail': 'Retail',
    'stock.sector': 'Sector',
    'stock.industry': 'Industry',
    'market.open': 'Open',
    'market.close': 'Close',
    'market.high': 'High',
    'market.low': 'Low',
    'market.preClose': 'Prev Close',
    'market.suspended': 'Suspended',
    'market.delisted': 'Delisted',
  },
  'ja-JP': {
    'stock.price': '現在値',
    'stock.change': '変動率',
    'stock.volume': '出来高',
    'stock.marketCap': '時価総額',
    'stock.rising': '上昇',
    'stock.falling': '下落',
    'stock.limitUp': 'ストップ高',
    'stock.limitDown': 'ストップ安',
    'market.open': '寄り付き',
    'market.close': '引け',
  },
  'ko-KR': {
    'stock.price': '현재가',
    'stock.change': '등락률',
    'stock.volume': '거래량',
    'stock.marketCap': '시가총액',
    'stock.rising': '상승',
    'stock.falling': '하락',
    'stock.limitUp': '상한가',
    'stock.limitDown': '하한가',
    'market.open': '시가',
    'market.close': '종가',
  },
};

// ==================== 翻译引擎 ====================

/**
 * 创建翻译器
 */
export function createTranslator(
  locale: Locale,
  customMessages: TranslationMessages = {},
): {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
  setLocale: (l: Locale) => void;
} {
  let currentLocale = locale;

  const messages: TranslationMessages = {
    ...STOCK_TRANSLATIONS[locale],
    ...flattenMessages(customMessages),
  };

  function t(key: string, params?: Record<string, string | number>): string {
    let message = messages[key] || key;

    if (typeof message === 'string' && params) {
      Object.entries(params).forEach(([k, v]) => {
        message = (message as string).replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }

    return typeof message === 'string' ? message : key;
  }

  function setLocale(l: Locale) {
    currentLocale = l;
  }

  return { t, locale: currentLocale, setLocale };
}

function flattenMessages(obj: TranslationMessages, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else {
      Object.assign(result, flattenMessages(value, fullKey));
    }
  }
  return result;
}

// ==================== 数字格式化 ====================

/**
 * 格式化数字（本地化）
 */
export function formatNumberLocalized(
  value: number,
  locale: Locale = 'zh-CN',
  options?: { decimals?: number; useGrouping?: boolean },
): string {
  const config = LOCALE_CONFIGS[locale];
  const decimals = options?.decimals ?? config.numberFormat.precision;
  const useGrouping = options?.useGrouping ?? true;

  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  let formatted = intPart;
  if (useGrouping) {
    formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.numberFormat.thousand);
  }

  if (decimals > 0 && decPart) {
    formatted += config.numberFormat.decimal + decPart;
  }

  return (value < 0 ? '-' : '') + formatted;
}

/**
 * 格式化百分比（本地化）
 */
export function formatPercentLocalized(
  value: number,
  locale: Locale = 'zh-CN',
  decimals: number = 2,
): string {
  const formatted = formatNumberLocalized(value * 100, locale, { decimals });
  return `${formatted}%`;
}

/**
 * 格式化货币（本地化）
 */
export function formatCurrencyLocalized(
  value: number,
  locale: Locale = 'zh-CN',
): string {
  const config = LOCALE_CONFIGS[locale];
  const formatted = formatNumberLocalized(value, locale);

  if (config.currency.position === 'before') {
    return `${config.currency.symbol}${formatted}`;
  }
  return `${formatted}${config.currency.symbol}`;
}

// ==================== 日期格式化 ====================

/**
 * 格式化日期（本地化）
 */
export function formatDateLocalized(
  date: Date | string | number,
  locale: Locale = 'zh-CN',
  format?: string,
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);

  const config = LOCALE_CONFIGS[locale];
  const fmt = format || config.dateFormat.date;

  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return fmt
    .replace('YYYY', String(yyyy))
    .replace('MM', MM)
    .replace('DD', DD)
    .replace('HH', HH)
    .replace('mm', mm)
    .replace('ss', ss);
}

/**
 * 获取星期几（本地化）
 */
export function getWeekdayLocalized(
  date: Date | string | number,
  locale: Locale = 'zh-CN',
): string {
  const d = date instanceof Date ? date : new Date(date);
  return LOCALE_CONFIGS[locale].dateFormat.weekday[d.getDay()];
}

/**
 * 获取月份名（本地化）
 */
export function getMonthLocalized(
  date: Date | string | number,
  locale: Locale = 'zh-CN',
): string {
  const d = date instanceof Date ? date : new Date(date);
  return LOCALE_CONFIGS[locale].dateFormat.month[d.getMonth()];
}

// ==================== 相对时间 ====================

/**
 * 格式化相对时间
 */
export function formatRelativeTime(
  date: Date | string | number,
  locale: Locale = 'zh-CN',
): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const labels: Record<Locale, Record<string, string>> = {
    'zh-CN': { justNow: '刚刚', minutesAgo: '{n}分钟前', hoursAgo: '{n}小时前', daysAgo: '{n}天前', longAgo: '很久以前' },
    'zh-TW': { justNow: '剛剛', minutesAgo: '{n}分鐘前', hoursAgo: '{n}小時前', daysAgo: '{n}天前', longAgo: '很久以前' },
    'en-US': { justNow: 'just now', minutesAgo: '{n}m ago', hoursAgo: '{n}h ago', daysAgo: '{n}d ago', longAgo: 'long ago' },
    'ja-JP': { justNow: 'たった今', minutesAgo: '{n}分前', hoursAgo: '{n}時間前', daysAgo: '{n}日前', longAgo: 'ずっと前' },
    'ko-KR': { justNow: '방금', minutesAgo: '{n}분 전', hoursAgo: '{n}시간 전', daysAgo: '{n}일 전', longAgo: '오래 전' },
  };

  const l = labels[locale];

  if (seconds < 60) return l.justNow;
  if (minutes < 60) return l.minutesAgo.replace('{n}', String(minutes));
  if (hours < 24) return l.hoursAgo.replace('{n}', String(hours));
  if (days < 30) return l.daysAgo.replace('{n}', String(days));
  return l.longAgo;
}

// ==================== 复数规则 ====================

/**
 * 处理复数（中文不区分单复数，英文区分）
 */
export function pluralize(
  count: number,
  rule: PluralRule,
  locale: Locale = 'zh-CN',
): string {
  let selected: string;

  if (locale === 'zh-CN' || locale === 'zh-TW' || locale === 'ja-JP' || locale === 'ko-KR') {
    if (count === 0 && rule.zero) selected = rule.zero;
    else if (count === 1 && rule.one) selected = rule.one;
    else selected = rule.other;
  } else {
    if (count === 0 && rule.zero) selected = rule.zero;
    else if (count === 1 && rule.one) selected = rule.one;
    else selected = rule.other;
  }

  return selected.replace('{n}', String(count));
}

// ==================== A股专用格式化 ====================

/**
 * 格式化涨跌幅（带颜色语义）
 */
export function formatChangePercentLocalized(
  value: number,
  locale: Locale = 'zh-CN',
): { text: string; color: 'red' | 'green' | 'gray' } {
  const prefix = value > 0 ? '+' : '';
  const text = `${prefix}${formatNumberLocalized(value, locale, { decimals: 2 })}%`;

  return {
    text,
    color: value > 0 ? 'red' : value < 0 ? 'green' : 'gray',
  };
}

/**
 * 格式化市值（大单位）
 */
export function formatMarketCapLocalized(
  value: number,
  locale: Locale = 'zh-CN',
): string {
  const labels: Record<Locale, { trillion: string; billion: string; million: string }> = {
    'zh-CN': { trillion: '万亿', billion: '亿', million: '万' },
    'zh-TW': { trillion: '兆', billion: '億', million: '萬' },
    'en-US': { trillion: 'T', billion: 'B', million: 'M' },
    'ja-JP': { trillion: '兆', billion: '億', million: '万' },
    'ko-KR': { trillion: '조', billion: '억', million: '만' },
  };

  const l = labels[locale];

  if (Math.abs(value) >= 1e12) return `${formatNumberLocalized(value / 1e12, locale, { decimals: 2 })}${l.trillion}`;
  if (Math.abs(value) >= 1e8) return `${formatNumberLocalized(value / 1e8, locale, { decimals: 2 })}${l.billion}`;
  if (Math.abs(value) >= 1e4) return `${formatNumberLocalized(value / 1e4, locale, { decimals: 2 })}${l.million}`;
  return formatNumberLocalized(value, locale);
}

// ==================== 工具函数 ====================

/**
 * 获取支持的区域列表
 */
export function getSupportedLocales(): Array<{ code: Locale; name: string; nativeName: string }> {
  return [
    { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
    { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
    { code: 'en-US', name: 'English (US)', nativeName: 'English' },
    { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
    { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
  ];
}

/**
 * 检测浏览器语言
 */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';

  const lang = navigator.language || (navigator as any).userLanguage || 'zh-CN';
  if (lang.startsWith('zh-TW') || lang.startsWith('zh-Hant')) return 'zh-TW';
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('ja')) return 'ja-JP';
  if (lang.startsWith('ko')) return 'ko-KR';
  if (lang.startsWith('en')) return 'en-US';

  return 'zh-CN';
}

/**
 * 获取本地化配置
 */
export function getLocaleConfig(locale: Locale): LocaleConfig {
  return LOCALE_CONFIGS[locale];
}
