/**
 * 增强格式化器
 * 支持相对时间、交易时段、市场状态等金融场景格式化
 */

import { Locale } from '../i18n';

/** 相对时间格式化 */
export function formatRelativeTime(
  date: Date | string,
  locale: Locale,
  now: Date = new Date()
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const labels: Record<Locale, {
    justNow: string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    daysAgo: (n: number) => string;
    future: string;
  }> = {
    'zh-CN': {
      justNow: '刚刚',
      minutesAgo: (n) => `${n}分钟前`,
      hoursAgo: (n) => `${n}小时前`,
      daysAgo: (n) => `${n}天前`,
      future: '未来',
    },
    'en-US': {
      justNow: 'just now',
      minutesAgo: (n) => `${n} min ago`,
      hoursAgo: (n) => `${n}h ago`,
      daysAgo: (n) => `${n}d ago`,
      future: 'in the future',
    },
    'ja-JP': {
      justNow: 'たった今',
      minutesAgo: (n) => `${n}分前`,
      hoursAgo: (n) => `${n}時間前`,
      daysAgo: (n) => `${n}日前`,
      future: '未来',
    },
    'ko-KR': {
      justNow: '방금',
      minutesAgo: (n) => `${n}분 전`,
      hoursAgo: (n) => `${n}시간 전`,
      daysAgo: (n) => `${n}일 전`,
      future: '미래',
    },
  };

  const l = labels[locale];

  if (diffMs < 0) return l.future;
  if (diffSec < 60) return l.justNow;
  if (diffMin < 60) return l.minutesAgo(diffMin);
  if (diffHour < 24) return l.hoursAgo(diffHour);
  if (diffDay < 30) return l.daysAgo(diffDay);

  // 超过30天显示完整日期
  return formatDate(d, locale);
}

/** 完整日期格式化 */
export function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const opts: Record<Locale, Intl.DateTimeFormatOptions> = {
    'zh-CN': { year: 'numeric', month: 'long', day: 'numeric' },
    'en-US': { year: 'numeric', month: 'short', day: 'numeric' },
    'ja-JP': { year: 'numeric', month: 'long', day: 'numeric' },
    'ko-KR': { year: 'numeric', month: 'long', day: 'numeric' },
  };
  const localeMap: Record<Locale, string> = {
    'zh-CN': 'zh-CN',
    'en-US': 'en-US',
    'ja-JP': 'ja-JP',
    'ko-KR': 'ko-KR',
  };
  return d.toLocaleDateString(localeMap[locale], opts[locale]);
}

/** 日期+时间格式化 */
export function formatDateTime(date: Date | string, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const localeMap: Record<Locale, string> = {
    'zh-CN': 'zh-CN',
    'en-US': 'en-US',
    'ja-JP': 'ja-JP',
    'ko-KR': 'ko-KR',
  };
  return d.toLocaleString(localeMap[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 交易时段描述 */
export function formatTradingSession(isOpen: boolean, locale: Locale): string {
  const labels: Record<Locale, { open: string; closed: string }> = {
    'zh-CN': { open: '交易中', closed: '已休市' },
    'en-US': { open: 'Market Open', closed: 'Market Closed' },
    'ja-JP': { open: '取引中', closed: '取引終了' },
    'ko-KR': { open: '거래 중', closed: '거래 종료' },
  };
  return labels[locale][isOpen ? 'open' : 'closed'];
}

/** 涨跌幅颜色标识 */
export function getChangeColor(value: number, locale: Locale): string {
  // 中国/日本/韩国：红涨绿跌；西方：绿涨红跌
  const isCJK = ['zh-CN', 'ja-JP', 'ko-KR'].includes(locale);
  if (value > 0) return isCJK ? '#ef4444' : '#22c55e';
  if (value < 0) return isCJK ? '#22c55e' : '#ef4444';
  return '#6b7280';
}

/** 币种符号 */
export function getCurrencySymbol(locale: Locale): string {
  const symbols: Record<Locale, string> = {
    'zh-CN': '¥',
    'en-US': '$',
    'ja-JP': '¥',
    'ko-KR': '₩',
  };
  return symbols[locale];
}

/** 大数字格式化（增强版） */
export function formatLargeNumber(
  value: number,
  locale: Locale,
  options: { decimals?: number; compact?: boolean } = {}
): string {
  const { decimals = 2, compact = true } = options;

  if (compact) {
    if (locale === 'zh-CN') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(decimals)}万亿`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(decimals)}亿`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(decimals)}万`;
    } else if (locale === 'ja-JP') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(decimals)}兆`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(decimals)}億`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(decimals)}万`;
    } else if (locale === 'ko-KR') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(decimals)}조`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(decimals)}억`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(decimals)}만`;
    } else {
      if (value >= 1e12) return `${(value / 1e12).toFixed(decimals)}T`;
      if (value >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
      if (value >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
    }
  }

  const localeMap: Record<Locale, string> = {
    'zh-CN': 'zh-CN',
    'en-US': 'en-US',
    'ja-JP': 'ja-JP',
    'ko-KR': 'ko-KR',
  };
  return value.toLocaleString(localeMap[locale], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 市场涨跌文案 */
export function getMarketTrendLabel(trend: 'up' | 'down' | 'flat', locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    'zh-CN': { up: '上涨', down: '下跌', flat: '平盘' },
    'en-US': { up: 'Rising', down: 'Falling', flat: 'Unchanged' },
    'ja-JP': { up: '上昇', down: '下落', flat: '変動なし' },
    'ko-KR': { up: '상승', down: '하락', flat: '보합' },
  };
  return labels[locale][trend];
}

export default {
  formatRelativeTime,
  formatDate,
  formatDateTime,
  formatTradingSession,
  getChangeColor,
  getCurrencySymbol,
  formatLargeNumber,
  getMarketTrendLabel,
};
